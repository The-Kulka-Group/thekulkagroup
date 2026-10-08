import { describe, expect, it } from "vitest";

import { projectApartmentOperationsThrough, type MonthlyApartmentOperations } from "./apartment-operations";
import {
  COMMERCIAL_CAP_EVIDENCE,
  lenderTestPlan,
  retailAbatementCase,
  retailCase,
} from "./fixtures/commercial-cap-cases";
import { calculatePropertyReturns, computePropertyReturns, type ForwardSalePeriod, type PropertyReturnsInputs } from "./property-returns";
import { commercialTaxSharePercentFor } from "./use-split";

/*
 * LA-1870. Hand-checkable: the checks below rebuild each number from the run's own monthly NOI by use,
 * with the cap rates written out, so a wrong split or a wrong cap shows as a different dollar figure.
 */

const evidence = COMMERCIAL_CAP_EVIDENCE;
const cents = (value: number) => Math.round(value * 100);
const dollars = (valueCents: number) => valueCents / 100;

function capped(input: PropertyReturnsInputs, commercialCap: number): PropertyReturnsInputs {
  return {
    ...input,
    commercialTerminalCapRatePercent: commercialCap,
    saleAssumptionEvidence: { ...input.saleAssumptionEvidence, commercialTerminalCapRatePercent: evidence },
  };
}

function complete(input: PropertyReturnsInputs) {
  const run = computePropertyReturns(input);
  expect(run.status, JSON.stringify(run.issues)).toBe("complete");
  expect(run.reconciliations.filter(({ status }) => status === "fail").map(({ id }) => id)).toEqual([]);
  return run.result!;
}

function forwardMonths(input: PropertyReturnsInputs): MonthlyApartmentOperations[] {
  const [year, month] = input.saleMonth.split("-").map(Number);
  const end = year * 12 + month - 1 + 11;
  const endMonth = `${Math.floor(end / 12)}-${String(end % 12 + 1).padStart(2, "0")}`;
  return projectApartmentOperationsThrough(input, endMonth).filter((item) => item.month >= input.saleMonth);
}

const sumCents = (months: MonthlyApartmentOperations[], pick: (month: MonthlyApartmentOperations) => number) =>
  months.reduce((total, month) => total + pick(month), 0);

