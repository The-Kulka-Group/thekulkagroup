import type {
  BlockClassification,
  DerivedAssumption,
  RaisingItem,
  Rom,
  RomLine,
  ScopeEntry,
  UnpricedItem,
} from "@kulka/engine";

import { divisionFor } from "@/app/(app)/rom/field-order";
import type { Db } from "@/lib/db";
import { toIso } from "@/lib/rom/date";

// LA-1502. The model fields the budget drill-down needs that are not pricing:
// a line's division, its Inclusions and Exclusions, and the owner items that
// would firm it up. The engine prices nothing off any of them, so the run sets
// them here, after the engine, and the snapshot hash stays a fingerprint of
// what priced the budget. Everything below the readers is pure.
//
// The engine sets the rest of LA-1502's fields itself, because they come out
// of pricing: `quantity`, `inputs` and `comparable.unit` (packages/engine).

/** One stored Inclusion or Exclusion, as line_scope_entries holds it. */
export type StoredScopeEntry = ScopeEntry & {
  id: string;
  costCode: string;
  side: "include" | "exclude";
  position: number;
};

/** What the run, or publishing, hands `describeRom`. */
export type LineContext = {
  classifications: readonly BlockClassification[];
  /** canonical_work_items' division per item number (LA-1214). */
  canonicalDivisions: ReadonlyMap<string, string>;
  /** The answers the run priced, facts included. */
  answers: AnswerSource;
  criteria: readonly DerivedAssumption[];
  scopeEntries: readonly StoredScopeEntry[];
};

/** Enough of `Answers` or `RecordedAnswers` to read one answer by key. */
export type AnswerSource = {
  grossSquareFeet?: number;
  framingSystem?: string | null;
  facts?: Readonly<Record<string, unknown>>;
  branchGates?: Readonly<Record<string, unknown>>;
};

/**
 * Facts a Design and Engineering criterion sets rather than the owner. When
 * one is missing, its criterion is the owner item, not a question. The same
 * four keys presentation.ts's ASSUMED_FACTS names.
 */
const CRITERION_FACTS: ReadonlySet<string> = new Set([
  "elevatorType",
  "hydraulicJackType",
  "elevatorMachineRooms",
  "elevatorMachineRoomHvac",
]);

/**
 * The division the budget's By Division view files a cost code under: Matt's
 * placement where he made one (`ledger_division`), else the stated trade
 * division, else what field-order.ts's `divisionFor` reads (a benchmark
 * code's own digits, or the canonical item's row). A breakout with no
 * division of its own sits under its parent's, since it is carved out of it.
 */
export function lineDivision(
  costCode: string,
  classifications: ReadonlyMap<string, BlockClassification>,
  canonicalDivisions: ReadonlyMap<string, string>,
): string | null {
  const stated = classifications.get(costCode);
  if (stated?.ledgerDivision) return stated.ledgerDivision;
  if (stated?.division) return stated.division;
  const found = divisionFor(costCode, new Map(), canonicalDivisions);
  if (found) return found;
  const parent = stated?.breakoutOfCostCode;
  return parent && parent !== costCode ? lineDivision(parent, classifications, canonicalDivisions) : null;
}

/** An answer by the key the facts land under, or undefined when nobody gave one. */
function answerOf(key: string, answers: AnswerSource): unknown {
  if (key === "grossSquareFeet") return answers.grossSquareFeet;
  if (key === "framingSystem") return answers.framingSystem ?? answers.facts?.framingSystem;
  return answers.facts?.[key] ?? answers.branchGates?.[key];
}

function isOpen(value: unknown): boolean {
  return value === undefined || value === null || value === "" || value === "dont_know";
}

/**
 * The owner items that would firm up one line (docs/precon/drill-down-model-proposal.md,
 * "Which owner items firm up a line"). Two kinds count, each once:
 *
 * 1. A question the line prices on (`line.inputs`) that the owner has not
 *    answered, or answered Don't Know.
 * 2. A Design and Engineering criterion that names the line's cost code and
 *    is still a planning assumption (not High).
 *
 * Kulka's own data never counts: past jobs, rates, ranges and parameters are
 * not the owner's to give. A line at High, or out of the job, lists none.
 * Nothing here counts jobs, names one, or says which mark an item moves to.
 */
