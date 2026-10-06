import { describe, expect, it } from "vitest";

import {
  APARTMENT_OPERATIONS_FORMULA_VERSION,
  computeApartmentOperations,
  type ApartmentOperationsInputs,
  type MonthlyApartmentOperations,
} from "./apartment-operations";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { computePropertyReturns, type PropertyReturnsInputs } from "./property-returns";

/*
 * LA-1704. One hundred revenue units at $2,000 with no growth, vacancy or other losses, ten
 * pre-leased and ten more each month from 2027-01, so every number below can be checked by hand.
 */

const evidence = { sourceLabel: "Lease-up plan", sourceDate: "2026-09-01", reviewState: "done" as const };

const base: ApartmentOperationsInputs = {
  inputVersion: "apartment_operations_inputs.v1",
  analysisStartMonth: "2026-01",
  saleMonth: "2028-12",
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
    reviewState: "done",
  }],
  operationStartMonth: "2027-01",
  growthStartMonth: "2027-01",
  preleasedUnits: 10,
  leaseUpUnitsPerMonth: 10,
  annualIncomeGrowthPercent: 0,
  annualExpenseGrowthPercent: 0,
  rentAdjustmentLossPercent: 0,
  freeRentPercent: 0,
  vacancyPercent: 0,
  creditLossPercent: 0,
  assumptionEvidence: {
    operationStartMonth: evidence,
    growthStartMonth: evidence,
    preleasedUnits: evidence,
    leaseUpUnitsPerMonth: evidence,
    annualIncomeGrowthPercent: evidence,
    annualExpenseGrowthPercent: evidence,
    rentAdjustmentLossPercent: evidence,
    freeRentPercent: evidence,
    vacancyPercent: evidence,
    creditLossPercent: evidence,
  },
  residentialUnitTypes: [{ id: "unit", name: "Unit", units: 100, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, ...evidence }],
  otherIncomeLines: [],
  operatingExpenseLines: [{ id: "payroll", name: "Payroll", amount: 120_000, unit: "usd_per_year", ...evidence }],
  capitalExpenditureLines: [{ id: "reserves", name: "Reserves", amount: 12_000, unit: "usd_per_year", ...evidence }],
};

function run(input: ApartmentOperationsInputs) {
  const result = computeApartmentOperations(input);
  expect(result.issues).toEqual([]);
  expect(result.status).toBe("complete");
  return result.result!;
}

function month(months: MonthlyApartmentOperations[], label: string) {
  return months.find(({ month: value }) => value === label)!;
}

function issuePaths(input: ApartmentOperationsInputs) {
  return computeApartmentOperations(input).issues.map(({ path, code }) => `${path}:${code}`);
}

describe("lease-up defaults", () => {
  it("leaves every month unchanged when each feature is set to its neutral value", () => {
    const plain = run(base);
    const neutral = run({
      ...base,
      operatingExpenseLines: base.operatingExpenseLines.map((line) => ({ ...line, variablePercent: 0, leadMonths: 0 })),
      capitalExpenditureLines: base.capitalExpenditureLines.map((line) => ({ ...line, variablePercent: 0 })),
      seasonalAbsorption: { monthlyFactors: Array(12).fill(1), ...evidence },
      stabilizationRule: { targetOccupancyPercent: 100, holdMonths: 1, ...evidence },
    });
    expect(neutral.months).toEqual(plain.months);
    expect(plain.firstStabilizedMonth).toBe("2027-10");
    expect(plain.months.every(({ leaseUpConcessionLoss }) => leaseUpConcessionLoss === 0)).toBe(true);
    expect(computeApartmentOperations(base).formulaVersion).toBe(APARTMENT_OPERATIONS_FORMULA_VERSION);
  });
});

