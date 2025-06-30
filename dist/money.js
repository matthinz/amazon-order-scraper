export function monetaryAmountsEqual(a, b) {
    a = typeof a === "object" ? a : parseMonetaryAmount(a);
    b = typeof b === "object" ? b : parseMonetaryAmount(b);
    return a.cents === b.cents && a.currency === b.currency;
}
export function parseMonetaryAmount(amount) {
    const amountAsString = String(amount).trim();
    const currency = amountAsString.includes("$") ? "$" : undefined;
    const parts = amountAsString
        .replace(/[\$,]/g, "")
        .split(".")
        .map((part) => {
        if (part === "") {
            return 0;
        }
        return parseInt(part, 10);
    });
    if (parts.length > 2) {
        throw new Error(`Invalid monetary amount: ${amount}`);
    }
    const cents = parts[0] * 100 + (parts[1] || 0);
    return {
        currency,
        value: amountAsString,
        cents,
    };
}
export function formatMonetaryAmount(amount) {
    const { currency, cents } = typeof amount === "object" ? amount : parseMonetaryAmount(amount);
    const whole = Math.floor(cents / 100);
    const fraction = cents - whole * 100;
    return `${currency}${whole}.${fraction.toString().padStart(2, "0")}`;
}
//# sourceMappingURL=money.js.map