// The ROM engine. `CONTEXT.md` defines the terms: a ROM is a ranged budget with
// a confidence flag on every line and a plain list of what was assumed.
//
// Everything here is a pure function of its arguments. Nothing in it reads a
// clock, a network, or a database. That is what makes a backtest repeatable and
// what LA-9 means by determinism: the same answers over the same snapshot give
// the same ROM, byte for byte.
//
// No cost judgment sits in this file. Blend weights, flag thresholds, and range
// widths arrive in the snapshot as engine parameters, each with its own
// provenance (LA-14). The engine refuses to run without them rather than fall
// back to a number nobody recorded.

import type { BranchGateAnswer } from "./rom-intake";

export type ProjectType = "multifamily" | "self_storage";
export type ConstructionKind = "new" | "renovation";
export type ConfidenceFlag = "high" | "medium" | "low";

/**
 * Building work or site work (CONTEXT.md: Scope side). Every canonical work
 * item carries a default (LA-677, LA-679); this is that default or a line's
 * own override, carried onto the priced line.
 */
export type ScopeSide = "building" | "site";

/**
 * Kulka's own contract or bought by the owner direct, such as appliances or a
 * trash compactor (CONTEXT.md: Contract side). LA-679.
 */
export type ContractSide = "kulka" | "owner";

/**
 * Where a benchmark's number came from. Required on every benchmark.
 *
 * `actuals` and `proest_budget` are measured: they came out of a Kulka file.
 * `reviewed_judgment` is a person's stated rule. `llm_proposal` is a model's
 * figure for a work item with no Kulka data behind it; it is the lightest
 * signal in the blend and never leaves the building unexamined (LA-9).
 */
export type ProvenanceKind = "actuals" | "proest_budget" | "reviewed_judgment" | "llm_proposal";

/** Heaviest to lightest. The blend weights themselves are parameters; this is only the tie-break order. */
const KIND_ORDER: readonly ProvenanceKind[] = [
  "actuals",
  "proest_budget",
  "reviewed_judgment",
  "llm_proposal",
];

const MEASURED_KINDS: ReadonlySet<ProvenanceKind> = new Set(["actuals", "proest_budget"]);

export type Provenance = {
  kind: ProvenanceKind;
  /** The past Kulka projects whose costs produced the value. */
  sourceProjectIds: string[];
  /** The export the value was read from, when one exists. */
  exportLabel: string | null;
  /** The person who recorded or reviewed it. */
  recordedBy: string;
  /** ISO date. Provenance without a date is not provenance. */
  recordedAt: string;
};

export type Benchmark = {
  costCode: string;
  label: string;
  unit: "usd_per_gsf";
  value: number;
  projectType: ProjectType;
  constructionKind: ConstructionKind;
  provenance: Provenance;
  scopeSide: ScopeSide;
  contractSide: ContractSide;
};

/**
 * Where a parameter's value came from. `reviewed_judgment` until LA-23's
 * backtest measures it, `backtest` after.
 */
export type ParameterProvenance = {
  kind: "reviewed_judgment" | "backtest";
  recordedBy: string;
  recordedAt: string;
  reason: string;
};

export type EngineParameter = {
  value: number;
  provenance: ParameterProvenance;
};

/**
 * The names the engine reads. `weight.*` is the blend weight of a provenance
 * kind. `flag.*` is the minimum comparable count for a tier. `spread.*` is a
 * tier's half-width as a fraction of the midpoint, which also bounds how far
 * apart the comparables may sit for a line to earn that tier.
 */
export type ParameterName =
  | `weight.${ProvenanceKind}`
  | "flag.high_min_comparables"
  | "flag.medium_min_comparables"
  | `spread.${ConfidenceFlag}`;

export type EngineParameters = Partial<Record<ParameterName, EngineParameter>>;

type JudgmentProvenance = Omit<Provenance, "kind"> & { kind: "reviewed_judgment" };

/**
 * An estimator's stated rule, entered and approved as data (LA-19): what one
 * condition is worth on one cost code, in dollars per gross square foot, with
 * the person who stated it and the date they stated it.
 *
 * A rule is a signal in the blend, not an override. It moves a line by its own
 * weight's share of that line's total weight, so measured Kulka figures on the
 * same cost code outweigh it, and outweigh it further as more of them arrive.
 */