describe("expense ramp", () => {
  it("charges the fixed share in full and the variable share in step with leased units", () => {
    const months = run({
      ...base,
      operatingExpenseLines: [{ ...base.operatingExpenseLines[0], variablePercent: 50 }],
      capitalExpenditureLines: [{ ...base.capitalExpenditureLines[0], variablePercent: 100 }],
    }).months;
    // 10 of 100 leased: 10,000 a month times half fixed plus half times ten percent.
    expect(month(months, "2027-01").operatingExpenses).toBe(5_500);
    expect(month(months, "2027-01").capitalExpenditures).toBe(100);
    expect(month(months, "2027-05").operatingExpenses).toBe(7_500);
    expect(month(months, "2027-10").operatingExpenses).toBe(10_000);
    expect(month(months, "2027-10").capitalExpenditures).toBe(1_000);
  });

  it("starts a line with lead months before operation start, at its fixed share, as a negative operating cash flow", () => {
    const months = run({
      ...base,
      operatingExpenseLines: [{ ...base.operatingExpenseLines[0], variablePercent: 40, leadMonths: 3 }],
    }).months;
    expect(month(months, "2026-09")).toMatchObject({ operatingExpenses: 0, operatingCashFlow: 0 });
    for (const label of ["2026-10", "2026-11", "2026-12"]) {
      expect(month(months, label)).toMatchObject({
        leasedUnits: 0,
        effectiveGrossRevenue: 0,
        operatingExpenses: 6_000,
        netOperatingIncome: -6_000,
        capitalExpenditures: 0,
        operatingCashFlow: -6_000,
      });
    }
  });

  it("rejects a variable share on a percent-of-revenue line, lead months on capital expenditures, and a lead before analysis start", () => {
    expect(issuePaths({
      ...base,
      analysisStartMonth: "2026-11",
      costLines: [{ ...base.costLines[0], startMonth: "2026-11", endMonth: "2026-11" }],
      operatingExpenseLines: [
        { ...base.operatingExpenseLines[0], leadMonths: 3 },
        { id: "fee", name: "Management Fee", amount: 3, unit: "percent_effective_gross_revenue", variablePercent: 20, ...evidence },
        { id: "bad", name: "Bad", amount: 1, unit: "usd_per_year", variablePercent: 120, leadMonths: 1.5, ...evidence },
      ],
      capitalExpenditureLines: [{ ...base.capitalExpenditureLines[0], leadMonths: 2 } as never],
    })).toEqual([
      "operatingExpenseLines.0.leadMonths:outside_timeline",
      "operatingExpenseLines.1.variablePercent:unsupported_unit",
      "operatingExpenseLines.2.variablePercent:invalid_percent",
      "operatingExpenseLines.2.leadMonths:invalid_units",
      "capitalExpenditureLines.0.leadMonths:invalid_line",
    ]);
  });
});

describe("lease-up concession", () => {
  it("frees each new lease's first month at move-in", () => {
    const result = run({ ...base, leaseUpConcession: { monthsFree: 1, leaseTermMonths: 12, timing: "at_move_in", ...evidence } });
    expect(month(result.months, "2027-01").leaseUpConcessionLoss).toBe(-20_000);
    expect(month(result.months, "2027-01").totalResidentialRent).toBe(0);
    expect(month(result.months, "2027-10").leaseUpConcessionLoss).toBe(-20_000);
    expect(month(result.months, "2027-11").leaseUpConcessionLoss).toBe(0);
    expect(result.totals.leaseUpConcessionLoss).toBe(-200_000);
  });

  it("frees a part month in the month after move-in", () => {
    const months = run({ ...base, leaseUpConcession: { monthsFree: 1.5, leaseTermMonths: 13, timing: "at_move_in", ...evidence } }).months;
    // Month two: ten new leases free in full and the first month's ten free for half a month.
    expect(month(months, "2027-02").leaseUpConcessionLoss).toBe(-30_000);
    expect(month(months, "2027-11").leaseUpConcessionLoss).toBe(-10_000);
  });

  it("spreads the free months over the first lease term, past stabilization", () => {
    const result = run({ ...base, leaseUpConcession: { monthsFree: 1, leaseTermMonths: 12, timing: "spread_over_term", ...evidence } });
    // Ten leases at one-twelfth of 2,000.
    expect(month(result.months, "2027-01").leaseUpConcessionLoss).toBe(-1_666.67);
    expect(month(result.months, "2027-10").leaseUpConcessionLoss).toBe(-16_666.67);
    // The pre-leased cohort ends its term in 2027-12; the last cohort ends in 2028-09.
    expect(month(result.months, "2028-01").leaseUpConcessionLoss).toBe(-15_000);
    expect(month(result.months, "2028-09").leaseUpConcessionLoss).toBe(-1_666.67);
    expect(month(result.months, "2028-10").leaseUpConcessionLoss).toBe(0);
    expect(result.totals.leaseUpConcessionLoss).toBeCloseTo(-200_000, 0);
    expect(result.firstStabilizedMonth).toBe("2027-10");
  });

  it("rejects free months beyond the term, a fractional term and an unknown timing", () => {
    expect(issuePaths({ ...base, leaseUpConcession: { monthsFree: 13, leaseTermMonths: 12, timing: "at_move_in", ...evidence } }))
      .toEqual(["leaseUpConcession.monthsFree:invalid_amount"]);
    expect(issuePaths({ ...base, leaseUpConcession: { monthsFree: 1, leaseTermMonths: 12.5, timing: "upfront" as never, ...evidence } }))
      .toEqual(["leaseUpConcession.leaseTermMonths:invalid_units", "leaseUpConcession.timing:invalid_concession_timing"]);
  });
});

