import { formatMonetaryAmount, parseMonetaryAmount } from "./money.ts";
import type {
  Order,
  OrderItem,
  Payment,
  Shipment,
  ShippingAddress,
} from "./types.ts";

type PartialShipment = Partial<Pick<Shipment, "date">> & {
  items: Partial<OrderItem>[];
  shippingAddress: Partial<ShippingAddress>;
};

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

export class OrderBuilder {
  #order: Partial<Order> = {};
  #payments: Partial<Payment>[] = [];
  #shipments: PartialShipment[] = [];
  #inferTaxes = false;
  #lastShipmentFinalized = false;
  #lastItemFinalized = false;
  #shippingAddressRequired = true;
  #shouldAdjustTotalBasedOnGiftCards = false;

  adjustTotalBasedOnGiftCard(): this {
    this.#shouldAdjustTotalBasedOnGiftCards = true;
    return this;
  }

  build(): Order {
    const { total, totalCents } = this.calculateTotal();

    const shippingCost = this.#order.shippingCost;
    const shippingCostCents = this.#order.shippingCostCents;
    const subtotal = ensure(this.#order, "subtotal");
    const subtotalCents = ensure(this.#order, "subtotalCents");
    let tax = ensure(this.#order, "tax");
    let taxCents = ensure(this.#order, "taxCents");

    if (this.#inferTaxes) {
      // Amazon is not including tax information in the raw HTML, so we have
      // to fill in the blanks
      if (taxCents) {
        throw new Error("inferTaxes is set but order already has tax");
      }

      taxCents = totalCents - subtotalCents - shippingCostCents;
      tax = formatMonetaryAmount({
        currency: this.#order.currency,
        cents: taxCents,
      });
    }

    return {
      id: ensure(this.#order, "id"),
      currency: ensure(this.#order, "currency"),
      date: ensure(this.#order, "date"),
      payments: this.#payments.map((p, index) => {
        if (p.type == null) {
          throw new Error(`Payment ${index} type not set`);
        }

        if (p.type === "credit_card") {
          return {
            type: "credit_card",
            cardType: ensure(p, "cardType"),
            last4: ensure(p, "last4"),
            date: ensure(p, "date"),
            amount: ensure(p, "amount"),
            amountCents: ensure(p, "amountCents"),
          };
        }

        if (p.type === "gift_card") {
          return {
            type: "gift_card",
            date: ensure(p, "date"),
            amount: ensure(p, "amount"),
            amountCents: ensure(p, "amountCents"),
          };
        }

        throw new Error(`Unexpected payment type: ${(p as any).type}`);
      }),
      placedBy: this.#order.placedBy,
      shipments: this.#shipments.map((s, index) => {
        const result: Shipment = {
          items: s.items.map((i, itemIndex) => ({
            name: ensure(i, "name"),
            price: ensure(i, "price"),
            priceCents: ensure(i, "priceCents"),
            quantity: ensure(i, "quantity"),
          })),
        };

        if (this.#shippingAddressRequired) {
          result.shippingAddress = {
            name: ensure(s.shippingAddress, "name"),
            address: ensure(s.shippingAddress, "address"),
            city: ensure(s.shippingAddress, "city"),
            state: ensure(s.shippingAddress, "state"),
            zip: ensure(s.shippingAddress, "zip"),
            country: ensure(s.shippingAddress, "country"),
          };
        }

        if (s.date != null) {
          result.date = s.date;
        }
        return result;
      }),
      shippingCost,
      shippingCostCents,
      subtotal,
      subtotalCents,
      tax,
      taxCents,
      total,
      totalCents,
    };

    function ensure<T extends {}, TKey extends keyof T>(
      obj: T,
      key: TKey,
    ): NonNullable<T[TKey]> {
      const value = obj[key];
      if (value == null) {
        throw new Error(`${String(key)} not set`);
      }
      return obj[key]!;
    }
  }

  addCreditCardPayment(cardType: string, last4: string): this {
    this.payments.push({
      type: "credit_card",
      cardType,
      last4,
    });
    return this;
  }

  addGiftCardPayment(): this {
    this.payments.push({
      type: "gift_card",
      date: this.#order.date,
    });
    return this;
  }

  finalizeItem(): this {
    this.#lastItemFinalized = true;
    return this;
  }

  fullShippingAddressNotAvailable(): this {
    const addr = this.ensureShipment().shippingAddress;

    addr.name ??= "";
    addr.address ??= "";
    addr.city ??= "";
    addr.state ??= "";
    addr.zip ??= "";
    addr.country ??= "";

    const parts = addr.address.split(",").map((s) => s.trim());
    if (parts.length > 1) {
      addr.address = "";
      addr.state = parts.pop();
      addr.city = parts.join(", ");
      addr;
    }

    return this;
  }

  /**
   * The order HTML sometimes does not include tax information--specifically for Whole Foods
   * orders it seems like they are loading it client side so they can break it down.
   * inferTaxes() means we'll just calculate the different between the total and the
   * subtotal + shipping and call that the tax.
   */
  inferTaxes(): this {
    this.#inferTaxes = true;
    return this;
  }

  /**
   * Indicates this order will not actually be shipped, so
   * no shipping address is needed.
   */
  nothingWillBeShipped(): this {
    this.#shippingAddressRequired = false;

    return this;
  }

  setCurrency(currency: string): this {
    if (this.#order.currency != null && this.#order.currency !== currency) {
      throw new Error("Currency already set");
    }
    this.#order.currency = currency;
    return this;
  }

  setDate(year: number | string, month: number, day: number): this;
  setDate(date: string): this;
  setDate(m: RegExpMatchArray): this;
  setDate(
    yearOrDateOrMatchArray: number | string | RegExpMatchArray,
    month?: number,
    day?: number,
  ): this {
    this.#order.date = this.normalizeDate(yearOrDateOrMatchArray, month, day);
    return this;
  }

  setID(id: string): this {
    if (this.#order.id != null && this.#order.id !== id) {
      throw new Error("ID already set");
    }
    this.#order.id = id;
    return this;
  }

  setItemName(value: string): this {
    this.ensureShipmentItem().name = value;
    return this;
  }

  setItemQuantity(value: string | number): this {
    this.ensureShipmentItem().quantity =
      typeof value === "number" ? value : parseInt(value, 10);
    return this;
  }

  setItemPrice(value: string | number): this {
    const item = this.ensureShipmentItem();
    const [price, priceCents] = this.parseAmount(value);

    if (item.priceCents != null && item.priceCents !== priceCents) {
      throw new Error(
        `Price already set (was ${item.priceCents}, trying to set to ${priceCents}`,
      );
    }

    item.price = price;
    item.priceCents = priceCents;
    return this;
  }

  setNextShippingAddressField(value: string): this {
    const shipment = this.ensureShipment();
    const fields = [
      "name",
      "address",
      "city",
      "state",
      "zip",
      "country",
    ] as (keyof ShippingAddress)[];

    for (const field of fields) {
      if (shipment.shippingAddress[field] == null) {
        shipment.shippingAddress[field] = value;
        return this;
      }
    }

    throw new Error(`Unexpected shipping address value: ${value}`);
  }

  setPaymentAmount(amount: string | number) {
    const payment = this.payments[this.payments.length - 1];
    const [amountStr, amountCents] = this.parseAmount(amount);
    payment.amount = amountStr;
    payment.amountCents = amountCents;
    return this;
  }

  setPaymentDate(year: number | string, month: number, day: number): this;
  setPaymentDate(date: string): this;
  setPaymentDate(m: RegExpMatchArray): this;
  setPaymentDate(
    yearOrDateOrMatchArray: number | string | RegExpMatchArray,
    month?: number,
    day?: number,
  ): this {
    this.lastPayment.date = this.normalizeDate(
      yearOrDateOrMatchArray,
      month,
      day,
    );
    return this;
  }

  setPlacedBy(value: string): this {
    if (this.#order.placedBy != null && this.#order.placedBy !== value) {
      throw new Error("Placed by already set");
    }
    this.#order.placedBy = value;
    return this;
  }

  setShippingAddress(address: string): this {
    this.ensureShipment().shippingAddress.address = address;
    return this;
  }

  setShippingAddressName(name: string): this {
    this.ensureShipment().shippingAddress.name = name;
    return this;
  }

  setShippingCity(city: string): this {
    this.ensureShipment().shippingAddress.city = city;
    return this;
  }

  setShippingCountry(country: string): this {
    this.ensureShipment().shippingAddress.country = country;
    return this;
  }

  setShippingDate(year: number | string, month: number, day: number): this;
  setShippingDate(date: string): this;
  setShippingDate(m: RegExpMatchArray): this;
  setShippingDate(
    yearOrDateOrMatchArray: number | string | RegExpMatchArray,
    month?: number,
    day?: number,
  ): this {
    this.ensureShipment().date = this.normalizeDate(
      yearOrDateOrMatchArray,
      month,
      day,
    );
    return this;
  }

  setShippingState(state: string): this {
    this.ensureShipment().shippingAddress.state = state;
    return this;
  }

  setShippingZip(zip: string): this {
    this.ensureShipment().shippingAddress.zip = zip;
    return this;
  }

  setShippingCost(value: string | number): this {
    const [shippingCost, shippingCostCents] = this.parseAmount(value);
    if (
      this.#order.shippingCostCents != null &&
      this.#order.shippingCostCents !== shippingCostCents
    ) {
      throw new Error("Shipping cost already set");
    }
    this.#order.shippingCost = shippingCost;
    this.#order.shippingCostCents = shippingCostCents;
    return this;
  }

  setSubtotal(value: string | number): this {
    const [subtotal, subtotalCents] = this.parseAmount(value);
    if (
      this.#order.subtotalCents != null &&
      this.#order.subtotalCents !== subtotalCents
    ) {
      throw new Error("Subtotal already set");
    }
    this.#order.subtotal = subtotal;
    this.#order.subtotalCents = subtotalCents;
    return this;
  }

  setTax(value: string | number): this {
    const [tax, taxCents] = this.parseAmount(value);
    if (this.#order.taxCents != null && this.#order.taxCents !== taxCents) {
      throw new Error("Tax already set");
    }
    this.#order.tax = tax;
    this.#order.taxCents = taxCents;
    return this;
  }

  setTotal(value: string | number): this {
    const [total, totalCents] = this.parseAmount(value);
    if (
      this.#order.totalCents != null &&
      this.#order.totalCents !== totalCents
    ) {
      throw new Error("Total already set");
    }
    this.#order.total = total;
    this.#order.totalCents = totalCents;

    if (total.startsWith("$")) {
      this.#order.currency = "$";
    }

    return this;
  }

  finalizeShipment(): this {
    this.#lastShipmentFinalized = true;
    return this;
  }

  private get payments(): Partial<Payment>[] {
    return this.#payments;
  }

  private get shipments(): PartialShipment[] {
    return this.#shipments;
  }

  private get lastPayment(): Partial<Payment> {
    return this.#payments[this.#payments.length - 1];
  }

  private calculateTotal(): { total: string; totalCents: number } {
    let totalCents = this.#order.totalCents;

    if (totalCents == null) {
      throw new Error("Total not set");
    }

    if (this.#shouldAdjustTotalBasedOnGiftCards) {
      const giftCardTotalCents = this.#payments
        .filter((p) => p.type === "gift_card")
        .reduce((sum, p) => sum + p.amountCents!, 0);

      totalCents += giftCardTotalCents;
    }

    const { currency } = parseMonetaryAmount(this.#order.total!);

    return {
      totalCents,
      total: formatMonetaryAmount({ currency, cents: totalCents }),
    };
  }

  private ensureShipment(): PartialShipment {
    if (this.shipments.length === 0 || this.#lastShipmentFinalized) {
      this.shipments.push({
        items: [],
        shippingAddress: {},
      });
      this.#lastShipmentFinalized = false;
    }
    return this.shipments[this.shipments.length - 1];
  }

  private ensureShipmentItem(): Partial<OrderItem> {
    const shipment = this.ensureShipment();
    if (shipment.items.length === 0 || this.#lastItemFinalized) {
      shipment.items.push({});
      this.#lastItemFinalized = false;
    }
    return shipment.items[shipment.items.length - 1];
  }

  private normalizeDate(
    yearOrDateOrMatchArray: number | string | RegExpMatchArray,
    month?: number | string,
    day?: number | string,
  ) {
    if (typeof month === "string" && MONTHS.includes(month)) {
      month = MONTHS.indexOf(month) + 1;
    }

    if (
      typeof yearOrDateOrMatchArray === "string" &&
      /^\d{4}$/.test(yearOrDateOrMatchArray)
    ) {
      yearOrDateOrMatchArray = parseInt(yearOrDateOrMatchArray, 10);
    }

    if (
      typeof yearOrDateOrMatchArray === "number" &&
      month != null &&
      day != null
    ) {
      return `${yearOrDateOrMatchArray}-${pad(month, 2)}-${pad(day, 2)}`;
    }

    if (typeof yearOrDateOrMatchArray === "string") {
      return yearOrDateOrMatchArray;
    }

    if (typeof yearOrDateOrMatchArray === "number") {
      throw new Error("Year provided without month and day");
    }

    const { groups } = yearOrDateOrMatchArray;

    if (groups == null) {
      throw new Error(
        "Invalid match array for date (needs year, month and day groups)",
      );
    }

    return this.normalizeDate(groups.year, groups.month, groups.day);
  }

  private parseAmount(value: string | number): [string, number] {
    const amount = typeof value === "number" ? value.toFixed(2) : value;
    const amountCents = Math.round(
      parseFloat(amount.replace(/[^0-9\.]/g, "")) * 100,
    );
    return [amount, amountCents];
  }
}

function pad(value: number | string, length: number) {
  return value.toString().padStart(length, "0");
}
