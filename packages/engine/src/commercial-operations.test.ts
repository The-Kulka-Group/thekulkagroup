import { describe, expect, it } from "vitest";

import {
  computeApartmentOperations,
  projectApartmentOperationsThrough,
  type ApartmentOperationsInputs,
  type MonthlyApartmentOperations,
  type OperatingExpenseLine,
} from "./apartment-operations";
import { APARTMENT_SCENARIO_INPUT_VERSION, runApartmentScenarioComparison, type ApartmentScenarioDefinition } from "./apartment-scenarios";
import type { CommercialOperations, CommercialSpace } from "./commercial-operations";
import { computeDevelopmentCapital } from "./development-capital";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { LENDER_TESTS_INPUT_VERSION, type LenderTestPlan } from "./lender-tests";
import { engineOutputsFor } from "./model-scorecard";
import { computePropertyReturns, type PropertyReturnsInputs } from "./property-returns";
import { PROPERTY_TAX_INPUT_VERSION, type PropertyTaxPlan } from "./property-tax";

/*
 * LA-1868. A hand-checkable case: one hundred units at $2,000 pre-leased from 2027-01, no growth
 * and no residential losses, so residential income is $200,000 a month and payroll takes $10,000.
 * One 10,000 square foot space leases at $30 a square foot from 2027-07, which is $25,000 a month.
 * Common area maintenance is a commercial line at $5,000 a month, and the tenant pays half of it.
 */

const evidence = { sourceLabel: "Lease abstract", sourceDate: "2026-10-07", reviewState: "done" as const };

const base: ApartmentOperationsInputs = {
  inputVersion: "apartment_operations_inputs.v1",
  analysisStartMonth: "2026-01",
  saleMonth: "2030-12",
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
  preleasedUnits: 100,
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
  residentialUnitTypes: [
    { id: "one-bed", name: "One Bed", units: 100, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, ...evidence },
  ],
  otherIncomeLines: [],
  operatingExpenseLines: [
    { id: "payroll", name: "Payroll", amount: 120_000, unit: "usd_per_year", ...evidence },
    { id: "cam", name: "Common Area Maintenance", amount: 60_000, unit: "usd_per_year", appliesTo: "commercial", ...evidence },
  ],
  capitalExpenditureLines: [],
};

const space = (overrides: Partial<CommercialSpace> = {}): CommercialSpace => ({
  id: "retail-a",
  name: "Retail A",
  areaSf: 10_000,
  annualRentPerSf: 30,
  leaseStartMonth: "2027-07",
  freeRentMonths: 3,
  recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 50 }],
  tenantImprovementPerSf: 50,
  leasingCommissionPercent: 6,
  leaseTermMonths: 60,
  ...evidence,
  ...overrides,
});

const block = (overrides: Partial<CommercialOperations> = {}): CommercialOperations => ({
  spaces: [space()],
  vacancyPercent: 5,
  creditLossPercent: 1,
  ...evidence,
  ...overrides,
});

const withCommercial = (overrides: Partial<CommercialOperations> = {}, input: ApartmentOperationsInputs = base): ApartmentOperationsInputs => ({
  ...input,
  commercial: block(overrides),
});

function run(input: ApartmentOperationsInputs) {
  const result = computeApartmentOperations(input);
  expect(result.issues).toEqual([]);
  expect(result.status).toBe("complete");
  return result;
}

function month(months: MonthlyApartmentOperations[], label: string) {
  return months.find(({ month: value }) => value === label)!;
}

function issueKeys(input: ApartmentOperationsInputs) {
  return computeApartmentOperations(input).issues.map(({ path, code }) => `${path}:${code}`);
}

const NO_COMMERCIAL_FIELDS = [
  "commercialBaseRent", "commercialFreeRent", "commercialRecoveries", "commercialVacancyLoss", "commercialCreditLoss",
  "commercialEffectiveGrossRevenue", "commercialOperatingExpenses", "commercialNetOperatingIncome",
] as const;