describe("seasonal absorption and the stabilization rule", () => {
  it("scales each month's pace by its calendar month's factor", () => {
    const factors = [0, 0.5, 1, 1, 1.5, 1.5, 1.5, 1, 1, 1, 0.5, 0.25];
    const months = run({ ...base, seasonalAbsorption: { monthlyFactors: factors, ...evidence } }).months;
    // February adds 5, March 10, April 10, May 15, June 15, July 15, August 10, September 10.
    expect(months.filter(({ month: label }) => label >= "2027-01" && label <= "2027-10").map(({ leasedUnits }) => leasedUnits))
      .toEqual([10, 15, 25, 35, 50, 65, 80, 90, 100, 100]);
  });

  it("rounds the running total, not each month, so part units never drift", () => {
    const months = run({ ...base, seasonalAbsorption: { monthlyFactors: Array(12).fill(0.25), ...evidence } }).months;
    // 2.5 a month: 12.5, 15, 17.5 and 20 round to 13, 15, 18 and 20.
    expect(months.filter(({ month: label }) => label >= "2027-01" && label <= "2027-05").map(({ leasedUnits }) => leasedUnits))
      .toEqual([10, 13, 15, 18, 20]);
  });

  it("reports no stabilized month for a lease-up that never reaches its target", () => {
    const result = run({ ...base, seasonalAbsorption: { monthlyFactors: Array(12).fill(0), ...evidence } });
    expect(result.months.filter(({ revenueUnits }) => revenueUnits > 0).every(({ leasedUnits }) => leasedUnits === 10)).toBe(true);
    expect(result.firstStabilizedMonth).toBeUndefined();
  });

  it("stabilizes once leased units hold at the target for the hold months", () => {
    // 90 of 100 leased in 2027-09; held three months, counting the first, is 2027-11.
    expect(run({ ...base, stabilizationRule: { targetOccupancyPercent: 90, holdMonths: 3, ...evidence } }).firstStabilizedMonth).toBe("2027-11");
    expect(run({ ...base, stabilizationRule: { targetOccupancyPercent: 100, holdMonths: 4, ...evidence } }).firstStabilizedMonth).toBe("2028-01");
  });

  it("rejects a short factor list, a negative factor, a zero target and a fractional hold", () => {
    expect(issuePaths({ ...base, seasonalAbsorption: { monthlyFactors: [1, 1], ...evidence } }))
      .toEqual(["seasonalAbsorption.monthlyFactors:invalid_absorption_factor"]);
    expect(issuePaths({ ...base, seasonalAbsorption: { monthlyFactors: [...Array(11).fill(1), -1], reviewState: "maybe" as never } }))
      .toEqual(["seasonalAbsorption.monthlyFactors.11:invalid_absorption_factor", "seasonalAbsorption.reviewState:invalid_review_state"]);
    expect(issuePaths({ ...base, stabilizationRule: { targetOccupancyPercent: 0, holdMonths: 1.5, ...evidence } }))
      .toEqual(["stabilizationRule.targetOccupancyPercent:invalid_percent", "stabilizationRule.holdMonths:invalid_units"]);
  });
});

