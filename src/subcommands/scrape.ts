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
        const htmlFile = path.join(options.dataDir, "invoice.html");
        await fs.writeFile(htmlFile, result.invoiceHTML, "utf8");

        throw new Error(
          `Failed to parse invoice HTML: ${result.reason}.\n\nInvoice HTML has been saved to ${htmlFile}.`,
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
      options.warn(`Cache miss for ${key}: ${reason}`);
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
