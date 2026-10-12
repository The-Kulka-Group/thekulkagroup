import { type LevelRow, type LevelView, type PartPriceInput, partPrices, type PriceLevel } from "./part-prices";
import { parseRowKey } from "./row-keys";
import type { StagePart } from "./stage-scenes";

// LA-2212 (spec LA-2209): the price levels. The Building View reads one run
// three ways, following ADR 0002: level 1 the whole run as one block, level 2
// the element rollup, level 3 the canonical work items. The level changes the
// list and the stage's tint, never the number.

/** The run's list at every price level, with the gross area its $/GSF reads against. */
export type PriceLevels = {
  views: Record<PriceLevel, LevelView>;
  grossSquareFeet: number | null;
};

export const PRICE_LEVELS: readonly PriceLevel[] = [1, 2, 3];

// The tints are hex because the stage hands them to three.js, which cannot
// read a CSS variable. Each one is the daylight.css token named beside it.

/** Level 1's one colour, daylight.css --border: the whole building reads as a single block. */
export const BLOCK_TINT = "#D0D4E4";

/**
 * Level 2's colour for each ADR 0002 element (the block_classification
 * element list): graded shades of the neutral ink ramp (LA-2209 review H3).
 * DESIGN.md keeps the avatar hues for people, and none of these is a status
 * colour, the stage's blue highlight or the working orange of a part nothing
 * prices. The two elements drawn today, Elevator and Demolition, sit far
 * apart on the ramp.
 */
export const ELEMENT_TINTS: Readonly<Record<string, string>> = {
  Elevator: "#323338", // --ink
  Demolition: "#6F7382", // --ink-3
  Balcony: "#676879", // --ink-2
  Kitchen: "#ECEEF4", // --canvas-deep
  Bathroom: "#EDEEF2", // --neutral-fill
};

/** The colour a row tints its parts at its level, or null when it tints nothing. */
export function rowTint(level: PriceLevel, row: LevelRow): string | null {
  if (level === 1) return BLOCK_TINT;
  const key = parseRowKey(row.key);
  if (level === 2 && key?.kind === "element") return ELEMENT_TINTS[key.id] ?? null;
  return null;
}

/** Each tinted part's colour at this level. The first row that tints a part wins. */
export function partTints(view: LevelView): Partial<Record<StagePart, string>> {
  const tints: Partial<Record<StagePart, string>> = {};
  for (const row of view.rows) {
    const tint = rowTint(view.level, row);
    if (!tint) continue;
    for (const part of row.parts) tints[part] ??= tint;
  }
  return tints;
}

/** The keys of the rows a part sits in, in the list's order: a picked part lights these rows. */
export function rowsHolding(view: LevelView, part: StagePart): string[] {
  return view.rows.filter((row) => row.parts.includes(part)).map((row) => row.key);
}

/** A row's total over the gross area, or null when either is unknown. */
export function rowPerGsf(row: LevelRow, grossSquareFeet: number | null): number | null {
  return row.total !== null && grossSquareFeet ? row.total / grossSquareFeet : null;
}

export function priceLevels(input: Omit<PartPriceInput, "level">): PriceLevels {
  const at = (level: PriceLevel) => partPrices({ ...input, level }).view;
  return {
    views: { 1: at(1), 2: at(2), 3: at(3) },
    grossSquareFeet: input.facts.grossSquareFeet || null,
  };
}
