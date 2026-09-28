import { describe, expect, it } from "vitest";

import { computeRom, type Answers, type Benchmark, type DataSnapshot, type EngineParameters } from "./rom";
import type { BranchGateItemRule } from "./rom-gates";

// LA-1205, end to end through computeRom: item 26 priced per stop by V-1's
// type, a correction changing the price, stops including a served
// below-grade level, and item 26a, the bulkhead, priced per shaft.

function parameter(value: number) {
  return {
    value,
    provenance: { kind: "reviewed_judgment" as const, recordedBy: "automated test", recordedAt: "2026-09-27", reason: "synthetic" },
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

function elevatorRate(elevatorType: "hydraulic" | "traction", value: number): Benchmark {
  return {
    costCode: "26",
    label: "Elevators",
    unit: "usd_per_stop",
    value,
    elevatorType,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "reviewed_judgment",
      sourceProjectIds: [],
      exportLabel: null,
      recordedBy: "Matt Nicosia",
      recordedAt: "2026-09-27",
    },
    scopeSide: "building",
    contractSide: "kulka",
  };
}

function bulkheadRate(config: "single_car" | "shared_two_car" | "door_package", value: number): Benchmark {
  return {
    costCode: "26a",
    label: "Elevator Bulkhead",
    unit: "usd_lump_sum",
    value,
    elevatorBulkheadConfig: config,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "reviewed_judgment",
      sourceProjectIds: [],
      exportLabel: null,
      recordedBy: "Matt Nicosia",
      recordedAt: "2026-09-27",
    },
    scopeSide: "building",
    contractSide: "kulka",
  };
}

const ELEVATOR_RATES = [elevatorRate("hydraulic", 35000), elevatorRate("traction", 45300)];
const BULKHEAD_RATES = [
  bulkheadRate("single_car", 16600),
  bulkheadRate("shared_two_car", 28700),
  bulkheadRate("door_package", 2200),
];

function answers(over: Partial<Answers> & { facts?: Record<string, string | number | boolean> } = {}): Answers {
  return { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 100000, ...over };
}

function snapshot(benchmarks: Benchmark[], branchGateItems: BranchGateItemRule[] = []): DataSnapshot {
  return { benchmarks, parameters: parameters(), branchGateItems };
}

// Item 26 goes through the engine's ordinary blend, the same as every other
// cost code (LA-1205 only picks which row(s) feed it and what quantity the
// rate multiplies by) -- so a line here is still a range, never a point
// (rom.test.ts: "returns a ranged line, never a point"). These synthetic
// rates carry no source project, so they blend at "low" confidence and the
// engine's own spread.low widens the range around the midpoint; the
// midpoint itself is what LA-1205's math is responsible for.
const midpoint = (line: { low: number; high: number }) => (line.low + line.high) / 2;

describe("item 26, Elevators, priced per stop by V-1's type", () => {
  it("prices at the hydraulic rate for 2 elevators, 6 stops each", () => {
    const rom = computeRom(
      answers({ facts: { elevatorType: "hydraulic", elevatorCount: 2, storiesAboveGrade: 6 } }),
      snapshot(ELEVATOR_RATES),
    );
    const line = rom.lines.find((l) => l.costCode === "26")!;
    expect(midpoint(line)).toBe(35000 * 12);
    expect(line.low).toBeLessThan(line.high);
  });

  it("a correction to V-1 (traction instead of hydraulic) changes the price", () => {
    const rom = computeRom(
      answers({ facts: { elevatorType: "traction", elevatorCount: 2, storiesAboveGrade: 6 } }),
      snapshot(ELEVATOR_RATES),
    );
    const line = rom.lines.find((l) => l.costCode === "26")!;
    expect(midpoint(line)).toBe(45300 * 12);
  });

  it("stops include a served below-grade level", () => {
    const rom = computeRom(
      answers({
        facts: { elevatorType: "hydraulic", elevatorCount: 1, storiesAboveGrade: 6, levels_below_grade: "yes" },
      }),
      snapshot(ELEVATOR_RATES),
    );
    const line = rom.lines.find((l) => l.costCode === "26")!;
    // 6 stories + 1 served below-grade level = 7 stops.
    expect(midpoint(line)).toBe(35000 * 7);
  });

  it("produces no line with no elevator count", () => {
    const rom = computeRom(answers({ facts: { storiesAboveGrade: 6 } }), snapshot(ELEVATOR_RATES));
    expect(rom.lines.find((l) => l.costCode === "26")).toBeUndefined();
  });

  it("the elevator gate answered no zeroes item 26 and item 26a alike", () => {
    const gateItems: BranchGateItemRule[] = [
      { section: "elevator", costCode: "26", closesOn: ["no"], requiresAllSections: [], statedBy: "t", statedOn: "2026-09-27", reason: "r" },
      { section: "elevator", costCode: "26a", closesOn: ["no"], requiresAllSections: [], statedBy: "t", statedOn: "2026-09-27", reason: "r" },
    ];
    const rom = computeRom(
      answers({
        facts: { elevator: "no", elevatorType: "hydraulic", elevatorCount: 2, storiesAboveGrade: 6 },
        branchGates: { elevator: "no" },
      }),
      snapshot([...ELEVATOR_RATES, ...BULKHEAD_RATES], gateItems),
    );
    expect(rom.notInThisJob.map((i) => i.costCode).sort()).toEqual(["26", "26a"]);
    expect(rom.total.low).toBe(0);
  });
});

describe("item 26a, the elevator bulkhead", () => {
  it("one elevator: the single-car rate", () => {
    const rom = computeRom(answers({ facts: { elevatorCount: 1 } }), snapshot(BULKHEAD_RATES));
    const line = rom.lines.find((l) => l.costCode === "26a")!;
    expect(line.low).toBe(16600);
    expect(line.high).toBe(16600);
  });

  it("two elevators sharing one bulkhead: the shared-two-car rate", () => {
    const rom = computeRom(answers({ facts: { elevatorCount: 2 } }), snapshot(BULKHEAD_RATES));
    const line = rom.lines.find((l) => l.costCode === "26a")!;
    expect(line.low).toBe(28700);
    expect(line.high).toBe(28700);
  });

  it("three elevators: one shared pair plus one single-car bulkhead", () => {
    const rom = computeRom(answers({ facts: { elevatorCount: 3 } }), snapshot(BULKHEAD_RATES));
    const line = rom.lines.find((l) => l.costCode === "26a")!;
    expect(line.low).toBe(28700 + 16600);
  });

  it("produces no line with no elevator count", () => {
    const rom = computeRom(answers(), snapshot(BULKHEAD_RATES));
    expect(rom.lines.find((l) => l.costCode === "26a")).toBeUndefined();
  });
});
