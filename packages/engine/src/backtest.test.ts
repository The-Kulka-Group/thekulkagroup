import { describe, expect, it } from "vitest";

import { runBacktest, type BacktestActualLine, type BacktestProjectInput } from "./backtest";
import type { Answers, Benchmark, DataSnapshot, EngineParameters } from "./rom";
import type { BranchGateItemRule } from "./rom-gates";

// The backtest's math (LA-23). The parameters are synthetic; each case fixes a
// figure that follows from them by hand, so a change to how the backtest
// counts a line shows up as a changed number here.

const SELF = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function parameters(): EngineParameters {
  const values = {
    "weight.actuals": 5,
    "weight.proest_budget": 1,
    "weight.reviewed_judgment": 2,
    "weight.llm_proposal": 0.5,
    "flag.high_min_comparables": 5,
    "flag.medium_min_comparables": 1,
    "spread.high": 0.1,
    "spread.medium": 0.2,
    "spread.low": 0.35,
  };
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      {
        value,
        provenance: {
          kind: "reviewed_judgment" as const,
          recordedBy: "automated test",
          recordedAt: "2026-09-24",
          reason: "synthetic",
        },
      },
    ]),
  ) as EngineParameters;
}

function benchmark(costCode: string, value: number, project = OTHER): Benchmark {
  return {
    costCode,
    label: `Line ${costCode}`,
    unit: "usd_per_gsf",
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "proest_budget",
      sourceProjectIds: [project],
      exportLabel: "synthetic export",
      recordedBy: "automated test",
      recordedAt: "2026-09-24",
    },
    scopeSide: "building",
    contractSide: "kulka",
  };
}

function actual(costCode: string, usdPerGsf: number): BacktestActualLine {
  return { costCode, label: `Budget ${costCode}`, usdPerGsf, contractSide: "kulka" };
}

const ANSWERS: Answers = { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 1000 };

function input(snapshot: Partial<DataSnapshot>, lines: BacktestActualLine[], answers = ANSWERS): BacktestProjectInput {
  return {
    projectId: SELF,
    projectName: "Self",
    answers,
    snapshot: { benchmarks: [], parameters: parameters(), ...snapshot },
    actual: lines,
  };
}

function gateRule(costCode: string, section: string): BranchGateItemRule {
  return {
    costCode,
    section,
    requiresAllSections: [],
    closesOn: ["no"],
    statedBy: "automated test",
    statedOn: "2026-09-24",
    reason: "synthetic",
  };
}

