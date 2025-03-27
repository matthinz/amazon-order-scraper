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
  warn: (...args: unknown[]) => void;

  onYearStarted: (year: number) => void;
  onYearComplete: (year: number, orders: Order[]) => void;
  onOrderScraped: (order: Order) => void;
};

type GetPageContentOptions = {
  url: URL;
  checkCache: (key: string) => Promise<string | undefined>;
  updateCache: (key: string, value: string) => Promise<void>;
  page?: Page;
};

const ORDERS_URL = "/your-orders/orders";
const ORDER_ID_REGEX = /(\d+-\d+-\d+)/;

const MIN_ORDER_AGE_TO_USE_CACHE_IN_MS = 30 * 24 * 60 * 60 * 1000;

const INVOICE_LINK_SELECTOR =
  '.order-header__header-link-list-item a[href*="print.html"]';

const DEFAULTS: Required<Omit<ScraperOptions, "dataDir" | "datastore">> = {
  root: "https://www.amazon.com",

  headless: true,
  minDelay: 500,
  maxDelay: 1500,
  user: "default",

  onCacheHit: () => {},
  onCacheMiss: () => {},

  onYearStarted: () => {},
  onYearComplete: () => {},
  onOrderScraped: () => {},

  debug: () => {},
  warn: () => {},
};

export class SignInRequiredError extends Error {
  constructor() {
    super("Sign in required.");
    this.name = this.constructor.name;
  }
}

export class InvoiceParsingFailedError extends Error {
  #reason: string;
  #invoiceHTML: string;
  constructor(reason: string, invoiceHTML: string) {
    super(`Failed to parse invoice: ${reason}`);
    this.#reason = reason;
    this.#invoiceHTML = invoiceHTML;
    this.name = this.constructor.name;
  }

