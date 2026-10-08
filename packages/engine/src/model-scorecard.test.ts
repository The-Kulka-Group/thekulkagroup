import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS } from "./fixtures/apartment-development-v2-98";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";
import {
  ENGINE_OUTPUT_KEYS,
  LENDER_OUTPUT_KEYS,
  COMMERCIAL_OUTPUT_KEYS,
  OTHER_SOURCE_OUTPUT_KEYS,
  PARTNERSHIP_OUTPUT_KEYS,
  PERMANENT_LOAN_BALANCE_OUTPUT_KEYS,
  PERMANENT_LOAN_OUTPUT_KEYS,
  PERMANENT_LOAN_TEXT_OUTPUT_KEYS,
  PROPERTY_TAX_OUTPUT_KEYS,
  engineOutputsFor,
  formatScorecard,
  scorecardFor,
  scoreTargets,
  validateScorecardTargets,
  type ScorecardTarget,
} from "./model-scorecard";
import { computeDevelopmentCapital } from "./development-capital";
import { computeApartmentOperations } from "./apartment-operations";
import { computePropertyReturns, type PropertyReturnsInputs } from "./property-returns";
import { PROPERTY_TAX_INPUT_VERSION } from "./property-tax";
import { retailCase } from "./fixtures/commercial-cap-cases";

const compare = (id: string, output: ScorecardTarget["output"], expected: number | string, tolerance = { absolute: 0.01 }): ScorecardTarget => ({
  id,
  output,
  expected,
  tolerance,
  stage: "compare",
});

describe("scoreTargets", () => {
  it("marks a value inside its tolerance as matched and reports the percent off", () => {
    const [row] = scoreTargets([compare("land", "landCost", 1000)], { landCost: 1000.004 });
    expect(row.status).toBe("matched");
    expect(row.percentOff).toBeCloseTo(0.0004, 6);
  });

  it("marks a value outside its tolerance as off with a signed percent", () => {
    const [low, high] = scoreTargets(
      [compare("noi-low", "forwardNetOperatingIncome", 200), compare("noi-high", "grossSaleValue", 200)],
      { forwardNetOperatingIncome: 150, grossSaleValue: 250 },
    );
    expect(low).toMatchObject({ status: "off", percentOff: -25 });
    expect(high).toMatchObject({ status: "off", percentOff: 25 });
  });

  it("accepts a relative tolerance when it is wider than the absolute one", () => {
    const [row] = scoreTargets(
      [compare("irr", "leveredXirr", 0.2, { absolute: 0, relative: 0.01 } as ScorecardTarget["tolerance"])],
      { leveredXirr: 0.2019 },
    );
    expect(row.status).toBe("matched");
  });

  it("compares month outputs exactly and gives no percent", () => {
    const [same, other] = scoreTargets(
      [compare("stab", "firstStabilizedMonth", "2028-04"), compare("stab-2", "firstStabilizedMonth", "2028-05")],
      { firstStabilizedMonth: "2028-04" },
    );
    expect(same).toMatchObject({ status: "matched", percentOff: null });
    expect(other).toMatchObject({ status: "off", percentOff: null });
  });

  it("gives no percent when the expected value is zero", () => {
    const [row] = scoreTargets([compare("fee", "loanFees", 0)], { loanFees: 12 });
    expect(row).toMatchObject({ status: "off", percentOff: null });
  });

  it("keeps a workbook defect red on purpose and flags it if the engine ever matches it", () => {
    const defect: ScorecardTarget = { ...compare("sale-noi", "forwardNetOperatingIncome", 500), stage: "workbook_defect", reason: "Sale NOI leaves out vacancy" };
    const [miss] = scoreTargets([defect], { forwardNetOperatingIncome: 480 });
    const [hit] = scoreTargets([defect], { forwardNetOperatingIncome: 500 });
    expect(miss.status).toBe("defect_missed");
    expect(hit.status).toBe("defect_matched");
  });

  it("lists a value the engine cannot reach with its reason", () => {
    const [row] = scoreTargets(
      [{ id: "lp-irr", output: null, stage: "not_reachable", reason: "No LP/GP waterfall in the engine" }],
      { leveredXirr: 0.1 },
    );
    expect(row).toMatchObject({ status: "not_reachable", percentOff: null, reason: "No LP/GP waterfall in the engine" });
  });

  it("reports an output the engine run did not produce", () => {
    const [row] = scoreTargets([compare("noi", "forwardNetOperatingIncome", 100)], {});
    expect(row.status).toBe("no_output");
  });
});

