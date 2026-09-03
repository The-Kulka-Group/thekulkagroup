import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { createUnderwritingCase, saveUnderwritingCostSchedule } from "@/lib/underwriting/cases";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { PUT } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

const operations = {
  inputVersion: "apartment_operations_inputs.v1",
  operationStartMonth: "2026-02",
  growthStartMonth: "2026-02",
  preleasedUnits: 2,
  leaseUpUnitsPerMonth: 4,
  annualIncomeGrowthPercent: 3,
  annualExpenseGrowthPercent: 3,
  rentAdjustmentLossPercent: 0,
  freeRentPercent: 0,
  vacancyPercent: 5,
  creditLossPercent: 1,
  assumptionEvidence: {
    operationStartMonth: { reviewState: "working" },
    growthStartMonth: { reviewState: "working" },
    preleasedUnits: { reviewState: "working" },
    leaseUpUnitsPerMonth: { reviewState: "working" },
    annualIncomeGrowthPercent: { reviewState: "working" },
    annualExpenseGrowthPercent: { reviewState: "working" },
    rentAdjustmentLossPercent: { reviewState: "working" },
    freeRentPercent: { reviewState: "working" },
    vacancyPercent: { reviewState: "working" },
    creditLossPercent: { reviewState: "working" },
  },
  residentialUnitTypes: [{
    id: "one-bedroom",
    name: "One Bedroom",
    units: 10,
    nonRevenueUnits: 0,
    averageAreaSf: 800,
    monthlyMarketRent: 2_000,
    reviewState: "working",
  }],
  otherIncomeLines: [],
  operatingExpenseLines: [],
  capitalExpenditureLines: [],
};

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

async function scheduledCase() {
  const savedCase = await createUnderwritingCase(db, {
    name: "Operations route case",
    address: "710 Test Avenue",
    assumptions: {},
  });
  return saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
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
      reviewState: "working",
    }],
  });
}

describe("/api/underwriting/cases/:id/operations", () => {
  it("saves the versioned operations input on a new case revision", async () => {
    const savedCase = await scheduledCase();
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision, ...operations }),
    }), context(savedCase!.id));

    expect(response.status).toBe(200);
    expect((await response.json()).case).toMatchObject({
      caseRevision: 3,
      apartmentOperations: operations,
    });
  });

  it("returns typed field issues without changing the case", async () => {
    const savedCase = await scheduledCase();
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision, ...operations, vacancyPercent: 110 }),
    }), context(savedCase!.id));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: { vacancyPercent: expect.stringMatching(/0 to 100/) },
      issues: [expect.objectContaining({ code: "invalid_percent" })],
    });
  });

  it.each([
    ["residentialUnitTypes", [null], "residentialUnitTypes.0"],
    ["otherIncomeLines", ["bad"], "otherIncomeLines.0"],
    ["operatingExpenseLines", [null], "operatingExpenseLines.0"],
    ["capitalExpenditureLines", [4], "capitalExpenditureLines.0"],
  ])("returns 400 for malformed %s entries", async (key, value, path) => {
    const savedCase = await scheduledCase();
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision, ...operations, [key]: value }),
    }), context(savedCase!.id));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.fieldErrors).toMatchObject({ [path]: expect.stringMatching(/object/) });
    expect(body.issues).toContainEqual(expect.objectContaining({ path, code: "invalid_line" }));
  });

  it("rejects a request body over the app JSON limit before database access", async () => {
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(1_000_001) }),
    }), context("00000000-0000-4000-8000-000000000001"));

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/too large/i) });
  });

  it("requires a cost schedule and rejects stale revisions", async () => {
    const noSchedule = await createUnderwritingCase(db, {
      name: "No schedule",
      address: "711 Test Avenue",
      assumptions: {},
    });
    const missingSchedule = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: noSchedule!.caseRevision, ...operations }),
    }), context(noSchedule!.id));
    expect(missingSchedule.status).toBe(400);

    const savedCase = await scheduledCase();
    await db.query(`update underwriting_cases set case_revision = case_revision + 1 where id = $1`, [savedCase!.id]);
    const conflict = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase!.caseRevision, ...operations }),
    }), context(savedCase!.id));
    expect(conflict.status).toBe(409);
  });
});
