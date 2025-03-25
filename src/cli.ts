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

const DEFAULT_PROFILE = "default";

type Subcommand = (options: SubcommandOptions) => Promise<void>;
type SubcommandSet = Record<string, Subcommand>;

const SUBCOMMANDS: SubcommandSet = {
  "order-html": orderHTML,
  orders,
  scrape,
  tokens,
  years,
};

const DEFAULT_SUBCOMMAND = "orders";

export async function run(
  args: string[],
  subcommands: SubcommandSet = SUBCOMMANDS
): Promise<void> {
  const { profile, interactionAllowed, subcommand, remainingArgs } =
    parseProgramOptions(args, subcommands, subcommands[DEFAULT_SUBCOMMAND]);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const subcommandOptions: SubcommandOptions = {
    args: remainingArgs,
    cache: new Cache({
      dataDir: DATA_DIR,
      profile,
    }),
    dataDir: DATA_DIR,
    profile: profile,
    interactionAllowed,
    rl,
  };

  try {
    await subcommand(subcommandOptions);
  } finally {
    await rl.close();
  }
}

type ProgramOptions = {
  profile: string;
  interactionAllowed: boolean;
  subcommand: Subcommand;
  remainingArgs: string[];
};

function parseProgramOptions(
  args: string[],
  subcommands: SubcommandSet,
  defaultSubcommand: Subcommand
): ProgramOptions {
  const { tokens } = parseArgs({
    args,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });

  let subcommand: Subcommand | undefined;
  let profile: string | undefined;
  let interactionAllowed = true;
  let remainingArgs: string[] = [];

  tokens.forEach((token) => {
    if (token.kind === "positional") {
      if (subcommand == null) {
        if (subcommands[token.value] == null) {
          throw new Error(`Unknown subcommand: ${token.value}`);
        }
        subcommand = subcommands[token.value];
      } else {
        remainingArgs.push(token.value);
      }
      return;
    }

    if (token.kind === "option-terminator") {
      return;
    }

    if (token.name === "profile") {
      if (token.value == null) {
        throw new Error(`Missing value for option: ${token.name}`);
      }
      if (profile != null) {
        throw new Error(`Duplicate option: ${token.name}`);
      }
      profile = token.value;
      return;
    }

    if (token.name === "no-interaction") {
      interactionAllowed = false;
      return;
    }

    if (token.inlineValue) {
      remainingArgs.push(`--${token.name}="${token.value}"`);
    } else {
      remainingArgs.push(`--${token.name}`);
    }
  });

  return {
    profile: profile ?? DEFAULT_PROFILE,
    interactionAllowed,
    subcommand: subcommand ?? defaultSubcommand,
    remainingArgs,
  };
}
