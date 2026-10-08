import type { CommercialOperations } from "../commercial-operations";
import { LENDER_TESTS_INPUT_VERSION, type LenderTestPlan } from "../lender-tests";
import { SALE_TAX_INPUT_VERSION, type PropertyReturnsInputs, type SaleTaxPlan } from "../property-returns";
import { PROPERTY_TAX_INPUT_VERSION, type PropertyTaxPlan } from "../property-tax";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./apartment-development-model-v2.98-scorecard";

/*
 * LA-1870 test cases: the v2.98 apartment deal with one retail space, with and without a tax
 * abatement, and lender tests that size the loan on value, debt yield and DSCR. These are test
 * inputs, not deal figures.
 */

export const COMMERCIAL_CAP_EVIDENCE = { sourceLabel: "Broker opinion", sourceDate: "2026-10-07", reviewState: "working" as const };
const evidence = COMMERCIAL_CAP_EVIDENCE;

export const COMMERCIAL_CAP_BASE = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;

export function retailBlock(taxShare?: number): CommercialOperations {
  return {
    spaces: [{
      id: "retail-a",
      name: "Retail A",
      areaSf: 10_000,
      annualRentPerSf: 30,
      leaseStartMonth: "2027-07",
      freeRentMonths: 0,
      recoveries: taxShare === undefined ? [] : [{ basis: { kind: "property_tax" }, sharePercent: taxShare }],
      tenantImprovementPerSf: 40,
      leasingCommissionPercent: 5,
      leaseTermMonths: 120,
      ...evidence,
    }],
    vacancyPercent: 5,
    creditLossPercent: 1,
    ...evidence,
  };
}

export const COMMERCIAL_CAP_PROPERTY_TAX: PropertyTaxPlan = {
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
    { rate: 20, exemptionPercent: 80 },
    { rate: 20, exemptionPercent: 60 },
    { rate: 20, exemptionPercent: 40 },
    { rate: 20, exemptionPercent: 20 },
  ],
  annualRateGrowthPercent: 2,
  taxEvidence: { firstFiscalYearStartMonth: evidence, assessment: evidence, fiscalYears: evidence, annualRateGrowthPercent: evidence },
};

export function saleTaxPlan(valueBasis: SaleTaxPlan["valueBasis"]): SaleTaxPlan {
  return {
    saleTaxInputVersion: SALE_TAX_INPUT_VERSION,
    valueBasis,
    ...(valueBasis === "full_tax_plus_abatement_value" ? { abatementDiscountRatePercent: 6 } : {}),
    saleTaxEvidence: { valueBasis: evidence, abatementDiscountRatePercent: evidence },
  };
}

export function lenderTestPlan(overrides: Partial<LenderTestPlan> = {}): LenderTestPlan {
  return {
    lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
    valuationMonth: "2028-09",
    asStabilizedCapRatePercent: 5.5,
    annualDebtService: 3_000_000,
    noiBasis: "noi_before_reserves",
    lenderTestEvidence: { valuationMonth: evidence, asStabilizedCapRatePercent: evidence, annualDebtService: evidence, noiBasis: evidence },
    loanSizing: { noiTaxBasis: "full_tax", evidence, maxLoanToValuePercent: 60, minDebtYieldPercent: 8, minDebtServiceCoverage: 1.25, dscrRatePercent: 7, dscrAmortizationYears: 30 },
    ...overrides,
  };
}

/** Retail on the v2.98 deal, no tax schedule. */
export function retailCase(overrides: Partial<PropertyReturnsInputs> = {}): PropertyReturnsInputs {
  return { ...COMMERCIAL_CAP_BASE, commercial: retailBlock(), lenderTests: lenderTestPlan(), ...overrides };
}

/** Retail on the v2.98 deal with a five-year abatement, a tenant tax recovery and a sale on any tax basis. */
export function retailAbatementCase(valueBasis: SaleTaxPlan["valueBasis"], overrides: Partial<PropertyReturnsInputs> = {}): PropertyReturnsInputs {
  return {
    ...COMMERCIAL_CAP_BASE,
    commercial: retailBlock(10),
    propertyTax: COMMERCIAL_CAP_PROPERTY_TAX,
    saleTax: saleTaxPlan(valueBasis),
    lenderTests: lenderTestPlan(),
    ...overrides,
  };
}
