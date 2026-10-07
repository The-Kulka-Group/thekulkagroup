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

export const COST_LINE_BASIS_TYPES = ["fixed", "per_gross_square_foot", "per_unit", "percent_of_line", "percent_of_total"] as const;
export const MAX_BASIS_PERCENT = 1000;
/** What a percent-of-total line is a share of. The two total bases include financing once the capital plan supplies it. */
export const PERCENT_OF_TOTAL_BASES = ["total_cost", "total_less_land", "hard_and_soft"] as const;
export const MAX_PERCENT_OF_TOTAL_ITERATIONS = 200;

/**
 * How a line gets its amount. A line with no basis, or a fixed one, uses its entered amount. The
 * other three derive the amount from a rate and a quantity or another line, and carry no amount
 * of their own, so the entered rate and the derived amount never mix.
 */
export type CostLineBasis =
  | { type: "fixed" }
  | { type: "per_gross_square_foot"; rate: number }
  | { type: "per_unit"; rate: number }
  | { type: "percent_of_line"; baseLineId: string; percent: number }
  | { type: "percent_of_total"; base: PercentOfTotalBase; percent: number };

export type PercentOfTotalBase = (typeof PERCENT_OF_TOTAL_BASES)[number];

/**
 * Financing the capital plan adds to total cost: loan fees, capitalized interest and operating
 * shortfall. Only the capital plan knows it, so it passes it in while it solves; it is never a
 * user input and never enters the input snapshot.
 */
export type CostScheduleOptions = { financingCost?: number };

export type CostLineBasisType = (typeof COST_LINE_BASIS_TYPES)[number];

/** Case quantities that per-area and per-unit lines multiply against. */
export type CostQuantities = {
  grossSquareFeet?: number;
  units?: number;
};

export type MonthlyCostLine = {
  id: string;
  name: string;
  category: CostCategory;
  /** Required for a fixed line. Absent on a derived line, whose amount the engine computes. */
  amount?: number;
  basis?: CostLineBasis;
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
  quantities?: CostQuantities;
};

export type MonthlyCostIssueCode =
  | "invalid_month"
  | "month_order"
  | "outside_timeline"
  | "invalid_amount"
  | "invalid_basis"
  | "amount_with_basis"
  | "missing_quantity"
  | "unknown_base_line"
  | "circular_basis"
  | "percent_total_too_high"
  | "percent_total_unsettled"
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
  unit?: "usd" | "count" | "sf" | "ratio" | "multiple" | "basis_points";
};

export type CostLineSchedule = {
  lineId: string;
  name: string;
  category: CostCategory;
  basisType: CostLineBasisType;
  /** The line's amount after any basis is applied: the entered amount for a fixed line, the derived amount otherwise. */
  amount: number;
  /** For a percent-of-total line, the base the percent applies to: every other line in the base, plus financing for a total base. */
  percentBase?: number;
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

export function computeMonthlyCostSchedule(input: MonthlyCostScheduleInputs, options: CostScheduleOptions = {}): MonthlyCostScheduleRun {
  const inputSnapshot = structuredClone(input);
  const issues = validate(inputSnapshot);
  if (issues.length > 0) return failed(inputSnapshot, issues);

  const financingCents = Math.round((options.financingCost ?? 0) * 100);
  const spine = monthSpine(inputSnapshot.analysisStartMonth, inputSnapshot.saleMonth);
  const amountsInCents = resolveAmountsInCents(inputSnapshot, financingCents);
  if (!amountsInCents) {
    return failed(inputSnapshot, [{
      path: "costLines",
      code: "percent_total_unsettled",
      message: `The percent-of-total lines did not settle to a cent within ${MAX_PERCENT_OF_TOTAL_ITERATIONS} rounds. Check percent-of-line lines that point at them.`,
    }]);
  }
  const schedules = inputSnapshot.costLines.map((line, index) => scheduleLine(
    line,
    index,
    amountsInCents[index],
    inputSnapshot,
    financingCents,
    percentBaseCents(inputSnapshot.costLines, amountsInCents, index, financingCents),
  ));
  const result = resultFor(spine, inputSnapshot, schedules);
  if (!result || !Number.isSafeInteger(Math.round(result.totalUses * 100))) {
    return failed(inputSnapshot, [{
      path: "costLines",
      code: "derived_results",
      message: "The monthly cost result is outside the supported numeric range.",
    }]);
  }

  const reconciliations = reconciliationChecks(inputSnapshot.costLines, amountsInCents, schedules, result, financingCents);
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
    validateAmountAndBasis(issues, input, line, path);
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
      issue(issues, `${path}.reviewState`, "invalid_review_state", "Review state must be Working on It or Done.");
    }
  }
  validateBasisCycles(issues, input.costLines);
  if (Array.isArray(input.costLines)) {
    const percentOfTotal = input.costLines.reduce((sum, line) => sum + (
      line && isDerived(line) && line.basis.type === "percent_of_total" && Number.isFinite(line.basis.percent) ? line.basis.percent : 0
    ), 0);
    if (percentOfTotal >= 100) {
      issue(issues, "costLines", "percent_total_too_high", "Percent-of-total lines together must stay below 100 percent of cost.");
    }
  }
  return issues;
}

