import {
  computeRom,
  type Answers,
  type DataSnapshot,
  type FramingSystem,
  type MarkupChoices,
  type Rom,
} from "@kulka/engine";

import { readFlowAnswers, visibleQuestions, type FlowDefinition, type Responses } from "./question-flow";

// LA-1142: the New budget flow shows the budget building while its questions
// are answered. The browser runs the same pure engine a run does, over the
// same data snapshot (GET /api/rom/snapshot), so the preview is the figure
// the run saved at New Budget's last answer records from that data. Nothing here prices anything or
// writes anything; it only turns a half-answered flow into the engine's input.

/**
 * The engine input for a flow that may be only part answered, or null while
 * the engine cannot run yet (no gross area, or an answer it would refuse).
 *
 * A required question left blank is read as not answered rather than refused,
 * which is what the run does with a blank on the project record: an
 * unanswered scope gate prices as "assumed present" (CONTEXT.md: Branch gate).
 * So the preview shows each gated item as assumed until its question is
 * answered, the same state the run would name.
 *
 * `markups` join only once the estimator reaches the Markups step, so the
 * total reads as trade cost first and gains GRs/GCs, fee and insurance there.
 */
export function previewAnswers(
  definition: FlowDefinition,
  responses: Responses,
  framing: FramingSystem | "",
  markups: MarkupChoices | null,
): Answers | null {
  if (!(Number(responses.gross_square_feet) > 0)) return null;
  const lenient: FlowDefinition = {
    ...definition,
    // LA-1199: `requiredWhen` (Stories Above Grade, Unit Count) is stripped
    // the same as `required`, or the preview would refuse to run on a
    // multifamily project until both were answered, defeating the whole
    // point of showing the budget build as it is answered.
    questions: definition.questions.map((question) => {
      const lenientQuestion = { ...question, required: false };
      delete lenientQuestion.requiredWhen;
      return lenientQuestion;
    }),
  };
  let answers: Answers;
  try {
    ({ answers } = readFlowAnswers(lenient, responses));
  } catch {
    return null;
  }
  return {
    ...answers,
    ...(framing ? { framingSystem: framing } : {}),
    ...(markups ? { markups } : {}),
  };
}

/**
 * LA-1147: the live budget starts empty and scope arrives as answers put it
 * in. A line a scope-gate rule names is in scope only once an answer says so;
 * until then a run would price it as "assumed present", but the preview
 * leaves it off the screen and out of the total.
 *
 * `known` is the engine's ROM over the scope known so far: the same answers,
 * with the benchmarks of every still-unanswered gated line left out, so the
 * engine itself computes the total and the markups on what is known. Nothing
 * is added up here. `full` is the ROM the answers give as they stand, whose
 * "not in this job" and TBD lists are what the estimator actually answered.
 */
export function knownScopeRom(
  answers: Answers,
  snapshot: DataSnapshot,
  awaitingFollowUps: ReadonlySet<string> = new Set(),
): { known: Rom; full: Rom } {
  const full = computeRom(answers, snapshot);
  const waiting = new Set(full.assumedPresentItems.map((item) => item.costCode));
  // A section answered yes whose follow-up questions are still open stays
  // off the field too, with every line in the same element, so demolition
  // never shows a figure before the building behind it is described.
  const gateCodes = (snapshot.branchGateItems ?? [])
    .filter((item) => awaitingFollowUps.has(item.section))
    .map((item) => item.costCode);
  const elements = new Set(
    (snapshot.classifications ?? [])
      .filter((one) => gateCodes.includes(one.costCode) && one.element)
      .map((one) => one.element),
  );
  for (const code of gateCodes) waiting.add(code);
  for (const one of snapshot.classifications ?? []) if (one.element && elements.has(one.element)) waiting.add(one.costCode);
  if (waiting.size === 0) return { known: full, full };
  const known = computeRom(answers, {
    ...snapshot,
    benchmarks: snapshot.benchmarks.filter((benchmark) => !waiting.has(benchmark.costCode)),
  });
  return { known, full };
}

/**
 * The scope sections answered "yes" whose follow-up questions are open but
 * not all answered yet: demolition before its structure count, square
 * footage and type, or the elevator before its count. Matt, 2026-09-27: the
 * live budget priced $18k of demolition "without asking any questions about
 * the building", because Site Demolition is a lump sum that prices on the
 * yes alone. Until the follow-ups are answered, the preview leaves the whole
 * element off the field and out of the total.
 */
export function sectionsAwaitingFollowUps(definition: FlowDefinition, responses: Responses): Set<string> {
  const visible = visibleQuestions(definition, responses);
  const byId = new Map(visible.map((question) => [question.id, question]));
  const awaiting = new Set<string>();
  for (const gate of visible) {
    if (gate.kind !== "branch_gate" || gate.mapsTo.target !== "branch_gate" || responses[gate.id] !== "yes") continue;
    const stack = [...(gate.opens ?? [])];
    while (stack.length > 0) {
      const followUp = byId.get(stack.pop() as string);
      if (!followUp) continue;
      const value = responses[followUp.id];
      if (value === undefined || value === "") {
        awaiting.add(gate.mapsTo.section);
        break;
      }
      stack.push(...(followUp.opens ?? []));
    }
  }
  return awaiting;
}
