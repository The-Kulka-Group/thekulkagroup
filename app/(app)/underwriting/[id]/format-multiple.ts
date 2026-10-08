const MULTIPLE = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Ratios that read as "x" (equity multiples, coverage) always show two decimals, so 1.60x sits beside 1.59x (LA-1944). */
export function formatMultiple(value: number) {
  return `${MULTIPLE.format(value)}x`;
}
