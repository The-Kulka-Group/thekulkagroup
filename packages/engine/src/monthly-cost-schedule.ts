export const MONTHLY_COST_FORMULA_VERSION = "underwriting.monthly_cost_schedule.v1" as const;
export const STRAIGHT_LINE_DISTRIBUTION_VERSION = "straight_line.v1" as const;
export const S_CURVE_DISTRIBUTION_VERSION = "s_curve.smoothstep.v1" as const;
export const MIN_MODEL_YEAR = 1900;
export const MAX_MODEL_YEAR = 2200;
export const MAX_TIMELINE_MONTHS = 240;
export const MAX_COST_LINES = 250;

export type CostCategory =
  | "land"
  | "hard_cost"
  | "soft_cost"
  | "development_fee"
  | "financing_fee";

export type CostDistributionMethod = "straight_line" | "s_curve";
export type CostDistributionVersion =
  | typeof STRAIGHT_LINE_DISTRIBUTION_VERSION
  | typeof S_CURVE_DISTRIBUTION_VERSION;

export type MonthlyCostLine = {
  id: string;
  name: string;
  category: CostCategory;
  amount: number;
  unit: "usd";
  startMonth: string;
  endMonth: string;
  distributionMethod: CostDistributionMethod;
  distributionVersion: CostDistributionVersion;
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: "working" | "done";
};

export type MonthlyCostScheduleInputs = {
  analysisStartMonth: string;
  saleMonth: string;
  costLines: MonthlyCostLine[];
};

export type MonthlyCostIssueCode =
  | "invalid_month"
  | "month_order"
  | "outside_timeline"
  | "invalid_amount"
  | "invalid_unit"
  | "invalid_category"
  | "missing_text"
  | "duplicate_id"
  | "unsupported_distribution"
  | "unsupported_distribution_version"
  | "invalid_source_date"
  | "invalid_review_state"
  | "invalid_year"
  | "text_too_long"
  | "timeline_too_long"
  | "too_many_cost_lines"
  | "derived_results";

export type MonthlyCostIssue = {
  path: string;
  code: MonthlyCostIssueCode;
  message: string;
};

export type ReconciliationCheck = {
  id: string;
  label: string;
  expected: number;
  actual: number;
  difference: number;
  tolerance: number;
  status: "pass" | "fail";
};

export type CostLineSchedule = {
  lineId: string;
  name: string;
  category: CostCategory;
  months: string[];
  monthlyAmounts: number[];
  total: number;
  formulaTrace: string;
  inputPaths: string[];
};

export type MonthlyUses = {
  month: string;
  lineAmounts: Record<string, number>;
  usesByCategory: Record<CostCategory, number>;
  totalUses: number;
};

export type AggregateFormulaTrace = {
  key: string;
  label: string;
  value: number;
  formulaTrace: string;
  inputPaths: string[];
};

export type MonthlyCostScheduleResult = {
  months: MonthlyUses[];
  costLineSchedules: CostLineSchedule[];
  totalsByCategory: Record<CostCategory, number>;
  totalUses: number;
  aggregateFormulaTraces: AggregateFormulaTrace[];
};

export type MonthlyCostScheduleRun = {
  formulaVersion: typeof MONTHLY_COST_FORMULA_VERSION;
  inputSnapshot: MonthlyCostScheduleInputs;
  status: "complete" | "failed";
  issues: MonthlyCostIssue[];
  result: MonthlyCostScheduleResult | null;
  reconciliations: ReconciliationCheck[];
};

const CATEGORIES: CostCategory[] = [
  "land",
  "hard_cost",
  "soft_cost",
  "development_fee",
  "financing_fee",
];

export function computeMonthlyCostSchedule(input: MonthlyCostScheduleInputs): MonthlyCostScheduleRun {
  const inputSnapshot = structuredClone(input);
  const issues = validate(inputSnapshot);
  if (issues.length > 0) return failed(inputSnapshot, issues);

  const spine = monthSpine(inputSnapshot.analysisStartMonth, inputSnapshot.saleMonth);
  const schedules = inputSnapshot.costLines.map((line, index) => scheduleLine(line, index));
  const result = resultFor(spine, inputSnapshot.costLines, schedules);
  if (!result || !Number.isSafeInteger(Math.round(result.totalUses * 100))) {
    return failed(inputSnapshot, [{
      path: "costLines",
      code: "derived_results",
      message: "The monthly cost result is outside the supported numeric range.",
    }]);
  }

  const reconciliations = reconciliationChecks(inputSnapshot.costLines, schedules, result);
  if (reconciliations.some(({ status }) => status === "fail")) {
    return failed(inputSnapshot, [{
      path: "costLines",
      code: "derived_results",
      message: "The monthly cost schedule did not reconcile to its source amounts.",
    }]);
  }

  return {
    formulaVersion: MONTHLY_COST_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    result,
    reconciliations,
  };
}

