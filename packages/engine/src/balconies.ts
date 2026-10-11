// LA-2219 (spec LA-2209): balconies, priced by the project's balcony facts.
//
// The balconies gate asks whether the units have balconies; on yes, a
// follow-up asks Full or Juliet (Matt, 2026-10-11). Full balconies then ask
// three facts at Level 3: how many balconies, the deck area of one, and the
// posts and rail along one. Three items price on them at stated rates:
//
//   - 11, the balcony deck, per SF of balcony deck (VA, $60/SF);
//   - 11a, the posts and rail, per LF of rail (VA, $300/LF);
//   - 15b, sliding doors, each, one door to a balcony, from the low and the
//     high of the range on record ($1,800 to $2,537).
//
// Each quantity is a derived quantity (GLOSSARY.md). Where the project lacks
// a fact it needs, it names the fact and gives no number, so the item stays
// blank rather than pricing as zero. LA-2220 adds the Juliet branch: item 7b, the
// Juliet rail, prices on the same per-LF unit at $225/LF, and a Juliet's door
// is one more sliding door (15b). Pure functions only, same rule as rom.ts.

import type { QuantityResult } from "./quantity-rules";
import type { Benchmark, RomLine } from "./rom";

export const BALCONY_DECK_COST_CODE = "11";
export const BALCONY_RAIL_COST_CODE = "11a";
export const SLIDING_DOOR_COST_CODE = "15b";
/** LA-2220: the Juliet rail, a canonical item beside item 7's railings. */
export const JULIET_RAIL_COST_CODE = "7b";

/** Full or Juliet, the follow-up the balconies gate opens. */
export type BalconyType = "full" | "juliet";

/**
 * The balcony answers a quantity reads, off `Answers.facts` under the names
 * config/rom/tier1-flow.json gives them. Absent, or not the shape the flow
 * gives, reads as not answered yet.
 */
export type BalconyFacts = {
  type: BalconyType | null;
  /** How many full balconies. */
  count: number | null;
  /** SF of deck on one balcony. */
  deckSquareFeet: number | null;
  /** LF of posts and rail along one balcony. */
  railLinearFeet: number | null;
  /** LA-2220: how many Juliet balconies. */
  julietCount: number | null;
  /** LA-2220: LF of Juliet rail across one Juliet. */
  julietRailLinearFeet: number | null;
};

function positive(facts: Record<string, string | number | boolean> | undefined, name: string): number | null {
  const value = facts?.[name];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function readBalconyFacts(facts: Record<string, string | number | boolean> | undefined): BalconyFacts {
  const type = facts?.["balconyType"];
  return {
    type: type === "full" || type === "juliet" ? type : null,
    count: positive(facts, "balconyCount"),
    deckSquareFeet: positive(facts, "balconyDeckSquareFeet"),
    railLinearFeet: positive(facts, "balconyRailLinearFeet"),
    julietCount: positive(facts, "julietCount"),
    julietRailLinearFeet: positive(facts, "julietRailLinearFeet"),
  };
}

/** The facts' names on screen, the same words the questions use. */
const FACT_NAMES = {
  type: "Balcony Type",
  count: "Balcony Count",
  deckSquareFeet: "Deck Area per Balcony",
  railLinearFeet: "Rail per Balcony",
  julietCount: "Juliet Count",
  julietRailLinearFeet: "Rail per Juliet",
} as const;

const NO_TYPE: QuantityResult = { ok: false, missing: [FACT_NAMES.type], words: "the project has no balcony type" };

const whole = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Count times the per-balcony fact, or the facts that are missing. */
function perBalcony(
  b: BalconyFacts,
  count: "count" | "julietCount",
  each: "deckSquareFeet" | "railLinearFeet" | "julietRailLinearFeet",
  unit: string,
  noun = "balconies",
): QuantityResult {
  const missing: string[] = [];
  if (b[count] === null) missing.push(FACT_NAMES[count]);
  if (b[each] === null) missing.push(FACT_NAMES[each]);
  if (missing.length > 0) {
    return { ok: false, missing, words: `the project has no ${missing.map((m) => m.toLowerCase()).join(" or ")}` };
  }
  const value = b[count]! * b[each]!;
  return { ok: true, value, words: `${whole(value)} ${unit}, ${whole(b[count]!)} ${noun} x ${whole(b[each]!)} ${unit}` };
}

/** SF of balcony deck: full balconies' count times one deck's area. A Juliet balcony has no deck. */
export function balconyDeckArea(facts: Record<string, string | number | boolean> | undefined): QuantityResult {
  const b = readBalconyFacts(facts);
  if (b.type === null) return NO_TYPE;
  if (b.type === "juliet") return { ok: true, value: 0, words: "a Juliet balcony has no deck" };
  return perBalcony(b, "count", "deckSquareFeet", "SF");
}

/**
 * LF of rail: full balconies' count times one balcony's posts and rail, or
 * (LA-2220) the Juliet count times the rail across one Juliet. The same unit
 * prices item 11a for full balconies and item 7b for Juliets; a gate on the
 * Full or Juliet answer keeps each item to its own type.
 */
export function railLength(facts: Record<string, string | number | boolean> | undefined): QuantityResult {
  const b = readBalconyFacts(facts);
  if (b.type === null) return NO_TYPE;
  if (b.type === "juliet") return perBalcony(b, "julietCount", "julietRailLinearFeet", "LF", "Juliets");
  return perBalcony(b, "count", "railLinearFeet", "LF");
}

/** Sliding doors: one to each balcony, full or Juliet. */
export function balconyDoorCount(facts: Record<string, string | number | boolean> | undefined): QuantityResult {
  const b = readBalconyFacts(facts);
  if (b.type === null) return NO_TYPE;
  if (b.type === "juliet") {
    if (b.julietCount === null) return { ok: false, missing: [FACT_NAMES.julietCount], words: "the project has no Juliet count" };
    return { ok: true, value: b.julietCount, words: `${whole(b.julietCount)} doors, one to each Juliet` };
  }
  if (b.count === null) return { ok: false, missing: [FACT_NAMES.count], words: "the project has no balcony count" };
  return { ok: true, value: b.count, words: `${whole(b.count)} doors, one to each balcony` };
}

/**
 * Item 15b, the sliding doors: the range on record, from the lowest rate to
 * the highest, times the door count. A blend with a spread around its
 * midpoint would not land on the two rates on record, so this prices
 * straight from them, the way item 1a's full span does. `blend` supplies the
 * line's shell: its label, classification and every rate behind it.
 */
export function slidingDoorSpanLine(rows: readonly Benchmark[], doors: number, blend: (rows: Benchmark[]) => RomLine): RomLine {
  const shell = blend([...rows]);
  const rates = rows.map((row) => row.value);
  return {
    ...shell,
    low: Math.round(Math.min(...rates) * doors),
    high: Math.round(Math.max(...rates) * doors),
    confidence: "low",
    heldForReview: true,
  };
}
