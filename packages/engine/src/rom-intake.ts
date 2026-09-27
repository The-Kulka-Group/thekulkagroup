// Small, pure functions for the intake mechanics LA-816 catches the schema up
// to: the GSF-per-unit proposal (LA-678), parking's two benchmarks (LA-682),
// the shared branch-gate pricing rule every permanent gate follows (LA-676,
// LA-694), and the closing-comparison score (LA-680, ADR 0005). Each is
// independent of `computeRom` in rom.ts, which owns the blend, the ranges,
// and the flags (LA-14); wiring these into a single intake pipeline that
// reads every new project column belongs with the tier-1 question flow
// (LA-20), not with either.
//
// Everything here is a pure function of its arguments, same rule as rom.ts:
// nothing reads a clock, a network, or a database.

/** LA-677's resolution: "built at once, in phases, or don't know." */
export type Phasing = "built_at_once" | "phased" | "dont_know";

/**
 * The structure types item 1a, Structure Demolition, prices by (ADR 0006,
 * LA-1155's `demolition_structure_type` question). Matches
 * `config/rom/tier1-flow.json`'s choice values exactly; LA-1156's per-square-
 * foot rate table keys off these six values, read from the run's intake
 * fields, not from a typed `Answers` property.
 */
export type DemolitionStructureType =
  | "wood_frame_type_v"
  | "masonry_bearing_wall_type_iii"
  | "pre_engineered_metal_or_light_steel"
  | "steel_frame_concrete_metal_deck_type_ii"
  | "cast_in_place_concrete_frame_type_i"
  | "dont_know";

/** LA-682's resolution: parking's required minimum branch gate. */
export type ParkingType = "none" | "surface" | "structured" | "underground" | "dont_know";

/**
 * Every permanent branch gate's three answers (CONTEXT.md: Branch gate).
 * "no" prices its section at zero; "don't know" shows TBD and stays out of
 * the total; silence (asking nothing yet) is a separate, unanswered state
 * that this type does not model, because a gate with no answer never reaches
 * pricing at all.
 */
export type BranchGateAnswer = "yes" | "no" | "dont_know";

export type BranchGateResult =
  | { status: "priced"; low: number; high: number }
  | { status: "zero" }
  | { status: "tbd" };

/**
 * Prices one branch-gated section of the intake (CONTEXT.md: Branch gate. "A
 * 'no' prices that section at zero. A 'don't know' shows TBD on the schedule
 * of values and is left out of the total.").
 *
 * `computeIfYes` only runs on a "yes" answer, so a caller never has to guard
 * its own pricing logic against an unanswered or negative gate.
 */
export function priceBranchGatedSection(
  answer: BranchGateAnswer,
  computeIfYes: () => { low: number; high: number },
): BranchGateResult {
  if (answer === "no") return { status: "zero" };
  if (answer === "dont_know") return { status: "tbd" };
  const { low, high } = computeIfYes();
  return { status: "priced", low, high };
}

export type GrossSquareFeetProposal = {
  grossSquareFeet: number;
  /** LA-678: "flagged low confidence" on every proposal, no exceptions. */
  confidence: "low";
  /** Shown on the face of the ROM as an assumption, arithmetic included. */
  assumption: string;
};

/**
 * Proposes gross square feet from a unit count and a GSF-per-unit benchmark
 * (LA-678: "the tool proposes gross square feet from a stored GSF-per-unit
 * benchmark... It stores gross square feet per unit directly... so the whole
 * system stays on one denominator.").
 */
export function proposeGrossSquareFeet(
  unitCount: number,
  grossSquareFeetPerUnit: number,
): GrossSquareFeetProposal {
  if (!(unitCount > 0)) {
    throw new Error("Unit count must be above zero to propose gross square feet.");
  }
  if (!(grossSquareFeetPerUnit > 0)) {
    throw new Error("Gross square feet per unit must be above zero.");
  }

  const grossSquareFeet = Math.round(unitCount * grossSquareFeetPerUnit);
  return {
    grossSquareFeet,
    confidence: "low",
    assumption:
      `Proposed ${grossSquareFeet.toLocaleString("en-US")} gross square feet from ` +
      `${unitCount.toLocaleString("en-US")} units at ${grossSquareFeetPerUnit.toLocaleString("en-US")} GSF/unit.`,
  };
}

