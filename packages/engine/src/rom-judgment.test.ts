import { describe, expect, it } from "vitest";

import {
  computeRom,
  type Answers,
  type Benchmark,
  type DataSnapshot,
  type EngineParameters,
  type JudgmentRule,
  type ProvenanceKind,
} from "./rom";

// Judgment rules as data (LA-19). Every number below is synthetic and named
// as such. The cases fix the mechanics -- an approved rule moves the line, and
// measured figures on the same cost code outweigh it -- never a particular
// dollar figure, so they hold whatever rules Kulka records.

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_C = "33333333-3333-4333-8333-333333333333";

function benchmark(over: Partial<Benchmark> & { kind?: ProvenanceKind; project?: string } = {}): Benchmark {
  const { kind = "actuals", project = PROJECT_A, ...rest } = over;
  return {
    costCode: "TEST-A",
    label: "Synthetic test line",
    unit: "usd_per_gsf",
    value: 1,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind,
      sourceProjectIds: [project],
      exportLabel: "synthetic export",
      recordedBy: "automated test",
      recordedAt: "2026-08-27",
    },
    scopeSide: "building",
    contractSide: "kulka",
    ...rest,
  };
}

function parameters(): EngineParameters {
  const values = {
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
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      {
        value,
        provenance: {
          kind: "reviewed_judgment" as const,
          recordedBy: "automated test",
          recordedAt: "2026-09-21",
          reason: "synthetic",
        },
      },
    ]),
  ) as EngineParameters;
}

const ANSWERS: Answers = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 1000,
  facts: { synthetic_test_condition: "yes" },
};

/** A fixture, not a rule anyone stated. The adjustment is 1, a synthetic unit, not a cost figure. */
function rule(over: Partial<JudgmentRule> = {}): JudgmentRule {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    costCode: "TEST-A",
    projectType: "multifamily",
    constructionKind: "new",
    condition: { fact: "synthetic_test_condition", equals: "yes" },
    adjustmentUsdPerGsf: 1,
    provenance: {
      kind: "reviewed_judgment",
      sourceProjectIds: [],
      exportLabel: null,
      recordedBy: "Synthetic Test Estimator",
      recordedAt: "2026-09-21",
    },
    ...over,
  };
}

function snapshot(benchmarks: Benchmark[], judgmentRules: JudgmentRule[] = []): DataSnapshot {
  return { benchmarks, parameters: parameters(), judgmentRules };
}

function lineFor(benchmarks: Benchmark[], judgmentRules: JudgmentRule[] = [], answers = ANSWERS) {
  return computeRom(answers, snapshot(benchmarks, judgmentRules)).lines[0];
}

