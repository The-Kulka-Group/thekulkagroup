import type { BlockClassification, Comparable, ConfidenceFlag, MarkupLine, Rom, RomLine } from "@kulka/engine";

import { buildLedger, divisionTitle, sourceOf, type LedgerItem, type LedgerRow } from "@/app/(app)/rom/ledger";
import { addsToTotal, midpoint } from "@/app/(app)/rom/block-layout";
import { buildField, orderField } from "@/app/(app)/rom/field-order";
import flow from "@/config/rom/tier1-flow.json";
import { titleCase } from "@/lib/format/title-case";
import { publicWording } from "@/lib/rom/derived-assumptions";
import type { PublishedBudgetSnapshot, PublishedStage } from "@/lib/rom/published-snapshot";

// LA-1418. The presentation model: what the client page at /b/<token> shows,
// built from a published snapshot and nothing else. It reads no clock, no
// network and no database, the same rule the engine follows, so the same
// snapshot always yields the same page.
//
// Everything a client reads is in client words here. The run writes its basis
// sentences and notes for the estimator ("user override", "history:", "GRs/GCs",
// "engine parameters", "this ROM"), and ledger.ts names sources for the
// estimator ("AI Figure", "Stated Rate"); both are mapped below. The page
// renderer (app/b/[token]/render.ts) only formats and escapes what this returns.
//
// Every addressable element carries a `data-el` id derived from snapshot keys,
// never from DOM order (LA-1309, "Stable element ids for Version 2"). Each id
// appears once on the page. Where a figure shows twice (the Kulka contract in
// Your Number and again in the waterfall), the first appearance holds the id
// and the later one points at it with `elRef`.

export type Tier = "summary" | "detail" | "full";
export type Tone = ConfidenceFlag | "none";

export type Figure = { low: number; high: number; likely: number };

/** A figure the page derives from two snapshot figures, with the arithmetic said out loud. */
export type DerivedFigure = { value: number; arithmetic: string };

export type Chip = { tone: Tone; text: string };

export type StageStep = { key: string; label: string; words: string; current: boolean };

export type SectionHead = { id: string; el: string; title: string; indexLabel: string; tier: Tier };

export type Fact = {
  el: string;
  key: string;
  label: string;
  value: string;
  basis: "stated" | "assumed";
  /** The question as asked, or the criterion that set an assumed fact. Full tier. */
  basisWords: string;
  /** For an assumed fact, the criterion code that set it. */
  assumedBy: string | null;
  tier: Tier;
};

export type ComparableRow = { el: string; kindWords: string; jobs: string; rate: string; weight: number; recordedAt: string };

export type PricedLine = Figure & {
  /** Null inside a one-line scope, whose row already holds the line's id. */
  el: string | null;
  costCode: string;
  label: string;
  confidence: ConfidenceFlag;
  source: Chip;
  comparables: ComparableRow[];
  /** Full tier: how the figure was built, in one or two sentences. */
  basis: string;
};

export type UnpricedLine = { el: string; costCode: string; label: string };

export type Scope = Figure & {
  el: string;
  /** The DOM id the receipt and the drill-down address. */
  domId: string;
  kind: "element" | "line" | "unpriced";
  label: string;
  confidence: Tone;
  chip: Chip;
  /** This scope's share of Kulka's trades, 0 to 1. Null for owner-direct scope. */
  share: number | null;
  ownerDirect: boolean;
  tier: Tier;
  lines: PricedLine[];
  unpriced: UnpricedLine[];
};

export type DivisionGroup = Figure & { el: string; division: string; label: string; items: { el: string; label: string; likely: number | null }[] };

export type WaterfallRow = Figure & {
  key: "subtotal" | "gr" | "gc" | "fee" | "insurance" | "kulka-contract" | "owner-direct" | "total-project-cost";
  /** The row's own id, or null when an earlier element on the page holds it. */
  el: string | null;
  elRef: string | null;
  label: string;
  basis: string;
  tbd: boolean;
  plan: { el: string; label: string; amount: number }[];
};

export type Criterion = {
  el: string;
  code: string;
  label: string;
  value: string;
  method: string;
  prices: string[];
  confidenceReason: string;
  settled: boolean;
  inputs: { name: string; value: string; basis: "stated" | "assumed" }[];
  steps: { label: string; result: string }[];
  corrected: { on: string; reason: string } | null;
};

export type GateRow = { el: string | null; label: string; decidedBy: { question: string | null; gate: string; answer: string }[] };

export type Note = { el: string; number: number; text: string; tier: Tier };

export type Parameter = { el: string; label: string; value: string; recordedBy: string; recordedAt: string };

export type BudgetPage = {
  documentTitle: string;
  description: string;
  projectName: string;
  record: {
    version: number;
    stageLabel: string;
    issuedAt: string;
    preparedFor: string | null;
    preparedBy: string;
    validityDays: number | null;
    coverSentence: string | null;
    snapshotHash: string | null;
  };
  /** The newer version that replaces this one, for a superseded page. */
  newer: { version: number; href: string } | null;
  sections: SectionHead[];
  stages: StageStep[];
  headline: {
    kulkaContract: Figure;
    totalProjectCost: Figure;
    tradeCost: Figure;
    grossSquareFeet: number | null;
    unitCount: number | null;
    perSquareFoot: DerivedFigure | null;
    perUnit: DerivedFigure | null;
  };
  project: { facts: Fact[]; assumedCount: number; line: string };
  money: {
    scopes: Scope[];
    ownerScopes: Scope[];
    /** The scopes Summary folds into one row, or null when every scope shows at Summary. */
    rest: (Figure & { count: number }) | null;
    trades: Figure;
    ownerDirect: Figure;
    /** The largest high figure on the ledger, which every range bar is drawn against. */
    scaleHigh: number;
    /**
     * By Division, or null when the snapshot does not carry a division for
     * every item. A run records no MasterFormat division on its lines; the
     * division comes from block_classification or canonical_work_items, which
     * a published snapshot does not freeze. Only benchmark-style cost codes
     * ("09-900") carry their division in the code itself, so the view shows
     * only when every item is one of those, and is left off otherwise rather
     * than printed with a guessed division.
     */
    divisions: DivisionGroup[] | null;
    summaryScopeCount: number;
  };
  restsOn: {
    priced: number;
    fromKulkaJobs: number;
    fromKulkaRates: number;
    placeholder: number;
    /** Each group's share of trade cost, 0 to 1. */
    shares: { fromKulkaJobs: number; fromKulkaRates: number; placeholder: number };
    jobs: { name: string | null; lines: number }[];
    confidence: Record<ConfidenceFlag, number>;
  };
  criteria: Criterion[];
  waterfall: WaterfallRow[];
  gates: {
    answeredYes: GateRow[];
    notInThisJob: GateRow[];
    waiting: GateRow[];
    assumedPresent: GateRow[];
    unpriced: { label: string; broughtInBy: string | null }[];
  };
  notes: Note[];
  parameters: Parameter[];
  markupWords: string | null;
  next: { openQuestions: string[]; nextStage: StageStep | null };
  pricedLineCount: number;
};

