import type { ReconciliationCheck } from "./monthly-cost-schedule";
import type {
  PropertyReturnMetric,
  PropertyReturnsEvidence,
  PropertyReturnsInputs,
  PropertyReturnsIssue,
  PropertyReturnsRun,
} from "./property-returns";

export const RESIDUAL_LAND_INPUT_VERSION = "residual_land_inputs.v1" as const;
export const RESIDUAL_LAND_SOLVE_VERSION = "residual_land_bisection.v1" as const;
/** Every trial is a full property run. Doubling from one cent passes the amount ceiling in 47 trials and bisection to the cent takes 54 more. */
export const MAX_RESIDUAL_LAND_TRIALS = 120;
/** The largest land line price the search tries, in dollars. */
export const MAX_RESIDUAL_LAND_AMOUNT = 1_000_000_000_000;
export const MAX_RESIDUAL_LAND_SOURCE_LABEL_LENGTH = 500;

export const RESIDUAL_LAND_TARGETS = ["yield_on_cost", "development_spread", "unlevered_xirr", "levered_xirr"] as const;
export type ResidualLandTarget = typeof RESIDUAL_LAND_TARGETS[number];

/**
 * LA-1975: solve the price of one land line so the run meets a stated return. The solve runs on copies
 * of the inputs, so the stated land, the stated run and the saved case never change.
 */
export type ResidualLandPlan = {
  residualLandInputVersion: typeof RESIDUAL_LAND_INPUT_VERSION;
  target: ResidualLandTarget;
  /** Percent for yield on cost and the two XIRRs; basis points for development spread. */
  targetValue: number;
  /** The cost line the solve prices. It must be a land line with a fixed amount. */
  landLineId: string;
  evidence: PropertyReturnsEvidence;
};

/**
 * - `solved`: the residual is the highest price, to the cent, that meets the target.
 * - `credited_land_cap`: the target is still met where cash land reaches the stated credited value, so the credited value caps the price.
 * - `below_minimum`: the target is missed even with the line at one cent.
 * - `no_upper_bracket`: the target is still met at the largest price the search tries.
 * - `trial_failed`: a run inside the search failed, so no price past it can be judged.
 * - `unsettled`: the search ran out of trials before the bracket closed to one cent.
 */
export type ResidualLandStatus = "solved" | "credited_land_cap" | "below_minimum" | "no_upper_bracket" | "trial_failed" | "unsettled";

export type ResidualLandOutcome = "meets" | "misses" | "credited_land_cap" | "failed";

export type ResidualLandPoint = {
  lineAmount: number;
  /** Every land line at this price, after lines priced off the solved line follow it. Null when the trial failed. */
  landCashCost: number | null;
  /** The target metric, in the target's own unit (percent or basis points). Null when the trial failed. */
  metricValue: number | null;
  outcome: ResidualLandOutcome;
};

export type ResidualLandResult = {
  solveVersion: typeof RESIDUAL_LAND_SOLVE_VERSION;
  target: ResidualLandTarget;
  targetLabel: string;
  targetValue: number;
  targetUnit: "percent" | "basis_points";
  landLineId: string;
  landLineName: string;
  status: ResidualLandStatus;
  /** One plain sentence on what the solve found. */
  message: string;
  stated: ResidualLandPoint;
  /** The highest price tried that meets the target. Null when no price meets it. */
  meets: ResidualLandPoint | null;
  /** The lowest price tried above `meets` that misses, hits the credited value, or fails. Null when none was found. */
  misses: ResidualLandPoint | null;
  /** The solved line price: `meets` when the status is solved or credited_land_cap, otherwise null. */
  residualLineAmount: number | null;
  residualLandCashCost: number | null;
  /** Every property return metric at the residual price. Null without a residual. */
  metricsAtResidual: PropertyReturnMetric[] | null;
  capitalAtResidual: { landCashCost: number; totalUses: number; totalDebt: number; equity: number } | null;
  /** The issues of the run that failed, with `trial_failed`. */
  trialIssues: PropertyReturnsRun["issues"];
  trials: number;
  formula: string;
  inputPaths: string[];
  reconciliations: ReconciliationCheck[];
};

const TARGET_LABELS: Record<ResidualLandTarget, string> = {
  yield_on_cost: "Sale Yield on Cost",
  development_spread: "Development Spread",
  unlevered_xirr: "Unlevered XIRR",
  levered_xirr: "Levered XIRR",
};

