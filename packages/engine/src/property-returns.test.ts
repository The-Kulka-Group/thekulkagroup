import { describe, expect, it } from "vitest";

import {
  calculatePropertyReturns,
  computePropertyReturns,
  PROPERTY_RETURNS_FORMULA_VERSION,
  type PropertyReturnsInputs,
  type PropertyReturnsPlan,
} from "./property-returns";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";

const evidence = {
  saleMonth: { sourceLabel: "Disposition plan", sourceDate: "2026-08-01", reviewState: "done" as const },
  terminalCapRatePercent: { sourceLabel: "Market study", sourceDate: "2026-08-01", reviewState: "done" as const },
  sellingCostPercent: { sourceLabel: "Disposition plan", sourceDate: "2026-08-01", reviewState: "done" as const },
  forwardNoiConvention: { sourceLabel: "Model policy", sourceDate: "2026-08-01", reviewState: "done" as const },
  cashFlowDateConvention: { sourceLabel: "Model policy", sourceDate: "2026-08-01", reviewState: "done" as const },
  xirrConvention: { sourceLabel: "Model policy", sourceDate: "2026-08-01", reviewState: "done" as const },
};

const plan: PropertyReturnsPlan = {
  saleInputVersion: "property_returns_inputs.v1",
  terminalCapRatePercent: 5,
  sellingCostPercent: 2,
  forwardNoiConvention: "forward_twelve_month_noi.v1",
  cashFlowDateConvention: "month_end_dates.v1",
  xirrConvention: "xirr_actual_365.v1",
  saleAssumptionEvidence: evidence,
};

describe("calculatePropertyReturns", () => {
  it("matches the audited workbook sale and property return fixture", () => {
    const fixture = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE;
    const run = calculatePropertyReturns(fixture.months, fixture.forwardSalePeriod, fixture.plan);

    expect(run.formulaVersion).toBe(PROPERTY_RETURNS_FORMULA_VERSION);
    expect(run.status).toBe("complete");
    expect(run.issues).toEqual([]);
    expect(run.result).not.toBeNull();
    const result = run.result!;
    for (const [key, expected] of Object.entries(fixture.expected.sale)) {
      expect(Math.abs(Number(result.sale[key as keyof typeof result.sale]) - expected))
        .toBeLessThanOrEqual(fixture.tolerances.usd);
    }
    for (const stream of ["unlevered", "levered"] as const) {
      expect(Math.abs(result.returns[stream].xirr - fixture.expected[stream].xirr)).toBeLessThanOrEqual(fixture.tolerances.ratio);
      expect(Math.abs(result.returns[stream].equityMultiple - fixture.expected[stream].equityMultiple)).toBeLessThanOrEqual(fixture.tolerances.ratio);
      expect(result.returns[stream].netProfit).toBeCloseTo(fixture.expected[stream].netProfit, 2);
    }
    expect(result.yieldOnCost).toBeCloseTo(fixture.expected.yieldOnCost, 9);
    expect(result.developmentSpreadBasisPoints).toBeCloseTo(fixture.expected.developmentSpreadBasisPoints, 6);
    expect(result.reconciliations.every(({ status }) => status === "pass")).toBe(true);
  });

  it("uses forward NOI for sale proceeds and dates every monthly cash flow at month end", () => {
    const run = calculatePropertyReturns([
      { month: "2026-01", projectCosts: 1_000_000, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 0 },
      { month: "2026-02", projectCosts: 0, loanFee: 0, grossInterest: 0, totalDebtDraw: 500_000, operatingCashFlow: 0, repayment: 500_000 },
    ], {
      startMonth: "2026-02", endMonth: "2027-01", monthCount: 12,
      effectiveGrossRevenue: 100_000, operatingExpenses: 40_000,
    }, plan);

    expect(run.result?.sale).toMatchObject({
      forwardNetOperatingIncome: 60_000,
      grossSaleValue: 1_200_000,
      sellingCosts: 24_000,
      netSaleProceeds: 1_176_000,
      debtPayoff: 500_000,
      equitySaleProceeds: 676_000,
    });
    expect(run.result?.months.map(({ date }) => date)).toEqual(["2026-01-31", "2026-02-28"]);
  });

  it("returns typed issues instead of a false XIRR when a cash-flow stream has no root", () => {
    const run = calculatePropertyReturns([
      { month: "2026-01", projectCosts: 100, loanFee: 0, grossInterest: 0, totalDebtDraw: 100, operatingCashFlow: 0, repayment: 0 },
      { month: "2026-02", projectCosts: 0, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 100 },
    ], {
      startMonth: "2026-02", endMonth: "2027-01", monthCount: 12,
      effectiveGrossRevenue: 0, operatingExpenses: 0,
    }, plan);

    expect(run.status).toBe("failed");
    expect(run.result).toBeNull();
    expect(run.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "xirr_no_root", path: "unleveredCashFlow" }),
      expect.objectContaining({ code: "xirr_no_root", path: "leveredCashFlow" }),
    ]));
  });

  it.each([
    ["input version", { saleInputVersion: "sale.v0" }, "unsupported_input_version"],
    ["terminal cap", { terminalCapRatePercent: 0 }, "invalid_percent"],
    ["selling costs", { sellingCostPercent: 101 }, "invalid_percent"],
    ["forward NOI rule", { forwardNoiConvention: "trailing.v1" }, "unsupported_forward_noi_convention"],
    ["date rule", { cashFlowDateConvention: "month_start.v1" }, "unsupported_date_convention"],
    ["XIRR rule", { xirrConvention: "periodic_irr.v1" }, "unsupported_xirr_convention"],
  ])("rejects an unsupported or invalid %s", (_label, override, code) => {
    const fixture = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE;
    const run = calculatePropertyReturns(fixture.months, fixture.forwardSalePeriod, { ...fixture.plan, ...override } as PropertyReturnsPlan);
    expect(run.status).toBe("failed");
    expect(run.issues).toContainEqual(expect.objectContaining({ code }));
  });
});

describe("computePropertyReturns", () => {
  it("runs the capital model and a forward twelve-month operating period first", () => {
    const fixture = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE;
    const run = computePropertyReturns(fixture.fullModelInput as PropertyReturnsInputs);
    expect(run.status).toBe("complete");
    expect(run.result?.forwardOperations.months).toHaveLength(12);
    expect(run.inputSnapshot).toEqual(fixture.fullModelInput);
  });
});
