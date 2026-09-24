import { computeRom, type Answers, type ContractSide, type DataSnapshot, type Rom } from "./rom";
import { scoreClosingComparison } from "./rom-intake";

// The backtest (LA-23): run the engine on a job Kulka already budgeted and
// measure how far its trade cost lands from that job's own budget trade cost.
//
// No Kulka job has closed, so the target is the budget, not final cost
// (docs/precon/rom-spec.md: "the Autodesk original budget less General
// Conditions and less insurance and fee"). The caller builds each job's
// snapshot without that job's own benchmarks, so a job is never priced from
// itself. This file only does the math: nothing here reads a database.

/** How many of the largest line misses the report names. */
export const WORST_MISS_COUNT = 5;

/**
 * One cost code in the job's own budget, as the approved import promoted it.
 * `usdPerGsf` is the benchmark value; the dollars are that times the job's
 * gross square feet.
 */
export type BacktestActualLine = {
  costCode: string;
  label: string;
  usdPerGsf: number;
  contractSide: ContractSide;
};

export type BacktestProjectInput = {
  projectId: string;
  projectName: string;
  /** Built off the project record, the same way a run with no responses builds them. */
  answers: Answers;
  /** Everything the engine may read, less every benchmark this project stands behind. */
  snapshot: DataSnapshot;
  /** The project's own approved budget lines. */
  actual: BacktestActualLine[];
};

/**
 * What the ROM did with a line. `not_in_job` and `tbd` are a branch gate's
 * answers and are zero in the ROM. `breakout` is priced but carved out of a
 * lump that already holds it, so it stays out of the total.
 * `not_predicted` means no other job had this item, so the ROM has no line.
 */
export type BacktestPredictedStatus = "priced" | "not_in_job" | "tbd" | "breakout" | "not_predicted";

/** Which side carries the line: the ROM, the job's budget, or both. */
export type BacktestPresence = "both" | "predicted_only" | "budget_only";

export type BacktestLine = {
  costCode: string;
  label: string;
  predictedStatus: BacktestPredictedStatus;
  predicted: { low: number; high: number; midpoint: number };
  /** Budget dollars for this cost code, zero when the budget has no such line. */
  actual: number;
  presence: BacktestPresence;
  /** Midpoint less actual. Positive means the ROM ran high. */
  error: number;
  /** Error over actual, times 100. Null when the budget has no such line. */
  errorPercent: number | null;
  insideRange: boolean;
  countsInPredictedTotal: boolean;
  countsInActualTotal: boolean;
};

export type BacktestProjectResult = {
  projectId: string;
  projectName: string;
  grossSquareFeet: number;
  /** Set when the engine could not budget the project. Every figure below is then empty. */
  error: string | null;
  predicted: { low: number; high: number; midpoint: number };
  actual: number;
  /** Signed, from scoreClosingComparison. Null when the budget total is zero. */
  errorPercent: number | null;
  insideRange: boolean;
  /**
   * rom-spec.md: "A ROM carrying TBD lines cannot be scored, because the
   * award included that scope." False also when the engine failed or the
   * budget total is zero.
   */
  scored: boolean;
  unscoredReason: string | null;
  /** Within the pass bar, and only ever true on a scored project. */
  passed: boolean;
  /** Every project whose figures priced a counted line in this ROM. Never includes this project. */
  pricedFrom: string[];
  /** Sorted by absolute error, largest first. */
  lines: BacktestLine[];
};

export type BacktestMiss = {
  projectId: string;
  projectName: string;
  line: BacktestLine;
};

export type BacktestReport = {
  projectCount: number;
  scoredCount: number;
  passingCount: number;
  /** Mean of the absolute percent error over scored projects, or null when none scored. */
  meanAbsoluteErrorPercent: number | null;
  /** Mean of the absolute dollar error over scored projects, or null when none scored. */
  meanAbsoluteErrorDollars: number | null;
  projects: BacktestProjectResult[];
  /** The largest line misses by absolute dollars, across every project. */
  worstMisses: BacktestMiss[];
};

export function runBacktest(inputs: BacktestProjectInput[]): BacktestReport {
  const projects = inputs.map(backtestProject);
  const scored = projects.filter((p) => p.scored);

  const worstMisses = projects
    .flatMap((p) => p.lines.map((line) => ({ projectId: p.projectId, projectName: p.projectName, line })))
    .sort(
      (a, b) =>
        Math.abs(b.line.error) - Math.abs(a.line.error) ||
        a.projectName.localeCompare(b.projectName) ||
        a.line.costCode.localeCompare(b.line.costCode),
    )
    .slice(0, WORST_MISS_COUNT);

  const mean = (values: number[]) =>
    values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length;

  return {
    projectCount: projects.length,
    scoredCount: scored.length,
    passingCount: projects.filter((p) => p.passed).length,
    meanAbsoluteErrorPercent: mean(scored.map((p) => Math.abs(p.errorPercent!))),
    meanAbsoluteErrorDollars: mean(scored.map((p) => Math.abs(p.predicted.midpoint - p.actual))),
    projects,
    worstMisses,
  };
}