export function validateResidualLandPlan(value: unknown): PropertyReturnsIssue[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ path: "residualLand", code: "invalid_residual_land", message: "Residual land must be an object." }];
  }
  const plan = value as ResidualLandPlan;
  const issues: PropertyReturnsIssue[] = [];
  if (plan.residualLandInputVersion !== RESIDUAL_LAND_INPUT_VERSION) issues.push({ path: "residualLand.residualLandInputVersion", code: "unsupported_input_version", message: `Use ${RESIDUAL_LAND_INPUT_VERSION}.` });
  const knownTarget = RESIDUAL_LAND_TARGETS.includes(plan.target);
  if (!knownTarget) issues.push({ path: "residualLand.target", code: "invalid_residual_land", message: "Target must be Sale Yield on Cost, Development Spread, Unlevered XIRR or Levered XIRR." });
  const target = plan.targetValue;
  if (typeof target !== "number" || !Number.isFinite(target)) {
    issues.push({ path: "residualLand.targetValue", code: "invalid_residual_land", message: "Target value must be a number." });
  } else if (knownTarget) {
    const range = targetRange(plan.target);
    if (target <= range.above || target > range.atMost) issues.push({ path: "residualLand.targetValue", code: "invalid_residual_land", message: range.message });
  }
  if (typeof plan.landLineId !== "string" || plan.landLineId.trim() === "") issues.push({ path: "residualLand.landLineId", code: "invalid_residual_land", message: "Choose the land line the solve prices." });
  const evidence = plan.evidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    issues.push({ path: "residualLand.evidence", code: "missing_evidence", message: "Add source and review details for the target." });
    return issues;
  }
  if (evidence.sourceLabel !== undefined && typeof evidence.sourceLabel !== "string") issues.push({ path: "residualLand.evidence.sourceLabel", code: "invalid_source_label", message: "Source label must be text." });
  else if (typeof evidence.sourceLabel === "string" && evidence.sourceLabel.length > MAX_RESIDUAL_LAND_SOURCE_LABEL_LENGTH) issues.push({ path: "residualLand.evidence.sourceLabel", code: "text_too_long", message: `Source label cannot exceed ${MAX_RESIDUAL_LAND_SOURCE_LABEL_LENGTH} characters.` });
  if (evidence.sourceDate !== undefined && (typeof evidence.sourceDate !== "string" || !validDate(evidence.sourceDate))) issues.push({ path: "residualLand.evidence.sourceDate", code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
  if (evidence.reviewState !== "working" && evidence.reviewState !== "done") issues.push({ path: "residualLand.evidence.reviewState", code: "invalid_review_state", message: "Review state must be Working on It or Done." });
  return issues;
}

/** The line the solve prices must exist, be land, and carry a fixed amount, because a derived line has no price to solve. */
export function residualLandLineIssues(input: PropertyReturnsInputs): PropertyReturnsIssue[] {
  const plan = input.residualLand;
  if (!plan) return [];
  const line = input.costLines.find(({ id }) => id === plan.landLineId);
  if (!line) return [{ path: "residualLand.landLineId", code: "invalid_residual_land", message: "The land line the solve prices is not on the cost schedule." }];
  if (line.category !== "land") return [{ path: "residualLand.landLineId", code: "invalid_residual_land", message: `${line.name} is not a land line. Choose a line in the Land category.` }];
  if (line.basis !== undefined && line.basis.type !== "fixed") return [{ path: "residualLand.landLineId", code: "invalid_residual_land", message: `${line.name} is priced by a basis. The solve prices a land line with a fixed amount.` }];
  return [];
}

/**
 * Bisection on the line price in whole cents. Every trial is a full property run on a copy of the inputs
 * with this one line changed, so loan sizing, the percent-of-total lines and lines priced off the land
 * line all settle inside each trial. The search keeps one price that meets the target and one above it
 * that does not, and stops when they are one cent apart.
 */
export function solveResidualLand(
  input: PropertyReturnsInputs,
  statedRun: PropertyReturnsRun,
  runProperty: (input: PropertyReturnsInputs) => PropertyReturnsRun,
): ResidualLandResult {
  const plan = input.residualLand!;
  const lineIndex = input.costLines.findIndex(({ id }) => id === plan.landLineId);
  const line = input.costLines[lineIndex];
  const targetUnit = plan.target === "development_spread" ? "basis_points" : "percent";
  let trials = 0;
  let failedIssues: PropertyReturnsRun["issues"] = [];
  let meetsRun: PropertyReturnsRun | null = null;

  const evaluate = (run: PropertyReturnsRun, amountCents: number): ResidualLandPoint => {
    if (run.status !== "complete" || !run.result) {
      const capped = run.issues.some(({ code }) => code === "credited_land_below_cash_cost");
      if (!capped) failedIssues = run.issues;
      return { lineAmount: amountCents / 100, landCashCost: null, metricValue: null, outcome: capped ? "credited_land_cap" : "failed" };
    }
    const metricValue = metricOf(run, plan.target);
    return {
      lineAmount: amountCents / 100,
      landCashCost: run.result.developmentCapital.totals.landCashCost,
      metricValue,
      outcome: metricValue >= plan.targetValue ? "meets" : "misses",
    };
  };
  const trial = (amountCents: number) => {
    trials += 1;
    const run = runProperty(trialInput(input, lineIndex, amountCents));
    const point = evaluate(run, amountCents);
    if (point.outcome === "meets") meetsRun = run;
    return point;
  };

  const statedCents = cents(line.amount!);
  const stated = evaluate(statedRun, statedCents);
  if (stated.outcome === "meets") meetsRun = statedRun;
  let meets: ResidualLandPoint | null = stated.outcome === "meets" ? stated : null;
  let misses: ResidualLandPoint | null = stated.outcome === "meets" ? null : stated;
  const ceilingCents = cents(MAX_RESIDUAL_LAND_AMOUNT);

  if (!meets) {
    const floor = trial(1);
    if (floor.outcome === "meets") meets = floor;
    else return finish(floor.outcome === "failed" ? "trial_failed" : "below_minimum", null, floor);
  }
  while (!misses) {
    if (trials >= MAX_RESIDUAL_LAND_TRIALS) return finish("unsettled", meets, null);
    if (cents(meets.lineAmount) >= ceilingCents) return finish("no_upper_bracket", meets, null);
    const next = trial(Math.min(cents(meets.lineAmount) * 2, ceilingCents));
    if (next.outcome === "meets") meets = next;
    else misses = next;
  }
  while (cents(misses.lineAmount) - cents(meets.lineAmount) > 1) {
    if (trials >= MAX_RESIDUAL_LAND_TRIALS) return finish("unsettled", meets, misses);
    const mid = trial(Math.floor((cents(meets.lineAmount) + cents(misses.lineAmount)) / 2));
    if (mid.outcome === "meets") meets = mid;
    else misses = mid;
  }
  if (misses.outcome === "failed") return finish("trial_failed", meets, misses);
  return finish(misses.outcome === "credited_land_cap" ? "credited_land_cap" : "solved", meets, misses);

  function finish(status: ResidualLandStatus, meetsPoint: ResidualLandPoint | null, missesPoint: ResidualLandPoint | null): ResidualLandResult {
    const solved = status === "solved" || status === "credited_land_cap";
    const atResidual = solved ? meetsRun : null;
    const totals = atResidual?.result?.developmentCapital.totals;
    return {
      solveVersion: RESIDUAL_LAND_SOLVE_VERSION,
      target: plan.target,
      targetLabel: TARGET_LABELS[plan.target],
      targetValue: plan.targetValue,
      targetUnit,
      landLineId: line.id,
      landLineName: line.name,
      status,
      message: messageFor(status, plan, line.name, meetsPoint, missesPoint),
      stated,
      meets: meetsPoint,
      misses: missesPoint,
      residualLineAmount: solved ? meetsPoint!.lineAmount : null,
      residualLandCashCost: solved ? meetsPoint!.landCashCost : null,
      metricsAtResidual: atResidual?.result?.propertyReturns.metrics ?? null,
      capitalAtResidual: totals ? { landCashCost: totals.landCashCost, totalUses: totals.totalUses, totalDebt: totals.totalDebt, equity: totals.equity } : null,
      trialIssues: status === "trial_failed" ? failedIssues : [],
      trials,
      formula: `the highest ${line.name} price, to the cent, at which ${TARGET_LABELS[plan.target]} is at least ${plan.targetValue}${targetUnit === "percent" ? " percent" : " basis points"}; found by bisection on full property runs with every other input as stated${input.creditedLand ? ", and capped where cash land reaches the stated credited value" : ""}`,
      inputPaths: [`costLines.${lineIndex}.amount`, "residualLand", ...(input.creditedLand ? ["creditedLand"] : [])],
      reconciliations: solved && atResidual ? residualChecks(atResidual, lineIndex, plan, meetsPoint!, missesPoint!) : [],
    };
  }
}

/**
 * The run at the residual must price the line at the residual and meet the target, the price one cent
 * higher must miss it (or reach the credited value), and the bracket must close to one cent.
 */
function residualChecks(run: PropertyReturnsRun, lineIndex: number, plan: ResidualLandPlan, meets: ResidualLandPoint, misses: ResidualLandPoint): ReconciliationCheck[] {
  const pricedLine = run.inputSnapshot.costLines[lineIndex].amount!;
  const metric = meets.metricValue!;
  const unit = plan.target === "development_spread" ? "basis_points" : "ratio";
  const width = (cents(misses.lineAmount) - cents(meets.lineAmount)) / 100;
  const nextMetric = misses.metricValue;
  return [
    usd("residual-land-line-price", "The run at the residual prices the land line at the residual", meets.lineAmount, pricedLine),
    usd("residual-land-bracket", "The price that meets the target and the price that misses it are one cent apart", 0.01, width),
    oneSided("residual-land-meets-target", "The target metric at the residual is at least the target", plan.targetValue, metric, metric >= plan.targetValue, unit),
    misses.outcome === "credited_land_cap"
      ? oneSided("residual-land-next-cent", "One cent more puts cash land above the stated credited value", 0, 0, true, unit)
      : oneSided("residual-land-next-cent", "One cent more misses the target", plan.targetValue, nextMetric!, nextMetric! < plan.targetValue, unit),
  ];
}

function messageFor(status: ResidualLandStatus, plan: ResidualLandPlan, lineName: string, meets: ResidualLandPoint | null, misses: ResidualLandPoint | null) {
  const target = `the ${plan.targetValue}${plan.target === "development_spread" ? " basis point" : " percent"} ${TARGET_LABELS[plan.target]} target`;
  switch (status) {
    case "solved": return `${lineName} can cost up to ${usdText(meets!.lineAmount)} and still meet ${target}.`;
    case "credited_land_cap": return `${lineName} still meets ${target} at ${usdText(meets!.lineAmount)}, where cash land reaches the stated credited value, so the credited value caps the price.`;
    case "below_minimum": return `${lineName} misses ${target} even at one cent, so no land price meets it.`;
    case "no_upper_bracket": return `${lineName} still meets ${target} at ${usdText(meets!.lineAmount)}, the largest price the search tries.`;
    case "trial_failed": return `The run with ${lineName} at ${usdText(misses!.lineAmount)} failed, so the search stopped there. Its issues are listed with the result.`;
    case "unsettled": return `The search ran out of trials before the price that meets ${target} and the price that misses it were one cent apart.`;
  }
}

function trialInput(input: PropertyReturnsInputs, lineIndex: number, amountCents: number): PropertyReturnsInputs {
  // The waterfall splits levered cash flow and changes no return the target reads, so trials leave it out.
  const trial = structuredClone(input);
  delete trial.residualLand;
  delete trial.partnership;
  trial.costLines[lineIndex] = { ...trial.costLines[lineIndex], amount: amountCents / 100 };
  return trial;
}

function metricOf(run: PropertyReturnsRun, target: ResidualLandTarget) {
  const returns = run.result!.propertyReturns;
  switch (target) {
    case "yield_on_cost": return returns.yieldOnCost * 100;
    case "development_spread": return returns.developmentSpreadBasisPoints;
    case "unlevered_xirr": return returns.returns.unlevered.xirr * 100;
    case "levered_xirr": return returns.returns.levered.xirr * 100;
  }
}

function targetRange(target: ResidualLandTarget) {
  switch (target) {
    case "yield_on_cost": return { above: 0, atMost: 100, message: "Target yield on cost must be greater than zero and no more than 100 percent." };
    case "development_spread": return { above: -10_000, atMost: 10_000, message: "Target development spread must be greater than -10,000 and no more than 10,000 basis points." };
    case "unlevered_xirr":
    case "levered_xirr": return { above: -100, atMost: 1_000, message: "Target XIRR must be greater than -100 and no more than 1,000 percent." };
  }
}

function usd(id: string, label: string, expected: number, actual: number): ReconciliationCheck {
  const difference = (cents(actual) - cents(expected)) / 100;
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit: "usd" };
}

/** A bound, not an equality: the check passes when the stated side of the target holds, so its tolerance is zero. */
function oneSided(id: string, label: string, expected: number, actual: number, holds: boolean, unit: ReconciliationCheck["unit"]): ReconciliationCheck {
  return { id, label, expected, actual, difference: actual - expected, tolerance: 0, status: holds ? "pass" : "fail", unit };
}

function usdText(value: number) {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
