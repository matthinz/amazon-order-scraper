import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { InvoiceParsingFailedError, Scraper, SignInRequiredError, } from "../scraper.js";
import { parseDateInput } from "../utils.js";
export async function scrape(options) {
    let scraper;
    let headless = true;
    const { from, to } = parseOptions(options.args);
    const scrapedOrderIDs = new Set();
    try {
        while (true) {
            scraper =
                scraper ??
                    createScraper({
                        ...options,
                        headless,
                        onBeforeOrderScrape: (id, date) => {
                            if (scrapedOrderIDs.has(id)) {
                                return "SKIP_ORDER";
                            }
                            if (date > to) {
                                return "STOP_SCRAPING";
                            }
                            if (date < from) {
                                return "SKIP_ORDER";
                            }
                            return "SCRAPE_ORDER";
                        },
                        onBeforeYearScrape: (year) => {
                            if (year > to.getFullYear()) {
                                return "STOP_SCRAPING";
                            }
                            if (year < from.getFullYear()) {
                                return "SKIP_YEAR";
                            }
                            if (year === new Date().getFullYear()) {
                                // For the current year, we can't cache since orders are still
                                // in flux
                                return "SCRAPE_YEAR_NO_CACHE";
                            }
                            return "SCRAPE_YEAR";
                        },
                        onOrderScraped(order) {
                            scrapedOrderIDs.add(order.id);
                        },
                    });
            const result = await attemptScrape(scraper);
            if (result.complete) {
                return;
            }
            if (headless) {
                // If headless scraping failed, close the scraper and try non-headless
                await closeScraper();
                headless = false;
                continue;
            }
            // We're already not headless. This probably means that something is
            // messed up and the user needs to do something.
            if ("invoiceParsingFailed" in result && result.invoiceParsingFailed) {
                const fixturePath = await saveFixtureHTML(result.invoiceHTML);
                throw new Error(`Failed to parse invoice HTML: ${result.reason}.\n\nInvoice HTML has been saved to ${fixturePath}.`);
            }
            if (!options.interactionAllowed) {
                throw new Error("You must sign in to Amazon.com, but --no-interaction has been specified.");
            }
            await promptForSignIn(options.rl);
            continue;
        }
    }
    finally {
        await closeScraper();
    }
    function closeScraper() {
        if (scraper) {
            const closePromise = scraper.close();
            scraper = undefined;
            return closePromise;
        }
        return Promise.resolve();
    }
}
async function attemptScrape(scraper) {
    try {
        await scraper.scrape();
        return { complete: true };
    }
    catch (err) {
        if (err instanceof SignInRequiredError) {
            console.error(err.message);
            return { complete: false, needSignIn: true };
        }
        if (err instanceof InvoiceParsingFailedError) {
            return {
                complete: false,
                invoiceParsingFailed: true,
                invoiceHTML: err.html,
                reason: err.reason,
            };
        }
        throw err;
    }
}
function createScraper(options) {
    return new Scraper({
        ...options,
        onCacheHit(key) {
            options.verbose(`Cache hit for ${key}`);
        },
        onCacheMiss(key, reason) {
            options.verbose(`Cache miss for ${key}: ${reason}`);
        },
        onOrderScraped(order) {
            options.info(`Scraped order ${order.id}`);
        },
    });
}
async function promptForSignIn(rl) {
    console.log(`
================================================================================
| Amazon.com sign-in required.                                                 |
|------------------------------------------------------------------------------|
| This scraper can't log in for you. Please switch over to the browser and log |
| yourself into Amazon.com. Then come back here and press Enter to continue.   |
================================================================================
`.trim());
    await rl.question("");
}
function parseOptions(args) {
    const { values } = parseArgs({
        allowPositionals: false,
        args,
        options: {
            from: {
                type: "string",
            },
            to: {
                type: "string",
            },
        },
    });
    const { from: rawFrom, to: rawTo } = values;
    let from = rawFrom == null ? undefined : parseDateInput(rawFrom, new Date());
    let to = rawTo == null ? undefined : parseDateInput(rawTo, new Date());
    if (to == null) {
        to = new Date();
    }
    if (from == null) {
        to = new Date();
        from = parseDateInput("1 week", to);
    }
    if (from > to) {
        [to, from] = [from, to];
    }
    return { from, to };
}
async function saveFixtureHTML(html) {
    const fixturesDir = path.join(import.meta.dirname, "../..", "fixtures");
    let fixtureFile;
    const anonymizedHTML = await anonymizeInvoiceHTML(html);
    const orderID = getOrderIDFromHTML(anonymizedHTML);
    fixtureFile = path.join(fixturesDir, `invoice-${orderID}.html`);
    await fs.mkdir(path.dirname(fixtureFile), { recursive: true });
    await fs.writeFile(fixtureFile, anonymizedHTML);
    const jsonFile = path.join(fixturesDir, `invoice-${orderID}.json`);
    await fs.writeFile(jsonFile, "{}\n");
    return fixtureFile;
}
async function anonymizeInvoiceHTML(html) {
    // We want to anonymize anything that _looks_ like an order ID,
    // but only one of those will _actually_ be the order ID.
    const orderIDMap = new Map();
    html = html.replace(/(\d{3}-\d{7}-\d{7})/g, (_, orderID) => {
        if (orderIDMap.has(orderID)) {
            return orderIDMap.get(orderID);
        }
        const replacement = generateRandomOrderID();
        orderIDMap.set(orderID, replacement);
        return replacement;
    });
    return await replacePiiTokens(html);
}
async function replacePiiTokens(html) {
    let piiTokens;
    try {
        const json = await fs.readFile("pii_tokens.json", "utf8");
        piiTokens = JSON.parse(json);
    }
    catch (err) {
        throw err;
    }
    Object.entries(piiTokens).forEach(([pattern, replacement]) => {
        const regex = new RegExp(pattern, "gi");
        html = html.replace(regex, String(replacement));
    });
    return html;
}
function generateRandomOrderID() {
    return [
        new Array(3)
            .fill(0)
            .map(() => Math.floor(Math.random() * 10))
            .join(""),
        new Array(7)
            .fill(0)
            .map(() => Math.floor(Math.random() * 10))
            .join(""),
        new Array(7)
            .fill(0)
            .map(() => Math.floor(Math.random() * 10))
            .join(""),
    ].join("-");
}
function getOrderIDFromHTML(html) {
    const m = /orderID%3D(\d{3}-\d{7}-\d{7})/.exec(html);
    if (m) {
        return m[1];
    }
    const potentialOrderIDs = html.match(/\b\d{3}-\d{7}-\d{7}\b/g)?.reduce((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
    }, {}) ?? {};
    const sortedPotentialOrderIDs = Object.entries(potentialOrderIDs)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id);
    const orderID = sortedPotentialOrderIDs[0];
    if (!orderID) {
        throw new Error("No order ID found in the invoice HTML.");
    }
    return orderID;
}
//# sourceMappingURL=scrape.js.map