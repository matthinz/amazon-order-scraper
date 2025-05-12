import { JSDOM } from "jsdom";
import path from "node:path";
import type { Page } from "playwright";
import { chromium } from "playwright-extra";

import { DataStore } from "./datastore.ts";
import { parseInvoice } from "./invoice.ts";
import type { Order } from "./types.ts";

type BrowserContext = Awaited<
  ReturnType<typeof chromium.launchPersistentContext>
>;

export type OrderScrapeAction =
  | "SCRAPE_ORDER"
  | "SKIP_ORDER"
  | "SKIP_YEAR"
  | "STOP_SCRAPING";

export type YearScrapeAction =
  | Omit<OrderScrapeAction, "SKIP_ORDER" | "SCRAPE_ORDER">
  | "SCRAPE_YEAR"
  | "SCRAPE_YEAR_NO_CACHE";

export type ScraperOptions = {
  root: string;
  datastore: DataStore;
  dataDir: string;
  headless: boolean;
  minDelay: number;
  maxDelay: number;
  user?: string;

  onCacheHit: (key: string, value: string) => void;
  onCacheMiss: (key: string, description: string) => void;
  debug: (...args: unknown[]) => void;
  verbose: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;

  /**
   * Hook called before an order is scraped.
   * @param id
   * @param date
   * @returns
   */
  onBeforeOrderScrape: (id: string, date: Date) => OrderScrapeAction | void;

  /**
   * Hook called before scraping a year.
   * @returns
   */
  onBeforeYearScrape: (year: number) => YearScrapeAction | void;

  onOrderScraped: (order: Order) => void;
};

type ParsePageContentOptions = {
  url: URL;
  checkCache: (key: string) => Promise<string | undefined>;
  updateCache: (key: string, value: string) => Promise<void>;
  page?: Page;
};

const ORDERS_URL = "/your-orders/orders";

const MIN_ORDER_AGE_TO_USE_CACHE_IN_MS = 30 * 24 * 60 * 60 * 1000;

const INVOICE_LINK_SELECTOR = 'a[href*="print.html"]';

const DEFAULTS: Required<Omit<ScraperOptions, "dataDir" | "datastore">> = {
  root: "https://www.amazon.com",

  headless: true,
  minDelay: 500,
  maxDelay: 1500,
  user: "default",

  onCacheHit: () => {},
  onCacheMiss: () => {},

  onBeforeOrderScrape: () => {},
  onBeforeYearScrape: () => {},
  onOrderScraped: () => {},

  debug: () => {},
  verbose: () => {},
  warn: () => {},
};

export class ParsingError extends Error {
  #html: string;

  constructor(message: string, html: string) {
    super(message);
    this.#html = html;
    this.name = this.constructor.name;
  }

  get html() {
    return this.#html;
  }
}

export class SignInRequiredError extends ParsingError {
  #page: Page | undefined;
  constructor(message: string, html: string, page?: Page) {
    super(message, html);
    this.#page = page;
    this.name = this.constructor.name;
  }

  get page() {
    return this.#page;
  }
}

export class InvoiceParsingFailedError extends ParsingError {
  #reason: string;
  constructor(reason: string, invoiceHTML: string) {
    super(`Failed to parse invoice: ${reason}`, invoiceHTML);
    this.#reason = reason;
    this.name = this.constructor.name;
  }

  get reason() {
    return this.#reason;
  }
}

export class Scraper {
  #contextPromise: Promise<BrowserContext> | undefined;
  #lastNavigationAt = new Date(1970, 0, 1);
  #options: Required<ScraperOptions>;

