// LA-2216 (spec LA-2209): the podium garage, priced by its own area.
//
// Kulka prices every line per SF of total gross area, garage included
// (Matt, 2026-09-24), and a podium is one of the building's stories above
// grade (A-1, lib/rom/construction-type-criterion.ts). So a podium garage is
// a share of the gross area the project already states: the podium
// footprint, gross area over stories, times its garage levels. Structured
// parking gives one garage level, the same rule A-1 and the stage use.
//
// Three items price on that area at VA's rates: the podium deck (item 3),
// garage electrical (31g) and garage sprinklers (27a). The whole-building
// electrical (31) and sprinklers (27) then drop it, so the garage is never
// priced twice.
//
// The area is a derived quantity (GLOSSARY.md). Where the project lacks a
// fact it needs, it names the fact and gives no number, so the items that
// read it stay blank rather than pricing as zero. Pure functions only, same
// rule as rom.ts.

import type { QuantityResult } from "./quantity-rules";
import { positiveFact } from "./rom-per-unit";

export const PODIUM_DECK_COST_CODE = "3";
export const GARAGE_ELECTRICAL_COST_CODE = "31g";
export const GARAGE_SPRINKLERS_COST_CODE = "27a";

/**
 * Each whole-building item and the garage item carved out of it. Once the
 * garage item has a rate to price on, the whole-building item's quantity
 * drops the garage area.
 */
export const GARAGE_SHARE_OF: Readonly<Record<string, string>> = {
  "27": GARAGE_SPRINKLERS_COST_CODE,
  "31": GARAGE_ELECTRICAL_COST_CODE,
};

/** Garage levels a podium garage gives: structured parking means one (A-1's rule). */
export const PODIUM_GARAGE_LEVELS = 1;

const NO_GARAGE: ReadonlySet<string> = new Set(["none", "surface"]);

const area = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * The garage's area in SF: the podium footprint (gross area over stories
 * above grade) times its garage levels. No garage (no parking, or a surface
 * lot) is a real zero. An unanswered or "don't know" parking answer names
 * Parking Type, a podium garage with no story count names Stories Above
 * Grade, and an underground garage names Garage Area, since no rule here
 * works out a garage below grade yet.
 */
export function garageArea(
  facts: Record<string, string | number | boolean> | undefined,
  grossSquareFeet: number,
): QuantityResult {
  const parking = facts?.["parkingType"];
  if (typeof parking !== "string" || parking === "dont_know") {
    return { ok: false, missing: ["Parking Type"], words: "the project has no parking type" };
  }
  if (NO_GARAGE.has(parking)) return { ok: true, value: 0, words: "no garage" };
  if (parking !== "structured") {
    return { ok: false, missing: ["Garage Area"], words: "the project has no garage area" };
  }
  const stories = positiveFact(facts, "storiesAboveGrade");
  if (stories === null) {
    return { ok: false, missing: ["Stories Above Grade"], words: "the project has no stories above grade" };
  }
  const value = Math.round((grossSquareFeet / stories) * PODIUM_GARAGE_LEVELS);
  return {
    ok: true,
    value,
    words: `${area(value)} SF, the podium footprint (${area(grossSquareFeet)} SF over ${stories} stories) for ${PODIUM_GARAGE_LEVELS} garage level`,
  };
}
