import {
  S_CURVE_DISTRIBUTION_VERSION,
  STRAIGHT_LINE_DISTRIBUTION_VERSION,
  type MonthlyCostScheduleInputs,
} from "../monthly-cost-schedule";

export const APARTMENT_DEVELOPMENT_V2_98_SOURCE = {
  file: "Apartment-Development-Model_v2.98-lbbejt.xlsm",
  sha256: "3481af2b91836bdbb7603a60246aa0f8c0c3ea6654311252f5df40760ff2a280",
  workbookVersion: "v2.98",
  audit: "docs/underwriting-model-audit/README.md",
  formulaMap: "docs/underwriting-model-audit/formula-map.csv",
  basis: "Saved Excel calculation results and audited workbook cells",
  warning: "These values are test fixtures. They are not Kulka defaults or approved business rules.",
} as const;

export const APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS = {
  land: { source: "Underwriting!I29", expected: 8_230_000 },
  hardCost: { source: "Underwriting!I35", expected: 42_630_000 },
  developmentFee: { source: "Underwriting!I42", expected: 1_630_362 },
  softCostIncludingDevelopmentFee: { source: "Underwriting!I43", expected: 5_115_762 },
  projectCostBeforeFinancing: { source: "Underwriting!I45", expected: 55_975_762 },
} as const;

export const APARTMENT_DEVELOPMENT_V2_98_COST_SCHEDULE: MonthlyCostScheduleInputs = {
  analysisStartMonth: "2026-01",
  saleMonth: "2029-09",
  costLines: [
    workbookLine("land-costs", "Land Costs", "land", 7_990_000, "2026-01", "2026-01", "straight_line", "Underwriting!D26:I26"),
    workbookLine("closing-costs", "Closing Costs", "land", 240_000, "2026-01", "2026-01", "straight_line", "Underwriting!D27:I27"),
    workbookLine("construction-costs", "Construction Costs", "hard_cost", 42_000_000, "2026-02", "2027-07", "s_curve", "Underwriting!D32:I32"),
    workbookLine("other-hard-costs", "Other Hard Costs", "hard_cost", 630_000, "2026-02", "2027-07", "s_curve", "Underwriting!D33:I33"),
    workbookLine("architecture-engineering", "Architecture & Engineering", "soft_cost", 2_557_800, "2026-02", "2026-07", "straight_line", "Underwriting!D38:I38"),
    workbookLine("construction-management", "Construction Management", "soft_cost", 852_600, "2026-02", "2027-07", "straight_line", "Underwriting!D39:I39"),
    workbookLine("marketing-leasing", "Marketing and Leasing", "soft_cost", 75_000, "2027-05", "2027-07", "straight_line", "Underwriting!D40:I40"),
    workbookLine("development-fee", "Development Fee", "development_fee", 1_630_362, "2026-02", "2027-07", "straight_line", "Underwriting!D42:I42"),
  ],
};

function workbookLine(
  id: string,
  name: string,
  category: "land" | "hard_cost" | "soft_cost" | "development_fee",
  amount: number,
  startMonth: string,
  endMonth: string,
  distributionMethod: "straight_line" | "s_curve",
  sourceCell: string,
) {
  return {
    id,
    name,
    category,
    amount,
    unit: "usd" as const,
    startMonth,
    endMonth,
    distributionMethod,
    distributionVersion: distributionMethod === "straight_line"
      ? STRAIGHT_LINE_DISTRIBUTION_VERSION
      : S_CURVE_DISTRIBUTION_VERSION,
    sourceLabel: `${APARTMENT_DEVELOPMENT_V2_98_SOURCE.file}, ${sourceCell}`,
    reviewState: "done" as const,
  };
}