describe("validateScorecardTargets", () => {
  it("accepts well-formed targets", () => {
    expect(validateScorecardTargets([
      compare("land", "landCost", 1),
      { id: "lp-irr", output: null, stage: "not_reachable", reason: "No waterfall" },
    ])).toEqual([]);
  });

  it("rejects unknown outputs, duplicate ids and missing reasons", () => {
    const problems = validateScorecardTargets([
      compare("land", "notAnOutput" as ScorecardTarget["output"], 1),
      compare("land", "landCost", 1),
      { id: "gap", output: null, stage: "not_reachable" },
      { id: "defect", output: "landCost", expected: 1, tolerance: { absolute: 0 }, stage: "workbook_defect" },
    ]);
    expect(problems.map(({ id, problem }) => `${id}:${problem}`)).toEqual([
      "land:unknown_output",
      "land:duplicate_id",
      "gap:missing_reason",
      "defect:missing_reason",
    ]);
  });

  it("rejects text that could carry a deal figure into a printed scorecard", () => {
    const problems = validateScorecardTargets([
      { id: "loan-12500000", output: null, stage: "not_reachable", reason: "No waterfall" },
      { id: "gap", output: null, stage: "not_reachable", reason: "Loan of $12.5M is sized elsewhere" },
      { id: "gap-2", output: null, stage: "not_reachable", reason: "Units at 1,250,000 SF" },
    ]);
    expect(problems.map(({ id, problem }) => `${id}:${problem}`)).toEqual([
      "loan-12500000:figure_in_text",
      "gap:figure_in_text",
      "gap-2:figure_in_text",
    ]);
  });

  it.each([
    "Loan of 12.5M sized elsewhere",
    "Tax at 4.5 percent of value",
    "Fee at 0.0125 of cost",
    "Plug TDC12500000 hidden",
    "Spread of 250 bps",
  ])("rejects the figure in %j", (reason) => {
    expect(validateScorecardTargets([{ id: "gap", output: null, stage: "not_reachable", reason }])).toEqual([
      { id: "gap", problem: "figure_in_text" },
    ]);
  });

  it("allows a version tag but not a bare decimal", () => {
    expect(validateScorecardTargets([{ id: "gap", output: null, stage: "not_reachable", reason: "Sample model v2.98 has no waterfall" }])).toEqual([]);
    expect(validateScorecardTargets([{ id: "gap", output: null, stage: "not_reachable", reason: "Cap at 2.98" }])).toEqual([
      { id: "gap", problem: "figure_in_text" },
    ]);
  });

  it("allows workbook cell references in reasons", () => {
    expect(validateScorecardTargets([
      { id: "gap", output: null, stage: "not_reachable", reason: "Plugs in Input!T1071:T1094 have no engine input" },
    ])).toEqual([]);
  });
});

describe("scorecardFor", () => {
  const input = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput as PropertyReturnsInputs;
  const model = (targets: ScorecardTarget[], name = "Sample") => ({ model: "sample", name, sourceSha256: "x", engineInputs: input, targets });

  it("scores a sound model and prints its scorecard", () => {
    const card = scorecardFor(model([compare("land", "landCost", 8_230_000)]));
    expect(card.problems).toEqual([]);
    expect(card.rows[0].status).toBe("matched");
    expect(card.text).toContain("| land | landCost | matched |");
  });

  it("withholds the scorecard text when a target fails validation", () => {
    const card = scorecardFor(model([{ id: "gap", output: null, stage: "not_reachable", reason: "Loan of $12.5M" }]));
    expect(card.problems).toEqual([{ id: "gap", problem: "figure_in_text" }]);
    expect(card.text).not.toContain("12.5");
    expect(card.text).toContain("withheld");
  });

  it("withholds the scorecard text when the model name carries a figure", () => {
    const card = scorecardFor(model([], "Deal at $40,000,000"));
    expect(card.problems).toEqual([{ id: "name", problem: "figure_in_text" }]);
    expect(card.text).not.toContain("40");
  });
});