function validate(input: MonthlyCostScheduleInputs) {
  const issues: MonthlyCostIssue[] = [];
  const analysis = monthIndex(input.analysisStartMonth);
  const sale = monthIndex(input.saleMonth);
  if (analysis === null) issue(issues, "analysisStartMonth", "invalid_month", "Analysis start month must use YYYY-MM.");
  if (sale === null) issue(issues, "saleMonth", "invalid_month", "Sale month must use YYYY-MM.");
  if (analysis !== null && !validModelYear(input.analysisStartMonth)) {
    issue(issues, "analysisStartMonth", "invalid_year", `Analysis start year must be between ${MIN_MODEL_YEAR} and ${MAX_MODEL_YEAR}.`);
  }
  if (sale !== null && !validModelYear(input.saleMonth)) {
    issue(issues, "saleMonth", "invalid_year", `Sale year must be between ${MIN_MODEL_YEAR} and ${MAX_MODEL_YEAR}.`);
  }
  if (analysis !== null && sale !== null && sale < analysis) {
    issue(issues, "saleMonth", "month_order", "Sale month cannot be before the analysis start month.");
  }
  if (analysis !== null && sale !== null && sale - analysis + 1 > MAX_TIMELINE_MONTHS) {
    issue(issues, "saleMonth", "timeline_too_long", `The analysis timeline cannot exceed ${MAX_TIMELINE_MONTHS} months.`);
  }
  if (!Array.isArray(input.costLines)) {
    issue(issues, "costLines", "missing_text", "Cost lines must be an array.");
    return issues;
  }
  if (input.costLines.length === 0) {
    issue(issues, "costLines", "missing_text", "Add at least one cost line.");
  }
  if (input.costLines.length > MAX_COST_LINES) {
    issue(issues, "costLines", "too_many_cost_lines", `A schedule cannot contain more than ${MAX_COST_LINES} cost lines.`);
  }

  const ids = new Map<string, number>();
  for (const [index, line] of input.costLines.entries()) {
    const path = `costLines.${index}`;
    if (!line || typeof line !== "object") {
      issue(issues, path, "missing_text", "Cost line must be an object.");
      continue;
    }
    if (typeof line.id !== "string" || line.id.trim() === "") {
      issue(issues, `${path}.id`, "missing_text", "Cost line ID is required.");
    } else if (textLength(line.id) > 100) {
      issue(issues, `${path}.id`, "text_too_long", "Cost line ID cannot exceed 100 characters.");
    } else if (ids.has(line.id)) {
      issue(issues, `${path}.id`, "duplicate_id", "Cost line IDs must be unique.");
    } else {
      ids.set(line.id, index);
    }
    if (typeof line.name !== "string" || line.name.trim() === "") {
      issue(issues, `${path}.name`, "missing_text", "Cost line name is required.");
    } else if (textLength(line.name) > 200) {
      issue(issues, `${path}.name`, "text_too_long", "Cost line name cannot exceed 200 characters.");
    }
    if (!CATEGORIES.includes(line.category)) {
      issue(issues, `${path}.category`, "invalid_category", "Cost line category is not supported.");
    }
    const cents = Math.round(line.amount * 100);
    if (!Number.isFinite(line.amount) || line.amount < 0.01 || !Number.isSafeInteger(cents) || Math.abs(line.amount - cents / 100) > 1e-9) {
      issue(issues, `${path}.amount`, "invalid_amount", "Cost line amount must be a positive USD amount with no more than two decimal places.");
    }
    if (line.unit !== "usd") issue(issues, `${path}.unit`, "invalid_unit", "This formula version supports USD cost lines.");

    const start = monthIndex(line.startMonth);
    const end = monthIndex(line.endMonth);
    if (start === null) issue(issues, `${path}.startMonth`, "invalid_month", "Cost line start month must use YYYY-MM.");
    if (end === null) issue(issues, `${path}.endMonth`, "invalid_month", "Cost line end month must use YYYY-MM.");
    if (start !== null && !validModelYear(line.startMonth)) {
      issue(issues, `${path}.startMonth`, "invalid_year", `Cost line start year must be between ${MIN_MODEL_YEAR} and ${MAX_MODEL_YEAR}.`);
    }
    if (end !== null && !validModelYear(line.endMonth)) {
      issue(issues, `${path}.endMonth`, "invalid_year", `Cost line end year must be between ${MIN_MODEL_YEAR} and ${MAX_MODEL_YEAR}.`);
    }
    if (start !== null && end !== null && end < start) {
      issue(issues, `${path}.endMonth`, "month_order", "Cost line end month cannot be before its start month.");
    }
    if (analysis !== null && sale !== null && start !== null && end !== null && (start < analysis || end > sale)) {
      issue(issues, path, "outside_timeline", "Cost line months must stay within the analysis timeline.");
    }

    if (line.distributionMethod !== "straight_line" && line.distributionMethod !== "s_curve") {
      issue(issues, `${path}.distributionMethod`, "unsupported_distribution", "Choose straight-line or S-curve distribution.");
    } else {
      const expected = line.distributionMethod === "straight_line"
        ? STRAIGHT_LINE_DISTRIBUTION_VERSION
        : S_CURVE_DISTRIBUTION_VERSION;
      if (line.distributionVersion !== expected) {
        issue(issues, `${path}.distributionVersion`, "unsupported_distribution_version", `Use ${expected} with this distribution method.`);
      }
    }
    if (line.sourceDate !== undefined && !validDate(line.sourceDate)) {
      issue(issues, `${path}.sourceDate`, "invalid_source_date", "Source date must be a valid YYYY-MM-DD date.");
    }
    if (line.sourceLabel !== undefined && (typeof line.sourceLabel !== "string" || line.sourceLabel.trim() === "")) {
      issue(issues, `${path}.sourceLabel`, "missing_text", "Source label cannot be blank when supplied.");
    }
    if (line.reviewState !== "working" && line.reviewState !== "done") {
      issue(issues, `${path}.reviewState`, "invalid_review_state", "Review state must be Working on it or Done.");
    }
  }
  return issues;
}

