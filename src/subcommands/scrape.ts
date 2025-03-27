import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import {
  InvoiceParsingFailedError,
  Scraper,
  SignInRequiredError,
  type ScraperOptions,
} from "../scraper.ts";
import type { SubcommandOptions } from "../types.ts";

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

  try {
    while (true) {
      scraper =
        scraper ??
        createScraper({
          ...options,
          headless,
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
      return { complete: false, needSignIn: true };
    }

    if (err instanceof InvoiceParsingFailedError) {
      return {
        complete: false,
        invoiceParsingFailed: true,
        invoiceHTML: err.invoiceHTML,
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
      options.debug(`Cache hit for ${key}`);
    },
    onCacheMiss(key, reason) {
      options.debug(`Cache miss for ${key}: ${reason}`);
    },
    onYearStarted(year) {
      options.info(`Scraping orders for ${year}`);
    },
    onYearComplete(year, orders) {
      options.info(`Scraped ${orders.length} order(s) for ${year}`);
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
