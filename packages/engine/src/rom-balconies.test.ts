import { describe, expect, it } from "vitest";

import { computeRom, type Answers, type Benchmark, type DataSnapshot, type EngineParameters } from "./rom";
import type { BranchGateItemRule } from "./rom-gates";
import type { BenchmarkUnit } from "./rom-units";

// LA-2219, end to end through computeRom: full balconies price on three
// derived quantities from the project's balcony facts. The deck (11) prices
// per SF of balcony deck, the posts and rail (11a) per LF of rail, and the
// sliding doors (15b) each, from a low and a high rate on record. A missing
// fact leaves a named blank, never a $0 line.

function parameter(value: number) {
  return {
    value,
    provenance: { kind: "reviewed_judgment" as const, recordedBy: "automated test", recordedAt: "2026-10-11", reason: "synthetic" },
  };
}

function parameters(): EngineParameters {
  const values = {
    "weight.actuals": 5,
    "weight.proest_budget": 1,
    "weight.reviewed_judgment": 0.5,
    "weight.llm_proposal": 0.25,
    "flag.high_min_comparables": 5,
    "flag.medium_min_comparables": 2,
    "spread.high": 0.1,
    "spread.medium": 0.2,
    "spread.low": 0.35,
  };
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, parameter(value)])) as EngineParameters;
}

function rate(costCode: string, label: string, unit: BenchmarkUnit, value: number): Benchmark {
  return {
    costCode,
    label,
    unit,
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: { kind: "reviewed_judgment", sourceProjectIds: [], exportLabel: null, recordedBy: "Matt Nicosia", recordedAt: "2026-10-11" },
    scopeSide: "building",
    contractSide: "kulka",
  };
}

const BALCONY_RATES = [
  rate("11", "Balcony Deck", "usd_per_sf_of_balcony", 60),
  rate("11a", "Balcony Posts and Rail", "usd_per_lf_of_rail", 300),
  rate("15b", "Sliding Doors", "usd_each_balcony_door", 1800),
  rate("15b", "Sliding Doors", "usd_each_balcony_door", 2537),
];

const gate = (section: string, costCode: string, closesOn: string[]): BranchGateItemRule => ({
  section,
  costCode,
  closesOn,
  requiresAllSections: [],
  statedBy: "t",
  statedOn: "2026-10-11",
  reason: "r",
});
const GATES = [
  gate("balconies", "11", ["no"]),
  gate("balconies", "11a", ["no"]),
  gate("balconies", "15b", ["no"]),
  gate("balconyType", "11", ["juliet"]),
  gate("balconyType", "11a", ["juliet"]),
];

function answers(facts: Record<string, string | number | boolean>): Answers {
  return { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 100000, facts };
}

function snapshot(benchmarks: Benchmark[]): DataSnapshot {
  return { benchmarks, parameters: parameters(), branchGateItems: GATES };
}

const midpoint = (line: { low: number; high: number }) => (line.low + line.high) / 2;
const lineOf = (rom: ReturnType<typeof computeRom>, code: string) => rom.lines.find((l) => l.costCode === code);

// 25 balconies, each with 110 SF of deck and 26 LF of posts and rail.
const full = {
  balconies: "yes",
  balconyType: "full",
  balconyCount: 25,
  balconyDeckSquareFeet: 110,
  balconyRailLinearFeet: 26,
};

describe("full balconies priced by their facts", () => {
  it("prices the deck per SF of balcony deck and the rail per LF", () => {
    const rom = computeRom(answers(full), snapshot(BALCONY_RATES));
    expect(lineOf(rom, "11")!.quantity).toEqual({ amount: 2750, unit: "usd_per_sf_of_balcony" });
    expect(midpoint(lineOf(rom, "11")!)).toBe(2750 * 60);
    expect(lineOf(rom, "11a")!.quantity).toEqual({ amount: 650, unit: "usd_per_lf_of_rail" });
    expect(midpoint(lineOf(rom, "11a")!)).toBe(650 * 300);
  });
});

describe("sliding doors, one to each balcony", () => {
  it("prices the doors from the low and the high on record", () => {
    const rom = computeRom(answers(full), snapshot(BALCONY_RATES));
    const doors = lineOf(rom, "15b")!;
    expect(doors.quantity).toEqual({ amount: 25, unit: "usd_each_balcony_door" });
    expect({ low: doors.low, high: doors.high }).toEqual({ low: 25 * 1800, high: 25 * 2537 });
    expect(doors.comparables).toHaveLength(2);
  });
});

describe("a balcony quantity the facts cannot give", () => {
  it("leaves the deck and the rail as named blanks when a per-balcony fact is missing", () => {
    const countOnly = { balconies: "yes", balconyType: "full", balconyCount: 25 };
    const rom = computeRom(answers(countOnly), snapshot(BALCONY_RATES));
    expect(lineOf(rom, "11")).toBeUndefined();
    expect(lineOf(rom, "11a")).toBeUndefined();
    expect(rom.unpricedItems).toEqual([
      { costCode: "11", label: "Balcony Deck", missing: ["Deck Area per Balcony"] },
      { costCode: "11a", label: "Balcony Posts and Rail", missing: ["Rail per Balcony"] },
    ]);
    // The doors need only the count, so they still price.
    expect(midpoint(lineOf(rom, "15b")!)).toBe((25 * (1800 + 2537)) / 2);
  });

  it("names the balcony count on all three when it is missing", () => {
    const noCount = { balconies: "yes", balconyType: "full", balconyDeckSquareFeet: 110, balconyRailLinearFeet: 26 };
    const rom = computeRom(answers(noCount), snapshot(BALCONY_RATES));
    expect(rom.lines.filter((line) => ["11", "11a", "15b"].includes(line.costCode))).toEqual([]);
    expect(rom.unpricedItems.map((item) => [item.costCode, item.missing])).toEqual([
      ["11", ["Balcony Count"]],
      ["11a", ["Balcony Count"]],
      ["15b", ["Balcony Count"]],
    ]);
  });

  it("names the balcony type when the follow-up is not answered", () => {
    const rom = computeRom(answers({ balconies: "yes" }), snapshot(BALCONY_RATES));
    expect(rom.unpricedItems.map((item) => item.missing)).toEqual([["Balcony Type"], ["Balcony Type"], ["Balcony Type"]]);
  });
});

describe("the balconies gate and the Full or Juliet follow-up", () => {
  it("takes the deck, rail and doors out when the units have no balconies", () => {
    const rom = computeRom(answers({ balconies: "no" }), snapshot(BALCONY_RATES));
    expect(rom.notInThisJob.map((item) => item.costCode).sort()).toEqual(["11", "11a", "15b"]);
    expect(rom.unpricedItems).toEqual([]);
    expect(midpoint(rom.total)).toBe(0);
  });

  it("takes the full balcony deck and rail out for Juliet balconies, which LA-2220 prices", () => {
    const rom = computeRom(answers({ balconies: "yes", balconyType: "juliet", balconyCount: 25 }), snapshot(BALCONY_RATES));
    expect(rom.notInThisJob.map((item) => item.costCode).sort()).toEqual(["11", "11a"]);
    expect(midpoint(rom.total)).toBe(0);
  });
});