describe("a case without the commercial block", () => {
  const withoutBlock: ApartmentOperationsInputs = {
    ...base,
    operatingExpenseLines: base.operatingExpenseLines.filter(({ id }) => id !== "cam"),
  };

  it("reports no commercial result and zero in every commercial field", () => {
    const { result, reconciliations } = run(withoutBlock);
    expect(result!.commercial).toBeUndefined();
    for (const key of NO_COMMERCIAL_FIELDS) {
      expect(result!.months.every((item) => item[key] === 0), key).toBe(true);
      expect(result!.totals[key], key).toBe(0);
    }
    expect(result!.months.every((item) => item.residentialNetOperatingIncome === item.netOperatingIncome)).toBe(true);
    expect(reconciliations.some(({ id }) => id.startsWith("commercial"))).toBe(false);
    expect(result!.anchors).toBeUndefined();
  });

  it("matches the v2.98 sample, whose retail line saves as zero", () => {
    const sample = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
    expect(sample.commercial).toBeUndefined();
    const { result } = run(sample);
    expect(result!.totals.commercialNetOperatingIncome).toBe(0);
    expect(result!.totals.residentialNetOperatingIncome).toBe(result!.totals.netOperatingIncome);
    // The v2.98 potential income golden (Underwriting!I112) adds retail income of zero to the rent and other income.
    expect(result!.totals.effectiveGrossRevenue).toBe(
      Math.round((result!.totals.totalPotentialIncome + result!.totals.vacancyLoss + result!.totals.creditLoss) * 100) / 100,
    );
    const full = computePropertyReturns(sample);
    expect(full.status).toBe("complete");
    expect(full.result!.propertyReturns.sale.forwardNetOperatingIncome).toBe(
      Math.round(full.result!.forwardOperations.months.reduce((sum, item) => sum + item.netOperatingIncome, 0) * 100) / 100,
    );
  });

  it("gives the v2.98 sample the numbers the engine gave before commercial spaces existed", () => {
    // Pinned from origin/main at 86dc8d8, run on this same input before LA-1868 touched the engine.
    const sample = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
    const { totals, firstStabilizedMonth } = run(sample).result!;
    expect(totals).toMatchObject({
      residentialGrossRent: 14_873_058,
      totalResidentialRent: 10_748_487.36,
      otherIncome: 1_424_873.94,
      totalPotentialIncome: 12_173_361.3,
      vacancyLoss: -608_668.07,
      creditLoss: -121_733.62,
      effectiveGrossRevenue: 11_442_959.61,
      operatingExpenses: 6_017_880.18,
      netOperatingIncome: 5_425_079.43,
      capitalExpenditures: 43_866.37,
      operatingCashFlow: 5_381_213.06,
    });
    expect(firstStabilizedMonth).toBe("2028-09");
    const full = computePropertyReturns(sample).result!;
    expect(full.propertyReturns.sale.forwardNetOperatingIncome).toBe(4_353_155.65);
    expect(full.propertyReturns.sale.grossSaleValue).toBe(75_707_054.78);
    expect(full.developmentCapital.totals).toMatchObject({ totalUses: 61_127_926.57, totalDebt: 39_733_099.81, equity: 21_394_826.76 });
    expect(full.propertyReturns.returns.levered.xirr).toBeCloseTo(0.1495719576524866, 12);
    expect(full.propertyReturns.returns.unlevered.xirr).toBeCloseTo(0.12319845266433561, 12);
  });

  it("treats a percent-of-revenue line as before: a percent of the one effective gross revenue", () => {
    const input: ApartmentOperationsInputs = {
      ...withoutBlock,
      vacancyPercent: 5,
      operatingExpenseLines: [...withoutBlock.operatingExpenseLines, { id: "fee", name: "Management Fee", amount: 3, unit: "percent_effective_gross_revenue", ...evidence }],
    };
    const { result } = run(input);
    const sample = month(result!.months, "2027-03");
    expect(sample.effectiveGrossRevenue).toBe(190_000);
    expect(sample.operatingExpenses).toBe(10_000 + 5_700);
  });
});