describe("runBacktest", () => {
  it("scores the ROM's trade total against the budget's at the 10 percent bar", () => {
    // One comparable, one project: medium flag, spread 0.2. $100/SF on 1,000 SF
    // is a $100,000 midpoint, $80,000 to $120,000.
    const report = runBacktest([input({ benchmarks: [benchmark("A", 100)] }, [actual("A", 95)])]);
    const project = report.projects[0];

    expect(project.predicted).toEqual({ low: 80000, high: 120000, midpoint: 100000 });
    expect(project.actual).toBe(95000);
    expect(project.errorPercent).toBeCloseTo((5000 / 95000) * 100, 10);
    expect(project.insideRange).toBe(true);
    expect(project.scored).toBe(true);
    expect(project.passed).toBe(true);
    expect(project.pricedFrom).toEqual([OTHER]);
    expect(report).toMatchObject({ projectCount: 1, scoredCount: 1, passingCount: 1 });
    expect(report.meanAbsoluteErrorDollars).toBe(5000);
  });

  it("fails a project whose midpoint lands more than 10 percent off", () => {
    const report = runBacktest([input({ benchmarks: [benchmark("A", 100)] }, [actual("A", 80)])]);
    const project = report.projects[0];

    expect(project.errorPercent).toBe(25);
    expect(project.passed).toBe(false);
    expect(project.insideRange).toBe(true);
    expect(report.passingCount).toBe(0);
    expect(report.meanAbsoluteErrorPercent).toBe(25);
  });

  it("keeps a line only one side has, on the side that has it", () => {
    // B is in the ROM but not the budget; C is in the budget but no other job
    // had it, so the ROM has no line for it.
    const report = runBacktest([
      input(
        { benchmarks: [benchmark("A", 100), benchmark("B", 10)] },
        [actual("A", 100), actual("C", 20)],
      ),
    ]);
    const project = report.projects[0];
    const byCode = Object.fromEntries(project.lines.map((l) => [l.costCode, l]));

    expect(byCode.B).toMatchObject({
      presence: "predicted_only",
      predictedStatus: "priced",
      actual: 0,
      error: 10000,
      errorPercent: null,
      insideRange: false,
      countsInPredictedTotal: true,
      countsInActualTotal: false,
    });
    expect(byCode.C).toMatchObject({
      presence: "budget_only",
      predictedStatus: "not_predicted",
      predicted: { low: 0, high: 0, midpoint: 0 },
      actual: 20000,
      error: -20000,
      errorPercent: -100,
      insideRange: false,
      countsInPredictedTotal: false,
      countsInActualTotal: true,
    });
    // Both sides' totals keep their one-sided line.
    expect(project.predicted.midpoint).toBe(110000);
    expect(project.actual).toBe(120000);
    // Sorted by absolute error, largest first.
    expect(project.lines.map((l) => l.costCode)).toEqual(["C", "B", "A"]);
  });

  it("marks a not-in-job line as zero and still counts the budget's cost for it", () => {
    const report = runBacktest([
      input(
        {
          benchmarks: [benchmark("A", 100), benchmark("G", 30)],
          branchGateItems: [gateRule("G", "elevator")],
        },
        [actual("A", 100), actual("G", 30)],
        { ...ANSWERS, facts: { elevator: "no" } },
      ),
    ]);
    const project = report.projects[0];
    const gated = project.lines.find((l) => l.costCode === "G")!;

    expect(gated).toMatchObject({
      predictedStatus: "not_in_job",
      predicted: { low: 0, high: 0, midpoint: 0 },
      actual: 30000,
      presence: "both",
      countsInPredictedTotal: false,
      countsInActualTotal: true,
    });
    expect(project.predicted.midpoint).toBe(100000);
    expect(project.actual).toBe(130000);
    expect(project.scored).toBe(true);
  });

  it("leaves a ROM carrying TBD lines unscored, as rom-spec.md says", () => {
    const report = runBacktest([
      input(
        {
          benchmarks: [benchmark("A", 100), benchmark("G", 30)],
          branchGateItems: [{ ...gateRule("G", "elevator"), closesOn: ["no"] }],
        },
        [actual("A", 100)],
        { ...ANSWERS, facts: { elevator: "dont_know" } },
      ),
    ]);
    const project = report.projects[0];

    expect(project.lines.find((l) => l.costCode === "G")).toMatchObject({
      predictedStatus: "tbd",
      predicted: { low: 0, high: 0, midpoint: 0 },
    });
    // Within 10 percent on the numbers, but not scorable.
    expect(project.errorPercent).toBe(0);
    expect(project.scored).toBe(false);
    expect(project.passed).toBe(false);
    expect(project.unscoredReason).toContain("TBD");
    expect(report.scoredCount).toBe(0);
    expect(report.meanAbsoluteErrorPercent).toBeNull();
  });

  it("keeps a breakout out of the budget total only when the budget also carries its lump", () => {
    const classifications = [
      {
        costCode: "BO",
        detailLevel: 2 as const,
        element: null,
        breakoutOfCostCode: "LUMP",
        buyoutPackage: null,
        statedBy: "automated test",
        statedOn: "2026-09-24",
        reason: "synthetic",
      },
    ];
    const snapshot = { benchmarks: [benchmark("LUMP", 100), benchmark("BO", 10)], classifications };

    const withLump = runBacktest([input(snapshot, [actual("LUMP", 100), actual("BO", 10)])]).projects[0];
    expect(withLump.lines.find((l) => l.costCode === "BO")).toMatchObject({
      predictedStatus: "breakout",
      countsInPredictedTotal: false,
      countsInActualTotal: false,
    });
    expect(withLump.actual).toBe(100000);

    const alone = runBacktest([input(snapshot, [actual("BO", 10)])]).projects[0];
    expect(alone.lines.find((l) => l.costCode === "BO")!.countsInActualTotal).toBe(true);
    expect(alone.actual).toBe(10000);
  });

  it("sums the budget's lines on one cost code", () => {
    const project = runBacktest([
      input({ benchmarks: [benchmark("A", 100)] }, [actual("A", 60), actual("A", 40)]),
    ]).projects[0];

    expect(project.lines).toHaveLength(1);
    expect(project.actual).toBe(100000);
  });

  it("reports a project the engine cannot budget instead of throwing", () => {
    const report = runBacktest([
      input({ benchmarks: [benchmark("A", 100)] }, [actual("A", 100)], { ...ANSWERS, grossSquareFeet: 0 }),
    ]);

    expect(report.projects[0].error).toContain("gross square feet");
    expect(report.projects[0].scored).toBe(false);
    expect(report.scoredCount).toBe(0);
  });

  it("names the five largest line misses across every project by absolute dollars", () => {
    const codes = ["A", "B", "C", "D"];
    const first = input(
      { benchmarks: codes.map((c, i) => benchmark(c, 10 * (i + 1))) },
      codes.map((c) => actual(c, 1)),
    );
    const second = { ...input({ benchmarks: [benchmark("E", 100)] }, [actual("E", 1)]), projectName: "Second" };

    const report = runBacktest([first, second]);

    expect(report.worstMisses).toHaveLength(5);
    expect(report.worstMisses.map((m) => [m.projectName, m.line.costCode])).toEqual([
      ["Second", "E"],
      ["Self", "D"],
      ["Self", "C"],
      ["Self", "B"],
      ["Self", "A"],
    ]);
  });
});