export type JudgmentRule = {
  id: string;
  costCode: string;
  projectType: ProjectType;
  constructionKind: ConstructionKind;
  /**
   * The fact in the answers the rule turns on, or null when it applies to every
   * project of this type and kind. The value is text because that is how a rule
   * is entered and stored, and a fact is compared to it as text.
   */
  condition: { fact: string; equals: string } | null;
  /** What the rule adds to the line's rate, or takes off it when negative. */
  adjustmentUsdPerGsf: number;
  provenance: JudgmentProvenance;
};

/** One approved rule's effect on one line, carried onto the line so the ROM can flag it. */
export type JudgmentAdjustment = {
  ruleId: string;
  kind: "reviewed_judgment";
  /** What the rule states the condition is worth. */
  adjustmentUsdPerGsf: number;
  /** What it actually moved the line's rate, after the line's other signals had their weight. */
  appliedUsdPerGsf: number;
  weight: number;
  recordedBy: string;
  recordedAt: string;
};

/** Everything the engine is allowed to read. The caller loads it; the engine does not. */
export type DataSnapshot = {
  benchmarks: Benchmark[];
  parameters: EngineParameters;
  /** Approved judgment rules (LA-19). A snapshot without any behaves exactly as before. */
  judgmentRules?: JudgmentRule[];
};

export type Answers = {
  projectType: ProjectType;
  constructionKind: ConstructionKind;
  grossSquareFeet: number;
  /** The project facts a judgment rule's condition reads, such as whether the job has a basement level. */
  facts?: Record<string, string | number | boolean>;
  /** Every branch gate the intake asked, by section (CONTEXT.md: Branch gate). */
  branchGates?: Record<string, BranchGateAnswer>;
};

/** One figure that went into a line's blend. */
export type Comparable = {
  kind: ProvenanceKind;
  /** Dollars per gross square foot this figure contributed. */
  rate: number;
  weight: number;
  sourceProjectIds: string[];
  exportLabel: string | null;
  recordedBy: string;
  recordedAt: string;
};

export type RomLine = {
  costCode: string;
  label: string;
  low: number;
  high: number;
  confidence: ConfidenceFlag;
  /** True holds the line back from leaving the building unexamined (LA-9). */
  heldForReview: boolean;
  /** Distinct Kulka projects standing behind the line. An LLM figure adds none. */
  comparableCount: number;
  /** Every figure in the blend, heaviest first. The flag cites these (LA-9). */
  comparables: Comparable[];
  /** Every approved judgment rule that moved this line, with who stated it and when (LA-19). */
  judgmentAdjustments: JudgmentAdjustment[];
  scopeSide: ScopeSide;
  contractSide: ContractSide;
};

export type Rom = {
  lines: RomLine[];
  /**
   * Total project cost: Kulka's contract plus whatever construction-trade
   * scope the owner buys direct (CONTEXT.md: Total project cost). This is
   * every line, the same sum this field always computed before contract side
   * existed.
   */
  total: { low: number; high: number };
  /**
   * Kulka's own contract only, excluding owner-direct lines such as
   * appliances or a trash compactor (LA-679: "The ROM shows two totals on
   * screen at all times: Kulka's contract and total project cost.").
   */
  kulkaContractTotal: { low: number; high: number };
  assumptions: string[];
  /** The parameters this ROM was computed with, provenance included, so a run record is self-describing. */
  parameters: EngineParameters;
};

