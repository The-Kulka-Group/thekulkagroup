import { describe, expect, it } from "vitest";

import type { Answers, Benchmark } from "@kulka/engine";

import type { ImpactData, ParameterHistoryEntry } from "@/lib/rom/parameters";

import {
  changedNames,
  currentValues,
  draftsFor,
  formatValue,
  impactRows,
  inputText,
  nudge,
  parseInput,
  problemsByName,
  valuesFrom,
  weightShares,
  workedExample,
  type Values,
} from "./parameters-view";

// LA-866: the screen's formatting and comparison helpers. The worked example
// numbers are Matt's case from 2026-09-21; every other figure is synthetic.

const CURRENT: Values = {
  "weight.actuals": 5,
  "weight.proest_budget": 1,
  "weight.reviewed_judgment": 2,
  "weight.llm_proposal": 0.5,
  "flag.high_min_comparables": 5,
  "flag.medium_min_comparables": 2,
  "spread.high": 0.1,
  "spread.medium": 0.2,
  "spread.low": 0.35,
  "fee.rate": 0.0325,
  "insurance.rate": 0.054,
};

function entry(name: keyof Values, value: number, createdAt: string, id = createdAt): ParameterHistoryEntry {
  return {
    id,
    name,
    value,
    provenance: { kind: "reviewed_judgment", recordedBy: "automated test", recordedAt: createdAt.slice(0, 10), reason: "synthetic" },
    createdAt,
  };
}

describe("number boxes", () => {
  it("show percents as percents and read them back as fractions", () => {
    expect(inputText("fee.rate", 0.0325)).toBe("3.25");
    expect(inputText("spread.high", 0.1)).toBe("10");
    expect(inputText("weight.llm_proposal", 0.5)).toBe("0.5");
    expect(parseInput("fee.rate", "3.25")).toBe(0.0325);
    expect(parseInput("spread.high", "10%")).toBe(0.1);
    expect(parseInput("weight.actuals", "5")).toBe(5);
  });

  it("read a blank or a word as not a number", () => {
    expect(parseInput("weight.actuals", "")).toBeNaN();
    expect(parseInput("weight.actuals", "five")).toBeNaN();
  });

  it("round-trip every current value unchanged", () => {
    expect(valuesFrom(draftsFor(CURRENT))).toEqual(CURRENT);
    expect(changedNames(CURRENT, valuesFrom(draftsFor(CURRENT)))).toEqual([]);
  });

  it("format a value with its unit", () => {
    expect(formatValue("weight.actuals", 5)).toBe("5");
    expect(formatValue("flag.high_min_comparables", 5)).toBe("5 Jobs");
    expect(formatValue("flag.high_min_comparables", 1)).toBe("1 Job");
    expect(formatValue("insurance.rate", 0.054)).toBe("5.4%");
  });
});

describe("arrow-key nudges", () => {
  it("move a weight by half, five halves with Shift, never below zero", () => {
    expect(nudge("weight.actuals", 5, 1, false)).toBe(5.5);
    expect(nudge("weight.actuals", 5, -1, true)).toBe(2.5);
    expect(nudge("weight.llm_proposal", 0.5, -1, true)).toBe(0);
  });

  it("move a count by one job and a spread by one percent", () => {
    expect(nudge("flag.high_min_comparables", 5, -1, false)).toBe(4);
    expect(nudge("spread.high", 0.1, 1, false)).toBe(0.11);
    expect(nudge("spread.high", 0.1, 1, true)).toBe(0.15);
  });
});

describe("current values and changes", () => {
  it("take the newest entry per name", () => {
    const history = [
      entry("weight.actuals", 5, "2026-09-21T00:00:00.000Z"),
      entry("weight.actuals", 6, "2026-09-27T00:00:00.000Z"),
    ];
    expect(currentValues(history)["weight.actuals"]).toBe(6);
  });

  it("list only the names whose value moved", () => {
    expect(changedNames(CURRENT, { ...CURRENT, "spread.low": 0.4 })).toEqual(["spread.low"]);
  });

  it("carry the engine's first problem per name", () => {
    expect(problemsByName({ ...CURRENT, "weight.actuals": 0 })).toEqual({ "weight.actuals": "Use a weight above zero." });
  });
});

