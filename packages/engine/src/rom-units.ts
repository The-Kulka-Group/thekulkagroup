// Benchmark units and quantities (LA-1156, ADR 0006, part of the demolition
// pilot LA-1152 opens). Until now every benchmark priced on one basis:
// dollars per gross square foot of the whole project, `usd_per_gsf`.
// Demolition needs three more, because what it costs does not move with the
// building being built: a lump sum priced once regardless of size (Site
// Demolition, item 1), a rate per square foot of the structure coming down
// (Structure Demolition, item 1a), and a rate for each structure coming down
// (the disconnects item 1a drives, priced "$ each" once Matt states a rate).
//
// This file is where a benchmark's unit turns into the quantity its rate
// multiplies by, and where item 1a's five structure-type rates pick the one
// row a project's answered structure type calls for, or the full span when
// nobody knows yet. Pure functions only, same rule as rom.ts: nothing here
// reads a clock, a network, or a database.

import type { DemolitionStructureType } from "./rom-intake";
import type { Benchmark, RomLine } from "./rom";

/**
 * Every basis a benchmark's rate can price on. `usd_per_gsf` is the original
 * basis; the other three are LA-1156's demolition additions. Widening this
 * union is the only change LA-1156 makes to `Benchmark["unit"]` in rom.ts.
 */
export type BenchmarkUnit =
  | "usd_per_gsf"
  | "usd_lump_sum"
  | "usd_per_sf_of_structure"
  | "usd_each_structure";

/** Item 1a, Structure Demolition (ADR 0006, canonical-work-items.md). */
export const STRUCTURE_DEMOLITION_COST_CODE = "1a";

/** LA-1155's six choice values, repeated here only to validate an unknown fact rather than trust it blindly. */
const KNOWN_STRUCTURE_TYPES: ReadonlySet<string> = new Set([
  "wood_frame_type_v",
  "masonry_bearing_wall_type_iii",
  "pre_engineered_metal_or_light_steel",
  "steel_frame_concrete_metal_deck_type_ii",
  "cast_in_place_concrete_frame_type_i",
  "dont_know",
]);

/**
 * The demolition answers a quantity reads, off `Answers.facts` under the
 * exact names LA-1155's intake fields land under (`demolitionStructureCount`,
 * `demolitionStructureSquareFeet`, `demolitionStructureType`, carried onto
 * facts by `readFlowAnswers` and by `answersFromProject`'s equivalent).
 * Absent, or not the shape LA-1155 gives it, reads as none of it answered
 * yet, the same way every other fact in this engine reads silence.
 */
export type DemolitionFacts = {
  structureCount: number | null;
  structureSquareFeet: number | null;
  structureType: DemolitionStructureType | null;
};

