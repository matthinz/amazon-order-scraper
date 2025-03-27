import assert from "node:assert";
import fs from "node:fs/promises";
import { before, describe, it } from "node:test";
import { parseInvoice } from "./invoice.ts";
import type { Order } from "./types.ts";

describe("Invoice from 1998", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-1998.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "1998-11-05");
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          items: [
            {
              name: "Brave New World, Aldous Huxley",
              price: "$8.00",
              priceCents: 800,
              quantity: 1,
            },
            {
              name: "The Stories of Ray Bradbury, Ray Bradbury",
              price: "$28.00",
              priceCents: 2800,
              quantity: 1,
            },
            {
              name: "Deadeye Dick, Kurt",
              price: "$5.59",
              priceCents: 559,
              quantity: 1,
            },
            {
              name: "Jailbird, Kurt Vonnegut",
              price: "$5.59",
              priceCents: 559,
              quantity: 1,
            },
            {
              name: "Mother Night, Kurt Vonnegut",
              price: "$5.59",
              priceCents: 559,
              quantity: 1,
            },
            {
              name: "Slapstick or Lonesome No More!, Kurt Vonnegut",
              price: "$5.59",
              priceCents: 559,
              quantity: 1,
            },
            {
              name: "Bluebeard, Kurt Vonnegut",
              price: "$5.59",
              priceCents: 559,
              quantity: 1,
            },
            {
              name: "Palm Sunday, Kurt Vonnegut",
              price: "$5.20",
              priceCents: 520,
              quantity: 1,
            },
            {
              name: "Catch-22, Joseph L. Heller",
              price: "$8.00",
              priceCents: 800,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Joey Joe Joe Junior Shabbadoo",
            address: "1234 Fake St",
            city: "Anytown",
            state: "WA",
            zip: "90001",
            country: "United States",
          },
        },
      ]);
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "002-7394758-9918293");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, "Joey Joe Joe Junior Shabbadoo");
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$11.55");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$77.15");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$7.63");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$96.33");
    });
  });
});

describe("Invoice from 2003", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2003.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "2003-12-07");
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "103-4829484-8238293");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          date: "2003-12-08",
          items: [
            {
              name: "Film Noir Reader, Alain Silver (Editor)",
              price: "$14.00",
              priceCents: 1400,
              quantity: 1,
            },
            {
              name: "Life Is Beautiful, Roberto Benigni (Actor)",
              price: "$16.99",
              priceCents: 1699,
              quantity: 1,
            },
            {
              name: "Linksys WUSB11 Wireless-B USB Network Adapter",
              price: "$44.99",
              priceCents: 4499,
              quantity: 1,
            },
          ],
          shippingAddress: {
            address: "1234 Fake Ave NE",
            city: "Anytown",
            country: "United States",
            name: "Joey Joe Joe Junior Shabbadoo",
            state: "WA",
            zip: "90001",
          },
        },
        {
          date: "2003-12-09",
          items: [
            {
              name: "My Best Girl, Sam Taylor (Director)",
              price: "$26.99",
              priceCents: 2699,
              quantity: 1,
            },
          ],
          shippingAddress: {
            address: "1234 Fake Ave NE",
            city: "Anytown",
            country: "United States",
            name: "Joey Joe Joe Junior Shabbadoo",
            state: "WA",
            zip: "90001",
          },
        },
      ]);
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$8.55");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$102.97");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$9.04");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$112.01");
    });
  });
});

describe("Invoice from 2005", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2005.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "2005-08-14");
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "103-1238478-9849839");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          date: "2005-08-15",
          items: [
            {
              name: "TiVo TCD540040 Series2 40-Hour Digital Video Recorder",
              price: "$94.04",
              priceCents: 9404,
              quantity: 1,
            },
          ],
          shippingAddress: {
            address: "123 Fake St Apt F",
            city: "Anytown",
            country: "United States",
            name: "Joey Joe Joe Junior Shabbadoo",
            state: "WA",
            zip: "90001-6134",
          },
        },
        {
          date: "2005-08-17",
          items: [
            {
              name: "Linksys USB200M EtherFast USB 2.0 10/100 Network Adapter",
              price: "$24.99",
              priceCents: 2499,
              quantity: 1,
            },
          ],
          shippingAddress: {
            address: "123 Fake St Apt F",
            city: "Anytown",
            country: "United States",
            name: "Joey Joe Joe Junior Shabbadoo",
            state: "WA",
            zip: "90001-6134",
          },
        },
      ]);
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$18.24");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$119.03");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$9.87");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$128.90");
    });
  });
});

describe("Invoice from 2012", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2012.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "2012-10-24");
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "002-7484749-0022994");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          date: "2012-10-26",
          items: [
            {
              name: "Hat",
              price: "$20.99",
              priceCents: 2099,
              quantity: 1,
            },
            {
              name: "Cuisinart DLC-001TX stainless steel blade.",
              price: "$26.75",
              priceCents: 2675,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Joey Joe Joe Junior Shabbadoo",
            address: "1234 Fake ST",
            city: "Anytown",
            state: "WASHINGTON",
            zip: "90001-3507",
            country: "United States",
          },
        },
      ]);
    });
  });

  describe("#payments", () => {
    it("works", () => {
      assert.deepStrictEqual(order.payments, []);
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$5.63");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$47.74");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$0.00");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$47.74");
    });
  });
});