describe("commercial income, recoveries and NOI by use", () => {
  it("charges rent from the lease start, forgives it during free rent and keeps recoveries running", () => {
    const { result } = run(withCommercial());
    const { months } = result!;
    expect(month(months, "2027-06")).toMatchObject({ commercialBaseRent: 0, commercialRecoveries: 0, commercialEffectiveGrossRevenue: 0, commercialOperatingExpenses: 0 });
    // Free rent forgives base rent only. The tenant still pays half the $5,000 maintenance cost from the lease start.
    expect(month(months, "2027-07")).toMatchObject({
      commercialBaseRent: 25_000,
      commercialFreeRent: -25_000,
      commercialRecoveries: 2_500,
      commercialVacancyLoss: -125,
      commercialCreditLoss: -25,
      commercialEffectiveGrossRevenue: 2_350,
      commercialOperatingExpenses: 5_000,
      commercialNetOperatingIncome: -2_650,
    });
    expect(month(months, "2027-09").commercialFreeRent).toBe(-25_000);
    expect(month(months, "2027-10")).toMatchObject({
      commercialBaseRent: 25_000,
      commercialFreeRent: 0,
      commercialRecoveries: 2_500,
      commercialVacancyLoss: -1_375,
      commercialCreditLoss: -275,
      commercialEffectiveGrossRevenue: 25_850,
      commercialOperatingExpenses: 5_000,
      commercialNetOperatingIncome: 20_850,
    });
  });

  it("applies commercial vacancy and credit loss to commercial income only", () => {
    // Graybarn applies one vacancy rate, labeled residential, to a base that includes retail and other
    // income (Stab NOI Statement!I31). Kulka keeps commercial vacancy separate, so that cell differs by design.
    const input = { ...withCommercial(), vacancyPercent: 10, creditLossPercent: 2 };
    const { result } = run({ ...input, commercial: block({ vacancyPercent: 0, creditLossPercent: 0 }) });
    const sample = month(result!.months, "2027-10");
    expect(sample.vacancyLoss).toBe(-20_000);
    expect(sample.creditLoss).toBe(-4_000);
    expect(sample.commercialVacancyLoss).toBe(0);
    expect(sample.commercialCreditLoss).toBe(0);
    expect(sample.commercialEffectiveGrossRevenue).toBe(27_500);
  });

  it("keeps netOperatingIncome as the whole property and adds residential and commercial NOI beside it", () => {
    const { result } = run(withCommercial());
    for (const item of result!.months) {
      expect(item.netOperatingIncome).toBeCloseTo(item.residentialNetOperatingIncome + item.commercialNetOperatingIncome, 2);
    }
    const sample = month(result!.months, "2027-10");
    expect(sample.effectiveGrossRevenue).toBe(200_000 + 25_850);
    expect(sample.operatingExpenses).toBe(10_000 + 5_000);
    expect(sample.residentialNetOperatingIncome).toBe(190_000);
    expect(sample.netOperatingIncome).toBe(190_000 + 20_850);
  });

  it("leaves every residential line where it was", () => {
    const without = run({ ...base, operatingExpenseLines: base.operatingExpenseLines.filter(({ id }) => id !== "cam") }).result!;
    const withSpace = run(withCommercial()).result!;
    for (const [index, item] of withSpace.months.entries()) {
      expect(item.residentialNetOperatingIncome).toBe(without.months[index].netOperatingIncome);
      expect(item.totalPotentialIncome).toBe(without.months[index].totalPotentialIncome);
      expect(item.vacancyLoss).toBe(without.months[index].vacancyLoss);
      expect(item.totalUses).toBeGreaterThanOrEqual(without.months[index].totalUses);
    }
  });

  it("never counts a space as a unit, in lease-up or in any per-unit figure", () => {
    // Graybarn counts its retail space as a unit in per-unit cells (Summary Greybarn Patchogue!G35). Kulka never does.
    const perUnit: OperatingExpenseLine = { id: "insurance", name: "Insurance", amount: 500, unit: "usd_per_unit_year", ...evidence };
    const input: ApartmentOperationsInputs = { ...base, operatingExpenseLines: [...base.operatingExpenseLines, perUnit] };
    const without = run({ ...input, operatingExpenseLines: input.operatingExpenseLines.filter(({ id }) => id !== "cam") }).result!;
    const withSpace = run(withCommercial({}, input)).result!;
    expect(withSpace.unitSummary).toEqual(without.unitSummary);
    expect(withSpace.unitSummary.totalUnits).toBe(100);
    expect(withSpace.unitSummary.totalAreaSf).toBe(80_000);
    expect(withSpace.unitTypeSummaries).toEqual(without.unitTypeSummaries);
    expect(withSpace.months.map((item) => item.leasedUnits)).toEqual(without.months.map((item) => item.leasedUnits));
    expect(withSpace.months.map((item) => item.leaseUpPercent)).toEqual(without.months.map((item) => item.leaseUpPercent));
    expect(withSpace.firstStabilizedMonth).toBe(without.firstStabilizedMonth);
    // Insurance is $500 a year for each of the 100 residential units, whatever the commercial area.
    expect(month(withSpace.months, "2027-10").operatingExpenses).toBeCloseTo(10_000 + 5_000 + 500 * 100 / 12, 2);
  });

  it("splits shared costs by the share tenants reimburse, so the two uses still add to the whole", () => {
    const input = withCommercial({
      spaces: [space({ recoveries: [{ basis: { kind: "expense_lines", lineIds: ["payroll"] }, sharePercent: 20 }] })],
    });
    const { result } = run(input);
    const sample = month(result!.months, "2027-10");
    // Payroll is $10,000 a month and untagged, so it is residential. The tenant's 20 percent moves to commercial.
    expect(sample.commercialRecoveries).toBe(2_000);
    expect(sample.commercialOperatingExpenses).toBe(5_000 + 2_000);
    expect(sample.residentialNetOperatingIncome).toBe(200_000 - (10_000 - 2_000));
    expect(sample.netOperatingIncome).toBeCloseTo(sample.residentialNetOperatingIncome + sample.commercialNetOperatingIncome, 2);
  });

  it("charges a percent-of-revenue expense on residential revenue, and a tagged one on commercial revenue", () => {
    const fees: OperatingExpenseLine[] = [
      { id: "resi-fee", name: "Residential Management Fee", amount: 2, unit: "percent_effective_gross_revenue", ...evidence },
      { id: "comm-fee", name: "Commercial Management Fee", amount: 4, unit: "percent_effective_gross_revenue", appliesTo: "commercial", ...evidence },
    ];
    const { result } = run(withCommercial({}, { ...base, operatingExpenseLines: [...base.operatingExpenseLines, ...fees] }));
    const sample = month(result!.months, "2027-10");
    // 2 percent of 200,000 residential revenue, and 4 percent of 25,850 commercial revenue.
    expect(sample.operatingExpenses).toBe(10_000 + 5_000 + 4_000 + 1_034);
    expect(sample.commercialOperatingExpenses).toBe(5_000 + 1_034);
  });

  it("runs a commercial expense line from its lead months before the first lease", () => {
    const input = withCommercial({}, {
      ...base,
      operatingExpenseLines: base.operatingExpenseLines.map((line) => line.id === "cam" ? { ...line, leadMonths: 2 } : line),
    });
    const { result } = run(input);
    expect(month(result!.months, "2027-04").commercialOperatingExpenses).toBe(0);
    expect(month(result!.months, "2027-05").commercialOperatingExpenses).toBe(5_000);
    expect(month(result!.months, "2027-06").commercialNetOperatingIncome).toBe(-5_000);
  });

  it("splits a year's rent into months that add to the year to the cent", () => {
    const odd = space({ areaSf: 3_333, annualRentPerSf: 27.77, freeRentMonths: 0, recoveries: [] });
    const { result } = run(withCommercial({ spaces: [odd], vacancyPercent: 0, creditLossPercent: 0 }));
    const year = result!.months.filter((item) => item.month >= "2027-07" && item.month <= "2028-06");
    const sum = Math.round(year.reduce((total, item) => total + item.commercialBaseRent, 0) * 100) / 100;
    expect(sum).toBe(Math.round(3_333 * 27.77 * 100) / 100);
  });

  it("reconciles every commercial line, and every check passes", () => {
    const { reconciliations } = run(withCommercial());
    const commercialChecks = reconciliations.filter(({ id }) => id.includes("commercial") || id.includes("by-use"));
    expect(commercialChecks.length).toBeGreaterThan(20);
    expect(commercialChecks.filter(({ status }) => status === "fail")).toEqual([]);
    expect(reconciliations.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "commercial-recovery:retail-a:0",
      "commercial-cost:commercial-ti:retail-a",
      "commercial-cost-month:commercial-commission:retail-a",
      "net-operating-income-by-use-total",
    ]));
  });
});

