import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import {
  createUnderwritingCase,
  saveApartmentOperations,
  saveDevelopmentCapital,
  saveUnderwritingCostSchedule,
} from "@/lib/underwriting/cases";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
const { PUT } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

const salePlan = {
  saleInputVersion: "property_returns_inputs.v1",
  terminalCapRatePercent: 5.75,
  sellingCostPercent: 1.5,
  forwardNoiConvention: "forward_twelve_month_noi.v1",
  cashFlowDateConvention: "month_end_dates.v1",
  xirrConvention: "xirr_actual_365.v1",
  saleAssumptionEvidence: saleEvidence(),
} as const;

beforeEach(async () => { db = await seededDatabase(); });
afterEach(async () => { await db.close(); });

describe("/api/underwriting/cases/:id/returns", () => {
  it("saves reviewed sale inputs on a new case revision", async () => {
    const savedCase = await capitalCase();
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: savedCase.caseRevision, ...salePlan }) }), context(savedCase.id));
    expect(response.status).toBe(200);
    expect((await response.json()).case).toMatchObject({ caseRevision: 5, propertyReturns: salePlan });
  });

  it("returns typed issues and rejects stale revisions", async () => {
    const savedCase = await capitalCase();
    const invalid = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: savedCase.caseRevision, ...salePlan, terminalCapRatePercent: 0 }) }), context(savedCase.id));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ fieldErrors: { terminalCapRatePercent: expect.stringMatching(/greater than zero/) }, issues: [expect.objectContaining({ code: "invalid_percent" })] });
    await db.query(`update underwriting_cases set case_revision = case_revision + 1 where id = $1`, [savedCase.id]);
    const stale = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: savedCase.caseRevision, ...salePlan }) }), context(savedCase.id));
    expect(stale.status).toBe(409);
  });

  it("requires a saved capital plan", async () => {
    const savedCase = await createUnderwritingCase(db, { name: "No capital", address: "1 Test Way", assumptions: {} });
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: savedCase!.caseRevision, ...salePlan }) }), context(savedCase!.id));
    expect(response.status).toBe(400);
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
});

async function capitalCase() {
  const savedCase = await createUnderwritingCase(db, { name: "Sale route case", address: "721 Test Avenue", assumptions: {} });
  const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
    analysisStartMonth: "2026-01", saleMonth: "2026-12",
    costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
  });
  const operations = await saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
    inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01", preleasedUnits: 10, leaseUpUnitsPerMonth: 1,
    annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0, rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
    assumptionEvidence: operationsEvidence(), residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
    otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
  });
  return (await saveDevelopmentCapital(db, savedCase!.id, operations!.caseRevision, {
    capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent: 65, annualInterestRatePercent: 8, loanFeePercent: 1,
    fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1",
    feeMonth: "2026-01", payoffMonth: "2026-12", capitalAssumptionEvidence: capitalEvidence(),
  }))!;
}

function item() { return { reviewState: "working" as const }; }
function operationsEvidence() { return { operationStartMonth: item(), growthStartMonth: item(), preleasedUnits: item(), leaseUpUnitsPerMonth: item(), annualIncomeGrowthPercent: item(), annualExpenseGrowthPercent: item(), rentAdjustmentLossPercent: item(), freeRentPercent: item(), vacancyPercent: item(), creditLossPercent: item() }; }
function capitalEvidence() { return { targetDebtSharePercent: item(), annualInterestRatePercent: item(), loanFeePercent: item(), fundingOrder: item(), interestTreatment: item(), interestConvention: item(), feeMonth: item(), payoffMonth: item() }; }
function saleEvidence() { return { saleMonth: item(), terminalCapRatePercent: item(), sellingCostPercent: item(), forwardNoiConvention: item(), cashFlowDateConvention: item(), xirrConvention: item() }; }
