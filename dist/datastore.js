import path from "node:path";
import sqlite from "node:sqlite";
import { parseInvoice } from "./invoice.js";
export class DataStore {
    #dbPromise;
    #filename;
    constructor(filename) {
        this.#filename = filename;
    }
    async checkCache(key) {
        const db = await this.initDB();
        const statement = db.prepare("SELECT value FROM cache WHERE key = ?");
        const row = statement.get(key);
        if (!row) {
            return;
        }
        return row.value ?? "";
    }
    async updateCache(key, value) {
        const db = await this.initDB();
        const statement = db.prepare("INSERT OR REPLACE INTO cache (key, value) VALUES (?, ?)");
        console.error(key, value);
        statement.run(key, value);
    }
    async getOrders() {
        const db = await this.initDB();
        const statement = db.prepare("SELECT * FROM orders");
        return statement
            .all()
            .map((row) => {
            try {
                return parseInvoice(row.invoice_html);
            }
            catch (err) {
                throw new Error(`Error parsing invoice ${row.order_id}: ${err.message}`);
            }
        })
            .sort((a, b) => (a.date ?? "").localeCompare(b.date));
    }
    async saveOrder(order, user, invoiceURL, invoiceHTML) {
        const db = await this.initDB();
        db.exec("BEGIN TRANSACTION");
        try {
            this.saveOrderData(db, order, user, invoiceURL, invoiceHTML);
            this.saveOrderPayments(db, order);
            this.saveOrderShipments(db, order);
            db.exec("COMMIT");
        }
        catch (err) {
            db.exec("ROLLBACK");
            throw err;
        }
    }
    saveOrderData(db, order, user, invoiceURL, invoiceHTML) {
        this.insert(db, "orders", {
            id: order.id,
            date: order.date,
            user: user,
            currency: order.currency,
            invoice_url: invoiceURL.toString(),
            invoice_html: invoiceHTML,
            shipping: order.shippingCost,
            shipping_cents: order.shippingCostCents,
            subtotal: order.subtotal,
            subtotal_cents: order.subtotalCents,
            tax: order.tax,
            tax_cents: order.taxCents,
            total: order.total,
            total_cents: order.totalCents,
            complete: 1,
        });
    }
    saveOrderPayments(db, order) {
        db.prepare("DELETE FROM payments WHERE order_id = ?").run(order.id);
        order.payments.forEach((payment) => {
            this.insert(db, "payments", {
                order_id: order.id,
                date: payment.date,
                type: payment.type,
                card_type: "cardType" in payment ? payment.cardType : null,
                last4: "last4" in payment ? payment.last4 : null,
                amount: payment.amount,
                amount_cents: payment.amountCents,
            });
        });
    }
    saveOrderShipments(db, order) {
        db.prepare("DELETE FROM order_items WHERE order_id = ?").run(order.id);
        db.prepare("DELETE FROM shipments WHERE order_id = ?").run(order.id);
        order.shipments.forEach((shipment) => {
            const { lastInsertRowid } = this.insert(db, "shipments", {
                order_id: order.id,
                date: shipment.date,
                name: shipment.shippingAddress.name,
                address: shipment.shippingAddress.address,
                city: shipment.shippingAddress.city,
                state: shipment.shippingAddress.state,
                zip: shipment.shippingAddress.zip,
                country: shipment.shippingAddress.country,
            });
            this.saveOrderItems(db, order, lastInsertRowid);
        });
    }
    saveOrderItems(db, order, shipmentID) {
        order.shipments.forEach((shipment) => {
            shipment.items.forEach((item) => {
                this.insert(db, "order_items", {
                    order_id: order.id,
                    shipment_id: shipmentID,
                    name: item.name,
                    price: item.price,
                    price_cents: item.priceCents,
                    quantity: item.quantity,
                });
            });
        });
    }
    initDB() {
        if (this.#dbPromise) {
            return this.#dbPromise;
        }
        return new Promise((resolve) => {
            const dbPath = path.join(this.#filename);
            const db = new sqlite.DatabaseSync(dbPath);
            db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
          id TEXT PRIMARY KEY,
          date TEXT NOT NULL,
          user TEXT NOT NULL,
          currency TEXT NOT NULL,
          invoice_url TEXT NOT NULL,
          invoice_html TEXT NOT NULL,
          shipping TEXT NULL,
          shipping_cents INTEGER NULL,
          subtotal TEXT NOT NULL,
          subtotal_cents INTEGER NOT NULL,
          tax TEXT NOT NULL,
          tax_cents INTEGER NOT NULL,
          total TEXT NOT NULL,
          total_cents INTEGER NOT NULL,
          complete INTEGER NOT NULL DEFAULT 0
        );
      `);
            db.exec(`
        CREATE TABLE IF NOT EXISTS payments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT NOT NULL,
          date TEXT NOT NULL,
          type TEXT NOT NULL,
          card_type TEXT NULL,
          last4 TEXT NULL,
          amount TEXT NOT NULL,
          amount_cents INTEGER NOT NULL
        );
      `);
            db.exec(`
        CREATE TABLE IF NOT EXISTS shipments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT NOT NULL,
          date TEXT NULL,
          name TEXT NOT NULL,
          address TEXT NOT NULL,
          city TEXT NOT NULL,
          state TEXT NOT NULL,
          zip TEXT NOT NULL,
          country TEXT NOT NULL
        );
      `);
            db.exec(`
        CREATE TABLE IF NOT EXISTS order_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_id TEXT NOT NULL,
          shipment_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          price TEXT NOT NULL,
          price_cents INTEGER NOT NULL,
          quantity INTEGER NOT NULL
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
    insert(db, table, values) {
        const orderedValues = Object.entries(values);
        const columns = orderedValues.map(([name]) => name).join(", ");
        const placeholders = orderedValues.map(() => "?").join(", ");
        const statement = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns}) VALUES (${placeholders})`);
        try {
            return statement.run(...orderedValues.map(([_, value]) => typeof value === "undefined" ? null : value));
        }
        catch (err) {
            console.error(orderedValues.filter(([name, value]) => name != "invoice_html"));
            console.error(err);
            throw err;
        }
    }
}
//# sourceMappingURL=datastore.js.map