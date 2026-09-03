import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_CAPITAL_FORMULA_VERSION,
  DEVELOPMENT_CAPITAL_INPUT_VERSION,
  MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH,
  computeDevelopmentCapital,
  fundMonthlyDevelopmentCashFlow,
  type DevelopmentCapitalInputs,
  type DevelopmentCapitalPlan,
  type MonthlyDevelopmentCashFlow,
} from "./development-capital";
import { APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE } from "./fixtures/apartment-development-model-v2.98-capital";

const evidence = {
  targetDebtSharePercent: { sourceLabel: "Capital plan", sourceDate: "2026-08-01", reviewState: "done" as const },
  annualInterestRatePercent: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  loanFeePercent: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  fundingOrder: { sourceLabel: "Capital plan", sourceDate: "2026-08-01", reviewState: "done" as const },
  interestTreatment: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  interestConvention: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  feeMonth: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  payoffMonth: { sourceLabel: "Exit plan", sourceDate: "2026-08-01", reviewState: "done" as const },
};

const plan: DevelopmentCapitalPlan = {
  capitalInputVersion: DEVELOPMENT_CAPITAL_INPUT_VERSION,
  targetDebtSharePercent: 50,
  annualInterestRatePercent: 12,
  loanFeePercent: 1,
  fundingOrder: "equity_first.v1",
  interestTreatment: "capitalized_net_operating_cash.v1",
  interestConvention: "opening_balance_monthly.v1",
  feeMonth: "2026-01",
  payoffMonth: "2026-05",
  capitalAssumptionEvidence: evidence,
};

const cashFlow: MonthlyDevelopmentCashFlow[] = [
  { month: "2026-01", projectCosts: 100_000, operatingCashFlow: 0 },
  { month: "2026-02", projectCosts: 100_000, operatingCashFlow: -10_000 },
  { month: "2026-03", projectCosts: 0, operatingCashFlow: 5_000 },
  { month: "2026-04", projectCosts: 0, operatingCashFlow: 5_000 },
  { month: "2026-05", projectCosts: 0, operatingCashFlow: 5_000 },
];

