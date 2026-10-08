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

  it("returns typed evidence issues without saving", async () => {
    const savedCase = await capitalCase();
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({
      expectedRevision: savedCase.caseRevision,
      ...salePlan,
      saleAssumptionEvidence: {
        ...salePlan.saleAssumptionEvidence,
        sellingCostPercent: { reviewState: "working", sourceLabel: "x".repeat(501) },
      },
    }) }), context(savedCase.id));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      fieldErrors: { "saleAssumptionEvidence.sellingCostPercent.sourceLabel": expect.any(String) },
      issues: [expect.objectContaining({ code: "text_too_long" })],
    });
  });

  it("saves the commercial exit cap, the commercial lender cap and the debt service basis inside the existing JSON (LA-1870)", async () => {
    const savedCase = await capitalCase();
    const plan = {
      ...salePlan,
      commercialTerminalCapRatePercent: 7,
      saleAssumptionEvidence: { ...salePlan.saleAssumptionEvidence, commercialTerminalCapRatePercent: { reviewState: "done" as const, sourceLabel: "Broker opinion", sourceDate: "2026-10-07" } },
      lenderTests: {
        lenderTestInputVersion: "lender_tests_inputs.v1",
        valuationMonth: "2026-06",
        asStabilizedCapRatePercent: 5.5,
        commercialCapRatePercent: 7.25,
        annualDebtService: 1_000_000,
        noiBasis: "noi_before_reserves",
        debtServiceBasis: "stated",
        lenderTestEvidence: {
          valuationMonth: item(), asStabilizedCapRatePercent: item(), annualDebtService: item(), noiBasis: item(),
          commercialCapRatePercent: { reviewState: "done" as const, sourceLabel: "Lender term sheet", sourceDate: "2026-10-07" },
        },
      },
    };
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: savedCase.caseRevision, ...plan }) }), context(savedCase.id));
    expect(response.status).toBe(200);
    expect((await response.json()).case.propertyReturns).toMatchObject(plan);
    const { rows } = await db.query<{ property_returns_input: typeof plan }>(`select property_returns_input from underwriting_cases where id = $1`, [savedCase.id]);
    expect(rows[0].property_returns_input.commercialTerminalCapRatePercent).toBe(7);
    expect(rows[0].property_returns_input.lenderTests).toMatchObject({ commercialCapRatePercent: 7.25, debtServiceBasis: "stated" });
  });

  it("resets a commercial cap's review to Working on It when its value changes", async () => {
    const savedCase = await capitalCase();
    const plan = (cap: number) => ({
      ...salePlan,
      commercialTerminalCapRatePercent: cap,
      saleAssumptionEvidence: { ...salePlan.saleAssumptionEvidence, commercialTerminalCapRatePercent: { reviewState: "done" as const, sourceLabel: "Broker opinion", sourceDate: "2026-10-07" } },
    });
    const first = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: savedCase.caseRevision, ...plan(7) }) }), context(savedCase.id));
    const revision = (await first.json()).case.caseRevision;
    const second = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: revision, ...plan(7) }) }), context(savedCase.id));
    expect((await second.json()).case.propertyReturns.saleAssumptionEvidence.commercialTerminalCapRatePercent.reviewState).toBe("done");
    const third = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: revision + 1, ...plan(8) }) }), context(savedCase.id));
    expect((await third.json()).case.propertyReturns.saleAssumptionEvidence.commercialTerminalCapRatePercent.reviewState).toBe("working");
  });

  it("refuses a commercial cap with no evidence, a bad rate or a bad debt service basis", async () => {
    const savedCase = await capitalCase();
    const put = async (body: object) => PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: savedCase.caseRevision, ...body }) }), context(savedCase.id));
    const noEvidence = await put({ ...salePlan, commercialTerminalCapRatePercent: 7 });
    expect(noEvidence.status).toBe(400);
    expect(await noEvidence.json()).toMatchObject({ fieldErrors: { "saleAssumptionEvidence.commercialTerminalCapRatePercent": expect.any(String) } });
    const badRate = await put({ ...salePlan, commercialTerminalCapRatePercent: 0, saleAssumptionEvidence: { ...salePlan.saleAssumptionEvidence, commercialTerminalCapRatePercent: item() } });
    expect(await badRate.json()).toMatchObject({ fieldErrors: { commercialTerminalCapRatePercent: expect.stringMatching(/greater than zero/) } });
    const lender = (overrides: object) => ({
      ...salePlan,
      lenderTests: {
        lenderTestInputVersion: "lender_tests_inputs.v1", valuationMonth: "2026-06", asStabilizedCapRatePercent: 5.5, annualDebtService: 1, noiBasis: "noi_before_reserves",
        lenderTestEvidence: { valuationMonth: item(), asStabilizedCapRatePercent: item(), annualDebtService: item(), noiBasis: item() },
        ...overrides,
      },
    });
    const noLenderEvidence = await put(lender({ commercialCapRatePercent: 7 }));
    expect(await noLenderEvidence.json()).toMatchObject({ fieldErrors: { "lenderTests.lenderTestEvidence.commercialCapRatePercent": expect.any(String) } });
    const badBasis = await put(lender({ debtServiceBasis: "guess" }));
    expect(await badBasis.json()).toMatchObject({ fieldErrors: { "lenderTests.debtServiceBasis": expect.stringMatching(/Stated or Permanent Loan/) } });
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