describe("sale priced with a commercial exit cap", () => {
  const input = capped(retailCase(), 7);
  const months = forwardMonths(input);
  const residentialCents = sumCents(months, (month) => cents(month.residentialNetOperatingIncome));
  const commercialCents = sumCents(months, (month) => cents(month.commercialNetOperatingIncome));

  it("values residential NOI at the terminal cap and commercial NOI at the commercial cap", () => {
    expect(commercialCents).toBeGreaterThan(0);
    const { sale } = complete(input).propertyReturns;
    const terminalCap = input.terminalCapRatePercent / 100;
    const residentialValue = Math.round(residentialCents / terminalCap);
    const commercialValue = Math.round(commercialCents / 0.07);
    expect(sale.valueSplit).toEqual({
      residentialForwardNetOperatingIncome: dollars(residentialCents),
      commercialForwardNetOperatingIncome: dollars(commercialCents),
      residentialCapRatePercent: input.terminalCapRatePercent,
      commercialCapRatePercent: 7,
      residentialValue: dollars(residentialValue),
      commercialValue: dollars(commercialValue),
    });
    expect(sale.grossSaleValue).toBe(dollars(residentialValue + commercialValue));
    expect(sale.forwardNetOperatingIncome).toBe(dollars(residentialCents + commercialCents));
  });

  it("splits the sale value into two parts that add to the total, with checks for each", () => {
    const result = complete(input);
    const { sale } = result.propertyReturns;
    expect(cents(sale.valueSplit!.residentialValue) + cents(sale.valueSplit!.commercialValue)).toBe(cents(sale.grossSaleValue));
    const ids = result.propertyReturns.reconciliations.map(({ id }) => id);
    expect(ids).toEqual(expect.arrayContaining(["sale-noi-by-use", "residential-sale-value", "commercial-sale-value", "gross-sale-value"]));
  });

  it("matches a run with no commercial cap to the cent when both caps are the same rate", () => {
    const same = complete(capped(retailCase(), retailCase().terminalCapRatePercent)).propertyReturns.sale.grossSaleValue;
    const none = complete(retailCase()).propertyReturns.sale.grossSaleValue;
    expect(Math.abs(cents(same) - cents(none))).toBeLessThanOrEqual(1);
  });

  it("lowers sale value when the commercial cap is higher, and raises it when lower", () => {
    const none = complete(retailCase()).propertyReturns.sale.grossSaleValue;
    expect(complete(capped(retailCase(), 9)).propertyReturns.sale.grossSaleValue).toBeLessThan(none);
    expect(complete(capped(retailCase(), 4)).propertyReturns.sale.grossSaleValue).toBeGreaterThan(none);
  });

  it("traces every split number to a formula and to inputs that exist in the run", () => {
    const run = computePropertyReturns(input);
    const metrics = run.result!.propertyReturns.metrics;
    for (const key of ["residentialForwardNetOperatingIncome", "commercialForwardNetOperatingIncome", "residentialSaleValue", "commercialSaleValue", "grossSaleValue"]) {
      const metric = metrics.find((item) => item.key === key);
      expect(metric, key).toBeDefined();
      expect(metric!.formula.length).toBeGreaterThan(0);
      for (const path of metric!.inputPaths) expect(Object.hasOwn(run.inputSnapshot, path), `${key} ${path}`).toBe(true);
    }
    expect(metrics.find(({ key }) => key === "commercialSaleValue")!.inputPaths).toEqual(expect.arrayContaining(["commercial", "commercialTerminalCapRatePercent"]));
    expect(metrics.find(({ key }) => key === "residentialSaleValue")!.inputPaths).not.toContain("commercialTerminalCapRatePercent");
  });

  it("reads development spread against the blended exit cap", () => {
    const result = complete(input).propertyReturns;
    const value = cents(result.sale.valueSplit!.residentialValue) + cents(result.sale.valueSplit!.commercialValue);
    const blended = cents(result.sale.forwardNetOperatingIncome) / value;
    expect(result.developmentSpreadBasisPoints).toBeCloseTo((result.yieldOnCost - blended) * 10_000, 6);
  });
});

describe("sale tax bases with a commercial exit cap", () => {
  const share = commercialTaxSharePercentFor(retailAbatementCase("scheduled_tax"));

  it("reads a ten percent tax recovery as ten percent from the lease start on", () => {
    expect(share("2027-06")).toBe(0);
    expect(share("2027-07")).toBe(10);
    expect(share("2030-01")).toBe(10);
  });

  for (const basis of ["scheduled_tax", "full_tax", "full_tax_plus_abatement_value"] as const) {
    it(`splits forward NOI on ${basis} and adds to the total`, () => {
      const input = capped(retailAbatementCase(basis), 7);
      const months = forwardMonths(input);
      const full = basis !== "scheduled_tax";
      let residential = 0;
      let commercial = 0;
      for (const month of months) {
        const added = full ? cents(month.fullPropertyTax) - cents(month.propertyTax) : 0;
        const commercialAdded = Math.round(added * share(month.month) / 100);
        residential += cents(month.residentialNetOperatingIncome) - (added - commercialAdded);
        commercial += cents(month.commercialNetOperatingIncome) - commercialAdded;
      }
      const result = complete(input);
      const { sale } = result.propertyReturns;
      expect(sale.valueSplit!.residentialForwardNetOperatingIncome).toBe(dollars(residential));
      expect(sale.valueSplit!.commercialForwardNetOperatingIncome).toBe(dollars(commercial));
      expect(cents(sale.forwardNetOperatingIncome)).toBe(residential + commercial);
      if (full) {
        const added = sumCents(months, (month) => cents(month.fullPropertyTax) - cents(month.propertyTax));
        expect(added).toBeGreaterThan(0);
        // Tenants carry ten percent of the added tax from their lease start, so the split cannot be all residential.
        expect(commercial).toBeLessThan(sumCents(months, (month) => cents(month.commercialNetOperatingIncome)));
      }
      const expectedGross = Math.round(residential / (input.terminalCapRatePercent / 100)) + Math.round(commercial / 0.07) + cents(sale.abatementValue);
      expect(cents(sale.grossSaleValue)).toBe(expectedGross);
      if (basis === "full_tax_plus_abatement_value") expect(sale.abatementValue).toBeGreaterThan(0);
    });
  }

  it("reports scheduled and full tax values with each use at its own cap", () => {
    const input = capped(retailAbatementCase("scheduled_tax"), 7);
    const months = forwardMonths(input);
    const valueOn = (full: boolean) => {
      let residential = 0;
      let commercial = 0;
      for (const month of months) {
        const added = full ? cents(month.fullPropertyTax) - cents(month.propertyTax) : 0;
        const commercialAdded = Math.round(added * share(month.month) / 100);
        residential += cents(month.residentialNetOperatingIncome) - (added - commercialAdded);
        commercial += cents(month.commercialNetOperatingIncome) - commercialAdded;
      }
      return dollars(Math.round(residential / (input.terminalCapRatePercent / 100)) + Math.round(commercial / 0.07));
    };
    const report = complete(input).saleTax!;
    expect(report.scheduledTaxValue).toBe(valueOn(false));
    expect(report.fullTaxValue).toBe(valueOn(true));
  });
});

