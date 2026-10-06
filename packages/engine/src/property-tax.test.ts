import { describe, expect, it } from "vitest";

import {
  APARTMENT_OPERATIONS_FORMULA_VERSION,
  computeApartmentOperations,
  projectApartmentOperationsThrough,
} from "./apartment-operations";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { LENDER_TESTS_INPUT_VERSION } from "./lender-tests";
import { computePropertyReturns, SALE_TAX_INPUT_VERSION, type PropertyReturnsInputs, type SaleTaxPlan } from "./property-returns";
import { PROPERTY_TAX_INPUT_VERSION, type PropertyTaxPlan } from "./property-tax";

const evidence = { sourceLabel: "Assessor roll and PILOT agreement", sourceDate: "2026-10-05", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;

// Base case: analysis from 2025-12, operations from 2027-07, sale in 2029-09.
// The tax fiscal year runs April to March, so it starts mid calendar year and the PILOT's first
// year is three months old when operations start.
const pilot = (overrides: Partial<PropertyTaxPlan> = {}): PropertyTaxPlan => ({
  taxInputVersion: PROPERTY_TAX_INPUT_VERSION,
  mode: "abatement",
  assessmentBasis: "stated_assessed_value",
  firstFiscalYearStartMonth: "2027-04",
  landAssessedValue: 2_000_000,
  improvementAssessedValue: 18_000_000,
  assessmentRatioPercent: 100,
  rateUnit: "mills",
  fiscalYears: [
    { rate: 20, exemptionPercent: 100 },
    { rate: 20, exemptionPercent: 50 },
    { rate: 20, exemptionPercent: 0 },
  ],
  annualRateGrowthPercent: 2,
  taxEvidence: {
    firstFiscalYearStartMonth: evidence,
    assessment: evidence,
    fiscalYears: evidence,
    annualRateGrowthPercent: evidence,
  },
  ...overrides,
});

const saleTax = (overrides: Partial<SaleTaxPlan> = {}): SaleTaxPlan => ({
  saleTaxInputVersion: SALE_TAX_INPUT_VERSION,
  valueBasis: "scheduled_tax",
  saleTaxEvidence: { valueBasis: evidence, abatementDiscountRatePercent: evidence },
  ...overrides,
});

const withTax = (propertyTax: PropertyTaxPlan, overrides: Partial<PropertyReturnsInputs> = {}): PropertyReturnsInputs => ({
  ...base,
  propertyTax,
  ...overrides,
});

function month(input: PropertyReturnsInputs, key: string) {
  const found = computeApartmentOperations(input).result?.months.find((item) => item.month === key);
  if (!found) throw new Error(`Missing month ${key}`);
  return found;
}

/** Same allocation the engine uses: the year's cents spread over twelve months, with any odd cent in the last. */
function monthlyShare(annualDollars: number, position: number) {
  const annual = Math.round(annualDollars * 100);
  const prior = Math.round(annual * position / 12);
  const next = position === 11 ? annual : Math.round(annual * (position + 1) / 12);
  return (next - prior) / 100;
}

describe("property tax schedule on the operating run", () => {
  it("runs under the v2 operations formula and leaves a run with no schedule unchanged", () => {
    const plain = computeApartmentOperations(base);
    expect(APARTMENT_OPERATIONS_FORMULA_VERSION).toBe("underwriting.apartment_operations.v2");
    expect(plain.result?.propertyTax).toBeNull();
    expect(plain.result?.months.every(({ propertyTax, fullPropertyTax }) => propertyTax === 0 && fullPropertyTax === 0)).toBe(true);
  });

  it("charges a PILOT that starts mid-year from the operation start month, inside a fiscal year that differs from the calendar", () => {
    const input = withTax(pilot());
    const run = computeApartmentOperations(input);
    expect(run.status).toBe("complete");

    // July is the fourth month of the April fiscal year. Year one exempts all improvements.
    const july = month(input, "2027-07");
    expect(july.propertyTax).toBe(monthlyShare(2_000_000 * 0.02, 3));
    expect(july.fullPropertyTax).toBe(monthlyShare(20_000_000 * 0.02, 3));

    // March closes fiscal year one; April opens year two at a 50 percent exemption.
    expect(month(input, "2028-03").propertyTax).toBe(monthlyShare(40_000, 11));
    expect(month(input, "2028-04").propertyTax).toBe(monthlyShare((2_000_000 + 9_000_000) * 0.02, 0));
    expect(month(input, "2028-04").fullPropertyTax).toBe(monthlyShare(400_000, 0));

    const rows = run.result!.propertyTax!.fiscalYears;
    expect(rows[0]).toMatchObject({ fiscalYear: 1, startMonth: "2027-04", endMonth: "2028-03", listed: true, chargedMonths: 9, annualScheduledTax: 40_000, annualFullTax: 400_000 });
    expect(rows[2]).toMatchObject({ fiscalYear: 3, annualScheduledTax: 400_000, annualFullTax: 400_000, chargedMonths: 6 });
    expect(rows).toHaveLength(3);
    expect(run.result!.propertyTax!.listedScheduledTaxTotal).toBe(40_000 + 220_000 + 400_000);
    expect(run.result!.propertyTax!.scheduleEndMonth).toBe("2030-03");
  });

  it("grows the last listed rate for fiscal years past the schedule and applies no abatement there", () => {
    const input = withTax(pilot({ fiscalYears: [{ rate: 20, exemptionPercent: 100 }, { rate: 20, exemptionPercent: 50 }] }));
    const row = computeApartmentOperations(input).result!.propertyTax!.fiscalYears[2];
    expect(row).toMatchObject({ fiscalYear: 3, startMonth: "2029-04", listed: false, exemptionPercent: 0, statedPayment: null, chargedMonths: 6 });
    expect(row.rate).toBeCloseTo(20.4, 10);
    expect(month(input, "2029-04").propertyTax).toBe(monthlyShare(20_000_000 * 0.0204, 0));
    expect(month(input, "2029-04").fullPropertyTax).toBe(month(input, "2029-04").propertyTax);
  });

  it("adds the scheduled tax to operating expenses and takes it out of NOI", () => {
    const plain = month(base, "2028-09");
    const taxed = month(withTax(pilot()), "2028-09");
    expect(taxed.operatingExpenses).toBeCloseTo(plain.operatingExpenses + taxed.propertyTax, 2);
    expect(taxed.netOperatingIncome).toBeCloseTo(plain.netOperatingIncome - taxed.propertyTax, 2);
    expect(computeApartmentOperations(withTax(pilot())).reconciliations
      .filter(({ id }) => id.includes("property-tax"))
      .map(({ status }) => status)).toEqual(["pass", "pass"]);
  });

  it("uses a stated PILOT payment in place of the computed abated tax", () => {
    const input = withTax(pilot({ fiscalYears: [{ rate: 20, exemptionPercent: 0, statedPayment: 120_000 }, { rate: 20, exemptionPercent: 0 }] }));
    expect(month(input, "2027-07").propertyTax).toBe(monthlyShare(120_000, 3));
    expect(month(input, "2027-07").fullPropertyTax).toBe(monthlyShare(400_000, 3));
  });

  it("taxes the income basis on each month's revenue and keeps a fixed PILOT payment apart", () => {
    const input = withTax(pilot({
      assessmentBasis: "income",
      landAssessedValue: undefined,
      improvementAssessedValue: undefined,
      assessorExpenseRatioPercent: 30,
      assessmentCapRatePercent: 12.38,
      assessmentRatioPercent: 0.75,
      rateUnit: "usd_per_100_assessed_value",
      fiscalYears: [
        { rate: 443.791, exemptionPercent: 0, statedPayment: 165_840 },
        { rate: 443.791, exemptionPercent: 0, statedPayment: 165_840 },
      ],
    }));
    const run = computeApartmentOperations(input);
    expect(run.status).toBe("complete");
    const september = run.result!.months.find((item) => item.month === "2028-09")!;
    const assessedCents = Math.round(september.effectiveGrossRevenue * 100) * 0.7 / 0.1238 * 0.0075;
    expect(september.fullPropertyTax).toBe(Math.round(assessedCents * 4.43791) / 100);
    expect(september.propertyTax).toBe(monthlyShare(165_840, 5));
    expect(run.result!.propertyTax!.fiscalYears[0]).toMatchObject({ annualFullTax: null, annualScheduledTax: 165_840 });
  });

  it("charges full tax in every month under full tax mode", () => {
    const input = withTax(pilot({ mode: "full_tax", fiscalYears: [{ rate: 20, exemptionPercent: 0 }] }));
    const run = computeApartmentOperations(input);
    expect(run.status).toBe("complete");
    expect(run.result!.months.every(({ propertyTax, fullPropertyTax }) => propertyTax === fullPropertyTax)).toBe(true);
    expect(month(input, "2027-07").propertyTax).toBe(monthlyShare(400_000, 3));
  });
});

describe("property tax unit checks", () => {
  const codes = (plan: PropertyTaxPlan) => computeApartmentOperations(withTax(plan)).issues.map(({ path, code }) => `${path}:${code}`);

  it("refuses an assessment cap rate entered as a decimal, the Benjamin S414 error", () => {
    expect(codes(pilot({
      assessmentBasis: "income",
      landAssessedValue: undefined,
      improvementAssessedValue: undefined,
      assessorExpenseRatioPercent: 30,
      assessmentCapRatePercent: 0.7,
      assessmentRatioPercent: 100,
      rateUnit: "percent_of_assessed_value",
      fiscalYears: [{ rate: 1.88, exemptionPercent: 0 }],
    }))).toContain("propertyTax.assessmentCapRatePercent:implausible_tax_rate");
  });

  it("refuses a millage cut to a hundredth, the Benjamin M365 error, even when the other input is sound", () => {
    expect(codes(pilot({
      assessmentBasis: "income",
      landAssessedValue: undefined,
      improvementAssessedValue: undefined,
      assessorExpenseRatioPercent: 30,
      assessmentCapRatePercent: 7,
      assessmentRatioPercent: 100,
      rateUnit: "percent_of_assessed_value",
      fiscalYears: [{ rate: 0.0188, exemptionPercent: 0 }],
    }))).toEqual(["propertyTax.fiscalYears.0.rate:implausible_tax_rate"]);
  });

  it("refuses a rate in the wrong unit and an assessment ratio entered as a fraction", () => {
    expect(codes(pilot({ rateUnit: "percent_of_assessed_value" }))).toContain("propertyTax.fiscalYears.0.rate:implausible_tax_rate");
    const fractionRatio = codes(pilot({ assessmentRatioPercent: 0.0075, rateUnit: "usd_per_100_assessed_value", fiscalYears: [{ rate: 4.43791, exemptionPercent: 0 }] }));
    expect(fractionRatio).toContain("propertyTax.fiscalYears.0.rate:implausible_tax_rate");
    expect(fractionRatio).toContain("propertyTax.assessmentRatioPercent:implausible_assessed_value");
  });

  it("checks first-year full tax against cost when no ratio is stated", () => {
    expect(codes(pilot({ assessmentRatioPercent: undefined }))).toEqual([]);
    // A rate of 0.02 entered as mills, meant as a decimal of two percent, taxes almost nothing.
    expect(codes(pilot({ assessmentRatioPercent: undefined, fiscalYears: [{ rate: 0.02, exemptionPercent: 0 }] }))).toEqual(["propertyTax.fiscalYears.0.rate:implausible_tax_rate"]);
  });

  it("refuses bad options, a late schedule and an abatement under full tax mode", () => {
    expect(codes(pilot({ assessmentRatioPercent: 120 }))).toEqual(["propertyTax.assessmentRatioPercent:invalid_percent"]);
    expect(codes(pilot({ firstFiscalYearStartMonth: "2027-08" }))).toEqual(["propertyTax.firstFiscalYearStartMonth:outside_tax_schedule"]);
    expect(codes(pilot({ mode: "full_tax" }))).toContain("propertyTax.fiscalYears.0:invalid_tax_option");
    expect(codes(pilot({ assessmentCapRatePercent: 7 }))).toEqual(["propertyTax.assessmentCapRatePercent:invalid_assessment"]);
    expect(codes(pilot({ fiscalYears: [{ rate: 0, exemptionPercent: 0 }] }))).toEqual(["propertyTax.fiscalYears.0.rate:invalid_tax_rate"]);
  });
});

describe("property tax at sale and in the lender tests", () => {
  // Five listed years run the abatement to 2032-03, past the 2029-09 sale.
  const longPilot = pilot({
    fiscalYears: [
      { rate: 20, exemptionPercent: 100 },
      { rate: 20, exemptionPercent: 80 },
      { rate: 20, exemptionPercent: 60 },
      { rate: 20, exemptionPercent: 40 },
      { rate: 20, exemptionPercent: 20 },
    ],
  });

  it("requires a sale tax basis with an abatement and refuses one without", () => {
    expect(computePropertyReturns(withTax(longPilot)).issues.map(({ code }) => code)).toEqual(["missing_sale_tax_basis"]);
    expect(computePropertyReturns({ ...base, saleTax: saleTax() }).issues.map(({ code }) => code)).toEqual(["invalid_sale_tax"]);
    expect(computePropertyReturns(withTax(longPilot, { saleTax: saleTax({ valueBasis: "full_tax_plus_abatement_value" }) })).issues
      .map(({ path }) => path)).toEqual(["saleTax.abatementDiscountRatePercent"]);
  });

  it("prices the sale on scheduled or full tax and reports both", () => {
    const scheduled = computePropertyReturns(withTax(longPilot, { saleTax: saleTax() }));
    const full = computePropertyReturns(withTax(longPilot, { saleTax: saleTax({ valueBasis: "full_tax" }) }));
    expect(scheduled.status).toBe("complete");
    expect(full.status).toBe("complete");
    const report = scheduled.result!.saleTax!;
    expect(scheduled.result!.propertyReturns.sale.forwardNetOperatingIncome).toBe(report.scheduledTaxForwardNoi);
    expect(full.result!.propertyReturns.sale.forwardNetOperatingIncome).toBe(report.fullTaxForwardNoi);
    expect(report.fullTaxForwardNoi).toBeLessThan(report.scheduledTaxForwardNoi);
    expect(full.result!.propertyReturns.sale.grossSaleValue).toBe(report.fullTaxValue);
    expect(report.abatementValue).toBeNull();
  });

  it("adds the abatement left at sale at one stated discount rate", () => {
    const input = withTax(longPilot, { saleTax: saleTax({ valueBasis: "full_tax_plus_abatement_value", abatementDiscountRatePercent: 6 }) });
    const run = computePropertyReturns(input);
    expect(run.status).toBe("complete");
    const months = projectApartmentOperationsThrough(input, "2032-03").filter((item) => item.month >= "2029-09");
    const expected = months.reduce((total, item, offset) =>
      total + (Math.round(item.fullPropertyTax * 100) - Math.round(item.propertyTax * 100)) / 1.06 ** ((offset + 1) / 12), 0);
    const report = run.result!.saleTax!;
    expect(report.abatementValue).toBe(Math.round(expected) / 100);
    expect(report.abatementEndMonth).toBe("2032-03");
    const sale = run.result!.propertyReturns.sale;
    expect(sale.abatementValue).toBe(report.abatementValue);
    expect(sale.grossSaleValue).toBeCloseTo(report.fullTaxValue + report.abatementValue!, 2);
    expect(run.reconciliations.find(({ id }) => id === "gross-sale-value")?.status).toBe("pass");
  });

  it("values no abatement at sale once the abatement has ended", () => {
    // Three listed years end the abatement in 2030-03; a sale moved to 2030-06 falls after it.
    const late = { ...base, saleMonth: "2030-06", payoffMonth: "2030-06" };
    const run = computePropertyReturns(withTax(pilot(), {
      ...late,
      saleTax: saleTax({ valueBasis: "full_tax_plus_abatement_value", abatementDiscountRatePercent: 6 }),
    }));
    expect(run.status).toBe("complete");
    const report = run.result!.saleTax!;
    expect(report.abatementValue).toBe(0);
    expect(report.fullTaxForwardNoi).toBe(report.scheduledTaxForwardNoi);
  });

  it("reports value, LTV, DSCR and debt yield again on full tax for the valuation year", () => {
    const run = computePropertyReturns(withTax(longPilot, {
      saleTax: saleTax(),
      lenderTests: {
        lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
        valuationMonth: "2028-09",
        asStabilizedCapRatePercent: 5.5,
        annualDebtService: 3_000_000,
        noiBasis: "noi_before_reserves",
        lenderTestEvidence: { valuationMonth: evidence, asStabilizedCapRatePercent: evidence, annualDebtService: evidence, noiBasis: evidence },
      },
    }));
    expect(run.status).toBe("complete");
    const tests = run.result!.lenderTests!;
    const year = projectApartmentOperationsThrough(run.inputSnapshot, "2029-08").filter((item) => item.month >= "2028-09");
    const abatement = year.reduce((total, item) => total + Math.round(item.fullPropertyTax * 100) - Math.round(item.propertyTax * 100), 0) / 100;
    expect(abatement).toBeGreaterThan(0);
    expect(tests.fullTax!.stabilizedNoi).toBeCloseTo(tests.stabilizedNoi - abatement, 2);
    expect(tests.fullTax!.metrics.map(({ key }) => key)).toEqual(["asStabilizedValue", "loanToValue", "debtServiceCoverage", "debtYield"]);
    const fullValue = tests.fullTax!.metrics.find(({ key }) => key === "asStabilizedValue")!;
    expect(fullValue.value).toBe(Math.round(tests.fullTax!.stabilizedNoi * 100 / 0.055) / 100);
    expect(fullValue.formula).toContain("with full tax");
    expect(fullValue.inputPaths).toContain("propertyTax");
  });

  it("reports no full-tax lender tests without an abatement", () => {
    const run = computePropertyReturns(withTax(pilot({ mode: "full_tax", fiscalYears: [{ rate: 20, exemptionPercent: 0 }] }), {
      lenderTests: {
        lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
        valuationMonth: "2028-09",
        asStabilizedCapRatePercent: 5.5,
        annualDebtService: 3_000_000,
        noiBasis: "noi_before_reserves",
        lenderTestEvidence: { valuationMonth: evidence, asStabilizedCapRatePercent: evidence, annualDebtService: evidence, noiBasis: evidence },
      },
    }));
    expect(run.status).toBe("complete");
    expect(run.result!.lenderTests!.fullTax).toBeNull();
    expect(run.result!.saleTax).toBeNull();
  });
});
