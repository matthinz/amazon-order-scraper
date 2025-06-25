import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  InvoiceParsingFailedError,
  Scraper,
  SignInRequiredError,
  type ScraperOptions,
} from "../scraper.ts";
import type { SubcommandOptions } from "../types.ts";
import { parseDateInput } from "../utils.ts";

type ScrapeAttemptResult =
  | {
      complete: false;
      needSignIn: true;
    }
  | {
      complete: false;
      invoiceParsingFailed: true;
      invoiceHTML: string;
      reason: string;
    }
  | {
      complete: true;
    };

export async function scrape(options: SubcommandOptions): Promise<void> {
  let scraper: Scraper | undefined;
  let headless = true;

  const { from, to } = parseOptions(options.args);
  const scrapedOrderIDs = new Set<string>();

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

        throw new Error(
          `Failed to parse invoice HTML: ${result.reason}.\n\nInvoice HTML has been saved to ${fixturePath}.`,
        );
      }

      if (!options.interactionAllowed) {
        throw new Error(
          "You must sign in to Amazon.com, but --no-interaction has been specified.",
        );
      }

      await promptForSignIn(options.rl);

      continue;
    }
  } finally {
    await closeScraper();
  }

  function closeScraper(): Promise<void> {
    if (scraper) {
      const closePromise = scraper.close();
      scraper = undefined;
      return closePromise;
    }
    return Promise.resolve();
  }
}

async function attemptScrape(scraper: Scraper): Promise<ScrapeAttemptResult> {
  try {
    await scraper.scrape();
    return { complete: true };
  } catch (err) {
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

function createScraper(
  options: SubcommandOptions & Partial<ScraperOptions>,
): Scraper {
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

async function promptForSignIn(rl: readline.Interface): Promise<void> {
  console.log(
    `
================================================================================
| Amazon.com sign-in required.                                                 |
|------------------------------------------------------------------------------|
| This scraper can't log in for you. Please switch over to the browser and log |
| yourself into Amazon.com. Then come back here and press Enter to continue.   |
================================================================================
`.trim(),
  );

  await rl.question("");
}

function parseOptions(args: string[]): {
  from: Date;
  to: Date;
} {
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

async function saveFixtureHTML(html: string): Promise<string> {
  const potentialOrderIDs: { [id: string]: number } =
    html.match(/\b\d{3}-\d{7}-\d{7}\b/g)?.reduce((acc, id) => {
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

  const fixturesDir = path.join(import.meta.dirname, "../..", "fixtures");

  let fixtureFile: string;

  const { html: anonymizedHTML, orderID: anonymizedOrderID } =
    await anonymizeInvoiceHTML(html, orderID, potentialOrderIDs);

  fixtureFile = path.join(fixturesDir, `invoice-${anonymizedOrderID}.html`);

  await fs.mkdir(path.dirname(fixtureFile), { recursive: true });
  await fs.writeFile(fixtureFile, anonymizedHTML);

  const jsonFile = path.join(fixturesDir, `invoice-${anonymizedOrderID}.json`);
  await fs.writeFile(jsonFile, "{}\n");

  return fixtureFile;
}

async function anonymizeInvoiceHTML(
  html: string,
  orderID: string,
  potentialOrderIDs: { [id: string]: number },
): Promise<{ orderID: string; html: string }> {
  let newOrderID: string;

  Object.keys(potentialOrderIDs).forEach((id) => {
    const regex = new RegExp(id, "g");
    const replacement = generateRandomOrderID();
    if (id === orderID) {
      newOrderID = replacement;
    }
    html = html.replace(regex, replacement);
  });

  if (!newOrderID) {
    throw new Error();
  }

  html = await replacePiiTokens(html);

  return { orderID: newOrderID, html };
}

async function replacePiiTokens(html: string): Promise<string> {
  let piiTokens: { [pattern: string]: string };

  try {
    const json = await fs.readFile("pii_tokens.json", "utf8");
    piiTokens = JSON.parse(json);
  } catch (err) {
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
