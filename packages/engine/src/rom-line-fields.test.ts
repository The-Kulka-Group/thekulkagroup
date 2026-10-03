import { describe, expect, it } from "vitest";

import {
  computeRom,
  type Answers,
  type Benchmark,
  type BlockClassification,
  type DataSnapshot,
  type EngineParameters,
  type JudgmentRule,
} from "./rom";
import type { BranchGateItemRule } from "./rom-gates";
import type { ScopeRelationship } from "./rom-relationships";
import type { BenchmarkUnit } from "./rom-units";

// LA-1502: the fields the engine sets for the budget drill-down. Each line
// names the quantity its rate multiplied by and the answers it prices on, and
// each comparable names the unit its figure is stated in.

function parameter(value: number) {
  return {
    value,
    provenance: { kind: "reviewed_judgment" as const, recordedBy: "automated test", recordedAt: "2026-10-02", reason: "synthetic" },
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

function rate(costCode: string, label: string, unit: BenchmarkUnit, value: number, extra: Partial<Benchmark> = {}): Benchmark {
  return {
    costCode,
    label,
    unit,
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "proest_budget",
      sourceProjectIds: ["job-a"],
      exportLabel: "synthetic",
      recordedBy: "automated test",
      recordedAt: "2026-10-02",
    },
    scopeSide: "building",
    contractSide: "kulka",
    ...extra,
  };
}

const ANSWERS: Answers = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 50000,
  framingSystem: "wood",
  facts: {
    unitCount: 50,
    storiesAboveGrade: 4,
    elevatorCount: 2,
    elevatorType: "hydraulic",
    levels_below_grade: "no",
    balconies: "yes",
    basement: "yes",
  },
};

function snapshot(over: Partial<DataSnapshot>): DataSnapshot {
  return { benchmarks: [], parameters: parameters(), ...over };
}

const line = (rom: ReturnType<typeof computeRom>, costCode: string) => rom.lines.find((l) => l.costCode === costCode)!;

describe("a line's quantity and its comparables' unit", () => {
  it("records the quantity a per-square-foot rate multiplied by, and each figure's unit", () => {
    const rom = computeRom(ANSWERS, snapshot({ benchmarks: [rate("20", "Painting", "usd_per_gsf", 3)] }));
    const painting = line(rom, "20");
    expect(painting.quantity).toEqual({ amount: 50000, unit: "usd_per_gsf" });
    expect(painting.comparables.map((c) => c.unit)).toEqual(["usd_per_gsf"]);
  });

  it("records an elevator's stops as its quantity, and names no quantity for the bulkhead's shaft pairing", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot({
        benchmarks: [
          rate("26", "Elevators", "usd_per_stop", 35000, { elevatorType: "hydraulic" }),
          rate("26a", "Elevator Bulkhead", "usd_lump_sum", 16600, { elevatorBulkheadConfig: "single_car" }),
          rate("26a", "Elevator Bulkhead", "usd_lump_sum", 28700, { elevatorBulkheadConfig: "shared_two_car" }),
        ],
      }),
    );
    expect(line(rom, "26").quantity).toEqual({ amount: 8, unit: "usd_per_stop" });
    expect(line(rom, "26a").quantity).toBeNull();
  });
});