describe("formatScorecard", () => {
  it("escapes table pipes so a reason cannot shift the columns", () => {
    const rows = scoreTargets([{ id: "gap", output: null, stage: "not_reachable", reason: "Either a | or b" }], {});
    const text = formatScorecard({ name: "Sample", engineStatus: "complete", issueCodes: [] }, rows);
    expect(text).toContain("Either a \\| or b");
  });

  it("prints ids, statuses and percents, and never the expected or actual values", () => {
    const rows = scoreTargets(
      [compare("noi", "forwardNetOperatingIncome", 4_088_812.37), compare("land", "landCost", 8_230_000)],
      { forwardNetOperatingIncome: 3_628_051.11, landCost: 8_230_000 },
    );
    const text = formatScorecard({ name: "Sample", engineStatus: "complete", issueCodes: [] }, rows);
    expect(text).toContain("noi");
    expect(text).toContain("-11.27%");
    expect(text).toContain("matched");
    expect(text).not.toMatch(/4[,.]?088|3[,.]?628|8[,.]?230/);
  });

  it("states a failed engine run and its issue codes", () => {
    const text = formatScorecard({ name: "Sample", engineStatus: "failed", issueCodes: ["invalid_month"] }, []);
    expect(text).toContain("failed");
    expect(text).toContain("invalid_month");
  });
});