describe("lease turnover", () => {
  const turnover = (change: Partial<NonNullable<ApartmentOperationsInputs["leaseTurnover"]>> = {}) => ({
    turnoverPercent: 50,
    leaseTermMonths: 3,
    vacantMonths: 0,
    basis: "each_new_lease_once" as const,
    ...evidence,
    ...change,
  });
  const leased = (months: MonthlyApartmentOperations[], from: string, to: string) =>
    months.filter(({ month: label }) => label >= from && label <= to).map(({ leasedUnits }) => leasedUnits);

  it("leaves every month unchanged at zero turnover or a term longer than lease-up", () => {
    const plain = run(base);
    expect(run({ ...base, leaseTurnover: turnover({ turnoverPercent: 0 }) }).months).toEqual(plain.months);
    // Fully leased in 2027-10, before any twelve-month lease ends.
    expect(run({ ...base, leaseTurnover: turnover({ leaseTermMonths: 12 }) }).months).toEqual(plain.months);
    expect(plain.months.every(({ turnedUnits }) => turnedUnits === 0)).toBe(true);
  });

  it("turns half of each month's new leases when they first expire, and they lease again from the pool", () => {
    const result = run({ ...base, leaseTurnover: turnover() });
    // Ten new leases a month; from 2027-04 five of the leases signed three months earlier move out.
    expect(leased(result.months, "2027-01", "2027-07")).toEqual([10, 20, 30, 35, 40, 45, 50]);
    expect(month(result.months, "2027-04").turnedUnits).toBe(5);
    expect(month(result.months, "2027-03").turnedUnits).toBe(0);
    // Five a month net: 100 leased in 2028-05, seven months after the 2027-10 of no turnover.
    expect(month(result.months, "2028-04").leasedUnits).toBe(95);
    expect(result.firstStabilizedMonth).toBe("2028-05");
    expect(month(result.months, "2028-06").turnedUnits).toBe(0);
    expect(month(result.months, "2027-04").leaseUpLoss).toBe(-130_000);
  });

  it("counts renewals again under every expiring lease, and only the net gain under net units gained", () => {
    const every = run({ ...base, leaseTurnover: turnover({ basis: "every_expiring_lease" }) }).months;
    const net = run({ ...base, leaseTurnover: turnover({ basis: "net_units_gained" }) }).months;
    // 2027-07: ten new leases plus five renewals from 2027-04 expire, and 7.5 turns, rounded on the running total to 8.
    expect(month(every, "2027-07")).toMatchObject({ turnedUnits: 8, leasedUnits: 47 });
    // 2027-07: the building gained five units in 2027-04, so 2.5 turns, rounded on the running total to 3.
    expect(month(net, "2027-07")).toMatchObject({ turnedUnits: 3, leasedUnits: 52 });
  });

  it("stops turnover once leased units reach the stabilization target", () => {
    const result = run({ ...base, leaseTurnover: turnover(), stabilizationRule: { targetOccupancyPercent: 50, holdMonths: 1, ...evidence } });
    expect(result.firstStabilizedMonth).toBe("2027-07");
    expect(leased(result.months, "2027-07", "2027-11")).toEqual([50, 60, 70, 80, 90]);
    expect(result.months.filter(({ month: label }) => label > "2027-07").every(({ turnedUnits }) => turnedUnits === 0)).toBe(true);
  });

  it("holds turned units vacant for the vacant months, which slows leasing once free units run short", () => {
    const immediate = run({ ...base, leaseTurnover: turnover() }).months;
    const held = run({ ...base, leaseTurnover: turnover({ vacantMonths: 1 }) }).months;
    expect(leased(held, "2027-01", "2028-03")).toEqual(leased(immediate, "2027-01", "2028-03"));
    // 2028-05: five move out and wait a month, so only five of the ten-lease pace fit.
    expect(month(immediate, "2028-05").leasedUnits).toBe(100);
    expect(month(held, "2028-05").leasedUnits).toBe(95);
  });

  it("gives free rent on leases that refill turned units", () => {
    const months = run({
      ...base,
      leaseTurnover: turnover(),
      leaseUpConcession: { monthsFree: 1, leaseTermMonths: 12, timing: "at_move_in", ...evidence },
    }).months;
    // 2027-04 signs ten leases, five of them refilling turned units: ten months of free rent, not five.
    expect(month(months, "2027-04").leaseUpConcessionLoss).toBe(-20_000);
    expect(month(months, "2027-04").totalResidentialRent).toBe(50_000);
  });

  it("reports no stabilized month when turnover keeps pace with leasing", () => {
    const result = run({ ...base, leaseTurnover: turnover({ turnoverPercent: 100, leaseTermMonths: 2 }) });
    expect(leased(result.months, "2027-01", "2028-12").slice(1).every((units) => units === 20)).toBe(true);
    expect(result.firstStabilizedMonth).toBeUndefined();
  });

  it("rejects a share above 100, a fractional term, too many vacant months and an unknown basis", () => {
    expect(issuePaths({ ...base, leaseTurnover: turnover({ turnoverPercent: 101, leaseTermMonths: 1.5 }) }))
      .toEqual(["leaseTurnover.turnoverPercent:invalid_percent", "leaseTurnover.leaseTermMonths:invalid_units"]);
    expect(issuePaths({ ...base, leaseTurnover: turnover({ vacantMonths: 13, basis: "renewals" as never }) }))
      .toEqual(["leaseTurnover.vacantMonths:invalid_units", "leaseTurnover.basis:invalid_turnover_basis"]);
  });
});