describe("the answers a line prices on", () => {
  it("names the square feet for a per-square-foot line and nothing for a lump sum", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot({ benchmarks: [rate("20", "Painting", "usd_per_gsf", 3), rate("1", "Site Demolition", "usd_lump_sum", 25000)] }),
    );
    expect(line(rom, "20").inputs).toEqual(["grossSquareFeet"]);
    expect(line(rom, "1").inputs).toEqual([]);
  });

  it("names the unit count, not the square feet, for a per-unit trade", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot({ benchmarks: [rate("28", "Plumbing", "usd_per_gsf", 20, { sourceGsfPerUnit: 1000 })] }),
    );
    expect(line(rom, "28").perUnit).toBeDefined();
    expect(line(rom, "28").inputs).toEqual(["unitCount"]);
  });

  it("names the framing system on items 8 and 17", () => {
    const rom = computeRom(ANSWERS, snapshot({ benchmarks: [rate("8", "Wood Framing", "usd_per_gsf", 30)] }));
    expect(line(rom, "8").inputs).toEqual(["framingSystem", "grossSquareFeet"]);
  });

  it("names what an elevator's stops and type read, and the bulkhead's elevator count", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot({
        benchmarks: [
          rate("26", "Elevators", "usd_per_stop", 35000, { elevatorType: "hydraulic" }),
          rate("26a", "Elevator Bulkhead", "usd_lump_sum", 16600, { elevatorBulkheadConfig: "single_car" }),
          rate("26a", "Elevator Bulkhead", "usd_lump_sum", 28700, { elevatorBulkheadConfig: "shared_two_car" }),
        ],
      }),
    );
    expect(line(rom, "26").inputs).toEqual(["elevatorCount", "elevatorType", "levels_below_grade", "storiesAboveGrade"]);
    expect(line(rom, "26a").inputs).toEqual(["elevatorCount"]);
  });

  it("names the gate that switches a line and the fact an applied judgment rule turns on", () => {
    const gate: BranchGateItemRule = {
      costCode: "11",
      section: "balconies",
      requiresAllSections: [],
      closesOn: ["no"],
      statedBy: "automated test",
      statedOn: "2026-10-02",
      reason: "synthetic",
    };
    const rule: JudgmentRule = {
      id: "rule-1",
      costCode: "11",
      projectType: "multifamily",
      constructionKind: "new",
      condition: { fact: "basement", equals: "yes" },
      adjustmentUsdPerGsf: 1,
      provenance: { kind: "reviewed_judgment", sourceProjectIds: [], exportLabel: null, recordedBy: "automated test", recordedAt: "2026-10-02" },
    };
    const rom = computeRom(
      ANSWERS,
      snapshot({ benchmarks: [rate("11", "Balconies", "usd_per_gsf", 4)], branchGateItems: [gate], judgmentRules: [rule] }),
    );
    expect(line(rom, "11").inputs).toEqual(["balconies", "basement", "grossSquareFeet"]);
  });

  it("names a supporting item's relationship condition and its driver's gates", () => {
    const gate: BranchGateItemRule = {
      costCode: "26",
      section: "elevator",
      requiresAllSections: [],
      closesOn: ["no"],
      statedBy: "automated test",
      statedOn: "2026-10-02",
      reason: "synthetic",
    };
    const relationship: ScopeRelationship = {
      driverCostCode: "26",
      supportingCostCode: "26g",
      supportingLabel: "Machine Room HVAC",
      quantityRule: "one_per_machine_room",
      condition: { fact: "elevatorType", equals: "hydraulic" },
      statedBy: "automated test",
      statedOn: "2026-10-02",
      reason: "synthetic",
    };
    const rom = computeRom(
      { ...ANSWERS, facts: { ...ANSWERS.facts, elevator: "yes", elevatorMachineRooms: 1 } },
      snapshot({
        benchmarks: [
          rate("26", "Elevators", "usd_per_stop", 35000, { elevatorType: "hydraulic" }),
          rate("26g", "Machine Room HVAC", "usd_each_machine_room", 9000),
        ],
        branchGateItems: [gate],
        scopeRelationships: [relationship],
      }),
    );
    expect(line(rom, "26g").inputs).toEqual(["elevator", "elevatorMachineRooms", "elevatorType"]);
  });
});

describe("an unpriced item's element", () => {
  it("names the element its classification states, and none when it has no classification", () => {
    const classification: BlockClassification = {
      costCode: "28a",
      detailLevel: 2,
      element: "Demolition",
      breakoutOfCostCode: null,
      buyoutPackage: "Plumbing",
      division: "22",
      ledgerDivision: "33",
      statedBy: "automated test",
      statedOn: "2026-10-02",
      reason: "synthetic",
    };
    const rom = computeRom(
      ANSWERS,
      snapshot({
        classifications: [classification],
        unpricedInScopeItems: [
          { costCode: "28a", label: "Plumbing Disconnect and Cap" },
          { costCode: "99z", label: "Something Unclassified" },
        ],
      }),
    );
    expect(rom.unpricedItems).toEqual([
      { costCode: "28a", label: "Plumbing Disconnect and Cap", element: "Demolition" },
      { costCode: "99z", label: "Something Unclassified" },
    ]);
  });
});
