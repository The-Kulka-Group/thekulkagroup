import { describe, expect, it } from "vitest";

import { computeRom, type Answers, type Benchmark, type DataSnapshot, type EngineParameters } from "./rom";
import type { FramingSystem } from "./rom-framing";

// LA-1103, Matt's call 2026-09-25: items 8 and 17 blend only past jobs framed
// the same way as the project being estimated. Synthetic figures; the cases
// fix which rows go in, never a particular rate.

const METAL_JOB = "11111111-1111-4111-8111-111111111111";
const WOOD_JOB = "22222222-2222-4222-8222-222222222222";
const UNSET_JOB = "33333333-3333-4333-8333-333333333333";

const FRAMING: Record<string, FramingSystem> = { [METAL_JOB]: "metal", [WOOD_JOB]: "wood" };

function row(costCode: string, project: string, value: number): Benchmark {
  return {
    costCode,
    label: `Item ${costCode}`,
    unit: "usd_per_gsf",
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "actuals",
      sourceProjectIds: [project],
      exportLabel: "synthetic export",
      recordedBy: "automated test",
      recordedAt: "2026-09-25",
    },
    scopeSide: "building",
    contractSide: "kulka",
  };
}

function parameters(): EngineParameters {
  const values: Record<string, number> = {
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
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      { value, provenance: { kind: "reviewed_judgment", recordedBy: "t", recordedAt: "2026-09-25", reason: "synthetic" } },
    ]),
  ) as EngineParameters;
}

function answers(framingSystem?: FramingSystem | null): Answers {
  return { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 1000, framingSystem };
}

function snapshot(benchmarks: Benchmark[], framing = FRAMING): DataSnapshot {
  return { benchmarks, parameters: parameters(), sourceProjectFraming: framing };
}

const BOTH_JOBS = [row("17", METAL_JOB, 93), row("17", WOOD_JOB, 8), row("8", WOOD_JOB, 20), row("5", METAL_JOB, 10), row("5", WOOD_JOB, 12)];

describe("framing system on items 8 and 17", () => {
  it("blends only jobs framed like the target, and names the job left out", () => {
    const rom = computeRom(answers("metal"), snapshot(BOTH_JOBS));
    const item17 = rom.lines.find((l) => l.costCode === "17")!;
    expect(item17.comparables.map((c) => c.sourceProjectIds)).toEqual([[METAL_JOB]]);
    expect(item17.low).toBeLessThan(93_000);
    expect(item17.high).toBeGreaterThan(93_000);
    expect(item17.framing?.status).toBe("matched");
    expect(item17.framing?.excluded.map((c) => c.sourceProjectIds)).toEqual([[WOOD_JOB]]);
    expect(item17.framing?.excluded[0].reason).toMatch(/Framing system differs/);
  });

  it("leaves other items blending every job", () => {
    const rom = computeRom(answers("metal"), snapshot(BOTH_JOBS));
    const item5 = rom.lines.find((l) => l.costCode === "5")!;
    expect(item5.comparables).toHaveLength(2);
    expect(item5.framing).toBeUndefined();
    expect(item5.heldForReview).toBe(false);
  });

  it("gives no figure and holds the line when no job matches, and keeps it out of the total", () => {
    const rom = computeRom(answers("metal"), snapshot(BOTH_JOBS));
    const item8 = rom.lines.find((l) => l.costCode === "8")!;
    expect(item8.framing?.status).toBe("no_match");
    expect(item8.low).toBe(0);
    expect(item8.high).toBe(0);
    expect(item8.heldForReview).toBe(true);
    expect(item8.comparables).toEqual([]);
    expect(item8.framing?.reason).toMatch(/no figure/);
    expect(item8.framing?.excluded.map((c) => c.sourceProjectIds)).toEqual([[WOOD_JOB]]);

    const item17 = rom.lines.find((l) => l.costCode === "17")!;
    const item5 = rom.lines.find((l) => l.costCode === "5")!;
    expect(rom.total.low).toBe(item17.low + item5.low);
    expect(rom.assumptions.some((a) => a.includes("Item 8") && a.includes("outside the total"))).toBe(true);
  });

  it("does not count a job with no recorded framing as a match", () => {
    const rom = computeRom(answers("wood"), snapshot([row("8", UNSET_JOB, 20)]));
    const item8 = rom.lines[0];
    expect(item8.framing?.status).toBe("no_match");
    expect(item8.framing?.excluded[0].reason).toMatch(/not recorded/);
  });

  it("blends every job as before and holds the line when the target is not set", () => {
    const unset = computeRom(answers(null), snapshot(BOTH_JOBS));
    const noFraming = computeRom(answers(undefined), { benchmarks: BOTH_JOBS, parameters: parameters() });
    const item17 = unset.lines.find((l) => l.costCode === "17")!;
    expect(item17.comparables).toHaveLength(2);
    expect(item17.heldForReview).toBe(true);
    expect(item17.framing?.status).toBe("target_unknown");
    expect(item17.framing?.reason).toMatch(/not set/);
    expect(noFraming.lines.find((l) => l.costCode === "17")!.low).toBe(item17.low);
    expect(unset.assumptions.some((a) => a.includes("framing system is not set"))).toBe(true);
  });
});