function backtestProject(input: BacktestProjectInput): BacktestProjectResult {
  const grossSquareFeet = input.answers.grossSquareFeet;
  let rom: Rom;
  try {
    rom = computeRom(input.answers, input.snapshot);
  } catch (cause) {
    return {
      projectId: input.projectId,
      projectName: input.projectName,
      grossSquareFeet,
      error: cause instanceof Error ? cause.message : String(cause),
      predicted: { low: 0, high: 0, midpoint: 0 },
      actual: 0,
      errorPercent: null,
      insideRange: false,
      scored: false,
      unscoredReason: "The engine could not budget this project.",
      passed: false,
      pricedFrom: [],
      lines: [],
    };
  }

  const lines = compareLines(rom, input.actual, grossSquareFeet, input.snapshot);

  const predicted = {
    low: rom.total.low,
    high: rom.total.high,
    midpoint: (rom.total.low + rom.total.high) / 2,
  };
  const actual = lines.filter((l) => l.countsInActualTotal).reduce((sum, l) => sum + l.actual, 0);

  let unscoredReason: string | null = null;
  if (rom.tbdGateItems.length > 0) {
    unscoredReason = "The ROM carries TBD lines, and the budget included that scope.";
  } else if (actual === 0) {
    unscoredReason = "The budget's trade cost is zero, so there is nothing to measure against.";
  }
  const score = actual > 0 ? scoreClosingComparison(rom.total, actual) : null;

  const pricedFrom = new Set<string>();
  for (const line of rom.lines) {
    if (line.breakoutOf !== null || line.gateStatus === "not_in_job" || line.gateStatus === "tbd") continue;
    for (const c of line.comparables) for (const id of c.sourceProjectIds) pricedFrom.add(id);
  }

  return {
    projectId: input.projectId,
    projectName: input.projectName,
    grossSquareFeet,
    error: null,
    predicted,
    actual,
    errorPercent: score ? score.percentError : null,
    insideRange: actual >= predicted.low && actual <= predicted.high,
    scored: unscoredReason === null,
    unscoredReason,
    passed: unscoredReason === null && score !== null && score.withinTenPercent,
    pricedFrom: [...pricedFrom].sort(),
    lines,
  };
}

function compareLines(
  rom: Rom,
  actualLines: BacktestActualLine[],
  grossSquareFeet: number,
  snapshot: DataSnapshot,
): BacktestLine[] {
  // A budget can carry more than one benchmark on a cost code, so the
  // budget's lines are summed by cost code first.
  const actualByCode = new Map<string, { label: string; dollars: number }>();
  for (const line of actualLines) {
    const dollars = line.usdPerGsf * grossSquareFeet;
    const found = actualByCode.get(line.costCode);
    if (found) found.dollars += dollars;
    else actualByCode.set(line.costCode, { label: line.label, dollars });
  }

  // A breakout's lump already holds its cost in the ROM. In the budget it
  // only does when the budget also carries that lump, so a budget breakout
  // stays out of the budget total only in that case. Otherwise the scope
  // would drop out of the budget while the ROM still counts it in the lump.
  const breakoutParent = new Map(
    (snapshot.classifications ?? [])
      .filter((c) => c.breakoutOfCostCode !== null)
      .map((c) => [c.costCode, c.breakoutOfCostCode!]),
  );
  const actualCounts = (costCode: string) => {
    const parent = breakoutParent.get(costCode);
    return parent === undefined || !actualByCode.has(parent);
  };

  const lines: BacktestLine[] = [];
  const predictedCodes = new Set<string>();

  for (const line of rom.lines) {
    predictedCodes.add(line.costCode);
    const status: BacktestPredictedStatus =
      line.gateStatus === "not_in_job" || line.gateStatus === "tbd"
        ? line.gateStatus
        : line.breakoutOf !== null
          ? "breakout"
          : "priced";
    const budget = actualByCode.get(line.costCode);
    lines.push(
      lineOf({
        costCode: line.costCode,
        label: line.label,
        status,
        low: line.low,
        high: line.high,
        actual: budget ? budget.dollars : null,
        countsInPredictedTotal: status === "priced",
        countsInActualTotal: budget ? actualCounts(line.costCode) : false,
      }),
    );
  }

  for (const [costCode, budget] of actualByCode) {
    if (predictedCodes.has(costCode)) continue;
    lines.push(
      lineOf({
        costCode,
        label: budget.label,
        status: "not_predicted",
        low: 0,
        high: 0,
        actual: budget.dollars,
        countsInPredictedTotal: false,
        countsInActualTotal: actualCounts(costCode),
      }),
    );
  }

  return lines.sort(
    (a, b) => Math.abs(b.error) - Math.abs(a.error) || a.costCode.localeCompare(b.costCode),
  );
}

function lineOf(args: {
  costCode: string;
  label: string;
  status: BacktestPredictedStatus;
  low: number;
  high: number;
  actual: number | null;
  countsInPredictedTotal: boolean;
  countsInActualTotal: boolean;
}): BacktestLine {
  const midpoint = (args.low + args.high) / 2;
  const actual = args.actual ?? 0;
  const error = midpoint - actual;
  return {
    costCode: args.costCode,
    label: args.label,
    predictedStatus: args.status,
    predicted: { low: args.low, high: args.high, midpoint },
    actual,
    presence:
      args.actual === null ? "predicted_only" : args.status === "not_predicted" ? "budget_only" : "both",
    error,
    errorPercent: args.actual === null || actual === 0 ? null : (error / actual) * 100,
    insideRange: actual >= args.low && actual <= args.high,
    countsInPredictedTotal: args.countsInPredictedTotal,
    countsInActualTotal: args.countsInActualTotal,
  };
}
