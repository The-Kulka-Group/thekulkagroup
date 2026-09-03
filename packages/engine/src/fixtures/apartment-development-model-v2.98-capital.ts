import operationsFixture from "./apartment-development-model-v2.98-operations.json";
import type {
  DevelopmentCapitalInputs,
  DevelopmentCapitalPlan,
  MonthlyDevelopmentCashFlow,
} from "../development-capital";

const source = {
  file: "Apartment-Development-Model_v2.98-lbbejt.xlsm",
  sha256: "3481af2b91836bdbb7603a60246aa0f8c0c3ea6654311252f5df40760ff2a280",
  workbookVersion: "v2.98",
  basis: "Saved Excel calculation results from Underwriting rows 48, 52 through 58, and 65 through 71.",
  warning: "These values are a test fixture. They are not Kulka defaults or approved business rules.",
  mapping: "The debt share records the workbook actual share after its Goal Seek run, 64.99991417777832 percent, rather than changing it to the displayed 65 percent.",
} as const;

const projectCosts = [
  8_230_000, 670_271.56, 820_071.36, 1_117_145.73, 1_634_596.66, 2_420_284.85,
  3_447_164.81, 4_149_054.92, 5_136_966.13, 5_718_724.98, 5_718_724.98,
  5_136_966.13, 4_149_054.92, 3_020_864.81, 1_993_984.85, 1_208_296.66,
  715_845.73, 418_771.36, 268_971.56,
] as const;

const operatingCashFlow = [
  -142_103.74, -106_533.82, -70_963.91, -35_393.99, 175.93, 35_745.84, 71_315.76,
  106_885.68, 142_455.59, 178_025.51, 213_595.43, 249_165.34, 261_751.38, 299_865.51,
  314_333.47,
] as const;

const evidence = (sourceLabel: string) => ({
  sourceLabel,
  sourceDate: "2026-09-02",
  reviewState: "done" as const,
});

const plan: DevelopmentCapitalPlan = {
  capitalInputVersion: "development_capital_inputs.v1",
  targetDebtSharePercent: 64.99991417777832,
  annualInterestRatePercent: 9.5,
  loanFeePercent: 0,
  fundingOrder: "equity_first.v1",
  interestTreatment: "capitalized_net_operating_cash.v1",
  interestConvention: "opening_balance_monthly.v1",
  feeMonth: "2025-12",
  payoffMonth: "2029-09",
  capitalAssumptionEvidence: {
    targetDebtSharePercent: evidence("Workbook actual debt share: Underwriting I57 divided by I53"),
    annualInterestRatePercent: evidence("Workbook construction rate: Underwriting E61"),
    loanFeePercent: evidence("Workbook financing fees: Underwriting I49"),
    fundingOrder: evidence("Workbook funding order: Underwriting D56 and D57"),
    interestTreatment: evidence("Workbook interest reserve and lease-up offset: Underwriting rows 54, 57, and 58"),
    interestConvention: evidence("Workbook opening-balance monthly interest formulas: Underwriting row 57"),
    feeMonth: evidence("No fee applies in the workbook fixture"),
    payoffMonth: evidence("Workbook construction debt payoff month: Underwriting E71"),
  },
};

const monthlyCashFlow: MonthlyDevelopmentCashFlow[] = Array.from({ length: 46 }, (_, index) => ({
  month: addMonths("2025-12", index),
  projectCosts: projectCosts[index] ?? 0,
  operatingCashFlow: index < 19 ? 0 : operatingCashFlow[index - 19] ?? 314_333.47,
}));

const fullModelPlan: DevelopmentCapitalPlan = {
  ...plan,
  feeMonth: "2024-07",
  payoffMonth: "2028-02",
};

export const APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE = {
  source,
  monthlyCashFlow,
  plan,
  fullModelInput: {
    ...operationsFixture.inputs,
    ...fullModelPlan,
  } as DevelopmentCapitalInputs,
  expected: {
    equity: 21_379_847.157241,
    debtBeforeReserves: 34_595_914.842759006,
    interestReserve: 4_754_370.350403402,
    operatingShortfallReserve: 354_995.4571028643,
    totalDebt: 39_705_280.65026528,
    totalUses: 61_085_127.80750626,
  },
  toleranceUsd: 0.02,
} as const;

function addMonths(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}
