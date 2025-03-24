import fs from "node:fs/promises";
import path from "node:path";
import sqlite from "node:sqlite";
import { parseInvoice } from "./invoice.ts";
import type { Order } from "./types.ts";

type CacheOptions = {
  dataDir: string;
  profile: string;
};

export class Cache {
  #dbPromise: Promise<sqlite.DatabaseSync> | undefined;
  #options: CacheOptions;

  constructor(options: CacheOptions) {
    this.#options = options;
  }

  async completeYears(): Promise<number[]> {
    const db = await this.initDB();
    const statement = db.prepare("SELECT year FROM years WHERE complete = 1");
    return statement.all().map((row: any) => row.year);
  }

  async countOrdersForYear(year: number): Promise<number> {
    const db = await this.initDB();
    const statement = db.prepare("SELECT COUNT(*) FROM orders WHERE year = ?");
    const row = statement.get(year) as any;
    return row["COUNT(*)"];
  }

  async getOrderInvoiceHTML(orderID: string): Promise<string | undefined> {
    const db = await this.initDB();
    const statement = db.prepare(
      "SELECT invoice_html FROM orders WHERE order_id = ?"
    );
    const row = statement.get(orderID) as any;
    return row?.invoice_html;
  }

  async getOrders(): Promise<Order[]> {
    const db = await this.initDB();
    const statement = db.prepare("SELECT order_id, invoice_html FROM orders");
    return statement.all().map((row: any) => {
      try {
        return parseInvoice(row.invoice_html);
      } catch (err) {
        throw new Error(
          `Error parsing invoice ${row.order_id}: ${err.message}`
        );
      }
    });
  }

  async markYearComplete(year: number): Promise<void> {
    const db = await this.initDB();
    const statement = db.prepare(
      "INSERT OR REPLACE INTO years (year, complete) VALUES (?, 1)"
    );
    statement.run(year);
  }

  async orderScraped(orderID: string): Promise<boolean> {
    return !!(await this.getOrderInvoiceHTML(orderID));
  }

  async yearScraped(year: number): Promise<boolean> {
    const db = await this.initDB();
    const statement = db.prepare("SELECT complete FROM years WHERE year = ?");
    const row = statement.get(year) as any;
    return row?.complete === 1;
  }

  async saveOrderInvoiceHTML(
    orderID: string,
    invoiceHTML: string
  ): Promise<void> {
    const db = await this.initDB();
    const statement = db.prepare(
      "INSERT INTO orders (order_id, date, year, invoice_html) VALUES (?, ?, ?, ?)"
    );

    let invoice: Order;

    try {
      invoice = parseInvoice(invoiceHTML);
    } catch (err) {
      await fs.writeFile("invoice-with-error.html", invoiceHTML);
      throw err;
    }

    statement.run(
      orderID,
      invoice.date ?? null,
      invoice.date?.split("-")[0] ?? null,
      invoiceHTML
    );
  }

  initDB(): Promise<sqlite.DatabaseSync> {
    if (this.#dbPromise) {
      return this.#dbPromise;
    }

    return new Promise((resolve) => {
      const dbPath = path.join(
        this.#options.dataDir,
        this.#options.profile,
        "cache.db"
      );
      const db = new sqlite.DatabaseSync(dbPath);

      db.exec(`
            CREATE TABLE IF NOT EXISTS orders (
            order_id TEXT PRIMARY KEY,
            date TEXT NOT NULL,
            year INTEGER NOT NULL,
            invoice_html TEXT
            );
        `);

      db.exec(`
            CREATE TABLE IF NOT EXISTS years (
            year INTEGER PRIMARY KEY,
            complete INTEGER NOT NULL DEFAULT 0
            );
        `);

      resolve(db);
    });
  }
}