/** What `/b/<token>` hands the model: the frozen snapshot and the row it was published under. */
export type Publication = {
  snapshot: PresentableSnapshot;
  version: number;
  stage: PublishedStage;
  issuedAt: string;
  newer: { version: number; token: string } | null;
};

/**
 * A published snapshot. Its `sourceJobNames`, when publishing froze them,
 * name the jobs the comparables cite; an older snapshot without them counts
 * the jobs and does not name them.
 */
export type PresentableSnapshot = PublishedBudgetSnapshot;

// --- Formatting shared with the renderer -------------------------------------

export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

export function wholeNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function percentOf(share: number): string {
  return `${Math.round(share * 1000) / 10}%`;
}

export function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "America/New_York" });
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function figure(range: { low: number; high: number }): Figure {
  return { low: range.low, high: range.high, likely: midpoint(range) };
}

// --- Sections and stages -------------------------------------------------------

/** The page's sections in reading order, with the tier each first shows at (LA-1309 table). */
export const SECTIONS: readonly SectionHead[] = (
  [
  { id: "your-number", title: "Your Number", indexLabel: "Your Number", tier: "summary" },
  { id: "the-project", title: "The Project as We Understood It", indexLabel: "The Project", tier: "summary" },
  { id: "where-the-money-is", title: "Where the Money Is", indexLabel: "Where the Money Is", tier: "summary" },
  { id: "what-this-rests-on", title: "What This Number Rests On", indexLabel: "What This Rests On", tier: "summary" },
  // The spec's table gives Design and Engineering nothing at Summary.
  { id: "design-and-engineering", title: "Design and Engineering, as Planned", indexLabel: "Design and Engineering", tier: "detail" },
  { id: "from-trades-to-total", title: "From Trades to Total", indexLabel: "From Trades to Total", tier: "summary" },
  { id: "what-is-in", title: "What Is In, and What Is Not", indexLabel: "What Is In", tier: "summary" },
  { id: "what-happens-next", title: "What Happens Next", indexLabel: "What Happens Next", tier: "summary" },
  ] satisfies Omit<SectionHead, "el">[]
).map((section) => ({ ...section, el: `section:${section.id}` }));

const STAGES: readonly { stage: PublishedStage; label: string; words: string }[] = [
  { stage: "conceptual", label: "Conceptual Budget", words: "Priced from your program and Kulka's completed jobs." },
  { stage: "design_development", label: "Design Development", words: "Kulka's estimators price the design development drawings, and the range narrows." },
  { stage: "pre_construction", label: "Pre-Construction", words: "Subcontractor bids replace the ranges." },
  // LA-1309 decision 5 names the last stage Contract.
  { stage: "final", label: "Contract", words: "The contract figure." },
];

function stagesFor(current: PublishedStage): StageStep[] {
  return STAGES.map((step) => ({
    key: slug(step.stage),
    label: step.label,
    words: step.stage === current ? `${step.words} This budget.` : step.words,
    current: step.stage === current,
  }));
}

// --- Client wording ---------------------------------------------------------------

/**
 * ledger.ts's source labels are written for the estimator. The client reads
 * Kulka Jobs with the count, Kulka Rate, or Placeholder Rate for a figure the
 * model proposed (LA-1309 decision 2). "No Rate Yet" reads the same to both.
 * A label with no mapping reads "Kulka Figure" rather than failing, because a
 * frozen page must keep opening; presentation.test.ts checks every label
 * ledger.ts gives today is mapped.
 */
export function clientSource(internal: string): string {
  if (internal === "AI Figure" || internal.startsWith("AI,")) return "Placeholder Rate";
  if (internal === "This Budget Only" || internal === "Stated Rate") return "Kulka Rate";
  const jobs = /^(\d+ Kulka Jobs?)(, Judgment)?$/.exec(internal);
  if (jobs) return jobs[1];
  if (internal === "No Rate Yet") return internal;
  return "Kulka Figure";
}

const COMPARABLE_WORDS: Record<string, string> = {
  actuals: "Kulka Job Actuals",
  proest_budget: "Kulka Budget",
  reviewed_judgment: "Kulka Stated Rate",
  llm_proposal: "Placeholder Rate",
};

/**
 * The run's markup basis sentences, in client words. Ported from the
 * reference build's clientBasis() (tools/build-snapshot.mjs) and extended to
 * every sentence rom-markups.ts can write.
 */