describe("engineOutputsFor", () => {
  const input = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput as PropertyReturnsInputs;

  it("reports units, SF and rent by tier, with an empty tier at zero and no rent", () => {
    const first = input.residentialUnitTypes[0];
    const tiered = {
      ...input,
      residentialUnitTypes: [first, { ...first, id: "affordable-copy", affordabilityTier: "affordable" as const, amiPercent: 60, monthlyMarketRent: first.monthlyMarketRent / 2 }, ...input.residentialUnitTypes.slice(1)],
    };
    const run = engineOutputsFor(tiered);
    expect(run.status).toBe("complete");
    expect(run.outputs.affordableUnits).toBe(first.units);
    expect(run.outputs.workforceUnits).toBe(0);
    expect(run.outputs.workforceAverageMonthlyRent).toBeUndefined();
    expect((run.outputs.marketUnits as number) + (run.outputs.affordableUnits as number)).toBe(run.outputs.totalUnits);
    expect((run.outputs.marketRentableSf as number) + (run.outputs.affordableRentableSf as number)).toBe(run.outputs.totalAreaSf);
    expect(run.outputs.affordableAverageMonthlyRent).toBeCloseTo((first.monthlyMarketRent / 2), 6);
  });

  it("scores a percent-of-total fee on the financed schedule, the one the full run uses", () => {
    const last = input.costLines.at(-1)!;
    const solved: PropertyReturnsInputs = {
      ...input,
      costLines: [...input.costLines, {
        id: "solved-fee",
        name: "Solved Fee",
        category: "development_fee",
        basis: { type: "percent_of_total", base: "total_cost", percent: 3 },
        unit: "usd",
        startMonth: last.startMonth,
        endMonth: last.endMonth,
        distributionMethod: "straight_line",
        distributionVersion: "straight_line.v1",
        reviewState: "working",
      }],
    };
    const run = engineOutputsFor(solved);
    expect(run.status).toBe("complete");
    const full = computePropertyReturns(solved);
    const financing = full.result!.developmentCapital.totals;
    // The fee is 3 percent of every other line plus financing, so it is larger than the same share of cost alone.
    const withoutFinancing = computeApartmentOperations(solved).result!.costSchedule.totalsByCategory.development_fee;
    expect(financing.totalUses - financing.projectCosts).toBeGreaterThan(1_000);
    expect(run.outputs.developmentFee).toBeGreaterThan(withoutFinancing + 1_000);
    expect(run.outputs.developmentFee).toBeCloseTo(computeDevelopmentCapital(solved).result!.apartmentOperations.costSchedule.totalsByCategory.development_fee, 2);
    expect(run.outputs.costBeforeFinancing).toBeCloseTo(financing.projectCosts, 2);
  });

  it("reads every catalog output from one complete run", () => {
    const run = engineOutputsFor(input);
    expect(run.status).toBe("complete");
    expect(run.issueCodes).toEqual([]);
    const conditional = new Set<string>([...LENDER_OUTPUT_KEYS, ...OTHER_SOURCE_OUTPUT_KEYS, ...COMMERCIAL_OUTPUT_KEYS, ...PROPERTY_TAX_OUTPUT_KEYS, ...PARTNERSHIP_OUTPUT_KEYS, "lpPeakEquityMonth", "gpPeakEquityMonth"]);
    const permanentLoanKeys = [...PERMANENT_LOAN_OUTPUT_KEYS, ...PERMANENT_LOAN_TEXT_OUTPUT_KEYS, ...PERMANENT_LOAN_BALANCE_OUTPUT_KEYS];
    for (const key of permanentLoanKeys) conditional.add(key);
    const always = ENGINE_OUTPUT_KEYS.filter((item) => !conditional.has(item) && !/FiscalYear\d+$/.test(item) && !/AverageMonthlyRent$/.test(item));
    for (const key of always) expect(run.outputs[key], key).toBeDefined();
    expect(run.outputs.marketAverageMonthlyRent).toBeDefined();
    for (const key of PROPERTY_TAX_OUTPUT_KEYS) expect(run.outputs[key], key).toBeUndefined();
    for (const key of PARTNERSHIP_OUTPUT_KEYS) expect(run.outputs[key], key).toBeUndefined();
    for (const key of COMMERCIAL_OUTPUT_KEYS) expect(run.outputs[key], key).toBeUndefined();
    for (const key of permanentLoanKeys) expect(run.outputs[key], key).toBeUndefined();
  });

  it("reads peak equity on every run and the waterfall when the plan has one", () => {
    const evidence = { reviewState: "working" as const };
    const withWaterfall: PropertyReturnsInputs = {
      ...input,
      partnership: {
        partnershipInputVersion: "partnership_inputs.v1",
        lpFundingSharePercent: 90,
        fundingOrder: "pari_passu",
        tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 }],
        finalSplit: { promotePercent: 40, lpBaseSharePercent: 90 },
        partnershipEvidence: { funding: evidence, promoteTiers: evidence },
      },
    };
    const run = computePropertyReturns(withWaterfall);
    const { outputs } = engineOutputsFor(withWaterfall);
    expect(outputs.peakEquity).toBe(run.result!.propertyReturns.peakEquity!.amount);
    expect(outputs.peakEquityMonth).toBe(run.result!.propertyReturns.peakEquity!.month);
    for (const key of PARTNERSHIP_OUTPUT_KEYS.filter((key) => !key.includes("PreferredReturn"))) expect(outputs[key], key).toBeDefined();
    expect(outputs.lpPreferredReturnAccrued).toBe(0);
    expect(outputs.lpXirr).toBe(run.result!.partnership!.lp.xirr);
    expect(Number(outputs.partnershipNetProfit)).toBeCloseTo(Number(outputs.leveredNetProfit), 2);
  });

  it("reads cost category totals from the run's own cost schedule", () => {
    const { outputs } = engineOutputsFor(input);
    expect(outputs.landCost).toBeCloseTo(APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS.land.expected, 2);
    const categories = ["landCost", "hardCost", "softCost", "developmentFee", "financingFeeCost"] as const;
    expect(categories.reduce((total, key) => total + Number(outputs[key]), 0)).toBeCloseTo(Number(outputs.costBeforeFinancing), 2);
  });

  it("reads sale and return outputs that tie to the full run", () => {
    const run = computePropertyReturns(input);
    const { outputs } = engineOutputsFor(input);
    expect(outputs.grossSaleValue).toBe(run.result?.propertyReturns.sale.grossSaleValue);
    expect(outputs.leveredXirr).toBe(run.result?.propertyReturns.returns.levered.xirr);
    expect(Number(outputs.grossSaleValue) - Number(outputs.sellingCosts)).toBeCloseTo(Number(outputs.netSaleProceeds), 2);
    expect(Number(outputs.netSaleProceeds) - Number(outputs.debtPayoff)).toBeCloseTo(Number(outputs.equitySaleProceeds), 2);
  });

  it("sums the first twelve stabilized months for the stabilized-year outputs", () => {
    const { outputs } = engineOutputsFor(input);
    expect(Number(outputs.stabilizedEffectiveGrossRevenue) - Number(outputs.stabilizedOperatingExpenses))
      .toBeCloseTo(Number(outputs.stabilizedNetOperatingIncome), 2);
    expect(typeof outputs.firstStabilizedMonth).toBe("string");
  });

  it("reads lender tests from the full run when the plan has them, and leaves them out when it does not", () => {
    expect(engineOutputsFor(input).outputs.debtYield).toBeUndefined();
    const withTests = {
      ...input,
      lenderTests: {
        lenderTestInputVersion: "lender_tests_inputs.v1" as const,
        valuationMonth: "2026-01",
        asStabilizedCapRatePercent: 6,
        annualDebtService: 100_000,
        noiBasis: "noi_before_reserves" as const,
        lenderTestEvidence: {
          valuationMonth: { reviewState: "working" as const },
          asStabilizedCapRatePercent: { reviewState: "working" as const },
          annualDebtService: { reviewState: "working" as const },
          noiBasis: { reviewState: "working" as const },
        },
      },
    };
    const run = computePropertyReturns(withTests);
    const { outputs } = engineOutputsFor(withTests);
    for (const metric of run.result!.lenderTests!.metrics) {
      const key = ({ asStabilizedValue: "asStabilizedValue", loanToValue: "loanToValue", loanToCost: "loanToCost", loanToCostCreditedLand: "loanToCostCreditedLand", debtServiceCoverage: "debtServiceCoverage", debtYield: "debtYield" } as const)[metric.key];
      expect(outputs[key], key).toBe(metric.value ?? undefined);
    }
    expect(outputs.lenderValuationNoi).toBe(run.result!.lenderTests!.stabilizedNoi);
  });

  it("reads tax, sale tax and full-tax lender outputs when the run carries an abatement", () => {
    const working = { reviewState: "working" as const };
    const cost = Number(engineOutputsFor(input).outputs.costBeforeFinancing);
    const withTax: PropertyReturnsInputs = {
      ...input,
      propertyTax: {
        taxInputVersion: PROPERTY_TAX_INPUT_VERSION,
        mode: "abatement",
        assessmentBasis: "stated_assessed_value",
        firstFiscalYearStartMonth: input.operationStartMonth,
        landAssessedValue: 0,
        improvementAssessedValue: Math.round(cost),
        rateUnit: "mills",
        fiscalYears: [{ rate: 15, exemptionPercent: 100 }, { rate: 15, exemptionPercent: 50 }],
        annualRateGrowthPercent: 2,
        taxEvidence: { firstFiscalYearStartMonth: working, assessment: working, fiscalYears: working, annualRateGrowthPercent: working },
      },
      saleTax: {
        saleTaxInputVersion: "sale_tax_inputs.v1",
        valueBasis: "full_tax_plus_abatement_value",
        abatementDiscountRatePercent: 6,
        saleTaxEvidence: { valueBasis: working, abatementDiscountRatePercent: working },
      },
    };
    const run = computePropertyReturns(withTax);
    expect(run.status, run.issues.map(({ code }) => code).join(", ")).toBe("complete");
    const { outputs } = engineOutputsFor(withTax);
    for (const key of PROPERTY_TAX_OUTPUT_KEYS) expect(outputs[key], key).toBeDefined();
    const tax = computeApartmentOperations(withTax).result!.propertyTax!;
    expect(outputs.propertyTaxFiscalYear2).toBe(tax.fiscalYears[1].annualScheduledTax);
    expect(outputs.fullPropertyTaxFiscalYear2).toBe(tax.fiscalYears[1].annualFullTax);
    expect(outputs.propertyTaxListedTotal).toBe(tax.listedScheduledTaxTotal);
    expect(outputs.saleAbatementValue).toBe(run.result!.saleTax!.abatementValue);
    expect(Number(outputs.stabilizedNetOperatingIncome) - Number(outputs.stabilizedFullTaxNetOperatingIncome))
      .toBeCloseTo(Number(outputs.stabilizedFullPropertyTax) - Number(outputs.stabilizedPropertyTax), 2);
  });

  it("returns the failed status and issue codes without outputs when the run fails", () => {
    const run = engineOutputsFor({ ...input, saleMonth: "not-a-month" });
    expect(run.status).toBe("failed");
    expect(run.issueCodes.length).toBeGreaterThan(0);
    expect(run.outputs).toEqual({});
  });
});

describe("commercial sale value output (LA-1870)", () => {
  const evidence = { reviewState: "working" as const };
  const cap = (value: number): PropertyReturnsInputs => {
    const base = retailCase();
    return { ...base, commercialTerminalCapRatePercent: value, saleAssumptionEvidence: { ...base.saleAssumptionEvidence, commercialTerminalCapRatePercent: evidence } };
  };

  it("reads the commercial value from the run, and reports it only with a commercial cap", () => {
    const withCap = engineOutputsFor(cap(7));
    expect(withCap.status).toBe("complete");
    expect(withCap.outputs.commercialSaleValue).toBe(computePropertyReturns(cap(7)).result!.propertyReturns.sale.valueSplit!.commercialValue);
    expect(withCap.outputs.commercialSaleValue).toBeGreaterThan(0);
    expect(engineOutputsFor(retailCase()).outputs.commercialSaleValue).toBeUndefined();
  });

  it("scores a commercial sale target against the engine's commercial value", () => {
    const { outputs } = engineOutputsFor(cap(7));
    const rows = scoreTargets([compare("sale-gross-commercial", "commercialSaleValue", outputs.commercialSaleValue as number)], outputs);
    expect(rows.map(({ status }) => status)).toEqual(["matched"]);
  });
});
