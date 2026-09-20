// The ROM engine. `CONTEXT.md` defines the terms: a ROM is a ranged budget with
// a confidence flag on every line and a plain list of what was assumed.
//
// Everything here is a pure function of its arguments. Nothing in it reads a
// clock, a network, or a database. That is what makes a backtest repeatable and
// what LA-9 means by determinism: the same answers over the same snapshot give
// the same ROM.

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
 * Test-only values never enter the production schema or the product surface.
 */
export type ProvenanceKind = "actuals" | "proest_budget" | "reviewed_judgment";

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
  /** How many comparables stand behind the value. Drives the confidence flag. */
  comparableCount: number;
  provenance: Provenance;
  scopeSide: ScopeSide;
  contractSide: ContractSide;
};

/** Everything the engine is allowed to read. The caller loads it; the engine does not. */
export type DataSnapshot = {
  benchmarks: Benchmark[];
};

export type Answers = {
  projectType: ProjectType;
  constructionKind: ConstructionKind;
  grossSquareFeet: number;
};

export type RomLine = {
  costCode: string;
  label: string;
  low: number;
  high: number;
  confidence: ConfidenceFlag;
  /** True holds the line back from leaving the building unexamined (LA-9). */
  heldForReview: boolean;
  provenance: Provenance;
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
};

// Provisional, and deliberately so. LA-14 replaces both tables with blending,
// calibration from actuals, and spread caps measured against backtest error.
//
// These two tables are the one place cost judgment sits in source rather than in
// the database, which LA-9 otherwise forbids. A ranged line cannot be drawn
// without some rule, so the rule is here, small and labelled, until LA-14 moves
// it onto the benchmark row where it belongs.
const CONFIDENCE_BY_COMPARABLES: ReadonlyArray<{ atLeast: number; flag: ConfidenceFlag }> = [
  { atLeast: 5, flag: "high" },
  { atLeast: 2, flag: "medium" },
  { atLeast: 0, flag: "low" },
];

const SPREAD: Record<ConfidenceFlag, number> = {
  high: 0.1,
  medium: 0.2,
  low: 0.35,
};

function confidenceFor(comparableCount: number): ConfidenceFlag {
  const band = CONFIDENCE_BY_COMPARABLES.find((b) => comparableCount >= b.atLeast);
  // The last band starts at zero, so this only fires on a negative count.
  return band?.flag ?? "low";
}

export function computeRom(answers: Answers, snapshot: DataSnapshot): Rom {
  if (!(answers.grossSquareFeet > 0)) {
    throw new Error("A ROM needs gross square feet above zero.");
  }

  // New construction and renovation are never blended, and neither are project
  // types. LA-9 sets that as the first dividing line.
  const matched = snapshot.benchmarks
    .filter(
      (b) =>
        b.projectType === answers.projectType &&
        b.constructionKind === answers.constructionKind,
    )
    .sort((a, b) => a.costCode.localeCompare(b.costCode));

  const lines = matched.map((b) => toLine(b, answers.grossSquareFeet));
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
  };
}

function toLine(benchmark: Benchmark, grossSquareFeet: number): RomLine {
  const confidence = confidenceFor(benchmark.comparableCount);
  const spread = SPREAD[confidence];
  const midpoint = benchmark.value * grossSquareFeet;

  return {
    costCode: benchmark.costCode,
    label: benchmark.label,
    low: Math.round(midpoint * (1 - spread)),
    high: Math.round(midpoint * (1 + spread)),
    confidence,
    heldForReview: confidence === "low",
    provenance: benchmark.provenance,
    scopeSide: benchmark.scopeSide,
    contractSide: benchmark.contractSide,
  };
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
