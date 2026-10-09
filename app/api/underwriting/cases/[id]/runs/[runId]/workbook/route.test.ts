import ExcelJS from "exceljs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import {
  createUnderwritingCase,
  saveApartmentOperations,
  saveDevelopmentCapital,
  savePropertyReturns,
  saveUnderwritingCostSchedule,
} from "@/lib/underwriting/cases";
import { runUnderwritingCase } from "@/lib/underwriting/runs";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET } = await import("./route");
const context = (id: string, runId: string) => ({ params: Promise.resolve({ id, runId }) });
const working = () => ({ reviewState: "working" as const });

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db?.close();
});

async function scheduledCase() {
  const savedCase = await createUnderwritingCase(db, { name: "Workbook Case", address: "700 Test Avenue", proposedUnits: 10, grossBuildingSquareFeet: 9000, assumptions: {} });
  const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
    analysisStartMonth: "2026-01", saleMonth: "2026-12",
    costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
  });
  return scheduled!;
}

async function propertyRun() {
  const scheduled = await scheduledCase();
  const operating = await saveApartmentOperations(db, scheduled.id, scheduled.caseRevision, {
    inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01", preleasedUnits: 10, leaseUpUnitsPerMonth: 1,
    annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0, rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
    assumptionEvidence: {
      operationStartMonth: working(), growthStartMonth: working(), preleasedUnits: working(), leaseUpUnitsPerMonth: working(), annualIncomeGrowthPercent: working(),
      annualExpenseGrowthPercent: working(), rentAdjustmentLossPercent: working(), freeRentPercent: working(), vacancyPercent: working(), creditLossPercent: working(),
    },
    residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
    otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
  });
  const capital = await saveDevelopmentCapital(db, scheduled.id, operating!.caseRevision, {
    capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent: 65, annualInterestRatePercent: 8, loanFeePercent: 1,
    fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1",
    feeMonth: "2026-01", payoffMonth: "2026-12",
    capitalAssumptionEvidence: {
      targetDebtSharePercent: working(), annualInterestRatePercent: working(), loanFeePercent: working(), fundingOrder: working(),
      interestTreatment: working(), interestConvention: working(), feeMonth: working(), payoffMonth: working(),
    },
  });
  const property = await savePropertyReturns(db, scheduled.id, capital!.caseRevision, {
    saleInputVersion: "property_returns_inputs.v1", terminalCapRatePercent: 5.75, sellingCostPercent: 1.5,
    forwardNoiConvention: "forward_twelve_month_noi.v1", cashFlowDateConvention: "month_end_dates.v1", xirrConvention: "xirr_actual_365.v1",
    saleAssumptionEvidence: {
      saleMonth: working(), terminalCapRatePercent: working(), sellingCostPercent: working(),
      forwardNoiConvention: working(), cashFlowDateConvention: working(), xirrConvention: working(),
    },
  });
  const run = await runUnderwritingCase(db, scheduled.id, property!.caseRevision);
  expect(run!.status).toBe("complete");
  return { caseId: scheduled.id, run: run! };
}

describe("/api/underwriting/cases/:id/runs/:runId/workbook", () => {
  it("downloads a completed property run as a workbook", async () => {
    const { caseId, run } = await propertyRun();
    const response = await GET(new Request("http://localhost"), context(caseId, run.id));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(response.headers.get("Content-Disposition")).toContain(`Run ${run.id.slice(0, 8)}.xlsx`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await response.arrayBuffer());
    expect(workbook.worksheets.map(({ name }) => name)).toEqual(["Returns", "Sources and Uses", "Monthly", "Loan", "Operations", "Costs", "Annual", "Assumptions"]);
    expect(workbook.getWorksheet("Returns")!.getCell("A2").value).toMatch(/^Workbook Case, Case \d+ \(Sheet U-\d+\)$/);
  });

  it("refuses a run with no returns and a run from another case", async () => {
    const scheduled = await scheduledCase();
    const costRun = await runUnderwritingCase(db, scheduled.id, scheduled.caseRevision);
    const costOnly = await GET(new Request("http://localhost"), context(scheduled.id, costRun!.id));
    expect(costOnly.status).toBe(409);

    const { run } = await propertyRun();
    expect((await GET(new Request("http://localhost"), context(scheduled.id, run.id))).status).toBe(404);
    expect((await GET(new Request("http://localhost"), context("bad", run.id))).status).toBe(404);
  });
});
