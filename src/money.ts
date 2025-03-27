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
  const value = typeof amount === "string" ? amount : amount.toString();
  const currency = value.includes("$") ? "$" : undefined;
  const cents = Math.floor(parseFloat(value.replace(/[\$,]/g, "")) * 100);

  return {
    currency,
    value,
    cents,
  };
}

export function formatMonetaryAmount(amount: string | number | MonetaryAmount) {
  const { currency, cents } =
    typeof amount === "object" ? amount : parseMonetaryAmount(amount);

  const whole = Math.floor(cents / 100);
  const fraction = cents - whole * 100;

  return `${currency}${whole}.${fraction.toString().padStart(2, "0")}`;
}
