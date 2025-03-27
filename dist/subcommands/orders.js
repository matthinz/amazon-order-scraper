import { parseArgs } from "node:util";
import { formatMonetaryAmount, monetaryAmountsEqual, parseMonetaryAmount, } from "../money.js";
export async function orders({ args, datastore, }) {
    const options = parseArgs({
        args: args,
        options: {
            total: {
                type: "string",
            },
            charge: {
                type: "string",
            },
        },
        allowPositionals: true,
        strict: true,
    });
    let orders = await datastore.getOrders();
    const total = options.values.total == null
        ? undefined
        : parseMonetaryAmount(options.values.total);
    if (total != null) {
        console.error(`Filtering by total: ${formatMonetaryAmount(total)}`);
        orders = orders.filter((invoice) => invoice.total != null &&
            monetaryAmountsEqual(invoice.total, total.cents));
    }
    const charge = options.values.charge == null
        ? undefined
        : parseMonetaryAmount(options.values.charge);
    if (charge != null) {
        charge.currency = charge.currency ?? "$";
        console.error(`Filtering by charge: ${formatMonetaryAmount(charge)}`);
        console.error(charge);
        orders = orders.filter((invoice) => invoice.payments.some((payment) => {
            return (payment.amount != null && monetaryAmountsEqual(payment.amount, charge));
        }));
    }
    if (options.positionals.length > 0) {
        orders = orders.filter((order) => options.positionals.includes(order.id));
    }
    orders.forEach((order) => {
        console.log([
            order.date,
            order.id,
            order.subtotal,
            order.tax,
            order.shippingCost,
            order.total,
        ].join(" "));
        order.shipments.forEach((shipment) => {
            console.log(`  Shipped: ${shipment.date}`);
            shipment.items.forEach((item) => {
                console.log(`    ${item.name} ${item.price}`);
            });
        });
        order.payments.forEach((payment) => {
            console.log(`  Paid: ${payment.date} ${payment.amount}`);
        });
    });
}
//# sourceMappingURL=orders.js.map