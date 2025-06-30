import { OrderBuilder } from "./order-builder.js";
import { getContentChunks } from "./parsing.js";
const CITY_STATE_ZIP_REGEX = /^(?<city>.+), (?<state>[A-Za-z]+) (?<zip>(\d{5})(-\d{4})?)$/;
const MONEY_REGEX = /^(?<currency>[$€£])?(?<amount>[\d,.]+)$/;
const NOOP = () => { };
export function parseInvoice(html, log = NOOP) {
    const builder = new OrderBuilder();
    let handler = unknown;
    getContentChunks(html).forEach((token) => {
        log(`${handler.name}: ${token}`);
        const result = handler(token, builder);
        if (typeof result === "function" && result !== handler) {
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
            equals: "Shipping Address: Shipping Speed: Payment information", // Nothing was shipped, e.g. I went to Whole Foods
            handler() {
                order.nothingWillBeShipped();
                return unknown;
            },
        },
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
        {
            equals: "Payment method",
            handler: () => unknown,
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
            equals: "Shipping now",
            handler() {
                order.finalizeShipment();
                return unknown;
            },
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
            matches: /^Order placed$/,
            handler: () => function orderPlaced(token, order) {
                return executeParserSteps([
                    {
                        matches: /^([a-z]+) (\d{1,2}), (\d{4})$/i,
                        handler(m) {
                            order.setDate(m[3], m[1], m[2]);
                            return unknown;
                        },
                    },
                ], token, order);
            },
        },
        {
            matches: /^Order #: (\d{3}-\d{7}-\d{7})/,
            handler(m) {
                order.setID(m[1]);
                return unknown;
            },
        },
        {
            matches: /^Purchased [a-z]+, ([a-z]+) (\d+), (\d{4})$/i,
            handler(m) {
                order.setDate(m[3], m[1], m[2]);
                return unknown;
            },
        },
        {
            matches: /(?:Order|Grand) Total: (.+)/,
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
        {
            equals: "Ship to",
            handler: () => shipping,
        },
        {
            equals: "Arriving tomorrow",
            handler: () => function arrivingTomorrow(token, order) {
                return executeParserSteps([
                    {
                        matches: /.+/,
                        handler(m) {
                            order.setItemName(m[0]);
                            order.setItemQuantity(1);
                            return function price(token, order) {
                                const m = MONEY_REGEX.exec(token);
                                if (m) {
                                    const priceToken = m[0];
                                    order.setItemPrice(m[0]);
                                    order.finalizeItem();
                                    return function consumeDuplicatePriceToken(token, order) {
                                        if (token === priceToken) {
                                            return unknown;
                                        }
                                        return unknown(token, order);
                                    };
                                }
                            };
                        },
                    },
                ], token, order);
            },
        },
        {
            equals: "Items in your order",
            handler: () => function groceryItems(token, order) {
                order.nothingWillBeShipped();
                return executeParserSteps([
                    {
                        matches: /(\$[\d,\.]+) each$/,
                        handler() { },
                    },
                    {
                        matches: MONEY_REGEX,
                        handler(moneyMatch, order) {
                            return function groceryItemPrice(token, order) {
                                const m = /Qty: (\d+)/.exec(token);
                                if (m) {
                                    const quantity = parseInt(m[1], 10);
                                    order
                                        .setItemPrice(moneyMatch[0], quantity)
                                        .finalizeItem();
                                    return groceryItems;
                                }
                            };
                        },
                    },
                    {
                        equals: "@",
                        handler() { },
                    },
                    {
                        equals: "View all items",
                        handler: () => unknown,
                    },
                    {
                        matches: /(.+)/,
                        handler(m) {
                            order.setItemName(m[1]);
                        },
                    },
                ], token, order);
            },
        },
        {
            equals: "Item Subtotal",
            handler: () => function groceryItemSubtotal(token, order) {
                return executeParserSteps([
                    {
                        matches: MONEY_REGEX,
                        handler(m) {
                            order.setSubtotal(m[0]);
                            return unknown;
                        },
                    },
                ], token, order);
            },
        },
        {
            equals: "Total Savings",
            handler: () => function groceryTotalSavings(token, order) {
                // TODO
                return unknown;
            },
        },
        {
            equals: "Tax and Fees",
            handler: () => function groceryTaxAndFees(token, order) {
                const m = MONEY_REGEX.exec(token);
                if (m) {
                    order.setTax(m[0]);
                }
                return unknown;
            },
        },
        {
            equals: "Bag Fee",
            handler: () => function groceryBagFee(token, order) {
                const m = MONEY_REGEX.exec(token);
                if (m) {
                    order
                        .setItemName("Bag Fee")
                        .setItemQuantity(1)
                        .setItemPrice(m[0])
                        .finalizeItem();
                }
                return unknown;
            },
        },
        {
            equals: "Grand Total",
            handler: () => function groceryGrandTotal(token, order) {
                const m = MONEY_REGEX.exec(token);
                if (m) {
                    order.setTotal(m[0]);
                }
                return unknown;
            },
        },
        {
            equals: "Payment Methods",
            handler: () => function groceryPaymentMethods(token, order) {
                return executeParserSteps([
                    {
                        equals: "Cash",
                        handler: () => {
                            order.addCashPayment();
                            return groceryPaymentMethods;
                        },
                    },
                    {
                        matches: /^(Visa|MasterCard|American Express|Discover)$/,
                        handler: function groceryCreditCardPayment(creditCardTypeMatch, order) {
                            return function groceryCreditCardNumber(ccNumberToken, order) {
                                if (/^\*\d{4}$/.test(ccNumberToken)) {
                                    order.addCreditCardPayment(creditCardTypeMatch[1], ccNumberToken.substring(1));
                                    return groceryPaymentMethods;
                                }
                            };
                        },
                    },
                    {
                        matches: MONEY_REGEX,
                        handler(m) {
                            order.setPaymentAmount(m[0]);
                            return groceryPaymentMethods;
                        },
                    },
                    {
                        equals: "How was your trip?",
                        handler: () => unknown,
                    },
                ], token, order);
            },
        },
    ], token, order);
}
//# sourceMappingURL=invoice.js.map