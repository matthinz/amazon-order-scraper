import { formatMonetaryAmount, parseMonetaryAmount } from "../money.js";
import { OrderBuilder } from "../order-builder.js";
import { getContentChunks } from "./html.js";
import { createParser, newParserState, skipNextToken } from "./parser.js";
import { AMAZON_ORDER_ID_PATTERN, CREDIT_CARD_NAME_PATTERN, DATE_MMMM_DD_PATTERN, DATE_MMMM_DD_YYYY_PATTERN, MONEY_PATTERN, } from "./patterns.js";
export const parseInvoiceHTML = (html, options) => {
    const tokens = getContentChunks(html);
    const orderBuilder = new OrderBuilder(options);
    parseInvoiceTokens(tokens, orderBuilder, options);
    return orderBuilder.build();
};
export const unknown = newParserState("unknown", {
    equals: "Brief content visible, double tap to read full content.",
    process: () => unknownV2,
}, {
    equals: "Purchased at Whole Foods Market store",
    process: (_, order) => {
        order.nothingWillBeShipped();
        return groceries;
    },
}, {
    matches: `Amazon.com - Order (${AMAZON_ORDER_ID_PATTERN})`,
    process: ([token], order, options) => {
        return onlineOrder(token, order, options);
    },
});
export const unknownV2 = newParserState("unknown_v2", {
    matches: DATE_MMMM_DD_YYYY_PATTERN,
    process: ({ groups: { month, day, year } }, order) => {
        order.setDate(year, month, day);
        return true;
    },
}, {
    matches: `^${AMAZON_ORDER_ID_PATTERN}$`,
    process: ([id], order) => {
        order.setID(id);
        return true;
    },
}, {
    equals: "Ship to",
    process: () => onlineOrderShipping,
});
export const onlineOrder = newParserState("online_order", {
    matches: /\d{3}-\d{7}-\d{7}/,
    process([id], order) {
        order.setID(id);
        return true;
    },
}, {
    matches: `Order Total: (${MONEY_PATTERN})`,
    process: ([_, total], order) => {
        order.setTotal(total);
        return true;
    },
}, {
    matches: `^Placed By: (.+)$`,
    process: ([_, name], order) => {
        order.setPlacedBy(name);
        return true;
    },
}, {
    matches: `Order Placed: (${DATE_MMMM_DD_YYYY_PATTERN})`,
    process: ({ groups: { month, day, year } }, order) => {
        order.setDate(year, month, day);
        return true;
    },
}, {
    matches: `(?:Shipping Speed: )?Shipped on (${DATE_MMMM_DD_YYYY_PATTERN})`,
    process: ({ groups: { month, day, year } }, order) => {
        order.finalizeShipment().setShippingDate(year, month, day);
        return true;
    },
}, {
    matches: "^(Not Yet Shipped|Shipping now)$",
    process: (_, order) => {
        order.finalizeShipment();
        return true;
    },
}, {
    equals: "Items Ordered",
    process: () => onlineOrderItems,
}, {
    matches: "^Return started$",
    process: () => onlineOrderItemsV2ReturnStarted,
}, {
    matches: "^(Delivered|Arriving tomorrow)$",
    process: () => onlineOrderItemsV2,
}, {
    matches: `^Item\\(s\\) Subtotal: (${MONEY_PATTERN})`,
    process: ([_, subtotal], order) => {
        order.setSubtotal(subtotal);
        return true;
    },
}, {
    equals: "Billing address",
    process: () => onlineOrderBilling,
}, {
    matches: `^Item\\(s\\) Subtotal: (${MONEY_PATTERN})$`,
    process: ([_, subtotal], order) => {
        order.setSubtotal(subtotal);
        return true;
    },
}, {
    matches: `^Shipping & Handling: (${MONEY_PATTERN})`,
    process: ([_, shipping], order) => {
        order.setShippingCost(shipping);
        return true;
    },
}, {
    equals: "Payment information",
    process: () => onlineOrderPayment,
}, {
    matches: `^Estimated tax to be collected: (${MONEY_PATTERN})`,
    process: ([_, tax], order) => {
        order.setTax(tax);
        return true;
    },
}, {
    matches: `^Gift Card Amount: -(${MONEY_PATTERN})`,
    process: ([_, giftCardAmount], order) => {
        order
            .addGiftCardPayment()
            .setPaymentAmount(giftCardAmount)
            .adjustTotalBasedOnGiftCard();
        return true;
    },
}, {
    matches: `^Grand Total: (${MONEY_PATTERN})`,
    process: ([_, total], order) => {
        order.setTotal(total);
        return true;
    },
}, {
    equals: "Credit Card transactions",
    process: (_, order, options) => {
        // It's possible that we've already decided to infer payment information,
        // but this invoice has lots of detail for us--let's use it.
        order.resetPaymentInformation();
        return onlineOrderPayment;
    },
});
export const onlineOrderItems = newParserState("online_order_items", {
    matches: `^(\\d+) of: (.+)$`,
    process: ([_, quantity, itemName], order) => {
        order.setItemName(itemName).setItemQuantity(quantity);
        return true;
    },
}, {
    matches: `^${MONEY_PATTERN}$`,
    process: ([price], order) => {
        order.setItemPrice(price).finalizeItem();
        return true;
    },
}, {
    equals: "Shipping Address: Shipping Speed: Payment information",
    process: (_, order) => {
        order.nothingWillBeShipped();
        return onlineOrder;
    },
}, {
    matches: "^Shipping Address: (.+)",
    process: ([_, name], order) => {
        order.setShippingAddressName(name);
        return onlineOrderShipping;
    },
});
export const onlineOrderItemsV2 = newParserState("online_order_items_v2", {
    equals: "Your package was left near the front door or porch.",
    process: () => true,
}, {
    matches: `^${DATE_MMMM_DD_PATTERN}$`,
    process: () => true,
}, {
    matches: /^\d+$/,
    process: ([quantity], order) => {
        order.setItemQuantity(quantity);
        return true;
    },
}, {
    matches: "^Sold by: (.+)$",
    process: () => true,
}, {
    matches: "^Supplied by: (.+)$",
    process: () => true,
}, {
    matches: /^Auto-delivered:/,
    process: () => true,
}, {
    matches: "^Return (or replace )?items:",
    process: () => true,
}, {
    equals: "Back to top",
    process: () => onlineOrder,
}, {
    matches: `^(${MONEY_PATTERN})$`,
    process: ([price], order) => {
        order.assumeItemQuantity(1).setItemPrice(price).finalizeItem();
        return skipNextToken(onlineOrderItemsV2);
    },
}, {
    matches: /.+/,
    process: ([itemName], order) => {
        order.setItemName(itemName);
        return true;
    },
});
export const onlineOrderItemsV2ReturnStarted = newParserState("online_order_items_v2_return_started", {
    equals: "Your refund will be processed when we receive your item.",
    process: () => true,
}, {
    matches: "^(Sold by|Supplied by):",
    process: () => true,
}, {
    equals: "Delivered",
    process: () => onlineOrderItemsV2,
}, {
    equals: "Payment method",
    process: () => onlineOrderPayment,
}, {
    matches: `^(${MONEY_PATTERN})$`,
    process: ([amount], order) => {
        // TODO: quantity is not present?
        order.assumeItemQuantity(1).setItemPrice(amount).finalizeItem();
        return skipNextToken(onlineOrderItemsV2ReturnStarted);
    },
}, {
    matches: ".+",
    process: ([itemName], order) => {
        order.setItemName(itemName);
        return true;
    },
});
export const onlineOrderShipping = newParserState("online_order_shipping", {
    matches: `Shipping Speed: Shipped on (${DATE_MMMM_DD_YYYY_PATTERN})`,
    process: ({ groups: { month, day, year } }, order) => {
        order.finalizeShipment().setShippingDate(year, month, day);
        return onlineOrder;
    },
}, {
    matches: "^Shipping Speed: ",
    process: () => onlineOrder,
}, {
    equals: "Payment information",
    process: () => onlineOrder,
}, {
    equals: "Payment method",
    process: () => onlineOrderPayment,
}, {
    equals: "(Full address hidden for privacy.)",
    process: (_, order) => {
        // Gift registry orders
        order.fullShippingAddressNotAvailable();
        return onlineOrder;
    },
}, {
    matches: `^(?<city>.+), (?<state>[A-Z]+) (?<zip>\\d{5}(?:-\\d{4})?)$`,
    process: ({ groups: { city, state, zip } }, order) => {
        order.setShippingCity(city).setShippingState(state).setShippingZip(zip);
        return true;
    },
}, {
    matches: `.+`,
    process: ([token], order) => {
        order.setNextShippingAddressField(token);
        return true;
    },
});
const onlineOrderPayment = newParserState("online_order_payment", {
    matches: `^(?<ccName>${CREDIT_CARD_NAME_PATTERN}) ending in (?<lastFour>\\d{4}): ${DATE_MMMM_DD_YYYY_PATTERN}: (?<paymentAmount>${MONEY_PATTERN})$`,
    process: ({ groups: { ccName, lastFour, month, day, year, paymentAmount }, }, order) => {
        order
            .addCreditCardPayment(ccName, lastFour)
            .setPaymentAmount(paymentAmount)
            .setPaymentDate(year, month, day);
        return true;
    },
}, {
    matches: `^(${CREDIT_CARD_NAME_PATTERN})$`,
    process: ([ccName], order) => {
        return newParserState("looking_for_ending_in", {
            matches: `^ending in (\\d{4})$`,
            process: ([_, lastFour], order, options) => {
                order
                    .addCreditCardPayment(ccName, lastFour)
                    .assumePaymentCoversFullAmount();
                return onlineOrder;
            },
        }, {
            matches: ".+",
            process: onlineOrder,
        });
    },
}, {
    matches: `^Payment Method: (${CREDIT_CARD_NAME_PATTERN})$`,
    process: ([_, ccName], order) => {
        return newParserState("looking_for_ending_in", {
            matches: `^ending in (\\d{4})$`,
            process: ([_, lastFour], order, options) => {
                order
                    .addCreditCardPayment(ccName, lastFour)
                    .assumePaymentCoversFullAmount();
                return onlineOrder;
            },
        }, {
            matches: ".+",
            process: onlineOrder,
        });
    },
}, {
    equals: "Amazon gift card balance",
    process: (_, order) => {
        return true;
    },
}, {
    equals: "Billing address",
    process: () => onlineOrderBilling,
});
export const onlineOrderBilling = newParserState("online_order_billing", {
    matches: `^Item\\(s\\) Subtotal: (${MONEY_PATTERN})`,
    process: ([token], order, options) => onlineOrder(token, order, options),
}, {
    matches: ".+",
    process: ([token], order) => {
        return true;
    },
});
export const groceries = newParserState("groceries", {
    equals: "Items in your order",
    process: () => groceryItems,
}, {
    matches: `^Purchased [a-z]+, ${DATE_MMMM_DD_YYYY_PATTERN}$`,
    process: ({ groups: { month, day, year } }, order) => {
        order.setDate(year, month, day);
        return groceries;
    },
}, {
    matches: `^Order #: (${AMAZON_ORDER_ID_PATTERN})$`,
    process: ([_, id], order) => {
        order.setID(id);
        return groceries;
    },
}, {
    equals: "Grand Total",
    process: () => newParserState("looking_for_grocery_total", {
        matches: `^(${MONEY_PATTERN})$`,
        process: ([total], order) => {
            order.setTotal(total);
            return groceries;
        },
    }),
}, {
    equals: "Payment Methods",
    process: () => groceryPayments,
}, {
    equals: "Item Subtotal",
    process: () => newParserState("looking_for_grocery_subtotal", {
        matches: `^(${MONEY_PATTERN})$`,
        process: ([subtotal]) => newParserState("looking_for_grocery_total_savings_label", {
            equals: "Total Savings",
            process: () => newParserState("looking_for_grocery_total_savings", {
                matches: `^(${MONEY_PATTERN})$`,
                process: ([savings], order) => {
                    const { currency, cents: subtotalCents } = parseMonetaryAmount(subtotal);
                    const { cents: savingsCents } = parseMonetaryAmount(savings);
                    order.setSubtotal(formatMonetaryAmount({
                        currency,
                        cents: subtotalCents + savingsCents,
                    }));
                    return groceries;
                },
            }),
        }),
    }),
}, {
    equals: "Tax and Fees",
    process: () => newParserState("looking_for_grocery_tax", {
        matches: `^(${MONEY_PATTERN})$`,
        process: ([tax], order) => {
            order.setTax(tax);
            return groceries;
        },
    }),
});
export const groceryPayments = newParserState("grocery_payments", {
    equals: "Cash",
    process: () => newParserState("looking_for_grocery_cash", {
        matches: `^(${MONEY_PATTERN})$`,
        process: ([cashAmount], order) => {
            order.addCashPayment().setPaymentAmount(cashAmount);
            return groceryPayments;
        },
    }),
}, {
    matches: CREDIT_CARD_NAME_PATTERN,
    process: ([ccName]) => {
        return newParserState("looking_for_grocery_cc", {
            matches: `^\\*(\\d{4})$`,
            process: ([_, lastFour]) => newParserState("looking_for_grocery_cc_amount", {
                matches: `^(${MONEY_PATTERN})$`,
                process: ([amount], order) => {
                    order
                        .addCreditCardPayment(ccName, lastFour)
                        .setPaymentAmount(amount);
                    return groceryPayments;
                },
            }),
        });
    },
}, {
    equals: "How was your trip?",
    process: () => groceries,
});
export const groceryItems = newParserState("grocery_items", {
    matches: `^(${MONEY_PATTERN})$`,
    process: ([itemSubtotal], order) => {
        return newParserState("looking_for_grocery_qty", {
            matches: `^Qty: (\\d+)$`,
            process: ([_, quantity], order) => {
                order.setItemPrice(itemSubtotal, quantity).finalizeItem();
                return groceryItems;
            },
        });
    },
}, {
    equals: "View all items",
    process: () => groceries,
}, {
    matches: `^(${MONEY_PATTERN}) each$`,
    process: ([price], order) => {
        return true;
    },
}, {
    matches: `^(${MONEY_PATTERN}) promotions applied$`,
    process: ([price], order) => {
        return true;
    },
}, {
    equals: "@",
    process: () => groceryItems,
}, {
    matches: `^(.+)$`,
    process: ([itemName], order) => {
        order.setItemName(itemName);
        return groceryItems;
    },
});
export const parseInvoiceTokens = createParser(unknown);
//# sourceMappingURL=main.js.map