describe("lender value and loan sizing with a commercial cap", () => {
  const withCommercialCap = (overrides: Partial<ReturnType<typeof lenderTestPlan>> = {}) =>
    lenderTestPlan({ commercialCapRatePercent: 7, lenderTestEvidence: { ...lenderTestPlan().lenderTestEvidence, commercialCapRatePercent: evidence }, ...overrides });
  const input = retailCase({ lenderTests: withCommercialCap() });
  const valuationYear = forwardWindow(input, "2028-09");

  function forwardWindow(source: PropertyReturnsInputs, first: string) {
    const [year, month] = first.split("-").map(Number);
    const end = year * 12 + month - 1 + 11;
    const last = `${Math.floor(end / 12)}-${String(end % 12 + 1).padStart(2, "0")}`;
    return projectApartmentOperationsThrough(source, last).filter((item) => item.month >= first);
  }

  it("values the valuation year by use and reports the two parts", () => {
    const tests = complete(input).lenderTests!;
    const residential = sumCents(valuationYear, (month) => cents(month.residentialNetOperatingIncome));
    const commercial = sumCents(valuationYear, (month) => cents(month.commercialNetOperatingIncome));
    expect(commercial).toBeGreaterThan(0);
    const residentialValue = Math.round(residential / 0.055);
    const commercialValue = Math.round(commercial / 0.07);
    expect(tests.valueSplit).toMatchObject({
      residentialNoi: dollars(residential),
      commercialNoi: dollars(commercial),
      residentialValue: dollars(residentialValue),
      commercialValue: dollars(commercialValue),
    });
    const value = tests.metrics.find(({ key }) => key === "asStabilizedValue")!;
    expect(value.value).toBe(dollars(residentialValue + commercialValue));
    expect(value.inputPaths).toContain("lenderTests.commercialCapRatePercent");
    const ltv = tests.metrics.find(({ key }) => key === "loanToValue")!;
    expect(ltv.value).toBeCloseTo(tests.loanAmount / dollars(residentialValue + commercialValue), 10);
    expect(tests.valueSplit!.lines.map(({ key }) => key)).toEqual(["residentialNoi", "commercialNoi", "residentialValue", "commercialValue"]);
    expect(tests.valueSplit!.lines.every(({ formula }) => formula.length > 0)).toBe(true);
  });

  it("leaves debt yield and DSCR on the whole NOI", () => {
    const tests = complete(input).lenderTests!;
    const whole = complete(retailCase()).lenderTests!;
    for (const key of ["debtYield", "debtServiceCoverage"] as const) {
      const metric = tests.metrics.find((item) => item.key === key)!;
      const base = whole.metrics.find((item) => item.key === key)!;
      if (key === "debtServiceCoverage") expect(metric.value).toBe(base.value);
    }
    expect(tests.stabilizedNoi).toBe(whole.stabilizedNoi);
  });

  it("caps the loan to value at the maximum LTV times the value by use", () => {
    const sizing = complete(input).lenderTests!.loanSizing!;
    const full = sizing.noiTaxBasis === "full_tax";
    expect(full).toBe(true);
    const residential = sumCents(valuationYear, (month) => cents(month.residentialNetOperatingIncome));
    const commercial = sumCents(valuationYear, (month) => cents(month.commercialNetOperatingIncome));
    // No tax schedule, so full tax equals scheduled tax and the split is the same.
    const value = Math.round(residential / 0.055) + Math.round(commercial / 0.07);
    const cap = sizing.caps.find(({ key }) => key === "loanToValue")!;
    expect(cap.amount).toBe(dollars(Math.floor(value * 60 / 100)));
    expect(cap.inputPaths).toContain("lenderTests.commercialCapRatePercent");
    expect(cap.formula).toContain("commercial cap rate");
    const whole = complete(retailCase()).lenderTests!.loanSizing!.caps.find(({ key }) => key === "loanToValue")!;
    expect(cap.amount).not.toBe(whole.amount);
  });

  it("splits full-tax value by use on a case with an abatement", () => {
    const abated = retailAbatementCase("full_tax", { lenderTests: withCommercialCap({ loanSizing: undefined }) });
    const tests = complete(abated).lenderTests!;
    const months = forwardWindow(abated, "2028-09");
    const share = commercialTaxSharePercentFor(abated);
    let residential = 0;
    let commercial = 0;
    for (const month of months) {
      const added = cents(month.fullPropertyTax) - cents(month.propertyTax);
      const commercialAdded = Math.round(added * share(month.month) / 100);
      residential += cents(month.residentialNetOperatingIncome) - (added - commercialAdded);
      commercial += cents(month.commercialNetOperatingIncome) - commercialAdded;
    }
    expect(tests.fullTax!.valueSplit).toMatchObject({ residentialNoi: dollars(residential), commercialNoi: dollars(commercial) });
    expect(tests.fullTax!.stabilizedNoi).toBe(dollars(residential + commercial));
    expect(tests.fullTax!.metrics.find(({ key }) => key === "asStabilizedValue")!.value).toBe(dollars(Math.round(residential / 0.055) + Math.round(commercial / 0.07)));
  });
});

