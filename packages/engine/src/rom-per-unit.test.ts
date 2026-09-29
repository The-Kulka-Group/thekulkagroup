import { describe, expect, it } from "vitest";

import { computeRom, type Answers, type Benchmark, type DataSnapshot, type EngineParameters } from "./rom";

// LA-1323, end to end through computeRom: the unit trades Matt confirmed on
// 2026-09-28 price per dwelling unit off each source job's own area per
// unit, and everything else still prices per square foot.

function parameter(value: number) {
  return {
    value,
    provenance: { kind: "reviewed_judgment" as const, recordedBy: "automated test", recordedAt: "2026-09-28", reason: "synthetic" },
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

function rate(costCode: string, label: string, value: number, sourceGsfPerUnit?: number, source = "job-a"): Benchmark {
  return {
    costCode,
    label,
    unit: "usd_per_gsf",
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "proest_budget",
      sourceProjectIds: [source],
      exportLabel: null,
      recordedBy: "automated test",
      recordedAt: "2026-09-28",
    },
    scopeSide: "building",
    contractSide: "kulka",
    ...(sourceGsfPerUnit ? { sourceGsfPerUnit } : {}),
  };
}

function answers(facts: Record<string, string | number | boolean> = {}): Answers {
  return { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 100000, facts };
}

function snapshot(benchmarks: Benchmark[]): DataSnapshot {
  return { benchmarks, parameters: parameters() };
}

const midpoint = (line: { low: number; high: number }) => (line.low + line.high) / 2;

// Fieldstone's Plumbing: $14.27/GSF at 188,522 GSF over 104 units, about
// 1,812.7 GSF a unit, so $25,866 a unit.
const FIELDSTONE_GSF_PER_UNIT = 188522 / 104;

describe("per-unit trades (LA-1323)", () => {
  it("prices Plumbing at the source job's dollars per unit times this project's units", () => {
    const rom = computeRom(answers({ unitCount: 80 }), snapshot([rate("28", "Plumbing", 14.27, FIELDSTONE_GSF_PER_UNIT)]));
    const line = rom.lines.find((l) => l.costCode === "28")!;
    const perUnit = 14.27 * FIELDSTONE_GSF_PER_UNIT;
    expect(midpoint(line)).toBeCloseTo(perUnit * 80, -1);
    expect(line.perUnit).toEqual({ unitCount: 80, usdPerUnit: Math.round(perUnit), projectGsfPerUnit: 100000 / 80 });
  });

  it("more units at the same area cost more; area alone no longer moves it", () => {
    const rows = [rate("22", "Appliances", 1.36, FIELDSTONE_GSF_PER_UNIT)];
    const at80 = midpoint(computeRom(answers({ unitCount: 80 }), snapshot(rows)).lines[0]);
    const at120 = midpoint(computeRom(answers({ unitCount: 120 }), snapshot(rows)).lines[0]);
    expect(at120 / at80).toBeCloseTo(1.5, 2);

    const bigger = computeRom({ ...answers({ unitCount: 80 }), grossSquareFeet: 150000 }, snapshot(rows)).lines[0];
    expect(midpoint(bigger)).toBeCloseTo(at80, -1);
  });

  it("blends two jobs per unit, so jobs of different density agree", () => {
    // Two jobs with the same $/unit but very different $/GSF.
    const rows = [
      rate("28", "Plumbing", 14.27, 188522 / 104, "fieldstone"),
      rate("28", "Plumbing", 21.92, 65000 / 55, "jefferson"),
    ];
    const line = computeRom(answers({ unitCount: 100 }), snapshot(rows)).lines[0];
    expect(line.perUnit!.usdPerUnit).toBeGreaterThan(25800);
    expect(line.perUnit!.usdPerUnit).toBeLessThan(26000);
  });

  it("prices per square foot as before when no unit count was answered", () => {
    const line = computeRom(answers(), snapshot([rate("28", "Plumbing", 14.27, FIELDSTONE_GSF_PER_UNIT)])).lines[0];
    expect(midpoint(line)).toBeCloseTo(14.27 * 100000, -1);
    expect(line.perUnit).toBeUndefined();
  });

  it("prices per square foot when the source job recorded no units", () => {
    const line = computeRom(answers({ unitCount: 80 }), snapshot([rate("28", "Plumbing", 14.27)])).lines[0];
    expect(midpoint(line)).toBeCloseTo(14.27 * 100000, -1);
    expect(line.perUnit).toBeUndefined();
  });

  it("leaves Painting and Overhead Doors per square foot", () => {
    const rom = computeRom(
      answers({ unitCount: 80 }),
      snapshot([rate("20", "Painting", 2.71, FIELDSTONE_GSF_PER_UNIT), rate("15a", "Overhead Doors", 0.1, FIELDSTONE_GSF_PER_UNIT)]),
    );
    for (const line of rom.lines) {
      expect(line.perUnit).toBeUndefined();
    }
    expect(midpoint(rom.lines.find((l) => l.costCode === "20")!)).toBeCloseTo(2.71 * 100000, -1);
  });
});
