import { formatMonetaryAmount, parseMonetaryAmount } from "./money.js";
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
    #options;
    #order = {};
    #payments = [];
    #shipments = [];
    #inferTaxes = false;
    #lastShipmentFinalized = false;
    #lastItemFinalized = false;
    #shippingAddressRequired = true;
    #shouldAdjustTotalBasedOnGiftCards = false;
    #assumedItemQuantity;
    #assumePaymentCoversFullAmount = false;
    constructor(options) {
        this.#options = {
            onAttributeCaptured: (attr, value) => { },
            ...(options ?? {}),
        };
    }
    assumeItemQuantity(quantity = 1) {
        this.#assumedItemQuantity = quantity;
        return this;
    }
    assumePaymentCoversFullAmount() {
        this.#assumePaymentCoversFullAmount = true;
        return this;
    }
    adjustTotalBasedOnGiftCard() {
        this.#shouldAdjustTotalBasedOnGiftCards = true;
        return this;
    }
    build() {
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
        const date = ensure(this.#order, "date");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
        }
        if (this.#assumePaymentCoversFullAmount && this.#payments.length > 1) {
            const anyPaymentMissingAmount = this.#payments.some((p) => p.amount == null);
            if (anyPaymentMissingAmount) {
                throw new Error("Assuming payment covers full amount but multiple payments are set, some missing amount");
            }
        }
        return {
            id: ensure(this.#order, "id"),
            currency: ensure(this.#order, "currency"),
            date,
            payments: this.#payments.map((p, index) => {
                if (p.type == null) {
                    throw new Error(`Payment ${index} type not set`);
                }
                const date = p.date ?? this.#order.date;
                if (date == null) {
                    throw new Error(`Payment ${index} date not set`);
                }
                if (p.amount == null && this.#assumePaymentCoversFullAmount) {
                    p.amount = total;
                    p.amountCents = totalCents;
                }
                const amount = ensure(p, "amount");
                const amountCents = ensure(p, "amountCents");
                if (p.type === "credit_card") {
                    return {
                        type: "credit_card",
                        cardType: ensure(p, "cardType"),
                        last4: ensure(p, "last4"),
                        date,
                        amount,
                        amountCents,
                    };
                }
                if (p.type === "gift_card") {
                    return {
                        type: "gift_card",
                        date,
                        amount,
                        amountCents,
                    };
                }
                if (p.type === "cash") {
                    return {
                        type: "cash",
                        date,
                        amount,
                        amountCents,
                    };
                }
                throw new Error(`Unexpected payment type: ${p.type}`);
            }),
            placedBy: this.#order.placedBy,
            shipments: this.#shipments.map((s, index) => {
                const result = {
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
        function ensure(obj, key) {
            const value = obj[key];
            if (value == null) {
                throw new Error(`${String(key)} not set on ${JSON.stringify(obj)}`);
            }
            return obj[key];
        }
    }
    addCashPayment() {
        this.payments.push({
            type: "cash",
        });
        return this;
    }
    addCreditCardPayment(cardType, last4) {
        this.payments.push({
            type: "credit_card",
            cardType,
            last4,
        });
        return this;
    }
    addGiftCardPayment() {
        this.payments.push({
            type: "gift_card",
            date: this.#order.date,
        });
        return this;
    }
    finalizeItem() {
        const shipment = this.ensureShipment();
        const item = shipment.items[shipment.items.length - 1];
        if (item != null && item.quantity == null) {
            if (this.#assumedItemQuantity != null) {
                item.quantity = this.#assumedItemQuantity;
                if (this.#options.onAttributeCaptured) {
                    this.#options.onAttributeCaptured("itemQuantity", this.#assumedItemQuantity);
                }
            }
        }
        this.#lastItemFinalized = true;
        this.#assumedItemQuantity = undefined;
        return this;
    }
    fullShippingAddressNotAvailable() {
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
    inferTaxes() {
        this.#inferTaxes = true;
        return this;
    }
    /**
     * Indicates this order will not actually be shipped, so
     * no shipping address is needed.
     */
    nothingWillBeShipped() {
        this.#shippingAddressRequired = false;
        return this;
    }
    setCreditCardLast4(last4) {
        const payment = this.lastPayment;
        if (payment.type !== "credit_card") {
            throw new Error("Last payment is not a credit card");
        }
        if (payment.last4 != null && payment.last4 !== last4) {
            throw new Error("Last 4 digits already set");
        }
        if (payment.last4 == null) {
            payment.last4 = last4;
            this.#options.onAttributeCaptured("last4", last4);
        }
        return this;
    }
    setCurrency(currency) {
        if (this.#order.currency != null && this.#order.currency !== currency) {
            throw new Error("Currency already set");
        }
        if (this.#order.currency == null) {
            this.#options.onAttributeCaptured("currency", currency);
            this.#order.currency = currency;
        }
        return this;
    }
    setDate(yearOrDateOrMatchArray, month, day) {
        const date = this.normalizeDate(yearOrDateOrMatchArray, month, day);
        if (this.#order.date != null && this.#order.date !== date) {
            throw new Error("Date already set");
        }
        if (this.#order.date == null) {
            this.#order.date = date;
            this.#options.onAttributeCaptured("date", date);
        }
        return this;
    }
    setID(id) {
        if (this.#order.id != null && this.#order.id !== id) {
            throw new Error("ID already set");
        }
        if (this.#order.id == null) {
            this.#order.id = id;
            this.#options.onAttributeCaptured("id", id);
        }
        return this;
    }
    setItemName(value) {
        this.ensureShipmentItem().name = value;
        if (this.#options.onAttributeCaptured) {
            this.#options.onAttributeCaptured("itemName", value);
        }
        return this;
    }
    setItemQuantity(value) {
        value = typeof value === "number" ? value : parseInt(value, 10);
        this.ensureShipmentItem().quantity = value;
        if (this.#options.onAttributeCaptured) {
            this.#options.onAttributeCaptured("itemQuantity", value);
        }
        return this;
    }
    setItemPrice(value, quantity) {
        const item = this.ensureShipmentItem();
        let { currency, value: price, cents: priceCents, } = parseMonetaryAmount(value);
        if (item.priceCents != null && item.priceCents !== priceCents) {
            throw new Error(`Price already set (was ${item.priceCents}, trying to set to ${priceCents}`);
        }
        if (quantity != null) {
            priceCents =
                quantity === 1 ? priceCents : Math.floor(priceCents / quantity);
            value = formatMonetaryAmount({
                currency,
                cents: priceCents,
            });
            this.setItemPrice(value).setItemQuantity(quantity);
        }
        else {
            item.price = price;
            item.priceCents = priceCents;
            if (this.#options.onAttributeCaptured) {
                this.#options.onAttributeCaptured("itemPrice", price);
            }
        }
        return this;
    }
    setNextShippingAddressField(value) {
        const shipment = this.ensureShipment();
        const fields = [
            "name",
            "address",
            "city",
            "state",
            "zip",
            "country",
        ];
        for (const field of fields) {
            if (shipment.shippingAddress[field] == null) {
                shipment.shippingAddress[field] = value;
                if (this.#options.onAttributeCaptured) {
                    this.#options.onAttributeCaptured(`shippingAddress.${field}`, value);
                }
                return this;
            }
        }
        throw new Error(`Unexpected shipping address value: ${value}`);
    }
    setPaymentAmount(amount) {
        const { value, cents } = parseMonetaryAmount(amount);
        if (this.lastPayment.amount != null && this.lastPayment.amount !== value) {
            throw new Error(`Payment amount already set (was ${this.lastPayment.amountCents}, trying to set to ${cents})`);
        }
        if (this.lastPayment.amount == null) {
            this.#options.onAttributeCaptured("paymentAmount", value);
            this.lastPayment.amount = value;
            this.lastPayment.amountCents = cents;
        }
        return this;
    }
    setPaymentDate(yearOrDateOrMatchArray, month, day) {
        const date = this.normalizeDate(yearOrDateOrMatchArray, month, day);
        if (this.lastPayment.date != null && this.lastPayment.date !== date) {
            throw new Error("Payment date already set");
        }
        if (this.lastPayment.date == null) {
            this.lastPayment.date = date;
            this.#options.onAttributeCaptured("paymentDate", date);
        }
        return this;
    }
    setPlacedBy(value) {
        if (this.#order.placedBy != null && this.#order.placedBy !== value) {
            throw new Error("Placed by already set");
        }
        this.#order.placedBy = value;
        return this;
    }
    setShippingAddress(address) {
        const { shippingAddress } = this.ensureShipment();
        if (shippingAddress.address != null &&
            shippingAddress.address !== address) {
            throw new Error("Shipping address already set");
        }
        if (shippingAddress.address == null) {
            this.#options.onAttributeCaptured("shippingAddress.address", address);
            shippingAddress.address = address;
        }
        return this;
    }
    setShippingAddressName(name) {
        const { shippingAddress } = this.ensureShipment();
        if (shippingAddress.name != null && shippingAddress.name !== name) {
            throw new Error("Shipping name already set");
        }
        if (shippingAddress.name == null) {
            this.#options.onAttributeCaptured("shippingAddress.name", name);
            shippingAddress.name = name;
        }
        return this;
    }
    setShippingCity(city) {
        const { shippingAddress } = this.ensureShipment();
        if (shippingAddress.city != null && shippingAddress.city !== city) {
            throw new Error("Shipping city already set");
        }
        if (shippingAddress.city == null) {
            this.#options.onAttributeCaptured("shippingAddress.city", city);
            shippingAddress.city = city;
        }
        return this;
    }
    setShippingCountry(country) {
        const { shippingAddress } = this.ensureShipment();
        if (shippingAddress.country != null &&
            shippingAddress.country !== country) {
            throw new Error("Shipping country already set");
        }
        if (shippingAddress.country == null) {
            this.#options.onAttributeCaptured("shippingAddress.country", country);
            shippingAddress.country = country;
        }
        return this;
    }
    setShippingDate(yearOrDateOrMatchArray, month, day) {
        const date = this.normalizeDate(yearOrDateOrMatchArray, month, day);
        this.ensureShipment().date = date;
        if (this.#options.onAttributeCaptured) {
            this.#options.onAttributeCaptured("shippingDate", date);
        }
        return this;
    }
    setShippingState(state) {
        const { shippingAddress } = this.ensureShipment();
        if (shippingAddress.state != null && shippingAddress.state !== state) {
            throw new Error("Shipping state already set");
        }
        if (shippingAddress.state == null) {
            this.#options.onAttributeCaptured("shippingAddress.state", state);
            shippingAddress.state = state;
        }
        return this;
    }
    setShippingZip(zip) {
        const { shippingAddress } = this.ensureShipment();
        if (shippingAddress.zip != null && shippingAddress.zip !== zip) {
            throw new Error("Shipping zip already set");
        }
        if (shippingAddress.zip == null) {
            this.#options.onAttributeCaptured("shippingAddress.zip", zip);
            shippingAddress.zip = zip;
        }
        return this;
    }
    setShippingCost(value) {
        const { value: shippingCost, cents: shippingCostCents } = parseMonetaryAmount(value);
        if (this.#order.shippingCostCents != null &&
            this.#order.shippingCostCents !== shippingCostCents) {
            throw new Error("Shipping cost already set");
        }
        if (this.#order.shippingCost == null) {
            this.#options.onAttributeCaptured("shippingCost", shippingCost);
            this.#order.shippingCost = shippingCost;
            this.#order.shippingCostCents = shippingCostCents;
        }
        return this;
    }
    setSubtotal(value) {
        const { value: subtotal, cents: subtotalCents } = parseMonetaryAmount(value);
        if (this.#order.subtotalCents != null &&
            this.#order.subtotalCents !== subtotalCents) {
            throw new Error("Subtotal already set");
        }
        if (this.#order.subtotal == null) {
            this.#options.onAttributeCaptured("subtotal", subtotal);
            this.#order.subtotal = subtotal;
            this.#order.subtotalCents = subtotalCents;
        }
        return this;
    }
    setTax(value) {
        const { value: tax, cents: taxCents } = parseMonetaryAmount(value);
        if (this.#order.taxCents != null && this.#order.taxCents !== taxCents) {
            throw new Error("Tax already set");
        }
        if (this.#order.tax == null) {
            this.#options.onAttributeCaptured("tax", tax);
            this.#order.tax = tax;
            this.#order.taxCents = taxCents;
        }
        return this;
    }
    setTotal(value) {
        const { value: total, cents: totalCents } = parseMonetaryAmount(value);
        if (this.#order.totalCents != null &&
            this.#order.totalCents !== totalCents) {
            throw new Error("Total already set");
        }
        if (this.#order.total == null) {
            this.#order.total = total;
            this.#order.totalCents = totalCents;
            this.#options.onAttributeCaptured("total", total);
        }
        if (total.startsWith("$")) {
            this.setCurrency("$");
        }
        return this;
    }
    finalizeShipment() {
        this.#lastShipmentFinalized = true;
        return this;
    }
    get payments() {
        return this.#payments;
    }
    get shipments() {
        return this.#shipments;
    }
    get lastPayment() {
        return this.#payments[this.#payments.length - 1];
    }
    calculateTotal() {
        let totalCents = this.#order.totalCents;
        if (totalCents == null) {
            throw new Error("Total not set");
        }
        if (this.#shouldAdjustTotalBasedOnGiftCards) {
            const giftCardTotalCents = this.#payments
                .filter((p) => p.type === "gift_card")
                .reduce((sum, p) => sum + p.amountCents, 0);
            totalCents += giftCardTotalCents;
        }
        const { currency } = parseMonetaryAmount(this.#order.total);
        return {
            totalCents,
            total: formatMonetaryAmount({ currency, cents: totalCents }),
        };
    }
    ensureShipment() {
        if (this.shipments.length === 0 || this.#lastShipmentFinalized) {
            this.shipments.push({
                items: [],
                shippingAddress: {},
            });
            this.#lastShipmentFinalized = false;
        }
        return this.shipments[this.shipments.length - 1];
    }
    ensureShipmentItem() {
        const shipment = this.ensureShipment();
        if (shipment.items.length === 0 || this.#lastItemFinalized) {
            shipment.items.push({});
            this.#lastItemFinalized = false;
        }
        return shipment.items[shipment.items.length - 1];
    }
    normalizeDate(yearOrDateOrMatchArray, month, day) {
        if (typeof month === "string" && MONTHS.includes(month)) {
            month = MONTHS.indexOf(month) + 1;
        }
        if (typeof yearOrDateOrMatchArray === "string" &&
            /^\d{4}$/.test(yearOrDateOrMatchArray)) {
            yearOrDateOrMatchArray = parseInt(yearOrDateOrMatchArray, 10);
        }
        if (typeof yearOrDateOrMatchArray === "number" &&
            month != null &&
            day != null) {
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
            throw new Error("Invalid match array for date (needs year, month and day groups)");
        }
        return this.normalizeDate(groups.year, groups.month, groups.day);
    }
}
function pad(value, length) {
    return value.toString().padStart(length, "0");
}
//# sourceMappingURL=order-builder.js.map