export function computeRom(answers: Answers, snapshot: DataSnapshot): Rom {
  if (!(answers.grossSquareFeet > 0)) {
    throw new Error("A ROM needs gross square feet above zero.");
  }

  const tiers = readTiers(snapshot.parameters);

  // New construction and renovation are never blended, and neither are project
  // types. LA-9 sets that as the first dividing line.
  const matched = snapshot.benchmarks.filter(
    (b) =>
      b.projectType === answers.projectType &&
      b.constructionKind === answers.constructionKind,
  );

  const byCostCode = new Map<string, Benchmark[]>();
  for (const benchmark of matched) {
    const group = byCostCode.get(benchmark.costCode);
    if (group) group.push(benchmark);
    else byCostCode.set(benchmark.costCode, [benchmark]);
  }

  const rulesByCostCode = groupJudgmentRules(snapshot.judgmentRules ?? [], answers);

  const lines = [...byCostCode.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((costCode) =>
      blendLine(
        byCostCode.get(costCode)!,
        answers.grossSquareFeet,
        snapshot.parameters,
        tiers,
        rulesByCostCode.get(costCode) ?? [],
      ),
    );
  const kulkaLines = lines.filter((l) => l.contractSide === "kulka");

  return {
    lines,
    total: {
      low: lines.reduce((sum, l) => sum + l.low, 0),
      high: lines.reduce((sum, l) => sum + l.high, 0),
    },
    kulkaContractTotal: {
      low: kulkaLines.reduce((sum, l) => sum + l.low, 0),
      high: kulkaLines.reduce((sum, l) => sum + l.high, 0),
    },
    assumptions: assumptionsFor(answers, lines),
    parameters: snapshot.parameters,
  };
}

type Tiers = {
  highMinComparables: number;
  mediumMinComparables: number;
  spread: Record<ConfidenceFlag, number>;
};

function requireParameter(parameters: EngineParameters, name: ParameterName): number {
  const parameter = parameters[name];
  if (!parameter) {
    throw new Error(
      `No engine parameter "${name}" is recorded, so the engine cannot run. Record one with its provenance.`,
    );
  }
  if (!Number.isFinite(parameter.value)) {
    throw new Error(`Engine parameter "${name}" is not a finite number.`);
  }
  return parameter.value;
}

function readTiers(parameters: EngineParameters): Tiers {
  const highMinComparables = requireParameter(parameters, "flag.high_min_comparables");
  const mediumMinComparables = requireParameter(parameters, "flag.medium_min_comparables");
  const spread = {
    high: requireParameter(parameters, "spread.high"),
    medium: requireParameter(parameters, "spread.medium"),
    low: requireParameter(parameters, "spread.low"),
  };

  for (const name of ["flag.high_min_comparables", "flag.medium_min_comparables"] as const) {
    const value = parameters[name]!.value;
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`Engine parameter "${name}" must be a whole number of at least one.`);
    }
  }
  if (highMinComparables < mediumMinComparables) {
    throw new Error(
      'Engine parameter "flag.high_min_comparables" must not be below "flag.medium_min_comparables".',
    );
  }
  for (const flag of ["high", "medium", "low"] as const) {
    if (!(spread[flag] > 0 && spread[flag] < 1)) {
      throw new Error(`Engine parameter "spread.${flag}" must be a fraction between zero and one.`);
    }
  }
  if (!(spread.high <= spread.medium && spread.medium <= spread.low)) {
    throw new Error("Engine spreads must not narrow as confidence drops: high <= medium <= low.");
  }

  return { highMinComparables, mediumMinComparables, spread };
}

function weightFor(parameters: EngineParameters, kind: ProvenanceKind): number {
  const weight = requireParameter(parameters, `weight.${kind}`);
  if (!(weight > 0)) {
    throw new Error(`Engine parameter "weight.${kind}" must be above zero.`);
  }
  return weight;
}

/**
 * One cost code's rows become one line. Sorting is total, so the same rows in
 * any order give the same line, and the heaviest figure decides the label and
 * sides where rows disagree.
 */
/**
 * The rules that apply to this project, by cost code. A rule applies when its
 * project type and construction kind match and its condition holds; a rule with
 * no condition applies to every project of that type and kind. A rule never
 * creates a line: it only moves a line that already has a benchmark behind it.
 */
function groupJudgmentRules(rules: JudgmentRule[], answers: Answers): Map<string, JudgmentRule[]> {
  const applies = (rule: JudgmentRule) => {
    if (rule.projectType !== answers.projectType) return false;
    if (rule.constructionKind !== answers.constructionKind) return false;
    if (!rule.condition) return true;
    // A rule's value is always text, while a fact off a number question is a
    // number, so both are read as text. Comparing them raw would drop the rule
    // without a word.
    const fact = answers.facts?.[rule.condition.fact];
    return fact !== undefined && String(fact) === rule.condition.equals;
  };

  const byCostCode = new Map<string, JudgmentRule[]>();
  for (const rule of rules.filter(applies)) {
    const group = byCostCode.get(rule.costCode);
    if (group) group.push(rule);
    else byCostCode.set(rule.costCode, [rule]);
  }
  // Sorted so two rules on one cost code apply in the same order every run,
  // whatever order the caller read them in.
  for (const group of byCostCode.values()) {
    group.sort((a, b) => a.provenance.recordedAt.localeCompare(b.provenance.recordedAt) || a.id.localeCompare(b.id));
  }
  return byCostCode;
}

