import { OrderBuilder } from "./order-builder.js";
import { getContentChunks } from "./parsing.js";
const CITY_STATE_ZIP_REGEX = /^(?<city>.+), (?<state>[A-Za-z]+) (?<zip>(\d{5})(-\d{4})?)$/;
const NOOP = () => { };
export function parseInvoice(html, log = NOOP) {
    const builder = new OrderBuilder();
    let handler = unknown;
    getContentChunks(html).forEach((token) => {
        log(`${handler.name}: ${token}`);
        const result = handler(token, builder);
        if (typeof result === "function") {
            handler = result;
            log(`  -> ${handler.name}`);
        }
    });
    return builder.build();
}
function executeParserSteps(steps, token, order) {
    for (const step of steps) {
        if (typeof step === "function") {
            return step(token, order);
        }
        else if ("equals" in step) {
            if (token === step.equals) {
                return step.handler(token, order);
            }
        }
        else if ("matches" in step) {
            const m = step.matches.exec(token);
            if (m) {
                return step.handler(m, order);
            }
        }
        else {
            throw new Error("Invalid step");
        }
    }
}
function item(token, order) {
    return (executeParserSteps([
        {
            matches: /^.?[\d\.,]+$/,
            handler: () => {
                order.setItemPrice(token).finalizeItem();
            },
        },
    ], token, order) ?? items(token, order));
}
function items(token, order) {
    return executeParserSteps([
        {
            matches: /Shipping Address: (.+)/,
            handler(m) {
                order.setShippingAddressName(m[1]);
                return shipping;
            },
        },
        {
            matches: /^(\d+) of: (.+)/,
            handler(m) {
                order.setItemName(m[2]).setItemQuantity(m[1]);
                return item;
            },
        },
    ], token, order);
}
function payments(token, order) {
    return executeParserSteps([
        {
            matches: /(?<cardType>.+) ending in (?<last4>\d+): (?<month>.+) (?<day>\d+), (?<year>\d{4}): (?<amount>.+)/,
            handler(m) {
                order
                    .addCreditCardPayment(m.groups["cardType"], m.groups["last4"])
                    .setPaymentAmount(m.groups["amount"])
                    .setPaymentDate(m.groups["year"], m.groups["month"], m.groups["day"]);
            },
        },
    ], token, order);
}
function shipping(token, order) {
    return executeParserSteps([
        {
            matches: CITY_STATE_ZIP_REGEX,
            handler(m) {
                order
                    .setShippingCity(m.groups.city)
                    .setShippingState(m.groups.state)
                    .setShippingZip(m.groups.zip);
            },
        },
        {
            matches: /Shipping Speed: Shipped on ((?<month>[A-Z][a-z]+) (?<day>\d+), (?<year>\d{4}))/,
            handler(m) {
                order.finalizeShipment().setShippingDate(m);
                return unknown;
            },
        },
        {
            matches: /Shipping Speed: (.+)/,
            handler: () => unknown,
        },
        {
            equals: "(Full address hidden for privacy.)",
            handler: () => {
                // Gift registry orders
                order.fullShippingAddressNotAvailable();
                return unknown;
            },
        },
        (token) => {
            order.setNextShippingAddressField(token);
        },
    ], token, order);
}
function unknown(token, order) {
    return executeParserSteps([
        {
            equals: "Items Ordered",
            handler: () => items,
        },
        {
            matches: /Amazon\.com order number: (\d+-\d+-\d+)/,
            handler(m) {
                order.setID(m[1]);
            },
        },
        {
            matches: /Placed By: (.+)/,
            handler(m) {
                order.setPlacedBy(m[1]);
            },
        },
        {
            matches: /Order Placed: (?<month>.+) (?<day>\d+), (?<year>\d{4})/,
            handler(m) {
                order.setDate(m.groups.year, m.groups.month, m.groups.day);
            },
        },
        {
            matches: /Order Total: (.+)/,
            handler(m) {
                order.setTotal(m[1]);
            },
        },
        {
            matches: /Item\(s\) Subtotal: (.+)/,
            handler(m) {
                order.setSubtotal(m[1]);
            },
        },
        {
            matches: /Shipping & Handling: (.+)/,
            handler(m) {
                order.setShippingCost(m[1]);
            },
        },
        {
            matches: /Estimated tax to be collected: (.+)/,
            handler(m) {
                order.setTax(m[1]);
            },
        },
        {
            matches: /Shipped on (?<month>.+) (?<day>\d+), (?<year>\d{4})/,
            handler(m) {
                order.finalizeShipment().setShippingDate(m);
            },
        },
        {
            equals: "Credit Card transactions",
            handler: () => payments,
        },
        {
            matches: /Gift Card Amount: -(.+)/,
            handler(m) {
                order
                    .addGiftCardPayment()
                    .setPaymentAmount(m[1])
                    .adjustTotalBasedOnGiftCard();
            },
        },
    ], token, order);
}
function pad(num, width) {
    let s = num.toString();
    while (s.length < width) {
        s = `0${s}`;
    }
    return s;
}
//# sourceMappingURL=invoice.js.map