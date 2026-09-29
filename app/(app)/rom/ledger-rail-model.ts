// LA-1384. The rules behind the saved budget's Ledger and Rail layout, kept
// apart from the components so each can be tested on its own: numbers
// rounded to the confidence a conceptual budget has, each fact's share of the
// range, Widest Range First, which groups start folded, the header's rate
// alert, and where the range band sits on its scale.

import { listWords } from "./block-layout";

/** Money at the precision a conceptual budget carries: $2.1M, $350k, $900. */
export function coarseMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const a = Math.abs(value);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
}

/** Whole percent; under one percent reads "<1%", and nothing reads "". */
export function coarsePercent(share: number): string {
  if (share <= 0) return "";
  if (share < 0.01) return "<1%";
  return `${Math.round(share * 100)}%`;
}

/** Whole dollars per square foot; under a dollar reads "<$1". */
export function coarsePerSf(value: number): string {
  if (value > 0 && value < 1) return "<$1";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}

type Span = { low: number; high: number };

/** A fact prices no line in this budget below this share of the range. */
export const NO_SHARE = 0.005;

/**
 * The share of the budget's range each fact prices: the spread of the lines
 * its cost codes reach, over the spread of every line. A line two facts reach
 * counts for both, so the shares can add past 100%.
 */
export function factSpreadShares(
  blocks: readonly (Span & { costCode: string })[],
  facts: readonly { code: string; costCodes: readonly string[] }[],
): Map<string, number> {
  const spread = new Map(blocks.map((block) => [block.costCode, Math.max(0, block.high - block.low)]));
  const whole = [...spread.values()].reduce((sum, value) => sum + value, 0);
  return new Map(
    facts.map((fact) => [
      fact.code,
      whole > 0 ? [...new Set(fact.costCodes)].reduce((sum, code) => sum + (spread.get(code) ?? 0), 0) / whole : 0,
    ]),
  );
}

/** Facts that price a line here, biggest share first, and the ones that price none, in their own order. */
export function factsByShare<T extends { code: string }>(
  facts: readonly T[],
  shares: ReadonlyMap<string, number>,
): { pricing: T[]; idle: T[] } {
  const share = (fact: T) => shares.get(fact.code) ?? 0;
  return {
    pricing: facts.filter((fact) => share(fact) >= NO_SHARE).sort((a, b) => share(b) - share(a)),
    idle: facts.filter((fact) => share(fact) < NO_SHARE),
  };
}

/** The rail heading's count, short enough to share its line: "6 of 8 Low". */
export function lowCount(facts: readonly { confidence: string; correction?: unknown }[]): string | null {
  const low = facts.filter((fact) => fact.confidence === "low" && !fact.correction).length;
  return low > 0 ? `${low} of ${facts.length} Low` : null;
}

/** The header's one alert, naming each markup with no rate: "General Requirements and General Conditions not priced". */
export function rateAlert(tbd: readonly string[]): string | null {
  return tbd.length > 0 ? `${listWords([...tbd])} not priced` : null;
}

/** Rows wider in range come first. The sort is stable, so equal ranges keep their order. */
export function widestRangeFirst<T>(rows: readonly T[], spanOf: (row: T) => Span): T[] {
  return [...rows].sort((a, b) => {
    const sa = spanOf(a);
    const sb = spanOf(b);
    return sb.high - sb.low - (sa.high - sa.low);
  });
}

/** A group under this share of the total starts folded, so the first screen goes to the trades that carry the budget. */
export const FOLD_SHARE = 0.05;

export function initiallyFolded(
  entries: readonly { kind: string; key: string; amount: number | null }[],
  whole: number,
): Set<string> {
  if (whole <= 0) return new Set();
  return new Set(
    entries.filter((entry) => entry.kind === "group" && (entry.amount ?? 0) / whole < FOLD_SHARE).map((entry) => entry.key),
  );
}

/**
 * Where the total's range sits, as percentages of a scale that starts at $0
 * and ends a little past the high, so the band's width against the whole says
 * how wide the range is. Flat, not a gradient: the engine gives a low and a
 * high, not a distribution.
 */
export function bandGeometry(low: number, mid: number, high: number): { left: number; width: number; mid: number; high: number } {
  const max = high > 0 ? high * 1.04 : 1;
  const at = (value: number) => Math.max(0, Math.min(100, (value / max) * 100));
  return { left: at(low), width: Math.max(0, at(high) - at(low)), mid: at(mid), high: at(high) };
}