/**
 * Each rule moves the rate by its own weight's share of the line's total
 * weight, and then counts toward that total for the rule after it. A line
 * standing on one budget figure moves most of the way to the rule; the same
 * line once five real jobs back it barely moves at all, which is what LA-19
 * means by actuals outweighing the rule.
 */
function applyJudgment(
  rate: number,
  weightSoFar: number,
  rules: JudgmentRule[],
  judgmentWeight: number,
): { rate: number; adjustments: JudgmentAdjustment[] } {
  let adjusted = rate;
  let total = weightSoFar;
  const adjustments: JudgmentAdjustment[] = [];

  for (const rule of rules) {
    const applied = (rule.adjustmentUsdPerGsf * judgmentWeight) / (total + judgmentWeight);
    adjusted += applied;
    total += judgmentWeight;
    adjustments.push({
      ruleId: rule.id,
      kind: "reviewed_judgment",
      adjustmentUsdPerGsf: rule.adjustmentUsdPerGsf,
      appliedUsdPerGsf: applied,
      weight: judgmentWeight,
      recordedBy: rule.provenance.recordedBy,
      recordedAt: rule.provenance.recordedAt,
    });
  }

  return { rate: adjusted, adjustments };
}

function blendLine(
  rows: Benchmark[],
  grossSquareFeet: number,
  parameters: EngineParameters,
  tiers: Tiers,
  rules: JudgmentRule[],
): RomLine {
  const ranked = rows
    .map((row) => ({ row, comparable: toComparable(row, weightFor(parameters, row.provenance.kind)) }))
    .sort((a, b) => compareComparables(a.comparable, b.comparable));
  const comparables = ranked.map((r) => r.comparable);
  const lead = ranked[0].row;

  const totalWeight = comparables.reduce((sum, c) => sum + c.weight, 0);
  const rate = comparables.reduce((sum, c) => sum + c.weight * c.rate, 0) / totalWeight;

  const counted = comparables.filter((c) => c.kind !== "llm_proposal");
  const measured = comparables.filter((c) => MEASURED_KINDS.has(c.kind));
  const comparableCount = new Set(counted.flatMap((c) => c.sourceProjectIds)).size;

  // The flag stays a reading of the measured figures and how far apart they
  // sit, so a judgment rule moves the money without moving the confidence.
  const confidence = flagFor(rate, counted, measured, comparableCount, tiers);
  const judgment =
    rules.length > 0
      ? applyJudgment(rate, totalWeight, rules, weightFor(parameters, "reviewed_judgment"))
      : { rate, adjustments: [] as JudgmentAdjustment[] };
  const half = tiers.spread[confidence];
  const midpoint = judgment.rate * grossSquareFeet;

  return {
    costCode: lead.costCode,
    label: lead.label,
    low: Math.round(midpoint * (1 - half)),
    high: Math.round(midpoint * (1 + half)),
    confidence,
    heldForReview: confidence === "low",
    comparableCount,
    comparables,
    judgmentAdjustments: judgment.adjustments,
    scopeSide: lead.scopeSide,
    contractSide: lead.contractSide,
  };
}

function toComparable(row: Benchmark, weight: number): Comparable {
  return {
    kind: row.provenance.kind,
    rate: row.value,
    weight,
    sourceProjectIds: [...row.provenance.sourceProjectIds].sort(),
    exportLabel: row.provenance.exportLabel,
    recordedBy: row.provenance.recordedBy,
    recordedAt: row.provenance.recordedAt,
  };
}

function compareComparables(a: Comparable, b: Comparable): number {
  return (
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
    b.recordedAt.localeCompare(a.recordedAt) ||
    a.sourceProjectIds.join(",").localeCompare(b.sourceProjectIds.join(",")) ||
    (a.exportLabel ?? "").localeCompare(b.exportLabel ?? "") ||
    a.rate - b.rate
  );
}

/**
 * The flag is the highest tier whose minimum comparable count is met and whose
 * spread the comparables stay inside. A line with no measured figure caps at
 * medium; a line with nothing but a model's figure is low (LA-9: the LLM
 * "never solely determines a line", so such a line is always held).
 */
