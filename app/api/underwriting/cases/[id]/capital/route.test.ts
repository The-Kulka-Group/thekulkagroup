import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import {
  createUnderwritingCase,
  saveApartmentOperations,
  saveUnderwritingCostSchedule,
} from "@/lib/underwriting/cases";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { PUT } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

const plan = {
  capitalInputVersion: "development_capital_inputs.v1",
  targetDebtSharePercent: 65,
  annualInterestRatePercent: 8,
  loanFeePercent: 1,
  fundingOrder: "equity_first.v1",
  interestTreatment: "capitalized_net_operating_cash.v1",
  interestConvention: "opening_balance_monthly.v1",
  feeMonth: "2026-01",
  payoffMonth: "2026-12",
  capitalAssumptionEvidence: capitalEvidence(),
};

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("/api/underwriting/cases/:id/capital", () => {
  it("saves a reviewed capital plan on a new case revision", async () => {
    const savedCase = await operatingCase();
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase.caseRevision, ...plan }),
    }), context(savedCase.id));

    expect(response.status).toBe(200);
    expect((await response.json()).case).toMatchObject({
      caseRevision: 4,
      developmentCapital: plan,
    });
  });

  it("returns typed capital issues without changing the case", async () => {
    const savedCase = await operatingCase();
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: savedCase.caseRevision,
        ...plan,
        annualInterestRatePercent: -1,
      }),
    }), context(savedCase.id));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: { annualInterestRatePercent: expect.stringMatching(/0 to 100/) },
      issues: [expect.objectContaining({ code: "invalid_percent" })],
    });
  });

  it.each([
    ["sourceLabel", 42, "invalid_source_label"],
    ["sourceLabel", "x".repeat(501), "text_too_long"],
    ["sourceDate", 20260801, "invalid_source_date"],
    ["reviewState", 1, "invalid_review_state"],
  ])("returns a typed issue for invalid evidence %s", async (field, value, code) => {
    const savedCase = await operatingCase();
    const response = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({
        expectedRevision: savedCase.caseRevision,
        ...plan,
        capitalAssumptionEvidence: {
          ...plan.capitalAssumptionEvidence,
          annualInterestRatePercent: { reviewState: "working", [field]: value },
        },
      }),
    }), context(savedCase.id));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: { [`capitalAssumptionEvidence.annualInterestRatePercent.${field}`]: expect.any(String) },
      issues: [expect.objectContaining({ code })],
    });
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

  it("requires apartment operations and rejects a stale case revision", async () => {
    const noOperations = await createUnderwritingCase(db, {
      name: "No operations",
      address: "720 Test Avenue",
      assumptions: {},
    });
    const missing = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: noOperations!.caseRevision, ...plan }),
    }), context(noOperations!.id));
    expect(missing.status).toBe(400);

    const savedCase = await operatingCase();
    await db.query(`update underwriting_cases set case_revision = case_revision + 1 where id = $1`, [savedCase.id]);
    const stale = await PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ expectedRevision: savedCase.caseRevision, ...plan }),
    }), context(savedCase.id));
    expect(stale.status).toBe(409);
  });
});

async function operatingCase() {
  const savedCase = await createUnderwritingCase(db, {
    name: "Capital route case",
    address: "721 Test Avenue",
    assumptions: {},
  });
  const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
    analysisStartMonth: "2026-01",
    saleMonth: "2026-12",
    costLines: [{
      id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd",
      startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line",
      distributionVersion: "straight_line.v1", reviewState: "working",
    }],
  });
  return (await saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
    inputVersion: "apartment_operations_inputs.v1",
    operationStartMonth: "2026-01", growthStartMonth: "2026-01", preleasedUnits: 10,
    leaseUpUnitsPerMonth: 1, annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0,
    rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
    assumptionEvidence: operationsEvidence(),
    residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
    otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
  }))!;
}

function operationsEvidence() {
  const item = () => ({ reviewState: "working" as const });
  return {
    operationStartMonth: item(), growthStartMonth: item(), preleasedUnits: item(), leaseUpUnitsPerMonth: item(),
    annualIncomeGrowthPercent: item(), annualExpenseGrowthPercent: item(), rentAdjustmentLossPercent: item(),
    freeRentPercent: item(), vacancyPercent: item(), creditLossPercent: item(),
  };
}

function capitalEvidence() {
  const item = () => ({ reviewState: "working" });
  return {
    targetDebtSharePercent: item(), annualInterestRatePercent: item(), loanFeePercent: item(), fundingOrder: item(),
    interestTreatment: item(), interestConvention: item(), feeMonth: item(), payoffMonth: item(),
  };
}
