import { computeRom, type Benchmark, type EngineParameters } from "@kulka/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

import {
  approveJudgmentRule,
  getJudgmentRule,
  InvalidJudgmentRule,
  JudgmentRuleNotFound,
  JudgmentRuleNotStaged,
  listJudgmentRules,
  readApprovedJudgmentRules,
  stageJudgmentRule,
  type JudgmentRuleEntry,
} from "./judgment";

// LA-19's gate: a rule is entered with a name and a date, stays staged until
// someone approves it, and only then reaches a ROM. Tested against a real
// Postgres built from this repo's migrations, same pattern as
// lib/rom/ingest.test.ts.
//
// Every figure here is a synthetic test fixture. The migration ships no rules,
// and no number below is a cost anyone stated.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

const ENTRY: JudgmentRuleEntry = {
  costCode: "TEST",
  label: "Synthetic test rule",
  projectType: "multifamily",
  constructionKind: "new",
  condition: { fact: "synthetic_test_condition", equals: "yes" },
  adjustmentUsdPerGsf: 1,
  statedBy: "Synthetic Test Estimator",
  statedOn: "2026-09-21",
  reason: "Fixture for an automated test, not a cost anyone stated.",
};

const stage = (over: Partial<JudgmentRuleEntry> = {}) =>
  stageJudgmentRule(db as Db, { ...ENTRY, ...over });

describe("stageJudgmentRule", () => {
  it("enters a rule with its stating person and date, staged and affecting nothing", async () => {
    const rule = await stage();

    expect(rule.status).toBe("staged");
    expect(rule.statedBy).toBe("Synthetic Test Estimator");
    expect(rule.statedOn).toBe("2026-09-21");
    expect(rule.approvedBy).toBeNull();
    expect(rule.approvedAt).toBeNull();
    expect(rule.adjustmentUsdPerGsf).toBe(1);
    expect(rule.condition).toEqual({ fact: "synthetic_test_condition", equals: "yes" });

    expect(await readApprovedJudgmentRules(db as Db, ENTRY)).toEqual([]);
  });

  it("refuses a rule with no stated reason, no stating person, or no date", async () => {
    await expect(stage({ reason: "  " })).rejects.toBeInstanceOf(InvalidJudgmentRule);
    await expect(stage({ statedBy: "" })).rejects.toBeInstanceOf(InvalidJudgmentRule);
    await expect(stage({ statedOn: "yesterday" })).rejects.toBeInstanceOf(InvalidJudgmentRule);
    expect((await db.query(`select 1 from judgment_rules`)).rows).toEqual([]);
  });

  it("refuses an adjustment of zero, which states nothing", async () => {
    await expect(stage({ adjustmentUsdPerGsf: 0 })).rejects.toBeInstanceOf(InvalidJudgmentRule);
  });

  it("takes a rule with no condition, which applies to every project of that type and kind", async () => {
    const rule = await stage({ condition: null });
    expect(rule.condition).toBeNull();
  });
});

describe("approveJudgmentRule", () => {
  it("records who approved it and when", async () => {
    const staged = await stage();
    const approved = await approveJudgmentRule(db as Db, staged.id, "reviewer@kulka.com");

    expect(approved.status).toBe("approved");
    expect(approved.approvedBy).toBe("reviewer@kulka.com");
    expect(approved.approvedAt).not.toBeNull();
    expect((await getJudgmentRule(db as Db, staged.id)).status).toBe("approved");
  });

  it("refuses a second approval of the same rule", async () => {
    const staged = await stage();
    await approveJudgmentRule(db as Db, staged.id, "reviewer@kulka.com");
    await expect(approveJudgmentRule(db as Db, staged.id, "someone.else@kulka.com")).rejects.toBeInstanceOf(
      JudgmentRuleNotStaged,
    );
  });

  it("refuses a rule that does not exist", async () => {
    await expect(
      approveJudgmentRule(db as Db, "00000000-0000-4000-8000-0000000000ff", "reviewer@kulka.com"),
    ).rejects.toBeInstanceOf(JudgmentRuleNotFound);
  });
});

describe("listJudgmentRules", () => {
  it("lists every rule, and filters to one status", async () => {
    const first = await stage();
    await stage({ label: "Second synthetic test rule" });
    await approveJudgmentRule(db as Db, first.id, "reviewer@kulka.com");

    expect(await listJudgmentRules(db as Db)).toHaveLength(2);
    expect((await listJudgmentRules(db as Db, { status: "staged" })).map((r) => r.label)).toEqual([
      "Second synthetic test rule",
    ]);
  });
});

describe("readApprovedJudgmentRules", () => {
  it("reads only approved rules, in the engine's own shape", async () => {
    const staged = await stage();
    await stage({ label: "Still staged" });
    await approveJudgmentRule(db as Db, staged.id, "reviewer@kulka.com");

    const rules = await readApprovedJudgmentRules(db as Db, ENTRY);
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      costCode: "TEST",
      adjustmentUsdPerGsf: 1,
      provenance: {
        kind: "reviewed_judgment",
        recordedBy: "Synthetic Test Estimator",
        recordedAt: "2026-09-21",
        exportLabel: null,
      },
    });
  });

  it("leaves out a rule for another project type or construction kind", async () => {
    const other = await stage({ projectType: "self_storage" });
    await approveJudgmentRule(db as Db, other.id, "reviewer@kulka.com");
    expect(await readApprovedJudgmentRules(db as Db, ENTRY)).toEqual([]);
  });

  it("feeds the engine, where the approved rule adjusts the line and flags it as judgment", async () => {
    const staged = await stage();
    await approveJudgmentRule(db as Db, staged.id, "reviewer@kulka.com");
    const judgmentRules = await readApprovedJudgmentRules(db as Db, ENTRY);

    const benchmarks: Benchmark[] = [
      {
        costCode: "TEST",
        label: "Synthetic test line",
        unit: "usd_per_gsf",
        value: 1,
        projectType: "multifamily",
        constructionKind: "new",
        provenance: {
          kind: "proest_budget",
          sourceProjectIds: ["11111111-1111-4111-8111-111111111111"],
          exportLabel: "synthetic export",
          recordedBy: "automated test",
          recordedAt: "2026-08-27",
        },
        scopeSide: "building",
        contractSide: "kulka",
      },
    ];
    const parameters = Object.fromEntries(
      Object.entries({
        "weight.actuals": 5,
        "weight.proest_budget": 1,
        "weight.reviewed_judgment": 2,
        "weight.llm_proposal": 0.5,
        "flag.high_min_comparables": 5,
        "flag.medium_min_comparables": 2,
        "spread.high": 0.1,
        "spread.medium": 0.2,
        "spread.low": 0.35,
      }).map(([name, value]) => [
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

    const answers = {
      projectType: "multifamily" as const,
      constructionKind: "new" as const,
      grossSquareFeet: 1000,
      facts: { synthetic_test_condition: "yes" },
    };

    const withRule = computeRom(answers, { benchmarks, parameters, judgmentRules });
    const withoutRule = computeRom(answers, { benchmarks, parameters });

    expect(withRule.lines[0].high).toBeGreaterThan(withoutRule.lines[0].high);
    expect(withRule.lines[0].judgmentAdjustments[0]).toMatchObject({
      ruleId: staged.id,
      kind: "reviewed_judgment",
      recordedBy: "Synthetic Test Estimator",
    });
  });
});
