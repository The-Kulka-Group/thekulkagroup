import type { AuditedModelScorecard, ScorecardTarget } from "../model-scorecard";
import type { PropertyReturnsInputs } from "../property-returns";
import { APARTMENT_DEVELOPMENT_V2_98_COST_SCHEDULE } from "./apartment-development-v2-98";
import { APARTMENT_DEVELOPMENT_V2_98_PARTNERSHIP, APARTMENT_DEVELOPMENT_V2_98_WATERFALL_EXPECTED } from "./apartment-development-model-v2.98-partnership";

/*
 * LA-1687 adapter: the real v2.98 sample deal as one full engine input, scored against the
 * workbook's saved results. Inputs come from the workbook's own input cells. The one solved value
 * is the debt share, which records the workbook's result after its own Goal Seek run.
 *
 * Month mapping: the workbook's month 0 is Underwriting Q23, EOMONTH(E13,-1), so month 0 is
 * 2025-12, month 19 (operation begin) is 2027-07, month 33 (first stabilized) is 2028-09, and
 * month 45 (sale) is 2029-09. APARTMENT_DEVELOPMENT_V2_98_COST_SCHEDULE labels each workbook
 * month one calendar month later, so this adapter keeps its amounts, categories and methods
 * and re-dates each line from the workbook's start and end month columns D and E.
 *
 * LA-1704 inputs: each expense line's variable share is one less its percent fixed in column E, and
 * capital expenditures are fully variable (E138), matching rows 122 to 138's fixed part plus
 * occupancy times the rest. Lease-up free rent is one month per thirteen-month lease (E93:E97, I90),
 * spread over the lease term.
 *
 * Workbook features the engine cannot express, with the closest honest input used here:
 * - S-curve cost timing: the engine has one smoothstep curve; the workbook's curve front-loads less.
 * - Lease-up free rent. Row 100 charges one-thirteenth of gross rent on every unit, leased or not,
 *   until the first stabilized month (FU93:FU98 read AK93:AK98), and row 101 floors net rent at
 *   zero. That charges free rent on vacant units, which is a workbook defect, so the engine does not
 *   copy it: it charges each lease signed in lease-up its own free month over its first term. The
 *   engine therefore charges less free rent early in lease-up, and keeps charging the last leases'
 *   free rent after stabilization, where the workbook stops at once. The stabilized-year rent and
 *   NOI targets read low by that tail.
 * - The loss-to-lease that lags rent growth behind thirteen-month lease rolls (rows 151 to 160 and
 *   row 101): no engine input. Rent adjustment uses the stabilized input I101, zero.
 * - Property taxes phase in at 50, 75 and 100 percent by operation year (I118:I120). The engine
 *   charges the full tax from operation start, which keeps its lease-up operating shortfall high.
 * - Lease-up counts all 300 units in the workbook; the engine leases revenue units only, so
 *   per-occupied-unit other income stops at 298 units.
 */

const SOURCE_DATE = "2026-10-05";
const evidence = (sourceLabel: string) => ({ sourceLabel, sourceDate: SOURCE_DATE, reviewState: "working" as const });

// Workbook month index for each cost line, from Underwriting columns D and E.
const COST_LINE_MONTHS: Record<string, [number, number]> = {
  "land-costs": [0, 0],
  "closing-costs": [0, 0],
  "construction-costs": [1, 18],
  "other-hard-costs": [1, 18],
  "architecture-engineering": [1, 6],
  "construction-management": [1, 18],
  "marketing-leasing": [16, 18],
  "development-fee": [1, 18],
};

const costLines = APARTMENT_DEVELOPMENT_V2_98_COST_SCHEDULE.costLines.map((line) => {
  const [start, end] = COST_LINE_MONTHS[line.id];
  return { ...line, startMonth: workbookMonth(start), endMonth: workbookMonth(end), sourceDate: SOURCE_DATE, reviewState: "working" as const };
});