export function clientBasis(basis: string): string {
  return basis
    .replace(/Kulka's contract trade cost, owner-direct lines excluded/, "Every scope above, added up. Owner-direct scope is kept out and added back below.")
    .replace(/user override \(history: ([^ ]+) from (\d+) jobs?: ([^)]*)\)/g, (_, rate: string, n: string, names: string) =>
      `set by Kulka's estimator (Kulka's completed jobs average ${rate} across ${n} ${n === "1" ? "job" : "jobs"}: ${names})`)
    .replace(/user override/g, "set by Kulka's estimator")
    .replace(/, from (\d+) jobs?: (.*)$/, (_, n: string, names: string) =>
      `, the average of Kulka's completed ${n === "1" ? "job" : "jobs"}: ${names}`)
    .replace(/, parameter (?:fee|insurance)\.rate, \S+ (\d{4}-\d{2}-\d{2})/g, ", Kulka's stated rate, set $1")
    .replace(/, recorded (\d{4}-\d{2}-\d{2})/g, ", Kulka's stated rate, set $1")
    .replace(/No imported budget records (.+?) for this setup, and no override was given/, "Kulka has no recorded rate for $1 on this setup yet, and none was set")
    .replace(/No staff role or field-office item was picked/, "No staff or field office was set yet")
    .replace(/, from rate tables ([^,]+)/, ", from Kulka's rate tables ($1)")
    .replace(/\(weeks \/ ([0-9.]+)\)/, "(weeks divided by $1)")
    .replace(/\/GSF/g, " per GSF")
    .replace(/GRs\/GCs/g, "General Requirements and General Conditions")
    .replace(/ & /g, " and ");
}

/** The run's assumptions, in client words: they become the numbered notes. */
export function clientNote(text: string): string {
  return text
    .replace(/parkingType/g, "parking type")
    .replace(/existing building tie in/g, "a tie-in to an existing building")
    .replace(/before this ROM goes anywhere/g, "before this budget is relied on")
    .replace(/listed with this ROM/g, "listed with this budget")
    .replace(/recorded engine parameters/g, "recorded pricing parameters")
    .replace(
      /so the board shows (it|them) as unclassified rather than placing (?:it|them) at a guessed level/g,
      (_, who: string) => (who === "it" ? "so it is shown without one rather than at a guessed level" : "so they are shown without one rather than at a guessed level"),
    )
    .replace(/: a model proposed the figure, and each is flagged low/g, ": each carries a Placeholder Rate, flagged low")
    .replace(/No benchmark in the database matches this project type and construction kind, so this ROM has no lines\./, "No Kulka job matches this project type and construction kind yet, so this budget has no lines.")
    .replace(/carved out of a level 1 lump whose rate already covers them, so each is priced on the board and left out of both totals/g, "carved out of a larger line whose rate already covers them, so each is shown and left out of both totals")
    .replace(/in the ADR 0004 waterfall order/g, "in that order")
    .replace(/GRs\/GCs/g, "General Requirements and General Conditions")
    .replace(/ & /g, " and ")
    .replace(/\bROM\b/g, "budget");
}

/** DOE's apartment "prototype" is what M-1's text calls a model; the page says prototype. */
function criterionWords(text: string): string {
  return publicWording(text)
    .replace(/\bmodels\b/g, "prototypes")
    .replace(/\bmodel\b/g, "prototype")
    .replace(/\bModels\b/g, "Prototypes")
    .replace(/\bModel\b/g, "Prototype");
}

// --- Facts ----------------------------------------------------------------------

type FlowQuestion = {
  id: string;
  kind: string;
  prompt: string;
  mapsTo?: { target: string; name?: string; section?: string };
  choices?: { value: string; label: string }[];
};

const QUESTIONS: readonly FlowQuestion[] = (flow as { questions: FlowQuestion[] }).questions;
const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Each question's label on the page, in the order the page lists facts. */
const FACT_LABELS: Record<string, string> = {
  project_type: "Project Type",
  construction_kind: "Construction",
  gross_square_feet: "Gross Area",
  stories_above_grade: "Stories Above Grade",
  unit_count: "Units",
  building_count: "Buildings",
  zip: "ZIP",
  labor_type: "Labor",
  parking_type: "Parking",
  demolition: "Demolition",
  demolition_structure_count: "Structures Coming Down",
  demolition_structure_square_feet: "Area Coming Down",
  demolition_structure_type: "Structure Coming Down",
  levels_below_grade: "Below Grade",
  existing_building_tie_in: "Tie-in to an Existing Building",
  site_conditions: "Groundwater or Poor Soil",
  amenity_scope: "Amenity Scope",
  elevator: "Elevator",
  elevator_count: "Elevators",
  retail_storefronts: "Retail Storefronts",
  balconies: "Balconies",
  radio_amplifier: "Emergency Radio Amplifier",
};

/** The facts that price the most, which Summary shows (LA-1309: units, gross area, stories, parking, type, framing, labor). */
const SUMMARY_FACTS = new Set(["projectType", "constructionKind", "grossSquareFeet", "framingSystem", "storiesAboveGrade", "unitCount", "laborType", "parkingType"]);

/** Facts no question asks, set by a Design and Engineering criterion. */
const ASSUMED_FACTS: Record<string, { label: string; criterion: string }> = {
  elevatorType: { label: "Elevator Type", criterion: "V-1" },
  hydraulicJackType: { label: "Hydraulic Jack", criterion: "V-2" },
  elevatorMachineRooms: { label: "Machine Rooms", criterion: "V-3" },
  elevatorMachineRoomHvac: { label: "Machine Room HVAC", criterion: "V-3" },
};

const YES_NO: Record<string, string> = { yes: "Yes", no: "No", dont_know: "Don't Know" };

function factKey(q: FlowQuestion): string {
  return q.mapsTo?.name ?? q.mapsTo?.section ?? q.id;
}

/** The recorded answer to a question: the flow's own response, else the field it maps to. */
function answerTo(q: FlowQuestion, snapshot: PublishedBudgetSnapshot): unknown {
  const { answers } = snapshot;
  const responses = answers.flow?.responses as Record<string, unknown> | undefined;
  if (responses && q.id in responses) return responses[q.id];
  const target = q.mapsTo?.target;
  const facts = answers.facts ?? {};
  if (target === "engine_input" && q.mapsTo?.name) return (answers as Record<string, unknown>)[q.mapsTo.name];
  if (target === "intake_field" && q.mapsTo?.name) return facts[q.mapsTo.name];
  if (target === "branch_gate" && q.mapsTo?.section) return answers.branchGates?.[q.mapsTo.section] ?? facts[q.mapsTo.section];
  return undefined;
}

