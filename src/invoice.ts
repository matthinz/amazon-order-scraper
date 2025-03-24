import { getContentChunks } from "./parsing.ts";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",

  "September",
  "October",
  "November",
  "December",
];

const CITY_STATE_ZIP_REGEX = /^(.+), ([A-Z]{2}) ((\d{5})(-\d{4})?)$/;

const NOOP = () => {};

export type Item = {
  name?: string;
  price?: string;
  quantity?: number;
};

export type Payment = {
  type: string;
  last4: string;
  date: string;
  amount: string;
};

export type ShippingAddress = {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
};

export type Shipment = {
  date?: string;
  shippingAddress?: ShippingAddress;
  items: Item[];
};

export type Invoice = {
  orderID?: string;
  date?: string;
  payments: Payment[];
  placedBy?: string;
  shippingCost?: string;
  subtotal?: string;
  tax?: string;
  total?: string;
  shipments: Shipment[];
};

type ParserHandler = (chunk: string, invoice: Invoice) => void | ParserHandler;

type ParserStep =
  | {
      matches: RegExp;
      handler: (m: RegExpMatchArray, invoice: Invoice) => ParserHandler | void;
    }
  | {
      equals: string;
      handler: (value: string, invoice: Invoice) => ParserHandler | void;
    }
  | ((chunk: string, invoice: Invoice) => ParserHandler | void);

export function parseInvoice(
  html: string,
  log: (...args: unknown[]) => void = NOOP
): Invoice {
  const invoice: Invoice = {
    payments: [],
    shipments: [],
  };

  let handler = unknown;

  getContentChunks(html).forEach((chunk) => {
    log(`${handler.name}: ${chunk}`);

    const result = handler(chunk, invoice);
    if (typeof result === "function") {
      handler = result;
      log(`  -> ${handler.name}`);
    }
  });

  return invoice as Invoice;
}

function executeParserSteps(
  steps: ParserStep[],
  chunk: string,
  invoice: Invoice
): ParserHandler | void {
  for (const step of steps) {
    if (typeof step === "function") {
      return step(chunk, invoice);
    } else if ("equals" in step) {
      if (chunk === step.equals) {
        return step.handler(chunk, invoice);
      }
    } else if ("matches" in step) {
      const m = step.matches.exec(chunk);
      if (m) {
        return step.handler(m, invoice);
      }
    } else {
      throw new Error("Invalid step");
    }
  }
}

function item(chunk: string, invoice: Invoice) {
  return (
    executeParserSteps(
      [
        {
          matches: /^.?[\d\.,]+$/,
          handler: () => {
            currentItem(invoice).price = chunk;
          },
        },
      ],
      chunk,
      invoice
    ) ?? items(chunk, invoice)
  );
}

function items(chunk: string, invoice: Invoice) {
  return executeParserSteps(
    [
      {
        matches: /Shipping Address: (.+)/,
        handler(m) {
          currentShipment(invoice).shippingAddress = {
            name: m[1],
          } as ShippingAddress;

          return shipping;
        },
      },
      {
        matches: /^(\d+) of: (.+)/,
        handler(m) {
          currentShipment(invoice).items.push({
            name: m[2],
            price: "",
            quantity: parseInt(m[1], 10),
          });
          return item;
        },
      },
    ],
    chunk,
    invoice
  );
}

function payments(chunk: string, invoice: Invoice) {
  return executeParserSteps(
    [
      {
        matches: /(.+) ending in (\d+): (.+) (\d+), (\d{4}): (.+)/,
        handler(m) {
          invoice.payments.push({
            type: m[1],
            last4: m[2],
            amount: m[6],
            date: makeDate(m[5], m[3], m[4]),
          });
        },
      },
    ],
    chunk,
    invoice
  );
}

