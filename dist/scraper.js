import { JSDOM } from "jsdom";
import path from "node:path";
import { chromium } from "playwright-extra";
import { DataStore } from "./datastore.js";
import { parseInvoiceHTML } from "./invoice-parser/main.js";
const ORDERS_URL = "/your-orders/orders";
const MIN_ORDER_AGE_TO_USE_CACHE_IN_MS = 30 * 24 * 60 * 60 * 1000;
const INVOICE_LINK_SELECTOR = 'a[href*="print.html"]';
const DEFAULTS = {
    root: "https://www.amazon.com",
    headless: true,
    minDelay: 500,
    maxDelay: 1500,
    user: "default",
    onCacheHit: () => { },
    onCacheMiss: () => { },
    onBeforeOrderScrape: () => { },
    onBeforeYearScrape: () => { },
    onOrderScraped: () => { },
    debug: () => { },
    verbose: () => { },
    warn: () => { },
};
export class ParsingError extends Error {
    #html;
    constructor(message, html) {
        super(message);
        this.#html = html;
        this.name = this.constructor.name;
    }
    get html() {
        return this.#html;
    }
}
export class SignInRequiredError extends ParsingError {
    #page;
    constructor(message, html, page) {
        super(message, html);
        this.#page = page;
        this.name = this.constructor.name;
    }
    get page() {
        return this.#page;
    }
}
export class InvoiceParsingFailedError extends ParsingError {
    #reason;
    constructor(reason, invoiceHTML) {
        super(`Failed to parse invoice: ${reason}`, invoiceHTML);
        this.#reason = reason;
        this.name = this.constructor.name;
    }
    get reason() {
        return this.#reason;
    }
}
export class Scraper {
    #contextPromise;
    #lastNavigationAt = new Date(1970, 0, 1);
    #options;
    constructor(options) {
        this.#options = {
            ...DEFAULTS,
            ...options,
        };
    }
    get datastore() {
        return this.#options.datastore;
    }
    async close() {
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
    async getYearsAvailableToScrape(page) {
        return await this.parsePageContent({
            url: new URL(ORDERS_URL, this.#options.root),
            checkCache: (key) => Promise.resolve(undefined),
            updateCache: (key, value) => Promise.resolve(),
            page,
        }, async (url, document, rawContent, page) => {
            document =
                typeof document === "string"
                    ? new JSDOM(document).window.document
                    : document;
            const select = document.querySelector('select[name="timeFilter"]');
            if (!select) {
                throw new SignInRequiredError("Error parsing year page", document.documentElement.outerHTML, page);
            }
            const years = Array.from(select.options)
                .map((o) => o.value)
                .filter((v) => /^year-/.test(v))
                .map((v) => parseInt(v.replace(/^year-/, ""), 10));
            years.sort((a, b) => b - a);
            return years;
        });
    }
    async scrape(page) {
        const years = await this.getYearsAvailableToScrape(page);
        this.debug(`Years to scrape: ${years.join(",")}`);
        let continueScraping = true;
        return years.reduce((promise, year) => promise.then(async () => {
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
        }), Promise.resolve());
    }
    async navigatePage(page, url) {
        const navRequired = page.url() !== url.toString();
        if (!navRequired) {
            return;
        }
        const msSinceLastNavigation = Date.now() - this.#lastNavigationAt.getTime();
        const minDelay = Math.ceil(Math.random() * (this.#options.maxDelay - this.#options.minDelay) +
            this.#options.minDelay);
        const delay = Math.max(0, minDelay - msSinceLastNavigation);
        if (delay > 0) {
            this.debug(`Delay ${delay}dms before navigation to ${url.toString()}`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
        this.verbose(`Navigating to ${url.toString()}`);
        await page.goto(url.toString());
        this.#lastNavigationAt = new Date();
    }
    cacheKey(url) {
        return ["v1", "user", this.#options.user, "url", url.toString()].join(":");
    }
    async parsePageContent({ url, checkCache, updateCache, page }, handler) {
        const cacheKey = this.cacheKey(url);
        let content = await checkCache(cacheKey);
        let actualURL = url;
        const doParse = async (url, rawContent, shouldUpdateCache, page) => {
            const { document } = new JSDOM(rawContent).window;
            let result;
            try {
                result = await handler(actualURL, document, rawContent, page);
            }
            catch (err) {
                if (shouldUpdateCache) {
                    this.verbose(`Error parsing page content (not caching): ${err.message}`);
                }
                throw err;
            }
            if (!shouldUpdateCache) {
                return result;
            }
            if (url.toString() === actualURL.toString()) {
                await updateCache(cacheKey, rawContent);
            }
            else {
                this.warn(`URL changed from ${url.toString()} to ${url.toString()}, not caching contents`);
            }
            return result;
        };
        let cachedContent = content;
        let browserAttempts = 0;
        while (true) {
            if (cachedContent != null) {
                try {
                    return await doParse(url, cachedContent, false);
                }
                catch (err) {
                    this.warn(`Error parsing cached content (falling back to browser): ${err.message}`);
                    cachedContent = undefined;
                }
            }
            else {
                if (browserAttempts > 0) {
                    await new Promise((resolve) => setTimeout(resolve, browserAttempts * 300));
                }
                browserAttempts++;
                try {
                    return await this.withBrowser(url, async (page) => {
                        return doParse(new URL(page.url()), await page.content(), true, page);
                    }, page);
                }
                catch (err) {
                    this.verbose(`Error parsing page content (attempt ${browserAttempts}): ${err.message}`);
                    if (browserAttempts > 4) {
                        throw err;
                    }
                }
            }
        }
    }
    async scrapeOrder(invoiceURL) {
        let wasCached = true;
        const checkCache = async (key) => {
            const value = await this.datastore.checkCache(key);
            if (value == null) {
                wasCached = false;
                this.onCacheMiss(key, "No value found in cache");
                return;
            }
            let order;
            try {
                order = parseInvoiceHTML(value);
            }
            catch (err) {
                throw new InvoiceParsingFailedError(err.message, value);
            }
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
        const updateCache = async (key, value) => {
            try {
                parseInvoiceHTML(value);
            }
            catch (err) {
                throw new InvoiceParsingFailedError(err.message, value);
            }
            this.verbose(`Updating cache for ${key}`);
            await this.datastore.updateCache(key, value);
        };
        const order = await this.parsePageContent({
            url: invoiceURL,
            checkCache,
            updateCache,
        }, async (url, _document, rawContent, page) => {
            try {
                const order = parseInvoiceHTML(rawContent);
                await this.datastore.saveOrder(order, this.#options.user, url, rawContent);
                return order;
            }
            catch (err) {
                throw new InvoiceParsingFailedError(err.message, rawContent);
            }
        });
        this.onOrderScraped(order);
        return { wasCached, order };
    }
    async allInvoiceURLsCached(invoiceURLs) {
        return invoiceURLs.reduce((promise, invoiceURL) => promise.then(async (result) => {
            if (!result) {
                return false;
            }
            const cacheKey = this.cacheKey(invoiceURL);
            return !!(await this.datastore.checkCache(cacheKey));
        }), Promise.resolve(true));
    }
    async scrapeOrdersForYear(year, cacheAllowed = true, page) {
        let url = new URL(`/your-orders/orders?timeFilter=year-${year}`, this.#options.root);
        let pageIndex = 0;
        const checkCache = async (key) => {
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
        const findInvoiceURLs = (document) => {
            return Array.from(document.querySelectorAll(INVOICE_LINK_SELECTOR))
                .map((a) => a.href)
                .map((url) => new URL(url, this.#options.root));
        };
        const NEXT_PAGE_LINK_SELECTOR = "li.a-last a";
        const allOrders = [];
        while (url != null) {
            pageIndex++;
            this.verbose(`Scraping page ${pageIndex} of orders for year ${year}`);
            const [invoiceURLs, nextPageURL] = await this.parsePageContent({
                url,
                checkCache,
                updateCache,
                page,
            }, async (url, document, _, page) => {
                const invoiceURLs = findInvoiceURLs(document);
                if (invoiceURLs.length === 0) {
                    throw new SignInRequiredError(`No invoices found on ${url.toString()}`, document.documentElement.outerHTML, page);
                }
                let nextPageURL = document.querySelector(NEXT_PAGE_LINK_SELECTOR)?.href;
                return [
                    invoiceURLs,
                    nextPageURL == null ? undefined : new URL(nextPageURL, url),
                ];
            });
            await invoiceURLs.reduce((promise, invoiceURL) => promise.then(async () => {
                const { order } = await this.scrapeOrder(invoiceURL);
                allOrders.push(order);
            }), Promise.resolve());
            url = nextPageURL;
        }
        return allOrders;
    }
    async withBrowser(url, func, page) {
        const shouldCreatePage = page == null;
        let pageToUse;
        let shouldCleanUpPage = shouldCreatePage;
        if (shouldCreatePage) {
            const context = await this.context;
            pageToUse = await context.newPage();
        }
        else {
            pageToUse = page;
        }
        try {
            if (url) {
                await this.navigatePage(pageToUse, url);
            }
            return await func(pageToUse);
        }
        catch (err) {
            // If the err is being used to return a reference to the page,
            // don't close it here
            if ("page" in err && err.page === pageToUse) {
                shouldCleanUpPage = false;
            }
            throw err;
        }
        finally {
            if (shouldCleanUpPage) {
                await pageToUse.close();
            }
        }
    }
    get context() {
        this.#contextPromise =
            this.#contextPromise ??
                chromium.launchPersistentContext(this.profileDir, {
                    headless: this.#options.headless,
                    executablePath: "/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome",
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
    get profileDir() {
        return path.join(this.#options.dataDir, "profiles", this.#options.user);
    }
}
//# sourceMappingURL=scraper.js.map