function readNumberFact(
  facts: Record<string, string | number | boolean> | undefined,
  name: string,
): number | null {
  const value = facts?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Reads the three demolition facts off `Answers.facts` (see `DemolitionFacts`). */
export function readDemolitionFacts(
  facts: Record<string, string | number | boolean> | undefined,
): DemolitionFacts {
  const rawType = facts?.["demolitionStructureType"];
  return {
    structureCount: readNumberFact(facts, "demolitionStructureCount"),
    structureSquareFeet: readNumberFact(facts, "demolitionStructureSquareFeet"),
    structureType:
      typeof rawType === "string" && KNOWN_STRUCTURE_TYPES.has(rawType)
        ? (rawType as DemolitionStructureType)
        : null,
  };
}

/**
 * The quantity a benchmark's rate multiplies by, for every unit this file
 * adds. `usd_per_gsf` keeps multiplying by the project's gross square feet,
 * exactly as every ROM computed before LA-1156 did. A lump sum always
 * multiplies by one, whatever the project's size, which is what "doesn't
 * scale with gross area" means for Site Demolition. The other two read off
 * the demolition answers and read as zero when the answer behind them has
 * not arrived yet, so a line with nothing to multiply by prices at zero
 * rather than throwing: a job that never answered the demolition questions
 * carries nothing for these items, the same silence-prices-as-nothing shape
 * `readDemolitionFacts` above already gives every other caller.
 */
export function quantityFor(
  unit: BenchmarkUnit,
  grossSquareFeet: number,
  demolition: DemolitionFacts,
): number {
  switch (unit) {
    case "usd_per_gsf":
      return grossSquareFeet;
    case "usd_lump_sum":
      return 1;
    case "usd_per_sf_of_structure":
      return demolition.structureSquareFeet ?? 0;
    case "usd_each_structure":
      return demolition.structureCount ?? 0;
  }
}

/** Whether item 1a prices the full span rather than one row's blend: no structure-type answer yet, or an explicit "Don't Know" (ADR 0006). */
export function isFullSpan(
  structureType: DemolitionStructureType | null,
): structureType is null | "dont_know" {
  return structureType === null || structureType === "dont_know";
}

/**
 * Whether item 1a has anything to price at all. No square footage of
 * structure yet, or a literal zero, both mean the driver has not been
 * brought into the budget: no count of structures has been answered, the
 * follow-up questions never opened, or the count is zero. Either way item
 * 1a produces no line, not a line priced at zero.
 *
 * This matters past this file's own math: LA-1154 (ADR 0006's relationships)
 * reads a priced line on item 1a as what brings its four supporting items,
 * the disconnects (28a, 28b, 31f, 36a), into the budget. A $0 line here
 * would wrongly bring all four in on every job, including one that never
 * answered a single demolition question. `branch_gate_items` has no row for
 * item 1a on purpose -- that would be a new stated rule of Matt's to make,
 * not this ticket's to add -- so this quantity check is the only thing
 * standing between "no answer" and "a driver brought in."
 */
export function hasStructureDemolitionScope(demolition: DemolitionFacts): boolean {
  return (demolition.structureSquareFeet ?? 0) > 0;
}

/**
 * Item 1a's rows for a known structure type: the one row Matt stated for
 * that type, so the ordinary single-row blend (whatever the rest of the
 * engine already does for one comparable) prices it. Falls back to every row
 * only if the data is missing the type it was asked to find, which never
 * happens against the five rates this ticket seeds; it is a safety net, not
 * a documented path.
 */
export function structureDemolitionRows(
  rows: readonly Benchmark[],
  structureType: DemolitionStructureType,
): readonly Benchmark[] {
  const matched = rows.filter((row) => row.structureType === structureType);
  return matched.length > 0 ? matched : rows;
}

/**
 * Item 1a with no known structure type (ADR 0006): "Don't Know shows the
 * full span, from the lowest rate to the highest, flagged." A weighted
 * blend with a spread around its midpoint would not land on the two stated
 * endpoints, so this prices directly from the rates on record instead of
 * going through the ordinary blend for its money. `blend` still supplies the
 * shell, the ordinary blend's label, classification and comparables, so the
 * line reads as Structure Demolition and cites every rate behind it.
 */
export function structureDemolitionSpanLine(
  rows: readonly Benchmark[],
  structureSquareFeet: number,
  blend: (rows: Benchmark[]) => RomLine,
): RomLine {
  const shell = blend([...rows]);
  const rates = rows.map((row) => row.value);
  return {
    ...shell,
    low: Math.round(Math.min(...rates) * structureSquareFeet),
    high: Math.round(Math.max(...rates) * structureSquareFeet),
    confidence: "low",
    heldForReview: true,
  };
}

/**
 * Item 1a, start to finish: a known structure type blends that type's own
 * rate the ordinary way (one comparable, the engine's usual one-source
 * spread); "Don't Know," or no answer yet, prices the full span instead. This
 * is the one place `rom.ts` needs to special-case cost code "1a", the same
 * shape it already special-cases items 8 and 17 for framing.
 */
export function priceStructureDemolition(
  rows: readonly Benchmark[],
  demolition: DemolitionFacts,
  blend: (rows: Benchmark[]) => RomLine,
): RomLine {
  if (isFullSpan(demolition.structureType)) {
    return structureDemolitionSpanLine(rows, demolition.structureSquareFeet ?? 0, blend);
  }
  return blend([...structureDemolitionRows(rows, demolition.structureType)]);
}
