import path from "node:path";
import sqlite from "node:sqlite";
import { parseInvoice } from "./invoice.ts";
import type { Order } from "./types.ts";

export class DataStore {
  #dbPromise: Promise<sqlite.DatabaseSync> | undefined;
  #filename: string;

  constructor(filename: string) {
    this.#filename = filename;
  }

  async checkCache(key: string): Promise<string | undefined> {
    const db = await this.initDB();
    const statement = db.prepare("SELECT value FROM cache WHERE key = ?");
    const row = statement.get(key) as any;

    if (!row) {
      return;
    }

    return row.value ?? "";
  }

  async updateCache(key: string, value: string): Promise<void> {
    const db = await this.initDB();
    const statement = db.prepare(
      "INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)",
    );
    statement.run(key, value);
  }

  async getOrders(): Promise<Order[]> {
    const db = await this.initDB();
    const statement = db.prepare("SELECT order_id, invoice_html FROM orders");
    return statement.all().map((row: any) => {
      try {
        return parseInvoice(row.invoice_html);
      } catch (err) {
        throw new Error(
          `Error parsing invoice ${row.order_id}: ${err.message}`,
        );
      }
    });
  }

  initDB(): Promise<sqlite.DatabaseSync> {
    if (this.#dbPromise) {
      return this.#dbPromise;
    }

    return new Promise((resolve) => {
      const dbPath = path.join(this.#filename);

      const db = new sqlite.DatabaseSync(dbPath);

      db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          order_id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          user TEXT NOT NULL,
          invoice_html TEXT,
          complete INTEGER NOT NULL DEFAULT 0,
          last_scraped TEXT NOT NULL
        );
      `);

      db.exec(`
        CREATE TABLE IF NOT EXISTS cache (
          key TEXT NOT NULL,
          value TEXT NOT NULL,
          PRIMARY KEY (key, value)
        );
      `);

      resolve(db);
    });
  }
}
