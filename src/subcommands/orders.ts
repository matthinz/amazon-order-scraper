import { parseArgs } from "node:util";
import { getContentChunks } from "../invoice-parser/html.ts";
import {
  formatMonetaryAmount,
  monetaryAmountsEqual,
  parseMonetaryAmount,
} from "../money.ts";
import type { SubcommandOptions } from "../types.ts";

export async function orders({
  args,
  datastore,
}: SubcommandOptions): Promise<void> {
  const options = parseArgs({
    args: args,
    options: {
      total: {
        type: "string",
      },
      charge: {
        type: "string",
      },
      html: {
        type: "boolean",
      },
      tokens: {
        type: "boolean",
      },
    },
    allowPositionals: true,
    strict: true,
  });

  let orders = await datastore.getOrders();

  const total =
    options.values.total == null
      ? undefined
      : parseMonetaryAmount(options.values.total);

  if (total != null) {
    console.error(`Filtering by total: ${formatMonetaryAmount(total)}`);
    orders = orders.filter(
      (invoice) =>
        invoice.total != null &&
        monetaryAmountsEqual(invoice.total, total.cents),
    );
  }

  const charge =
    options.values.charge == null
      ? undefined
      : parseMonetaryAmount(options.values.charge);

  if (charge != null) {
    charge.currency = charge.currency ?? "$";

    console.error(`Filtering by charge: ${formatMonetaryAmount(charge)}`);
    console.error(charge);
    orders = orders.filter((invoice) =>
      invoice.payments.some((payment) => {
        return (
          payment.amount != null && monetaryAmountsEqual(payment.amount, charge)
        );
      }),
    );
  }

  if (options.positionals.length > 0) {
    orders = orders.filter((order) => options.positionals.includes(order.id));
  }

  await Promise.all(
    orders.map(async (order) => {
      if (options.values.html) {
        console.log(await datastore.getInvoiceHTML(order.id));
        return;
      }

      if (options.values.tokens) {
        const html = await datastore.getInvoiceHTML(order.id);
        getContentChunks(html).forEach((chunk) => {
          console.log(chunk);
        });
        return;
      }

      console.log(
        [
          order.date,
          order.id,
          order.subtotal,
          order.tax,
          order.shippingCost,
          order.total,
        ].join(" "),
      );

      order.shipments.forEach((shipment) => {
        console.log(`  Shipped: ${shipment.date}`);
        shipment.items.forEach((item) => {
          console.log(`    ${item.name} ${item.price}`);
        });
      });

      order.payments.forEach((payment) => {
        console.log(`  Paid: ${payment.date} ${payment.amount}`);
      });
    }),
  );
}
