import path from "node:path";
import readline from "node:readline/promises";
import { parseArgs } from "node:util";
import { DataStore } from "./datastore.js";
import { orders } from "./subcommands/orders.js";
import { scrape } from "./subcommands/scrape.js";
const DATA_DIR = path.join(process.env["HOME"] ?? ".", ".cache", "amazon-order-scraper");
const DEFAULT_PROFILE = "default";
const SUBCOMMANDS = {
    orders,
    scrape,
};
const DEFAULT_SUBCOMMAND = "orders";
export async function run(args, subcommands = SUBCOMMANDS) {
    const { profile, interactionAllowed, subcommand, remainingArgs, ...rest } = parseProgramOptions(args, subcommands, subcommands[DEFAULT_SUBCOMMAND]);
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const subcommandOptions = {
        ...rest,
        args: remainingArgs,
        datastore: new DataStore(path.join(DATA_DIR, "orders.db")),
        dataDir: DATA_DIR,
        profile: profile,
        interactionAllowed,
        rl,
    };
    try {
        await subcommand(subcommandOptions);
    }
    finally {
        await rl.close();
    }
}
function parseProgramOptions(args, subcommands, defaultSubcommand) {
    const { tokens } = parseArgs({
        args,
        allowPositionals: true,
        strict: false,
        tokens: true,
    });
    let subcommand;
    let profile;
    let interactionAllowed = true;
    let remainingArgs = [];
    let info = console.error.bind(console);
    let debug = () => { };
    let warn = console.error.bind(console);
    tokens.forEach((token) => {
        if (token.kind === "positional") {
            if (subcommand == null) {
                if (subcommands[token.value] == null) {
                    throw new Error(`Unknown subcommand: ${token.value}`);
                }
                subcommand = subcommands[token.value];
            }
            else {
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
        if (token.name === "debug") {
            debug = console.error.bind(console);
            return;
        }
        if (token.inlineValue) {
            remainingArgs.push(`--${token.name}=${token.value}`);
        }
        else {
            remainingArgs.push(`--${token.name}`);
        }
    });
    return {
        debug,
        info,
        interactionAllowed,
        profile: profile ?? DEFAULT_PROFILE,
        remainingArgs,
        subcommand: subcommand ?? defaultSubcommand,
        warn,
    };
}
//# sourceMappingURL=cli.js.map