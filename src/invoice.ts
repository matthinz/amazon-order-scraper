import { OrderBuilder } from "./order-builder.ts";
import { getContentChunks } from "./parsing.ts";
import type { Order } from "./types.ts";

const CITY_STATE_ZIP_REGEX =
  /^(?<city>.+), (?<state>[A-Z]{2}) (?<zip>(\d{5})(-\d{4})?)$/;

const NOOP = () => {};

type ParserHandler = (
  token: string,
  order: OrderBuilder
) => void | ParserHandler;

type ParserStep =
  | {
      matches: RegExp;
      handler: (
        m: RegExpMatchArray,
        order: OrderBuilder
      ) => ParserHandler | void;
    }
  | {
      equals: string;
      handler: (value: string, order: OrderBuilder) => ParserHandler | void;
    }
  | ((token: string, order: OrderBuilder) => ParserHandler | void);

export function parseInvoice(
  html: string,
  log: (...args: unknown[]) => void = NOOP
): Order {
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

function executeParserSteps(
  steps: ParserStep[],
  token: string,
  order: OrderBuilder
): ParserHandler | void {
  for (const step of steps) {
    if (typeof step === "function") {
      return step(token, order);
    } else if ("equals" in step) {
      if (token === step.equals) {
        return step.handler(token, order);
      }
    } else if ("matches" in step) {
      const m = step.matches.exec(token);
      if (m) {
        return step.handler(m, order);
      }
    } else {
      throw new Error("Invalid step");
    }
  }
}

function item(token: string, order: OrderBuilder) {
  return (
    executeParserSteps(
      [
        {
          matches: /^.?[\d\.,]+$/,
          handler: () => {
            order.setItemPrice(token).finalizeItem();
          },
        },
      ],
      token,
      order
    ) ?? items(token, order)
  );
}

function items(token: string, order: OrderBuilder) {
  return executeParserSteps(
    [
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
    ],
    token,
    order
  );
}

function payments(token: string, order: OrderBuilder) {
  return executeParserSteps(
    [
      {
        matches:
          /(?<cardType>.+) ending in (?<last4>\d+): (?<month>.+) (?<day>\d+), (?<year>\d{4}): (?<amount>.+)/,
        handler(m) {
          order
            .addCreditCardPayment(m.groups["cardType"], m.groups["last4"])
            .setPaymentAmount(m.groups["amount"])
            .setPaymentDate(
              m.groups["year"],
              m.groups["month"],
              m.groups["day"]
            );
        },
      },
    ],
    token,
    order
  );
}

function shipping(token: string, order: OrderBuilder) {
  return executeParserSteps(
    [
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
        matches:
          /Shipping Speed: Shipped on ((?<month>[A-Z][a-z]+) (?<day>\d+), (?<year>\d{4}))/,
        handler(m) {
          order.finalizeShipment().setShippingDate(m);
          return unknown;
        },
      },
      {
        matches: /Shipping Speed: (.+)/,
        handler: () => unknown,
      },
      (token) => {
        order.setNextShippingAddressField(token);
      },
    ],
    token,
    order
  );
}

function unknown(token: string, order: OrderBuilder) {
  return executeParserSteps(
    [
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
    ],
    token,
    order
  );
}

function pad(num: number, width: number): string {
  let s = num.toString();
  while (s.length < width) {
    s = `0${s}`;
  }
  return s;
}
