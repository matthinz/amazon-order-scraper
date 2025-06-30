type MonetaryAmount = {
  currency?: string;
  value: string;
  cents: number;
};

export function monetaryAmountsEqual(
  a: string | number | MonetaryAmount,
  b: string | number | MonetaryAmount,
): boolean {
  a = typeof a === "object" ? a : parseMonetaryAmount(a);
  b = typeof b === "object" ? b : parseMonetaryAmount(b);

  return a.cents === b.cents && a.currency === b.currency;
}

export function parseMonetaryAmount(amount: string | number) {
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

  const sign = parts[0] < 0 ? -1 : 1;
  const cents = parts[0] * 100 + (parts[1] || 0) * sign;

  return {
    currency,
    value: amountAsString,
    cents,
  };
}

export function formatMonetaryAmount(
  amount: string | number | Pick<MonetaryAmount, "currency" | "cents">,
) {
  const { currency, cents } =
    typeof amount === "object" ? amount : parseMonetaryAmount(amount);

  const whole = Math.floor(cents / 100);
  const fraction = cents - whole * 100;

  return `${currency}${whole}.${fraction.toString().padStart(2, "0")}`;
}
