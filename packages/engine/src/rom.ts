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
import {
  resolveGateItems,
  type BranchGateItemRule,
  type GateLineStatus,
} from "./rom-gates";
import {
  computeMarkups,
  type FieldOfficeRate,
  type MarkupChoices,
  type MarkupHistoryRow,
  type Markups,
  type StaffingRate,
} from "./rom-markups";

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
 * apart the comparables may sit for a line to earn that tier. `fee.rate` and
 * `insurance.rate` are the default markup rates below the trade subtotal, as
 * fractions (LA-1016).
 */
export type ParameterName =
  | `weight.${ProvenanceKind}`
  | "flag.high_min_comparables"
  | "flag.medium_min_comparables"
  | `spread.${ConfidenceFlag}`
  | "fee.rate"
  | "insurance.rate";

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

/**
 * Which tier of information detail a block's quantity arrived at (LA-884).
 * These are tiers of detail, never storeys of a building.
 *
 * 1 is area in square feet. 2 is counts of whole objects at building or unit
 * scale. 3 is points inside a room, or a spec choice. 4 is material and labor,
 * below the threshold and never asked for.
 */
export type DetailLevel = 1 | 2 | 3 | 4;

/**
 * One physical thing that arrives as a single fact and costs across several
 * trades. Four elevators is one number from a developer and five blocks in the
 * budget. Text rather than a union, because which elements exist is Kulka's
 * stated list in the database, not the engine's to fix.
 */
export type Element = string;

/**
 * What Kulka has stated about one cost code: its level, its element where it
 * has one, the level 1 lump it is carved out of where it is a breakout, and the
 * package it was bought under.
 *
 * The engine never infers any of this. A cost code with no row comes back on
 * the line as nulls, and the board shows it as unclassified.
 */
export type BlockClassification = {
  costCode: string;
  detailLevel: DetailLevel;
  element: Element | null;
  /** The cost code of the level 1 lump that already contains this scope. */
  breakoutOfCostCode: string | null;
  buyoutPackage: string | null;
  statedBy: string;
  statedOn: string;
  reason: string;
};

/** Everything the engine is allowed to read. The caller loads it; the engine does not. */
export type DataSnapshot = {
  benchmarks: Benchmark[];
  parameters: EngineParameters;
  /** Approved judgment rules (LA-19). A snapshot without any behaves exactly as before. */
  judgmentRules?: JudgmentRule[];
  /** Stated block classifications (LA-884). A snapshot without any leaves every line unclassified. */
  classifications?: BlockClassification[];
  /** Real GRs/GCs figures from imported budgets (LA-1016). */
  markupHistory?: MarkupHistoryRow[];
  /** gc_staffing_rates, for the staffing and duration method (LA-1016). */
  staffingRates?: StaffingRate[];
  /** gc_field_office_rates, for the staffing and duration method (LA-1016). */
  fieldOfficeRates?: FieldOfficeRate[];
  /**
   * The map from a branch gate (or an intake field such as parking type) to
   * the one canonical item it switches on or off (LA-1028). A snapshot
   * without any leaves every line priced exactly as it would with no gates
   * at all, which is how every ROM computed before LA-1028 reads.
   */
  branchGateItems?: BranchGateItemRule[];
};

export type Answers = {
  projectType: ProjectType;
  constructionKind: ConstructionKind;
  grossSquareFeet: number;
  /** The project facts a judgment rule's condition reads, such as whether the job has a basement level. */
  facts?: Record<string, string | number | boolean>;
  /** Every branch gate the intake asked, by section (CONTEXT.md: Branch gate). */
  branchGates?: Record<string, BranchGateAnswer>;
  /**
   * The GRs/GCs, fee and insurance choices (LA-1016). When present the ROM
   * carries a markup waterfall below the trade subtotal; when absent it has
   * none, which is how every ROM computed before LA-1016 reads.
   */
  markups?: MarkupChoices;
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
  /**
   * The tier of detail this block's quantity arrived at, or null when nobody
   * has classified the cost code yet (LA-884). Null is shown as unclassified
   * and never filled in with a guess.
   */
  detailLevel: DetailLevel | null;
  /** The element this block belongs to, or null when it belongs to none. */
  element: Element | null;
  /**
   * The cost code of the level 1 lump this block is carved out of, or null
   * when the block adds to the total in the ordinary way. A block with a parent
   * here keeps its own cost and adds nothing, because the parent rate already
   * contains it.
   */
  breakoutOf: string | null;
  /** The subcontract this scope was bought under, or null when nobody has said. */
  buyoutPackage: string | null;
  /**
   * What a branch gate did to this line (LA-1028), or null when no gate rule
   * names this cost code, which reads exactly as `"priced"` for the total and
   * the markup subtotal. `"not_in_job"` and `"tbd"` are zeroed here and left
   * out of both; `"assumed_present"` prices normally but is named on the ROM.
   */
  gateStatus: GateLineStatus | null;
};

/** One item a branch gate named on the face of the ROM (LA-1028). */
export type GateItemSummary = {
  costCode: string;
  label: string;
  /** The question or questions that produced this status, in plain words. */
  question: string;
};