function flagFor(
  rate: number,
  counted: Comparable[],
  measured: Comparable[],
  comparableCount: number,
  tiers: Tiers,
): ConfidenceFlag {
  if (counted.length === 0) return "low";

  const dispersion = counted.reduce((worst, c) => Math.max(worst, Math.abs(c.rate - rate) / rate), 0);
  const ceiling: ConfidenceFlag = measured.length > 0 ? "high" : "medium";

  if (
    ceiling === "high" &&
    comparableCount >= tiers.highMinComparables &&
    dispersion <= tiers.spread.high
  ) {
    return "high";
  }
  if (comparableCount >= tiers.mediumMinComparables && dispersion <= tiers.spread.medium) {
    return "medium";
  }
  return "low";
}

const KIND_WORDS: Record<ConstructionKind, string> = {
  new: "new construction",
  renovation: "renovation",
};

const TYPE_WORDS: Record<ProjectType, string> = {
  multifamily: "multifamily",
  self_storage: "self-storage",
};

function assumptionsFor(answers: Answers, lines: RomLine[]): string[] {
  const area = answers.grossSquareFeet.toLocaleString("en-US");
  const assumptions = [
    `The project is ${TYPE_WORDS[answers.projectType]} ${KIND_WORDS[answers.constructionKind]}.`,
    `Gross floor area is ${area} square feet.`,
    "Every line is a range rather than a point, and no line here is a bid.",
    "Blend weights, flag thresholds, and range widths are recorded engine parameters, each with its own provenance, listed with this ROM.",
  ];

  if (lines.length === 0) {
    assumptions.push(
      "No benchmark in the database matches this project type and construction kind, so this ROM has no lines.",
    );
    return assumptions;
  }

  const held = lines.filter((l) => l.heldForReview);
  if (held.length > 0) {
    assumptions.push(
      `${held.length} of ${lines.length} lines are low confidence and are held for review before this ROM goes anywhere.`,
    );
  }

  const modelOnly = lines.filter((l) => l.comparables.every((c) => c.kind === "llm_proposal"));
  if (modelOnly.length > 0) {
    assumptions.push(
      `${modelOnly.length} of ${lines.length} lines rest on no Kulka data at all: a model proposed the figure, and each is flagged low and held for review.`,
    );
  }

  const judgmentOnly = lines.filter(
    (l) =>
      !l.comparables.some((c) => MEASURED_KINDS.has(c.kind)) &&
      l.comparables.some((c) => c.kind === "reviewed_judgment"),
  );
  if (judgmentOnly.length > 0) {
    assumptions.push(
      `${judgmentOnly.length} of ${lines.length} lines rest on estimator judgment with no measured Kulka figure behind them yet.`,
    );
  }

  const judgmentAdjusted = lines.filter((l) => l.judgmentAdjustments.length > 0);
  if (judgmentAdjusted.length > 0) {
    assumptions.push(
      `${judgmentAdjusted.length} of ${lines.length} lines carry an approved estimator rule, flagged as judgment with the person who stated it and the date. Measured Kulka figures on the same line outweigh the rule.`,
    );
  }

  // A branch gate's answer has to show on the face of the ROM, or the intake
  // asks a question that changes nothing (CONTEXT.md: Branch gate).
  //
  // Pricing a closed section's own lines at zero needs a map from a section to
  // the cost codes it covers, and no such map exists yet in the schema. Until
  // one does, a "no" is stated here rather than guessed at.
  const gates = Object.entries(answers.branchGates ?? {});
  const closed = gates.filter(([, answer]) => answer === "no").map(([section]) => section);
  const tbd = gates.filter(([, answer]) => answer === "dont_know").map(([section]) => section);
  if (closed.length > 0) {
    assumptions.push(`Answered no, so this budget carries nothing for: ${closed.join(", ")}.`);
  }
  if (tbd.length > 0) {
    assumptions.push(
      `${tbd.length} ${tbd.length === 1 ? "item sits" : "items sit"} outside this total as TBD, because nobody knows the answer yet: ${tbd.join(", ")}.`,
    );
  }

  // LA-679: owner-direct lines stay in total project cost but come out of
  // Kulka's own contract total, so the gap between the two totals needs its
  // own stated reason rather than silently appearing on screen.
  const ownerDirect = lines.filter((l) => l.contractSide === "owner");
  if (ownerDirect.length > 0) {
    assumptions.push(
      `${ownerDirect.length} of ${lines.length} lines are owner-direct scope, included in total project cost and excluded from Kulka's contract total.`,
    );
  }

  return assumptions;
}
