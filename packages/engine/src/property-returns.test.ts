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
      expect(Math.abs(result.returns[stream].netProfit - fixture.expected[stream].netProfit)).toBeLessThanOrEqual(fixture.tolerances.usd);
    }
    expect(result.yieldOnCost).toBeCloseTo(fixture.expected.yieldOnCost, 9);
    expect(Math.abs(result.developmentSpreadBasisPoints - fixture.expected.developmentSpreadBasisPoints)).toBeLessThanOrEqual(fixture.tolerances.ratio * 10_000);
    expect(result.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(result.reconciliations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "gross-sale-value", status: "pass" }),
      expect.objectContaining({ id: "selling-costs", status: "pass" }),
      expect.objectContaining({ id: "debt-payoff", status: "pass" }),
      expect.objectContaining({ id: "unlevered-equity-multiple", status: "pass" }),
      expect.objectContaining({ id: "levered-equity-multiple", status: "pass" }),
      expect.objectContaining({ id: "unlevered-xirr-residual", status: "pass" }),
      expect.objectContaining({ id: "levered-xirr-residual", status: "pass" }),
      expect.objectContaining({ id: "yield-on-cost", status: "pass" }),
      expect.objectContaining({ id: "development-spread", status: "pass" }),
    ]));
    expect(allUsdResultsAreCentRounded(result)).toBe(true);
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
    ["project cost", "months.0.projectCosts", { monthField: "projectCosts", value: 100.001 }],
    ["operating cash flow", "months.0.operatingCashFlow", { monthField: "operatingCashFlow", value: 0.001 }],
    ["unsafe repayment", "months.1.repayment", { monthField: "repayment", value: Number.MAX_SAFE_INTEGER }],
    ["forward revenue", "forwardSalePeriod", { periodField: "effectiveGrossRevenue", value: 100_000.001 }],
  ])("rejects sub-cent or unsafe standalone USD for %s", (_label, path, override) => {
    const months = [
      { month: "2026-01", projectCosts: 100, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 0 },
      { month: "2026-02", projectCosts: 0, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 0 },
    ];
    const period = { startMonth: "2026-02", endMonth: "2027-01", monthCount: 12 as const, effectiveGrossRevenue: 100, operatingExpenses: 0 };
    if ("monthField" in override) Object.assign(months[override.monthField === "repayment" ? 1 : 0], { [override.monthField]: override.value });
    if ("periodField" in override) Object.assign(period, { [override.periodField]: override.value });

    const run = calculatePropertyReturns(months, period, plan);
    expect(run.status).toBe("failed");
    expect(run.issues).toContainEqual(expect.objectContaining({ path, code: "invalid_amount" }));
  });

  it("returns a convergence issue when a steep dated return cannot meet its scaled residual tolerance", () => {
    const run = calculatePropertyReturns([
      { month: "2026-01", projectCosts: 100, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 0 },
      { month: "2026-02", projectCosts: 0, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 0 },
    ], {
      startMonth: "2026-02", endMonth: "2027-01", monthCount: 12,
      effectiveGrossRevenue: 1_000_000, operatingExpenses: 0,
    }, { ...plan, terminalCapRatePercent: 1, sellingCostPercent: 0 });

    expect(run.status).toBe("failed");
    expect(run.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "xirr_convergence", path: "unleveredCashFlow" }),
      expect.objectContaining({ code: "xirr_convergence", path: "leveredCashFlow" }),
    ]));
  });

  it("accepts a scaled-residual root for cash flow with multiple sign changes", () => {
    const run = calculatePropertyReturns([
      { month: "2026-01", projectCosts: 100, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 0 },
      { month: "2026-02", projectCosts: 0, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 230, repayment: 0 },
      { month: "2026-03", projectCosts: 0, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: -132, repayment: 0 },
    ], {
      startMonth: "2026-03", endMonth: "2027-02", monthCount: 12,
      effectiveGrossRevenue: 0, operatingExpenses: 0,
    }, plan);

    expect(run.status).toBe("complete");
    expect(run.result?.reconciliations.filter(({ id }) => id.endsWith("xirr-residual")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: "pass" }), expect.objectContaining({ status: "pass" })]));
  });

  it("keeps large safe-cent cash flow and sale results on cent boundaries", () => {
    const run = calculatePropertyReturns([
      { month: "2026-01", projectCosts: 1_000_000_000_000, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 0 },
      { month: "2026-02", projectCosts: 0, loanFee: 0, grossInterest: 0, totalDebtDraw: 0, operatingCashFlow: 0, repayment: 0 },
    ], {
      startMonth: "2026-02", endMonth: "2027-01", monthCount: 12,
      effectiveGrossRevenue: 60_000_000_000, operatingExpenses: 0,
    }, plan);

    expect(run.status).toBe("complete");
    expect(allUsdResultsAreCentRounded(run.result!)).toBe(true);
    expect(run.result?.reconciliations.filter(({ id }) => id.endsWith("xirr-residual")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: "pass" }), expect.objectContaining({ status: "pass" })]));
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

  it.each([230, 240])("projects forward NOI after a %s-month capped development timeline at the year-2200 edge", (monthCount) => {
    const fixture = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE;
    const saleMonth = "2200-12";
    const analysisStartMonth = addMonths(saleMonth, -(monthCount - 1));
    const input = {
      ...fixture.fullModelInput,
      analysisStartMonth,
      saleMonth,
      operationStartMonth: addMonths(saleMonth, -23),
      growthStartMonth: addMonths(saleMonth, -23),
      costLines: fixture.fullModelInput.costLines.map((line, index) => ({
        ...line,
        startMonth: analysisStartMonth,
        endMonth: analysisStartMonth,
        amount: index === 0 ? line.amount : 0.01,
      })),
      feeMonth: analysisStartMonth,
      payoffMonth: saleMonth,
      annualInterestRatePercent: 0,
      loanFeePercent: 0,
    } as PropertyReturnsInputs;

    const run = computePropertyReturns(input);
    expect(run.status).toBe("complete");
    expect(run.result?.developmentCapital.months).toHaveLength(monthCount);
    expect(run.result?.forwardOperations).toMatchObject({ startMonth: saleMonth, endMonth: "2201-11" });
    expect(run.result?.forwardOperations.months).toHaveLength(12);
  });

  it("resolves every return metric input path against the immutable flat input snapshot", () => {
    const input = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput as PropertyReturnsInputs;
    const run = computePropertyReturns(input);

    expect(run.status).toBe("complete");
    for (const metric of run.result!.propertyReturns.metrics) {
      for (const path of metric.inputPaths) {
        expect(resolvePath(run.inputSnapshot, path), `${metric.key} input path ${path}`).not.toBeUndefined();
      }
    }
  });
});

function allUsdResultsAreCentRounded(result: NonNullable<ReturnType<typeof calculatePropertyReturns>["result"]>) {
  const saleValues = Object.values(result.sale);
  const monthlyValues = result.months.flatMap((month) => [
    month.projectCosts, month.loanFee, month.grossInterest, month.totalDebtDraw,
    month.operatingCashFlow, month.repayment, month.netSaleProceeds,
    month.unleveredCashFlow, month.leveredCashFlow,
  ]);
  return [...saleValues, ...monthlyValues, result.returns.unlevered.netProfit, result.returns.levered.netProfit]
    .every((value) => Number.isSafeInteger(Math.round(value * 100)) && Math.abs(value - Math.round(value * 100) / 100) <= 1e-9);
}

function resolvePath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}

function addMonths(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}
