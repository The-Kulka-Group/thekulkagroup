import {
  computeMonthlyCostSchedule,
  type MonthlyCostIssueCode,
  type MonthlyCostScheduleInputs,
  type MonthlyCostScheduleResult,
  type ReconciliationCheck,
} from "./monthly-cost-schedule";

export const APARTMENT_OPERATIONS_INPUT_VERSION = "apartment_operations_inputs.v1" as const;
export const APARTMENT_OPERATIONS_FORMULA_VERSION = "underwriting.apartment_operations.v1" as const;

type ReviewState = "working" | "done";

export const APARTMENT_OPERATIONS_ASSUMPTION_KEYS = [
  "operationStartMonth",
  "growthStartMonth",
  "preleasedUnits",
  "leaseUpUnitsPerMonth",
  "annualIncomeGrowthPercent",
  "annualExpenseGrowthPercent",
  "rentAdjustmentLossPercent",
  "freeRentPercent",
  "vacancyPercent",
  "creditLossPercent",
] as const;

export type ApartmentOperationsAssumptionKey = typeof APARTMENT_OPERATIONS_ASSUMPTION_KEYS[number];

export type ApartmentOperationsAssumptionEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

type SourcedLine = {
  id: string;
  name: string;
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

export type ResidentialUnitType = SourcedLine & {
  units: number;
  nonRevenueUnits: number;
  averageAreaSf: number;
  monthlyMarketRent: number;
};

export type OtherIncomeLine = SourcedLine & {
  amount: number;
  unit: "usd_per_year" | "usd_per_occupied_unit_month";
};

export type OperatingExpenseLine = SourcedLine & {
  amount: number;
  unit: "usd_per_year" | "usd_per_unit_year" | "percent_effective_gross_revenue";
};

export type CapitalExpenditureLine = SourcedLine & {
  amount: number;
  unit: "usd_per_year" | "usd_per_unit_year";
};

export type ApartmentOperationsInputs = MonthlyCostScheduleInputs & {
  inputVersion: typeof APARTMENT_OPERATIONS_INPUT_VERSION;
  operationStartMonth: string;
  growthStartMonth: string;
  preleasedUnits: number;
  leaseUpUnitsPerMonth: number;
  annualIncomeGrowthPercent: number;
  annualExpenseGrowthPercent: number;
  rentAdjustmentLossPercent: number;
  freeRentPercent: number;
  vacancyPercent: number;
  creditLossPercent: number;
  assumptionEvidence: Record<ApartmentOperationsAssumptionKey, ApartmentOperationsAssumptionEvidence>;
  residentialUnitTypes: ResidentialUnitType[];
  otherIncomeLines: OtherIncomeLine[];
  operatingExpenseLines: OperatingExpenseLine[];
  capitalExpenditureLines: CapitalExpenditureLine[];
};

export type ApartmentOperationsIssueCode = MonthlyCostIssueCode
  | "unsupported_input_version"
  | "outside_timeline"
  | "invalid_units"
  | "invalid_percent"
  | "invalid_amount"
  | "invalid_month"
  | "missing_lines"
  | "missing_text"
  | "duplicate_id"
  | "unsupported_unit"
  | "invalid_source_date"
  | "invalid_review_state"
  | "derived_results";

export type ApartmentOperationsIssue = {
  path: string;
  code: ApartmentOperationsIssueCode;
  message: string;
};

export type OperationsFormulaTrace = {
  key: keyof ApartmentOperationsTotals | "monthlyLeaseUp";
  label: string;
  formula: string;
  inputPaths: string[];
};

export type MonthlyApartmentOperations = {
  month: string;
  totalUses: number;
  revenueUnits: number;
  leasedUnits: number;
  occupiedUnits: number;
  leaseUpPercent: number;
  residentialGrossRent: number;
  nonRevenueRentAdjustment: number;
  leaseUpLoss: number;
  rentAdjustmentLoss: number;
  freeRentLoss: number;
  totalResidentialRent: number;
  otherIncome: number;
  totalPotentialIncome: number;
  vacancyLoss: number;
  creditLoss: number;
  effectiveGrossRevenue: number;
  operatingExpenses: number;
  netOperatingIncome: number;
  capitalExpenditures: number;
  operatingCashFlow: number;
};

export type ApartmentOperationsTotals = Omit<MonthlyApartmentOperations,
  "month" | "revenueUnits" | "leasedUnits" | "occupiedUnits" | "leaseUpPercent" | "totalUses">;

export type ApartmentOperationsResult = {
  costSchedule: MonthlyCostScheduleResult;
  unitSummary: {
    totalUnits: number;
    revenueUnits: number;
    nonRevenueUnits: number;
    totalAreaSf: number;
  };
  months: MonthlyApartmentOperations[];
  totals: ApartmentOperationsTotals;
  firstStabilizedMonth?: string;
  formulaTraces: OperationsFormulaTrace[];
};

export type ApartmentOperationsRun = {
  formulaVersion: typeof APARTMENT_OPERATIONS_FORMULA_VERSION;
  inputSnapshot: ApartmentOperationsInputs;
  status: "complete" | "failed";
  issues: ApartmentOperationsIssue[];
  result: ApartmentOperationsResult | null;
  reconciliations: ReconciliationCheck[];
};

const OTHER_INCOME_UNITS = ["usd_per_year", "usd_per_occupied_unit_month"];
const OPERATING_EXPENSE_UNITS = ["usd_per_year", "usd_per_unit_year", "percent_effective_gross_revenue"];
const CAPITAL_EXPENDITURE_UNITS = ["usd_per_year", "usd_per_unit_year"];

export function computeApartmentOperations(input: ApartmentOperationsInputs): ApartmentOperationsRun {
  const inputSnapshot = structuredClone(input);
  const costRun = computeMonthlyCostSchedule(inputSnapshot);
  const issues = validate(inputSnapshot);
  if (costRun.status === "failed") {
    issues.unshift(...costRun.issues.map((item) => ({ ...item })));
  }
  if (issues.length > 0 || !costRun.result) return failed(inputSnapshot, issues);

  const result = calculate(inputSnapshot, costRun.result);
  if (!result || !resultNumbersAreSafe(result)) {
    return failed(inputSnapshot, [{
      path: "operations",
      code: "derived_results",
      message: "The monthly operating result is outside the supported numeric range.",
    }]);
  }
  const reconciliations = [
    ...costRun.reconciliations,
    ...operationReconciliations(inputSnapshot, result),
  ];
  if (reconciliations.some(({ status }) => status === "fail")) {
    return failed(inputSnapshot, [{
      path: "operations",
      code: "derived_results",
      message: "The monthly operating cash flow did not reconcile to its parts.",
    }]);
  }
  return {
    formulaVersion: APARTMENT_OPERATIONS_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    result,
    reconciliations,
  };
}

function validate(input: ApartmentOperationsInputs) {
  const issues: ApartmentOperationsIssue[] = [];
  if (input.inputVersion !== APARTMENT_OPERATIONS_INPUT_VERSION) {
    addIssue(issues, "inputVersion", "unsupported_input_version", `Use ${APARTMENT_OPERATIONS_INPUT_VERSION}.`);
  }
  const operation = monthIndex(input.operationStartMonth);
  const growthStart = monthIndex(input.growthStartMonth);
  const analysis = monthIndex(input.analysisStartMonth);
  const sale = monthIndex(input.saleMonth);
  if (operation === null) {
    addIssue(issues, "operationStartMonth", "invalid_month", "Operation start month must use YYYY-MM.");
  } else if (analysis !== null && sale !== null && (operation < analysis || operation > sale)) {
    addIssue(issues, "operationStartMonth", "outside_timeline", "Operation start month must stay within the analysis timeline.");
  }
  if (growthStart === null) {
    addIssue(issues, "growthStartMonth", "invalid_month", "Growth start month must use YYYY-MM.");
  } else if (analysis !== null && sale !== null && (growthStart < analysis || growthStart > sale)) {
    addIssue(issues, "growthStartMonth", "outside_timeline", "Growth start month must stay within the analysis timeline.");
  }
  validateWholeNumber(issues, "preleasedUnits", input.preleasedUnits, true);
  validateWholeNumber(issues, "leaseUpUnitsPerMonth", input.leaseUpUnitsPerMonth, false);
  for (const key of ["annualIncomeGrowthPercent", "annualExpenseGrowthPercent", "rentAdjustmentLossPercent", "freeRentPercent", "vacancyPercent", "creditLossPercent"] as const) {
    if (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > 100) {
      addIssue(issues, key, "invalid_percent", `${labelFor(key)} must be from 0 to 100 percent.`);
    }
  }
  validateAssumptionEvidence(issues, input.assumptionEvidence);

  if (!Array.isArray(input.residentialUnitTypes) || input.residentialUnitTypes.length === 0) {
    addIssue(issues, "residentialUnitTypes", "missing_lines", "Add at least one residential unit type.");
  } else {
    validateSourcedLines(issues, input.residentialUnitTypes, "residentialUnitTypes");
    input.residentialUnitTypes.forEach((line, index) => {
      validateWholeNumber(issues, `residentialUnitTypes.${index}.units`, line.units, false);
      validateWholeNumber(issues, `residentialUnitTypes.${index}.nonRevenueUnits`, line.nonRevenueUnits, true);
      validateArea(issues, `residentialUnitTypes.${index}.averageAreaSf`, line.averageAreaSf);
      if (Number.isSafeInteger(line.units) && Number.isSafeInteger(line.nonRevenueUnits) && line.nonRevenueUnits > line.units) {
        addIssue(issues, `residentialUnitTypes.${index}.nonRevenueUnits`, "invalid_units", "Non-revenue units cannot exceed this unit type's units.");
      }
      validateMoney(issues, `residentialUnitTypes.${index}.monthlyMarketRent`, line.monthlyMarketRent, false);
    });
    const totalUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.units, 0);
    const revenueUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.units - line.nonRevenueUnits, 0);
    if (Number.isFinite(input.preleasedUnits) && input.preleasedUnits > revenueUnits) {
      addIssue(issues, "preleasedUnits", "invalid_units", "Pre-leased units cannot exceed revenue units.");
    }
    if (!Number.isSafeInteger(totalUnits) || totalUnits <= 0 || revenueUnits <= 0) {
      addIssue(issues, "residentialUnitTypes", "invalid_units", "Residential unit types must include at least one revenue unit.");
    }
  }

  validateMoneyLines(issues, input.otherIncomeLines, "otherIncomeLines", OTHER_INCOME_UNITS);
  validateMoneyLines(issues, input.operatingExpenseLines, "operatingExpenseLines", OPERATING_EXPENSE_UNITS);
  validateMoneyLines(issues, input.capitalExpenditureLines, "capitalExpenditureLines", CAPITAL_EXPENDITURE_UNITS);
  return issues;
}

