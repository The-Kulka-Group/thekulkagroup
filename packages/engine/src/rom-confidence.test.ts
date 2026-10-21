import { describe, expect, it } from "vitest";

import {
  computeRom,
  type Answers,
  type Benchmark,
  type DataSnapshot,
  type EngineParameters,
  type ProvenanceKind,
} from "./rom";
import { confidenceCutoffProblem } from "./rom-parameters";

// LA-2967: Jesse Snizek's estimator confidence scores (2026-10-15). A ProEst
// figure counts its job's score over 10 of its kind's weight, and one from a
// job scored at or below the cutoff stays out. Synthetic figures; the cases
// fix which rows go in and how much each counts, never a particular rate.

const SCORED_10 = "11111111-1111-4111-8111-111111111111";
const SCORED_6 = "22222222-2222-4222-8222-222222222222";
const SCORED_1 = "33333333-3333-4333-8333-333333333333";
const UNSCORED = "44444444-4444-4444-8444-444444444444";

const SCORES: Record<string, number> = { [SCORED_10]: 10, [SCORED_6]: 6, [SCORED_1]: 1 };

function row(costCode: string, project: string, value: number, kind: ProvenanceKind = "proest_budget"): Benchmark {
  return {
    costCode,
    label: `Item ${costCode}`,
    unit: "usd_per_gsf",
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind,
      sourceProjectIds: [project],
      exportLabel: "synthetic export",
      recordedBy: "automated test",
      recordedAt: "2026-10-21",
    },
    scopeSide: "building",
    contractSide: "kulka",
  };
}

function parameters(cutoff: number | null = 1): EngineParameters {
  const values: Record<string, number> = {
    "weight.actuals": 5,
    "weight.proest_budget": 1,
    "weight.reviewed_judgment": 2,
    "weight.llm_proposal": 0.5,
    "flag.high_min_comparables": 5,
    "flag.medium_min_comparables": 2,
    "spread.high": 0.1,
    "spread.medium": 0.2,
    "spread.low": 0.35,
  };
  if (cutoff !== null) values["confidence.exclude_at_or_below"] = cutoff;
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      { value, provenance: { kind: "reviewed_judgment", recordedBy: "t", recordedAt: "2026-10-21", reason: "synthetic" } },
    ]),
  ) as EngineParameters;
}

const ANSWERS: Answers = { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 1000 };

/** Null scores leave `sourceProjectConfidence` off the snapshot, as a run before LA-2967 recorded it. */
function snapshot(benchmarks: Benchmark[], scores: Record<string, number> | null = SCORES, cutoff: number | null = 1): DataSnapshot {
  return { benchmarks, parameters: parameters(cutoff), ...(scores ? { sourceProjectConfidence: scores } : {}) };
}

function midpoint(line: { low: number; high: number }): number {
  return (line.low + line.high) / 2;
}

