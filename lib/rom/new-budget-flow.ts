import type { BranchGateAnswer } from "@kulka/engine";

import { numberAnswerIsValid, visibleQuestions, type FlowDefinition, type Question, type Responses } from "./question-flow";

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
  "parking_type",
]);

/** The Facts step's questions, in the file's order, wording and choices unchanged. */
export function factsQuestions(definition: FlowDefinition, responses: Responses): Question[] {
  return visibleQuestions(definition, responses).filter((question) => FACTS_IDS.has(question.id));
}

/**
 * The Scope step's questions: every other visible question, which today is
 * the nine yes/no scope gates and demolition's structure-count follow-up,
 * shown only once demolition is answered "yes" (`visibleQuestions` already
 * closes it otherwise). Adding a tenth gate to the file, or a second
 * follow-up, changes this step with no code change here.
 */
export function scopeQuestions(definition: FlowDefinition, responses: Responses): Question[] {
  return visibleQuestions(definition, responses).filter((question) => !FACTS_IDS.has(question.id));
}

/** Whether every required question in the list has a legal-shaped answer. */
export function requiredAnswered(questions: Question[], responses: Responses): boolean {
  return questions.every((question) => {
    if (!question.required) return true;
    const value = responses[question.id];
    if (value === undefined || value === "") return false;
    return question.kind !== "number" || numberAnswerIsValid(question, value);
  });
}

/**
 * The Scope module's gate map (lib/rom/gates.ts's `GateAnswers`) built from
 * the flow's own responses, so a run request can save the same answers to
 * the project the Scope module would (LA-1109) without the estimator
 * answering the nine questions twice. Only a currently visible branch gate
 * counts. a stale "yes" left behind on a closed gate is closed by
 * `visibleQuestions` itself.
 */
export function gatesFromResponses(
  definition: FlowDefinition,
  responses: Responses,
): Record<string, BranchGateAnswer> {
  const gates: Record<string, BranchGateAnswer> = {};
  for (const question of visibleQuestions(definition, responses)) {
    if (question.mapsTo.target !== "branch_gate") continue;
    const value = responses[question.id];
    if (value === "yes" || value === "no" || value === "dont_know") {
      gates[question.mapsTo.section] = value;
    }
  }
  return gates;
}
