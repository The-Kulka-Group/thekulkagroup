import type { BranchGateAnswer } from "@kulka/engine";

import {
  isQuestionRequired,
  numberAnswerIsValid,
  textAnswerIsValid,
  questionsAtLevel,
  visibleQuestions,
  type FlowDefinition,
  type Question,
  type Responses,
} from "./question-flow";
import type { PriceLevel } from "./part-prices";

// LA-1141: the guided New budget flow's Facts and Scope steps split the same
// questions the intake flow always asked (config/rom/tier1-flow.json) across
// two screens instead of one long form. This module is that split, plus what
// it takes to turn what got answered into a Scope module gate map
// (lib/rom/gates.ts) the run can save to the project the way Run settings
// already does (LA-1109). Nothing here asks a question of its own or states
// what an answer costs; it only groups and reads questions the file and
// lib/rom/question-flow.ts already declare.

/**
 * The ids the Facts step asks: the project's area and type, plus parking,
 * which is a required gate on every project but is never behind another one,
 * so it belongs beside the other top-level facts rather than in the list of
 * conditional scope questions. Everything else `visibleQuestions` returns is
 * the Scope step's, whatever the file adds or removes there.
 */
const FACTS_IDS: ReadonlySet<string> = new Set([
  "project_type",
  "construction_kind",
  "gross_square_feet",
  "stories_above_grade",
  "unit_count",
  "building_count",
  "zip",
  "labor_type",
  "parking_type",
]);

/** The Facts step's questions, in the file's order, wording and choices unchanged. */
export function factsQuestions(definition: FlowDefinition, responses: Responses, level: PriceLevel = 3): Question[] {
  return questionsAtLevel(definition, responses, level).filter((question) => FACTS_IDS.has(question.id));
}

/**
 * The Scope step's questions: every other visible question, which today is
 * the nine yes/no scope gates and demolition's structure-count follow-up,
 * shown only once demolition is answered "yes" (`visibleQuestions` already
 * closes it otherwise). Adding a tenth gate to the file, or a second
 * follow-up, changes this step with no code change here.
 */
export function scopeQuestions(definition: FlowDefinition, responses: Responses, level: PriceLevel = 3): Question[] {
  return questionsAtLevel(definition, responses, level).filter((question) => !FACTS_IDS.has(question.id));
}

/**
 * Whether every required question in the list has a legal-shaped answer, and
 * every optional one left blank or answered validly. A blank optional answer
 * (ZIP, Building Count outside a multifamily project) is fine; an answered
 * one still has to be a shape the question accepts, required or not -- LA-1199:
 * ZIP is "optional, validated as five digits" (LA-1224), not "optional, unchecked".
 */
export function requiredAnswered(questions: Question[], responses: Responses): boolean {
  return questions.every((question) => {
    const value = responses[question.id];
    if (value === undefined || value === "") return !isQuestionRequired(question, responses);
    if (question.kind === "number") return numberAnswerIsValid(question, value);
    if (question.kind === "text") return textAnswerIsValid(question, value);
    return true;
  });
}

/**
 * The Scope module's gate map (lib/rom/gates.ts's `GateAnswers`) built from
 * the flow's own responses, so a run request can save the same answers to
 * the project the Scope module would (LA-1109) without the estimator
 * answering the nine questions twice. Only a currently visible branch gate
 * counts. a stale "yes" left behind on a closed gate is closed by
 * `visibleQuestions` itself.
 *
 * LA-2209 review S2: a required gate above `level` was never asked. It saves
 * as "don't know", the TBD the run gives it (readFlowAnswers), so a later run
 * off the project record keeps its items out of the total too.
 */
export function gatesFromResponses(
  definition: FlowDefinition,
  responses: Responses,
  level: PriceLevel = 3,
): Record<string, BranchGateAnswer> {
  const gates: Record<string, BranchGateAnswer> = {};
  for (const question of visibleQuestions(definition, responses)) {
    if (question.mapsTo.target !== "branch_gate") continue;
    const value = responses[question.id];
    if (value === "yes" || value === "no" || value === "dont_know") {
      gates[question.mapsTo.section] = value;
    } else if (question.level > level && isQuestionRequired(question, responses)) {
      gates[question.mapsTo.section] = "dont_know";
    }
  }
  return gates;
}

/**
 * LA-2209 review Q2: the last question New Budget asks at this level, the one
 * whose answer starts the building's Design and Engineering cards. Balconies
 * used to start them, but Level 1 and 2 never ask it.
 */
export function lastQuestion(definition: FlowDefinition, responses: Responses, level: PriceLevel): Question | undefined {
  return scopeQuestions(definition, responses, level).at(-1);
}

/**
 * LA-2270: below this many gross square feet per unit, the area is almost
 * certainly a typo. Rob entered 1 SF on a 100-unit job and the budget read
 * millions per SF. A placeholder floor until Matt sets the real one.
 */
export const MIN_GSF_PER_UNIT = 300;

/**
 * A plain warning when a multifamily job's area is too small for its unit
 * count, or null. It never blocks the flow; it keeps a typo in view until the
 * estimator fixes it.
 */
export function areaWarning(responses: Responses): string | null {
  if (responses.project_type !== "multifamily") return null;
  const area = Number(responses.gross_square_feet);
  const units = Number(responses.unit_count);
  if (!(area > 0) || !(units > 0)) return null;
  const perUnit = area / units;
  if (perUnit >= MIN_GSF_PER_UNIT) return null;
  const shown = perUnit.toLocaleString("en-US", { maximumFractionDigits: perUnit < 1 ? 2 : 0 });
  return `That is ${shown} SF per unit. Check Gross Square Feet.`;
}
