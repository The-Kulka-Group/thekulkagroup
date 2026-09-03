import { APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE } from "./apartment-development-model-v2.98-capital";
import type { PropertyReturnsInputs, PropertyReturnsPlan } from "../property-returns";

const source = {
  file: "Apartment-Development-Model_v2.98-lbbejt.xlsm",
  sha256: "3481af2b91836bdbb7603a60246aa0f8c0c3ea6654311252f5df40760ff2a280",
  workbookVersion: "v2.98",
  basis: "Saved Excel results from Underwriting rows 149 through 218 and monthly columns Q through BJ.",
  warning: "These values are a test fixture. They are not Kulka defaults or approved business rules.",
  mapping: "The cash-flow fields map to Underwriting rows 49, 202, 203, 205, 208, and 212. The forward sale period maps to the saved SALE pro forma in cells I168 and I181.",
} as const;

const evidence = (sourceLabel: string) => ({ sourceLabel, sourceDate: "2026-09-02", reviewState: "done" as const });

const plan: PropertyReturnsPlan = {
  saleInputVersion: "property_returns_inputs.v1",
  terminalCapRatePercent: 5.75,
  sellingCostPercent: 1.5,
  forwardNoiConvention: "forward_twelve_month_noi.v1",
  cashFlowDateConvention: "month_end_dates.v1",
  xirrConvention: "xirr_actual_365.v1",
  saleAssumptionEvidence: {
    saleMonth: evidence("Workbook sale month: Underwriting D151 and monthly row 201"),
    terminalCapRatePercent: evidence("Workbook terminal cap: Underwriting I149"),
    sellingCostPercent: evidence("Workbook selling costs: Underwriting I150"),
    forwardNoiConvention: evidence("Workbook sale period: Underwriting I151 and rows 153 through 183"),
    cashFlowDateConvention: evidence("Workbook end-of-month dates: Underwriting row 201"),
    xirrConvention: evidence("Workbook dated XIRR: Underwriting H217 and H218"),
  },
};

const rows = [
  [8230000,0,0,0,0,0],[670271.5611330973,0,0,0,0,0],[820071.3553626761,0,0,0,0,0],[1117145.7252459105,0,0,0,0,0],
  [1634596.6641812623,0,0,0,0,0],[2420284.8491343935,0,0,0,0,0],[3447164.814282348,0,0,0,0,0],[4149054.9198309653,0,0,1108742.7319296505,0,0],
  [5136966.134434951,0,8777.5466277764,5145743.681062727,0,0],[5718724.976394397,0,49514.68410285632,5768239.660497254,0,0],
  [5718724.9763944,0,95179.91474845957,5813904.891142859,0,0],[5136966.134434948,0,141206.66180334054,5278172.796238288,0,0],
  [4149054.9198309667,0,182992.19644022698,4332047.116271194,0,0],[3020864.814282347,0,217287.56944404056,3238152.3837263878,0,0],
  [1993984.8491343935,0,242922.94248187452,2236907.791616268,0,0],[1208296.6641812609,0,260631.79583216997,1468928.4600134308,0,0],
  [715845.7252459119,0,272260.8128072763,988106.5380531882,0,0],[418771.35536267346,0,280083.3229001974,698854.6782628709,0,0],
  [268971.56113309844,0,285615.9224364452,554587.4835695436,0,0],[0,0,290006.40668137075,432110.14570375346,-142103.73902238274,0],
  [0,0,293427.27866819216,399961.10119279707,-106533.82252460494,0],[0,0,296593.6373859685,367557.5434127957,-70963.90602682717,0],
  [0,0,299503.4679379865,334897.45746703586,-35393.9895290494,0],[0,0,302154.7394762672,301978.81250753877,175.9269687284119,0],
  [0,0,304545.4050752852,268799.561608779,35745.843466506136,0],[0,0,306673.40160468797,235357.641640404,71315.75996428395,0],
  [0,0,308536.64960100787,201650.9731389462,106885.67646206167,0],[0,0,310133.0531383578,167677.4601785183,142455.59295983953,0],
  [0,0,311460.4996981044,133434.99024048715,178025.50945761724,0],[0,0,312516.86003750825,98921.43408211315,213595.4259553951,0],
  [0,0,313299.98805732495,64134.645604152145,249165.3424531728,0],[0,0,313807.7206683578,52056.3441860929,261751.3764822649,0],
  [0,0,314219.8333931644,14354.326918188366,299865.506474976,0],[0,0,314333.4718146,0,358179.76977902395,0],
  [0,0,314333.4718146,0,359164.5137790239,0],[0,0,314333.4718146,0,360149.257779024,0],[0,0,314333.4718146,0,361134.00177902397,0],
  [0,0,314333.4718146,0,362118.7457790239,0],[0,0,314333.4718146,0,363103.489779024,0],[0,0,314333.4718146,0,364088.2337790239,0],
  [0,0,314333.4718146,0,365072.977779024,0],[0,0,314333.4718146,0,366057.72177902394,0],[0,0,314333.4718146,0,367042.4657790239,0],
  [0,0,314333.4718146,0,345074.878148064,0],[0,0,314333.4718146,0,346089.164468064,0],[0,0,314333.4718146,0,348624.880268064,39705280.65026528],
] as const;

const months = rows.map(([projectCosts, loanFee, grossInterest, totalDebtDraw, operatingCashFlow, repayment], index) => ({
  month: addMonths("2025-12", index), projectCosts, loanFee, grossInterest, totalDebtDraw, operatingCashFlow, repayment,
}));

export const APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE = {
  source,
  months,
  forwardSalePeriod: {
    startMonth: "2029-09", endMonth: "2030-08", monthCount: 12,
    effectiveGrossRevenue: 7_183_351.602226562,
    operatingExpenses: 2_887_167.1258111624,
  },
  plan,
  fullModelInput: { ...APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE.fullModelInput, ...plan } as PropertyReturnsInputs,
  expected: {
    sale: {
      forwardNetOperatingIncome: 4_296_184.476415399,
      grossSaleValue: 74_716_251.76374607,
      sellingCosts: 1_120_743.776456191,
      netSaleProceeds: 73_595_507.98728988,
      debtPayoff: 39_705_280.65026528,
      equitySaleProceeds: 33_890_227.3370246,
    },
    unlevered: { xirr: 0.1213574588298798, equityMultiple: 1.416994793819241, netProfit: 23_489_632.59150628 },
    levered: { xirr: 0.1467147290706635, equityMultiple: 1.612256254714846, netProfit: 13_089_945.14686823 },
    yieldOnCost: 0.070331103995619,
    developmentSpreadBasisPoints: 128.3110399561897,
  },
  tolerances: { usd: 0.02, ratio: 1e-8 },
} as const;

function addMonths(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}