function answerWords(q: FlowQuestion | undefined, raw: unknown): string {
  if (q?.kind === "branch_gate") return YES_NO[String(raw)] ?? String(raw);
  if (q?.kind === "choice") return q.choices?.find((c) => c.value === raw)?.label ?? YES_NO[String(raw)] ?? String(raw);
  if (q?.kind === "number") {
    const n = Number(raw);
    return q.id === "gross_square_feet" || q.id === "demolition_structure_square_feet" ? `${wholeNumber(n)} SF` : wholeNumber(n);
  }
  return YES_NO[String(raw)] ?? String(raw);
}

function prettyValue(value: unknown): string {
  if (value === "yes" || value === "no" || value === "dont_know") return YES_NO[value];
  if (typeof value !== "string") return String(value);
  return titleCase(value.split("_").join(" ")).replace("In Ground", "In-Ground");
}

function factsOf(snapshot: PublishedBudgetSnapshot): Fact[] {
  const facts: Fact[] = [];
  for (const id of Object.keys(FACT_LABELS)) {
    const q = QUESTION_BY_ID.get(id);
    if (!q) continue;
    const raw = answerTo(q, snapshot);
    if (raw === undefined || raw === null || raw === "") continue;
    const key = factKey(q);
    facts.push({
      el: `fact:${key}`,
      key,
      label: FACT_LABELS[id],
      value: answerWords(q, raw),
      basis: "stated",
      basisWords: q.prompt,
      assumedBy: null,
      tier: SUMMARY_FACTS.has(key) ? "summary" : "detail",
    });
  }
  // Framing is on the project record, stated at creation (LA-1103).
  const framing = snapshot.answers.framingSystem;
  if (framing) {
    const at = facts.findIndex((f) => f.key === "storiesAboveGrade");
    facts.splice(at === -1 ? facts.length : at, 0, {
      el: "fact:framingSystem",
      key: "framingSystem",
      label: "Framing",
      value: prettyValue(framing),
      basis: "stated",
      basisWords: "Framing system, set on the project",
      assumedBy: null,
      tier: "summary",
    });
  }
  for (const [key, value] of Object.entries(snapshot.answers.facts ?? {})) {
    const assumed = ASSUMED_FACTS[key];
    if (!assumed) continue;
    facts.push({
      el: `fact:${key}`,
      key,
      label: assumed.label,
      value: prettyValue(value),
      basis: "assumed",
      basisWords: `Set by criterion ${assumed.criterion}`,
      assumedBy: assumed.criterion,
      tier: "detail",
    });
  }
  return facts;
}

// --- Scopes, from the saved budget's own ledger --------------------------------------

/**
 * The saved budget reads element drivers off block_classification, which a
 * snapshot does not freeze. The run's own lines carry the same facts: a
 * supporting item names its driver, and the driver names its element. So the
 * drivers are rebuilt from the lines and handed to the same grouping the
 * saved budget uses (element-groups.ts via ledger.ts).
 */
function driversOf(rom: Rom): BlockClassification[] {
  const lineByCode = new Map(rom.lines.map((line) => [line.costCode, line]));
  const codes = new Set([...rom.lines, ...rom.unpricedItems].map((item) => item.driverCostCode).filter((code): code is string => Boolean(code)));
  const drivers: BlockClassification[] = [];
  for (const code of codes) {
    const line = lineByCode.get(code);
    if (!line?.element) continue;
    drivers.push({
      costCode: code,
      detailLevel: line.detailLevel ?? 1,
      element: line.element,
      breakoutOfCostCode: null,
      buyoutPackage: line.buyoutPackage,
      isElementDriver: true,
      division: null,
      statedBy: "the published run",
      statedOn: "",
      reason: "rebuilt from the run's own driver links",
    });
  }
  return drivers;
}

function confidenceOf(lines: readonly RomLine[]): ConfidenceFlag {
  if (lines.every((line) => line.confidence === "high")) return "high";
  if (lines.some((line) => line.confidence === "low")) return "low";
  return "medium";
}

/**
 * True when the figure's own record says it is per gross square foot, as the
 * budget import writes it ("Forecast Final Cost per GSF"). A comparable does
 * not carry its benchmark's unit, and a lump sum or a per-stop rate rides in
 * the same field, so nothing else is read as per SF.
 */
function recordedPerSf(c: Comparable): boolean {
  return /\bper GSF\b/i.test(c.exportLabel ?? "");
}

/** A comparable's rate in the unit the snapshot knows, or with no unit when it does not know one. */
function comparableRate(c: Comparable, line: RomLine): string {
  // A per-unit line's comparables are per GSF of this project, rescaled (rom-per-unit.ts).
  if (line.perUnit) return `${usd(c.rate * line.perUnit.projectGsfPerUnit)} per unit`;
  if (recordedPerSf(c)) return `${usd(c.rate)} per SF`;
  return `${usd(c.rate)} rate`;
}

const SPREAD_WORDS: Record<ConfidenceFlag, string> = { high: "High", medium: "Medium", low: "Low" };

function percent(v: number): string {
  return `${(v * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** The range width the run froze for this confidence, or "as shown" when the snapshot has none. */
function spreadWords(line: RomLine, rom: Rom): string {
  const spread = rom.parameters?.[`spread.${line.confidence}`]?.value;
  const words = SPREAD_WORDS[line.confidence];
  return typeof spread === "number" ? `${words} confidence: the range is ${percent(spread)} each side of the blend.` : `${words} confidence: the range is as shown.`;
}

function lineBasis(line: RomLine, rom: Rom, grossSquareFeet: number): string {
  const n = line.comparableCount;
  const jobs = `${n} Kulka ${n === 1 ? "job stands" : "jobs stand"} behind this line`;
  const perSf = line.comparables.every(recordedPerSf);
  const how =
    n > 0
      ? perSf
        ? `${jobs}, each weighted as listed, blended to one rate per square foot and multiplied by ${wholeNumber(grossSquareFeet)} SF.`
        : `${jobs}, weighted as listed and priced to this project's quantity.`
      : line.comparables.length > 0 && line.comparables.every((c) => c.kind === "llm_proposal")
        ? "A Placeholder Rate, applied to this project's quantity, until Kulka states a rate."
        : "A rate Kulka stated, applied to this project's quantity.";
  const perUnit = line.perUnit ? ` Priced per unit: ${usd(line.perUnit.usdPerUnit)} across ${wholeNumber(line.perUnit.unitCount)} units.` : "";
  const rules = line.judgmentAdjustments.length;
  const adjusted = rules ? ` ${rules} stated ${rules === 1 ? "rule" : "rules"} moved it.` : "";
  return `${how}${perUnit}${adjusted} ${spreadWords(line, rom)}`;
}