function isDerived(line: MonthlyCostLine): line is MonthlyCostLine & { basis: Exclude<CostLineBasis, { type: "fixed" }> } {
  return !!line.basis && typeof line.basis === "object" && line.basis.type !== "fixed";
}

function validateAmountAndBasis(issues: MonthlyCostIssue[], input: MonthlyCostScheduleInputs, line: MonthlyCostLine, path: string) {
  const basis = line.basis as unknown;
  if (basis !== undefined && (!basis || typeof basis !== "object" || !COST_LINE_BASIS_TYPES.includes((basis as { type: CostLineBasisType }).type))) {
    issue(issues, `${path}.basis`, "invalid_basis", "Cost line basis must be fixed, per gross square foot, per unit, percent of another line or percent of total.");
    return;
  }
  if (!isDerived(line)) {
    const cents = Math.round((line.amount as number) * 100);
    if (typeof line.amount !== "number" || !Number.isFinite(line.amount) || line.amount < 0.01 || !Number.isSafeInteger(cents) || Math.abs(line.amount - cents / 100) > 1e-9) {
      issue(issues, `${path}.amount`, "invalid_amount", "Cost line amount must be a positive USD amount with no more than two decimal places.");
    }
    return;
  }
  if (line.amount !== undefined) {
    issue(issues, `${path}.amount`, "amount_with_basis", "A line priced by a basis takes no entered amount. The engine derives it.");
  }
  const { basis: derived } = line;
  if (derived.type === "percent_of_total") {
    if (!Number.isFinite(derived.percent) || derived.percent <= 0 || derived.percent >= 100) {
      issue(issues, `${path}.basis.percent`, "invalid_basis", "Percent of total must be above zero and below 100.");
    }
    if (!PERCENT_OF_TOTAL_BASES.includes(derived.base)) {
      issue(issues, `${path}.basis.base`, "invalid_basis", "Choose Total Cost, Total Less Land, or Hard and Soft Cost as the base.");
    }
    return;
  }
  if (derived.type === "percent_of_line") {
    if (!Number.isFinite(derived.percent) || derived.percent <= 0 || derived.percent > MAX_BASIS_PERCENT) {
      issue(issues, `${path}.basis.percent`, "invalid_basis", `Percent must be above zero and no more than ${MAX_BASIS_PERCENT}.`);
    }
    if (typeof derived.baseLineId !== "string" || !input.costLines.some((other) => other && other.id === derived.baseLineId)) {
      issue(issues, `${path}.basis.baseLineId`, "unknown_base_line", "Choose another cost line in this schedule as the base.");
    } else if (derived.baseLineId === line.id) {
      issue(issues, `${path}.basis.baseLineId`, "circular_basis", "A line cannot be a percent of itself.");
    }
    return;
  }
  if (!Number.isFinite(derived.rate) || derived.rate <= 0 || !Number.isSafeInteger(Math.round(derived.rate * 10000)) || Math.abs(derived.rate * 10000 - Math.round(derived.rate * 10000)) > 1e-6) {
    issue(issues, `${path}.basis.rate`, "invalid_basis", "Rate must be above zero with no more than four decimal places.");
  }
  const quantity = derived.type === "per_unit" ? input.quantities?.units : input.quantities?.grossSquareFeet;
  const quantityPath = derived.type === "per_unit" ? "quantities.units" : "quantities.grossSquareFeet";
  const validQuantity = typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0
    && (derived.type !== "per_unit" || Number.isInteger(quantity));
  if (!validQuantity) {
    issue(
      issues,
      quantityPath,
      "missing_quantity",
      derived.type === "per_unit"
        ? "Enter the number of units, a positive whole number, to price a line per unit."
        : "Enter the gross square feet, above zero, to price a line per gross square foot.",
    );
  }
}