describe("first-generation costs in the cost schedule", () => {
  it("derives tenant improvements as hard cost and commissions as soft cost in the lease start month", () => {
    const { result, inputSnapshot } = run(withCommercial());
    const schedule = result!.costSchedule;
    const ti = schedule.costLineSchedules.find(({ lineId }) => lineId === "commercial-ti:retail-a")!;
    const commission = schedule.costLineSchedules.find(({ lineId }) => lineId === "commercial-commission:retail-a")!;
    expect(ti).toMatchObject({ category: "hard_cost", amount: 500_000, months: ["2027-07"], total: 500_000 });
    // Six percent of sixty months at $25,000 of scheduled rent, before free rent.
    expect(commission).toMatchObject({ category: "soft_cost", amount: 90_000, months: ["2027-07"], total: 90_000 });
    expect(month(result!.months, "2027-07").totalUses).toBe(590_000);
    expect(schedule.totalsByCategory.hard_cost).toBe(500_000);
    expect(schedule.totalsByCategory.soft_cost).toBe(90_000);
    expect(result!.commercial).toMatchObject({ tenantImprovements: 500_000, leasingCommissions: 90_000, annualRentRoll: 300_000, commercialAreaSf: 10_000 });
    // The derived lines are never saved with the entered cost lines.
    expect(inputSnapshot.costLines.map(({ id }) => id)).toEqual(["land"]);
    expect(ti.formulaTrace).toContain("Derived from commercial space Retail A");
    expect(ti.inputPaths).toContain("commercial.spaces.0.tenantImprovementPerSf");
  });

  it("grows the commission base with the commercial rent rates", () => {
    const input = { ...withCommercial(), annualIncomeGrowthPercent: 10 };
    const { result } = run(input);
    const commission = result!.costSchedule.costLineSchedules.find(({ lineId }) => lineId === "commercial-commission:retail-a")!;
    expect(commission.amount).toBeGreaterThan(90_000);
    // Lease starts in 2027-07 with growth from 2027-01: five lease years, each grown once more than the last.
    let expected = 0;
    for (let step = 0; step < 60; step += 1) {
      const index = 2027 * 12 + 6 + step;
      const periods = Math.floor((index - (2027 * 12)) / 12);
      expected += 25_000 * 1.1 ** periods;
    }
    expect(commission.amount).toBeCloseTo(expected * 0.06, 0);
  });

  it("funds them as project costs, so they count in total cost and in loan to cost", () => {
    const sample = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
    const without = computeDevelopmentCapital(sample);
    const withSpace = computeDevelopmentCapital({ ...sample, commercial: commercialFor(sample) });
    expect(without.status).toBe("complete");
    expect(withSpace.status, JSON.stringify(withSpace.issues)).toBe("complete");
    const lines = withSpace.result!.apartmentOperations.costSchedule.costLineSchedules;
    const added = lines.filter(({ lineId }) => lineId.startsWith("commercial-")).reduce((sum, line) => sum + line.total, 0);
    expect(added).toBeGreaterThan(0);
    expect(withSpace.result!.capital.totals.projectCosts).toBeCloseTo(without.result!.capital.totals.projectCosts + added, 2);
    // Loan to cost reads the larger cost: the loan fee is the fee percent of the debt share of project costs.
    const feeRate = sample.targetDebtSharePercent / 100 * sample.loanFeePercent / 100;
    expect(withSpace.result!.capital.totals.loanFees - without.result!.capital.totals.loanFees).toBeCloseTo(added * feeRate, 1);
    expect(withSpace.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("counts them in a percent-of-total fee line's base", () => {
    const input: ApartmentOperationsInputs = {
      ...withCommercial(),
      costLines: [
        ...base.costLines,
        { id: "fee", name: "Development Fee", category: "development_fee", basis: { type: "percent_of_total", base: "hard_and_soft", percent: 10 }, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "done" },
      ],
    };
    const { result } = run(input);
    const fee = result!.costSchedule.costLineSchedules.find(({ lineId }) => lineId === "fee")!;
    // Hard cost 500,000 and soft cost 90,000 are the only lines in a hard and soft base.
    expect(fee.percentBase).toBe(590_000);
    expect(fee.amount).toBe(59_000);
  });

  it("starts them on a milestone-anchored lease and reports the anchor", () => {
    const input: ApartmentOperationsInputs = {
      ...withCommercial({ spaces: [space({ leaseStartMonth: undefined, leaseStartAnchor: { milestoneId: "shell", offsetMonths: 2 } })] }),
      milestones: [{ id: "shell", name: "Shell Complete", month: "2027-05" }],
    };
    const { result, inputSnapshot } = run(input);
    expect(month(result!.months, "2027-06").commercialBaseRent).toBe(0);
    expect(month(result!.months, "2027-07").commercialBaseRent).toBe(25_000);
    expect(result!.costSchedule.costLineSchedules.find(({ lineId }) => lineId === "commercial-ti:retail-a")!.months).toEqual(["2027-07"]);
    expect(inputSnapshot.commercial!.spaces[0].leaseStartMonth).toBe("2027-07");
    expect(result!.anchors).toContainEqual(expect.objectContaining({ path: "commercial.spaces.0.leaseStartMonth", month: "2027-07", milestoneId: "shell", offsetMonths: 2 }));
    // The forward projection reads the same anchor, so the sale window never loses the lease.
    const projected = projectApartmentOperationsThrough({ ...input, commercial: block({ spaces: [space({ leaseStartMonth: undefined, leaseStartAnchor: { milestoneId: "shell", offsetMonths: 2 } })] }) }, "2031-11");
    expect(month(projected, "2031-11").commercialBaseRent).toBe(25_000);
    expect(month(projected, "2027-07").commercialBaseRent).toBe(25_000);
  });
});

describe("recoveries", () => {
  it("reads a tax recovery from the tax the property pays, so it follows a PILOT", () => {
    const pilot: PropertyTaxPlan = {
      taxInputVersion: PROPERTY_TAX_INPUT_VERSION,
      mode: "abatement",
      assessmentBasis: "stated_assessed_value",
      firstFiscalYearStartMonth: "2027-01",
      landAssessedValue: 200_000,
      improvementAssessedValue: 1_800_000,
      assessmentRatioPercent: 100,
      rateUnit: "mills",
      fiscalYears: [{ rate: 50, exemptionPercent: 100 }, { rate: 50, exemptionPercent: 60 }, { rate: 50, exemptionPercent: 0 }],
      annualRateGrowthPercent: 0,
      taxEvidence: { firstFiscalYearStartMonth: evidence, assessment: evidence, fiscalYears: evidence, annualRateGrowthPercent: evidence },
    };
    const taxed = withCommercial({
      spaces: [space({ areaSf: 10_000, freeRentMonths: 0, recoveries: [{ basis: { kind: "property_tax" }, sharePercent: 10 }] })],
    }, { ...base, propertyTax: pilot });
    const { result } = run(taxed);
    for (const [label, exemption] of [["2027-09", 100], ["2028-09", 60], ["2029-09", 0]] as const) {
      const item = month(result!.months, label);
      // Full tax is $100,000 a year: $10,000 on the land and $90,000 on the improvements. The exemption
      // takes its share off the improvements only, and the tenant pays 10 percent of what the property pays.
      expect(item.propertyTax, label).toBeCloseTo((10_000 + 90_000 * (1 - exemption / 100)) / 12, 2);
      expect(item.fullPropertyTax, label).toBeCloseTo(100_000 / 12, 2);
      expect(item.commercialRecoveries, label).toBeCloseTo(item.propertyTax * 0.10, 2);
    }
    // The property tax recovery stands in for no expense line, so it moves its billed share into commercial expenses.
    const first = month(result!.months, "2029-09");
    expect(first.commercialOperatingExpenses).toBeCloseTo(5_000 + first.propertyTax * 0.1, 2);
  });

  it("defaults the share to the space's area over residential unit area plus commercial area", () => {
    const input = withCommercial({ spaces: [space({ recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] } }] })] });
    const { result } = run(input);
    // 10,000 over 80,000 residential plus 10,000 commercial is one ninth.
    expect(month(result!.months, "2027-10").commercialRecoveries).toBeCloseTo(5_000 / 9, 2);
    expect(result!.commercial!.spaces[0].recoveries[0]).toMatchObject({ shareSource: "area_share" });
    expect(result!.commercial!.spaces[0].recoveries[0].sharePercent).toBeCloseTo(100 / 9, 6);
    expect(result!.commercial!.allocationAreaSf).toBe(90_000);
  });

  it("recovers several lines at once, and checks the total against the basis", () => {
    const lines: OperatingExpenseLine[] = [
      ...base.operatingExpenseLines,
      { id: "janitorial", name: "Janitorial", amount: 24_000, unit: "usd_per_year", appliesTo: "commercial", ...evidence },
    ];
    const input = withCommercial({
      spaces: [space({ recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam", "janitorial"] }, sharePercent: 40 }] })],
    }, { ...base, operatingExpenseLines: lines });
    const { result, reconciliations } = run(input);
    expect(month(result!.months, "2027-10").commercialRecoveries).toBe(Math.round((5_000 + 2_000) * 0.4 * 100) / 100);
    const check = reconciliations.find(({ id }) => id === "commercial-recovery:retail-a:0")!;
    expect(check.status).toBe("pass");
    expect(Math.abs(check.difference)).toBeLessThanOrEqual(check.tolerance);
  });
});

describe("commercial rent growth", () => {
  const growthEvidence = { sourceLabel: "Rent study", sourceDate: "2026-10-07", reviewState: "done" as const };

  it("grows commercial rent at the income rate when the case has no growth by category", () => {
    const { result } = run({ ...withCommercial(), annualIncomeGrowthPercent: 4 });
    // Growth starts 2027-01, so the lease's second operating year takes one step.
    expect(month(result!.months, "2027-10").commercialBaseRent).toBe(25_000);
    expect(month(result!.months, "2028-01").commercialBaseRent).toBe(26_000);
  });

  it("grows commercial rent at its own category rate, following growth by category", () => {
    const categoryGrowth = {
      marketRentPercent: [2], affordableRentPercent: [2], otherIncomePercent: [2], operatingExpensePercent: [2],
      commercialRentPercent: [5, 10], ...growthEvidence,
    };
    const { result } = run({ ...withCommercial(), categoryGrowth });
    expect(month(result!.months, "2028-01").commercialBaseRent).toBe(26_250);
    expect(month(result!.months, "2029-01").commercialBaseRent).toBeCloseTo(25_000 * 1.05 * 1.1, 2);
    expect(month(result!.months, "2030-01").commercialBaseRent).toBeCloseTo(25_000 * 1.05 * 1.1 * 1.1, 2);
    expect(month(result!.months, "2028-01").residentialGrossRent).toBe(204_000);
  });

  it("grows commercial rent at the market rates for a block saved before the commercial category existed", () => {
    const categoryGrowth = { marketRentPercent: [3], affordableRentPercent: [1], otherIncomePercent: [1], operatingExpensePercent: [1], ...growthEvidence };
    const { result } = run({ ...withCommercial(), categoryGrowth });
    expect(month(result!.months, "2028-01").commercialBaseRent).toBe(25_750);
  });

  it("moves commercial rent with an income growth scenario, whether or not the block lists commercial rent", () => {
    const sample = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
    const lists = (rate: number) => ({ marketRentPercent: [rate], affordableRentPercent: [rate], otherIncomePercent: [rate], operatingExpensePercent: [2], ...growthEvidence });
    const scenarios: ApartmentScenarioDefinition[] = [{
      id: "faster-growth",
      role: "upside",
      name: "Faster Growth",
      inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
      delta: { annualIncomeGrowthPercent: 6 },
      evidence: { annualIncomeGrowthPercent: { sourceLabel: "Broker view", sourceDate: "2026-10-07", reviewState: "done" } },
    }, {
      id: "higher-vacancy",
      role: "downside",
      name: "Higher Vacancy",
      inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
      delta: { vacancyPercent: 8 },
      evidence: { vacancyPercent: { sourceLabel: "Broker view", sourceDate: "2026-10-07", reviewState: "done" } },
    }];
    for (const baseBlock of [{ ...lists(1), commercialRentPercent: [1] }, lists(1)]) {
      const input = { ...sample, commercial: commercialFor(sample), categoryGrowth: baseBlock };
      const scenario = runApartmentScenarioComparison(input, scenarios);
      expect(scenario.issues).toEqual([]);
      const direct = computePropertyReturns({ ...input, categoryGrowth: { ...lists(6), commercialRentPercent: [6] } });
      expect(scenario.result!.scenarios[0].metrics.forwardNetOperatingIncome).toBe(direct.result!.propertyReturns.sale.forwardNetOperatingIncome);
    }
  });

  it("names a bad commercial growth list", () => {
    const categoryGrowth = { marketRentPercent: [3], affordableRentPercent: [1], otherIncomePercent: [1], operatingExpensePercent: [1], commercialRentPercent: [101], ...growthEvidence };
    expect(issueKeys({ ...withCommercial(), categoryGrowth })).toEqual(["categoryGrowth.commercialRentPercent.0:invalid_percent"]);
  });
});

describe("the commercial block's checks", () => {
  const badSpace = (overrides: Partial<CommercialSpace>) => withCommercial({ spaces: [space(overrides)] });

  it("names each bad space field", () => {
    expect(issueKeys(badSpace({ areaSf: 0 }))).toEqual(["commercial.spaces.0.areaSf:invalid_units"]);
    expect(issueKeys(badSpace({ annualRentPerSf: -1 }))).toEqual(["commercial.spaces.0.annualRentPerSf:invalid_amount"]);
    expect(issueKeys(badSpace({ tenantImprovementPerSf: Number.NaN }))).toEqual(["commercial.spaces.0.tenantImprovementPerSf:invalid_amount"]);
    expect(issueKeys(badSpace({ leasingCommissionPercent: 101 }))).toEqual(["commercial.spaces.0.leasingCommissionPercent:invalid_percent"]);
    expect(issueKeys(badSpace({ leaseTermMonths: 0 }))).toContain("commercial.spaces.0.leaseTermMonths:invalid_units");
    expect(issueKeys(badSpace({ freeRentMonths: 61 }))).toEqual(["commercial.spaces.0.freeRentMonths:invalid_units"]);
    expect(issueKeys(badSpace({ freeRentMonths: 1.5 }))).toEqual(["commercial.spaces.0.freeRentMonths:invalid_units"]);
    expect(issueKeys(withCommercial({ vacancyPercent: 120 }))).toEqual(["commercial.vacancyPercent:invalid_percent"]);
    expect(issueKeys(withCommercial({ creditLossPercent: -1 }))).toEqual(["commercial.creditLossPercent:invalid_percent"]);
    expect(issueKeys(withCommercial({ spaces: [] }))).toEqual(["commercial.spaces:invalid_line"]);
  });

  it("keeps each lease start inside the timeline and after operation start", () => {
    expect(issueKeys(badSpace({ leaseStartMonth: "2026-12" }))).toEqual(["commercial.spaces.0.leaseStartMonth:outside_timeline"]);
    expect(issueKeys(badSpace({ leaseStartMonth: "2031-01" }))).toEqual(["commercial.spaces.0.leaseStartMonth:outside_timeline"]);
    expect(issueKeys(badSpace({ leaseStartMonth: "July" }))).toEqual(["commercial.spaces.0.leaseStartMonth:invalid_month"]);
    expect(issueKeys(badSpace({ leaseStartMonth: undefined }))).toEqual(["commercial.spaces.0.leaseStartMonth:invalid_month"]);
  });

  it("names a missing milestone and a bad anchor", () => {
    expect(issueKeys(badSpace({ leaseStartMonth: undefined, leaseStartAnchor: { milestoneId: "nowhere", offsetMonths: 0 } })))
      .toEqual(["commercial.spaces.0.leaseStartAnchor.milestoneId:missing_milestone"]);
    expect(issueKeys({ ...badSpace({ leaseStartAnchor: { milestoneId: "shell", offsetMonths: 1.5 } }), milestones: [{ id: "shell", name: "Shell", month: "2027-05" }] }))
      .toEqual(["commercial.spaces.0.leaseStartAnchor.offsetMonths:invalid_anchor"]);
  });

  it("names a bad recovery", () => {
    const recovery = (basis: CommercialSpace["recoveries"][number]["basis"], sharePercent?: number) => badSpace({ recoveries: [{ basis, sharePercent }] });
    expect(issueKeys(recovery({ kind: "expense_lines", lineIds: ["missing"] }, 10))).toEqual(["commercial.spaces.0.recoveries.0.basis.lineIds.0:invalid_recovery"]);
    expect(issueKeys(recovery({ kind: "expense_lines", lineIds: [] }, 10))).toEqual(["commercial.spaces.0.recoveries.0.basis.lineIds:invalid_recovery"]);
    expect(issueKeys(recovery({ kind: "property_tax" }, 10))).toEqual(["commercial.spaces.0.recoveries.0.basis:invalid_recovery"]);
    expect(issueKeys(recovery({ kind: "expense_lines", lineIds: ["cam"] }, 0))).toEqual(["commercial.spaces.0.recoveries.0.sharePercent:invalid_percent"]);
    expect(issueKeys(recovery({ kind: "expense_lines", lineIds: ["cam", "cam"] }, 10))).toEqual(["commercial.spaces.0.recoveries.0.basis.lineIds.1:invalid_recovery"]);
    const percentLine: OperatingExpenseLine = { id: "fee", name: "Fee", amount: 3, unit: "percent_effective_gross_revenue", ...evidence };
    expect(issueKeys({ ...recovery({ kind: "expense_lines", lineIds: ["fee"] }, 10), operatingExpenseLines: [...base.operatingExpenseLines, percentLine] }))
      .toEqual(["commercial.spaces.0.recoveries.0.basis.lineIds.0:invalid_recovery"]);
  });

  it("stops tenants paying more than all of an expense", () => {
    const two = withCommercial({
      spaces: [
        space({ id: "a", name: "A", recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 60 }] }),
        space({ id: "b", name: "B", recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 50 }] }),
      ],
    });
    expect(issueKeys(two)).toEqual(["commercial.spaces:invalid_recovery"]);
    const fits = withCommercial({
      spaces: [
        space({ id: "a", name: "A", recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 60 }] }),
        space({ id: "b", name: "B", recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 40 }] }),
      ],
    });
    expect(run(fits).result!.totals.commercialRecoveries).toBeGreaterThan(0);
  });

  it("names duplicate space ids and more spaces than the cap", () => {
    expect(issueKeys(withCommercial({ spaces: [space(), space()] }))).toContain("commercial.spaces.1.id:duplicate_id");
    const many = Array.from({ length: 21 }, (_, index) => space({ id: `s${index}`, name: `S ${index}`, recoveries: [] }));
    expect(issueKeys(withCommercial({ spaces: many }))).toEqual(["commercial.spaces:invalid_line"]);
  });

  it("checks the tags on expense lines", () => {
    const tagged = (line: Partial<OperatingExpenseLine>) => withCommercial({}, {
      ...base,
      operatingExpenseLines: base.operatingExpenseLines.map((item) => item.id === "cam" ? { ...item, ...line } : item),
    });
    expect(issueKeys(tagged({ unit: "usd_per_unit_year" }))).toEqual(["operatingExpenseLines.1.unit:unsupported_unit"]);
    expect(issueKeys(tagged({ variablePercent: 50 }))).toEqual(["operatingExpenseLines.1.variablePercent:unsupported_unit"]);
    expect(issueKeys(tagged({ leadMonths: 7 }))).toEqual(["operatingExpenseLines.1.leadMonths:outside_timeline"]);
    expect(issueKeys(tagged({ appliesTo: "hotel" as "commercial" }))).toEqual(["operatingExpenseLines.1.appliesTo:invalid_line"]);
    // A line tagged commercial with no commercial block is an error, not a silent residential cost.
    expect(issueKeys(base)).toEqual(["operatingExpenseLines.1.appliesTo:invalid_line"]);
  });

  it("carries source and review fields like every other block", () => {
    expect(issueKeys(withCommercial({ sourceDate: "07/10/2026" }))).toEqual(["commercial.sourceDate:invalid_source_date"]);
    expect(issueKeys(badSpace({ reviewState: "maybe" as "done" }))).toEqual(["commercial.spaces.0.reviewState:invalid_review_state"]);
    expect(issueKeys(badSpace({ name: "" }))).toEqual(["commercial.spaces.0.name:missing_text"]);
  });
});