function pricedLine(line: RomLine, rom: Rom, jobNames: Readonly<Record<string, string>>, grossSquareFeet: number): PricedLine {
  return {
    ...figure(line),
    el: `line:${line.costCode}`,
    costCode: line.costCode,
    label: titleCase(line.label),
    confidence: line.confidence,
    source: { tone: line.confidence, text: clientSource(sourceOf(line).text) },
    comparables: line.comparables.map((c, i) => ({
      // The comparable's position in the frozen blend, heaviest first: a snapshot key, not DOM order.
      el: `line:${line.costCode}:comparable:${i + 1}`,
      kindWords: COMPARABLE_WORDS[c.kind] ?? "Kulka Figure",
      jobs: c.sourceProjectIds.map((id) => jobNames[id]).filter(Boolean).join(", ") || "Kulka",
      rate: c.kind === "reviewed_judgment" ? "Rate on File" : comparableRate(c, line),
      weight: c.weight,
      recordedAt: c.recordedAt,
    })),
    basis: lineBasis(line, rom, grossSquareFeet),
  };
}

function scopesOf(snapshot: PresentableSnapshot) {
  const { rom } = snapshot;
  const jobNames = snapshot.sourceJobNames ?? {};
  const classifications = driversOf(rom);
  const entries = orderField(buildField("scope", rom, classifications), "largest");
  const ledger = buildLedger(rom, entries, "element", "largest", classifications, new Map());
  const lineByCode = new Map(rom.lines.map((line) => [line.costCode, line]));
  const gsf = snapshot.answers.grossSquareFeet;

  const toScope = (row: LedgerRow, ownerDirect: boolean): Scope => {
    const items: LedgerItem[] = row.kind === "group" ? row.items : [row];
    const romLines = items.flatMap((item) => (item.amount === null ? [] : [lineByCode.get(item.costCode)!]));
    const unpriced = items.filter((item) => item.amount === null).map((item) => ({ el: `unpriced:${item.costCode}`, costCode: item.costCode, label: titleCase(item.label) }));
    const low = romLines.reduce((sum, line) => sum + line.low, 0);
    const high = romLines.reduce((sum, line) => sum + line.high, 0);
    const lines = romLines.map((line) => pricedLine(line, rom, jobNames, gsf));
    const label = titleCase(row.label);
    const kind = row.kind === "group" ? "element" : romLines.length > 0 ? "line" : "unpriced";
    const confidence: Tone = romLines.length > 0 ? confidenceOf(romLines) : "none";
    return {
      low,
      high,
      likely: midpoint({ low, high }),
      el: kind === "element" ? `element:${slug(row.label)}` : kind === "line" ? `line:${items[0].costCode}` : `unpriced:${items[0].costCode}`,
      domId: `scope-${slug(label)}`,
      kind,
      label,
      confidence,
      chip: kind === "element" ? { tone: confidence, text: `${lines.length} Priced` } : kind === "line" ? lines[0].source : { tone: "none", text: "No Rate Yet" },
      share: null,
      ownerDirect,
      tier: "detail",
      // A single-line scope is the line: its id sits on the scope row, not again inside it.
      lines: kind === "line" ? [{ ...lines[0], el: null }] : lines,
      unpriced: kind === "unpriced" ? [] : unpriced,
    };
  };
  return { trade: ledger.trade.map((row) => toScope(row, false)), owner: ledger.ownerDirect.map((row) => toScope(row, true)), classifications };
}

/** By Division, when every item's division is in the snapshot (see BudgetPage.money.divisions). */
function divisionsOf(rom: Rom, classifications: readonly BlockClassification[]): DivisionGroup[] | null {
  const entries = orderField(buildField("scope", rom, classifications), "masterformat");
  const ledger = buildLedger(rom, entries, "division", "masterformat", classifications, new Map());
  const groups = ledger.trade.filter((row): row is Extract<LedgerRow, { kind: "group" }> => row.kind === "group");
  if (groups.length === 0 || groups.some((group) => group.division === null)) return null;
  const lineByCode = new Map(rom.lines.map((line) => [line.costCode, line]));
  return groups.map((group) => {
    const priced = group.items.flatMap((item) => (item.amount === null ? [] : [lineByCode.get(item.costCode)!]));
    const low = priced.reduce((sum, line) => sum + line.low, 0);
    const high = priced.reduce((sum, line) => sum + line.high, 0);
    return {
      low,
      high,
      likely: midpoint({ low, high }),
      el: `division:${group.division}`,
      division: group.division!,
      label: divisionTitle(group.division),
      items: group.items.map((item) => ({ el: `division:${group.division}:${item.costCode}`, label: titleCase(item.label), likely: item.amount })),
    };
  });
}

// --- The waterfall ------------------------------------------------------------------

function markupEl(line: MarkupLine): string {
  return `markup:${(line.code ?? "").replace(/ /g, "-")}`;
}

type PlanLine = { id: string; label: string; amount: number };