describe("the commercial cap inputs", () => {
  const codes = (input: PropertyReturnsInputs) => computePropertyReturns(input).issues.map((issue) => `${issue.path}:${issue.code}`);

  it("refuses a commercial exit cap on a case with no commercial block", () => {
    const { commercial: _commercial, ...residentialOnly } = retailCase({ lenderTests: undefined });
    void _commercial;
    expect(codes(capped(residentialOnly as PropertyReturnsInputs, 7))).toEqual(["commercialTerminalCapRatePercent:invalid_commercial_cap"]);
  });

  it("refuses a commercial lender cap on a case with no commercial block", () => {
    const { commercial: _commercial, ...residentialOnly } = retailCase();
    void _commercial;
    const lenderTests = lenderTestPlan({ commercialCapRatePercent: 7, lenderTestEvidence: { ...lenderTestPlan().lenderTestEvidence, commercialCapRatePercent: evidence } });
    expect(codes({ ...residentialOnly, lenderTests } as PropertyReturnsInputs)).toEqual(["lenderTests.commercialCapRatePercent:invalid_commercial_cap"]);
  });

  it("refuses a cap that is zero, negative or above 100 percent", () => {
    for (const bad of [0, -1, 101, Number.NaN]) {
      expect(codes(capped(retailCase(), bad)), String(bad)).toEqual(["commercialTerminalCapRatePercent:invalid_percent"]);
      const lenderTests = lenderTestPlan({ commercialCapRatePercent: bad, lenderTestEvidence: { ...lenderTestPlan().lenderTestEvidence, commercialCapRatePercent: evidence } });
      expect(codes(retailCase({ lenderTests })), String(bad)).toEqual(["lenderTests.commercialCapRatePercent:invalid_percent"]);
    }
  });

  it("needs evidence for each commercial cap that is set", () => {
    expect(codes({ ...retailCase(), commercialTerminalCapRatePercent: 7 })).toEqual(["saleAssumptionEvidence.commercialTerminalCapRatePercent:missing_evidence"]);
    expect(codes(retailCase({ lenderTests: lenderTestPlan({ commercialCapRatePercent: 7 }) }))).toEqual(["lenderTests.lenderTestEvidence.commercialCapRatePercent:missing_evidence"]);
  });

  it("names the commercial block among the inputs behind NOI, only when the case has one", () => {
    const withBlock = computePropertyReturns(retailCase()).result!;
    const noi = withBlock.propertyReturns.metrics.find(({ key }) => key === "forwardNetOperatingIncome")!;
    expect(noi.inputPaths).toContain("commercial");
    const lenderValue = withBlock.lenderTests!.metrics.find(({ key }) => key === "asStabilizedValue")!;
    expect(lenderValue.inputPaths).toContain("commercial");
    const { commercial: _commercial, ...residentialOnly } = retailCase();
    void _commercial;
    const without = computePropertyReturns(residentialOnly as PropertyReturnsInputs).result!;
    expect(without.propertyReturns.metrics.find(({ key }) => key === "forwardNetOperatingIncome")!.inputPaths).not.toContain("commercial");
    expect(without.lenderTests!.metrics.find(({ key }) => key === "asStabilizedValue")!.inputPaths).not.toContain("commercial");
  });
});

