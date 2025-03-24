import { parseArgs } from "node:util";
import readline from "node:readline/promises";
import path from "node:path";
import { scrape } from "./subcommands/scrape.ts";
import { years } from "./subcommands/years.ts";
import { orderHTML } from "./subcommands/order-html.ts";
import { orders } from "./subcommands/orders.ts";
import { tokens } from "./subcommands/tokens.ts";
import type { SubcommandOptions } from "./types.ts";
import { Cache } from "./cache.ts";

const DATA_DIR = path.join(
  process.env["HOME"] ?? ".",
  ".cache",
  "amazon-order-scraper"
);

const SUBCOMMANDS: Record<
  string,
  (options: SubcommandOptions) => Promise<void>
> = {
  "order-html": orderHTML,
  orders,
  scrape,
  tokens,
  years,
};

const DEFAULT_SUBCOMMAND = "scrape";

run(process.argv.slice(2)).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

async function run(args: string[]): Promise<void> {
  const opts = parseArgs({
    args,
    options: {
      profile: {
        type: "string",
        short: "p",
      },
      noInteraction: {
        type: "boolean",
        alias: "no-interaction",
      },
    },
    allowPositionals: true,
    strict: false,
  });

  const positionals =
    opts.positionals.length == 0 ? [DEFAULT_SUBCOMMAND] : opts.positionals;

  let subcommand: string;

  if (Object.keys(SUBCOMMANDS).includes(positionals[0])) {
    subcommand = positionals.shift()!;
  } else {
    subcommand = DEFAULT_SUBCOMMAND;
  }
  if (subcommand == null || !Object.keys(SUBCOMMANDS).includes(subcommand)) {
    throw new Error(
      `Allowed subcommands: ${Object.keys(SUBCOMMANDS).join(", ")}`
    );
  }

  const argsForSubcommand = opts.positionals;
  Object.keys(opts.values).forEach((key) => {
    if (key !== "profile" && key !== "noInteraction") {
      argsForSubcommand.push(`--${key}=${opts.values[key]}`);
    }
  });

  const interactionAllowed = !opts.values.noInteraction;
  const profile =
    typeof opts.values.profile === "string" ? opts.values.profile : "default";
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const subcommandOptions: SubcommandOptions = {
    args: positionals,
    cache: new Cache({
      dataDir: DATA_DIR,
      profile,
    }),
    dataDir: DATA_DIR,
    profile,
    interactionAllowed,
    rl,
  };

  try {
    await SUBCOMMANDS[subcommand](subcommandOptions);
  } finally {
    await rl.close();
  }
}