/** The Allocated Resources plan's lines, when the snapshot froze one in a shape the page can read. */
function planLines(snapshot: PublishedBudgetSnapshot): PlanLine[] {
  const lines = (snapshot.allocatedResources as { lines?: unknown } | undefined)?.lines;
  if (!Array.isArray(lines)) return [];
  return lines.filter(
    (line): line is PlanLine =>
      typeof line === "object" && line !== null && typeof line.id === "string" && typeof line.label === "string" && typeof line.amount === "number",
  );
}

function waterfallOf(snapshot: PublishedBudgetSnapshot, ownerOnLedger: boolean): WaterfallRow[] {
  const { rom } = snapshot;
  const m = rom.markups;
  const ownerDirect = m ? m.ownerDirect : { low: rom.total.low - rom.kulkaContractTotal.low, high: rom.total.high - rom.kulkaContractTotal.high };
  const plan = planLines(snapshot).map((line) => ({ el: `plan-line:${line.id}`, label: titleCase(line.label), amount: line.amount }));
  const row = (over: Omit<WaterfallRow, "likely" | "plan" | "tbd"> & { tbd?: boolean; plan?: WaterfallRow["plan"] }): WaterfallRow => ({
    ...over,
    likely: midpoint(over),
    tbd: over.tbd ?? false,
    plan: over.plan ?? [],
  });
  const rows: WaterfallRow[] = [];
  const subtotal = m ? m.subtotal : { ...rom.kulkaContractTotal, basis: "Kulka's contract trade cost, owner-direct lines excluded" };
  rows.push(row({ key: "subtotal", el: null, elRef: "total:trades", label: "Trades", low: subtotal.low, high: subtotal.high, basis: clientBasis(subtotal.basis) }));
  if (m) {
    if (m.generalRequirements) {
      const gr = m.generalRequirements;
      rows.push(row({ key: "gr", el: markupEl(gr), elRef: null, label: "General Requirements", low: gr.low, high: gr.high, basis: clientBasis(gr.basis), tbd: gr.tbd }));
    }
    const gc = m.generalConditions;
    rows.push(
      row({
        key: "gc",
        el: markupEl(gc),
        elRef: null,
        label: m.generalRequirements ? "General Conditions" : "General Requirements and General Conditions",
        low: gc.low,
        high: gc.high,
        basis: clientBasis(gc.basis),
        tbd: gc.tbd,
        plan,
      }),
    );
    rows.push(row({ key: "fee", el: markupEl(m.fee), elRef: null, label: "Fee", low: m.fee.low, high: m.fee.high, basis: clientBasis(m.fee.basis), tbd: m.fee.tbd }));
    rows.push(row({ key: "insurance", el: markupEl(m.insurance), elRef: null, label: "Insurance", low: m.insurance.low, high: m.insurance.high, basis: clientBasis(m.insurance.basis), tbd: m.insurance.tbd }));
  }
  const contract = m ? m.total : rom.kulkaContractTotal;
  rows.push(
    row({
      key: "kulka-contract",
      el: null,
      elRef: "total:kulka-contract",
      label: "Kulka Contract",
      low: contract.low,
      high: contract.high,
      basis: m ? clientBasis(m.total.basis) : "Kulka's contract. This budget prices no General Requirements, General Conditions, fee or insurance yet.",
    }),
  );
  rows.push(
    row({
      key: "owner-direct",
      el: ownerOnLedger ? null : "total:owner-direct",
      elRef: ownerOnLedger ? "total:owner-direct" : null,
      label: "Bought by the Owner",
      low: ownerDirect.low,
      high: ownerDirect.high,
      basis: "Scope the owner buys direct, such as appliances. It carries none of Kulka's markups.",
    }),
  );
  const tpc = m ? m.totalProjectCost : rom.total;
  rows.push(row({ key: "total-project-cost", el: null, elRef: "total:total-project-cost", label: "Total Project Cost", low: tpc.low, high: tpc.high, basis: "Kulka's contract plus what the owner buys direct." }));
  return rows;
}

// --- Gates ------------------------------------------------------------------------------

function gateWords(part: string): string {
  return part.replace(/parkingType/g, "parking type").replace(/levels below grade/g, "below grade").replace(/radio amplifier/g, "emergency radio amplifier");
}

function questionFor(part: string): FlowQuestion | undefined {
  const key = part.trim().replace(/ /g, "_");
  return QUESTION_BY_ID.get(key) ?? QUESTIONS.find((q) => q.mapsTo?.name === part.trim() || q.mapsTo?.section === key);
}

function decidedBy(question: string, snapshot: PublishedBudgetSnapshot): GateRow["decidedBy"] {
  const facts = snapshot.answers.facts ?? {};
  return question.split(" and ").map((part) => {
    const q = questionFor(part);
    const key = part.trim().replace(/ /g, "_");
    const raw = facts[key] ?? facts[part.trim()] ?? snapshot.answers.branchGates?.[key] ?? (q ? answerTo(q, snapshot) : undefined);
    return { question: q?.prompt ?? null, gate: gateWords(part.trim()), answer: raw === undefined ? "Not Answered" : answerWords(q, raw) };
  });
}

function gatesOf(snapshot: PublishedBudgetSnapshot) {
  const { rom } = snapshot;
  const gates = Object.entries(snapshot.answers.branchGates ?? {});
  const label = (section: string) => FACT_LABELS[section] ?? titleCase(section.replace(/_/g, " "));
  const prompt = (section: string) => QUESTION_BY_ID.get(section)?.prompt ?? null;
  const notInThisJob = rom.notInThisJob.map((g) => ({ el: `gate:${g.costCode}`, label: titleCase(g.label), decidedBy: decidedBy(g.question, snapshot) }));
  const waiting = rom.tbdGateItems.map((g) => ({ el: `gate:${g.costCode}`, label: titleCase(g.label), decidedBy: decidedBy(g.question, snapshot) }));
  const covered = (rows: GateRow[], section: string) => rows.some((row) => row.decidedBy.some((d) => d.gate === gateWords(section.replace(/_/g, " "))));
  const sectionRow = (section: string, answer: string): GateRow => ({ el: `gate:${section}`, label: label(section), decidedBy: [{ question: prompt(section), gate: gateWords(section.replace(/_/g, " ")), answer }] });
  const lineLabel = (code: string | undefined) => {
    const line = rom.lines.find((l) => l.costCode === code);
    return line ? titleCase(line.label) : null;
  };
  return {
    answeredYes: gates.filter(([, v]) => v === "yes").map(([section]) => sectionRow(section, "Yes")),
    notInThisJob: [...notInThisJob, ...gates.filter(([s, v]) => v === "no" && !covered(notInThisJob, s)).map(([section]) => sectionRow(section, "No"))],
    waiting: [...waiting, ...gates.filter(([s, v]) => v === "dont_know" && !covered(waiting, s)).map(([section]) => sectionRow(section, "Don't Know"))],
    assumedPresent: rom.assumedPresentItems.map((g) => ({ el: `gate:${g.costCode}`, label: titleCase(g.label), decidedBy: decidedBy(g.question, snapshot) })),
    unpriced: rom.unpricedItems.map((u) => ({ label: titleCase(u.label), broughtInBy: lineLabel(u.driverCostCode) })),
  };
}

