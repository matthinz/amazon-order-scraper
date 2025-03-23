import fs from "node:fs/promises";
import path, { resolve } from "node:path";
import type { Page } from "playwright";
import { chromium } from "playwright-extra";

import { Cache } from "./cache.ts";

type BrowserContext = Awaited<
  ReturnType<typeof chromium.launchPersistentContext>
>;

export type ScraperOptions = {
  cache: Cache;
  dataDir: string;
  minDelay: number;
  maxDelay: number;
  profile?: string;
  logger?: (...args: unknown[]) => void;
};

const ORDERS_URL = "https://www.amazon.com/your-orders/orders";
const ORDER_ID_REGEX = /(\d+-\d+-\d+)/;

const DEFAULTS: Required<Omit<ScraperOptions, "dataDir" | "cache">> = {
  minDelay: 2000,
  maxDelay: 5000,
  profile: "default",
  logger: console.error,
};

export class SignInRequiredError extends Error {
  #page: Page;

  constructor(page: Page) {
    super("Sign in required.");
    this.#page = page;
    this.name = this.constructor.name;
  }

  get page(): Page {
    return this.#page;
  }
}

export class Scraper {
  #contextPromise: Promise<BrowserContext> | undefined;
  #lastNavigationAt = new Date(1970, 0, 1);
  #options: Required<ScraperOptions>;

  constructor(
    options: Partial<ScraperOptions> & { dataDir: string; cache: Cache }
  ) {
    this.#options = {
      ...DEFAULTS,
      ...(options ?? {}),
    };
  }

  get cache(): Cache {
    return this.#options.cache;
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

  public async getYearsToScrape(page?: Page): Promise<number[]> {
    return this.withBrowser<number[]>(
      ORDERS_URL,
      async (page) => {
        const years = await this.scrapeYears(page);

        return await years.reduce<Promise<number[]>>(
          async (promise, year) =>
            promise.then(async (result) => {
              if (await this.cache.yearScraped(year)) {
                return result;
              }
              result.push(year);
              return result;
            }),
          Promise.resolve([])
        );
      },
      page
    );
  }

  async scrape(page?: Page): Promise<void> {
    const years = await this.getYearsToScrape(page);

    return years.reduce<Promise<void>>(
      (promise, year) =>
        promise.then(async () => {
          if (await this.cache.yearScraped(year)) {
            return;
          }

          await this.scrapeOrdersForYear(year, page);

          if (year !== new Date().getFullYear()) {
            this.#options.logger("Marking year %d complete", year);
            await this.cache.markYearComplete(year);
          }
        }),
      Promise.resolve()
    );
  }

  async scrapeOrdersForYear(year: number, page?: Page): Promise<string[]> {
    const yearURL = `https://www.amazon.com/your-orders/orders?timeFilter=year-${year}`;
    const NEXT_PAGE_LINK_SELECTOR = "li.a-last a";

    return this.withBrowser<string[]>(
      yearURL,
      async (page) => {
        const orderIDs: string[] = [];
        let pageIndex = 0;

        while (true) {
          pageIndex++;
          this.#options.logger(
            "Scraping page %d of orders for year %d",
            pageIndex,
            year
          );

          orderIDs.push(...(await this.scrapeOrdersFromPage(page)));

          const nextPageURL = await page.evaluate((selector) => {
            const a = document.querySelector<HTMLAnchorElement>(selector);
            return a?.href;
          }, NEXT_PAGE_LINK_SELECTOR);

          if (!nextPageURL) {
            this.#options.logger(
              "No next page link (%s) found on page, stopping.",
              NEXT_PAGE_LINK_SELECTOR
            );

            break;
          }

          this.#options.logger("Navigating to next page %s", nextPageURL);
          await this.navigatePage(page, nextPageURL);
        }

        await page.close();

        return orderIDs;
      },
      page
    );
  }

  async scrapeOrdersFromPage(page: Page): Promise<string[]> {
    this.#options.logger("Begin scraping orders from '%s'", page.url());

    const INVOICE_LINK_SELECTOR =
      '.order-header__header-link-list-item a[href*="print.html"]';

    type Order = { id: string; invoiceURL: URL };

    const orders: Order[] = (
      await page.evaluate((selector) => {
        return Array.from(
          document.querySelectorAll<HTMLAnchorElement>(selector)
        ).map((a) => a.href);
      }, INVOICE_LINK_SELECTOR)
    )
      .map((url) => {
        const parsedURL = new URL(url);

        const m = ORDER_ID_REGEX.exec(
          parsedURL.searchParams.get("orderID") ?? ""
        );

        if (!m) {
          return;
        }

        return {
          id: m[1],
          invoiceURL: parsedURL,
        };
      })
      .filter(Boolean) as Order[];

    return await orders.reduce<Promise<string[]>>(
      async (promise, order) =>
        promise.then(async (result) => {
          const alreadyScraped = await this.cache.orderScraped(order.id);

          if (alreadyScraped) {
            this.#options.logger("Already scraped %s", order.id);
            result.push(order.id);
            return result;
          }

          await this.scrapeOrder(order.id, order.invoiceURL);
          result.push(order.id);

          return result;
        }),
      Promise.resolve([])
    );
  }

  async scrapeOrder(orderID: string, invoiceURL: URL): Promise<void> {
    this.#options.logger(`Begin scraping order ${orderID}`);

    await this.withBrowser(invoiceURL, async (page) => {
      const html = await page.content();
      await this.cache.saveOrderInvoiceHTML(orderID, html);
    });
  }

  async scrapeYears(page: Page): Promise<number[]> {
    return await this.withBrowser(ORDERS_URL, async (page) => {
      const years = await page.evaluate(() => {
        const select = document.querySelector<HTMLSelectElement>(
          'select[name="timeFilter"]'
        );
        if (!select) {
          return;
        }
        return Array.from(select?.options)
          .map((o) => o.value)
          .filter((v) => /^year-/.test(v))
          .map((v) => parseInt(v.replace(/^year-/, ""), 10));
      });

      if (years == null) {
        throw new SignInRequiredError(page);
      }

      years.sort();

      return years;
    });
  }

  async navigatePage(page: Page, url: URL | string): Promise<void> {
    const navRequired = page.url() !== url.toString();
    if (!navRequired) {
      return;
    }

    const msSinceLastNavigation = Date.now() - this.#lastNavigationAt.getTime();
    const minDelay = Math.ceil(
      Math.random() * (this.#options.maxDelay - this.#options.minDelay) +
        this.#options.minDelay
    );

    const delay = Math.max(0, minDelay - msSinceLastNavigation);

    if (delay > 0) {
      this.#options.logger(
        "Delay %dms before navigation to %s",
        delay,
        url.toString()
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    await page.goto(url.toString());
    this.#lastNavigationAt = new Date();
  }

  private async withBrowser<T>(
    url: URL | string,
    func: (page: Page) => Promise<T>,
    page?: Page
  ): Promise<T> {
    this.#options.logger("Begin browser usage for %s", url);

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
      this.#options.logger("Calling function %s for %s", func.name, url);
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
        headless: false,
        executablePath:
          "/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome",
      });

    return this.#contextPromise;
  }

  get profileDir(): string {
    return path.join(this.#options.dataDir, "profiles", this.#options.profile);
  }
}