function scheduleLine(line: MonthlyCostLine, index: number): CostLineSchedule {
  const months = monthSpine(line.startMonth, line.endMonth);
  const cents = Math.round(line.amount * 100);
  const monthlyCents = line.distributionMethod === "straight_line"
    ? cumulativeAllocation(cents, months.length, (position) => position)
    : cumulativeAllocation(cents, months.length, smoothstep);
  return {
    lineId: line.id,
    name: line.name,
    category: line.category,
    months,
    monthlyAmounts: monthlyCents.map(fromCents),
    total: fromCents(monthlyCents.reduce((sum, amount) => sum + amount, 0)),
    formulaTrace: line.distributionMethod === "straight_line"
      ? "Entered amount allocated in equal cumulative shares across inclusive cost months; rounding is assigned by cumulative cents."
      : "Entered amount allocated from cumulative smoothstep 3t² - 2t³ across inclusive cost months; rounding is assigned by cumulative cents.",
    inputPaths: [
      `costLines.${index}.amount`,
      `costLines.${index}.startMonth`,
      `costLines.${index}.endMonth`,
      `costLines.${index}.distributionMethod`,
      `costLines.${index}.distributionVersion`,
    ],
  };
}

function cumulativeAllocation(totalCents: number, count: number, curve: (position: number) => number) {
  const amounts: number[] = [];
  let prior = 0;
  for (let index = 1; index <= count; index += 1) {
    const cumulative = index === count ? totalCents : Math.round(totalCents * curve(index / count));
    amounts.push(cumulative - prior);
    prior = cumulative;
  }
  return amounts;
}

function smoothstep(position: number) {
  return 3 * position ** 2 - 2 * position ** 3;
}

function resultFor(spine: string[], lines: MonthlyCostLine[], schedules: CostLineSchedule[]): MonthlyCostScheduleResult | null {
  const totalsByCategory = emptyCategories();
  const scheduleStarts = schedules.map((schedule) => monthIndex(schedule.months[0])!);
  const spineStart = monthIndex(spine[0])!;
  const months = spine.map((month, monthOffset) => {
    const usesByCategory = emptyCategories();
    const lineAmounts: Record<string, number> = {};
    for (const [index, line] of lines.entries()) {
      const schedule = schedules[index];
      const monthPosition = spineStart + monthOffset - scheduleStarts[index];
      const amount = monthPosition < 0 || monthPosition >= schedule.monthlyAmounts.length
        ? 0
        : schedule.monthlyAmounts[monthPosition];
      lineAmounts[line.id] = amount;
      usesByCategory[line.category] = fromCents(toCents(usesByCategory[line.category]) + toCents(amount));
      totalsByCategory[line.category] = fromCents(toCents(totalsByCategory[line.category]) + toCents(amount));
    }
    const totalUses = fromCents(Object.values(usesByCategory).reduce((sum, amount) => sum + toCents(amount), 0));
    return { month, lineAmounts, usesByCategory, totalUses };
  });
  const totalCents = Object.values(totalsByCategory).reduce((sum, amount) => sum + toCents(amount), 0);
  if (!Number.isSafeInteger(totalCents)) return null;
  const totalUses = fromCents(totalCents);
  return {
    months,
    costLineSchedules: schedules,
    totalsByCategory,
    totalUses,
    aggregateFormulaTraces: aggregateFormulaTraces(months, lines, schedules, totalsByCategory, totalUses),
  };
}