  get invoiceHTML() {
    return this.#invoiceHTML;
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

  public async getYears(page?: Page): Promise<number[]> {
    const checkCache = async (key: string) => {
      const content = await this.datastore.checkCache(key);

      if (content == null) {
        this.onCacheMiss(key, "No value found in cache");
        return;
      }

      if (content != null) {
        const years = this.scrapeYears(content);
        if (years == null) {
          this.onCacheMiss(key, "Failed to scrape years from cached HTML");
          return;
        }

        const now = new Date();
        const expectedYears = [now.getFullYear()];

        if (now.getMonth() === 0) {
          expectedYears.push(now.getFullYear() - 1);
        }

        const allYearsPresent = expectedYears.every((year) =>
          years.includes(year),
        );

        if (!allYearsPresent) {
          this.onCacheMiss(
            key,
            `Years ${expectedYears.join(",")} not found in cache, not using`,
          );
          return;
        }
      }

      this.debug(`Using cache for key %s`, key);

      return content;
    };

    const content = await this.getPageContent({
      url: new URL(ORDERS_URL, this.#options.root),
      checkCache,
      updateCache: this.datastore.updateCache.bind(this.datastore),
      page,
    });

    const years = this.scrapeYears(content);

    if (years == null) {
      throw new SignInRequiredError();
    }

    return years;
  }

  async scrape(page?: Page): Promise<void> {
    const years = await this.getYears(page);
    this.debug(`Years to scrape: ${years.join(",")}`);

    return years.reduce<Promise<void>>(
      (promise, year) =>
        promise.then(async () => {
          await this.scrapeOrdersForYear(year, page);
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

    await page.goto(url.toString());
    this.#lastNavigationAt = new Date();
  }

  private cacheKey(url: URL): string {
    return ["v1", "user", this.#options.user, "url", url.toString()].join(":");
  }

  protected async getPageContent({
    url,
    checkCache,
    updateCache,
    page,
  }: GetPageContentOptions): Promise<string> {
    const cacheKey = this.cacheKey(url);
    const cachedContent = await checkCache(cacheKey);

    if (cachedContent) {
      return cachedContent;
    }

    return await this.withBrowser(
      url,
      async (page) => {
        const content = await page.content();
        await updateCache(cacheKey, content);
        return content;
      },
      page,
    );
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

      return value;
    };

    const updateCache = async (key: string, value: string) => {
      try {
        parseInvoice(value);
      } catch (err) {
        throw new InvoiceParsingFailedError(err.message, value);
      }
      await this.datastore.updateCache(key, value);
    };

    const html = await this.getPageContent({
      url: invoiceURL,
      checkCache,
      updateCache,
    });

    let order: Order;

    try {
      order = parseInvoice(html, this.debug);
    } catch (err) {
      throw new SignInRequiredError();
    }

    this.datastore.saveOrder(order, this.#options.user, invoiceURL, html);

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
    page?: Page,
  ): Promise<Order[]> {
    let url: URL | undefined = new URL(
      `/your-orders/orders?timeFilter=year-${year}`,
      this.#options.root,
    );
    let pageIndex = 0;

    const checkCache = async (key: string) => {
      const value = await this.datastore.checkCache(key);

      if (value == null) {
        this.onCacheMiss(key, "No value found in cache");
        return;
      }

      const now = new Date();

      if (year < now.getFullYear()) {
        // Prior years are fixed, we can just use the cache
        this.onCacheHit(key, value);
        return value;
      }

      // For the current year, we need to grab the first page.
      // If _all_ the order IDs that appear on that page have already
      // been scraped, we can proceed to use the cache. Otherwise, we
      // need to re-scrape the entire year

      const invoiceURLs = this.scrapeInvoiceURLsFromPage(value);
      if (await this.allInvoiceURLsCached(invoiceURLs)) {
        this.onCacheHit(key, "All invoices are cached, using cache");
        return value;
      }

      this.onCacheMiss(
        key,
        `${year} is the current year and has new order IDs, not using order cache`,
      );
    };

    const allOrders: Order[] = [];

    this.onYearStarted(year);

    while (url != null) {
      pageIndex++;
      this.debug(`Scraping page ${pageIndex} of orders for year ${year}`);

      const content = await this.getPageContent({
        url,
        checkCache,
        updateCache: this.datastore.updateCache.bind(this.datastore),
        page,
      });

      const { orders, nextPageURL } = await this.scrapeOrdersFromPage(content);

      allOrders.push(...orders);
      url = nextPageURL;
    }

    this.onYearComplete(year, allOrders);

    return allOrders;
  }

  private async scrapeOrdersFromPage(html: string): Promise<{
    orders: Order[];
    nextPageURL: URL | undefined;
    anyWereCached: boolean;
  }> {
    const NEXT_PAGE_LINK_SELECTOR = "li.a-last a";

    const { document } = new JSDOM(html).window;

    const invoiceURLs = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(INVOICE_LINK_SELECTOR),
    )
      .map((a) => a.href)
      .map((url) => {
        const parsedURL = new URL(url, this.#options.root);

        const m = ORDER_ID_REGEX.exec(
          parsedURL.searchParams.get("orderID") ?? "",
        );

        if (!m) {
          return;
        }

        return parsedURL;
      })
      .filter(Boolean) as URL[];

    let anyWereCached = false;

    const orders = await invoiceURLs.reduce<Promise<Order[]>>(
      async (promise, invoiceURL) =>
        promise.then(async (result) => {
          const { order, wasCached } = await this.scrapeOrder(invoiceURL);
          anyWereCached = anyWereCached || wasCached;
          result.push(order);
          return result;
        }),
      Promise.resolve([]),
    );

    const href = document.querySelector<HTMLAnchorElement>(
      NEXT_PAGE_LINK_SELECTOR,
    )?.href;

    const nextPageURL = href ? new URL(href, this.#options.root) : undefined;

    return { orders, nextPageURL, anyWereCached };
  }

  protected scrapeInvoiceURLsFromPage(html: string): URL[] {
    const { document } = new JSDOM(html).window;

    return Array.from(
      document.querySelectorAll<HTMLAnchorElement>(INVOICE_LINK_SELECTOR),
    )
      .map((a) => a.href)
      .map((url) => new URL(url, this.#options.root));
  }

  protected scrapeYears(html: string): number[] | undefined {
    const { document } = new JSDOM(html).window;

    const select = document.querySelector<HTMLSelectElement>(
      'select[name="timeFilter"]',
    );

    if (!select) {
      return;
    }

    const years = Array.from(select.options)
      .map((o) => o.value)
      .filter((v) => /^year-/.test(v))
      .map((v) => parseInt(v.replace(/^year-/, ""), 10));

    years.sort();

    return years;
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
      if (shouldCleanUpPage) {
        shouldCleanUpPage = !("page" in err) || err.page !== pageToUse;
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

  get onYearStarted() {
    return this.#options.onYearStarted;
  }

  get onYearComplete() {
    return this.#options.onYearComplete;
  }

  get warn() {
    return this.#options.warn;
  }

  get profileDir(): string {
    return path.join(this.#options.dataDir, "profiles", this.#options.user);
  }
}