describe("Invoice from 2012 (#2)", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2012-02.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "2012-05-22");
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "103-8833883-9922992");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          date: "2012-05-22",
          items: [
            {
              name: "BLACK Apple iPhone 3G 3Gs 8GB 16GB 32GB Textured Silicone Skin Case Cover",
              price: "$2.48",
              priceCents: 248,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Joey Joe Joe Junior Shabbadoo",
            address: "1234 Fake Ave NW",
            city: "Anytown",
            state: "Washington",
            zip: "90001",
            country: "United States",
          },
        },
      ]);
    });
  });

  describe("#payments", () => {
    it("works", () => {
      assert.deepStrictEqual(order.payments, []);
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$0.00");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$2.48");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$0.00");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$2.48");
    });
  });
});

describe("Invoice from 2013 (for registry)", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2013.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "2013-05-13");
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "105-0883344-9303847");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          date: "2013-05-14",
          items: [
            {
              name: "BBP Bags - Hybrid Hauler Medium Olive",
              price: "$49.99",
              priceCents: 4999,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Joey Joe Joe Junior Shabbadoo",
            address: "",
            city: "Anytown",
            state: "WA",
            zip: "",
            country: "",
          },
        },
      ]);
    });
  });

  describe("#payments", () => {
    it("works", () => {
      assert.deepStrictEqual(order.payments, []);
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$9.62");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$49.99");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$0.00");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$59.61");
    });
  });
});

describe("Invoice from 2017 (with gift card)", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2017-gift-card.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "2017-01-04");
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "107-9993388-1117733");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          date: "2017-01-04",
          items: [
            {
              name: "AmazonBasics AAA Performance Alkaline Batteries (20-Pack) - Packaging May Vary",
              price: "$7.99",
              priceCents: 799,
              quantity: 1,
            },
            {
              name: "AmazonBasics AA Performance Alkaline Batteries (20-Pack) - Packaging May Vary",
              price: "$8.99",
              priceCents: 899,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Joey Joe Joe Junior Shabbadoo",
            address: "1234 Fake ST",
            city: "Anytown",
            state: "WA",
            zip: "90001-1725",
            country: "United States",
          },
        },
      ]);
    });
  });

  describe("#payments", () => {
    it("works", () => {
      assert.deepStrictEqual(order.payments, [
        {
          amount: "$18.46",
          amountCents: 1846,
          date: "2017-01-04",
          type: "gift_card",
        },
      ]);
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$0.00");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$16.98");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$1.48");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$18.46");
    });
  });
});

describe("Invoice from 2024", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2024.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "2024-10-27");
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "103-9483948-3434343");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          date: "2024-10-28",
          items: [
            {
              name: "HP 206X Black High-yield Toner Cartridge | Works with HP Color LaserJet Pro M255, HP Color LaserJet Pro MFP M282, M283 Series | W2110X, Pack of 1, Black",
              price: "$109.89",
              priceCents: 10989,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Joey Joe Joe Junior Shabbadoo",
            address: "1234 Fake ST",
            city: "Anytown",
            state: "WA",
            zip: "90001-1510",
            country: "United States",
          },
        },
      ]);
    });
  });

  describe("#payments", () => {
    it("works", () => {
      assert.deepStrictEqual(order.payments, [
        {
          type: "credit_card",
          date: "2024-10-28",
          amount: "$119.78",
          amountCents: 11978,
          cardType: "Visa",
          last4: "1234",
        },
      ]);
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$0.00");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$109.89");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$9.89");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$119.78");
    });
  });
});

describe("Invoice from 2025", async () => {
  let order: Order;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2025.html",
      "utf-8",
    );
    order = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(order?.date, "2025-03-22");
    });
  });

  describe("#id", () => {
    it("works", () => {
      assert.strictEqual(order.id, "113-3999009-00112299");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(order.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(order?.shipments, [
        {
          items: [
            {
              name: "ALTOIDS Arctic Strawberry Breath Mints Hard Candy Bulk, 1.2 oz Tin (Pack of 8)",
              price: "$23.92",
              priceCents: 2392,
              quantity: 1,
            },
          ],
          shippingAddress: {
            name: "Joey Joe Joe Junior Shabbadoo",
            address: "1234 Fake ST",
            city: "Anytown",
            state: "WA",
            zip: "90001-1510",
            country: "United States",
          },
        },
      ]);
    });
  });

  describe("#payments", () => {
    it("works", () => {
      // Order hasn't shipped, thus no payments
      assert.deepStrictEqual(order.payments, []);
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(order.shippingCost, "$0.00");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(order.subtotal, "$23.92");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(order.tax, "$0.00");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(order.total, "$23.92");
    });
  });
});