function shipping(chunk: string, invoice: Invoice) {
  return executeParserSteps(
    [
      {
        matches: CITY_STATE_ZIP_REGEX,
        handler(m) {
          const shipment = currentShipment(invoice);
          const addr = (shipment.shippingAddress =
            shipment.shippingAddress ?? {});
          Object.assign(addr, {
            city: m[1],
            state: m[2],
            zip: m[3],
          });
        },
      },
      {
        matches: /Shipping Speed: Shipped on (([A-Z][a-z]+) (\d+), (\d{4}))/,
        handler(m) {
          const shipment: Shipment = {
            date: makeDate(m[4], m[2], m[3]),
            items: [],
          };
          invoice.shipments.push(shipment);
          return unknown;
        },
      },
      {
        equals: "Shipping Speed: Payment information",
        handler: () => unknown,
      },
      {
        matches: /Shipping Speed: (.+)/,
        handler: () => unknown,
      },
      (chunk, invoice) => {
        const fields = [
          "address",
          "city",
          "state",
          "zip",
          "country",
        ] as (keyof ShippingAddress)[];

        const shipment = currentShipment(invoice);
        const { shippingAddress } = shipment;

        if (!shippingAddress) {
          throw new Error("No shipping address");
        }

        for (const field of fields) {
          if (shippingAddress[field] == null) {
            shippingAddress[field] = chunk;
            return;
          }
        }

        throw new Error(`Unexpected shipping chunk: ${chunk}`);
      },
    ],
    chunk,
    invoice
  );
}

function unknown(chunk: string, invoice: Invoice) {
  return executeParserSteps(
    [
      {
        equals: "Items Ordered",
        handler: () => items,
      },
      {
        matches: /Amazon\.com order number: (\d+-\d+-\d+)/,
        handler(m) {
          invoice.orderID = m[1];
        },
      },
      {
        matches: /Placed By: (.+)/,
        handler(m) {
          invoice.placedBy = m[1];
        },
      },
      {
        matches: /Order Placed: (.+) (\d+), (\d{4})/,
        handler(m) {
          invoice.date = makeDate(m[3], m[1], m[2]);
        },
      },

      {
        matches: /Order Total: (.+)/,
        handler(m) {
          invoice.total = m[1];
        },
      },
      {
        matches: /Item\(s\) Subtotal: (.+)/,
        handler(m) {
          invoice.subtotal = m[1];
        },
      },
      {
        matches: /Shipping & Handling: (.+)/,
        handler(m) {
          invoice.shippingCost = m[1];
        },
      },
      {
        matches: /Estimated tax to be collected: (.+)/,
        handler(m) {
          invoice.tax = m[1];
        },
      },
      {
        matches: /Shipped on (.+) (\d+), (\d{4})/,
        handler(m) {
          invoice.shipments.push({
            date: makeDate(m[3], m[1], m[2]),
            items: [],
          });
        },
      },
      {
        equals: "Credit Card transactions",
        handler: () => payments,
      },
    ],
    chunk,
    invoice
  );
}

function currentItem(invoice: Invoice): Item {
  const shipment = currentShipment(invoice);
  if (shipment.items.length === 0) {
    shipment.items.push({});
  }
  return shipment.items[shipment.items.length - 1];
}

function currentShipment(invoice: Invoice): Shipment {
  if (invoice.shipments.length === 0) {
    invoice.shipments.push({
      items: [],
    });
  }
  return invoice.shipments[invoice.shipments.length - 1];
}

function makeDate(year: string, month: string, day: string): string {
  const yearAsNumber = parseInt(year, 10);
  let monthAsNumber = parseInt(month, 10);

  if (isNaN(monthAsNumber)) {
    monthAsNumber = MONTHS.indexOf(month) + 1;
  }

  const dayAsNumber = parseInt(day, 10);

  return [yearAsNumber, pad(monthAsNumber, 2), pad(dayAsNumber, 2)].join("-");
}

function pad(num: number, width: number): string {
  let s = num.toString();
  while (s.length < width) {
    s = `0${s}`;
  }
  return s;
}
