import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { createUnderwritingCase, saveUnderwritingCostSchedule } from "@/lib/underwriting/cases";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET, POST } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db?.close();
});

describe("/api/underwriting/cases/:id/runs", () => {
  it("stores a failed run and returns it as the latest run", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Route run case",
      address: "600 Test Avenue",
      assumptions: {},
    });
    const created = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision }),
    }), context(savedCase!.id));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.run.status).toBe("failed");
    expect(createdBody.run.results).toEqual([]);
    expect(createdBody.run.issues).toContainEqual(expect.objectContaining({ code: "missing" }));

    const latest = await GET(new Request("http://localhost"), context(savedCase!.id));
    expect(latest.status).toBe(200);
    expect((await latest.json()).run.caseId).toBe(savedCase!.id);
  });

  it("returns clear errors for invalid, missing, and uncalculated cases", async () => {
    expect((await POST(new Request("http://localhost"), context("bad"))).status).toBe(404);
    expect((await GET(new Request("http://localhost"), context("bad"))).status).toBe(404);
    const missingId = "00000000-0000-4000-8000-0000000000ff";
    expect((await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ expectedRevision: 1 }),
    }), context(missingId))).status).toBe(404);

    const savedCase = await createUnderwritingCase(db, {
      name: "No run case",
      address: "601 Test Avenue",
      assumptions: {},
    });
    expect((await GET(new Request("http://localhost"), context(savedCase!.id))).status).toBe(404);
  });

  it("returns 409 when the case revision changed", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Changed route case",
      address: "602 Test Avenue",
      assumptions: {},
    });
    await db.query(
      `update underwriting_cases set case_revision = case_revision + 1 where id = $1`,
      [savedCase!.id],
    );

    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision }),
    }), context(savedCase!.id));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("project changed") });
  });

  it("runs and returns the saved monthly cost formula for a scheduled case", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Monthly route case",
      address: "603 Test Avenue",
      assumptions: {},
    });
    const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-03",
      costLines: [{
        id: "land",
        name: "Land",
        category: "land",
        amount: 1_000_000,
        unit: "usd",
        startMonth: "2026-01",
        endMonth: "2026-01",
        distributionMethod: "straight_line",
        distributionVersion: "straight_line.v1",
        reviewState: "working",
      }],
    });

    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ expectedRevision: scheduled!.caseRevision }),
    }), context(savedCase!.id));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.run).toMatchObject({
      formulaVersion: "underwriting.monthly_cost_schedule.v1",
      status: "complete",
      inputSnapshot: { analysisStartMonth: "2026-01", saleMonth: "2026-03" },
      monthlyCostResult: { totalUses: 1_000_000 },
      reconciliations: expect.arrayContaining([
        expect.objectContaining({ id: "cost-line:land", status: "pass" }),
      ]),
    });
  });
});