describe("judgment rules in the blend", () => {
  it("leaves every line alone when no rule is approved", () => {
    const line = lineFor([benchmark()]);
    expect(line.judgmentAdjustments).toEqual([]);
  });

  it("moves the line it applies to and flags it as judgment with provenance", () => {
    const plain = lineFor([benchmark({ kind: "proest_budget" })]);
    const adjusted = lineFor([benchmark({ kind: "proest_budget" })], [rule()]);

    expect(adjusted.high).toBeGreaterThan(plain.high);
    expect(adjusted.judgmentAdjustments).toHaveLength(1);

    const [judgment] = adjusted.judgmentAdjustments;
    expect(judgment.kind).toBe("reviewed_judgment");
    expect(judgment.ruleId).toBe(rule().id);
    expect(judgment.recordedBy).toBe("Synthetic Test Estimator");
    expect(judgment.recordedAt).toBe("2026-09-21");
    expect(judgment.appliedUsdPerGsf).toBeGreaterThan(0);
    expect(judgment.appliedUsdPerGsf).toBeLessThan(judgment.adjustmentUsdPerGsf);
  });

  it("lets actuals covering the same ground outweigh the rule", () => {
    const onBudgetAlone = lineFor([benchmark({ kind: "proest_budget" })], [rule()]);
    const withActuals = lineFor(
      [
        benchmark({ kind: "proest_budget" }),
        benchmark({ kind: "actuals", project: PROJECT_B }),
        benchmark({ kind: "actuals", project: PROJECT_C }),
      ],
      [rule()],
    );

    expect(withActuals.judgmentAdjustments[0].appliedUsdPerGsf).toBeLessThan(
      onBudgetAlone.judgmentAdjustments[0].appliedUsdPerGsf,
    );
  });

  it("shrinks the rule's effect further with every actual that arrives", () => {
    const applied = (count: number) =>
      lineFor(
        [
          benchmark({ kind: "proest_budget" }),
          ...Array.from({ length: count }, (_, i) =>
            benchmark({ kind: "actuals", project: `${i}0000000-0000-4000-8000-000000000000` }),
          ),
        ],
        [rule()],
      ).judgmentAdjustments[0].appliedUsdPerGsf;

    expect(applied(3)).toBeLessThan(applied(1));
    expect(applied(5)).toBeLessThan(applied(3));
  });

  it("skips a rule whose condition the project does not meet", () => {
    const answers: Answers = { ...ANSWERS, facts: { synthetic_test_condition: "no" } };
    expect(lineFor([benchmark()], [rule()], answers).judgmentAdjustments).toEqual([]);
  });

  it("applies a rule with no condition to every project of that type and kind", () => {
    const answers: Answers = { ...ANSWERS, facts: undefined };
    const line = lineFor([benchmark()], [rule({ condition: null })], answers);
    expect(line.judgmentAdjustments).toHaveLength(1);
  });

  it("skips a rule for another project type or construction kind", () => {
    expect(lineFor([benchmark()], [rule({ projectType: "self_storage" })]).judgmentAdjustments).toEqual([]);
    expect(lineFor([benchmark()], [rule({ constructionKind: "renovation" })]).judgmentAdjustments).toEqual([]);
  });

  it("never creates a line for a cost code with no benchmark behind it", () => {
    const rom = computeRom(ANSWERS, snapshot([benchmark()], [rule({ costCode: "TEST-NOTHING" })]));
    expect(rom.lines.map((l) => l.costCode)).toEqual(["TEST-A"]);
    expect(rom.lines[0].judgmentAdjustments).toEqual([]);
  });

  it("leaves the confidence flag to the measured figures", () => {
    const rows = [benchmark({ kind: "proest_budget" }), benchmark({ kind: "actuals", project: PROJECT_B })];
    expect(lineFor(rows, [rule()]).confidence).toBe(lineFor(rows).confidence);
  });

  it("says on the face of the ROM that a line carries an estimator's rule", () => {
    const rom = computeRom(ANSWERS, snapshot([benchmark()], [rule()]));
    expect(rom.assumptions.some((a) => a.includes("approved estimator rule"))).toBe(true);
  });

  // A gate the intake asks has to change what the ROM says, or the question
  // was for nothing (CONTEXT.md: Branch gate).
  it("states what a closed gate carries nothing for", () => {
    const answers: Answers = { ...ANSWERS, branchGates: { demolition: "no" } };
    const rom = computeRom(answers, snapshot([benchmark()]));

    expect(rom.assumptions.some((a) => a.includes("carries nothing for: demolition"))).toBe(true);
  });

  it("states how many items sit outside the total as TBD", () => {
    const answers: Answers = {
      ...ANSWERS,
      branchGates: { demolition: "dont_know", site_conditions: "dont_know" },
    };
    const rom = computeRom(answers, snapshot([benchmark()]));

    expect(rom.assumptions.some((a) => a.includes("2 items sit outside this total as TBD"))).toBe(
      true,
    );
  });

  it("says nothing about gates when every one was answered yes", () => {
    const answers: Answers = { ...ANSWERS, branchGates: { demolition: "yes" } };
    const rom = computeRom(answers, snapshot([benchmark()]));

    expect(rom.assumptions.some((a) => a.includes("carries nothing for"))).toBe(false);
    expect(rom.assumptions.some((a) => a.includes("TBD"))).toBe(false);
  });

  // A rule's value is stored as text while a fact off a number question is a
  // number. Comparing them raw dropped the rule without a word, and an
  // estimator had no way to see that an approved rule did nothing.
  it("matches a numeric fact against the text a rule was entered with", () => {
    const answers: Answers = { ...ANSWERS, facts: { synthetic_level_count: 1 } };
    const onNumber = rule({ condition: { fact: "synthetic_level_count", equals: "1" } });

    const line = lineFor([benchmark({ kind: "proest_budget" })], [onNumber], answers);
    expect(line.judgmentAdjustments).toHaveLength(1);
  });

  it("leaves the line alone when the fact does not read as the rule's value", () => {
    const answers: Answers = { ...ANSWERS, facts: { synthetic_level_count: 2 } };
    const onNumber = rule({ condition: { fact: "synthetic_level_count", equals: "1" } });

    expect(lineFor([benchmark()], [onNumber], answers).judgmentAdjustments).toEqual([]);
  });

  it("leaves the line alone when the fact the rule names was never answered", () => {
    const answers: Answers = { ...ANSWERS, facts: {} };
    expect(lineFor([benchmark()], [rule()], answers).judgmentAdjustments).toEqual([]);
  });

  it("applies two rules on one cost code in the same order whatever order they arrive in", () => {
    const first = rule({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", adjustmentUsdPerGsf: 1 });
    const second = rule({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      adjustmentUsdPerGsf: -0.5,
      provenance: { ...rule().provenance, recordedAt: "2026-09-22" },
    });

    const forwards = lineFor([benchmark()], [first, second]);
    const backwards = lineFor([benchmark()], [second, first]);
    expect(forwards).toEqual(backwards);
    expect(forwards.judgmentAdjustments.map((a) => a.ruleId)).toEqual([first.id, second.id]);
  });
});
