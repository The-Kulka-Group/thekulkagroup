import {
  computeApartmentOperations,
  projectApartmentOperationsThrough,
  type MonthlyApartmentOperations,
} from "./apartment-operations";
import { computePropertyReturns, type PropertyReturnsInputs } from "./property-returns";

/*
 * Scores the engine against values saved in an audited development workbook (LA-1687).
 * Inputs and expected values for live deals stay outside the repo, so the printed scorecard
 * carries target ids, statuses and percent off only, never an expected or actual value.
 */

const MONTH_OUTPUT_KEYS = ["firstStabilizedMonth"] as const;

export const ENGINE_OUTPUT_KEYS = [
  "landCost",
  "hardCost",
  "softCost",
  "developmentFee",
  "financingFeeCost",
  "costBeforeFinancing",
  "loanFees",
  "grossInterest",
  "operatingCashAppliedToInterest",
  "capitalizedInterest",
  "operatingShortfall",
  "totalUses",
  "totalSources",
  "equity",
  "debtBeforeReserves",
  "interestReserve",
  "operatingShortfallReserve",
  "totalDebt",
  "debtSharePercent",
  "totalUnits",
  "revenueUnits",
  "nonRevenueUnits",
  "totalAreaSf",
  ...MONTH_OUTPUT_KEYS,
  "stabilizedResidentialGrossRent",
  "stabilizedNonRevenueRentAdjustment",
  "stabilizedTotalResidentialRent",
  "stabilizedOtherIncome",
  "stabilizedPotentialIncome",
  "stabilizedVacancyLoss",
  "stabilizedCreditLoss",
  "stabilizedEffectiveGrossRevenue",
  "stabilizedOperatingExpenses",
  "stabilizedNetOperatingIncome",
  "stabilizedCapitalExpenditures",
  "stabilizedOperatingCashFlow",
  "forwardEffectiveGrossRevenue",
  "forwardOperatingExpenses",
  "forwardNetOperatingIncome",
  "grossSaleValue",
  "sellingCosts",
  "netSaleProceeds",
  "debtPayoff",
  "equitySaleProceeds",
  "unleveredXirr",
  "unleveredEquityMultiple",
  "unleveredNetProfit",
  "leveredXirr",
  "leveredEquityMultiple",
  "leveredNetProfit",
  "yieldOnCost",
  "developmentSpreadBasisPoints",
] as const;

export type EngineOutputKey = typeof ENGINE_OUTPUT_KEYS[number];
export type EngineOutputs = Partial<Record<EngineOutputKey, number | string>>;

export type EngineOutputRun = {
  status: "complete" | "failed";
  issueCodes: string[];
  outputs: EngineOutputs;
};

export type ScorecardTarget = {
  id: string;
  output: EngineOutputKey | null;
  expected?: number | string;
  tolerance?: { absolute: number; relative?: number };
  stage: "compare" | "workbook_defect" | "not_reachable";
  reason?: string;
};

/** One audited workbook mapped onto a full engine input snapshot, with the saved values to score. */
export type AuditedModelScorecard = {
  model: string;
  name: string;
  sourceSha256: string;
  engineInputs: PropertyReturnsInputs;
  targets: ScorecardTarget[];
};

export type ScorecardStatus =
  | "matched"
  | "off"
  | "no_output"
  | "not_reachable"
  | "defect_missed"
  | "defect_matched";

export type ScorecardRow = {
  id: string;
  output: EngineOutputKey | null;
  status: ScorecardStatus;
  percentOff: number | null;
  reason?: string;
};

export type ScorecardProblem = {
  id: string;
  problem: "figure_in_text" | "duplicate_id" | "unknown_output" | "bad_expected" | "bad_tolerance" | "missing_reason";
};

const STABILIZED_FIELDS: Array<[EngineOutputKey, keyof MonthlyApartmentOperations]> = [
  ["stabilizedResidentialGrossRent", "residentialGrossRent"],
  ["stabilizedNonRevenueRentAdjustment", "nonRevenueRentAdjustment"],
  ["stabilizedTotalResidentialRent", "totalResidentialRent"],
  ["stabilizedOtherIncome", "otherIncome"],
  ["stabilizedPotentialIncome", "totalPotentialIncome"],
  ["stabilizedVacancyLoss", "vacancyLoss"],
  ["stabilizedCreditLoss", "creditLoss"],
  ["stabilizedEffectiveGrossRevenue", "effectiveGrossRevenue"],
  ["stabilizedOperatingExpenses", "operatingExpenses"],
  ["stabilizedNetOperatingIncome", "netOperatingIncome"],
  ["stabilizedCapitalExpenditures", "capitalExpenditures"],
  ["stabilizedOperatingCashFlow", "operatingCashFlow"],
];

