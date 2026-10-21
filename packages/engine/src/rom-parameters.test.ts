import { describe, expect, it } from "vitest";

import { blendExample, computeRom, type EngineParameters, type ExampleFigure, type ParameterName } from "./rom";
import { PARAMETER_NAMES, parameterProblems } from "./rom-parameters";

// LA-866: the rules the Engine Parameters screen and its save path share with a
// run, and the worked example the screen draws from the engine's own blend.

// The weights and thresholds Kulka records today, so the worked example below
// reads the way Matt's case did on 2026-09-21.
const CURRENT: Record<ParameterName, number> = {
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
  "confidence.exclude_at_or_below": 1,
};

function asParameters(values: Record<ParameterName, number>): EngineParameters {
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      { value, provenance: { kind: "reviewed_judgment", recordedBy: "automated test", recordedAt: "2026-09-27", reason: "synthetic" } },
    ]),
  ) as EngineParameters;
}

// Matt's worked case, as stored in the weight reasons.
const MATT: ExampleFigure[] = [
  { kind: "actuals", rate: 22, sourceProjectId: "job" },
  { kind: "proest_budget", rate: 26, sourceProjectId: "budget" },
  { kind: "reviewed_judgment", rate: 24, sourceProjectId: "rule" },
  { kind: "llm_proposal", rate: 30, sourceProjectId: null },
];

describe("parameterProblems", () => {
  it("finds nothing wrong with the values recorded today", () => {
    expect(parameterProblems(CURRENT)).toEqual([]);
  });

  it("names every missing value", () => {
    const { "spread.low": _dropped, ...rest } = CURRENT;
    void _dropped;
    expect(parameterProblems(rest)).toEqual([{ name: "spread.low", message: "No value is recorded." }]);
  });

  it("refuses a zero or negative weight, which a run would refuse", () => {
    expect(parameterProblems({ ...CURRENT, "weight.llm_proposal": 0 })).toEqual([
      { name: "weight.llm_proposal", message: "Use a weight above zero." },
    ]);
    expect(parameterProblems({ ...CURRENT, "weight.actuals": -1 })[0].name).toBe("weight.actuals");
  });

  it("refuses High needing fewer comparables than Medium", () => {
    expect(parameterProblems({ ...CURRENT, "flag.high_min_comparables": 1 })).toEqual([
      { name: "flag.high_min_comparables", message: "High cannot need fewer comparables than Medium." },
    ]);
  });

  it("refuses a comparable count that is not a whole number of 1 or more", () => {
    expect(parameterProblems({ ...CURRENT, "flag.medium_min_comparables": 1.5 })[0]).toEqual({
      name: "flag.medium_min_comparables",
      message: "Use a whole number of 1 or more.",
    });
  });

  it("refuses a range narrower than the tier above it", () => {
    expect(parameterProblems({ ...CURRENT, "spread.medium": 0.05 })).toEqual([
      { name: "spread.medium", message: "Medium cannot be narrower than High." },
    ]);
    expect(parameterProblems({ ...CURRENT, "spread.low": 0.15 })).toEqual([
      { name: "spread.low", message: "Low cannot be narrower than Medium." },
    ]);
  });

  it("refuses a spread outside 0 to 100 percent and a markup rate of 100 percent or more", () => {
    expect(parameterProblems({ ...CURRENT, "spread.low": 1 }).map((p) => p.name)).toEqual(["spread.low"]);
    expect(parameterProblems({ ...CURRENT, "fee.rate": 1 })).toEqual([
      { name: "fee.rate", message: "Use a percent from 0 up to 100." },
    ]);
  });

  it("agrees with a run: every set it refuses, the engine refuses too", () => {
    const refused: Partial<Record<ParameterName, number>>[] = [
      { "flag.high_min_comparables": 1 },
      { "spread.medium": 0.05 },
      { "spread.high": 0 },
      { "weight.actuals": 0 },
      { "flag.medium_min_comparables": 0 },
    ];
    const line = {
      costCode: "TEST",
      label: "Synthetic",
      unit: "usd_per_gsf" as const,
      value: 1,
      projectType: "multifamily" as const,
      constructionKind: "new" as const,
      provenance: { kind: "actuals" as const, sourceProjectIds: ["p"], exportLabel: "x", recordedBy: "t", recordedAt: "2026-09-27" },
      scopeSide: "building" as const,
      contractSide: "kulka" as const,
    };
    for (const over of refused) {
      const values = { ...CURRENT, ...over };
      const [problem] = parameterProblems(values);
      expect(problem).toBeDefined();
      expect(() =>
        computeRom(
          { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 1000 },
          { benchmarks: [line], parameters: asParameters(values) },
        ),
      ).toThrow(problem.name);
    }
  });

  it("lists every name the engine reads", () => {
    expect([...PARAMETER_NAMES].sort()).toEqual(Object.keys(CURRENT).sort());
  });
});

describe("blendExample", () => {
  it("reads Matt's case the way the engine blends a line: $23.41, medium, three comparables", () => {
    const example = blendExample(MATT, asParameters(CURRENT));
    expect(example.rate).toBeCloseTo(199 / 8.5, 10);
    expect(example.confidence).toBe("medium");
    expect(example.spread).toBe(0.2);
    expect(example.comparableCount).toBe(3);
    expect(example.dispersion).toBeCloseTo((26 - 199 / 8.5) / (199 / 8.5), 10);
    expect(example.low).toBeCloseTo((199 / 8.5) * 0.8, 10);
    expect(example.totalWeight).toBe(8.5);
    expect(example.comparables.map((c) => c.kind)).toEqual([
      "actuals",
      "proest_budget",
      "reviewed_judgment",
      "llm_proposal",
    ]);
  });

  it("moves when a weight moves", () => {
    const heavierModel = blendExample(MATT, asParameters({ ...CURRENT, "weight.llm_proposal": 5 }));
    expect(heavierModel.rate).toBeGreaterThan(blendExample(MATT, asParameters(CURRENT)).rate);
  });

  it("earns high once the threshold drops to the comparables it has", () => {
    const example = blendExample(
      MATT,
      asParameters({ ...CURRENT, "flag.high_min_comparables": 3, "spread.high": 0.12 }),
    );
    expect(example.confidence).toBe("high");
    expect(example.spread).toBe(0.12);
  });

  it("refuses what a run refuses", () => {
    expect(() => blendExample(MATT, asParameters({ ...CURRENT, "weight.actuals": 0 }))).toThrow(/weight\.actuals/);
  });
});