describe("fundMonthlyDevelopmentCashFlow", () => {
  it("funds equity first, keeps reserves separate, and rolls debt by month", () => {
    const run = fundMonthlyDevelopmentCashFlow(cashFlow, plan);

    expect(run).toMatchObject({
      formulaVersion: DEVELOPMENT_CAPITAL_FORMULA_VERSION,
      status: "complete",
      issues: [],
    });
    expect(run.result?.months).toHaveLength(5);
    expect(run.result?.months[0]).toMatchObject({
      month: "2026-01",
      openingDebtBalance: 0,
      projectCosts: 100_000,
      operatingShortfall: 0,
      loanFee: 1_000,
      grossInterest: 0,
      equityContribution: expect.any(Number),
      closingDebtBalance: expect.any(Number),
    });
    expect(run.result?.months[1]).toMatchObject({
      month: "2026-02",
      operatingShortfall: 10_000,
      operatingShortfallReserveDraw: 10_000,
      grossInterest: expect.any(Number),
    });
    expect(run.result?.months[2].operatingCashAppliedToInterest).toBeGreaterThan(0);
    expect(run.result?.months[4]).toMatchObject({
      repayment: expect.any(Number),
      closingDebtBalance: 0,
    });
    expect(run.result?.totals.operatingShortfallReserve).toBe(10_000);
    expect(run.result?.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(run.result?.formulaTraces).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "projectCosts", inputPaths: expect.arrayContaining(["costLines"]) }),
      expect.objectContaining({ key: "operatingCashFlow", inputPaths: expect.arrayContaining(["residentialUnitTypes", "operatingExpenseLines", "capitalExpenditureLines"]) }),
      expect.objectContaining({ key: "operatingShortfall", inputPaths: expect.arrayContaining(["residentialUnitTypes", "operatingExpenseLines", "capitalExpenditureLines"]) }),
      expect.objectContaining({ key: "capitalizedInterest", inputPaths: expect.arrayContaining(["annualInterestRatePercent"]) }),
      expect.objectContaining({ key: "totalDebt", inputPaths: expect.arrayContaining(["targetDebtSharePercent"]) }),
      expect.objectContaining({ key: "totalSources", inputPaths: expect.arrayContaining(["fundingOrder"]) }),
      expect.objectContaining({ key: "debtSharePercent", inputPaths: expect.arrayContaining(["targetDebtSharePercent"]) }),
      expect.objectContaining({ key: "repayment", inputPaths: expect.arrayContaining(["payoffMonth"]) }),
    ]));
    for (const month of run.result?.months ?? []) {
      expect(month.totalSources).toBeCloseTo(month.totalUses, 2);
      expect(month.openingDebtBalance + month.totalDebtDraw - month.repayment)
        .toBeCloseTo(month.closingDebtBalance, 2);
    }
  });

  it("matches the audited workbook capital fixture within its stated tolerance", () => {
    const fixture = APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE;
    const run = fundMonthlyDevelopmentCashFlow(fixture.monthlyCashFlow, fixture.plan);

    expect(run.status).toBe("complete");
    expect(run.result).not.toBeNull();
    const totals = run.result!.totals;
    for (const [key, expected] of Object.entries(fixture.expected)) {
      expect(Math.abs(Number(totals[key as keyof typeof totals]) - expected))
        .toBeLessThanOrEqual(fixture.toleranceUsd);
    }
  });

  it.each([
    ["unsupported input version", { capitalInputVersion: "capital.v0" }, "unsupported_input_version"],
    ["debt share over one hundred", { targetDebtSharePercent: 101 }, "invalid_percent"],
    ["negative annual interest", { annualInterestRatePercent: -1 }, "invalid_percent"],
    ["fee month outside the timeline", { feeMonth: "2025-12" }, "outside_timeline"],
    ["payoff before the last required draw", { payoffMonth: "2026-01" }, "payoff_before_last_use"],
    ["unsupported funding order", { fundingOrder: "debt_first.v1" }, "unsupported_funding_order"],
    ["unsupported interest treatment", { interestTreatment: "current_pay.v1" }, "unsupported_interest_treatment"],
    ["unsupported interest convention", { interestConvention: "average_balance.v1" }, "unsupported_interest_convention"],
  ])("returns a typed issue and no result for %s", (_label, override, code) => {
    const run = fundMonthlyDevelopmentCashFlow(cashFlow, { ...plan, ...override } as DevelopmentCapitalPlan);
    expect(run.status).toBe("failed");
    expect(run.result).toBeNull();
    expect(run.issues).toContainEqual(expect.objectContaining({ code }));
  });

  it.each([
    ["non-text source label", { sourceLabel: 42, sourceDate: "2026-08-01", reviewState: "done" }, "sourceLabel", "invalid_source_label"],
    ["source label over the limit", { sourceLabel: "x".repeat(MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH + 1), sourceDate: "2026-08-01", reviewState: "done" }, "sourceLabel", "text_too_long"],
    ["non-text source date", { sourceLabel: "Term sheet", sourceDate: 20260801, reviewState: "done" }, "sourceDate", "invalid_source_date"],
    ["invalid review state type", { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: 1 }, "reviewState", "invalid_review_state"],
  ])("returns a typed issue for %s", (_label, item, field, code) => {
    const run = fundMonthlyDevelopmentCashFlow(cashFlow, {
      ...plan,
      capitalAssumptionEvidence: {
        ...evidence,
        annualInterestRatePercent: item,
      },
    } as DevelopmentCapitalPlan);

    expect(run.status).toBe("failed");
    expect(run.issues).toContainEqual(expect.objectContaining({
      path: `capitalAssumptionEvidence.annualInterestRatePercent.${field}`,
      code,
    }));
  });

  it("does not mutate the submitted cash flow or capital plan", () => {
    const beforeCashFlow = structuredClone(cashFlow);
    const beforePlan = structuredClone(plan);
    fundMonthlyDevelopmentCashFlow(cashFlow, plan);
    expect(cashFlow).toEqual(beforeCashFlow);
    expect(plan).toEqual(beforePlan);
  });

  it.each([0, 100])("supports a %s percent debt boundary", (targetDebtSharePercent) => {
    const run = fundMonthlyDevelopmentCashFlow(cashFlow, { ...plan, targetDebtSharePercent });
    expect(run.status).toBe("complete");
    expect(run.result?.totals.debtSharePercent).toBe(targetDebtSharePercent);
    expect(run.result?.months.at(-1)?.closingDebtBalance).toBe(0);
  });

  it("settles representative debt shares and rates to cents", () => {
    for (const targetDebtSharePercent of [1, 10, 33.333333, 50, 64.999914, 65, 80, 99]) {
      for (const annualInterestRatePercent of [0, 8, 20]) {
        const run = fundMonthlyDevelopmentCashFlow(cashFlow, {
          ...plan,
          targetDebtSharePercent,
          annualInterestRatePercent,
        });
        expect(run.status, `${targetDebtSharePercent}% debt at ${annualInterestRatePercent}% interest`).toBe("complete");
        expect(run.result?.reconciliations.every(({ status }) => status === "pass")).toBe(true);
      }
    }
  });

  it("does not allow a loan fee draw after the payoff month", () => {
    const run = fundMonthlyDevelopmentCashFlow(
      cashFlow.map((month, index) => ({ ...month, projectCosts: index === 0 ? month.projectCosts : 0, operatingCashFlow: 0 })),
      { ...plan, feeMonth: "2026-04", payoffMonth: "2026-03" },
    );
    expect(run.status).toBe("failed");
    expect(run.issues).toContainEqual(expect.objectContaining({ code: "payoff_before_last_use" }));
  });

  it("requires debt payoff in the final month until a named payoff source exists", () => {
    const noLaterUses = cashFlow.map((month, index) => ({
      ...month,
      projectCosts: index === 0 ? month.projectCosts : 0,
      operatingCashFlow: 0,
    }));
    const run = fundMonthlyDevelopmentCashFlow(noLaterUses, { ...plan, feeMonth: "2026-01", payoffMonth: "2026-04" });

    expect(run.status).toBe("failed");
    expect(run.issues).toContainEqual(expect.objectContaining({
      path: "payoffMonth",
      code: "payoff_before_final_month",
    }));
  });

  it.each([
    [0, 0, 0, 100],
    [12, 1, 0.4, 100.6],
  ])("reconciles interest, operating cash offsets, target debt, and final payoff at a %s percent rate", (annualInterestRatePercent, expectedInterest, expectedOffset, expectedPayoff) => {
    const shortCashFlow = [
      { month: "2026-01", projectCosts: 100, operatingCashFlow: 0 },
      { month: "2026-02", projectCosts: 0, operatingCashFlow: 0.4 },
    ];
    const run = fundMonthlyDevelopmentCashFlow(shortCashFlow, {
      ...plan,
      targetDebtSharePercent: 100,
      annualInterestRatePercent,
      loanFeePercent: 0,
      feeMonth: "2026-01",
      payoffMonth: "2026-02",
    });

    expect(run.status).toBe("complete");
    for (const month of shortCashFlow) {
      expect(run.result?.reconciliations).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: `expected-interest:${month.month}`, status: "pass" }),
        expect.objectContaining({ id: `operating-cash-offset:${month.month}`, status: "pass" }),
      ]));
    }
    expect(run.result?.reconciliations).toContainEqual(expect.objectContaining({ id: "target-debt-share", status: "pass" }));
    expect(run.result?.reconciliations.find(({ id }) => id === "expected-interest:2026-02")).toMatchObject({ expected: expectedInterest, actual: expectedInterest });
    expect(run.result?.reconciliations.find(({ id }) => id === "operating-cash-offset:2026-02")).toMatchObject({ expected: expectedOffset, actual: expectedOffset });
    expect(run.result?.months.at(-1)).toMatchObject({ month: "2026-02", repayment: expectedPayoff, closingDebtBalance: 0 });
  });
});

describe("computeDevelopmentCapital", () => {
  it("runs apartment operations before the capital engine", () => {
    const fixture = APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE;
    const input = fixture.fullModelInput as DevelopmentCapitalInputs;
    const run = computeDevelopmentCapital(input);

    expect(run.status).toBe("complete");
    expect(run.result!.apartmentOperations.months).toHaveLength(run.result!.capital.months.length);
    expect(run.inputSnapshot).toEqual(input);
  });

  it("resolves every capital formula input path against the immutable flat input snapshot", () => {
    const input = APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE.fullModelInput as DevelopmentCapitalInputs;
    const run = computeDevelopmentCapital(input);

    expect(run.status).toBe("complete");
    for (const trace of run.result!.capital.formulaTraces) {
      for (const path of trace.inputPaths) {
        expect(resolvePath(run.inputSnapshot, path), `${trace.key} input path ${path}`).not.toBeUndefined();
      }
    }
  });
});

function resolvePath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    return (current as Record<string, unknown>)[part];
  }, value);
}
