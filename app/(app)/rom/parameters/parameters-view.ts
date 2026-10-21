import {
  blendExample,
  CONFIDENCE_SCALE,
  computeRom,
  parameterProblems,
  PARAMETER_NAMES,
  type ConfidenceFlag,
  type EngineParameters,
  type ExampleBlend,
  type ExampleFigure,
  type ParameterName,
  type ProvenanceKind,
  type Rom,
} from "@kulka/engine";

import type { ImpactData, ParameterHistoryEntry } from "@/lib/rom/parameters";

// The Engine Parameters screen's arithmetic-free helpers (LA-866). Every
// number the screen shows about a blend or a flag comes from the engine
// (blendExample, computeRom, parameterProblems); this file only formats,
// parses, and compares.

export type Values = Record<ParameterName, number>;
export type Drafts = Record<ParameterName, string>;

export type Source = {
  kind: ProvenanceKind;
  name: ParameterName;
  label: string;
  sub: string;
  /** The worked example's figure from this source, in words. */
  exampleWords: string;
};

export const SOURCES: readonly Source[] = [
  {
    kind: "actuals",
    name: "weight.actuals",
    label: "Actual Job Cost",
    sub: "Autodesk Cost Actuals",
    exampleWords: "A Real Job",
  },
  {
    kind: "proest_budget",
    name: "weight.proest_budget",
    label: "ProEst Budget",
    sub: "A Budget, Not a Cost",
    exampleWords: "A ProEst Budget",
  },
  {
    kind: "reviewed_judgment",
    name: "weight.reviewed_judgment",
    label: "Estimator Judgment",
    sub: "A Stated, Approved Rule",
    exampleWords: "An Estimator's Rule of Thumb",
  },
  {
    kind: "llm_proposal",
    name: "weight.llm_proposal",
    label: "Model Proposal",
    sub: "Never Prices a Line Alone",
    exampleWords: "A Model's Figure",
  },
];

/**
 * Matt's worked case from 2026-09-21, as stored in the weight reasons: a real
 * job at $22/SF, a ProEst budget at $26, an estimator's rule of thumb at $24,
 * and a model's figure at $30. Each measured or stated figure stands for its
 * own job; a model's figure stands for none.
 */
export const WORKED_EXAMPLE: readonly ExampleFigure[] = [
  { kind: "actuals", rate: 22, sourceProjectId: "worked-example-job" },
  { kind: "proest_budget", rate: 26, sourceProjectId: "worked-example-budget" },
  { kind: "reviewed_judgment", rate: 24, sourceProjectId: "worked-example-rule" },
  { kind: "llm_proposal", rate: 30, sourceProjectId: null },
];

export const TIERS: readonly { flag: ConfidenceFlag; label: string }[] = [
  { flag: "high", label: "High" },
  { flag: "medium", label: "Medium" },
  { flag: "low", label: "Low" },
];

export const FLAG_WORDS: Record<ConfidenceFlag, string> = { high: "High", medium: "Medium", low: "Low" };

type Kind = "weight" | "count" | "score" | "percent";

function kindOf(name: ParameterName): Kind {
  if (name.startsWith("weight.")) return "weight";
  if (name.startsWith("flag.")) return "count";
  if (name.startsWith("confidence.")) return "score";
  return "percent";
}

/** A number with no trailing zeros, at most `places` decimals. */
function trim(value: number, places: number): string {
  return String(Number(value.toFixed(places)));
}

/** What a number box shows for a stored value. Percents show as percents. */
export function inputText(name: ParameterName, value: number): string {
  const kind = kindOf(name);
  if (kind === "percent") return trim(value * 100, 4);
  return trim(value, 4);
}

/**
 * What a number box's text means as the engine reads it. Blank or anything
 * that is not a number reads as NaN, which the engine's own rules refuse.
 */