export type ParkingRate = { low: number; high: number };

export type ParkingPricing = {
  /** Site scope. Applies on every project regardless of parking type. */
  basePaving: { low: number; high: number; scopeSide: "site" };
  /**
   * Building scope. Zero for `none` and `surface`. Null for `dont_know`,
   * which is TBD, same as any other branch-gate "don't know" (CONTEXT.md).
   */
  structuredOrUndergroundIncrement:
    | { low: number; high: number; scopeSide: "building" }
    | null;
};

/**
 * Prices parking as two benchmarks, both on gross square feet (LA-682: "a
 * base paving rate that always applies (site scope), and a
 * structured-or-underground increment on top of it (building scope) that is
 * zero for surface and none"). No stall count is an input anywhere in this
 * function, matching the decision: "No stall count is ever asked or stored;
 * there is no Kulka data behind one."
 */
export function priceParking(
  grossSquareFeet: number,
  parkingType: ParkingType,
  basePavingRate: ParkingRate,
  structuredOrUndergroundIncrementRate: ParkingRate,
): ParkingPricing {
  if (!(grossSquareFeet > 0)) {
    throw new Error("Gross square feet must be above zero to price parking.");
  }

  const basePaving = {
    low: Math.round(grossSquareFeet * basePavingRate.low),
    high: Math.round(grossSquareFeet * basePavingRate.high),
    scopeSide: "site" as const,
  };

  if (parkingType === "dont_know") {
    return { basePaving, structuredOrUndergroundIncrement: null };
  }

  if (parkingType === "structured" || parkingType === "underground") {
    return {
      basePaving,
      structuredOrUndergroundIncrement: {
        low: Math.round(grossSquareFeet * structuredOrUndergroundIncrementRate.low),
        high: Math.round(grossSquareFeet * structuredOrUndergroundIncrementRate.high),
        scopeSide: "building",
      },
    };
  }

  // none or surface: the increment is zero, not TBD, because both are known
  // answers that resolve to no structured/underground scope at all.
  return {
    basePaving,
    structuredOrUndergroundIncrement: { low: 0, high: 0, scopeSide: "building" },
  };
}

/**
 * ADR 0005's bar: a ROM passes when its undialed midpoint lands within this
 * many percent of trade cost. The closing comparison and the backtest (LA-23)
 * both score against it.
 */
export const PASS_BAR_PERCENT = 10;

export type ClosingComparisonScore = {
  /** Signed: positive means the ROM's midpoint predicted high. */
  percentError: number;
  /** ADR 0005's 10 percent bar, reused for the closing comparison (LA-680). */
  withinTenPercent: boolean;
};

/**
 * Scores an issued ROM's predicted trade cost against a linked project's
 * actual trade cost (LA-680: "predicted trade cost from the ROM against
 * actual trade cost from the import, at the same 10-percent bar the backtest
 * already uses"). Pure scoring only; nothing here imports data or writes a
 * row. See `lib/rom/issue.ts` for the write path that calls this once a real
 * import exists (LA-15).
 */
export function scoreClosingComparison(
  predictedTradeCost: { low: number; high: number },
  actualTradeCost: number,
): ClosingComparisonScore {
  if (!(actualTradeCost >= 0)) {
    throw new Error("Actual trade cost must not be negative.");
  }

  const midpoint = (predictedTradeCost.low + predictedTradeCost.high) / 2;

  // Fixed in code review (2026-09-20): this used to throw on exactly zero,
  // but closing_comparisons.actual_trade_cost allows it (`>= 0`). A zero
  // actual is division by zero for a relative percent error. When the ROM
  // also predicted zero, that is a perfect match. When it predicted
  // anything above zero, the relative error is mathematically infinite and
  // `numeric` cannot store Infinity or NaN, so this stores the largest
  // finite percent error the column will ever see as an explicit sentinel
  // rather than crash or silently invent a smaller, misleadingly precise
  // number. What a zero actual import really means in practice is real
  // import data LA-15 hasn't supplied yet, not something to settle here.
  const percentError =
    actualTradeCost === 0
      ? midpoint === 0
        ? 0
        : Number.MAX_SAFE_INTEGER
      : ((midpoint - actualTradeCost) / actualTradeCost) * 100;

  return {
    percentError,
    withinTenPercent: Math.abs(percentError) <= PASS_BAR_PERCENT,
  };
}