function validateBasisCycles(issues: MonthlyCostIssue[], lines: MonthlyCostLine[]) {
  if (!Array.isArray(lines)) return;
  const byId = new Map<string, number>();
  lines.forEach((line, index) => {
    if (line && typeof line.id === "string" && !byId.has(line.id)) byId.set(line.id, index);
  });
  const baseOf = (index: number) => {
    const line = lines[index];
    return line && isDerived(line) && line.basis.type === "percent_of_line" ? byId.get(line.basis.baseLineId) : undefined;
  };
  const reported = new Set<number>();
  for (const start of lines.keys()) {
    const seen = new Set<number>();
    let current: number | undefined = start;
    while (current !== undefined && !seen.has(current)) {
      seen.add(current);
      current = baseOf(current);
    }
    if (current !== undefined && current !== start) continue;
    if (current === start && seen.size > 1 && !reported.has(start)) {
      for (const member of seen) reported.add(member);
      issue(issues, `costLines.${start}.basis.baseLineId`, "circular_basis", "Percent-of-line bases cannot form a loop.");
    }
  }
}

/**
 * Derived amounts in cents, in line order. Runs only after validation, so bases are known and
 * percent-of-line chains are acyclic. Percent-of-total lines depend on every other line and other
 * percent-of-total lines, so they settle by repeated rounds from zero; with the percents below 100
 * in total each round moves less than the last. Returns null if the rounds do not settle.
 */
function resolveAmountsInCents(input: MonthlyCostScheduleInputs, financingCents: number) {
  const lines = input.costLines;
  const byId = new Map(lines.map((line, index) => [line.id, index]));
  const totalShares = new Map<number, number>();
  lines.forEach((line, index) => {
    if (isDerived(line) && line.basis.type === "percent_of_total") totalShares.set(index, 0);
  });
  const amountsWith = (shares: Map<number, number>) => {
    const resolved = new Map<number, number>();
    const resolve = (index: number): number => {
      const known = resolved.get(index) ?? shares.get(index);
      if (known !== undefined) return known;
      const line = lines[index];
      let cents: number;
      if (!isDerived(line)) cents = Math.round((line.amount as number) * 100);
      else if (line.basis.type === "percent_of_line") cents = Math.round(resolve(byId.get(line.basis.baseLineId)!) * line.basis.percent / 100);
      else if (line.basis.type === "per_unit") cents = Math.round(line.basis.rate * input.quantities!.units! * 100);
      else if (line.basis.type === "per_gross_square_foot") cents = Math.round(line.basis.rate * input.quantities!.grossSquareFeet! * 100);
      else throw new Error("Percent-of-total shares are supplied, never resolved.");
      resolved.set(index, cents);
      return cents;
    };
    return lines.map((_, index) => resolve(index));
  };
  if (totalShares.size === 0) return amountsWith(totalShares);
  let shares = totalShares;
  for (let round = 0; round < MAX_PERCENT_OF_TOTAL_ITERATIONS; round += 1) {
    const amounts = amountsWith(shares);
    if (!amounts.every(Number.isSafeInteger)) return null;
    const next = new Map<number, number>();
    let largestMove = 0;
    for (const [index, current] of shares) {
      const basis = lines[index].basis as Extract<CostLineBasis, { type: "percent_of_total" }>;
      const share = Math.round(percentBaseCents(lines, amounts, index, financingCents)! * basis.percent / 100);
      next.set(index, share);
      largestMove = Math.max(largestMove, Math.abs(share - current));
    }
    shares = next;
    if (largestMove <= 1) return amountsWith(shares);
  }
  return null;
}

