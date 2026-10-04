import type { BlockClassification, ConfidenceFlag, MarkupLine, Rom, RomLine } from "@kulka/engine";

import { buildLedger, divisionTitle, sourceOf, type LedgerItem, type LedgerRow as SavedLedgerRow } from "@/app/(app)/rom/ledger";
import { addsToTotal, midpoint } from "@/app/(app)/rom/block-layout";
import { buildField, divisionFor, divisionRank, orderField, statedDivisions } from "@/app/(app)/rom/field-order";
import flow from "@/config/rom/tier1-flow.json";
import { titleCase } from "@/lib/format/title-case";
import { publicWording } from "@/lib/rom/derived-assumptions";
import { ITEM_DIVISION_MAP, compareItemCodes } from "@/lib/rom/masterformat-item-divisions";
import type { PublishedBudgetSnapshot, PublishedStage } from "@/lib/rom/published-snapshot";
import { drillDown, type DivisionRow, type ProjectBasis } from "@/lib/rom/drill-down";
import { LAYERS, type SectionFacts, type SectionInk } from "@/lib/rom/section";

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

export type Tone = ConfidenceFlag | "none";

export type Figure = { low: number; high: number; likely: number };

/** A figure the page derives from two snapshot figures, with the arithmetic said out loud. */
export type DerivedFigure = { value: number; arithmetic: string };

export type Chip = { tone: Tone; text: string };

export type StageStep = { key: string; label: string; words: string; current: boolean };

export type SectionHead = { id: string; el: string; title: string; indexLabel: string };

export type Fact = {
  el: string;
  key: string;
  label: string;
  value: string;
  basis: "stated" | "assumed";
  /** The question as asked, or the criterion that set an assumed fact. */
  basisWords: string;
  /** For an assumed fact, the criterion code that set it. */
  assumedBy: string | null;
};

export type PricedLine = Figure & {
  /** Null inside a one-line scope, whose row already holds the line's id. */
  el: string | null;
  costCode: string;
  label: string;
  confidence: ConfidenceFlag;
  source: Chip;
  /** How the figure was built, in one or two sentences. */
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
  lines: PricedLine[];
  unpriced: UnpricedLine[];
};

/**
 * An item inside a division is a line the Ledger already shows, so it holds no
 * id of its own: `elRef` points at that line's `line:<costCode>` (LA-1488). A
 * thread on the line then stays on it when the page regroups.
 */
export type DivisionGroup = Figure & { el: string; division: string; label: string; items: { el: null; elRef: string; label: string; likely: number | null }[] };

/**
 * One row of the client ledger (LA-1459): a scope in MasterFormat order with
 * its division, the layer it draws on the section, and the ink it draws in.
 * The scope itself carries the drill-down.
 */
export type LedgerRow = {
  /** The row key: the scope's id, which is also its layer key. */
  key: string;
  scope: Scope;
  /** The MasterFormat division, "09", or null when the snapshot's cost code has none. */
  division: string | null;
  label: string;
  likely: number;
  /** The row's rate per SF in words, or null when the budget has no gross area. */
  perSquareFoot: string | null;
  /** The row's share of the Kulka contract in words, or null for owner-direct scope. */
  shareOfContract: string | null;
  /** Where the figure came from, dot plus words: one line's source, or each line's. */
  sourceText: string;
  sourceTone: Tone;
  ink: SectionInk;
  /** True when the row owns a layer on the section; a row with none is named in the sheet's notes. */
  hasLayer: boolean;
};

/** What the section is drawn from (lib/rom/section.ts), read off the snapshot. */
export type Drawing = {
  facts: SectionFacts;
  /** Ink per layer key, and per priced line inside an element, so a mixed element draws both. */
  ink: Record<string, SectionInk>;
  /** Rows priced wholly or partly from stated rates or placeholders, in ledger order. */
  lightRows: string[];
  /** Rows with no layer to draw, in ledger order, the owner's marked. */
  noLayer: { key: string; label: string }[];
  /** Empty when no row draws in light ink. */
  inkNote: string;
  criteria: { code: string; value: string }[];
};

