import { describe, expect, it } from "vitest";

import operationsFixture from "./fixtures/apartment-development-model-v2.98-operations.json";
import {
  APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS,
  APARTMENT_DEVELOPMENT_V2_98_COST_SCHEDULE,
  APARTMENT_DEVELOPMENT_V2_98_SOURCE,
} from "./fixtures/apartment-development-v2-98";
import { APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE } from "./fixtures/apartment-development-model-v2.98-capital";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";
import { computeApartmentOperations, type ApartmentOperationsInputs } from "./apartment-operations";
import { fundMonthlyDevelopmentCashFlow } from "./development-capital";
import { computeMonthlyCostSchedule } from "./monthly-cost-schedule";
import { calculatePropertyReturns } from "./property-returns";

const USD_TOLERANCE = 0.02;
const RATIO_TOLERANCE = 1e-8;

describe("Apartment Development Model v2.98 golden gate", () => {
  it("keeps the workbook source identity and explicit tolerances", () => {
    expect(APARTMENT_DEVELOPMENT_V2_98_SOURCE.sha256).toBe("3481af2b91836bdbb7603a60246aa0f8c0c3ea6654311252f5df40760ff2a280");
    expect(USD_TOLERANCE).toBe(0.02);
    expect(RATIO_TOLERANCE).toBe(1e-8);
    expect(APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.tolerances).toEqual({ usd: 0.15, ratio: 1e-8 });
  });

  it("passes every applicable cost, operations, capital, sale, and property-return check", () => {
    const costs = computeMonthlyCostSchedule(APARTMENT_DEVELOPMENT_V2_98_COST_SCHEDULE);
    expect(costs.status).toBe("complete");
    expect(costs.result?.totalsByCategory.land).toBeCloseTo(APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS.land.expected, 2);
    expect(costs.result?.totalsByCategory.hard_cost).toBeCloseTo(APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS.hardCost.expected, 2);
    expect(costs.result?.totalsByCategory.development_fee).toBeCloseTo(APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS.developmentFee.expected, 2);
    expect((costs.result?.totalsByCategory.soft_cost ?? 0) + (costs.result?.totalsByCategory.development_fee ?? 0)).toBeCloseTo(APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS.softCostIncludingDevelopmentFee.expected, 2);
    expect(costs.result?.totalUses).toBeCloseTo(APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS.projectCostBeforeFinancing.expected, 2);

    const operations = computeApartmentOperations(operationsFixture.inputs as ApartmentOperationsInputs);
    expect(operations.status).toBe("complete");
    const stabilizedMonths = operations.result!.months.filter(({ month }) => month >= operationsFixture.expectedFirstStabilizedMonth).slice(0, 12);
    const annual = (key: keyof typeof operationsFixture.expected) => stabilizedMonths.reduce((sum, month) => sum + Number(month[key]), 0);
    for (const [key, expected] of Object.entries(operationsFixture.expected)) {
      expect(Math.abs(annual(key as keyof typeof operationsFixture.expected) - expected)).toBeLessThanOrEqual(USD_TOLERANCE);
    }
    expect(operations.result?.firstStabilizedMonth).toBe(operationsFixture.expectedFirstStabilizedMonth);

    const capitalFixture = APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE;
    const capital = fundMonthlyDevelopmentCashFlow(capitalFixture.monthlyCashFlow, capitalFixture.plan);
    expect(capital.status).toBe("complete");
    if (!capital.result) throw new Error("Expected capital fixture result.");
    for (const [key, expected] of Object.entries(capitalFixture.expected)) {
      expect(Math.abs(Number(capital.result!.totals[key as keyof typeof capital.result.totals]) - expected)).toBeLessThanOrEqual(USD_TOLERANCE);
    }

    const returnsFixture = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE;
    const returns = calculatePropertyReturns(returnsFixture.months, returnsFixture.forwardSalePeriod, returnsFixture.plan);
    expect(returns.status).toBe("complete");
    if (!returns.result) throw new Error("Expected returns fixture result.");
    for (const [key, expected] of Object.entries(returnsFixture.expected.sale)) {
      expect(Math.abs(Number(returns.result!.sale[key as keyof typeof returns.result.sale]) - expected)).toBeLessThanOrEqual(returnsFixture.tolerances.usd);
    }
    for (const stream of ["unlevered", "levered"] as const) {
      expect(Math.abs(returns.result!.returns[stream].xirr - returnsFixture.expected[stream].xirr)).toBeLessThanOrEqual(RATIO_TOLERANCE);
      expect(Math.abs(returns.result!.returns[stream].equityMultiple - returnsFixture.expected[stream].equityMultiple)).toBeLessThanOrEqual(RATIO_TOLERANCE);
      expect(Math.abs(returns.result!.returns[stream].netProfit - returnsFixture.expected[stream].netProfit)).toBeLessThanOrEqual(returnsFixture.tolerances.usd);
    }
    expect(Math.abs(returns.result!.yieldOnCost - returnsFixture.expected.yieldOnCost)).toBeLessThanOrEqual(RATIO_TOLERANCE);
    expect(Math.abs(returns.result!.developmentSpreadBasisPoints - returnsFixture.expected.developmentSpreadBasisPoints)).toBeLessThanOrEqual(1e-6);
    expect([...costs.reconciliations, ...operations.reconciliations, ...capital.reconciliations, ...returns.reconciliations].every(({ status }) => status === "pass")).toBe(true);
  });

  it.each([
    [5, 2.128598870118187],
    [5.25, 1.940092835923317],
    [5.5, 1.76872371392798],
  ])("matches the workbook levered equity multiple at a %s percent terminal cap", (terminalCapRatePercent, expected) => {
    const fixture = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE;
    const run = calculatePropertyReturns(fixture.months, fixture.forwardSalePeriod, { ...fixture.plan, terminalCapRatePercent });
    expect(run.status).toBe("complete");
    expect(Math.abs(run.result!.returns.levered.equityMultiple - expected)).toBeLessThanOrEqual(RATIO_TOLERANCE);
  });
});
