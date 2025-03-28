import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { DataStore } from "./datastore.ts";
import { orders } from "./subcommands/orders.ts";
import { scrape } from "./subcommands/scrape.ts";
import type { SubcommandOptions } from "./types.ts";

const DATA_DIR = path.join(
  process.env["HOME"] ?? ".",
  ".cache",
  "amazon-order-scraper",
);

const DEFAULT_USER = "default";

type Subcommand = (options: SubcommandOptions) => Promise<void>;
type SubcommandSet = Record<string, Subcommand>;

const SUBCOMMANDS: SubcommandSet = {
  orders,
  scrape,
};

const DEFAULT_SUBCOMMAND = "orders";

export async function run(
  args: string[],
  subcommands: SubcommandSet = SUBCOMMANDS,
): Promise<void> {
  const { user, interactionAllowed, subcommand, remainingArgs, ...rest } =
    parseProgramOptions(args, subcommands, subcommands[DEFAULT_SUBCOMMAND]);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const subcommandOptions: SubcommandOptions = {
    ...rest,
    args: remainingArgs,
    datastore: new DataStore(path.join(DATA_DIR, "orders.db")),
    dataDir: DATA_DIR,
    user,
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
  user: string;
  interactionAllowed: boolean;
  subcommand: Subcommand;
  remainingArgs: string[];
} & Pick<SubcommandOptions, "debug" | "info" | "warn" | "verbose">;

function parseProgramOptions(
  args: string[],
  subcommands: SubcommandSet,
  defaultSubcommand: Subcommand,
): ProgramOptions {
  const { tokens } = parseArgs({
    args,
    allowPositionals: true,
    strict: false,
    tokens: true,
  });

  let subcommand: Subcommand | undefined;
  let user: string | undefined;
  let interactionAllowed = true;
  let remainingArgs: string[] = [];

  let info: SubcommandOptions["info"] = console.error.bind(console);
  let debug: SubcommandOptions["debug"] = () => {};
  let verbose: SubcommandOptions["verbose"] = () => {};
  let warn: SubcommandOptions["warn"] = console.error.bind(console);

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

    if (token.name === "user") {
      if (token.value == null) {
        throw new Error(`Missing value for option: ${token.name}`);
      }
      if (user != null) {
        throw new Error(`Duplicate option: ${token.name}`);
      }
      user = token.value;
      return;
    }

    if (token.name === "no-interaction") {
      interactionAllowed = false;
      return;
    }

    if (token.name === "verbose") {
      verbose = console.error.bind(console);
      return;
    }

    if (token.name === "debug") {
      debug = verbose = console.error.bind(console);
      return;
    }

    if (token.inlineValue) {
      remainingArgs.push(`--${token.name}=${token.value}`);
    } else {
      remainingArgs.push(`--${token.name}`);
    }
  });

  return {
    debug,
    info,
    interactionAllowed,
    user: user ?? DEFAULT_USER,
    remainingArgs,
    subcommand: subcommand ?? defaultSubcommand,
    verbose,
    warn,
  };
}