function validateAssumptionEvidence(
  issues: ApartmentOperationsIssue[],
  evidence: Record<ApartmentOperationsAssumptionKey, ApartmentOperationsAssumptionEvidence>,
) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    addIssue(issues, "assumptionEvidence", "missing_lines", "Add source and review details for the operating assumptions.");
    return;
  }
  for (const key of APARTMENT_OPERATIONS_ASSUMPTION_KEYS) {
    const item = evidence[key];
    const path = `assumptionEvidence.${key}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      addIssue(issues, path, "missing_lines", `${labelFor(key)} needs source and review details.`);
      continue;
    }
    if (item.sourceDate !== undefined && !validDate(item.sourceDate)) {
      addIssue(issues, `${path}.sourceDate`, "invalid_source_date", "Source date must be a valid YYYY-MM-DD date.");
    }
    if (item.reviewState !== "working" && item.reviewState !== "done") {
      addIssue(issues, `${path}.reviewState`, "invalid_review_state", "Review state must be Working on it or Done.");
    }
  }
}

function validateWholeNumber(issues: ApartmentOperationsIssue[], path: string, value: number, allowZero: boolean) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    addIssue(issues, path, "invalid_units", `${labelFor(path)} must be ${allowZero ? "zero or a positive" : "a positive"} whole number.`);
  }
}

function validateMoneyLines(
  issues: ApartmentOperationsIssue[],
  lines: Array<SourcedLine & { amount: number; unit: string }>,
  path: string,
  units: string[],
) {
  if (!Array.isArray(lines)) {
    addIssue(issues, path, "missing_lines", `${labelFor(path)} must be an array.`);
    return;
  }
  validateSourcedLines(issues, lines, path);
  lines.forEach((line, index) => {
    validateMoney(issues, `${path}.${index}.amount`, line.amount, true);
    if (!units.includes(line.unit)) {
      addIssue(issues, `${path}.${index}.unit`, "unsupported_unit", `${labelFor(path)} unit is not supported.`);
    }
    if (line.unit === "percent_effective_gross_revenue" && line.amount > 100) {
      addIssue(issues, `${path}.${index}.amount`, "invalid_percent", "Expense percent must be from 0 to 100 percent.");
    }
  });
}

function validateSourcedLines(issues: ApartmentOperationsIssue[], lines: SourcedLine[], path: string) {
  const ids = new Set<string>();
  lines.forEach((line, index) => {
    const linePath = `${path}.${index}`;
    if (!line || typeof line !== "object") {
      addIssue(issues, linePath, "missing_text", "Line must be an object.");
      return;
    }
    if (typeof line.id !== "string" || line.id.trim() === "") {
      addIssue(issues, `${linePath}.id`, "missing_text", "Line ID is required.");
    } else if (ids.has(line.id)) {
      addIssue(issues, `${linePath}.id`, "duplicate_id", "Line IDs must be unique within this section.");
    } else {
      ids.add(line.id);
    }
    if (typeof line.name !== "string" || line.name.trim() === "") {
      addIssue(issues, `${linePath}.name`, "missing_text", "Line name is required.");
    }
    if (line.sourceDate !== undefined && !validDate(line.sourceDate)) {
      addIssue(issues, `${linePath}.sourceDate`, "invalid_source_date", "Source date must be a valid YYYY-MM-DD date.");
    }
    if (line.reviewState !== "working" && line.reviewState !== "done") {
      addIssue(issues, `${linePath}.reviewState`, "invalid_review_state", "Review state must be Working on it or Done.");
    }
  });
}

function validateMoney(issues: ApartmentOperationsIssue[], path: string, value: number, allowZero: boolean) {
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 0.01) || !Number.isSafeInteger(cents) || Math.abs(value - cents / 100) > 1e-9) {
    addIssue(issues, path, "invalid_amount", `${labelFor(path)} must be ${allowZero ? "zero or " : ""}a positive amount with no more than two decimal places.`);
  }
}

function validateArea(issues: ApartmentOperationsIssue[], path: string, value: number) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value * 100))) {
    addIssue(issues, path, "invalid_units", `${labelFor(path)} must be a positive area.`);
  }
}

function calculate(input: ApartmentOperationsInputs, costSchedule: MonthlyCostScheduleResult): ApartmentOperationsResult {
  const operationStart = monthIndex(input.operationStartMonth)!;
  const growthStart = monthIndex(input.growthStartMonth)!;
  const totalUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.units, 0);
  const nonRevenueUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.nonRevenueUnits, 0);
  const revenueUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.units - line.nonRevenueUnits, 0);
  const totalAreaSf = input.residentialUnitTypes.reduce((sum, line) => sum + line.averageAreaSf * line.units, 0);

  let potentialIncomeYearToDate = 0;
  let vacancyLossYearToDate = 0;
  let creditLossYearToDate = 0;

  const months = costSchedule.months.map((costMonth) => {
    const operationOffset = monthIndex(costMonth.month)! - operationStart;
    if (operationOffset < 0) return emptyMonth(costMonth.month, costMonth.totalUses);
    const currentMonth = monthIndex(costMonth.month)!;
    const incomeGrowthPeriods = annualGrowthPeriods(currentMonth, growthStart);
    const expenseGrowthPeriods = annualGrowthPeriods(currentMonth, growthStart);
    const leasedUnits = Math.min(
      revenueUnits,
      input.preleasedUnits + input.leaseUpUnitsPerMonth * operationOffset,
    );
    const residentialGrossRent = input.residentialUnitTypes.reduce(
      (sum, line) => sum + grownCents(cents(line.monthlyMarketRent), input.annualIncomeGrowthPercent, incomeGrowthPeriods) * line.units,
      0,
    );
    const nonRevenueRentAdjustment = -input.residentialUnitTypes.reduce(
      (sum, line) => sum + grownCents(cents(line.monthlyMarketRent), input.annualIncomeGrowthPercent, incomeGrowthPeriods) * line.nonRevenueUnits,
      0,
    );
    const revenueRentCents = residentialGrossRent + nonRevenueRentAdjustment;
    const leaseUpLoss = -Math.round(revenueRentCents * (revenueUnits - leasedUnits) / revenueUnits);
    const occupiedResidentialRent = residentialGrossRent + nonRevenueRentAdjustment + leaseUpLoss;
    const rentAdjustmentLoss = -percentOf(occupiedResidentialRent, input.rentAdjustmentLossPercent);
    const freeRentLoss = -percentOf(occupiedResidentialRent, input.freeRentPercent);
    const totalResidentialRent = occupiedResidentialRent + rentAdjustmentLoss + freeRentLoss;
    const otherIncome = input.otherIncomeLines.reduce((sum, line) => sum + lineAmountCents(
      line.amount,
      line.unit,
      operationOffset,
      leasedUnits,
      totalUnits,
      0,
      input.annualIncomeGrowthPercent,
      incomeGrowthPeriods,
    ), 0);
    const totalPotentialIncome = totalResidentialRent + otherIncome;
    if (operationOffset % 12 === 0) {
      potentialIncomeYearToDate = 0;
      vacancyLossYearToDate = 0;
      creditLossYearToDate = 0;
    }
    potentialIncomeYearToDate += totalPotentialIncome;
    const cumulativeVacancyLoss = percentOf(potentialIncomeYearToDate, input.vacancyPercent);
    const cumulativeCreditLoss = percentOf(potentialIncomeYearToDate, input.creditLossPercent);
    const vacancyLoss = -(cumulativeVacancyLoss - vacancyLossYearToDate);
    const creditLoss = -(cumulativeCreditLoss - creditLossYearToDate);
    vacancyLossYearToDate = cumulativeVacancyLoss;
    creditLossYearToDate = cumulativeCreditLoss;
    const effectiveGrossRevenue = totalPotentialIncome + vacancyLoss + creditLoss;
    const operatingExpenses = input.operatingExpenseLines.reduce((sum, line) => sum + lineAmountCents(
      line.amount,
      line.unit,
      operationOffset,
      leasedUnits,
      totalUnits,
      effectiveGrossRevenue,
      input.annualExpenseGrowthPercent,
      expenseGrowthPeriods,
    ), 0);
    const netOperatingIncome = effectiveGrossRevenue - operatingExpenses;
    const capitalExpenditures = input.capitalExpenditureLines.reduce((sum, line) => sum + lineAmountCents(
      line.amount,
      line.unit,
      operationOffset,
      leasedUnits,
      totalUnits,
      0,
      input.annualExpenseGrowthPercent,
      expenseGrowthPeriods,
    ), 0);
    const operatingCashFlow = netOperatingIncome - capitalExpenditures;
    return moneyMonth({
      month: costMonth.month,
      totalUses: costMonth.totalUses,
      revenueUnits,
      leasedUnits,
      occupiedUnits: leasedUnits,
      leaseUpPercent: leasedUnits / revenueUnits,
      residentialGrossRent,
      nonRevenueRentAdjustment,
      leaseUpLoss,
      rentAdjustmentLoss,
      freeRentLoss,
      totalResidentialRent,
      otherIncome,
      totalPotentialIncome,
      vacancyLoss,
      creditLoss,
      effectiveGrossRevenue,
      operatingExpenses,
      netOperatingIncome,
      capitalExpenditures,
      operatingCashFlow,
    });
  });
  const totals = totalOperations(months);
  return {
    costSchedule,
    unitSummary: { totalUnits, revenueUnits, nonRevenueUnits, totalAreaSf },
    months,
    totals,
    firstStabilizedMonth: months.find((month) => month.revenueUnits > 0 && month.leasedUnits === month.revenueUnits)?.month,
    formulaTraces: formulaTraces(),
  };
}

function lineAmountCents(
  amount: number,
  unit: string,
  operationOffset: number,
  leasedUnits: number,
  totalUnits: number,
  effectiveGrossRevenueCents: number,
  annualGrowthPercent: number,
  growthPeriods: number,
) {
  if (unit === "usd_per_occupied_unit_month") return grownCents(cents(amount), annualGrowthPercent, growthPeriods) * leasedUnits;
  if (unit === "usd_per_unit_year") return annualAllocation(grownCents(cents(amount), annualGrowthPercent, growthPeriods) * totalUnits, operationOffset);
  if (unit === "percent_effective_gross_revenue") return percentOf(effectiveGrossRevenueCents, amount);
  return annualAllocation(grownCents(cents(amount), annualGrowthPercent, growthPeriods), operationOffset);
}

function annualGrowthPeriods(month: number, growthStart: number) {
  return month < growthStart ? 0 : Math.floor((month - growthStart) / 12);
}

function grownCents(baseCents: number, annualPercent: number, periods: number) {
  return Math.round(baseCents * ((1 + annualPercent / 100) ** periods));
}

function annualAllocation(annualCents: number, operationOffset: number) {
  const position = operationOffset % 12;
  const prior = Math.round(annualCents * position / 12);
  const next = position === 11 ? annualCents : Math.round(annualCents * (position + 1) / 12);
  return next - prior;
}

function percentOf(baseCents: number, percent: number) {
  return Math.round(baseCents * percent / 100);
}

type MoneyMonthInput = Omit<MonthlyApartmentOperations,
  "totalUses" | "residentialGrossRent" | "nonRevenueRentAdjustment" | "leaseUpLoss" |
  "rentAdjustmentLoss" | "freeRentLoss" | "totalResidentialRent" | "otherIncome" |
  "totalPotentialIncome" | "vacancyLoss" | "creditLoss" | "effectiveGrossRevenue" |
  "operatingExpenses" | "netOperatingIncome" | "capitalExpenditures" | "operatingCashFlow"> & {
    totalUses: number;
    residentialGrossRent: number;
    nonRevenueRentAdjustment: number;
    leaseUpLoss: number;
    rentAdjustmentLoss: number;
    freeRentLoss: number;
    totalResidentialRent: number;
    otherIncome: number;
    totalPotentialIncome: number;
    vacancyLoss: number;
    creditLoss: number;
    effectiveGrossRevenue: number;
    operatingExpenses: number;
    netOperatingIncome: number;
    capitalExpenditures: number;
    operatingCashFlow: number;
  };

function moneyMonth(month: MoneyMonthInput): MonthlyApartmentOperations {
  return {
    ...month,
    residentialGrossRent: dollars(month.residentialGrossRent),
    nonRevenueRentAdjustment: dollars(month.nonRevenueRentAdjustment),
    leaseUpLoss: dollars(month.leaseUpLoss),
    rentAdjustmentLoss: dollars(month.rentAdjustmentLoss),
    freeRentLoss: dollars(month.freeRentLoss),
    totalResidentialRent: dollars(month.totalResidentialRent),
    otherIncome: dollars(month.otherIncome),
    totalPotentialIncome: dollars(month.totalPotentialIncome),
    vacancyLoss: dollars(month.vacancyLoss),
    creditLoss: dollars(month.creditLoss),
    effectiveGrossRevenue: dollars(month.effectiveGrossRevenue),
    operatingExpenses: dollars(month.operatingExpenses),
    netOperatingIncome: dollars(month.netOperatingIncome),
    capitalExpenditures: dollars(month.capitalExpenditures),
    operatingCashFlow: dollars(month.operatingCashFlow),
  };
}

function emptyMonth(month: string, totalUses: number): MonthlyApartmentOperations {
  return {
    month,
    totalUses,
    revenueUnits: 0,
    leasedUnits: 0,
    occupiedUnits: 0,
    leaseUpPercent: 0,
    residentialGrossRent: 0,
    nonRevenueRentAdjustment: 0,
    leaseUpLoss: 0,
    rentAdjustmentLoss: 0,
    freeRentLoss: 0,
    totalResidentialRent: 0,
    otherIncome: 0,
    totalPotentialIncome: 0,
    vacancyLoss: 0,
    creditLoss: 0,
    effectiveGrossRevenue: 0,
    operatingExpenses: 0,
    netOperatingIncome: 0,
    capitalExpenditures: 0,
    operatingCashFlow: 0,
  };
}

function totalOperations(months: MonthlyApartmentOperations[]): ApartmentOperationsTotals {
  const keys: Array<keyof ApartmentOperationsTotals> = [
    "residentialGrossRent", "nonRevenueRentAdjustment", "leaseUpLoss", "rentAdjustmentLoss",
    "freeRentLoss", "totalResidentialRent", "otherIncome", "totalPotentialIncome", "vacancyLoss",
    "creditLoss", "effectiveGrossRevenue", "operatingExpenses", "netOperatingIncome",
    "capitalExpenditures", "operatingCashFlow",
  ];
  return Object.fromEntries(keys.map((key) => [
    key,
    dollars(months.reduce((sum, month) => sum + cents(month[key]), 0)),
  ])) as ApartmentOperationsTotals;
}

function operationReconciliations(input: ApartmentOperationsInputs, result: ApartmentOperationsResult) {
  const enteredUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.units, 0);
  const enteredAreaSf = input.residentialUnitTypes.reduce((sum, line) => sum + line.units * line.averageAreaSf, 0);
  const unitChecks = [
    check(
      "unit-total",
      "Unit total equals revenue units plus non-revenue units",
      enteredUnits,
      result.unitSummary.totalUnits,
      "count",
    ),
    check(
      "area-total",
      "Area total equals unit-type units times average area",
      enteredAreaSf,
      result.unitSummary.totalAreaSf,
      "sf",
    ),
  ];
  const monthlyChecks = result.months.flatMap((month) => [
    check(
      `potential-income:${month.month}`,
      `${month.month} potential income equals residential rent plus other income`,
      month.totalPotentialIncome,
      sumMoney(month.totalResidentialRent, month.otherIncome),
    ),
    check(
      `residential-rent:${month.month}`,
      `${month.month} residential rent equals its separate rent lines`,
      month.totalResidentialRent,
      sumMoney(month.residentialGrossRent, month.nonRevenueRentAdjustment, month.leaseUpLoss, month.rentAdjustmentLoss, month.freeRentLoss),
    ),
    check(
      `effective-gross-revenue:${month.month}`,
      `${month.month} effective gross revenue equals potential income less vacancy and credit loss`,
      month.effectiveGrossRevenue,
      sumMoney(month.totalPotentialIncome, month.vacancyLoss, month.creditLoss),
    ),
    check(
      `net-operating-income:${month.month}`,
      `${month.month} net operating income equals effective gross revenue less operating expenses`,
      month.netOperatingIncome,
      sumMoney(month.effectiveGrossRevenue, -month.operatingExpenses),
    ),
    check(
      `operating-cash-flow:${month.month}`,
      `${month.month} operating cash flow equals net operating income less capital expenditures`,
      month.operatingCashFlow,
      sumMoney(month.netOperatingIncome, -month.capitalExpenditures),
    ),
  ]);
  const operatingCashFlowTotal = sumMoney(...result.months.map((month) => month.operatingCashFlow));
  return [
    ...unitChecks,
    ...monthlyChecks,
    check(
      "operating-cash-flow-total",
      "Operating cash flow total equals the sum of monthly operating cash flow",
      result.totals.operatingCashFlow,
      operatingCashFlowTotal,
    ),
  ];
}

function check(
  id: string,
  label: string,
  expected: number,
  actual: number,
  unit: ReconciliationCheck["unit"] = "usd",
): ReconciliationCheck {
  const difference = dollars(cents(actual) - cents(expected));
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit };
}

function formulaTraces(): OperationsFormulaTrace[] {
  return [
    { key: "monthlyLeaseUp", label: "Monthly Lease-Up", formula: "the lesser of revenue units or pre-leased units plus monthly lease pace after operation start", inputPaths: ["operationStartMonth", "preleasedUnits", "leaseUpUnitsPerMonth", "residentialUnitTypes"] },
    { key: "totalResidentialRent", label: "Total Residential Rent", formula: "grown gross residential rent plus non-revenue, lease-up, rent adjustment, and free-rent losses", inputPaths: ["residentialUnitTypes", "growthStartMonth", "annualIncomeGrowthPercent", "rentAdjustmentLossPercent", "freeRentPercent"] },
    { key: "otherIncome", label: "Other Income", formula: "sum of separate grown annual and per-occupied-unit other-income lines", inputPaths: ["otherIncomeLines", "growthStartMonth", "annualIncomeGrowthPercent"] },
    { key: "vacancyLoss", label: "Vacancy Loss", formula: "negative total potential income times vacancy percent", inputPaths: ["vacancyPercent", "residentialUnitTypes", "otherIncomeLines"] },
    { key: "creditLoss", label: "Credit Loss", formula: "negative total potential income times credit-loss percent", inputPaths: ["creditLossPercent", "residentialUnitTypes", "otherIncomeLines"] },
    { key: "netOperatingIncome", label: "Net Operating Income", formula: "effective gross revenue less grown operating expenses", inputPaths: ["operatingExpenseLines", "growthStartMonth", "annualExpenseGrowthPercent"] },
    { key: "operatingCashFlow", label: "Operating Cash Flow", formula: "net operating income less grown capital expenditures", inputPaths: ["capitalExpenditureLines", "growthStartMonth", "annualExpenseGrowthPercent"] },
  ];
}

function resultNumbersAreSafe(result: ApartmentOperationsResult) {
  return Object.values(result.unitSummary).every((value) => Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)))
    && result.months.every((month) => Object.values(month).every((value) =>
    typeof value !== "number" || (Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100))),
  ));
}

function monthIndex(value: string) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sumMoney(...amounts: number[]) {
  return dollars(amounts.reduce((sum, amount) => sum + cents(amount), 0));
}

function cents(amount: number) {
  return Math.round(amount * 100);
}

function dollars(value: number) {
  return value / 100;
}

function labelFor(path: string) {
  return path.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()).replace(/\.\d+\./g, " ");
}

function addIssue(issues: ApartmentOperationsIssue[], path: string, code: ApartmentOperationsIssueCode, message: string) {
  issues.push({ path, code, message });
}

function failed(inputSnapshot: ApartmentOperationsInputs, issues: ApartmentOperationsIssue[]): ApartmentOperationsRun {
  return {
    formulaVersion: APARTMENT_OPERATIONS_FORMULA_VERSION,
    inputSnapshot,
    status: "failed",
    issues,
    result: null,
    reconciliations: [],
  };
}
