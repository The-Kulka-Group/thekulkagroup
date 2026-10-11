/** Whole dollars: $1,234,567. */
export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** A rate per SF or per unit: to the cent under $100, where whole dollars would print $0.14 as $0, and whole dollars above. */
export function rateUsd(n: number): string {
  const cents = Math.round(n * 100) / 100;
  return cents < 100 ? `$${cents.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : usd(n);
}

export function wholeNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