function commercialFor(input: ApartmentOperationsInputs): CommercialOperations {
  return block({
    spaces: [space({ leaseStartMonth: input.operationStartMonth, freeRentMonths: 0, recoveries: [], areaSf: 12_000, annualRentPerSf: 28, tenantImprovementPerSf: 90 })],
  });
}

describe("what loan sizing, value and the sale read", () => {
  const sample = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
  const lenderPlan: LenderTestPlan = {
    lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
    valuationMonth: "2028-09",
    asStabilizedCapRatePercent: 5.5,
    annualDebtService: 3_000_000,
    noiBasis: "noi_before_reserves",
    lenderTestEvidence: { valuationMonth: evidence, asStabilizedCapRatePercent: evidence, annualDebtService: evidence, noiBasis: evidence },
    loanSizing: undefined,
  };

  const commercialSample = (): PropertyReturnsInputs => ({ ...sample, lenderTests: lenderPlan, commercial: commercialFor(sample) });

  it("values the stabilized year on total NOI, commercial included", () => {
    const without = computePropertyReturns({ ...sample, lenderTests: lenderPlan });
    const withSpace = computePropertyReturns(commercialSample());
    expect(withSpace.status, JSON.stringify(withSpace.issues)).toBe("complete");
    const months = projectApartmentOperationsThrough(commercialSample(), "2029-08").filter(({ month: value }) => value >= "2028-09");
    const commercialNoi = Math.round(months.reduce((sum, item) => sum + item.commercialNetOperatingIncome, 0) * 100) / 100;
    expect(commercialNoi).toBeGreaterThan(0);
    expect(withSpace.result!.lenderTests!.stabilizedNoi).toBeCloseTo(without.result!.lenderTests!.stabilizedNoi + commercialNoi, 2);
    const valueOf = (run: ReturnType<typeof computePropertyReturns>) => run.result!.lenderTests!.metrics.find(({ key }) => key === "asStabilizedValue")!.value!;
    expect(valueOf(withSpace)).toBeCloseTo(valueOf(without) + commercialNoi / 0.055, 0);
  });

  it("prices the sale on total forward NOI at the one terminal cap until a per-use cap exists", () => {
    const without = computePropertyReturns(sample);
    const withSpace = computePropertyReturns(commercialSample());
    expect(withSpace.status, JSON.stringify(withSpace.issues)).toBe("complete");
    const forward = withSpace.result!.forwardOperations.months;
    const commercialForward = Math.round(forward.reduce((sum, item) => sum + item.commercialNetOperatingIncome, 0) * 100) / 100;
    expect(withSpace.result!.propertyReturns.sale.forwardNetOperatingIncome)
      .toBeCloseTo(without.result!.propertyReturns.sale.forwardNetOperatingIncome + commercialForward, 2);
    expect(withSpace.result!.propertyReturns.sale.grossSaleValue).toBeGreaterThan(without.result!.propertyReturns.sale.grossSaleValue);
    expect(withSpace.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("charges selling cost as one percent of the whole sale, with no split by use", () => {
    // Benjamin allocates general selling costs by a commercial share whose residential side points at a
    // hotel row (CF-Dispo!B34). That split is reporting only, and the engine does not reproduce it.
    const run = computePropertyReturns(commercialSample());
    const { sale } = run.result!.propertyReturns;
    expect(sale.sellingCosts).toBeCloseTo(sale.grossSaleValue * commercialSample().sellingCostPercent / 100, 2);
  });

  it("sizes the loan on a NOI that includes commercial NOI, the seam the permanent loan will read", () => {
    const sizingPlan = (minDebtYieldPercent: number): LenderTestPlan => ({
      ...lenderPlan,
      loanSizing: { noiTaxBasis: "full_tax", minDebtYieldPercent, evidence },
    });
    const input = commercialSample();
    const noi = projectApartmentOperationsThrough(input, "2029-08")
      .filter(({ month: value }) => value >= "2028-09")
      .reduce((total, item) => total + Math.round(item.netOperatingIncome * 100), 0) / 100;
    const withoutNoi = projectApartmentOperationsThrough(sample, "2029-08")
      .filter(({ month: value }) => value >= "2028-09")
      .reduce((total, item) => total + Math.round(item.netOperatingIncome * 100), 0) / 100;
    expect(noi).toBeGreaterThan(withoutNoi);
    const yieldPercent = 8;
    const withSpace = computePropertyReturns({ ...input, lenderTests: sizingPlan(yieldPercent) });
    const without = computePropertyReturns({ ...sample, lenderTests: sizingPlan(yieldPercent) });
    expect(withSpace.status, JSON.stringify(withSpace.issues)).toBe("complete");
    const cap = withSpace.result!.lenderTests!.loanSizing!.caps.find(({ key }) => key === "debtYield")!;
    const baseline = without.result!.lenderTests!.loanSizing!.caps.find(({ key }) => key === "debtYield")!;
    // The debt yield cap is NOI over the minimum yield, so the commercial NOI raises the ceiling by itself divided by the yield.
    expect(cap.amount).toBeCloseTo(noi / (yieldPercent / 100), 0);
    expect(cap.amount - baseline.amount).toBeCloseTo((noi - withoutNoi) / (yieldPercent / 100), 0);
  });

  it("reports the commercial scorecard outputs when the case has commercial spaces", () => {
    const outputs = engineOutputsFor(commercialSample()).outputs;
    expect(outputs.commercialTenantImprovements).toBe(12_000 * 90);
    expect(outputs.commercialAnnualRentRoll).toBe(12_000 * 28);
    expect(Number(outputs.stabilizedCommercialNetOperatingIncome)).toBeGreaterThan(0);
    expect(Number(outputs.stabilizedResidentialNetOperatingIncome) + Number(outputs.stabilizedCommercialNetOperatingIncome))
      .toBeCloseTo(Number(outputs.stabilizedNetOperatingIncome), 2);
    expect(outputs.commercialAreaSf).toBe(12_000);
    expect(engineOutputsFor(sample).outputs.commercialTenantImprovements).toBeUndefined();
  });
});