// --- Parameters -----------------------------------------------------------------------------

const PARAMETER_LABELS: Record<string, string> = {
  "weight.actuals": "Weight, Kulka Job Actuals",
  "weight.proest_budget": "Weight, Kulka Budgets",
  "weight.reviewed_judgment": "Weight, Kulka Stated Rates",
  "flag.high_min_comparables": "Jobs Behind a High-Confidence Line",
  "flag.medium_min_comparables": "Jobs Behind a Medium-Confidence Line",
  "spread.high": "High-Confidence Range, Each Side",
  "spread.medium": "Medium-Confidence Range, Each Side",
  "spread.low": "Low-Confidence Range, Each Side",
  "fee.rate": "Fee Rate",
  "insurance.rate": "Insurance Rate",
};

function parametersOf(rom: Rom): Parameter[] {
  return Object.entries(rom.parameters ?? {})
    .filter(([key]) => PARAMETER_LABELS[key])
    .map(([key, p]) => ({
      // The id is a slug, so no engine parameter key reaches the page (LA-1333).
      el: `parameter:${slug(key)}`,
      label: PARAMETER_LABELS[key],
      value: key.startsWith("spread") || key.endsWith(".rate") ? percent(p.value) : String(p.value),
      recordedBy: /@/.test(p.provenance.recordedBy) ? "Kulka" : p.provenance.recordedBy,
      recordedAt: p.provenance.recordedAt,
    }));
}

/**
 * Each markup method in client words. Keyed by string, not the engine's union,
 * because `allocated_resources` (LA-1397) reaches this branch after the
 * snapshot type does, and a frozen run keeps whatever method it recorded.
 */
const METHOD_WORDS: Record<string, string> = {
  pct_of_subtotal: "as a percent of the subtotal",
  usd_per_gsf: "in dollars per gross square foot",
  allocated_resources: "line by line, from an allocated resources plan",
  staffing_duration: "from staffing and job duration",
};

function markupWordsOf(rom: Rom): string | null {
  const choices = rom.markups?.choices;
  if (!choices) return null;
  const method = METHOD_WORDS[choices.method as string];
  const setup =
    choices.setup === "separate"
      ? "General Requirements and General Conditions as separate lines"
      : choices.setup === "both"
        ? "General Requirements and General Conditions as one line"
        : choices.setup === "gc_only"
          ? "General Conditions on its own"
          : "General Requirements on its own";
  return method ? `Markups priced ${method}, ${setup}.` : `Markups priced with ${setup}.`;
}

// --- The page ---------------------------------------------------------------------------------

/** How many scopes Summary shows before folding the rest into one row. */
export const SUMMARY_SCOPES = 8;

/** How many notes Summary shows. */
export const SUMMARY_NOTES = 5;