export function engineOutputsFor(input: PropertyReturnsInputs): EngineOutputRun {
  const run = computePropertyReturns(input);
  const operations = computeApartmentOperations(input);
  if (run.status === "failed" || !run.result || operations.status === "failed" || !operations.result) {
    const codes = [...run.issues, ...operations.issues].map(({ code }) => code);
    return { status: "failed", issueCodes: [...new Set(codes)], outputs: {} };
  }

  const { developmentCapital, propertyReturns } = run.result;
  const capital = developmentCapital.totals;
  const costs = operations.result.costSchedule.totalsByCategory;
  const units = operations.result.unitSummary;
  const { sale, returns } = propertyReturns;
  const outputs: EngineOutputs = {
    landCost: costs.land,
    hardCost: costs.hard_cost,
    softCost: costs.soft_cost,
    developmentFee: costs.development_fee,
    financingFeeCost: costs.financing_fee,
    costBeforeFinancing: operations.result.costSchedule.totalUses,
    loanFees: capital.loanFees,
    grossInterest: capital.grossInterest,
    operatingCashAppliedToInterest: capital.operatingCashAppliedToInterest,
    capitalizedInterest: capital.capitalizedInterest,
    operatingShortfall: capital.operatingShortfall,
    totalUses: capital.totalUses,
    totalSources: capital.totalSources,
    equity: capital.equity,
    debtBeforeReserves: capital.debtBeforeReserves,
    interestReserve: capital.interestReserve,
    operatingShortfallReserve: capital.operatingShortfallReserve,
    totalDebt: capital.totalDebt,
    debtSharePercent: capital.debtSharePercent,
    totalUnits: units.totalUnits,
    revenueUnits: units.revenueUnits,
    nonRevenueUnits: units.nonRevenueUnits,
    totalAreaSf: units.totalAreaSf,
    forwardEffectiveGrossRevenue: sale.forwardEffectiveGrossRevenue,
    forwardOperatingExpenses: sale.forwardOperatingExpenses,
    forwardNetOperatingIncome: sale.forwardNetOperatingIncome,
    grossSaleValue: sale.grossSaleValue,
    sellingCosts: sale.sellingCosts,
    netSaleProceeds: sale.netSaleProceeds,
    debtPayoff: sale.debtPayoff,
    equitySaleProceeds: sale.equitySaleProceeds,
    unleveredXirr: returns.unlevered.xirr,
    unleveredEquityMultiple: returns.unlevered.equityMultiple,
    unleveredNetProfit: returns.unlevered.netProfit,
    leveredXirr: returns.levered.xirr,
    leveredEquityMultiple: returns.levered.equityMultiple,
    leveredNetProfit: returns.levered.netProfit,
    yieldOnCost: propertyReturns.yieldOnCost,
    developmentSpreadBasisPoints: propertyReturns.developmentSpreadBasisPoints,
  };

  const firstStabilizedMonth = operations.result.firstStabilizedMonth;
  if (firstStabilizedMonth) {
    outputs.firstStabilizedMonth = firstStabilizedMonth;
    const lastMonth = addMonths(firstStabilizedMonth, 11);
    const year = projectApartmentOperationsThrough(input, lastMonth)
      .filter(({ month }) => month >= firstStabilizedMonth && month <= lastMonth);
    if (year.length === 12) {
      for (const [key, field] of STABILIZED_FIELDS) {
        outputs[key] = roundCents(year.reduce((total, month) => total + Number(month[field]), 0));
      }
    }
  }

  return { status: "complete", issueCodes: [], outputs };
}

export type Scorecard = {
  run: EngineOutputRun;
  rows: ScorecardRow[];
  problems: ScorecardProblem[];
  text: string;
};

/** Scores one audited model. A model whose name or targets fail validation prints no rows. */
export function scorecardFor(model: AuditedModelScorecard): Scorecard {
  const problems: ScorecardProblem[] = [
    ...(carriesFigure(model.name) ? [{ id: "name", problem: "figure_in_text" as const }] : []),
    ...validateScorecardTargets(model.targets),
  ];
  const run = engineOutputsFor(model.engineInputs);
  const rows = scoreTargets(model.targets, run.outputs);
  const text = problems.length > 0
    ? `## ${model.model}\n\nScorecard withheld: ${problems.length} target or name problems failed validation.`
    : formatScorecard({ name: model.name, engineStatus: run.status, issueCodes: run.issueCodes }, rows);
  return { run, rows, problems, text };
}

