// PLACEHOLDER HEURISTIC -- a disclosed judgment call, not a decision from any
// Linear ticket or doc.
//
// LA-15 ("Ingestion gate: stage, approve, queryable") needs some way to
// decide whether an imported cost line maps confidently enough to one of the
// 54 frozen canonical work items (docs/precon/canonical-work-items.md) to be
// approved, or whether it belongs in the unmapped bucket for a human to
// resolve by hand. Nothing in Linear or in this repo's docs decides how that
// confidence should be computed -- LA-15's own brief names this "the one
// real open design question" and asks for a simple, clearly-labeled first
// pass instead of a silent guess buried in the ingestion route.
//
// This module is that first pass: plain token overlap (Jaccard similarity)
// between the imported line's description and each canonical item's name,
// with a small bonus when the import supplies a MasterFormat division that
// matches the item's own division. A line counts as "mapped" only when its
// best score clears MATCH_THRESHOLD; anything below stays in the unmapped
// bucket rather than being forced onto the nearest code (LA-15 AC4).
//
// What a smarter version could look like later: an LLM classification pass
// that reads the full line (description, division, amount, neighboring
// rows) and proposes a canonical item with its own stated confidence and
// reasoning -- still landing in staging behind the same human approval gate
// this ticket builds, per CONTEXT.md's "controlled goalposts" principle (AI
// output enters the database only through review, never by writing
// directly). Swapping that in means replacing the body of
// `bestCanonicalMatch` below; nothing else in the ingestion pipeline
// (lib/rom/ingest.ts) should need to change, which is why this logic lives
// in its own file rather than inline in the API route or the data-access
// layer.

/** The score at or above which a line counts as mapped, not unmapped (LA-15 AC4). Arbitrary but stated, per the brief. */
export const MATCH_THRESHOLD = 0.4;

/** Added to the token-overlap score when the import's division matches the candidate's own division, capped at 1. Arbitrary but stated. */
const DIVISION_MATCH_BONUS = 0.15;

const STOPWORDS = new Set(["and", "or", "the", "a", "an", "of", "to", "per", "install", "installation"]);

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 0 && !STOPWORDS.has(token)),
  );
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** A two-digit MasterFormat division read from a file might carry a leading zero, a "Division" prefix, or neither. Normalized only for comparison -- the raw value imported stays untouched in storage. */
function normalizeDivision(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.padStart(2, "0");
}

export type CanonicalItemCandidate = {
  id: string;
  itemNumber: string;
  name: string;
  masterformatDivision: string;
};

export type CanonicalMatch = {
  item: CanonicalItemCandidate;
  score: number;
};

/**
 * A canonical item with its name's tokens computed once. Fixed in code
 * review (2026-09-20): `bestCanonicalMatch` used to call `tokenize(item.name)`
 * inside its own per-item loop, and it runs once per imported row against
 * the same fixed 54-item list -- a 500-row file re-tokenized all 54
 * canonical names 27,000 times instead of 54. `tokenizeCanonicalItems`
 * tokenizes the list once; a caller matching many rows against the same
 * list (lib/rom/ingest.ts's stageCostImport) calls it once up front and
 * reuses the result for every row.
 */
export type TokenizedCanonicalItem = {
  item: CanonicalItemCandidate;
  tokens: ReadonlySet<string>;
};

export function tokenizeCanonicalItems(
  items: readonly CanonicalItemCandidate[],
): TokenizedCanonicalItem[] {
  return items.map((item) => ({ item, tokens: tokenize(item.name) }));
}

/**
 * The best-scoring canonical item for one imported line, and its score.
 * Callers decide "mapped" vs "unmapped" by comparing the score against
 * `MATCH_THRESHOLD` -- kept as a named export rather than inlined so a
 * caller can state why the cut lands where it does instead of repeating a
 * magic number.
 *
 * Takes pre-tokenized items (`tokenizeCanonicalItems`) rather than raw
 * `CanonicalItemCandidate`s -- see that function's doc comment.
 *
 * Returns null only when `items` is empty, which does not happen in
 * practice: the 54 canonical work items are frozen seed data every
 * migration since LA-816 guarantees exists.
 */
export function bestCanonicalMatch(
  description: string,
  division: string | null,
  items: readonly TokenizedCanonicalItem[],
): CanonicalMatch | null {
  const descriptionTokens = tokenize(description);
  const normalizedDivision = normalizeDivision(division);
  let best: CanonicalMatch | null = null;

  for (const { item, tokens } of items) {
    let score = jaccard(descriptionTokens, tokens);
    if (normalizedDivision && normalizedDivision === item.masterformatDivision) {
      score = Math.min(1, score + DIVISION_MATCH_BONUS);
    }
    if (!best || score > best.score) best = { item, score };
  }

  return best;
}

// ---------------------------------------------------------------------
// PLACEHOLDER HEURISTIC #2, isolated the same way MATCH_THRESHOLD is above.
//
// ADR 0003 (docs/adr/0003-every-imported-budget-line-carries-a-role.md)
// exists because a real file once priced wall-area rows at a flat
// $250/sqft and corrupted a benchmark by two orders of magnitude. That ADR
// is about *line role* (scope vs. takeoff helper vs. duplicate); nothing in
// this ingestion pipeline checked the imported *rate itself* against any
// plausible magnitude, so the exact failure mode ADR 0003 describes could
// still happen today through a line that carries an eligible role and a
// confident text match but a wildly wrong number. Fixed in code review
// (2026-09-20).
//
// This is a magnitude sanity check, not real outlier statistics: when a
// canonical item already has one or more benchmark rows, a newly imported
// rate for that same item is flagged when it sits more than
// `OUTLIER_MULTIPLIER` times above or below the *median* of the existing
// rows (median, not mean, so one existing outlier does not itself drag the
// bar to a bad number). `OUTLIER_MULTIPLIER = 5` is arbitrary but stated,
// same spirit as `MATCH_THRESHOLD` and `DIVISION_MATCH_BONUS` above --
// chosen to comfortably catch a ADR-0003-sized (two-orders-of-magnitude)
// error while tolerating the real variance construction cost data has
// (site conditions, market, scope granularity) without flagging every
// normal import.
//
// Judgment call: when a canonical item has *no* existing benchmark rows
// yet, there is nothing to compare a new rate against, so this check
// cannot run -- it returns `false` (not an outlier) rather than guessing at
// a universal dollar range, and the caller is expected to know that "not
// flagged" and "checked and passed" are different things for a brand-new
// item. This mirrors this module's own established pattern of disclosing
// what it can't yet do (see MATCH_THRESHOLD's comment) rather than
// papering over the gap with an invented absolute threshold.
export const OUTLIER_MULTIPLIER = 5;

export type BenchmarkRateStats = {
  /** The median of every existing benchmarks.value for this canonical item's cost code. */
  median: number;
  /** How many existing rows the median was computed from. */
  count: number;
};

/**
 * True when `value` sits more than `OUTLIER_MULTIPLIER` times above or
 * below the median of a canonical item's existing benchmark data --
 * see the block comment above for what this does and does not check.
 * `stats` is `undefined` when the item has no existing benchmarks yet, in
 * which case this always returns `false` (see the "Judgment call" above).
 */
export function isRateOutlier(value: number, stats: BenchmarkRateStats | undefined): boolean {
  if (!stats || stats.count === 0 || stats.median <= 0) return false;
  return value > stats.median * OUTLIER_MULTIPLIER || value < stats.median / OUTLIER_MULTIPLIER;
}
