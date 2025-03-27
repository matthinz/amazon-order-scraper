import readline from "node:readline/promises";
import {
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
      complete: true;
      needSignIn?: false;
    };

export async function scrape(options: SubcommandOptions): Promise<void> {
  let scraper: Scraper | undefined;
  let headless = true;

  try {
    while (true) {
      scraper = createScraper({
        ...options,
        headless,
      });

      const result = await attemptScrape(scraper);

      if (result.complete) {
        return;
      }

      if (!options.interactionAllowed) {
        throw new Error(
          "You must sign in to Amazon.com, but --no-interaction has been specified.",
        );
      }

      if (headless) {
        headless = false;
        options.info(
          "Headless scraping failed, attempting interactive scraping...",
        );
        continue;
      }

      await promptForSignIn(options.rl);

      continue;
    }
  } finally {
    if (scraper) {
      const closePromise = scraper.close();
      scraper = undefined;
      await closePromise;
    }
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
