import { before, describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import { type Invoice, parseInvoice } from "./invoice.ts";

describe("Invoice from 1998", async () => {
  let invoice: Invoice;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-1998.html",
      "utf-8"
    );
    invoice = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(invoice?.date, "1998-11-05");
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(invoice?.shipments, [
        {
          items: [
            {
              name: "Brave New World, Aldous Huxley",
              price: "$8.00",
              quantity: 1,
            },
            {
              name: "The Stories of Ray Bradbury, Ray Bradbury",
              price: "$28.00",
              quantity: 1,
            },
            {
              name: "Deadeye Dick, Kurt",
              price: "$5.59",
              quantity: 1,
            },
            {
              name: "Jailbird, Kurt Vonnegut",
              price: "$5.59",
              quantity: 1,
            },
            {
              name: "Mother Night, Kurt Vonnegut",
              price: "$5.59",
              quantity: 1,
            },
            {
              name: "Slapstick or Lonesome No More!, Kurt Vonnegut",
              price: "$5.59",
              quantity: 1,
            },
            {
              name: "Bluebeard, Kurt Vonnegut",
              price: "$5.59",
              quantity: 1,
            },
            {
              name: "Palm Sunday, Kurt Vonnegut",
              price: "$5.20",
              quantity: 1,
            },
            {
              name: "Catch-22, Joseph L. Heller",
              price: "$8.00",
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

  describe("#orderID", () => {
    it("works", () => {
      assert.strictEqual(invoice.orderID, "002-7394758-9918293");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(invoice.placedBy, "Joey Joe Joe Junior Shabbadoo");
    });
  });

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(invoice.shippingCost, "$11.55");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(invoice.subtotal, "$77.15");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(invoice.tax, "$7.63");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(invoice.total, "$96.33");
    });
  });
});

describe("Invoice from 2003", async () => {
  let invoice: Invoice;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2003.html",
      "utf-8"
    );
    invoice = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(invoice?.date, "2003-12-07");
    });
  });

  describe("#orderID", () => {
    it("works", () => {
      assert.strictEqual(invoice.orderID, "103-4829484-8238293");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(invoice.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(invoice?.shipments, [
        {
          date: "2003-12-08",
          items: [
            {
              name: "Film Noir Reader, Alain Silver (Editor)",
              price: "$14.00",
              quantity: 1,
            },
            {
              name: "Life Is Beautiful, Roberto Benigni (Actor)",
              price: "$16.99",
              quantity: 1,
            },
            {
              name: "Linksys WUSB11 Wireless-B USB Network Adapter",
              price: "$44.99",
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
      assert.strictEqual(invoice.shippingCost, "$8.55");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(invoice.subtotal, "$102.97");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(invoice.tax, "$9.04");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(invoice.total, "$112.01");
    });
  });
});

describe("Invoice from 2005", async () => {
  let invoice: Invoice;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2005.html",
      "utf-8"
    );
    invoice = parseInvoice(fixtureHTML);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(invoice?.date, "2005-08-14");
    });
  });

  describe("#orderID", () => {
    it("works", () => {
      assert.strictEqual(invoice.orderID, "103-1238478-9849839");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(invoice.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(invoice?.shipments, [
        {
          date: "2005-08-15",
          items: [
            {
              name: "TiVo TCD540040 Series2 40-Hour Digital Video Recorder",
              price: "$94.04",
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
      assert.strictEqual(invoice.shippingCost, "$18.24");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(invoice.subtotal, "$119.03");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(invoice.tax, "$9.87");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(invoice.total, "$128.90");
    });
  });
});

describe("Invoice from 2024", async () => {
  let invoice: Invoice;

  before(async () => {
    const fixtureHTML = await fs.readFile(
      "fixtures/invoice-2024.html",
      "utf-8"
    );
    invoice = parseInvoice(fixtureHTML, console.error);
  });

  describe("#date", () => {
    it("works", () => {
      assert.strictEqual(invoice?.date, "2024-10-27");
    });
  });

  describe("#orderID", () => {
    it("works", () => {
      assert.strictEqual(invoice.orderID, "103-9483948-3434343");
    });
  });

  describe("#placedBy", () => {
    it("works", () => {
      assert.strictEqual(invoice.placedBy, undefined);
    });
  });

  describe("#shipments", () => {
    it("works", () => {
      assert.deepStrictEqual(invoice?.shipments, [
        {
          date: "2024-10-28",
          items: [
            {
              name: "HP 206X Black High-yield Toner Cartridge | Works with HP Color LaserJet Pro M255, HP Color LaserJet Pro MFP M282, M283 Series | W2110X, Pack of 1, Black",
              price: "$109.89",
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

  describe("#shippingCost", () => {
    it("works", () => {
      assert.strictEqual(invoice.shippingCost, "$0.00");
    });
  });

  describe("#subtotal", () => {
    it("works", () => {
      assert.strictEqual(invoice.subtotal, "$109.89");
    });
  });

  describe("#tax", () => {
    it("works", () => {
      assert.strictEqual(invoice.tax, "$9.89");
    });
  });

  describe("#total", () => {
    it("works", () => {
      assert.strictEqual(invoice.total, "$119.78");
    });
  });
});
