import readline from "node:readline/promises";
import type { Page } from "playwright";
import { Scraper, SignInRequiredError } from "../scraper.ts";
import type { SubcommandOptions } from "../types.ts";

type ScrapeAttemptResult =
  | {
      complete: false;
      needSignIn: true;
      page: Page;
    }
  | {
      complete: true;
      needSignIn?: false;
      page?: Page;
    };

export async function scrape(options: SubcommandOptions): Promise<void> {
  const scraper = new Scraper({
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

  let page: Page | undefined;

  try {
    while (true) {
      const result = await attemptScrape(scraper, page);

      if (result.complete) {
        return;
      }

      if (!options.interactionAllowed) {
        throw new Error(
          "You must sign in to Amazon.com, but --no-interaction has been specified.",
        );
      }

      await promptForSignIn(options.rl);
      page = result.page;
      continue;
    }
  } finally {
    await scraper.close();
  }
}

async function attemptScrape(
  scraper: Scraper,
  page?: Page,
): Promise<ScrapeAttemptResult> {
  try {
    await scraper.scrape(page);
    return { complete: true };
  } catch (err) {
    if (err instanceof SignInRequiredError) {
      return { complete: false, needSignIn: true, page: err.page };
    }
    throw err;
  }
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
