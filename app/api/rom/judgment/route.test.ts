import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET, POST } = await import("./route");

// Entering a judgment rule through the API (LA-19 AC1). Every figure is a
// synthetic test fixture, not a cost anyone stated.
const BODY = {
  costCode: "TEST",
  label: "Synthetic test rule",
  projectType: "multifamily",
  constructionKind: "new",
  condition: { fact: "synthetic_test_condition", equals: "yes" },
  adjustmentUsdPerGsf: 1,
  statedBy: "Synthetic Test Estimator",
  statedOn: "2026-09-21",
  reason: "Fixture for an automated test.",
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost", { method: "POST", headers, body: JSON.stringify(body) }),
  );
}

function get(query = "", headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/rom/judgment${query}`, { headers }));
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/judgment", () => {
  it("rejects a signed-out request without entering anything", async () => {
    const response = await post(BODY, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
    expect((await db.query(`select 1 from judgment_rules`)).rows).toEqual([]);
  });

  it("enters a rule with its stating person and date, staged", async () => {
    const response = await post(BODY);
    expect(response.status).toBe(201);

    const { judgmentRule } = await response.json();
    expect(judgmentRule.status).toBe("staged");
    expect(judgmentRule.statedBy).toBe("Synthetic Test Estimator");
    expect(judgmentRule.statedOn).toBe("2026-09-21");
    expect(judgmentRule.approvedBy).toBeNull();
  });

  it("refuses a rule with no stated reason", async () => {
    const response = await post({ ...BODY, reason: "" });
    expect(response.status).toBe(400);
    expect((await db.query(`select 1 from judgment_rules`)).rows).toEqual([]);
  });

  it("refuses an adjustment that is missing or zero", async () => {
    expect((await post({ ...BODY, adjustmentUsdPerGsf: undefined })).status).toBe(400);
    expect((await post({ ...BODY, adjustmentUsdPerGsf: 0 })).status).toBe(400);
  });

  it("refuses a project type the engine does not know", async () => {
    expect((await post({ ...BODY, projectType: "office" })).status).toBe(400);
  });
});

describe("GET /api/rom/judgment", () => {
  it("rejects a signed-out request", async () => {
    expect((await get("", { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
  });

  it("lists entered rules and filters to one status", async () => {
    await post(BODY);
    const all = await (await get()).json();
    expect(all.judgmentRules).toHaveLength(1);

    const approved = await (await get("?status=approved")).json();
    expect(approved.judgmentRules).toEqual([]);
  });

  it("refuses a status it does not recognize", async () => {
    expect((await get("?status=nonsense")).status).toBe(400);
  });
});