export type WaterfallRow = Figure & {
  key: "subtotal" | "gr" | "gc" | "fee" | "insurance" | "kulka-contract" | "owner-direct" | "total-project-cost";
  /** The row's own id, or null when an earlier element on the page holds it. */
  el: string | null;
  elRef: string | null;
  label: string;
  basis: string;
  tbd: boolean;
  plan: { el: string; label: string; amount: number }[];
  /**
   * The figure the page shows once this row has joined: trade cost, then the
   * running sum of the rounded markups, landing on the contract figure itself
   * at the last markup (LA-1459). Null on the rows after the landing.
   */
  running: number | null;
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

/**
 * A run note. `key` comes from the note's own words (see `noteKey`), so the id
 * `note:<key>` names the same note in every version that still carries it.
 * `number` is the position the page prints and is never part of an id.
 */
export type Note = { el: string; key: string; number: number; text: string };

export type Parameter = { el: string; label: string; value: string; recordedBy: string; recordedAt: string };

/** A run of the letter: words, or a figure the page names once (LA-1467). */
export type LetterRun = { text: string; figure?: boolean; el?: string | null; elRef?: string | null; /** The arithmetic behind a derived figure, shown on hover. */ title?: string | null };

/** The letter the page opens on (LA-1467). */
export type Letter = {
  date: string;
  /** "To <Prepared For>," when the publication names a reader; null otherwise. */
  greeting: string | null;
  title: string;
  paragraphs: LetterRun[][];
  signature: { name: string; role: string };
};

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
  };
  /** The client ledger in MasterFormat order, Kulka's trades and the owner's rows together (LA-1459). */
  ledger: LedgerRow[];
  /** LA-1504: the ledger By Division, the page's default view, with each division's drill-down. */
  divisions: DivisionRow[];
  /** LA-1504: the answers about the whole project, and where the others went. */
  projectBasis: ProjectBasis;
  drawing: Drawing;
  restsOn: {
    priced: number;
    /** Lines priced from a Kulka rate, whatever stands behind it. The client is not told what does. */
    fromKulkaRates: number;
    placeholder: number;
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
  /** The letter the page opens on, after the wordmark (LA-1467). */
  letter: Letter;
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
 * A published snapshot. It keeps its comparables and `sourceJobNames`, but
 * the client page shows no past job, job count or job name (LA-1483).
 */
export type PresentableSnapshot = PublishedBudgetSnapshot;

// --- Formatting shared with the renderer -------------------------------------

export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** A rate per SF or per unit: to the cent under $100, where whole dollars would print $0.14 as $0, and whole dollars above. */
export function rateUsd(n: number): string {
  const cents = Math.round(n * 100) / 100;
  return cents < 100 ? `$${cents.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : usd(n);
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
  return { low: range.low, high: range.high, likely: whole(range) };
}

/**
 * A range's likely figure, rounded once to whole dollars. LA-1532: every total
 * the page shows is the sum of the rounded figures beneath it (see tieOut), so
 * a reader who adds a column gets the figure printed under it.
 */
function whole(range: { low: number; high: number }): number {
  return Math.round(midpoint(range));
}

/**
 * Whole-dollar figures for `values` that add up to `target`. Each value is
 * rounded on its own, and the few dollars of rounding left over go to the
 * largest value, so a small line prints the same figure in every version
 * and a comment on it never reads as changed (LA-1532). When the values and
 * the target disagree by more than a dollar a value, the target is not theirs
 * to meet, so each value is simply rounded.
 */
export function apportion(values: readonly number[], target: number): number[] {
  const rounded = values.map(Math.round);
  const left = target - rounded.reduce((sum, v) => sum + v, 0);
  if (values.length === 0 || Math.abs(left) > values.length) return rounded;
  const largest = values.reduce((best, v, i) => (v > values[best] ? i : best), 0);
  rounded[largest] += left;
  return rounded;
}

// --- Sections and stages -------------------------------------------------------

/** The page's sections in reading order (LA-1309 table). */
export const SECTIONS: readonly SectionHead[] = (
  // The ids are Version 1's, so every section keeps its element id; the titles
  // are the approved frames' (LA-1456, brief-v3).
  [
  // LA-1467: the page opens on the wordmark, then a letter; the index starts at the letter.
  { id: "letter", title: "Letter", indexLabel: "Letter" },
  // LA-1504: Matt's estimate-standard terms (2026-10-02). The ids stay Version 1's.
  { id: "the-project", title: "Project Basis", indexLabel: "Project Basis" },
  { id: "where-the-money-is", title: "The Ledger", indexLabel: "The Ledger" },
  // LA-1459: the criteria are called out on the drawing, with no money.
  { id: "design-and-engineering", title: "Design and Engineering", indexLabel: "Design and Engineering" },
  { id: "from-trades-to-total", title: "From Trades to Total", indexLabel: "From Trades to Total" },
  // LA-1504: What Is In moved into each division's Scope Decisions; the notes and parameters stay here.
  { id: "what-is-in", title: "Clarifications", indexLabel: "Clarifications" },
  { id: "what-happens-next", title: "What Happens Next", indexLabel: "What Happens Next" },
  ] satisfies Omit<SectionHead, "el">[]
).map((section) => ({ ...section, el: `section:${section.id}` }));

const STAGES: readonly { stage: PublishedStage; label: string; words: string }[] = [
  { stage: "conceptual", label: "Conceptual Budget", words: "Priced from your program and Kulka's rates." },
  { stage: "design_development", label: "Design Development", words: "Kulka's estimators price the design development drawings, and the range narrows." },
  { stage: "pre_construction", label: "Pre-Construction", words: "Subcontractor bids replace the ranges." },
  // LA-1309 decision 5 names the last stage Contract.
  { stage: "final", label: "Contract", words: "Kulka signs a contract for a fixed figure." },
];

function stagesFor(current: PublishedStage): StageStep[] {
  return STAGES.map((step) => ({
    key: slug(step.stage),
    label: step.label,
    words: step.stage === current ? `${step.words} This budget is at this stage.` : step.words,
    current: step.stage === current,
  }));
}

// --- Client wording ---------------------------------------------------------------

/**
 * LA-1534. A line's name on the client page. The run's labels are the cost
 * export's own descriptions, several of them two lines joined with "+" or
 * " - " ("Wood Framing - Install + Wood Framing - Supply"). These read as a
 * cost code to a reader like Dan from Fieldstone, so each such line gets a
 * plain name here, built only from the words its label already holds.
 * Every other label keeps its words, with "&" written out. The internal app
 * keeps the export's labels.
 */
const CLIENT_NAMES: Readonly<Record<string, string>> = {
  "2": "Concrete and Site Concrete",
  "7": "Miscellaneous Steel, Stairs, Screens and Canopy",
  "8": "Wood Framing, Supply and Install",
  "12": "Damproofing, Waterproofing and Insulation",
  "13": "Roofing and Rooftop Pavers",
  "14": "Siding, Exterior Trim, Decks, Rails and Stucco",
  "15": "Doors, Frames and Hardware",
  "16a": "Windows, Supply Only",
  "17": "Metal Framing, Drywall and Acoustic Ceilings",
  "21": "Specialties, Fire Extinguishers and Signage",
  "32a": "Emergency Responder Radio System",
  "34a": "Excavation Support, Underpinning and Shoring",
  "37": "Landscaping, Irrigation and Pavers",
  "38": "Asphalt Paving, Traffic Signage and Striping",
  "39": "Site Concrete, Planters, Pergolas, Fences and Gates",
};

export function lineName(costCode: string, label: string): string {
  return CLIENT_NAMES[costCode] ?? titleCase(label.replace(/\s*&\s*/g, " and "));
}

/**
 * ledger.ts's source labels are written for the estimator. The client reads
 * Kulka Rate, or Placeholder Rate for a figure the model proposed. A figure
 * built from past jobs reads Kulka Rate too: the client sees no job or job
 * count (LA-1483). "No Rate Yet" reads the same to both.
 * A label with no mapping reads "Kulka Figure" rather than failing, because a
 * frozen page must keep opening; presentation.test.ts checks every label
 * ledger.ts gives today is mapped.
 */
export function clientSource(internal: string): string {
  if (internal === "AI Figure" || internal.startsWith("AI,")) return "Placeholder Rate";
  if (internal === "This Budget Only" || internal === "Stated Rate") return "Kulka Rate";
  if (/^\d+ Kulka Jobs?(, Judgment)?$/.test(internal)) return "Kulka Rate";
  if (internal === "No Rate Yet") return internal;
  return "Kulka Figure";
}

/**
 * The run's markup basis sentences, in client words. Ported from the
 * reference build's clientBasis() (tools/build-snapshot.mjs) and extended to
 * every sentence rom-markups.ts can write.
 */
export function clientBasis(basis: string): string {
  return basis
    .replace(/Kulka's contract trade cost, owner-direct lines excluded/, "Every scope above, added up. Owner-direct scope is kept out and added back below.")
    .replace(/^Kulka's contract with /, "Trade cost with ")
    // LA-1483: the history behind a rate, its average, job count and job names, stays off the client page.
    .replace(/user override \(history: [^()]*(?:\([^()]*\)[^()]*)*\)/, "set by Kulka's estimator.")
    .replace(/user override/g, "set by Kulka's estimator")
    .replace(/, from \d+ jobs?: .*$/, "")
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

/**
 * The one run assumption a client cannot read without learning that other lines
 * rest on past jobs ("no measured Kulka figure behind them yet"). It is left out
 * of the notes, and the rest are numbered without it (LA-1483).
 */
const SPLITS_OFF_PAST_JOBS = /^\d+ of \d+ lines rest on estimator judgment with no measured Kulka figure behind them yet\.$/;

/**
 * The id key of a note (LA-1488): a 40-bit hash of the run's own words for it,
 * before `clientNote` rewords it, so a wording change on the client page does
 * not rename the id. The key follows the note, not its place in the list:
 * dropping or adding another note leaves it as it was. Two notes with the same
 * words take `-2`, `-3` in the order the run wrote them.
 */
export function noteKey(text: string): string {
  // cyrb53, 53 bits: pure, no imports, the same on every runtime.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(14, "0").slice(-10);
}

/** The run's assumptions, in client words: they become the numbered notes. */
export function clientNote(text: string): string {
  return text
    .replace(/Blend weights, flag thresholds, and range widths are recorded engine parameters/, "Range widths and markup rates are recorded engine parameters")
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
    .replace(/No benchmark in the database matches this project type and construction kind, so this ROM has no lines\./, "Kulka has no rate for this project type and construction kind yet, so this budget has no lines.")
    .replace(/No past job framed like this project stands behind (.+?), so (that line has|those lines have) no figure/, "Kulka has no rate for $1 framed like this project, so $2 no figure")
    .replace(/blend wood and metal jobs and (is|are) held/, "price wood and metal framing together and $1 held")
    .replace(/ Measured Kulka figures on the same line outweigh the rule\./, "")
    .replace(/carved out of a level 1 lump whose rate already covers them, so each is priced on the board and left out of both totals/g, "carved out of a larger line whose rate already covers them, so each is shown and left out of both totals")
    .replace(/in the ADR 0004 waterfall order/g, "in that order")
    .replace(/Fee and insurance compute without it\./, "Fee and insurance are figured without it.")
    .replace(/GRs\/GCs/g, "General Requirements and General Conditions")
    .replace(/ & /g, " and ")
    .replace(/\bROM\b/g, "budget");
}

/**
 * LA-1504 (Matt, 2026-10-02): the notes each division now shows are cut (the
 * items not in this job, and what each driver brings in), and the two that
 * listed item names become one line each. Null for a cut note. Every other
 * note reads as `clientNote` words it.
 */
export function clarification(text: string): string | null {
  if (/^Not in this job, so removed from the total: /.test(text)) return null;
  // LA-1534: the pricing parameters are off the client page (LA-1532), and a
  // line's level of detail is an internal sorting the client never sees.
  if (/recorded engine parameters/.test(text)) return null;
  if (/ no stated level of detail yet, /.test(text)) return null;
  const held = /^(\d+) of (\d+) lines are low confidence and are held for review/.exec(text);
  if (held) {
    return `${held[1]} of ${held[2]} lines are low confidence, so their ranges are wide. The ranges narrow as the design is drawn and Kulka's estimators price it.`;
  }
  const answeredNo = /^Answered no, so this budget carries nothing for: (.+)\.$/.exec(text);
  if (answeredNo) return `This budget carries nothing for ${clientNote(answeredNo[1])}, because the answer was no.`;
  const owner = /^(\d+) of (\d+) lines are owner-direct scope, /.exec(text);
  if (owner) {
    return Number(owner[1]) === 1
      ? `1 of ${owner[2]} lines is bought by the owner. It counts in total project cost but not in Kulka's contract.`
      : `${owner[1]} of ${owner[2]} lines are bought by the owner. They count in total project cost but not in Kulka's contract.`;
  }
  if (/^Fee computes on the subtotal plus the GRs\/GCs line/.test(text)) {
    return "The fee is figured on trade cost plus General Requirements and General Conditions, and insurance on all of those plus the fee. Markups apply to Kulka's contract only, and what the owner buys direct carries none.";
  }
  if (/^General Requirements sits inside trade cost, General Conditions computes on/.test(text)) {
    return "General Requirements sits inside trade cost. General Conditions is figured on trade cost plus General Requirements, the fee on both, and insurance on both plus the fee. Markups apply to Kulka's contract only, and what the owner buys direct carries none.";
  }
  if (/ brings in .+\. Each adds to the total on its own once it has a rate\.$/.test(text)) return null;
  const unrated = /^(\d+) items? (?:is|are) in scope with no rate yet: /.exec(text);
  if (unrated) {
    const n = Number(unrated[1]);
    return n === 1 ? "1 item is in scope with no rate yet. It sits under its division." : `${n} items are in scope with no rate yet. Each sits under its division.`;
  }
  const waiting = /^(\d+) items? sits? outside this total as TBD, because nobody knows the answer yet: /.exec(text);
  if (waiting) {
    const n = Number(waiting[1]);
    return n === 1
      ? "1 item sits outside the total until an open question is answered. It sits under its division."
      : `${n} items sit outside the total until open questions are answered. Each sits under its division.`;
  }
  return clientNote(text);
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

/**
 * The question as a client reads it, where the intake flow's prompt is only a
 * field label ("Unit Count"). The flow keeps its labels for the estimator's
 * screen; the page asks the question in words.
 */
const QUESTION_WORDS: Record<string, string> = {
  stories_above_grade: "How many stories does the building have above grade?",
  unit_count: "How many units does the building have?",
  building_count: "How many buildings are there?",
  zip: "What is the project's ZIP code?",
  labor_type: "Is the job open shop or union?",
  elevator_count: "How many elevators does the building have?",
};

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
      basisWords: QUESTION_WORDS[id] ?? q.prompt,
      assumedBy: null,
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

const SPREAD_WORDS: Record<ConfidenceFlag, string> = { high: "High", medium: "Medium", low: "Low" };

function percent(v: number): string {
  return `${(v * 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** The range width the run froze for this confidence, or "as shown" when the snapshot has none. */
function spreadWords(line: RomLine, rom: Rom): string {
  const spread = rom.parameters?.[`spread.${line.confidence}`]?.value;
  const words = SPREAD_WORDS[line.confidence];
  return typeof spread === "number" ? `${words} confidence: the range is ${percent(spread)} each side of the figure.` : `${words} confidence: the range is as shown.`;
}

/** A line is a placeholder when only a model proposed its figure. Every other priced line reads as a Kulka rate (LA-1483). */
function isPlaceholder(line: RomLine): boolean {
  return line.comparables.length === 0 || line.comparables.every((c) => c.kind === "llm_proposal");
}

/**
 * How a line's figure was built, in client words. A line built from past jobs
 * and a line built from a stated rate read the same, and none says how many
 * jobs stand behind it (LA-1483).
 */
function lineBasis(line: RomLine, rom: Rom): string {
  const how = isPlaceholder(line)
    ? "A Placeholder Rate, applied to this project's quantity, until Kulka states a rate."
    : "A Kulka rate, applied to this project's quantity.";
  const perUnit = line.perUnit ? ` Priced per unit: ${usd(line.perUnit.usdPerUnit)} across ${wholeNumber(line.perUnit.unitCount)} units.` : "";
  const rules = line.judgmentAdjustments.length;
  const adjusted = rules ? ` ${rules} stated ${rules === 1 ? "rule" : "rules"} moved it.` : "";
  return `${how}${perUnit}${adjusted} ${spreadWords(line, rom)}`;
}

function pricedLine(line: RomLine, rom: Rom): PricedLine {
  return {
    ...figure(line),
    el: `line:${line.costCode}`,
    costCode: line.costCode,
    label: lineName(line.costCode, line.label),
    confidence: line.confidence,
    source: { tone: line.confidence, text: clientSource(sourceOf(line).text) },
    basis: lineBasis(line, rom),
  };
}

function scopesOf(snapshot: PresentableSnapshot) {
  const { rom } = snapshot;
  const classifications = driversOf(rom);
  const entries = orderField(buildField("scope", rom, classifications), "largest");
  const ledger = buildLedger(rom, entries, "element", "largest", classifications, new Map());
  const lineByCode = new Map(rom.lines.map((line) => [line.costCode, line]));

  const toScope = (row: SavedLedgerRow, ownerDirect: boolean): Scope => {
    const items: LedgerItem[] = row.kind === "group" ? row.items : [row];
    const romLines = items.flatMap((item) => (item.amount === null ? [] : [lineByCode.get(item.costCode)!]));
    const unpriced = items.filter((item) => item.amount === null).map((item) => ({ el: `unpriced:${item.costCode}`, costCode: item.costCode, label: lineName(item.costCode, item.label) }));
    const low = romLines.reduce((sum, line) => sum + line.low, 0);
    const high = romLines.reduce((sum, line) => sum + line.high, 0);
    const lines = romLines.map((line) => pricedLine(line, rom));
    const kind = row.kind === "group" ? "element" : romLines.length > 0 ? "line" : "unpriced";
    // LA-1534: a single line's row reads the line's client name.
    const label = kind === "element" ? titleCase(row.label) : lineName(items[0].costCode, row.label);
    const confidence: Tone = romLines.length > 0 ? confidenceOf(romLines) : "none";
    return {
      low,
      high,
      likely: lines.reduce((sum, line) => sum + line.likely, 0),
      el: kind === "element" ? `element:${slug(row.label)}` : kind === "line" ? `line:${items[0].costCode}` : `unpriced:${items[0].costCode}`,
      domId: `scope-${slug(label)}`,
      kind,
      label,
      confidence,
      chip: kind === "element" ? { tone: confidence, text: `${lines.length} Priced` } : kind === "line" ? lines[0].source : { tone: "none", text: "No Rate Yet" },
      share: null,
      ownerDirect,
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
  const groups = ledger.trade.filter((row): row is Extract<SavedLedgerRow, { kind: "group" }> => row.kind === "group");
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
      items: group.items.map((item) => ({ el: null, elRef: `line:${item.costCode}`, label: titleCase(item.label), likely: item.amount })),
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

function waterfallOf(snapshot: PublishedBudgetSnapshot): WaterfallRow[] {
  const { rom } = snapshot;
  const m = rom.markups;
  const ownerDirect = m ? m.ownerDirect : { low: rom.total.low - rom.kulkaContractTotal.low, high: rom.total.high - rom.kulkaContractTotal.high };
  const plan = planLines(snapshot).map((line) => ({ el: `plan-line:${line.id}`, label: titleCase(line.label), amount: line.amount }));
  const row = (over: Omit<WaterfallRow, "likely" | "plan" | "tbd" | "running"> & { tbd?: boolean; plan?: WaterfallRow["plan"] }): WaterfallRow => ({
    ...over,
    likely: whole(over),
    tbd: over.tbd ?? false,
    plan: over.plan ?? [],
    running: null,
  });
  const rows: WaterfallRow[] = [];
  const subtotal = m ? m.subtotal : { ...rom.kulkaContractTotal, basis: "Kulka's contract trade cost, owner-direct lines excluded" };
  rows.push(row({ key: "subtotal", el: "total:trades", elRef: null, label: "Trade Cost", low: subtotal.low, high: subtotal.high, basis: clientBasis(subtotal.basis) }));
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
      label: "Total Budget",
      low: contract.low,
      high: contract.high,
      basis: m ? clientBasis(m.total.basis) : "Trade cost alone. This budget prices no General Requirements, General Conditions, fee or insurance yet.",
    }),
  );
  rows.push(
    row({
      key: "owner-direct",
      el: "total:owner-direct",
      elRef: null,
      label: "Bought by the Owner",
      low: ownerDirect.low,
      high: ownerDirect.high,
      basis: "Scope the owner buys direct, such as appliances. It carries none of Kulka's markups.",
    }),
  );
  const tpc = m ? m.totalProjectCost : rom.total;
  rows.push(row({ key: "total-project-cost", el: "total:total-project-cost", elRef: null, label: "Total Project Cost", low: tpc.low, high: tpc.high, basis: "The Total Budget plus what the owner buys direct." }));

  // The figure as it is built: trade cost, then each markup's rounded figure
  // added on, and the contract figure itself when the last one has joined.
  const markups = rows.filter((r) => r.key === "gr" || r.key === "gc" || r.key === "fee" || r.key === "insurance");
  tieOut(rows, markups);
  let running = rows[0].likely;
  rows[0].running = running;
  markups.forEach((r) => {
    if (!r.tbd) running += r.likely;
    r.running = running;
  });
  return rows;
}

/**
 * LA-1532. A published total never moves, so the rows above it carry the
 * rounding instead: Trade Cost and each markup are rounded so they add to the
 * contract as issued, the largest of them taking the few dollars left over,
 * and the owner's lines take what is left of Total Project Cost.
 */
function tieOut(rows: WaterfallRow[], markups: WaterfallRow[]): void {
  const byKey = (key: WaterfallRow["key"]) => rows.find((r) => r.key === key)!;
  const contract = byKey("kulka-contract");
  const parts = [byKey("subtotal"), ...markups.filter((r) => !r.tbd)];
  apportion(parts.map(midpoint), contract.likely).forEach((value, i) => {
    parts[i].likely = value;
  });
  byKey("owner-direct").likely = byKey("total-project-cost").likely - contract.likely;
}

// --- The client ledger, in MasterFormat order, and the section's facts (LA-1459) ------

const YES = (value: unknown) => value === "yes" || value === true || value === "Yes";

function count(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}


function ledgerOf(
  snapshot: PresentableSnapshot,
  scopes: { trade: Scope[]; owner: Scope[]; classifications: BlockClassification[] },
  contract: Figure,
): { ledger: LedgerRow[]; ink: Record<string, SectionInk>; lightRows: string[]; noLayer: { key: string; label: string }[] } {
  const { rom, answers } = snapshot;
  const gsf = answers.grossSquareFeet > 0 ? answers.grossSquareFeet : null;
  const stated = statedDivisions(scopes.classifications);
  const lineByCode = new Map(rom.lines.map((line) => [line.costCode, line]));
  const codeOf = (scope: Scope) => scope.lines[0]?.costCode ?? scope.unpriced[0]?.costCode ?? "";
  const inkMap: Record<string, SectionInk> = {};
  const rows = [...scopes.trade, ...scopes.owner].map((scope): LedgerRow => {
    const romLines = scope.lines.map((l) => lineByCode.get(l.costCode)).filter((l): l is RomLine => l !== undefined);
    const ink: SectionInk = romLines.length > 0 && romLines.every(isPlaceholder) ? "light" : "full";
    inkMap[scope.el] = ink;
    for (const line of romLines) inkMap[`line:${line.costCode}`] = isPlaceholder(line) ? "light" : "full";
    const sourceText = scope.kind === "line" ? scope.lines[0].source.text : scope.kind === "unpriced" ? "No Rate Yet" : scope.lines.map((l) => `${l.label}: ${l.source.text}`).join(" · ");
    return {
      key: scope.el,
      scope,
      division: divisionFor(codeOf(scope), stated, ITEM_DIVISION_MAP),
      label: scope.label,
      likely: scope.likely,
      perSquareFoot: gsf ? rateUsd(scope.likely / gsf) : null,
      shareOfContract: scope.ownerDirect ? null : `${Math.round((contract.likely > 0 ? scope.likely / contract.likely : 0) * 100)}%`,
      sourceText,
      sourceTone: scope.confidence,
      ink,
      hasLayer: scope.el in LAYERS,
    };
  });
  // Ascending division, then cost code; a row with no division sorts last, in item order.
  rows.sort((a, b) => divisionRank(a.division) - divisionRank(b.division) || compareItemCodes(codeOf(a.scope), codeOf(b.scope)) || a.label.localeCompare(b.label));
  const mixed = rows.filter((r) => r.scope.lines.some((l) => inkMap[`line:${l.costCode}`] === "light"));
  return {
    ledger: rows,
    ink: inkMap,
    lightRows: mixed.map((r) => r.label),
    noLayer: rows.filter((r) => !r.hasLayer).map((r) => ({ key: r.key, label: r.scope.ownerDirect ? `${r.label} (Bought by the Owner)` : r.label })),
  };
}

function sectionFactsOf(snapshot: PresentableSnapshot, publication: Publication, criteria: Criterion[]): SectionFacts {
  const { answers } = snapshot;
  const facts = (answers.facts ?? {}) as Record<string, unknown>;
  const gates = answers.branchGates ?? {};
  const criterion = (code: string) => criteria.find((c) => c.code === code)?.value ?? null;
  const gsf = answers.grossSquareFeet > 0 ? answers.grossSquareFeet : null;
  const units = count(facts.unitCount);
  const elevator = YES(gates.elevator ?? facts.elevator);
  return {
    project: snapshot.project.name,
    version: publication.version,
    date: longDate(publication.issuedAt),
    stories: Math.max(1, count(facts.storiesAboveGrade, 1)),
    belowGrade: YES(gates.levels_below_grade ?? facts.levels_below_grade),
    units: units > 0 ? units : null,
    grossArea: gsf ? `${wholeNumber(gsf)} SF` : null,
    parking: typeof facts.parkingType === "string" ? prettyValue(facts.parkingType) : null,
    demolition: YES(gates.demolition ?? facts.demolition),
    elevators: elevator ? Math.max(1, count(facts.elevatorCount, 1)) : 0,
    elevatorType: criterion("V-1") ?? (typeof facts.elevatorType === "string" ? prettyValue(facts.elevatorType) : null),
    jack: criterion("V-2") ?? (typeof facts.hydraulicJackType === "string" ? prettyValue(facts.hydraulicJackType) : null),
    machineRooms: elevator ? count(facts.elevatorMachineRooms) : 0,
    balconies: YES(gates.balconies ?? facts.balconies),
    storefront: YES(gates.retail_storefronts ?? facts.retail_storefronts),
    form: criterion("A-2"),
  };
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
  const notInThisJob = rom.notInThisJob.map((g) => ({ el: `gate:${g.costCode}`, label: lineName(g.costCode, g.label), decidedBy: decidedBy(g.question, snapshot) }));
  const waiting = rom.tbdGateItems.map((g) => ({ el: `gate:${g.costCode}`, label: lineName(g.costCode, g.label), decidedBy: decidedBy(g.question, snapshot) }));
  const covered = (rows: GateRow[], section: string) => rows.some((row) => row.decidedBy.some((d) => d.gate === gateWords(section.replace(/_/g, " "))));
  const sectionRow = (section: string, answer: string): GateRow => ({ el: `gate:${section}`, label: label(section), decidedBy: [{ question: prompt(section), gate: gateWords(section.replace(/_/g, " ")), answer }] });
  const lineLabel = (code: string | undefined) => {
    const line = rom.lines.find((l) => l.costCode === code);
    return line ? lineName(line.costCode, line.label) : null;
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

// LA-1483: the blend weights and the job counts behind a confidence flag name past jobs, so the client table leaves them out.
const PARAMETER_LABELS: Record<string, string> = {
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


// --- The letter ---------------------------------------------------------------------------

const SMALL_NUMBERS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const few = (n: number) => SMALL_NUMBERS[n] ?? String(n);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const joinAnd = (parts: string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/**
 * The letter the page opens on (LA-1467): what was asked for, the number in a
 * sentence, what it stands on, what it assumes, what is still open, and what
 * happens next. Every sentence is built from facts the model already holds,
 * and a sentence whose facts are missing is left out rather than guessed.
 * A figure inside a sentence points at the element that owns its id, except
 * the two rates, which the letter owns.
 */
function letterOf(input: {
  facts: Fact[];
  headline: BudgetPage["headline"];
  ownerDirect: number;
  record: BudgetPage["record"];
  restsOn: BudgetPage["restsOn"];
  criteria: Criterion[];
  openQuestions: string[];
  nextStage: StageStep | null;
  conceptual: boolean;
}): Letter {
  const { facts, headline, record, restsOn, criteria, openQuestions, nextStage, conceptual } = input;
  const fact = (key: string) => facts.find((f) => f.key === key)?.value ?? null;
  const crit = (code: string) => criteria.find((c) => c.code === code)?.value ?? null;
  const t = (text: string): LetterRun => ({ text });
  const fig = (text: string, ref: { el?: string; elRef?: string; title?: string } = {}): LetterRun => ({ text, figure: true, el: ref.el ?? null, elRef: ref.elRef ?? null, title: ref.title ?? null });
  const lower = (v: string) => v.toLowerCase();
  const paragraphs: LetterRun[][] = [];

  // What was asked for.
  {
    const type = fact("projectType");
    const units = fact("unitCount");
    const stories = fact("storiesAboveGrade");
    const framing = fact("framingSystem");
    const gsf = fact("grossSquareFeet");
    const parking = fact("parkingType");
    const runs: LetterRun[] = [t("You asked Kulka to price a ")];
    if (units) runs.push(fig(units), t("-unit "));
    runs.push(t(`${type ? `${lower(type)} ` : ""}building`));
    const parts: LetterRun[][] = [];
    if (stories) parts.push([t(`${stories} ${stories === "1" ? "story" : "stories"}${framing ? ` of ${lower(framing)} framing` : " above grade"}`)]);
    else if (framing) parts.push([t(`${lower(framing)} framing`)]);
    if (gsf) parts.push([fig(gsf.replace(/ SF$/, "")), t(" gross square feet")]);
    if (parts.length > 0) runs.push(t(": "), ...parts.flatMap((part, i) => (i === 0 ? part : [t(", "), ...part])));
    if (parking && parking !== "None") runs.push(t(`${parts.length > 0 ? "," : ""} with ${lower(parking)} parking`));
    runs.push(t("."));
    if (fact("demolition") === "Yes") {
      const count = fact("demolitionStructureCount");
      const area = fact("demolitionStructureSquareFeet");
      const many = Boolean(count) && count !== "1";
      const structures = many ? `${count} structures` : "one structure";
      if (area) runs.push(t(` First, ${structures} of `), fig(area.replace(/ SF$/, "")), t(` square feet ${many ? "come" : "comes"} down.`));
      else runs.push(t(` First, ${structures} on the site ${many ? "come" : "comes"} down.`));
    }
    runs.push(
      t(
        ` This budget prices that program as you described it, ${conceptual ? "before any drawings exist, " : ""}from the rates Kulka has stated.`,
      ),
    );
    paragraphs.push(runs);
  }

  // The number, in a sentence.
  {
    const c = headline.kulkaContract;
    const runs: LetterRun[] = [
      t("We expect the Total Budget to come to "),
      fig(usd(c.likely), { elRef: "total:kulka-contract" }),
      t(`. ${conceptual ? "Nothing is drawn yet, so every" : "Every"} line is a range rather than a point, and it could land anywhere between `),
      fig(usd(c.low), { elRef: "total:kulka-contract:low" }),
      t(" and "),
      fig(usd(c.high), { elRef: "total:kulka-contract:high" }),
      t(" as the design settles."),
    ];
    const rates: LetterRun[][] = [];
    if (headline.perSquareFoot) rates.push([fig(usd(headline.perSquareFoot.value), { el: "record:per-sf", title: headline.perSquareFoot.arithmetic }), t(" per square foot")]);
    if (headline.perUnit) rates.push([fig(usd(headline.perUnit.value), { el: "record:per-unit", title: headline.perUnit.arithmetic }), t(" per unit")]);
    const rateRuns = rates.flatMap((rate, i) => (i === 0 ? rate : [t(" and "), ...rate]));
    // The rates are the contract's (headlineFigures), so they follow the
    // contract and never the total project cost. Cold read 2026-10-03 (LA-1532):
    // "$20,532,042, or $317 per square foot" read as wrong arithmetic.
    if (rateRuns.length > 0) runs.push(t(` The Total Budget is `), ...rateRuns, t("."));
    if (input.ownerDirect > 0) {
      runs.push(t(" With what you buy direct, the total project cost is "), fig(usd(headline.totalProjectCost.likely), { elRef: "total:total-project-cost" }), t("."));
    }
    paragraphs.push(runs);
  }

  // What it stands on. No past job, job count or job name appears here (LA-1483).
  if (restsOn.priced > 0) {
    const runs: LetterRun[] = [];
    if (restsOn.placeholder === 0) runs.push(t("Every priced line rests on a rate Kulka has stated."));
    else if (restsOn.fromKulkaRates > 0) {
      runs.push(t(`${restsOn.fromKulkaRates} of the ${restsOn.priced} priced lines rest on rates Kulka has stated.`));
      runs.push(t(` The other ${few(restsOn.placeholder)} ${restsOn.placeholder === 1 ? "carries" : "carry"} a placeholder rate until Kulka states one.`));
    } else runs.push(t(`${restsOn.placeholder === 1 ? "The one priced line carries" : `All ${restsOn.placeholder} priced lines carry`} a placeholder rate until Kulka states one.`));
    runs.push(t(" No line here is a bid."));
    paragraphs.push(runs);
  }

  // What it assumes.
  if (criteria.length > 0) {
    const set: string[] = [];
    const a1 = crit("A-1");
    if (a1) set.push(`the construction type (${a1})`);
    const s1 = crit("S-1");
    if (s1) set.push(`the foundation (${lower(s1)})`);
    const e1 = crit("E-1");
    if (e1) set.push(`the electrical service (${e1.replace(/ Service$/, "")})`);
    const v1 = crit("V-1");
    if (v1) {
      const count = fact("elevatorCount");
      const rooms = fact("elevatorMachineRooms");
      set.push(
        `the elevators (${count ? `${count} ${lower(v1)} ${count === "1" ? "car" : "cars"}` : lower(v1)}${rooms ? `, ${rooms} machine ${rooms === "1" ? "room" : "rooms"}` : ""})`,
      );
    }
    const m1 = crit("M-1");
    if (m1) set.push(`the cooling load (${lower(m1)})`);
    paragraphs.push([
      t(
        `Where a decision has not been made, we have assumed one and marked it. ${criteria.length} design ${criteria.length === 1 ? "criterion sets" : "criteria set"} ${set.length > 0 ? joinAnd(set) : "what the drawings will decide later"}. Each is called out on the section drawing inside, and each is yours to change.`,
      ),
    ]);
  }

  // What is still open.
  if (openQuestions.length > 0) {
    const quoted = openQuestions.map((q) => `“${q}”`).join(" ");
    paragraphs.push([
      t(
        openQuestions.length === 1
          ? `One question is still open: ${quoted} Until it is answered, what waits on it sits outside the total rather than inside it as a guess.`
          : `${capital(few(openQuestions.length))} questions are still open: ${quoted} Until they are answered, what waits on them sits outside the total rather than inside it as a guess.`,
      ),
    ]);
  }

  // What happens next.
  paragraphs.push([t(`Read the Project Basis on the next page and the Basis under each division. If anything is wrong, tell us and we reprice from the corrected fact.${nextStage ? ` Then comes ${nextStage.label}. ${nextStage.words}` : ""}`)]);

  return {
    date: longDate(record.issuedAt),
    greeting: record.preparedFor ? `To ${record.preparedFor},` : null,
    title: "Your budget, and what it rests on.",
    paragraphs,
    signature: { name: record.preparedBy, role: "Estimating" },
  };
}

// --- The page ---------------------------------------------------------------------------------

/** Rounds a ledger's lines so they add to `target`, and each scope to its lines (LA-1532). */
function tieLines(scopes: Scope[], target: number): void {
  const lines = scopes.flatMap((scope) => scope.lines);
  apportion(lines.map(midpoint), target).forEach((value, i) => {
    lines[i].likely = value;
  });
  for (const scope of scopes) scope.likely = scope.lines.reduce((sum, line) => sum + line.likely, 0);
}

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
  // LA-1532: the waterfall ties to the contract as issued, and the ledger's
  // lines tie to the waterfall's Trade Cost and owner figure.
  const waterfall = waterfallOf(snapshot);
  const shownFigure = (key: WaterfallRow["key"]) => waterfall.find((r) => r.key === key)!.likely;
  tieLines(trade, shownFigure("subtotal"));
  tieLines(owner, shownFigure("owner-direct"));
  const trades = { ...figure(rom.kulkaContractTotal), likely: shownFigure("subtotal") };
  trade.forEach((scope) => {
    scope.share = trades.likely > 0 ? scope.likely / trades.likely : 0;
  });

  // What This Rests On: over the lines that add to the total.
  const placeholder = priced.filter(isPlaceholder);
  const fromRates = priced.filter((line) => !isPlaceholder(line));
  const tradeCost = { ...figure(rom.total), likely: trades.likely + shownFigure("owner-direct") };

  // Notes: the run's own assumptions, numbered in the order the run wrote them.
  // The id comes from the note's words, never its number (LA-1488).
  // LA-1504: a note each division now shows is cut, and two become one line.
  const seen = new Map<string, number>();
  const notes: Note[] = rom.assumptions
    .filter((text) => !SPLITS_OFF_PAST_JOBS.test(text))
    .flatMap((text) => {
      const base = noteKey(text);
      const nth = (seen.get(base) ?? 0) + 1;
      seen.set(base, nth);
      const words = clarification(text);
      if (words === null) return [];
      const key = nth === 1 ? base : `${base}-${nth}`;
      return [{ el: `note:${key}`, key, number: 0, text: words }];
    })
    .map((note, i) => ({ ...note, number: i + 1 }));

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
        .map((code) => {
          const label = rom.lines.find((l) => l.costCode === code)?.label ?? rom.unpricedItems.find((u) => u.costCode === code)?.label;
          return label === undefined ? null : lineName(code, label);
        })
        .filter((label): label is string => label !== null),
      confidenceReason: criterionWords(a.confidenceReason),
      // LA-1532: Settled only when nothing under it is assumed. M-1 read
      // "Settled" while resting on an assumed glazing band and unit mix.
      settled: a.confidence === "high" && a.inputs.every((input) => input.basis === "stated"),
      inputs: a.inputs.map((input) => ({ name: criterionWords(input.name), value: String(input.value), basis: input.basis === "stated" ? "stated" : "assumed" })),
      steps: a.steps.map((step) => ({ label: criterionWords(step.label), result: criterionWords(step.result) })),
      corrected: a.correction ? { on: a.correction.correctedAt.slice(0, 10), reason: criterionWords(a.correction.reason) } : null,
    };
  });

  // The ledger in MasterFormat order and the section it draws (LA-1459).
  const built = ledgerOf(snapshot, { trade, owner, classifications }, contract);
  const drawing: Drawing = {
    facts: sectionFactsOf(snapshot, publication, criteria),
    ink: built.ink,
    lightRows: built.lightRows,
    noLayer: built.noLayer,
    inkNote: built.lightRows.length > 0 ? "Light ink is a placeholder rate until Kulka states one." : "",
    criteria: criteria.map((c) => ({ code: c.code, value: c.value })),
  };

  // LA-1504: the ledger By Division, and the answers that stay with the whole project.
  const priceds = [...trade, ...owner].flatMap((scope) => scope.lines);
  const { divisions, projectBasis } = drillDown({
    snapshot,
    rows: built.ledger.map((row) => ({
      key: row.key,
      division: row.division,
      ownerDirect: row.scope.ownerDirect,
      lines: row.scope.lines.map((l) => l.costCode),
      unpriced: row.scope.kind === "unpriced" ? [row.key.slice("unpriced:".length)] : row.scope.unpriced.map((u) => u.costCode),
    })),
    items: new Map(
      priceds.map((l) => [l.costCode, { costCode: l.costCode, label: l.label, low: l.low, high: l.high, likely: l.likely, confidence: l.confidence, sourceText: l.source.text }]),
    ),
    facts,
    criteria,
    gates,
    contractLikely: contract.likely,
    grossSquareFeet: gsf,
    classifications,
    keyOf: noteKey,
    usd,
    rateUsd,
    wholeNumber,
    titleCase,
  });

  const ownerDirect = figure({ low: rom.total.low - rom.kulkaContractTotal.low, high: rom.total.high - rom.kulkaContractTotal.high });
  const restsOn: BudgetPage["restsOn"] = {
    priced: priced.length,
    fromKulkaRates: fromRates.length,
    placeholder: placeholder.length,
    confidence: {
      high: priced.filter((l) => l.confidence === "high").length,
      medium: priced.filter((l) => l.confidence === "medium").length,
      low: priced.filter((l) => l.confidence === "low").length,
    },
  };
  const record: BudgetPage["record"] = {
    version: publication.version,
    stageLabel: stages[currentIndex].label,
    issuedAt: publication.issuedAt,
    preparedFor: copy.preparedFor,
    preparedBy: copy.preparedBy ?? "The Kulka Group",
    validityDays: copy.validityDays,
    coverSentence: copy.coverSentence,
  };
  const headline: BudgetPage["headline"] = {
    kulkaContract: contract,
    totalProjectCost: tpc,
    tradeCost,
    grossSquareFeet: gsf,
    unitCount: units,
    perSquareFoot: gsf
      ? { value: Math.round(contract.likely / gsf), arithmetic: `Total Budget over gross area, garage included: ${usd(contract.likely)} over ${wholeNumber(gsf)} SF` }
      : null,
    perUnit: units ? { value: Math.round(contract.likely / units), arithmetic: `Total Budget over the unit count: ${usd(contract.likely)} over ${wholeNumber(units)} units` } : null,
  };

  return {
    documentTitle: `${projectName} · ${stages[currentIndex].label} · Kulka`,
    description: `Kulka's ${stages[currentIndex].label.toLowerCase()} for ${projectName}: the number, its range, where the money is, and what it rests on.`,
    projectName,
    record,
    newer: publication.newer ? { version: publication.newer.version, href: `/b/${publication.newer.token}` } : null,
    sections: [...SECTIONS],
    stages,
    headline,
    project: { facts, assumedCount: facts.filter((f) => f.basis === "assumed").length, line: projectLine },
    money: {
      scopes: trade,
      ownerScopes: owner,
      trades,
      ownerDirect,
      scaleHigh: Math.max(1, ...trade.map((s) => s.high), ...owner.map((s) => s.high)),
      divisions: divisionsOf(rom, classifications),
    },
    ledger: built.ledger,
    divisions,
    projectBasis,
    drawing,
    restsOn,
    criteria,
    waterfall,
    gates,
    notes,
    parameters: parametersOf(rom),
    markupWords: markupWordsOf(rom),
    next: { openQuestions, nextStage: stages[currentIndex + 1] ?? null },
    pricedLineCount: priced.length,
    letter: letterOf({
      facts,
      headline,
      ownerDirect: ownerDirect.likely,
      record,
      restsOn,
      criteria,
      openQuestions,
      nextStage: stages[currentIndex + 1] ?? null,
      conceptual: publication.stage === "conceptual",
    }),
  };
}
