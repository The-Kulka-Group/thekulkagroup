import { describe, expect, it } from "vitest";

import {
  computeRom,
  type Benchmark,
  type DataSnapshot,
  type EngineParameters,
  type ProvenanceKind,
} from "./rom";

// LA-18. The drill-down can only show what the computation hands it, so these
// tests fix one thing: every field of a benchmark's provenance arrives on the
// ROM line unchanged, for every source kind, and the weight each signal carried
// in the blend arrives with it. Nothing here asserts a cost figure.

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";

function benchmark(over: Partial<Benchmark> & { kind?: ProvenanceKind } = {}): Benchmark {
  const { kind = "actuals", ...rest } = over;
  return {
    costCode: "TEST-A",
    label: "Synthetic test line",
    unit: "usd_per_gsf",
    value: 1,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind,
      sourceProjectIds: [PROJECT_A],
      exportLabel: "synthetic export",
      recordedBy: "automated test",
      recordedAt: "2026-08-27",
    },
    scopeSide: "building",
    contractSide: "kulka",
    ...rest,
  };
}

function parameter(value: number) {
  return {
    value,
    provenance: {
      kind: "reviewed_judgment" as const,
      recordedBy: "automated test",
      recordedAt: "2026-09-21",
      reason: "synthetic",
    },
  };
}

const PARAMETERS: EngineParameters = {
  "weight.actuals": parameter(5),
  "weight.proest_budget": parameter(1),
  "weight.reviewed_judgment": parameter(0.5),
  "weight.llm_proposal": parameter(0.25),
  "flag.high_min_comparables": parameter(5),
  "flag.medium_min_comparables": parameter(2),
  "spread.high": parameter(0.1),
  "spread.medium": parameter(0.2),
  "spread.low": parameter(0.3),
};

function romOf(benchmarks: Benchmark[]) {
  const snapshot: DataSnapshot = { benchmarks, parameters: PARAMETERS };
  return computeRom(
    { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 1000 },
    snapshot,
  );
}

describe("provenance through the computation", () => {
  it("carries every provenance field of a benchmark onto the line it fed", () => {
    const source = benchmark({
      value: 3,
      provenance: {
        kind: "proest_budget",
        sourceProjectIds: [PROJECT_B, PROJECT_A],
        exportLabel: "ProEst export 2026-02",
        recordedBy: "Matt Nicosia",
        recordedAt: "2026-02-14",
      },
    });

    const [line] = romOf([source]).lines;

    expect(line.comparables).toHaveLength(1);
    expect(line.comparables[0]).toMatchObject({
      kind: "proest_budget",
      rate: 3,
      weight: PARAMETERS["weight.proest_budget"]!.value,
      exportLabel: "ProEst export 2026-02",
      recordedBy: "Matt Nicosia",
      recordedAt: "2026-02-14",
    });
    // The engine sorts the ids so the same rows always hash the same. Both
    // projects still arrive.
    expect([...line.comparables[0].sourceProjectIds].sort()).toEqual([PROJECT_A, PROJECT_B]);
  });

  it("keeps one comparable per benchmark, for every source kind, with its own weight", () => {
    const kinds: ProvenanceKind[] = [
      "actuals",
      "proest_budget",
      "reviewed_judgment",
      "llm_proposal",
    ];
    const [line] = romOf(
      kinds.map((kind, index) =>
        benchmark({
          value: index + 1,
          provenance: {
            kind,
            sourceProjectIds: kind === "llm_proposal" ? [] : [PROJECT_A],
            exportLabel: null,
            recordedBy: `recorder ${index}`,
            recordedAt: "2026-08-27",
          },
        }),
      ),
    ).lines;

    expect(line.comparables.map((c) => c.kind).sort()).toEqual([...kinds].sort());
    for (const comparable of line.comparables) {
      expect(comparable.weight).toBe(PARAMETERS[`weight.${comparable.kind}`]!.value);
    }
    expect(line.comparables.map((c) => c.rate).sort()).toEqual([1, 2, 3, 4]);
  });

  it("leaves a line resting on a model's figure with no comparable project behind it", () => {
    const [line] = romOf([
      benchmark({
        provenance: {
          kind: "llm_proposal",
          sourceProjectIds: [],
          exportLabel: null,
          recordedBy: "automated test",
          recordedAt: "2026-08-27",
        },
      }),
    ]).lines;

    expect(line.comparableCount).toBe(0);
    expect(line.comparables[0].sourceProjectIds).toEqual([]);
    expect(line.comparables[0].exportLabel).toBeNull();
  });

  it("invents no comparable: the line carries exactly the benchmarks it was given", () => {
    const rom = romOf([
      benchmark({ costCode: "TEST-A" }),
      benchmark({ costCode: "TEST-B", kind: "reviewed_judgment" }),
      benchmark({ costCode: "TEST-B", kind: "actuals" }),
    ]);

    expect(rom.lines.map((l) => l.comparables.length)).toEqual([1, 2]);
  });
});
