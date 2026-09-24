// Branch gate items (LA-1028): the map from an intake answer to the one
// canonical work item it switches on or off. CONTEXT.md's Branch gate entry
// promises "a 'no' prices that section at zero" and "a 'don't know' shows
// TBD"; this file is the map that makes those promises real at the line
// level instead of only in words on the assumptions list.
//
// A rule names a cost code, which has to equal a priced line's own cost code
// exactly (rom.ts's RomLine.costCode). benchmarks.cost_code is deliberately
// not foreign-keyed to canonical_work_items.item_number (see the schema
// migration's own note), so this file trusts whoever seeded the rule to have
// kept the two in step, the same trust every other cost-code lookup in this
// engine already extends.
//
// Pure functions only, same rule as rom.ts and rom-markups.ts: nothing here
// reads a clock, a network, or a database.

/** One answer, read as plain text: "yes", "no", "dont_know", or a parking type such as "structured". */
export type GateAnswerValue = string;

/**
 * One canonical item's gate rule. Most items read one section (demolition,
 * amenity_scope, and so on). Item 34a reads two: `section` plus everything in
 * `requiresAllSections`, all read against the same `closesOn` set, because
 * Matt's rule for it is symmetric between the two questions (both "no" closes
 * it; either "yes" prices it).
 */
export type BranchGateItemRule = {
  costCode: string;
  section: string;
  /** Other sections this rule also has to read. Empty for a one-question rule. */
  requiresAllSections: readonly string[];
  /** The answers, from every section this rule reads, that turn the item off. */
  closesOn: readonly GateAnswerValue[];
  statedBy: string;
  statedOn: string;
  reason: string;
};

/**
 * What one gated item resolves to (CONTEXT.md: Branch gate, plus Matt's
 * 2026-09-24 semantics for silence): `priced` reads exactly as it would with
 * no gate at all. `not_in_job` is a "no": removed from the total. `tbd` is a
 * "don't know": outside the total, shown as TBD. `assumed_present` is
 * silence: priced, same as `priced`, but named on the ROM as an assumption.
 */
export type GateLineStatus = "priced" | "not_in_job" | "tbd" | "assumed_present";

export type GateResolution = {
  costCode: string;
  status: GateLineStatus;
  /** Every section read to reach this status, in the rule's own order. */
  sections: readonly string[];
  rule: BranchGateItemRule;
};

type LocalStatus = "close" | "keep" | "tbd" | "absent";

function localStatus(answer: GateAnswerValue | undefined, closesOn: readonly string[]): LocalStatus {
  if (answer === undefined) return "absent";
  if (answer === "dont_know") return "tbd";
  return closesOn.includes(answer) ? "close" : "keep";
}

/**
 * Combines one rule's section-by-section reads into a single status. The same
 * function handles a one-section item (item 34a's `requiresAllSections` is
 * empty, so this runs on one value) and item 34a's two-section item without a
 * special case: a "yes" anywhere prices it, every section closing it turns it
 * off, an unanswered section (with no "yes" to override it) leaves it assumed
 * present, and anything else left over (a "no" beside a "don't know", or two
 * "don't know"s) is TBD.
 */
function combine(locals: readonly LocalStatus[]): GateLineStatus {
  if (locals.some((l) => l === "keep")) return "priced";
  if (locals.every((l) => l === "close")) return "not_in_job";
  if (locals.some((l) => l === "absent")) return "assumed_present";
  return "tbd";
}

/**
 * Resolves every gate-item rule against a project's answers, keyed by cost
 * code. `answers` is read by section name, whatever name the caller gave that
 * section when it built the answers bag (a branch gate's own section, or an
 * intake field name such as "parkingType"); this function does not care which,
 * as long as the rule's `section` and `requiresAllSections` name the same keys.
 */
export function resolveGateItems(
  rules: readonly BranchGateItemRule[],
  answers: Readonly<Record<string, GateAnswerValue>>,
): Map<string, GateResolution> {
  const resolved = new Map<string, GateResolution>();
  for (const rule of rules) {
    const sections = [rule.section, ...rule.requiresAllSections];
    const locals = sections.map((section) => localStatus(answers[section], rule.closesOn));
    resolved.set(rule.costCode, {
      costCode: rule.costCode,
      status: combine(locals),
      sections,
      rule,
    });
  }
  return resolved;
}