export function scoreTargets(targets: ScorecardTarget[], outputs: EngineOutputs): ScorecardRow[] {
  return targets.map((target) => {
    const base = { id: target.id, output: target.output, reason: target.reason };
    if (target.stage === "not_reachable" || target.output === null) {
      return { ...base, status: "not_reachable", percentOff: null };
    }
    const actual = outputs[target.output];
    if (actual === undefined || target.expected === undefined) {
      return { ...base, status: "no_output", percentOff: null };
    }
    const { matched, percentOff } = compareValues(actual, target.expected, target.tolerance ?? { absolute: 0 });
    if (target.stage === "workbook_defect") {
      return { ...base, status: matched ? "defect_matched" : "defect_missed", percentOff };
    }
    return { ...base, status: matched ? "matched" : "off", percentOff };
  });
}

export function validateScorecardTargets(targets: ScorecardTarget[]): ScorecardProblem[] {
  const problems: ScorecardProblem[] = [];
  const seen = new Set<string>();
  const known = new Set<string>(ENGINE_OUTPUT_KEYS);
  for (const target of targets) {
    const report = (problem: ScorecardProblem["problem"]) => problems.push({ id: target.id, problem });
    if (carriesFigure(target.id) || (target.reason !== undefined && carriesFigure(target.reason))) report("figure_in_text");
    if (seen.has(target.id)) report("duplicate_id");
    seen.add(target.id);
    if (target.stage !== "not_reachable") {
      if (target.output === null || !known.has(target.output)) {
        report("unknown_output");
      } else if (!expectedFits(target.output, target.expected)) {
        report("bad_expected");
      }
      const tolerance = target.tolerance;
      if (!tolerance || !(tolerance.absolute >= 0) || (tolerance.relative !== undefined && !(tolerance.relative >= 0))) {
        report("bad_tolerance");
      }
    }
    if (target.stage !== "compare" && !target.reason?.trim()) report("missing_reason");
  }
  return problems;
}

export function formatScorecard(
  model: { name: string; engineStatus: EngineOutputRun["status"]; issueCodes: string[] },
  rows: ScorecardRow[],
): string {
  const lines = [`## ${model.name}`, ""];
  if (model.engineStatus === "failed") {
    lines.push(`The engine run failed: ${model.issueCodes.join(", ") || "no issue codes"}.`, "");
  }
  const counts = (status: ScorecardStatus) => rows.filter((row) => row.status === status).length;
  lines.push(
    `Matched ${counts("matched")}, off ${counts("off")}, no output ${counts("no_output")}, not reachable ${counts("not_reachable")}, ` +
      `workbook defects held red ${counts("defect_missed")}, workbook defects matched ${counts("defect_matched")}.`,
    "",
    "| Target | Engine output | Status | Percent off | Reason |",
    "|---|---|---|---:|---|",
  );
  for (const row of rows) {
    lines.push(`| ${tableCell(row.id)} | ${row.output ?? ""} | ${row.status} | ${formatPercent(row.percentOff)} | ${tableCell(row.reason ?? "")} |`);
  }
  return lines.join("\n");
}

function compareValues(actual: number | string, expected: number | string, tolerance: { absolute: number; relative?: number }) {
  if (typeof actual === "string" || typeof expected === "string") {
    return { matched: actual === expected, percentOff: null };
  }
  const difference = actual - expected;
  const allowed = Math.max(tolerance.absolute, (tolerance.relative ?? 0) * Math.abs(expected));
  return {
    matched: Math.abs(difference) <= allowed,
    percentOff: expected === 0 ? null : (difference / Math.abs(expected)) * 100,
  };
}

function expectedFits(output: EngineOutputKey, expected: ScorecardTarget["expected"]) {
  if ((MONTH_OUTPUT_KEYS as readonly string[]).includes(output)) {
    return typeof expected === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(expected);
  }
  return typeof expected === "number" && Number.isFinite(expected);
}

const CELL_REFERENCE = /(?<![A-Za-z0-9])\$?[A-Z]{1,3}\$?\d{1,7}(?![0-9])/g;
const FIGURE_PATTERNS = [
  /\$/,
  /\d{5,}/,
  /\d\.\d/,
  /\d\s?(%|percent\b|pct\b|bps\b|basis points\b)/i,
  /\d\s?(k|m|mm|bn|b|thousand|million|billion)\b/i,
];

const VERSION_TAG = /(?<![A-Za-z0-9])v\d+(\.\d+)+(?![0-9.])/g;

/** Flags anything that reads as a deal figure; workbook cell references and version tags are allowed. */
function carriesFigure(text: string) {
  const withoutCellReferences = text.replace(CELL_REFERENCE, "").replace(VERSION_TAG, "");
  const joined = withoutCellReferences.replace(/(\d),(?=\d{3})/g, "$1");
  return FIGURE_PATTERNS.some((pattern) => pattern.test(joined));
}

function tableCell(text: string) {
  return text.replace(/\|/g, "\\|");
}

function formatPercent(value: number | null) {
  if (value === null) return "";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}%`;
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = year * 12 + monthNumber - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}
