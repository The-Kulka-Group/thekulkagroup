import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";
import { runApartmentScenarioComparison, type ApartmentScenarioDefinition } from "./apartment-scenarios";
import { fundMonthlyDevelopmentCashFlow, type DevelopmentCapitalPlan } from "./development-capital";
import { computeMonthlyCostSchedule } from "./monthly-cost-schedule";
import { calculatePropertyReturns } from "./property-returns";

const CASES = 100;

describe("deterministic apartment model pressure properties", () => {
  it("keeps straight-line and S-curve distributions equal to each generated cost line", () => {
    const random = seededRandom(17001);
    for (let index = 0; index < CASES; index += 1) {
      const amount = Math.round((10_000 + random() * 9_990_000) * 100) / 100;
      const duration = 1 + Math.floor(random() * 24);
      const result = computeMonthlyCostSchedule({
        analysisStartMonth: "2026-01",
        saleMonth: "2029-12",
        costLines: [{
          id: `line-${index}`, name: `Generated Line ${index}`, category: "hard_cost", amount, unit: "usd",
          startMonth: "2026-01", endMonth: addMonths("2026-01", duration - 1),
          distributionMethod: index % 2 === 0 ? "straight_line" : "s_curve",
          distributionVersion: index % 2 === 0 ? "straight_line.v1" : "s_curve.smoothstep.v1",
          reviewState: "done",
        }],
      });
      expect(result.status).toBe("complete");
      expect(result.result!.costLineSchedules[0].monthlyAmounts.reduce((sum, value) => sum + value, 0)).toBeCloseTo(amount, 2);
      expect(result.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    }
  });

  it("keeps generated sources and uses equal and rolls opening debt into closing debt", () => {
    const random = seededRandom(17002);
    for (let index = 0; index < CASES; index += 1) {
      const length = 6 + Math.floor(random() * 19);
      const months = Array.from({ length }, (_, monthIndex) => ({
        month: addMonths("2026-01", monthIndex),
        projectCosts: monthIndex < length - 2 ? Math.round(random() * 800_000 * 100) / 100 : 0,
        operatingCashFlow: monthIndex > length / 2 ? Math.round((random() * 200_000 - 80_000) * 100) / 100 : 0,
      }));
      const run = fundMonthlyDevelopmentCashFlow(months, capitalPlan(addMonths("2026-01", length - 1), 50 + random() * 30, random() * 12));
      expect(run.status, JSON.stringify(run.issues)).toBe("complete");
      run.result!.months.forEach((month, monthIndex) => {
        expect(month.totalSources).toBeCloseTo(month.totalUses, 2);
        expect(month.openingDebtBalance).toBeCloseTo(monthIndex === 0 ? 0 : run.result!.months[monthIndex - 1].closingDebtBalance, 2);
        expect(month.closingDebtBalance).toBeCloseTo(month.openingDebtBalance + month.totalDebtDraw - month.repayment, 2);
      });
      expect(run.result!.months.at(-1)!.closingDebtBalance).toBe(0);
      expect(run.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    }
  });

  it("keeps generated unlevered and levered cash-flow composition equal to their stated formulas", () => {
    const random = seededRandom(17003);
    for (let index = 0; index < CASES; index += 1) {
      const length = 12;
      const funded = fundMonthlyDevelopmentCashFlow(
        Array.from({ length }, (_, monthIndex) => ({
          month: addMonths("2026-01", monthIndex),
          projectCosts: monthIndex < 8 ? Math.round((100_000 + random() * 400_000) * 100) / 100 : 0,
          operatingCashFlow: monthIndex < 8 ? 0 : Math.round(random() * 100_000 * 100) / 100,
        })),
        capitalPlan("2026-12", 55 + random() * 20, 5 + random() * 7),
      );
      expect(funded.status, JSON.stringify(funded.issues)).toBe("complete");
      const property = calculatePropertyReturns(funded.result!.months.map((month) => ({
        month: month.month, projectCosts: month.projectCosts, loanFee: month.loanFee, grossInterest: month.grossInterest,
        totalDebtDraw: month.totalDebtDraw, operatingCashFlow: month.operatingCashFlow, repayment: month.repayment,
      })), {
        startMonth: "2026-12", endMonth: "2027-11", monthCount: 12,
        effectiveGrossRevenue: 5_000_000, operatingExpenses: 2_000_000,
      }, { ...APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.plan, terminalCapRatePercent: 4 + random() * 4 });
      expect(property.status).toBe("complete");
      for (const month of property.result!.months) {
        expect(month.unleveredCashFlow).toBeCloseTo(-month.projectCosts + month.operatingCashFlow + month.netSaleProceeds, 2);
        expect(month.leveredCashFlow).toBeCloseTo(-month.loanFee - month.projectCosts - month.grossInterest + month.totalDebtDraw + month.operatingCashFlow + month.netSaleProceeds - month.repayment, 2);
      }
      expect(property.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    }
  });

  it("keeps the base and sibling scenario inputs isolated across generated changes", () => {
    const random = seededRandom(17004);
    const base = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput;
    for (let index = 0; index < 30; index += 1) {
      const baseBefore = structuredClone(base);
      const scenarios: ApartmentScenarioDefinition[] = [
        scenario(`vacancy-${index}`, "downside", `Vacancy ${index + 1}`, { vacancyPercent: random() * 12 }),
        scenario(`cap-${index}`, "upside", `Terminal Cap ${index + 1}`, { terminalCapRatePercent: 4 + random() * 4 }),
      ];
      const run = runApartmentScenarioComparison(base, scenarios);
      expect(run.status, JSON.stringify(run.issues)).toBe("complete");
      expect(base).toEqual(baseBefore);
      expect(run.result!.scenarios[0].inputSnapshot.terminalCapRatePercent).toBe(base.terminalCapRatePercent);
      expect(run.result!.scenarios[1].inputSnapshot.vacancyPercent).toBe(base.vacancyPercent);
      expect(run.result!.scenarios[0].inputSnapshot).not.toBe(run.result!.scenarios[1].inputSnapshot);
    }
  });
});

function capitalPlan(payoffMonth: string, targetDebtSharePercent: number, annualInterestRatePercent: number): DevelopmentCapitalPlan {
  const item = () => ({ reviewState: "done" as const });
  return {
    capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent, annualInterestRatePercent, loanFeePercent: 0,
    fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1",
    feeMonth: "2026-01", payoffMonth,
    capitalAssumptionEvidence: { targetDebtSharePercent: item(), annualInterestRatePercent: item(), loanFeePercent: item(), fundingOrder: item(), interestTreatment: item(), interestConvention: item(), feeMonth: item(), payoffMonth: item() },
  };
}

function scenario(id: string, role: "downside" | "upside", name: string, delta: ApartmentScenarioDefinition["delta"]): ApartmentScenarioDefinition {
  const evidence = Object.fromEntries(Object.keys(delta).map((key) => [key, { sourceLabel: "Generated pressure input", reviewState: "done" }])) as ApartmentScenarioDefinition["evidence"];
  return { id, role, name, inputVersion: "apartment_scenario_delta.v1", delta, evidence };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function addMonths(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}
