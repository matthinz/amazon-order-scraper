import { parseArgs } from "node:util";
import type { SubcommandOptions } from "../types.ts";

export async function orders({
  args,
  cache,
}: SubcommandOptions): Promise<void> {
  const options = parseArgs({
    args: args,
    options: {
      total: {
        type: "string",
      },
    },
    allowPositionals: false,
    strict: true,
  });

  let invoices = await cache.getInvoices();

  const total =
    options.values.total == null
      ? undefined
      : parseAmount(options.values.total);

  if (total != null) {
    console.error(`Filtering by total: ${formatAmount(total)}`);
    invoices = invoices.filter(
      (invoice) => invoice.total != null && parseAmount(invoice.total) === total
    );
  }

  invoices.forEach((invoice) => {
    console.log(
      [
        invoice.date,
        invoice.orderID,
        invoice.subtotal,
        invoice.tax,
        invoice.shippingCost,
        invoice.total,
      ].join(" ")
    );

    invoice.shipments.forEach((shipment) => {
      console.log(`  Shipped: ${shipment.date}`);
      shipment.items.forEach((item) => {
        console.log(`    ${item.name} ${item.price}`);
      });
    });
  });
}

function parseAmount(amount: string): number {
  return Math.floor(parseFloat(amount.replace(/[\$,]/g, "")) * 100);
}

function formatAmount(amount: number): string {
  return `$${(amount / 100).toFixed(2)}`;
}