export function parseInput(name: ParameterName, text: string): number {
  const cleaned = text.trim().replace(/[%,\s]/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d*$/.test(cleaned) || cleaned === "." || cleaned === "-") return Number.NaN;
  const value = Number(cleaned);
  // Rounded so 3.25 percent reads back as 0.0325, not 0.032500000000000001.
  return kindOf(name) === "percent" ? Number((value / 100).toFixed(8)) : value;
}

/** A value with its unit, for history rows and the save tray. */
export function formatValue(name: ParameterName, value: number): string {
  if (!Number.isFinite(value)) return "?";
  const kind = kindOf(name);
  if (kind === "weight") return trim(value, 4);
  if (kind === "count") return `${trim(value, 4)} ${value === 1 ? "Job" : "Jobs"}`;
  if (kind === "score") return `${trim(value, 4)} of ${CONFIDENCE_SCALE}`;
  return `${trim(value * 100, 4)}%`;
}

/** A fraction as a whole-number percent, for how far off a figure sits. */
export function wholePercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function draftsFor(values: Values): Drafts {
  return Object.fromEntries(PARAMETER_NAMES.map((name) => [name, inputText(name, values[name])])) as Drafts;
}

export function valuesFrom(drafts: Drafts): Values {
  return Object.fromEntries(PARAMETER_NAMES.map((name) => [name, parseInput(name, drafts[name])])) as Values;
}

/** The current value of each name: its newest history entry. */
export function currentValues(history: ParameterHistoryEntry[]): Values {
  const values = {} as Values;
  for (const name of PARAMETER_NAMES) {
    const newest = newestFirst(history.filter((h) => h.name === name))[0];
    values[name] = newest ? newest.value : Number.NaN;
  }
  return values;
}