/** Every other line in the line's base, plus financing for a total base. Null for a line that is not percent of total. */
function percentBaseCents(lines: MonthlyCostLine[], amounts: number[], index: number, financingCents: number) {
  const line = lines[index];
  if (!isDerived(line) || line.basis.type !== "percent_of_total") return null;
  const { base } = line.basis;
  const inBase = (other: MonthlyCostLine) => base === "total_cost"
    || (base === "total_less_land" && other.category !== "land")
    || (base === "hard_and_soft" && (other.category === "hard_cost" || other.category === "soft_cost"));
  const linesCents = lines.reduce((sum, other, position) => position !== index && inBase(other) ? sum + amounts[position] : sum, 0);
  return base === "hard_and_soft" ? linesCents : linesCents + financingCents;
}

const PERCENT_OF_TOTAL_LABELS: Record<PercentOfTotalBase, string> = {
  total_cost: "total cost",
  total_less_land: "total cost less land",
  hard_and_soft: "hard and soft cost",
};

function basisTrace(line: MonthlyCostLine, input: MonthlyCostScheduleInputs, financingCents: number, percentBase: number | null) {
  if (!isDerived(line)) return null;
  const { basis } = line;
  if (basis.type === "percent_of_total") {
    const financing = basis.base === "hard_and_soft"
      ? ""
      : financingCents > 0
        ? `, including financing of ${fromCents(financingCents)}`
        : ", with no financing yet because the capital plan is not part of this run";
    return `Amount derived as ${basis.percent} percent of ${PERCENT_OF_TOTAL_LABELS[basis.base]} of ${fromCents(percentBase ?? 0)}: every other line in the base${financing}. The line is left out of its own base, and percent-of-total lines settle together.`;
  }
  if (basis.type === "per_gross_square_foot") return `Amount derived as rate ${basis.rate} per gross square foot times ${input.quantities?.grossSquareFeet} gross square feet.`;
  if (basis.type === "per_unit") return `Amount derived as rate ${basis.rate} per unit times ${input.quantities?.units} units.`;
  const base = input.costLines.find(({ id }) => id === basis.baseLineId);
  return `Amount derived as ${basis.percent} percent of the ${base?.name ?? basis.baseLineId} line.`;
}

function basisInputPaths(line: MonthlyCostLine, index: number, input: MonthlyCostScheduleInputs): string[] {
  if (!isDerived(line)) return [`costLines.${index}.amount`];
  const { basis } = line;
  if (basis.type === "per_gross_square_foot") return [`costLines.${index}.basis`, "quantities.grossSquareFeet"];
  if (basis.type === "per_unit") return [`costLines.${index}.basis`, "quantities.units"];
  if (basis.type === "percent_of_total") return [`costLines.${index}.basis`, "costLines"];
  const baseIndex = input.costLines.findIndex(({ id }) => id === basis.baseLineId);
  return [`costLines.${index}.basis`, ...basisInputPaths(input.costLines[baseIndex], baseIndex, input)];
}