const workbookLine = <Unit extends string>(id: string, name: string, amount: number, unit: Unit, sourceLabel: string) => ({
  id, name, amount, unit, ...evidence(sourceLabel),
});

const engineInputs: PropertyReturnsInputs = {
  inputVersion: "apartment_operations_inputs.v1",
  analysisStartMonth: workbookMonth(0),
  saleMonth: workbookMonth(45),
  costLines,
  operationStartMonth: workbookMonth(19),
  growthStartMonth: workbookMonth(19),
  preleasedUnits: 30,
  leaseUpUnitsPerMonth: 20,
  annualIncomeGrowthPercent: 3,
  annualExpenseGrowthPercent: 3,
  rentAdjustmentLossPercent: 0,
  freeRentPercent: 0,
  vacancyPercent: 5,
  creditLossPercent: 1,
  assumptionEvidence: {
    operationStartMonth: evidence("Underwriting D87, month 19, construction end E35 plus one; month 0 is Q23"),
    growthStartMonth: evidence("Underwriting E88 income growth begin and E118 expense growth begin, both month 19"),
    preleasedUnits: evidence("Underwriting I88, 10% pre-leased of 300 units (C99), 30 units"),
    leaseUpUnitsPerMonth: evidence("Underwriting I89, 20 units per month"),
    annualIncomeGrowthPercent: evidence("Underwriting D88 rent growth and C105:C108 other income growth, 3%"),
    annualExpenseGrowthPercent: evidence("Underwriting D122:D131 expense growth and D138 capital expenditure growth, 3%"),
    rentAdjustmentLossPercent: evidence("Underwriting I101 untrended gain/loss-to-lease, zero; the monthly lease-roll lag in row 101 has no engine input"),
    freeRentPercent: evidence("Underwriting F99 stabilized free rent, zero; lease-up free rent is the lease-up concession below"),
    vacancyPercent: evidence("Underwriting F113, 5% of total potential income (E113)"),
    creditLossPercent: evidence("Underwriting F114, 1% of total potential income (E114)"),
  },
  residentialUnitTypes: [{
    id: "workbook-average-unit",
    name: "Workbook Average Unit",
    units: 300,
    nonRevenueUnits: 2,
    averageAreaSf: 850,
    monthlyMarketRent: 1800,
    // One average type reproduces gross rent, area and the non-revenue adjustment exactly: the
    // workbook grows every unit type at one rate and prices model units at the average rent (E102).
    ...evidence("Underwriting C99 units, D99 average SF, H99 average rent per unit per month, D102 non-revenue units"),
  }],
  // The workbook's other income is 0% fixed (E105:E107): annual amount / 12 times occupancy.
  // Per occupied unit per month is annual amount / 300 / 12.
  otherIncomeLines: [
    // H105 is 55.555...; the engine takes cents, so it is rounded to 55.56.
    workbookLine("rubs", "RUBS", 55.56, "usd_per_occupied_unit_month", "Underwriting I105 over 300 units over 12 months (H105), rounded to cents"),
    workbookLine("other-income", "Other Income", 71.52, "usd_per_occupied_unit_month", "Underwriting I106 over 300 units over 12 months (H106)"),
    workbookLine("parking-income", "Parking Income", 100, "usd_per_occupied_unit_month", "Underwriting I107 over 300 units over 12 months (H107)"),
  ],
  operatingExpenseLines: [
    workbookLine("repairs-maintenance", "Repairs and Maintenance", 315_000, "usd_per_year", "Underwriting I122"),
    workbookLine("payroll", "Payroll", 395_100, "usd_per_year", "Underwriting I123"),
    { ...workbookLine("general-administrative", "General & Administrative", 240_000, "usd_per_year", "Underwriting I124; 75% fixed in E124"), variablePercent: 25 },
    workbookLine("marketing", "Marketing", 130_000, "usd_per_year", "Underwriting I125"),
    { ...workbookLine("utilities", "Utilities", 280_000, "usd_per_year", "Underwriting I126; 50% fixed in E126"), variablePercent: 50 },
    { ...workbookLine("contract-services", "Contract Services", 105_000, "usd_per_year", "Underwriting I127; 75% fixed in E127"), variablePercent: 25 },
    workbookLine("capital-reserves", "Capital Reserves", 60_000, "usd_per_year", "Underwriting I128, placed above NOI per E119"),
    workbookLine("management-fee", "Management Fee", 3, "percent_effective_gross_revenue", "Underwriting G129, 3% of effective gross revenue"),
    workbookLine("insurance", "Insurance", 105_000, "usd_per_year", "Underwriting I130"),
    // I131 is 895,532.7489...; rounded to cents. The 50/75/100 percent phase-in has no engine input.
    workbookLine("property-taxes", "Property Taxes", 895_532.75, "usd_per_year", "Underwriting I131 rounded to cents; phase-in I118:I120 not applied"),
  ],
  capitalExpenditureLines: [
    { ...workbookLine("other-capital-expenditures", "Other Capital Expenditures", 25_000, "usd_per_year", "Underwriting I138; 0% fixed in E138"), variablePercent: 100 },
  ],
  leaseUpConcession: {
    monthsFree: 1,
    leaseTermMonths: 13,
    timing: "spread_over_term",
    ...evidence("Underwriting E93:E97 initial free rent, one month, over lease contract length I90, thirteen months"),
  },
  capitalInputVersion: "development_capital_inputs.v1",
  // The workbook's debt share after its own Goal Seek run (F57), not the displayed 65% target in C57.
  targetDebtSharePercent: 64.99991417777832,
  annualInterestRatePercent: 9.5,
  loanFeePercent: 0,
  fundingOrder: "equity_first.v1",
  interestTreatment: "capitalized_net_operating_cash.v1",
  interestConvention: "opening_balance_monthly.v1",
  feeMonth: workbookMonth(0),
  payoffMonth: workbookMonth(45),
  capitalAssumptionEvidence: {
    targetDebtSharePercent: evidence("Underwriting F57, I57 over I53 after the workbook's Goal Seek; C57 shows the 65% target"),
    annualInterestRatePercent: evidence("Underwriting E61 construction loan rate, 9.5%; no mezzanine share in C62"),
    loanFeePercent: evidence("Underwriting I49 financing fees, zero; permanent debt is off (A74)"),
    fundingOrder: evidence("Underwriting D56 equity funds first, D57 construction debt second"),
    interestTreatment: evidence("Underwriting F48, 100% of lease-up income pays interest; reserves in rows 69 and 70"),
    interestConvention: evidence("Underwriting row 57 and row 203 monthly interest on the opening loan balance"),
    feeMonth: evidence("No financing fee applies (Underwriting I49), so the fee month is the analysis start, month 0"),
    payoffMonth: evidence("Underwriting E71 construction debt payoff month 45, the sale month"),
  },
  saleInputVersion: "property_returns_inputs.v1",
  terminalCapRatePercent: 5.75,
  sellingCostPercent: 1.5,
  forwardNoiConvention: "forward_twelve_month_noi.v1",
  cashFlowDateConvention: "month_end_dates.v1",
  xirrConvention: "xirr_actual_365.v1",
  saleAssumptionEvidence: {
    saleMonth: evidence("Underwriting D151 and H13, month 45, sale date I13"),
    terminalCapRatePercent: evidence("Underwriting I149 terminal cap rate, 5.75%"),
    sellingCostPercent: evidence("Underwriting I150 selling costs, 1.5%"),
    forwardNoiConvention: evidence("Underwriting I151 to I183 sale pro forma, months 45 through 56"),
    cashFlowDateConvention: evidence("Underwriting row 23 end-of-month dates"),
    xirrConvention: evidence("Underwriting H217 and H218 dated XIRR"),
  },
  partnership: APARTMENT_DEVELOPMENT_V2_98_PARTNERSHIP,
};

