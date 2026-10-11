import { describe, expect, it } from "vitest";

import { computeRom, type Answers, type Benchmark, type DataSnapshot, type EngineParameters } from "./rom";
import type { BranchGateItemRule } from "./rom-gates";
import type { BenchmarkUnit } from "./rom-units";

// LA-2216, end to end through computeRom: a podium garage's area is a derived
// quantity from the podium footprint. The podium deck (3), garage electrical
// (31g) and garage sprinklers (27a) price on it, and the whole-building
// electrical (31) and sprinklers (27) drop it. A missing fact leaves a named
// blank, never a $0 line.

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

const GARAGE_RATES = [
  rate("3", "Podium Deck", "usd_per_sf_of_garage", 34.13),
  rate("31g", "Garage Electrical", "usd_per_sf_of_garage", 18),
  rate("27a", "Garage Sprinklers", "usd_per_sf_of_garage", 6),
];
const WHOLE_BUILDING = [
  rate("31", "Electrical", "usd_per_gsf", 24),
  rate("27", "Fire Sprinklers", "usd_per_gsf", 6),
];

const parkingGate = (costCode: string): BranchGateItemRule => ({
  section: "parkingType",
  costCode,
  closesOn: ["none", "surface"],
  requiresAllSections: [],
  statedBy: "t",
  statedOn: "2026-10-11",
  reason: "r",
});
const GATES = ["3", "27a", "31g"].map(parkingGate);

function answers(facts: Record<string, string | number | boolean>): Answers {
  return { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 100000, facts };
}

function snapshot(benchmarks: Benchmark[]): DataSnapshot {
  return { benchmarks, parameters: parameters(), branchGateItems: GATES };
}

const midpoint = (line: { low: number; high: number }) => (line.low + line.high) / 2;
const lineOf = (rom: ReturnType<typeof computeRom>, code: string) => rom.lines.find((l) => l.costCode === code);

describe("a podium garage priced by garage area", () => {
  // 100,000 GSF over 5 stories: a 20,000 SF footprint, one podium level of garage.
  const podium = { parkingType: "structured", storiesAboveGrade: 5 };

  it("prices the deck, garage electrical and garage sprinklers on the garage area", () => {
    const rom = computeRom(answers(podium), snapshot(GARAGE_RATES));
    expect(midpoint(lineOf(rom, "3")!)).toBeCloseTo(20000 * 34.13);
    expect(midpoint(lineOf(rom, "31g")!)).toBe(20000 * 18);
    expect(midpoint(lineOf(rom, "27a")!)).toBe(20000 * 6);
    expect(lineOf(rom, "31g")!.quantity).toEqual({ amount: 20000, unit: "usd_per_sf_of_garage" });
  });

  it("drops the garage area from the whole-building electrical and sprinklers", () => {
    const rom = computeRom(answers(podium), snapshot([...GARAGE_RATES, ...WHOLE_BUILDING]));
    expect(lineOf(rom, "31")!.quantity).toEqual({ amount: 80000, unit: "usd_per_gsf" });
    expect(midpoint(lineOf(rom, "31")!)).toBe(80000 * 24);
    expect(midpoint(lineOf(rom, "27")!)).toBe(80000 * 6);
  });

  it("keeps the whole-building items on full gross area when no garage item has a rate", () => {
    const rom = computeRom(answers(podium), snapshot(WHOLE_BUILDING));
    expect(midpoint(lineOf(rom, "31")!)).toBe(100000 * 24);
    expect(midpoint(lineOf(rom, "27")!)).toBe(100000 * 6);
  });
});

describe("a surface lot", () => {
  it("removes the deck and both garage items and keeps the whole building on full gross area", () => {
    const rom = computeRom(
      answers({ parkingType: "surface", storiesAboveGrade: 5 }),
      snapshot([...GARAGE_RATES, ...WHOLE_BUILDING]),
    );
    expect(rom.notInThisJob.map((item) => item.costCode).sort()).toEqual(["27a", "3", "31g"]);
    expect(midpoint(lineOf(rom, "31")!)).toBe(100000 * 24);
    expect(midpoint(rom.total)).toBe(100000 * 30);
  });
});

describe("a garage area the facts cannot give", () => {
  it("leaves the garage items as named blanks when the story count is missing", () => {
    const rom = computeRom(answers({ parkingType: "structured" }), snapshot([...GARAGE_RATES, ...WHOLE_BUILDING]));
    expect(["3", "27a", "31g"].map((code) => lineOf(rom, code))).toEqual([undefined, undefined, undefined]);
    expect(rom.unpricedItems).toEqual([
      { costCode: "27a", label: "Garage Sprinklers", missing: ["Stories Above Grade"] },
      { costCode: "3", label: "Podium Deck", missing: ["Stories Above Grade"] },
      { costCode: "31g", label: "Garage Electrical", missing: ["Stories Above Grade"] },
    ]);
    // The garage stays in the whole-building items, so it is priced once and never at zero.
    expect(midpoint(rom.total)).toBe(100000 * 30);
    expect(rom.assumptions).toContain(
      "3 items have a rate but no quantity yet, because the project has no stories above grade: Garage Sprinklers, Podium Deck, Garage Electrical.",
    );
    expect(rom.assumptions.join(" ")).not.toMatch(/no rate yet/);
  });

  it("names Parking Type when nobody answered it", () => {
    const rom = computeRom(answers({ storiesAboveGrade: 5 }), snapshot(GARAGE_RATES));
    expect(rom.unpricedItems.map((item) => item.missing)).toEqual([["Parking Type"], ["Parking Type"], ["Parking Type"]]);
  });

  it("shows a don't-know parking answer as TBD, not as a blank", () => {
    const rom = computeRom(answers({ parkingType: "dont_know", storiesAboveGrade: 5 }), snapshot(GARAGE_RATES));
    expect(rom.unpricedItems).toEqual([]);
    expect(rom.tbdGateItems.map((item) => item.costCode)).toEqual(["27a", "3", "31g"]);
  });

  it("prices any other row the way it did before rather than leaving a blank", () => {
    const perGsfDeck = rate("3", "Elevated Slabs and Podium Deck", "usd_per_gsf", 10);
    const rom = computeRom(answers({ parkingType: "structured" }), snapshot([GARAGE_RATES[0], perGsfDeck]));
    expect(lineOf(rom, "3")!.quantity).toEqual({ amount: 100000, unit: "usd_per_gsf" });
    expect(rom.unpricedItems).toEqual([]);
  });
});