export type Rom = {
  lines: RomLine[];
  /**
   * Trade cost only, before any 90-series markup: Kulka's contract trade lines
   * plus whatever construction-trade scope the owner buys direct. It keeps
   * this meaning after LA-1016 on purpose, because lib/rom/issue.ts's closing
   * comparison reads it as predicted trade cost, and the backtest measures
   * trade cost (docs/precon/rom-spec.md). The markups and the totals that
   * include them live in `markups` below.
   *
   * Every line except a breakout. A breakout is carved out of a level 1 lump
   * whose rate already contains it, so adding it here would count that scope
   * twice (LA-884).
   */
  total: { low: number; high: number };
  /**
   * Kulka's own contract only, excluding owner-direct lines such as
   * appliances or a trash compactor (LA-679: "The ROM shows two totals on
   * screen at all times: Kulka's contract and total project cost.").
   * Breakouts come out of this total for the same reason they come out of the
   * one above.
   */
  kulkaContractTotal: { low: number; high: number };
  /**
   * The waterfall below the trade subtotal: GRs/GCs, fee, insurance, and the
   * totals with them (LA-1016). Absent on a ROM computed without markup
   * choices, including every run recorded before LA-1016.
   */
  markups?: Markups;
  /**
   * What the breakouts are worth. It is not part of either total, and it is
   * reported so a reader can see the scope was priced rather than forgotten.
   */
  carvedOut: { low: number; high: number };
  /** Items a branch gate answered "no", named and removed from the total (LA-1028). */
  notInThisJob: GateItemSummary[];
  /** Items a branch gate answered "don't know", named and TBD, outside the total (LA-1028). */
  tbdGateItems: GateItemSummary[];
  /** Items nobody answered, priced same as any other line but named as assumed present (LA-1028). */
  assumedPresentItems: GateItemSummary[];
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
  const classificationsByCostCode = new Map(
    (snapshot.classifications ?? []).map((c) => [c.costCode, c]),
  );

  const blended = [...byCostCode.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((costCode) =>
      blendLine(
        byCostCode.get(costCode)!,
        answers.grossSquareFeet,
        snapshot.parameters,
        tiers,
        rulesByCostCode.get(costCode) ?? [],
        classificationsByCostCode.get(costCode) ?? null,
      ),
    );

  // A branch gate can switch a canonical item on or off (LA-1028). The
  // answers a gate rule reads sit in `facts`, whatever the caller named that
  // section: a branch gate's own section, or an intake field such as
  // "parkingType". Read as text, because a gate answer is always a word
  // ("yes", "no", "structured"), never a number.
  const factsAsText: Record<string, string> = {};
  for (const [key, value] of Object.entries(answers.facts ?? {})) factsAsText[key] = String(value);
  const gateRules = snapshot.branchGateItems ?? [];
  const gateResolutions = resolveGateItems(gateRules, factsAsText);

  const lines = blended.map((line) => {
    const resolution = gateResolutions.get(line.costCode);
    if (!resolution) return { ...line, gateStatus: null };
    // "not_in_job" and "tbd" both come out of every total and the markup
    // subtotal, so they are zeroed here rather than left with a rate that
    // would otherwise leak into `sumRange` below.
    if (resolution.status === "not_in_job" || resolution.status === "tbd") {
      return { ...line, gateStatus: resolution.status, low: 0, high: 0 };
    }
    return { ...line, gateStatus: resolution.status };
  });

  const gateSummary = (status: GateLineStatus): GateItemSummary[] =>
    lines
      .filter((l) => l.gateStatus === status)
      .map((l) => ({
        costCode: l.costCode,
        label: l.label,
        question: sectionWords(gateResolutions.get(l.costCode)!.sections.join(" and ")),
      }));
  const notInThisJob = gateSummary("not_in_job");
  const tbdGateItems = gateSummary("tbd");
  const assumedPresentItems = gateSummary("assumed_present");

  // A breakout's parent lump already contains it, so it is priced, shown, and
  // left out of both totals (LA-884). A gated-off or TBD line is excluded the
  // same way, and its rate is already zero above, so summing it changes
  // nothing but keeps this one filter reading as "what counts toward the
  // total" rather than two separate exclusions.
  const added = lines.filter((l) => l.breakoutOf === null && l.gateStatus !== "not_in_job" && l.gateStatus !== "tbd");
  const carved = lines.filter((l) => l.breakoutOf !== null);
  const kulkaLines = added.filter((l) => l.contractSide === "kulka");
  const ownerLines = added.filter((l) => l.contractSide === "owner");
  const kulkaContractTotal = sumRange(kulkaLines);
  const coveredSections = new Set(gateRules.flatMap((r) => [r.section, ...r.requiresAllSections]));
  const assumptions = assumptionsFor(answers, lines, coveredSections, notInThisJob, tbdGateItems, assumedPresentItems);

  const rom: Rom = {
    lines,
    total: sumRange(added),
    kulkaContractTotal,
    carvedOut: sumRange(carved),
    notInThisJob,
    tbdGateItems,
    assumedPresentItems,
    assumptions,
    parameters: snapshot.parameters,
  };

  if (answers.markups) {
    // Markups apply to Kulka's contract only. Owner-direct lines stay out of
    // the base and are added back once, below the waterfall, as part of total
    // project cost (CONTEXT.md: Contract side, Total project cost).
    rom.markups = computeMarkups({
      subtotal: kulkaContractTotal,
      ownerDirect: sumRange(ownerLines),
      grossSquareFeet: answers.grossSquareFeet,
      choices: answers.markups,
      history: snapshot.markupHistory ?? [],
      staffingRates: snapshot.staffingRates ?? [],
      fieldOfficeRates: snapshot.fieldOfficeRates ?? [],
      feeParameter: snapshot.parameters["fee.rate"],
      insuranceParameter: snapshot.parameters["insurance.rate"],
    });
    assumptions.push(...rom.markups.assumptions);
  }

  return rom;
}

function sumRange(lines: RomLine[]): { low: number; high: number } {
  return {
    low: lines.reduce((sum, l) => sum + l.low, 0),
    high: lines.reduce((sum, l) => sum + l.high, 0),
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
  classification: BlockClassification | null,
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
    detailLevel: classification?.detailLevel ?? null,
    element: classification?.element ?? null,
    breakoutOf: classification?.breakoutOfCostCode ?? null,
    buyoutPackage: classification?.buyoutPackage ?? null,
    // Set by computeRom once it has resolved the gate map against this cost
    // code (LA-1028). blendLine itself never reads a gate.
    gateStatus: null,
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

/**
 * A branch gate section reads as words on the face of the ROM. The section is a
 * key the definition file chose, and a reader of a budget should never be shown
 * one.
 */
function sectionWords(section: string): string {
  return section.replace(/_/g, " ");
}

function countWords(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function assumptionsFor(
  answers: Answers,
  lines: RomLine[],
  coveredSections: ReadonlySet<string>,
  notInThisJob: GateItemSummary[],
  tbdGateItems: GateItemSummary[],
  assumedPresentItems: GateItemSummary[],
): string[] {
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
  // Where a gate has a stated map onto a canonical item (LA-1028's
  // branch_gate_items, read by computeRom above into notInThisJob,
  // tbdGateItems, and assumedPresentItems), that item-level list is the real
  // account of what happened, so it is used here instead of the section-level
  // words below. A section with no item behind it, such as
  // existing_building_tie_in, has no such list, so it still falls back to
  // stating the section by name only, the way every gate did before this map
  // existed.
  const gates = Object.entries(answers.branchGates ?? {}).filter(([section]) => !coveredSections.has(section));
  const closed = gates.filter(([, answer]) => answer === "no").map(([section]) => sectionWords(section));
  const tbd = gates.filter(([, answer]) => answer === "dont_know").map(([section]) => sectionWords(section));
  if (closed.length > 0) {
    assumptions.push(`Answered no, so this budget carries nothing for: ${closed.join(", ")}.`);
  }
  if (tbd.length > 0) {
    assumptions.push(
      `${tbd.length} ${tbd.length === 1 ? "item sits" : "items sit"} outside this total as TBD, because nobody knows the answer yet: ${tbd.join(", ")}.`,
    );
  }

  if (notInThisJob.length > 0) {
    assumptions.push(
      `Not in this job, so removed from the total: ${notInThisJob.map((i) => `${i.label} (${i.question})`).join(", ")}.`,
    );
  }
  if (tbdGateItems.length > 0) {
    assumptions.push(
      `${tbdGateItems.length} ${tbdGateItems.length === 1 ? "item sits" : "items sit"} outside this total as TBD, because nobody knows the answer yet: ${tbdGateItems.map((i) => `${i.label} (${i.question})`).join(", ")}.`,
    );
  }
  if (assumedPresentItems.length > 0) {
    assumptions.push(
      `Nobody answered the question behind ${countWords(assumedPresentItems.length, "item")}, so ${assumedPresentItems.length === 1 ? "it is" : "they are"} assumed present: ${assumedPresentItems.map((i) => `${i.label} (${i.question})`).join(", ")}.`,
    );
  }

  // LA-884: a carved-out block is priced and shown, and it is the one kind of
  // line a reader can see on the board that is missing from the total, so the
  // budget has to say why in its own words.
  const carved = lines.filter((l) => l.breakoutOf !== null);
  if (carved.length > 0) {
    assumptions.push(
      `${carved.length} of ${lines.length} lines ${carved.length === 1 ? "is" : "are"} carved out of a level 1 lump whose rate already covers them, so each is priced on the board and left out of both totals.`,
    );
  }

  const unclassified = lines.filter((l) => l.detailLevel === null);
  if (unclassified.length > 0) {
    assumptions.push(
      `${unclassified.length} of ${lines.length} lines ${unclassified.length === 1 ? "has" : "have"} no stated level of detail yet, so the board shows ${unclassified.length === 1 ? "it" : "them"} as unclassified rather than placing ${unclassified.length === 1 ? "it" : "them"} at a guessed level.`,
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