export function presentBudget(publication: Publication): BudgetPage {
  const { snapshot } = publication;
  const { rom, answers, copy } = snapshot;
  const projectName = snapshot.project.name;
  const priced = rom.lines.filter(addsToTotal);

  // Headline figures: with markups when the run priced them (LA-679, CONTEXT.md).
  const contract = figure(rom.markups ? rom.markups.total : rom.kulkaContractTotal);
  const tpc = figure(rom.markups ? rom.markups.totalProjectCost : rom.total);
  const gsf = answers.grossSquareFeet > 0 ? answers.grossSquareFeet : null;
  const unitsRaw = Number(answers.facts?.unitCount);
  const units = Number.isFinite(unitsRaw) && unitsRaw > 0 ? unitsRaw : null;

  // Scopes, largest first, from the saved budget's own ledger.
  const { trade, owner, classifications } = scopesOf(snapshot);
  const trades = figure(rom.kulkaContractTotal);
  trade.forEach((scope, i) => {
    scope.share = trades.likely > 0 ? scope.likely / trades.likely : 0;
    scope.tier = i < SUMMARY_SCOPES ? "summary" : "detail";
  });
  owner.forEach((scope) => {
    scope.tier = "summary";
  });
  const folded = trade.filter((scope) => scope.tier !== "summary");
  const rest =
    folded.length > 0
      ? {
          count: folded.length,
          low: folded.reduce((sum, s) => sum + s.low, 0),
          high: folded.reduce((sum, s) => sum + s.high, 0),
          likely: midpoint({ low: folded.reduce((sum, s) => sum + s.low, 0), high: folded.reduce((sum, s) => sum + s.high, 0) }),
        }
      : null;

  // What This Rests On: over the lines that add to the total.
  const isPlaceholder = (line: RomLine) => line.comparables.length === 0 || line.comparables.every((c) => c.kind === "llm_proposal");
  const isMeasured = (line: RomLine) => line.comparables.some((c) => c.kind === "actuals" || c.kind === "proest_budget");
  const fromJobs = priced.filter(isMeasured);
  const placeholder = priced.filter((line) => !isMeasured(line) && isPlaceholder(line));
  const fromRates = priced.filter((line) => !isMeasured(line) && !isPlaceholder(line));
  const tradeCost = figure(rom.total);
  const shareOf = (lines: RomLine[]) => (tradeCost.likely > 0 ? lines.reduce((sum, line) => sum + midpoint(line), 0) / tradeCost.likely : 0);
  const jobLines = new Map<string, number>();
  for (const line of priced) {
    const ids = new Set(line.comparables.filter((c) => c.kind !== "llm_proposal").flatMap((c) => c.sourceProjectIds));
    for (const id of ids) jobLines.set(id, (jobLines.get(id) ?? 0) + 1);
  }
  const names = snapshot.sourceJobNames ?? {};

  // Notes: the run's own assumptions, numbered in the order the run wrote them.
  const notes = rom.assumptions.map((text, i) => ({ el: `note:${i + 1}`, number: i + 1, text: clientNote(text), tier: (i < SUMMARY_NOTES ? "summary" : "detail") as Tier }));

  const facts = factsOf(snapshot);
  const factValue = (key: string) => facts.find((f) => f.key === key)?.value ?? null;
  const projectLine = [
    units !== null ? `${wholeNumber(units)} Units` : null,
    factValue("storiesAboveGrade") ? `${factValue("storiesAboveGrade")} Stories` : null,
    factValue("framingSystem") ? `${factValue("framingSystem")} Framing` : null,
    factValue("parkingType") ? `${factValue("parkingType")} Parking` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const stages = stagesFor(publication.stage);
  const currentIndex = stages.findIndex((s) => s.current);
  const gates = gatesOf(snapshot);
  const openQuestions = [
    ...new Set([
      ...gates.waiting.flatMap((row) => row.decidedBy.filter((d) => d.answer === "Don't Know").map((d) => d.question ?? `${titleCase(d.gate)}?`)),
      ...facts.filter((f) => f.value === "Don't Know").map((f) => f.basisWords),
    ]),
  ];

  const criteria: Criterion[] = snapshot.criteria.map((a) => {
    const value = a.correction?.value ?? a.value;
    return {
      el: `criterion:${a.code}`,
      code: a.code,
      label: titleCase(a.label),
      value: value.kind === "spec" ? value.text : `${value.amount.toLocaleString("en-US")} ${value.unit}`,
      method: criterionWords(a.method),
      prices: a.costCodes
        .map((code) => rom.lines.find((l) => l.costCode === code)?.label ?? rom.unpricedItems.find((u) => u.costCode === code)?.label ?? null)
        .filter((label): label is string => label !== null)
        .map(titleCase),
      confidenceReason: criterionWords(a.confidenceReason),
      settled: a.confidence === "high",
      inputs: a.inputs.map((input) => ({ name: criterionWords(input.name), value: String(input.value), basis: input.basis === "stated" ? "stated" : "assumed" })),
      steps: a.steps.map((step) => ({ label: criterionWords(step.label), result: criterionWords(step.result) })),
      corrected: a.correction ? { on: a.correction.correctedAt.slice(0, 10), reason: criterionWords(a.correction.reason) } : null,
    };
  });

  return {
    documentTitle: `${projectName} · ${stages[currentIndex].label} · Kulka`,
    description: `Kulka's ${stages[currentIndex].label.toLowerCase()} for ${projectName}: the number, its range, where the money is, and what it rests on.`,
    projectName,
    record: {
      version: publication.version,
      stageLabel: stages[currentIndex].label,
      issuedAt: publication.issuedAt,
      preparedFor: copy.preparedFor,
      preparedBy: copy.preparedBy ?? "The Kulka Group",
      validityDays: copy.validityDays,
      coverSentence: copy.coverSentence,
      snapshotHash: snapshot.engineSnapshotHash,
    },
    newer: publication.newer ? { version: publication.newer.version, href: `/b/${publication.newer.token}` } : null,
    sections: [...SECTIONS],
    stages,
    headline: {
      kulkaContract: contract,
      totalProjectCost: tpc,
      tradeCost,
      grossSquareFeet: gsf,
      unitCount: units,
      perSquareFoot: gsf
        ? { value: Math.round(contract.likely / gsf), arithmetic: `Kulka contract over gross area, garage included: ${usd(contract.likely)} over ${wholeNumber(gsf)} SF` }
        : null,
      perUnit: units ? { value: Math.round(contract.likely / units), arithmetic: `Kulka contract over the unit count: ${usd(contract.likely)} over ${wholeNumber(units)} units` } : null,
    },
    project: { facts, assumedCount: facts.filter((f) => f.basis === "assumed").length, line: projectLine },
    money: {
      scopes: trade,
      ownerScopes: owner,
      rest,
      trades,
      ownerDirect: figure({ low: rom.total.low - rom.kulkaContractTotal.low, high: rom.total.high - rom.kulkaContractTotal.high }),
      scaleHigh: Math.max(1, ...trade.map((s) => s.high), ...owner.map((s) => s.high)),
      divisions: divisionsOf(rom, classifications),
      summaryScopeCount: SUMMARY_SCOPES,
    },
    restsOn: {
      priced: priced.length,
      fromKulkaJobs: fromJobs.length,
      fromKulkaRates: fromRates.length,
      placeholder: placeholder.length,
      shares: { fromKulkaJobs: shareOf(fromJobs), fromKulkaRates: shareOf(fromRates), placeholder: shareOf(placeholder) },
      jobs: [...jobLines.entries()].map(([id, lines]) => ({ name: names[id] ?? null, lines })).sort((a, b) => b.lines - a.lines),
      confidence: {
        high: priced.filter((l) => l.confidence === "high").length,
        medium: priced.filter((l) => l.confidence === "medium").length,
        low: priced.filter((l) => l.confidence === "low").length,
      },
    },
    criteria,
    waterfall: waterfallOf(snapshot, owner.length > 0),
    gates,
    notes,
    parameters: parametersOf(rom),
    markupWords: markupWordsOf(rom),
    next: { openQuestions, nextStage: stages[currentIndex + 1] ?? null },
    pricedLineCount: priced.length,
  };
}