describe("the forward sale period by use", () => {
  const run = computePropertyReturns(capped(retailCase(), 7));
  const snapshot = run.result!;
  const months = run.result!.developmentCapital.months.map((month) => ({
    month: month.month,
    projectCosts: month.projectCosts,
    loanFee: month.loanFee,
    grossInterest: month.grossInterest,
    totalDebtDraw: month.totalDebtDraw,
    operatingCashFlow: month.operatingCashFlow,
    repayment: month.repayment,
  }));
  const plan = run.inputSnapshot;
  const { sale } = snapshot.propertyReturns;
  const period: ForwardSalePeriod = {
    startMonth: plan.saleMonth,
    endMonth: snapshot.forwardOperations.endMonth,
    monthCount: 12,
    effectiveGrossRevenue: sale.forwardEffectiveGrossRevenue,
    operatingExpenses: sale.forwardOperatingExpenses,
    residentialNetOperatingIncome: sale.valueSplit!.residentialForwardNetOperatingIncome,
    commercialNetOperatingIncome: sale.valueSplit!.commercialForwardNetOperatingIncome,
  };
  const codes = (value: ForwardSalePeriod) => calculatePropertyReturns(months, value, plan).issues.map(({ path, code }) => `${path}:${code}`);

  it("accepts two parts that add to the forward NOI", () => {
    expect(codes(period)).toEqual([]);
  });

  it("needs both parts with a commercial cap", () => {
    const { commercialNetOperatingIncome: _omitted, ...onlyResidential } = period;
    void _omitted;
    expect(codes(onlyResidential)).toEqual(["forwardSalePeriod:invalid_forward_period"]);
  });

  it("refuses parts that do not add to the forward NOI", () => {
    expect(codes({ ...period, commercialNetOperatingIncome: period.commercialNetOperatingIncome! + 1_000 })).toEqual(["forwardSalePeriod:invalid_forward_period"]);
  });

  it("prices each part at its own cap", () => {
    const result = calculatePropertyReturns(months, period, plan).result!;
    expect(result.sale.grossSaleValue).toBe(sale.grossSaleValue);
    expect(result.sale.valueSplit).toEqual(sale.valueSplit);
  });
});