describe("estimator confidence scores", () => {
  it("blends two ProEst figures scored 10 and 6 in a 10 to 6 ratio", () => {
    const rom = computeRom(ANSWERS, snapshot([row("5", SCORED_10, 100), row("5", SCORED_6, 20)]));
    const line = rom.lines[0];
    // (10 x 100 + 6 x 20) / 16 = $70 per GSF over 1,000 GSF.
    expect(midpoint(line)).toBeCloseTo(70_000, -1);
    const bySource = Object.fromEntries(line.comparables.map((c) => [c.sourceProjectIds[0], c]));
    expect(bySource[SCORED_10].weight).toBe(1);
    expect(bySource[SCORED_6].weight).toBeCloseTo(0.6);
    expect(bySource[SCORED_10].confidenceScore).toBe(10);
    expect(bySource[SCORED_6].confidenceScore).toBe(6);
    expect(line.scoreExcluded).toBeUndefined();
  });

  it("leaves out a job scored at or below the cutoff and names it with the reason", () => {
    const rom = computeRom(ANSWERS, snapshot([row("5", SCORED_10, 100), row("5", SCORED_1, 5)]));
    const line = rom.lines[0];
    expect(line.comparables.map((c) => c.sourceProjectIds)).toEqual([[SCORED_10]]);
    expect(midpoint(line)).toBeCloseTo(100_000, -1);
    expect(line.comparableCount).toBe(1);
    expect(line.scoreExcluded?.map((c) => c.sourceProjectIds)).toEqual([[SCORED_1]]);
    expect(line.scoreExcluded?.[0].reason).toMatch(/scored the ProEst budget behind this figure 1 of 10/);
    expect(rom.assumptions.some((a) => a.includes("1 ProEst figure stays out of the blend") && a.includes("at or below 1 of 10"))).toBe(true);
  });

  it("drops the job from every line it would have fed", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot([row("5", SCORED_1, 5), row("5", SCORED_6, 20), row("9", SCORED_1, 7), row("9", SCORED_10, 30)]),
    );
    for (const line of rom.lines) {
      expect(line.comparables.flatMap((c) => c.sourceProjectIds)).not.toContain(SCORED_1);
      expect(line.scoreExcluded?.map((c) => c.sourceProjectIds)).toEqual([[SCORED_1]]);
    }
  });

  it("names an item unpriced when the cutoff leaves it no figure", () => {
    const rom = computeRom(ANSWERS, snapshot([row("5", SCORED_10, 100), row("9", SCORED_1, 7)]));
    expect(rom.lines.map((l) => l.costCode)).toEqual(["5"]);
    expect(rom.unpricedItems.map((i) => i.costCode)).toEqual(["9"]);
    expect(rom.total.low).toBe(rom.lines[0].low);
  });

  it("prices a job with no score exactly as before", () => {
    const rows = [row("5", UNSCORED, 100), row("5", SCORED_10, 40)];
    const before = computeRom(ANSWERS, snapshot(rows, null, null));
    const after = computeRom(ANSWERS, snapshot(rows));
    expect(after.lines[0].low).toBe(before.lines[0].low);
    expect(after.lines[0].high).toBe(before.lines[0].high);
    const unscored = after.lines[0].comparables.find((c) => c.sourceProjectIds[0] === UNSCORED)!;
    expect(unscored.weight).toBe(1);
    expect(unscored.confidenceScore).toBeUndefined();
  });

  it("never reads the cutoff when no job has a score", () => {
    expect(() => computeRom(ANSWERS, snapshot([row("5", UNSCORED, 100)], {}, null))).not.toThrow();
  });

  it("refuses to run when a job has a score and no cutoff is recorded", () => {
    expect(() => computeRom(ANSWERS, snapshot([row("5", SCORED_6, 20)], SCORES, null))).toThrow(
      /confidence\.exclude_at_or_below/,
    );
  });

  it("leaves Autodesk actuals at full weight whatever their job's score", () => {
    const rom = computeRom(ANSWERS, snapshot([row("5", SCORED_1, 50, "actuals"), row("5", SCORED_6, 20)]));
    const line = rom.lines[0];
    const actuals = line.comparables.find((c) => c.kind === "actuals")!;
    expect(actuals.weight).toBe(5);
    expect(actuals.confidenceScore).toBeUndefined();
    expect(line.scoreExcluded).toBeUndefined();
  });

  it("keeps a job scored 1 at a tenth of its weight when the cutoff is 0", () => {
    const rom = computeRom(ANSWERS, snapshot([row("5", SCORED_1, 5), row("5", SCORED_10, 100)], SCORES, 0));
    const low = rom.lines[0].comparables.find((c) => c.sourceProjectIds[0] === SCORED_1)!;
    expect(low.weight).toBeCloseTo(0.1);
  });
});

describe("confidence cutoff parameter", () => {
  it("takes a whole number from 0 to 9", () => {
    for (const value of [0, 1, 5, 9]) expect(confidenceCutoffProblem(value)).toBeNull();
    for (const value of [-1, 10, 1.5, Number.NaN]) expect(confidenceCutoffProblem(value)).toMatch(/whole number from 0 to 9/);
  });
});
