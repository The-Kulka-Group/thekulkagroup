// LA-1323: trades that scale with the number of dwelling units, not the
// square footage. Matt, 2026-09-28: "Unit count should change more than
// that. Plumbing, Millwork, Appliances, Countertops, Tile, etc." He confirmed
// this list the same day. Painting stays per square foot because it also
// covers corridors and common areas; Overhead Doors (15a) is not a unit trade.
//
// Every past-job rate is recorded in dollars per gross square foot of that
// job. For these trades the engine turns each rate into dollars per unit with
// the job's own area per unit, then prices it against this project's unit
// count. The line keeps its figures in dollars per gross square foot of this
// project, so judgment rules, ranges and confidence read it the same way as
// every other line; only the density behind the figure changes.
//
// On the two jobs behind these rates the per-unit figures agree far better
// than the per-square-foot ones (Plumbing: $25,866 and $25,906 a unit against
// $14.27 and $21.92 a square foot), which is what made the case.
//
// Pure functions only, same rule as rom.ts.

import type { Benchmark } from "./rom";

/** Canonical item numbers priced per dwelling unit (Matt, 2026-09-28). */
export const PER_UNIT_COST_CODES: ReadonlySet<string> = new Set([
  "9", // Finish Carpentry
  "10", // Millwork
  "15", // Doors, Frames and Hardware
  "18", // Ceramic Tile
  "19", // Flooring and Tile
  "21", // Specialties (bath accessories, shelving, shower doors)
  "22", // Appliances
  "24", // Cabinets
  "24a", // Countertops
  "24b", // Window Treatments
  "28", // Plumbing
]);

/** The project's unit count off `Answers.facts`, or null when nobody answered it. */
export function readUnitCount(facts: Record<string, string | number | boolean> | undefined): number | null {
  const value = facts?.["unitCount"];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** What a per-unit line records beside its money, for the screen to show. */
export type PerUnitLine = {
  unitCount: number;
  /** The blended rate in dollars per dwelling unit, before the range. */
  usdPerUnit: number;
  /** This project's gross square feet per unit, which turns a comparable's rate back into dollars per unit. */
  projectGsfPerUnit: number;
};

/**
 * Rescales a per-unit trade's rows to this project's density. A row whose
 * source jobs recorded area and units gets `rate x source GSF per unit x
 * project units / project GSF`, which times the project's GSF prices it at
 * the source's dollars per unit times this project's units. A row without
 * that (a stated rule, a model's figure) stays as it is. Returns null when
 * the line is not a per-unit trade or the project has no unit count, so the
 * caller prices it per square foot exactly as before.
 */
export function scaleRowsToUnits(
  costCode: string,
  rows: Benchmark[],
  unitCount: number | null,
  grossSquareFeet: number,
): Benchmark[] | null {
  if (!PER_UNIT_COST_CODES.has(costCode) || unitCount === null || !(grossSquareFeet > 0)) return null;
  if (!rows.some((row) => row.unit === "usd_per_gsf" && (row.sourceGsfPerUnit ?? 0) > 0)) return null;
  return rows.map((row) =>
    row.unit === "usd_per_gsf" && row.sourceGsfPerUnit && row.sourceGsfPerUnit > 0
      ? { ...row, value: (row.value * row.sourceGsfPerUnit * unitCount) / grossSquareFeet }
      : row,
  );
}
