import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { createUnderwritingCase } from "@/lib/underwriting/cases";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { PUT } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

const schedule = {
  analysisStartMonth: "2026-01",
  saleMonth: "2026-12",
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
    sourceLabel: "Purchase agreement",
    sourceDate: "2026-08-01",
    reviewState: "done",
  }],
};

describe("/api/underwriting/cases/:id/schedule", () => {
  it("saves and returns the full schedule on a new case revision", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Schedule route case",
      address: "700 Test Avenue",
      assumptions: {},
    });

    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision, ...schedule }),
    }), context(savedCase!.id));

    expect(response.status).toBe(200);
    expect((await response.json()).case).toMatchObject({
      caseRevision: 2,
      costSchedule: schedule,
    });
  });

  it("returns engine field issues without changing the case", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Invalid schedule route case",
      address: "701 Test Avenue",
      assumptions: {},
    });
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: savedCase!.caseRevision,
        ...schedule,
        costLines: [{ ...schedule.costLines[0], amount: -1 }],
      }),
    }), context(savedCase!.id));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: { "costLines.0.amount": expect.stringMatching(/positive/) },
      issues: [expect.objectContaining({ code: "invalid_amount" })],
    });
  });

  it("returns typed field errors for every schedule schema boundary", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Schedule boundary route case",
      address: "703 Test Avenue",
      assumptions: {},
    });
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: savedCase!.caseRevision,
        ...schedule,
        analysisStartMonth: "1899-12",
        saleMonth: "2201-01",
        costLines: [{
          ...schedule.costLines[0],
          id: "x".repeat(101),
          name: "n".repeat(201),
          sourceLabel: "   ",
        }],
      }),
    }), context(savedCase!.id));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: {
        analysisStartMonth: expect.stringMatching(/between 1900 and 2200/),
        saleMonth: expect.stringMatching(/between 1900 and 2200/),
        "costLines.0.id": expect.stringMatching(/100 characters/),
        "costLines.0.name": expect.stringMatching(/200 characters/),
        "costLines.0.sourceLabel": expect.stringMatching(/cannot be blank/),
      },
    });
  });

  it("returns 409 for a stale revision and 404 for invalid IDs", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Stale schedule route case",
      address: "702 Test Avenue",
      assumptions: {},
    });
    await db.query(`update underwriting_cases set case_revision = case_revision + 1 where id = $1`, [savedCase!.id]);
    const conflict = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision, ...schedule }),
    }), context(savedCase!.id));

    expect(conflict.status).toBe(409);
    expect((await PUT(new Request("http://localhost"), context("bad"))).status).toBe(404);
  });

  it("returns 413 for a streamed body over one megabyte before saving", async () => {
    const savedCase = await createUnderwritingCase(db, { name: "Large schedule route case", address: "704 Test Avenue", assumptions: {} });
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision, padding: "x".repeat(1_000_001) }),
    }), context(savedCase!.id));
    expect(response.status).toBe(413);
    expect((await response.json()).error).toMatch(/too large/i);
  });
});
