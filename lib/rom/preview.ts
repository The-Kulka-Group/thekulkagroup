import type { Answers, FramingSystem, MarkupChoices } from "@kulka/engine";

import { readFlowAnswers, type FlowDefinition, type Responses } from "./question-flow";

// LA-1142: the New budget flow shows the budget building while its questions
// are answered. The browser runs the same pure engine a run does, over the
// same data snapshot (GET /api/rom/snapshot), so the preview is the figure
// "Add and run" will record from that data. Nothing here prices anything or
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
    questions: definition.questions.map((question) => ({ ...question, required: false })),
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