function aggregateFormulaTraces(
  months: MonthlyUses[],
  lines: MonthlyCostLine[],
  schedules: CostLineSchedule[],
  totalsByCategory: Record<CostCategory, number>,
  totalUses: number,
): AggregateFormulaTrace[] {
  const monthly = months.map((month) => {
    const monthNumber = monthIndex(month.month)!;
    const inputPaths = schedules.flatMap((schedule, index) => {
      const start = monthIndex(schedule.months[0])!;
      return monthNumber >= start && monthNumber < start + schedule.monthlyAmounts.length
        ? costLineInputPaths(index)
        : [];
    });
    return {
      key: `month:${month.month}:total-uses`,
      label: `${month.month} Total Uses`,
      value: month.totalUses,
      formulaTrace: "Sum the scheduled amount for each cost line in this month.",
      inputPaths,
    };
  });
  const categories = CATEGORIES.map((category) => ({
    key: `category:${category}`,
    label: `${categoryLabel(category)} Total`,
    value: totalsByCategory[category],
    formulaTrace: "Sum all monthly amounts for cost lines in this category.",
    inputPaths: lines.flatMap((line, index) => line.category === category ? [`costLines.${index}.amount`] : []),
  }));
  return [
    ...monthly,
    ...categories,
    {
      key: "total-uses",
      label: "Total Uses",
      value: totalUses,
      formulaTrace: "Sum the entered amount of every cost line across all categories.",
      inputPaths: lines.map((_, index) => `costLines.${index}.amount`),
    },
  ];
}

function costLineInputPaths(index: number) {
  return [
    `costLines.${index}.amount`,
    `costLines.${index}.startMonth`,
    `costLines.${index}.endMonth`,
    `costLines.${index}.distributionMethod`,
    `costLines.${index}.distributionVersion`,
  ];
}

function categoryLabel(category: CostCategory) {
  return ({
    land: "Land",
    hard_cost: "Hard Cost",
    soft_cost: "Soft Cost",
    development_fee: "Development Fee",
    financing_fee: "Financing Fee",
  } as const)[category];
}

function reconciliationChecks(lines: MonthlyCostLine[], schedules: CostLineSchedule[], result: MonthlyCostScheduleResult) {
  const checks = lines.map((line, index) => check(
    `cost-line:${line.id}`,
    `${line.name} monthly distribution equals its entered amount`,
    fromCents(Math.round(line.amount * 100)),
    schedules[index].total,
  ));
  checks.push(check(
    "total-uses",
    "Monthly uses equal the sum of entered cost lines",
    fromCents(lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0)),
    result.totalUses,
  ));
  return checks;
}

function check(id: string, label: string, expected: number, actual: number): ReconciliationCheck {
  const difference = fromCents(toCents(actual) - toCents(expected));
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail" };
}

function emptyCategories(): Record<CostCategory, number> {
  return { land: 0, hard_cost: 0, soft_cost: 0, development_fee: 0, financing_fee: 0 };
}

function monthIndex(value: string) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function validModelYear(value: string) {
  const year = Number(value.slice(0, 4));
  return year >= MIN_MODEL_YEAR && year <= MAX_MODEL_YEAR;
}

function textLength(value: string) {
  return Array.from(value).length;
}

function monthSpine(start: string, end: string) {
  const startIndex = monthIndex(start)!;
  const endIndex = monthIndex(end)!;
  return Array.from({ length: endIndex - startIndex + 1 }, (_, offset) => monthFromIndex(startIndex + offset));
}

function monthFromIndex(index: number) {
  const year = Math.floor(index / 12);
  const month = index % 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function issue(issues: MonthlyCostIssue[], path: string, code: MonthlyCostIssueCode, message: string) {
  issues.push({ path, code, message });
}

function toCents(amount: number) {
  return Math.round(amount * 100);
}

function fromCents(cents: number) {
  return cents / 100;
}

function failed(inputSnapshot: MonthlyCostScheduleInputs, issues: MonthlyCostIssue[]): MonthlyCostScheduleRun {
  return {
    formulaVersion: MONTHLY_COST_FORMULA_VERSION,
    inputSnapshot,
    status: "failed",
    issues,
    result: null,
    reconciliations: [],
  };
}