const USD = { absolute: 0.01 };
const RATIO = { absolute: 1e-6 };
const EXACT = { absolute: 0 };

const compare = (id: string, output: ScorecardTarget["output"], expected: number | string, tolerance = USD): ScorecardTarget => ({
  id, output, expected, tolerance, stage: "compare",
});
const notReachable = (id: string, reason: string): ScorecardTarget => ({ id, output: null, stage: "not_reachable", reason });

/*
 * One target per test in docs/underwriting-model-audit/golden-tests.json, same ids, except the
 * twelve operating-statement tests. Those golden tests hold the untrended annual column
 * (Underwriting I99:I142, today's rents). The catalog's stabilized outputs sum the engine's first
 * twelve stabilized months with growth applied, which is the workbook's trended column
 * (H153:H191, OFFSET from month 33 for 12 months). Those targets score the trended cell named on
 * each line, so their ids take a stabilized-year- prefix in place of the golden id (untrended-noi
 * becomes stabilized-year-noi). The two exit-cap sensitivity ids write the cap rate with a dash
 * (5-25, 5-5) because the scorecard rejects decimals in ids.
 */
const targets: ScorecardTarget[] = [
  compare("cost-land-total", "landCost", 8_230_000), // I29
  compare("cost-hard-total", "hardCost", 42_630_000), // I35
  // I42 hardcodes 3% instead of reading C42, but C42 is itself derived from I42, so the saved value is not wrong.
  compare("cost-development-fee", "developmentFee", 1_630_362), // I42
  // I43 includes the development fee; the engine's soft cost excludes it, so the target is I43 less I42 (SUM(I38:I41)).
  compare("cost-soft-total", "softCost", 3_485_400),
  compare("cost-before-financing", "costBeforeFinancing", 55_975_762), // I45
  compare("carry-interest", "capitalizedInterest", 4_754_370.350403402), // I48
  compare("carry-operating-shortfall", "operatingShortfall", 354_995.4571028643), // I50
  notReachable("carry-total", "No engine output in the scorecard catalog: total carry costs (capitalized interest plus fees plus operating shortfall)"),
  compare("uses-total", "totalUses", 61_085_127.80750626), // I53
  compare("sources-total", "totalSources", 61_085_127.80750626), // I58
  notReachable("sources-equal-uses", "No engine output in the scorecard catalog: sources less uses; the engine fails the run when they differ by more than one cent"),
  compare("equity-total", "equity", 21_379_847.157241), // I65
  compare("construction-debt-total", "totalDebt", 39_705_280.65026528), // I71
  compare("debt-plus-equity", "totalSources", 61_085_127.80750628), // I65 plus I71
  compare("hard-cost-monthly-sum", "hardCost", 42_630_000), // Annual Cash Flow G56:AZ56
  compare("annual-hard-cost-sum", "annualHardCost", 42_630_000), // Annual Cash Flow G56:AZ56, summed by year in the engine annual view (LA-1872)
  notReachable("operation-begin-month", "No engine output in the scorecard catalog: operation start month, which is an engine input"),
  compare("stabilized-month", "firstStabilizedMonth", workbookMonth(33), EXACT), // D89, month 33
  compare("stabilized-year-residential-gross-rent", "stabilizedResidentialGrossRent", 6_707_772), // H153
  compare("stabilized-year-residential-non-revenue", "stabilizedNonRevenueRentAdjustment", -44_718.479999999996), // H156
  compare("stabilized-year-residential-total", "stabilizedTotalResidentialRent", 6_573_618.72), // H157
  compare("stabilized-year-other-income-total", "stabilizedOtherIncome", 846_206.1407999999), // H163
  compare("stabilized-year-potential-income", "stabilizedPotentialIncome", 7_419_824.8608), // H165
  compare("stabilized-year-vacancy-loss", "stabilizedVacancyLoss", -370_991.24304000003), // H166
  compare("stabilized-year-credit-loss", "stabilizedCreditLoss", -74_198.248608), // H167
  compare("stabilized-year-effective-gross-revenue", "stabilizedEffectiveGrossRevenue", 6_974_635.369152), // H168
  compare("stabilized-year-operating-expenses", "stabilizedOperatingExpenses", 2_823_647.801117777), // H181
  compare("stabilized-year-noi", "stabilizedNetOperatingIncome", 4_150_987.5680342233), // H183
  compare("stabilized-year-capital-expenditures", "stabilizedCapitalExpenditures", 25_878.749999999996), // H189
  compare("stabilized-year-cash-flow-from-operations", "stabilizedOperatingCashFlow", 4_125_108.8180342233), // H191
  compare("sale-noi", "forwardNetOperatingIncome", 4_296_184.476415399), // I183
  compare("gross-sale-proceeds", "grossSaleValue", 74_716_251.76374607), // E193
  // E194 is negative in the workbook; the engine reports selling costs as a positive amount.
  compare("selling-costs", "sellingCosts", 1_120_743.776456191),
  compare("net-sale-proceeds", "netSaleProceeds", 73_595_507.98728988), // E195
  compare("equity-sale-proceeds", "equitySaleProceeds", 33_890_227.3370246), // E197
  compare("unlevered-equity-multiple", "unleveredEquityMultiple", 1.416994793819241, RATIO), // G217
  compare("unlevered-xirr", "unleveredXirr", 0.1213574588298798, RATIO), // H217
  compare("unlevered-net-profit", "unleveredNetProfit", 23_489_632.59150628), // I217
  compare("levered-equity-multiple", "leveredEquityMultiple", 1.612256254714846, RATIO), // G218
  compare("levered-xirr", "leveredXirr", 0.1467147290706635, RATIO), // H218
  compare("levered-net-profit", "leveredNetProfit", 13_089_945.14686823), // I218
  // I221 divides sale NOI by Project_Cost_Total, which is total uses I53 including carry, as the engine does.
  compare("sale-yield-on-cost", "yieldOnCost", 0.070331103995619, RATIO),
  compare("sale-development-spread", "developmentSpreadBasisPoints", 128.3110399561897, RATIO), // I223, basis points
  // LA-1863. These read the engine's own levered cash flow, so they carry its gaps above. The workbook
  // also pays the GP an asset management fee before the waterfall, which the engine does not model; the
  // replay in partnership-replay.test.ts checks the waterfall rules on the workbook's own cash flow.
  compare("waterfall-distribution-total", "partnershipDistributions", APARTMENT_DEVELOPMENT_V2_98_WATERFALL_EXPECTED.distributionTotal), // I247
  compare("waterfall-net-profit-reconciliation", "partnershipNetProfit", APARTMENT_DEVELOPMENT_V2_98_WATERFALL_EXPECTED.partnershipNetProfit), // I250:I252
  compare("lp-net-xirr", "lpXirr", APARTMENT_DEVELOPMENT_V2_98_WATERFALL_EXPECTED.lpNetXirr, RATIO), // I229
  compare("gp-net-xirr", "gpXirr", APARTMENT_DEVELOPMENT_V2_98_WATERFALL_EXPECTED.gpNetXirr, RATIO), // I230
  notReachable("sensitivity-exit-cap-5-percent-emx", "The engine has no sensitivity runs; each scorecard scores one input snapshot"),
  notReachable("sensitivity-exit-cap-5-25-percent-emx", "The engine has no sensitivity runs; each scorecard scores one input snapshot"),
  notReachable("sensitivity-exit-cap-5-5-percent-emx", "The engine has no sensitivity runs; each scorecard scores one input snapshot"),
];

export const APARTMENT_DEVELOPMENT_V2_98_SCORECARD: AuditedModelScorecard = {
  model: "apartment-development-model-v2.98",
  name: "Apartment Development Model v2.98",
  sourceSha256: "3481af2b91836bdbb7603a60246aa0f8c0c3ea6654311252f5df40760ff2a280",
  engineInputs,
  targets,
};

function workbookMonth(index: number) {
  const value = 2025 * 12 + 11 + index;
  return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, "0")}`;
}