function scheduleLine(
  line: MonthlyCostLine,
  index: number,
  cents: number,
  input: MonthlyCostScheduleInputs,
  financingCents: number,
  percentBase: number | null,
): CostLineSchedule {
  const months = monthSpine(line.startMonth, line.endMonth);
  const derivation = basisTrace(line, input, financingCents, percentBase);
  const monthlyCents = line.distributionMethod === "straight_line"
    ? cumulativeAllocation(cents, months.length, (position) => position)
    : cumulativeAllocation(cents, months.length, smoothstep);
  return {
    lineId: line.id,
    name: line.name,
    category: line.category,
    basisType: line.basis?.type ?? "fixed",
    amount: fromCents(cents),
    ...(percentBase !== null ? { percentBase: fromCents(percentBase) } : {}),
    months,
    monthlyAmounts: monthlyCents.map(fromCents),
    total: fromCents(monthlyCents.reduce((sum, amount) => sum + amount, 0)),
    formulaTrace: `${derivation ?? "Entered amount"}${derivation ? " That amount is" : ""} ${line.distributionMethod === "straight_line"
      ? "allocated in equal cumulative shares across inclusive cost months; rounding is assigned by cumulative cents."
      : "allocated from cumulative smoothstep 3t² - 2t³ across inclusive cost months; rounding is assigned by cumulative cents."}`,
    inputPaths: [
      ...basisInputPaths(line, index, input),
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

function resultFor(spine: string[], input: MonthlyCostScheduleInputs, schedules: CostLineSchedule[]): MonthlyCostScheduleResult | null {
  const lines = input.costLines;
  const totalsByCategory = emptyCategories();
  const scheduleStarts = schedules.map((schedule) => monthIndex(schedule.months[0])!);
  const spineStart = monthIndex(spine[0])!;
  const months = spine.map((month, monthOffset) => {
    const usesByCategory = emptyCategories();
    const lineAmounts = Object.create(null) as Record<string, number>;
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
    aggregateFormulaTraces: aggregateFormulaTraces(months, input, schedules, totalsByCategory, totalUses),
  };
}

function aggregateFormulaTraces(
  months: MonthlyUses[],
  input: MonthlyCostScheduleInputs,
  schedules: CostLineSchedule[],
  totalsByCategory: Record<CostCategory, number>,
  totalUses: number,
): AggregateFormulaTrace[] {
  const lines = input.costLines;
  const monthly = months.map((month) => {
    const monthNumber = monthIndex(month.month)!;
    const inputPaths = schedules.flatMap((schedule) => {
      const start = monthIndex(schedule.months[0])!;
      return monthNumber >= start && monthNumber < start + schedule.monthlyAmounts.length
        ? schedule.inputPaths
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
    inputPaths: lines.flatMap((line, index) => line.category === category
      ? [`costLines.${index}.category`, ...basisInputPaths(line, index, input)]
      : []),
  }));
  return [
    ...monthly,
    ...categories,
    {
      key: "total-uses",
      label: "Total Uses",
      value: totalUses,
      formulaTrace: "Sum the amount of every cost line across all categories, entered or derived from its basis.",
      inputPaths: lines.flatMap((line, index) => basisInputPaths(line, index, input)),
    },
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

function reconciliationChecks(
  lines: MonthlyCostLine[],
  amountsInCents: number[],
  schedules: CostLineSchedule[],
  result: MonthlyCostScheduleResult,
  financingCents: number,
) {
  const checks = lines.map((line, index) => check(
    `cost-line:${line.id}`,
    `${line.name} monthly distribution equals its ${isDerived(line) ? "derived" : "entered"} amount`,
    fromCents(amountsInCents[index]),
    schedules[index].total,
  ));
  checks.push(check(
    "total-uses",
    "Monthly uses equal the sum of cost line amounts",
    fromCents(amountsInCents.reduce((sum, cents) => sum + cents, 0)),
    result.totalUses,
  ));
  lines.forEach((line, index) => {
    if (!isDerived(line) || line.basis.type !== "percent_of_total") return;
    checks.push(check(
      `percent-of-total:${line.id}`,
      `${line.name} equals ${line.basis.percent} percent of its settled base`,
      fromCents(Math.round(percentBaseCents(lines, amountsInCents, index, financingCents)! * line.basis.percent / 100)),
      fromCents(amountsInCents[index]),
    ));
  });
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
