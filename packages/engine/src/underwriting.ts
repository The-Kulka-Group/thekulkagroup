export const UNDERWRITING_FORMULA_VERSION = "underwriting.preliminary_annual.v1" as const;

export type UnderwritingInputKey =
  | "grossBuildingSquareFeet"
  | "proposedUnits"
  | "purchasePrice"
  | "monthlyRent"
  | "hardCostPerGrossSquareFoot"
  | "softCostPercent"
  | "contingencyPercent"
  | "vacancyPercent"
  | "operatingExpensePercent"
  | "debtPercent"
  | "interestRatePercent"
  | "exitCapRatePercent";

export type PreliminaryUnderwritingInputs = Partial<Record<UnderwritingInputKey, number>>;

export type UnderwritingIssue = {
  inputKey: UnderwritingInputKey | "totalDevelopmentCost" | "derivedResults";
  code: "missing" | "not_finite" | "negative" | "must_be_positive" | "percent_out_of_range";
  message: string;
};

export type UnderwritingResultKey =
  | "hardCost"
  | "softCost"
  | "contingency"
  | "totalDevelopmentCost"
  | "grossRevenue"
  | "effectiveGrossRevenue"
  | "operatingExpenses"
  | "netOperatingIncome"
  | "exitValue"
  | "developmentMargin"
  | "yieldOnCost"
  | "loanAmount"
  | "equityRequired"
  | "annualDebtInterestEstimate";

export type UnderwritingResult = {
  key: UnderwritingResultKey;
  label: string;
  value: number;
  unit: "usd" | "decimal";
  formula: string;
  inputKeys: UnderwritingInputKey[];
};

export type PreliminaryUnderwritingRun = {
  formulaVersion: typeof UNDERWRITING_FORMULA_VERSION;
  inputSnapshot: PreliminaryUnderwritingInputs;
  status: "complete" | "failed";
  issues: UnderwritingIssue[];
  results: UnderwritingResult[];
};

const LABELS: Record<UnderwritingInputKey, string> = {
  grossBuildingSquareFeet: "Gross building area",
  proposedUnits: "Proposed units",
  purchasePrice: "Purchase price",
  monthlyRent: "Average monthly rent",
  hardCostPerGrossSquareFoot: "Hard cost per gross square foot",
  softCostPercent: "Soft cost percent",
  contingencyPercent: "Contingency percent",
  vacancyPercent: "Vacancy percent",
  operatingExpensePercent: "Operating expense percent",
  debtPercent: "Debt percent",
  interestRatePercent: "Interest rate percent",
  exitCapRatePercent: "Exit cap rate",
};

const REQUIRED: UnderwritingInputKey[] = Object.keys(LABELS) as UnderwritingInputKey[];
const POSITIVE: UnderwritingInputKey[] = [
  "grossBuildingSquareFeet",
  "proposedUnits",
  "monthlyRent",
  "hardCostPerGrossSquareFoot",
  "debtPercent",
  "interestRatePercent",
  "exitCapRatePercent",
];
const PERCENTS: UnderwritingInputKey[] = [
  "softCostPercent",
  "contingencyPercent",
  "vacancyPercent",
  "operatingExpensePercent",
  "debtPercent",
  "interestRatePercent",
  "exitCapRatePercent",
];