describe("lease-up through the full property run", () => {
  const sample = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;

  it("funds lead-month expenses and lease-up free rent as operating shortfall and carries them into returns", () => {
    const plain = computePropertyReturns(sample);
    const realistic: PropertyReturnsInputs = {
      ...sample,
      operatingExpenseLines: sample.operatingExpenseLines.map((line) =>
        line.id === "payroll" ? { ...line, leadMonths: 2 } : line),
      leaseUpConcession: { monthsFree: 1, leaseTermMonths: 13, timing: "spread_over_term", ...evidence },
    };
    const changed = computePropertyReturns(realistic);
    expect(changed.issues).toEqual([]);
    const before = plain.result!.developmentCapital.totals;
    const after = changed.result!.developmentCapital.totals;
    expect(after.operatingShortfall).toBeGreaterThan(before.operatingShortfall);
    expect(after.totalUses).toBeGreaterThan(before.totalUses);
    expect(changed.result!.propertyReturns.returns.levered.netProfit).toBeLessThan(plain.result!.propertyReturns.returns.levered.netProfit);
    expect(changed.reconciliations.every(({ status }) => status === "pass")).toBe(true);
  });

  describe("lease turnover", () => {
    const turnover = (change: Partial<NonNullable<PropertyReturnsInputs["leaseTurnover"]>>) => ({
      turnoverPercent: 50,
      leaseTermMonths: 12,
      vacantMonths: 0,
      basis: "each_new_lease_once" as const,
      ...evidence,
      ...change,
    });
    const fullRun = (input: PropertyReturnsInputs) => {
      const returns = computePropertyReturns(input);
      expect(returns.issues).toEqual([]);
      expect(returns.reconciliations.every(({ status }) => status === "pass")).toBe(true);
      return { returns: returns.result!, operations: run(input) };
    };
    const plain = fullRun(sample);

    it("reads the same with no turnover or a term longer than lease-up", () => {
      expect(plain.operations.firstStabilizedMonth).toBe("2028-09");
      const long = fullRun({ ...sample, leaseTurnover: turnover({ leaseTermMonths: 36 }) });
      expect(long.operations.months).toEqual(plain.operations.months);
      expect(long.returns.developmentCapital.totals).toEqual(plain.returns.developmentCapital.totals);
      expect(long.returns.propertyReturns.returns).toEqual(plain.returns.propertyReturns.returns);
    });

    it("stabilizes later on a short term, capitalizing more interest and cutting profit", () => {
      const short = fullRun({ ...sample, leaseTurnover: turnover({ leaseTermMonths: 6 }) });
      expect(short.operations.firstStabilizedMonth).toBe("2029-06");
      expect(short.returns.developmentCapital.totals.capitalizedInterest).toBeGreaterThan(plain.returns.developmentCapital.totals.capitalizedInterest);
      expect(short.returns.propertyReturns.returns.levered.netProfit).toBeLessThan(plain.returns.propertyReturns.returns.levered.netProfit);
    });

    it("completes a lease-up that never stabilizes, with every unit-month below full", () => {
      const never = fullRun({ ...sample, leaseTurnover: turnover({ turnoverPercent: 90, basis: "every_expiring_lease" }) });
      expect(never.operations.firstStabilizedMonth).toBeUndefined();
      const revenueUnits = never.operations.unitSummary.revenueUnits;
      expect(never.operations.months.every(({ leasedUnits }) => leasedUnits < revenueUnits)).toBe(true);
      expect(never.returns.propertyReturns.returns.levered.netProfit).toBeLessThan(plain.returns.propertyReturns.returns.levered.netProfit);
    });
  });
});
