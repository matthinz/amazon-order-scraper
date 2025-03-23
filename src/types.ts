import readline from "node:readline/promises";
import { Cache } from "./cache.ts";

export type SubcommandOptions = {
  args: string[];
  cache: Cache;
  dataDir: string;
  profile: string;
  rl: readline.Interface;
  interactionAllowed: boolean;
};