export function newestFirst(entries: ParameterHistoryEntry[]): ParameterHistoryEntry[] {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function changedNames(base: Values, current: Values): ParameterName[] {
  return PARAMETER_NAMES.filter((name) => !Object.is(base[name], current[name]) && base[name] !== current[name]);
}

/** The first problem the engine finds with each value, by name. */
export function problemsByName(values: Values): Partial<Record<ParameterName, string>> {
  const byName: Partial<Record<ParameterName, string>> = {};
  for (const problem of parameterProblems(values)) byName[problem.name] ??= problem.message;
  return byName;
}

/** Values as the engine reads them. Provenance is a placeholder: only the values move a blend. */
export function toEngineParameters(values: Values): EngineParameters {
  return Object.fromEntries(
    PARAMETER_NAMES.map((name) => [
      name,
      {
        value: values[name],
        provenance: { kind: "reviewed_judgment", recordedBy: "unsaved", recordedAt: "", reason: "unsaved" },
      },
    ]),
  ) as EngineParameters;
}

/** Each weight's share of the total weight, as a fraction. A weight at or below zero has none. */
export function weightShares(values: Values): Record<ProvenanceKind, number> {
  const positive = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const total = SOURCES.reduce((sum, s) => sum + positive(values[s.name]), 0);
  return Object.fromEntries(
    SOURCES.map((s) => [s.kind, total > 0 ? positive(values[s.name]) / total : 0]),
  ) as Record<ProvenanceKind, number>;
}

export type WorkedExampleView = {
  blend: ExampleBlend;
  /** One plain sentence on why the example lands in its tier. */
  reason: string;
  /** Each source's share of the blend, as a fraction, from the weight the engine gave it. */
  shares: Record<ProvenanceKind, number>;
  meters: Record<"high" | "medium", TierMeter>;
};

export type TierMeter = { count: number; need: number; dispersion: number; allows: number; meets: boolean };

/**
 * The worked example under `values`, blended and flagged by the engine, or
 * null when the engine would refuse the values.
 */
export function workedExample(values: Values): WorkedExampleView | null {
  if (parameterProblems(values).length > 0) return null;
  const blend = blendExample([...WORKED_EXAMPLE], toEngineParameters(values));
  const shares = Object.fromEntries(
    blend.comparables.map((c) => [c.kind, c.weight / blend.totalWeight]),
  ) as Record<ProvenanceKind, number>;
  const rank: Record<ConfidenceFlag, number> = { high: 2, medium: 1, low: 0 };
  const meter = (flag: "high" | "medium"): TierMeter => ({
    count: blend.comparableCount,
    need: values[`flag.${flag}_min_comparables`],
    dispersion: blend.dispersion,
    allows: values[`spread.${flag}`],
    // Whether the engine's own flag reached this tier, so the meter cannot
    // disagree with the flag it sits beside.
    meets: rank[blend.confidence] >= rank[flag],
  });
  return { blend, reason: exampleReason(blend, values), shares, meters: { high: meter("high"), medium: meter("medium") } };
}

function comparables(count: number): string {
  return `${count} ${count === 1 ? "comparable" : "comparables"}`;
}

export function exampleReason(blend: ExampleBlend, values: Values): string {
  const n = blend.comparableCount;
  const high = values["flag.high_min_comparables"];
  const medium = values["flag.medium_min_comparables"];
  if (blend.confidence === "high") {
    return `${comparables(n)}, all within ${wholePercent(values["spread.high"])} of the blend.`;
  }
  if (blend.confidence === "medium") {
    if (!blend.hasMeasured) return "No measured Kulka figure is in the blend, so it stops at Medium.";
    if (n < high) return `${comparables(n)}. High needs ${high}.`;
    return `The widest comparable sits ${wholePercent(blend.dispersion)} off. High allows ${wholePercent(values["spread.high"])}.`;
  }
  if (n < medium) return `${comparables(n)}. Medium needs ${medium}.`;
  return `The widest comparable sits ${wholePercent(blend.dispersion)} off. Medium allows ${wholePercent(values["spread.medium"])}.`;
}

/** The total a run reads: with markups when it priced them, trade cost otherwise. Midpoint of the range. */
export function runTotal(rom: Rom): number {
  const range = rom.markups ? rom.markups.totalProjectCost : rom.total;
  return (range.low + range.high) / 2;
}

export type ImpactRow = {
  runId: string;
  projectName: string;
  grossSquareFeet: number;
  before: number | null;
  after: number | null;
  /** The change as a fraction of `before`, or null when either side could not be computed. */
  change: number | null;
  error: string | null;
};

/**
 * Each saved run recomputed by the engine over today's data, once with the
 * saved parameters and once with the edited ones.
 */
export function impactRows(impact: ImpactData, base: Values, edited: Values): ImpactRow[] {
  const baseParameters = toEngineParameters(base);
  const editedParameters = toEngineParameters(edited);
  return impact.runs.map((run) => {
    const snapshot = impact.snapshots[run.snapshotKey];
    const row: ImpactRow = {
      runId: run.runId,
      projectName: run.projectName,
      grossSquareFeet: run.grossSquareFeet,
      before: null,
      after: null,
      change: null,
      error: null,
    };
    try {
      row.before = runTotal(computeRom(run.answers, { ...snapshot, parameters: baseParameters }));
      row.after = runTotal(computeRom(run.answers, { ...snapshot, parameters: editedParameters }));
      row.change = row.before > 0 ? (row.after - row.before) / row.before : 0;
    } catch (cause) {
      row.error = cause instanceof Error ? cause.message : String(cause);
    }
    return row;
  });
}

/** Up or down arrows nudge a box by one step, or five with Shift. Never below zero. */
export function nudge(name: ParameterName, value: number, direction: 1 | -1, shift: boolean): number {
  const kind = kindOf(name);
  const step = kind === "weight" ? 0.5 : kind === "count" || kind === "score" ? 1 : name.startsWith("spread.") ? 0.01 : 0.0025;
  const from = Number.isFinite(value) ? value : 0;
  const next = from + direction * step * (shift ? 5 : 1);
  return Math.max(0, Number(next.toFixed(8)));
}

export function money(value: number): string {
  return `$${(value / 1e6).toFixed(2)}M`;
}

export function signedPercent(fraction: number): string {
  return `${fraction > 0 ? "+" : ""}${(fraction * 100).toFixed(1)}%`;
}
