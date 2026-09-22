import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { stageJudgmentRule } from "@/lib/rom/judgment";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function read(id: string, headers: Record<string, string> = {}) {
  return GET(new Request("http://localhost", { headers }), context(id));
}

// A synthetic test fixture, not a rule anyone stated.
function staged() {
  return stageJudgmentRule(db as Db, {
    costCode: "TEST",
    label: "Synthetic test rule",
    projectType: "multifamily",
    constructionKind: "new",
    condition: null,
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

describe("GET /api/rom/judgment/:id", () => {
  it("rejects a signed-out request", async () => {
    const rule = await staged();
    expect((await read(rule.id, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
  });

  it("returns the rule with its provenance", async () => {
    const rule = await staged();
    const response = await read(rule.id);
    expect(response.status).toBe(200);

    const { judgmentRule } = await response.json();
    expect(judgmentRule.id).toBe(rule.id);
    expect(judgmentRule.statedBy).toBe("Synthetic Test Estimator");
    expect(judgmentRule.reason).toBe("Fixture for an automated test.");
  });

  it("returns 404 for a rule that does not exist", async () => {
    expect((await read("00000000-0000-4000-8000-0000000000ff")).status).toBe(404);
    expect((await read("not-a-uuid")).status).toBe(404);
  });
});