export function computePreliminaryUnderwriting(
  input: PreliminaryUnderwritingInputs,
): PreliminaryUnderwritingRun {
  const inputSnapshot = { ...input };
  const issues = validate(inputSnapshot);
  if (issues.length > 0) return failed(inputSnapshot, issues);

  const values = inputSnapshot as Required<PreliminaryUnderwritingInputs>;
  const hardCost = values.grossBuildingSquareFeet * values.hardCostPerGrossSquareFoot;
  const softCost = hardCost * decimal(values.softCostPercent);
  const contingency = hardCost * decimal(values.contingencyPercent);
  const totalDevelopmentCost = values.purchasePrice + hardCost + softCost + contingency;
  if (![hardCost, softCost, contingency, totalDevelopmentCost].every(Number.isFinite)) {
    return failed(inputSnapshot, [derivedRangeIssue()]);
  }
  if (!(totalDevelopmentCost > 0)) {
    return failed(inputSnapshot, [{
      inputKey: "totalDevelopmentCost",
      code: "must_be_positive",
      message: "Total development cost must be greater than zero.",
    }]);
  }

  const grossRevenue = values.proposedUnits * values.monthlyRent * 12;
  const effectiveGrossRevenue = grossRevenue * (1 - decimal(values.vacancyPercent));
  const operatingExpenses = effectiveGrossRevenue * decimal(values.operatingExpensePercent);
  const netOperatingIncome = effectiveGrossRevenue - operatingExpenses;
  const exitValue = netOperatingIncome / decimal(values.exitCapRatePercent);
  const developmentMargin = (exitValue - totalDevelopmentCost) / totalDevelopmentCost;
  const yieldOnCost = netOperatingIncome / totalDevelopmentCost;
  const loanAmount = totalDevelopmentCost * decimal(values.debtPercent);
  const equityRequired = totalDevelopmentCost - loanAmount;
  const annualDebtInterestEstimate = loanAmount * decimal(values.interestRatePercent);

  const results = [
    result("hardCost", "Hard cost", hardCost, "usd", "gross building area × hard cost per GSF", ["grossBuildingSquareFeet", "hardCostPerGrossSquareFoot"]),
    result("softCost", "Soft cost", softCost, "usd", "hard cost × soft cost percent", ["grossBuildingSquareFeet", "hardCostPerGrossSquareFoot", "softCostPercent"]),
    result("contingency", "Contingency", contingency, "usd", "hard cost × contingency percent", ["grossBuildingSquareFeet", "hardCostPerGrossSquareFoot", "contingencyPercent"]),
    result("totalDevelopmentCost", "Total development cost", totalDevelopmentCost, "usd", "purchase price + hard cost + soft cost + contingency", ["purchasePrice", "grossBuildingSquareFeet", "hardCostPerGrossSquareFoot", "softCostPercent", "contingencyPercent"]),
    result("grossRevenue", "Gross annual revenue", grossRevenue, "usd", "proposed units × average monthly rent × 12", ["proposedUnits", "monthlyRent"]),
    result("effectiveGrossRevenue", "Effective gross revenue", effectiveGrossRevenue, "usd", "gross annual revenue × (1 - vacancy percent)", ["proposedUnits", "monthlyRent", "vacancyPercent"]),
    result("operatingExpenses", "Operating expenses", operatingExpenses, "usd", "effective gross revenue × operating expense percent", ["proposedUnits", "monthlyRent", "vacancyPercent", "operatingExpensePercent"]),
    result("netOperatingIncome", "Net operating income", netOperatingIncome, "usd", "effective gross revenue - operating expenses", ["proposedUnits", "monthlyRent", "vacancyPercent", "operatingExpensePercent"]),
    result("exitValue", "Stabilized value estimate", exitValue, "usd", "same-period annual net operating income ÷ exit cap rate", ["proposedUnits", "monthlyRent", "vacancyPercent", "operatingExpensePercent", "exitCapRatePercent"]),
    result("developmentMargin", "Development margin", developmentMargin, "decimal", "(stabilized value estimate - total development cost) ÷ total development cost", ["purchasePrice", "grossBuildingSquareFeet", "hardCostPerGrossSquareFoot", "softCostPercent", "contingencyPercent", "proposedUnits", "monthlyRent", "vacancyPercent", "operatingExpensePercent", "exitCapRatePercent"]),
    result("yieldOnCost", "Yield on cost", yieldOnCost, "decimal", "net operating income ÷ total development cost", ["purchasePrice", "grossBuildingSquareFeet", "hardCostPerGrossSquareFoot", "softCostPercent", "contingencyPercent", "proposedUnits", "monthlyRent", "vacancyPercent", "operatingExpensePercent"]),
    result("loanAmount", "Loan amount", loanAmount, "usd", "total development cost × debt percent", ["purchasePrice", "grossBuildingSquareFeet", "hardCostPerGrossSquareFoot", "softCostPercent", "contingencyPercent", "debtPercent"]),
    result("equityRequired", "Equity required", equityRequired, "usd", "total development cost - loan amount", ["purchasePrice", "grossBuildingSquareFeet", "hardCostPerGrossSquareFoot", "softCostPercent", "contingencyPercent", "debtPercent"]),
    result("annualDebtInterestEstimate", "Full-balance annual interest estimate", annualDebtInterestEstimate, "usd", "full loan amount × annual interest rate percent", ["purchasePrice", "grossBuildingSquareFeet", "hardCostPerGrossSquareFoot", "softCostPercent", "contingencyPercent", "debtPercent", "interestRatePercent"]),
  ];
  if (results.some(({ value }) => !Number.isFinite(value))) {
    return failed(inputSnapshot, [derivedRangeIssue()]);
  }

  return {
    formulaVersion: UNDERWRITING_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    results,
  };
}

function validate(input: PreliminaryUnderwritingInputs) {
  const issues: UnderwritingIssue[] = [];
  for (const key of REQUIRED) {
    const value = input[key];
    if (value === undefined) {
      issues.push({ inputKey: key, code: "missing", message: `${LABELS[key]} is required.` });
      continue;
    }
    if (!Number.isFinite(value)) {
      issues.push({ inputKey: key, code: "not_finite", message: `${LABELS[key]} must be a finite number.` });
      continue;
    }
    if (value < 0) {
      issues.push({ inputKey: key, code: "negative", message: `${LABELS[key]} cannot be negative.` });
      continue;
    }
    if (POSITIVE.includes(key) && value === 0) {
      issues.push({ inputKey: key, code: "must_be_positive", message: `${LABELS[key]} must be greater than zero.` });
      continue;
    }
    if (PERCENTS.includes(key) && value > 100) {
      issues.push({ inputKey: key, code: "percent_out_of_range", message: `${LABELS[key]} must be between 0 and 100 percent.` });
    }
  }
  return issues;
}

function decimal(percent: number) {
  return percent / 100;
}

function derivedRangeIssue(): UnderwritingIssue {
  return {
    inputKey: "derivedResults",
    code: "not_finite",
    message: "A derived result is outside the supported numeric range.",
  };
}

function result(
  key: UnderwritingResultKey,
  label: string,
  value: number,
  unit: UnderwritingResult["unit"],
  formula: string,
  inputKeys: UnderwritingInputKey[],
): UnderwritingResult {
  return { key, label, value, unit, formula, inputKeys: [...inputKeys] };
}

function failed(
  inputSnapshot: PreliminaryUnderwritingInputs,
  issues: UnderwritingIssue[],
): PreliminaryUnderwritingRun {
  return {
    formulaVersion: UNDERWRITING_FORMULA_VERSION,
    inputSnapshot,
    status: "failed",
    issues,
    results: [],
  };
}