describe("weight shares", () => {
  it("divide each weight by the total", () => {
    const shares = weightShares(CURRENT);
    expect(shares.actuals).toBeCloseTo(5 / 8.5);
    expect(shares.llm_proposal).toBeCloseTo(0.5 / 8.5);
  });
});

describe("the worked example", () => {
  it("lands where Matt's case did: $23.41, medium, three comparables short of high's five", () => {
    const example = workedExample(CURRENT)!;
    expect(example.blend.rate.toFixed(2)).toBe("23.41");
    expect(example.blend.confidence).toBe("medium");
    expect(example.reason).toBe("3 comparables. High needs 5.");
    expect(example.meters.high).toMatchObject({ count: 3, need: 5, meets: false });
    expect(Math.round(example.meters.high.dispersion * 100)).toBe(11);
    expect(example.meters.medium.meets).toBe(true);
    expect(Math.round(example.shares.actuals * 100)).toBe(59);
  });

  it("is absent while a value is one the engine would refuse", () => {
    expect(workedExample({ ...CURRENT, "spread.medium": 0.05 })).toBeNull();
  });

  it("reads high once high asks for what the example has", () => {
    const example = workedExample({ ...CURRENT, "flag.high_min_comparables": 3, "spread.high": 0.12 })!;
    expect(example.blend.confidence).toBe("high");
    expect(example.reason).toBe("3 comparables, all within 12% of the blend.");
    expect(example.meters.high.meets).toBe(true);
  });
});

describe("what a change would do", () => {
  const benchmark: Benchmark = {
    costCode: "TEST",
    label: "Synthetic",
    unit: "usd_per_gsf",
    value: 10,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: { kind: "actuals", sourceProjectIds: ["p1"], exportLabel: "synthetic", recordedBy: "t", recordedAt: "2026-09-27" },
    scopeSide: "building",
    contractSide: "kulka",
  };
  const answers: Answers = { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 1000 };
  const impact: ImpactData = {
    runs: [
      { runId: "r1", projectName: "Synthetic", startedAt: "2026-09-27T00:00:00.000Z", grossSquareFeet: 1000, answers, snapshotKey: "k" },
    ],
    snapshots: { k: { benchmarks: [benchmark] } },
  };

  it("shows no change when nothing changed", () => {
    const [row] = impactRows(impact, CURRENT, CURRENT);
    expect(row.before).toBe(10000);
    expect(row.after).toBe(10000);
    expect(row.change).toBe(0);
  });

  it("recomputes a run with the edited parameters through the engine", () => {
    // One job, so the line is low; widening low's range leaves the midpoint where it was.
    const [same] = impactRows(impact, CURRENT, { ...CURRENT, "spread.low": 0.5 });
    expect(same.change).toBe(0);
    // A second figure from a budget moves the blend once its weight moves.
    const two: ImpactData = {
      ...impact,
      snapshots: {
        k: {
          benchmarks: [
            benchmark,
            { ...benchmark, value: 20, provenance: { ...benchmark.provenance, kind: "proest_budget", sourceProjectIds: ["p2"] } },
          ],
        },
      },
    };
    const [row] = impactRows(two, CURRENT, { ...CURRENT, "weight.proest_budget": 5 });
    expect(row.after!).toBeGreaterThan(row.before!);
    expect(row.change!).toBeGreaterThan(0);
  });

  it("says why when a run cannot be recomputed", () => {
    const [row] = impactRows(
      { ...impact, runs: [{ ...impact.runs[0], answers: { ...answers, grossSquareFeet: 0 } }] },
      CURRENT,
      CURRENT,
    );
    expect(row.error).toMatch(/gross square feet/);
  });
});
