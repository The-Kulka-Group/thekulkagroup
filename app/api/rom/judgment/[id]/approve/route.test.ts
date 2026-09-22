import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { readApprovedJudgmentRules, stageJudgmentRule } from "@/lib/rom/judgment";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function approve(id: string, headers: Record<string, string> = {}) {
  return POST(new Request("http://localhost", { method: "POST", headers }), context(id));
}

// A synthetic test fixture, not a rule anyone stated.
const PROJECT = { projectType: "multifamily" as const, constructionKind: "new" as const };

function staged() {
  return stageJudgmentRule(db as Db, {
    costCode: "TEST",
    label: "Synthetic test rule",
    ...PROJECT,
    condition: { fact: "synthetic_test_condition", equals: "yes" },
    adjustmentUsdPerGsf: 1,
    statedBy: "Synthetic Test Estimator",
    statedOn: "2026-09-21",
    reason: "Fixture for an automated test.",
  });
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/judgment/:id/approve", () => {
  it("rejects a signed-out request and leaves the rule staged", async () => {
    const rule = await staged();
    const response = await approve(rule.id, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);

    const { rows } = await db.query<{ status: string }>(
      `select status from judgment_rules where id = $1`,
      [rule.id],
    );
    expect(rows[0].status).toBe("staged");
    expect(await readApprovedJudgmentRules(db as Db, PROJECT)).toEqual([]);
  });

  it("approves a staged rule, records the approver, and puts it in front of the engine", async () => {
    const rule = await staged();
    const response = await approve(rule.id);
    expect(response.status).toBe(200);

    const { judgmentRule } = await response.json();
    expect(judgmentRule.status).toBe("approved");
    expect(judgmentRule.approvedBy).toBe("browser-test@kulka.invalid");

    const readable = await readApprovedJudgmentRules(db as Db, PROJECT);
    expect(readable.map((r) => r.id)).toEqual([rule.id]);
  });

  it("returns 409 on a second approval of the same rule", async () => {
    const rule = await staged();
    await approve(rule.id);
    expect((await approve(rule.id)).status).toBe(409);
  });

  it("returns 404 for a rule that does not exist, and for an id that is not a uuid", async () => {
    expect((await approve("00000000-0000-4000-8000-0000000000ff")).status).toBe(404);
    expect((await approve("not-a-uuid")).status).toBe(404);
  });
});