export function raisedByFor(line: RomLine, answers: AnswerSource, criteria: readonly DerivedAssumption[]): RaisingItem[] {
  if (line.confidence === "high" || line.gateStatus === "not_in_job") return [];
  const items: RaisingItem[] = [];
  for (const key of line.inputs ?? []) {
    if (CRITERION_FACTS.has(key)) continue;
    if (isOpen(answerOf(key, answers))) items.push({ kind: "question", key });
  }
  const codes = criteria
    .filter((c) => c.confidence !== "high" && c.costCodes.includes(line.costCode))
    .map((c) => c.code)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  for (const code of new Set(codes)) items.push({ kind: "criterion", code });
  return items;
}

/** A line's entries on one side, in the estimator's order, without their storage keys. */
export function entriesFor(costCode: string, side: "include" | "exclude", entries: readonly StoredScopeEntry[]): ScopeEntry[] {
  return entries
    .filter((e) => e.costCode === costCode && e.side === side)
    .sort((a, b) => a.position - b.position || a.draftedAt.localeCompare(b.draftedAt) || a.id.localeCompare(b.id))
    .map((e) => ({
      text: e.text,
      drafter: e.drafter,
      draftedBy: e.draftedBy,
      draftedAt: e.draftedAt,
      approvedBy: e.approvedBy,
      approvedAt: e.approvedAt,
    }));
}

/** True only for an entry the estimator approved. Nothing else reaches the client. */
export function isApproved(entry: ScopeEntry): boolean {
  return Boolean(entry.approvedBy && entry.approvedAt);
}

/**
 * The ROM with LA-1502's run-level fields set on every line and unpriced
 * item: division, Inclusions and Exclusions (every entry, with its approval),
 * and each priced line's owner items. Pure.
 */
export function describeRom(rom: Rom, context: LineContext): Rom {
  const byCode = new Map(context.classifications.map((c) => [c.costCode, c]));
  const division = (costCode: string) => lineDivision(costCode, byCode, context.canonicalDivisions);
  const lines = rom.lines.map(
    (line): RomLine => ({
      ...line,
      division: division(line.costCode),
      includes: entriesFor(line.costCode, "include", context.scopeEntries),
      excludes: entriesFor(line.costCode, "exclude", context.scopeEntries),
      raisedBy: raisedByFor(line, context.answers, context.criteria),
    }),
  );
  const unpricedItems = rom.unpricedItems.map(
    (item): UnpricedItem => ({
      ...item,
      division: division(item.costCode),
      includes: entriesFor(item.costCode, "include", context.scopeEntries),
      excludes: entriesFor(item.costCode, "exclude", context.scopeEntries),
    }),
  );
  return { ...rom, lines, unpricedItems };
}

/**
 * A line's breakouts: the lines carved out of it (block_classification's
 * `breakout_of_cost_code`, LA-884). Each keeps its own figure and adds
 * nothing to the total, so these are the sub-items a one-line division can
 * open to without moving its figure.
 */
export function subItemsOf(rom: Rom, costCode: string): RomLine[] {
  return rom.lines.filter((line) => line.breakoutOf === costCode);
}

type EntryRow = {
  id: string;
  cost_code: string;
  side: "include" | "exclude";
  position: number | string;
  body: string;
  drafter: "ai" | "user";
  drafted_by: string;
  drafted_at: Date | string;
  approved_by: string | null;
  approved_at: Date | string | null;
};

/** Every Inclusion and Exclusion stored for one project, approved or not. */
export async function readScopeEntries(db: Db, projectId: string): Promise<StoredScopeEntry[]> {
  const { rows } = await db.query<EntryRow>(
    `select id, cost_code, side, position, body, drafter, drafted_by, drafted_at, approved_by, approved_at
       from line_scope_entries
      where project_id = $1
      order by cost_code, side, position, drafted_at, id`,
    [projectId],
  );
  return rows.map((row) => ({
    id: row.id,
    costCode: row.cost_code,
    side: row.side,
    position: Number(row.position),
    text: row.body,
    drafter: row.drafter,
    draftedBy: row.drafted_by,
    draftedAt: toIso(row.drafted_at),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at === null ? null : toIso(row.approved_at),
  }));
}