  constructor(
    options: Partial<ScraperOptions> & {
      dataDir: string;
      datastore: DataStore;
    },
  ) {
    this.#options = {
      ...DEFAULTS,
      ...options,
    };
  }

  get datastore(): DataStore {
    return this.#options.datastore;
  }

  public async close() {
    const contextPromise = this.#contextPromise;
    this.#contextPromise = undefined;

    if (contextPromise) {
      const context = await contextPromise;
      await context.close();
      await context.browser()?.close();
    }
  }

  /**
   * @returns {Promise<number[]>} - The years available for scraping
   */
  public async getYearsAvailableToScrape(page?: Page): Promise<number[]> {
    return await this.parsePageContent(
      {
        url: new URL(ORDERS_URL, this.#options.root),
        checkCache: (key: string) => Promise.resolve(undefined),
        updateCache: (key: string, value: string) => Promise.resolve(),
        page,
      },
      async (url, document, rawContent, page) => {
        document =
          typeof document === "string"
            ? new JSDOM(document).window.document
            : document;

        const select = document.querySelector<HTMLSelectElement>(
          'select[name="timeFilter"]',
        );

        if (!select) {
          throw new SignInRequiredError(
            "Error parsing year page",
            document.documentElement.outerHTML,
            page,
          );
        }

        const years = Array.from(select.options)
          .map((o) => o.value)
          .filter((v) => /^year-/.test(v))
          .map((v) => parseInt(v.replace(/^year-/, ""), 10));

        years.sort((a, b) => b - a);

        return years;
      },
    );
  }

  async scrape(page?: Page): Promise<void> {
    const years = await this.getYearsAvailableToScrape(page);
    this.debug(`Years to scrape: ${years.join(",")}`);

    let continueScraping = true;

    return years.reduce<Promise<void>>(
      (promise, year) =>
        promise.then(async () => {
          if (!continueScraping) {
            return;
          }

          const action = this.#options.onBeforeYearScrape(year) ?? "SCRAPE";

          switch (action) {
            case "STOP_SCRAPING":
              this.verbose(`Stopping scraping before year ${year}`);
              continueScraping = false;
              return;

            case "SKIP_YEAR":
              this.verbose(`Skipping year ${year}`);
              return;

            case "SCRAPE_YEAR":
              this.verbose(`Scraping year ${year}`);
              await this.scrapeOrdersForYear(year, true, page);
              return;

            case "SCRAPE_YEAR_NO_CACHE":
              this.verbose(`Scraping year ${year} without cache`);
              await this.scrapeOrdersForYear(year, false, page);
              return;

            default:
              throw new Error(`Unknown action "${action}" for year ${year}`);
          }
        }),
      Promise.resolve(),
    );
  }

  async navigatePage(page: Page, url: URL | string): Promise<void> {
    const navRequired = page.url() !== url.toString();
    if (!navRequired) {
      return;
    }

    const msSinceLastNavigation = Date.now() - this.#lastNavigationAt.getTime();
    const minDelay = Math.ceil(
      Math.random() * (this.#options.maxDelay - this.#options.minDelay) +
        this.#options.minDelay,
    );

    const delay = Math.max(0, minDelay - msSinceLastNavigation);

    if (delay > 0) {
      this.debug(`Delay ${delay}dms before navigation to ${url.toString()}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    this.verbose(`Navigating to ${url.toString()}`);

    await page.goto(url.toString());
    this.#lastNavigationAt = new Date();
  }

  private cacheKey(url: URL): string {
    return ["v1", "user", this.#options.user, "url", url.toString()].join(":");
  }

  private async parsePageContent<T>(
    { url, checkCache, updateCache, page }: ParsePageContentOptions,
    handler: (
      url: URL,
      document: Document,
      rawContent: string,
      page?: Page,
    ) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    const cacheKey = this.cacheKey(url);
    let content: string | undefined = await checkCache(cacheKey);
    let actualURL: URL = url;

    const doParse = async (
      url: URL,
      rawContent: string,
      shouldUpdateCache: boolean,
      page?: Page,
    ): Promise<T | undefined> => {
      const { document } = new JSDOM(rawContent).window;

      let result: T | undefined;

      try {
        result = await handler(actualURL, document, rawContent, page);
      } catch (err) {
        if (shouldUpdateCache) {
          this.verbose(
            `Error parsing page content (not caching): ${err.message}`,
          );
        }
        throw err;
      }

      if (!shouldUpdateCache) {
        return result;
      }

      if (url.toString() === actualURL.toString()) {
        await updateCache(cacheKey, rawContent);
      } else {
        this.warn(
          `URL changed from ${url.toString()} to ${url.toString()}, not caching contents`,
        );
      }

      return result;
    };

    let cachedContent = content;
    let browserAttempts = 0;

    while (true) {
      if (cachedContent != null) {
        try {
          return await doParse(url, cachedContent, false);
        } catch (err) {
          this.warn(
            `Error parsing cached content (falling back to browser): ${err.message}`,
          );
          cachedContent = undefined;
        }
      } else {
        if (browserAttempts > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, browserAttempts * 300),
          );
        }

        browserAttempts++;

        try {
          return await this.withBrowser(
            url,
            async (page) => {
              return doParse(
                new URL(page.url()),
                await page.content(),
                true,
                page,
              );
            },
            page,
          );
        } catch (err) {
          this.verbose(
            `Error parsing page content (attempt ${browserAttempts}): ${err.message}`,
          );

          if (browserAttempts > 4) {
            throw err;
          }
        }
      }
    }
  }

  protected async scrapeOrder(
    invoiceURL: URL,
  ): Promise<{ order: Order; wasCached: boolean }> {
    let wasCached = true;

    const checkCache = async (key: string) => {
      const value = await this.datastore.checkCache(key);

      if (value == null) {
        wasCached = false;
        this.onCacheMiss(key, "No value found in cache");
        return;
      }

      const order = parseInvoice(value);

      const { date } = order;
      if (date == null) {
        wasCached = false;
        this.onCacheMiss(key, `No date found in cache for order ${order.id}`);
        return;
      }

      const ageInMS = Date.now() - new Date(date).getTime();
      if (ageInMS < MIN_ORDER_AGE_TO_USE_CACHE_IN_MS) {
        wasCached = false;
        this.onCacheMiss(key, `Order ${order.id} is too recent to use cache`);
        return;
      }

      this.onCacheHit(key, value);

      return value;
    };

    const updateCache = async (key: string, value: string) => {
      try {
        parseInvoice(value);
      } catch (err) {
        throw new InvoiceParsingFailedError(err.message, value);
      }
      this.verbose(`Updating cache for ${key}`);
      await this.datastore.updateCache(key, value);
    };

    const order = await this.parsePageContent(
      {
        url: invoiceURL,
        checkCache,
        updateCache,
      },
      async (url, _document, rawContent, page) => {
        try {
          const order = parseInvoice(rawContent, this.debug);
          await this.datastore.saveOrder(
            order,
            this.#options.user,
            url,
            rawContent,
          );
          return order;
        } catch (err) {
          throw new InvoiceParsingFailedError(err.message, rawContent);
        }
      },
    );

    this.onOrderScraped(order);

    return { wasCached, order };
  }

  private async allInvoiceURLsCached(invoiceURLs: URL[]): Promise<boolean> {
    return invoiceURLs.reduce<Promise<boolean>>(
      (promise, invoiceURL) =>
        promise.then(async (result) => {
          if (!result) {
            return false;
          }

          const cacheKey = this.cacheKey(invoiceURL);
          return !!(await this.datastore.checkCache(cacheKey));
        }),
      Promise.resolve(true),
    );
  }

  private async scrapeOrdersForYear(
    year: number,
    cacheAllowed = true,
    page?: Page,
  ): Promise<Order[]> {
    let url: URL | undefined = new URL(
      `/your-orders/orders?timeFilter=year-${year}`,
      this.#options.root,
    );
    let pageIndex = 0;

    const checkCache = async (key: string) => {
      if (!cacheAllowed) {
        this.onCacheMiss(key, `Cache not allowed`);
        return;
      }

      const value = await this.datastore.checkCache(key);

      if (value == null) {
        this.onCacheMiss(key, "No value found in cache");
        return;
      }

      this.onCacheHit(key, value);
      return value;
    };

    const updateCache = async (key, value) => {
      this.verbose(`Updating cache for ${key}`);
      await this.datastore.updateCache(key, value);
    };

    const findInvoiceURLs = (document: Document) => {
      return Array.from(
        document.querySelectorAll<HTMLAnchorElement>(INVOICE_LINK_SELECTOR),
      )
        .map((a) => a.href)
        .map((url) => new URL(url, this.#options.root));
    };

    const NEXT_PAGE_LINK_SELECTOR = "li.a-last a";

    const allOrders: Order[] = [];

    while (url != null) {
      pageIndex++;
      this.verbose(`Scraping page ${pageIndex} of orders for year ${year}`);

      const [invoiceURLs, nextPageURL] = await this.parsePageContent(
        {
          url,
          checkCache,
          updateCache,
          page,
        },
        async (url, document, _, page) => {
          const invoiceURLs = findInvoiceURLs(document);

          if (invoiceURLs.length === 0) {
            throw new SignInRequiredError(
              `No invoices found on ${url.toString()}`,
              document.documentElement.outerHTML,
              page,
            );
          }

          let nextPageURL = document.querySelector<HTMLAnchorElement>(
            NEXT_PAGE_LINK_SELECTOR,
          )?.href;

          return [
            invoiceURLs,
            nextPageURL == null ? undefined : new URL(nextPageURL, url),
          ];
        },
      );

      await invoiceURLs.reduce<Promise<void>>(
        (promise, invoiceURL) =>
          promise.then(async () => {
            const { order } = await this.scrapeOrder(invoiceURL);
            allOrders.push(order);
          }),
        Promise.resolve(),
      );

      url = nextPageURL;
    }

    return allOrders;
  }

  private async withBrowser<T>(
    url: URL | string,
    func: (page: Page) => Promise<T>,
    page?: Page,
  ): Promise<T> {
    const shouldCreatePage = page == null;
    let pageToUse: Page;
    let shouldCleanUpPage = shouldCreatePage;

    if (shouldCreatePage) {
      const context = await this.context;
      pageToUse = await context.newPage();
    } else {
      pageToUse = page;
    }

    try {
      if (url) {
        await this.navigatePage(pageToUse, url);
      }
      return await func(pageToUse);
    } catch (err) {
      // If the err is being used to return a reference to the page,
      // don't close it here
      if ("page" in err && err.page === pageToUse) {
        shouldCleanUpPage = false;
      }

      throw err;
    } finally {
      if (shouldCleanUpPage) {
        await pageToUse.close();
      }
    }
  }

  get context(): Promise<BrowserContext> {
    this.#contextPromise =
      this.#contextPromise ??
      chromium.launchPersistentContext(this.profileDir, {
        headless: this.#options.headless,
        executablePath:
          "/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome",
      });

    return this.#contextPromise;
  }

  get debug() {
    return this.#options.debug;
  }

  get onCacheHit() {
    return this.#options.onCacheHit;
  }

  get onCacheMiss() {
    return this.#options.onCacheMiss;
  }

  get onOrderScraped() {
    return this.#options.onOrderScraped;
  }

  get verbose() {
    return this.#options.verbose;
  }

  get warn() {
    return this.#options.warn;
  }

  get profileDir(): string {
    return path.join(this.#options.dataDir, "profiles", this.#options.user);
  }
}
