import type { Answers, BranchGateAnswer } from "@kulka/engine";

import rawTier1Flow from "@/config/rom/tier1-flow.json";

// The tier-1 question flow lives in a data file, not in this module. Every
// surface reads the same file: the site today, the Claude wrapper next
// (LA-22). This module only parses it, decides which questions are visible,
// and maps the answers onto the engine's inputs the way the file says to.
//
// The file declares what is asked and where an answer lands. It never declares
// what an answer costs. `parseFlowDefinition` refuses any key it does not know,
// so a rate or a multiplier cannot ride in on a question.

/** Where the definition sits, for error messages and for tests that edit it. */
export const FLOW_FILE = "config/rom/tier1-flow.json";

/**
 * The engine inputs a question is allowed to feed (`Answers` in the engine).
 * A question answers one value, so the two collections are excluded: `facts` is
 * the bag a judgment rule's condition reads (LA-19), and `branchGates` is every
 * gate answer keyed by section, which the flow builds rather than asks for.
 * `markups` (LA-1016) is excluded too: the ROM request carries it beside the
 * responses, not as an answer to a question.
 */
export type EngineInputName = Exclude<keyof Answers, "facts" | "branchGates" | "markups" | "framingSystem">;

export type QuestionKind = "choice" | "number" | "branch_gate" | "text";

export type ChoiceOption = { value: string; label: string };

export type Mapping =
  | { target: "engine_input"; name: EngineInputName }
  | { target: "branch_gate"; section: string }
  | { target: "intake_field"; name: string };

/**
 * The condition under which a number question's own `opens` list opens. A
 * branch gate opens on "yes" implicitly and never carries one of these. This
 * is the file's whole vocabulary for a number-answer condition: one type,
 * `number_at_least_one`, no free-form threshold and no other key, so a rate
 * or a multiplier cannot ride in beside it the way `mapsTo` already refuses
 * one.
 */
export type OpenCondition = { type: "number_at_least_one" };

/**
 * A question that stays visible on every project but is only mandatory when
 * another question's answer matches one of `equals`. Stories Above Grade and
 * Unit Count use this to be required for a multifamily project without being
 * hidden, and without unanswered, for any other project type (LA-1199: Matt
 * confirmed on 2026-09-27 that both are required for multifamily). Distinct
 * from `opens`/`opensWhen`, which hide a question entirely; this only changes
 * whether an answer is mandatory.
 */
export type RequiredCondition = { questionId: string; equals: string[] };

export type Question = {
  id: string;
  prompt: string;
  help?: string;
  kind: QuestionKind;
  required: boolean;
  choices?: ChoiceOption[];
  /**
   * Question ids this gate opens: on a "yes" for a branch gate, or on
   * `opensWhen`'s condition for a number question.
   */
  opens?: string[];
  /** Required alongside `opens` on a number question; illegal anywhere else. */
  opensWhen?: OpenCondition;
  /** Legal only for a text question: a regular expression the answer must match. */
  pattern?: string;
  /** Makes a question required only when another question's answer matches. Illegal alongside `required: true`. */
  requiredWhen?: RequiredCondition;
  mapsTo: Mapping;
};

export type FlowDefinition = {
  skill: string;
  version: number;
  title: string;
  note?: string;
  questions: Question[];
  output: { kind: "rom"; recordTbdCount: boolean };
};

/** One answer per question id, as the surface collected it. */
export type Responses = Record<string, string>;

export type FlowRecord = {
  skill: string;
  version: number;
  responses: Responses;
  branchGates: Record<string, BranchGateAnswer>;
  /** Sections answered "don't know". They show TBD and stay out of the total. */
  tbdSections: string[];
  tbdCount?: number;
  intakeFields: Record<string, string | number>;
};

/** The answers a run used, plus the flow record written beside them. */
export type FlowAnswers = { answers: Answers; recorded: Record<string, unknown> };

/** The responses do not make a complete, legal set of answers. */
export class FlowAnswersInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FlowAnswersInvalid";
  }
}

/** The definition file itself is wrong. */
export class FlowDefinitionInvalid extends Error {
  constructor(message: string) {
    super(`${FLOW_FILE}: ${message}`);
    this.name = "FlowDefinitionInvalid";
  }
}

/**
 * The three answers every branch gate takes (GLOSSARY.md: Branch gate). They
 * live in code rather than in the file so no edit can add a fourth.
 */
export const BRANCH_GATE_ANSWERS: readonly { value: BranchGateAnswer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "dont_know", label: "Don't Know" },
];

const QUESTION_KEYS = new Set([
  "id",
  "prompt",
  "help",
  "kind",
  "required",
  "choices",
  "opens",
  "opensWhen",
  "pattern",
  "requiredWhen",
  "mapsTo",
]);

const OPEN_CONDITION_KEYS = new Set(["type"]);

const REQUIRED_CONDITION_KEYS = new Set(["questionId", "equals"]);

const DEFINITION_KEYS = new Set(["skill", "version", "title", "note", "questions", "output"]);

/** Legal values for the engine inputs a question may feed. */
const ENGINE_INPUT_CHOICES: Record<EngineInputName, readonly string[] | "number"> = {
  projectType: ["multifamily", "self_storage"],
  constructionKind: ["new", "renovation"],
  grossSquareFeet: "number",
};

const GATE_ANSWER_VALUES = new Set(BRANCH_GATE_ANSWERS.map((answer) => answer.value));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireKnownKeys(value: Record<string, unknown>, allowed: Set<string>, where: string) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new FlowDefinitionInvalid(`${where} carries an unknown key "${key}".`);
    }
  }
}

function parseMapping(value: unknown, where: string): Mapping {
  if (!isRecord(value)) throw new FlowDefinitionInvalid(`${where} needs a mapsTo object.`);

  if (value.target === "engine_input") {
    requireKnownKeys(value, new Set(["target", "name"]), `${where} mapsTo`);
    const name = value.name;
    if (typeof name !== "string" || !(name in ENGINE_INPUT_CHOICES)) {
      throw new FlowDefinitionInvalid(`${where} maps to an engine input that does not exist.`);
    }
    return { target: "engine_input", name: name as EngineInputName };
  }

  if (value.target === "branch_gate") {
    requireKnownKeys(value, new Set(["target", "section"]), `${where} mapsTo`);
    if (typeof value.section !== "string" || value.section.length === 0) {
      throw new FlowDefinitionInvalid(`${where} needs a branch-gate section name.`);
    }
    return { target: "branch_gate", section: value.section };
  }

  if (value.target === "intake_field") {
    requireKnownKeys(value, new Set(["target", "name"]), `${where} mapsTo`);
    if (typeof value.name !== "string" || value.name.length === 0) {
      throw new FlowDefinitionInvalid(`${where} needs an intake field name.`);
    }
    return { target: "intake_field", name: value.name };
  }

  throw new FlowDefinitionInvalid(`${where} has a mapsTo target this code does not know.`);
}

function parseOpenCondition(value: unknown, where: string): OpenCondition {
  if (!isRecord(value)) throw new FlowDefinitionInvalid(`${where} needs an opensWhen object.`);
  requireKnownKeys(value, OPEN_CONDITION_KEYS, `${where} opensWhen`);
  if (value.type !== "number_at_least_one") {
    throw new FlowDefinitionInvalid(`${where} has an opensWhen type this code does not know.`);
  }
  return { type: "number_at_least_one" };
}

function parseRequiredCondition(value: unknown, where: string): RequiredCondition {
  if (!isRecord(value)) throw new FlowDefinitionInvalid(`${where} needs a requiredWhen object.`);
  requireKnownKeys(value, REQUIRED_CONDITION_KEYS, `${where} requiredWhen`);
  const { questionId, equals } = value;
  if (typeof questionId !== "string" || questionId.length === 0) {
    throw new FlowDefinitionInvalid(`${where} needs a requiredWhen questionId.`);
  }
  if (!Array.isArray(equals) || equals.length === 0 || equals.some((one) => typeof one !== "string" || one.length === 0)) {
    throw new FlowDefinitionInvalid(`${where} needs a requiredWhen equals list of text values.`);
  }
  return { questionId, equals: equals as string[] };
}

function parseQuestion(value: unknown, index: number): Question {
  const where = `question ${index + 1}`;
  if (!isRecord(value)) throw new FlowDefinitionInvalid(`${where} is not an object.`);
  requireKnownKeys(value, QUESTION_KEYS, where);

  const { id, prompt, help, kind, required, choices, opens, opensWhen, pattern, requiredWhen } = value;
  if (typeof id !== "string" || id.length === 0) {
    throw new FlowDefinitionInvalid(`${where} needs an id.`);
  }
  if (typeof prompt !== "string" || prompt.length === 0) {
    throw new FlowDefinitionInvalid(`Question "${id}" needs a prompt.`);
  }
  if (help !== undefined && typeof help !== "string") {
    throw new FlowDefinitionInvalid(`Question "${id}" has help text that is not text.`);
  }
  if (kind !== "choice" && kind !== "number" && kind !== "branch_gate" && kind !== "text") {
    throw new FlowDefinitionInvalid(`Question "${id}" has a kind this code does not know.`);
  }
  if (typeof required !== "boolean") {
    throw new FlowDefinitionInvalid(`Question "${id}" needs required to be true or false.`);
  }

  let parsedChoices: ChoiceOption[] | undefined;
  if (kind === "choice") {
    if (!Array.isArray(choices) || choices.length < 2) {
      throw new FlowDefinitionInvalid(`Question "${id}" needs at least two choices.`);
    }
    parsedChoices = choices.map((choice) => {
      if (!isRecord(choice)) throw new FlowDefinitionInvalid(`Question "${id}" has a bad choice.`);
      requireKnownKeys(choice, new Set(["value", "label"]), `Question "${id}" choice`);
      const { value: choiceValue, label } = choice;
      if (typeof choiceValue !== "string" || choiceValue.length === 0) {
        throw new FlowDefinitionInvalid(`Question "${id}" has a choice with no value.`);
      }
      if (typeof label !== "string" || label.length === 0) {
        throw new FlowDefinitionInvalid(`Question "${id}" has a choice with no label.`);
      }
      return { value: choiceValue, label };
    });
  } else if (choices !== undefined) {
    throw new FlowDefinitionInvalid(`Question "${id}" lists choices but is not a choice question.`);
  }

  let parsedOpens: string[] | undefined;
  if (opens !== undefined) {
    if (kind !== "branch_gate" && kind !== "number") {
      throw new FlowDefinitionInvalid(`Question "${id}" opens follow-ups but is not a branch gate or a number.`);
    }
    if (!Array.isArray(opens) || opens.some((one) => typeof one !== "string")) {
      throw new FlowDefinitionInvalid(`Question "${id}" has a bad opens list.`);
    }
    parsedOpens = opens as string[];
  }

  let parsedOpensWhen: OpenCondition | undefined;
  if (opensWhen !== undefined) {
    if (kind !== "number") {
      throw new FlowDefinitionInvalid(`Question "${id}" has an opensWhen condition but is not a number question.`);
    }
    parsedOpensWhen = parseOpenCondition(opensWhen, `Question "${id}"`);
  }
  if (kind === "number" && parsedOpens && !parsedOpensWhen) {
    throw new FlowDefinitionInvalid(
      `Question "${id}" opens follow-ups on a number answer but has no opensWhen condition.`,
    );
  }
  if (parsedOpensWhen && !parsedOpens) {
    throw new FlowDefinitionInvalid(`Question "${id}" has an opensWhen condition but opens nothing.`);
  }

  let parsedPattern: string | undefined;
  if (pattern !== undefined) {
    if (kind !== "text") {
      throw new FlowDefinitionInvalid(`Question "${id}" lists a pattern but is not a text question.`);
    }
    if (typeof pattern !== "string" || pattern.length === 0) {
      throw new FlowDefinitionInvalid(`Question "${id}" has a pattern that is not text.`);
    }
    try {
      new RegExp(pattern);
    } catch {
      throw new FlowDefinitionInvalid(`Question "${id}" has a pattern that is not a valid expression.`);
    }
    parsedPattern = pattern;
  }

  let parsedRequiredWhen: RequiredCondition | undefined;
  if (requiredWhen !== undefined) {
    if (required === true) {
      throw new FlowDefinitionInvalid(`Question "${id}" is already required, so requiredWhen is redundant.`);
    }
    parsedRequiredWhen = parseRequiredCondition(requiredWhen, `Question "${id}"`);
  }

  const question: Question = {
    id,
    prompt,
    kind,
    required,
    mapsTo: parseMapping(value.mapsTo, `Question "${id}"`),
  };
  if (help !== undefined) question.help = help as string;
  if (parsedChoices) question.choices = parsedChoices;
  if (parsedOpens) question.opens = parsedOpens;
  if (parsedOpensWhen) question.opensWhen = parsedOpensWhen;
  if (parsedPattern) question.pattern = parsedPattern;
  if (parsedRequiredWhen) question.requiredWhen = parsedRequiredWhen;

  if (question.kind === "branch_gate" && question.mapsTo.target !== "branch_gate") {
    throw new FlowDefinitionInvalid(`Question "${id}" is a branch gate and must map to one.`);
  }
  if (question.mapsTo.target === "branch_gate" && question.kind !== "branch_gate") {
    throw new FlowDefinitionInvalid(`Question "${id}" maps to a branch gate but is not one.`);
  }

  if (question.mapsTo.target === "engine_input") {
    const legal = ENGINE_INPUT_CHOICES[question.mapsTo.name];
    if (legal === "number" && question.kind !== "number") {
      throw new FlowDefinitionInvalid(`Question "${id}" feeds a number the engine reads.`);
    }
    if (legal !== "number") {
      const offered = question.choices?.map((choice) => choice.value) ?? [];
      const illegal = offered.filter((one) => !legal.includes(one));
      if (question.kind !== "choice" || illegal.length > 0) {
        throw new FlowDefinitionInvalid(
          `Question "${id}" offers an answer the engine does not accept: ${illegal.join(", ")}.`,
        );
      }
    }
  }

  return question;
}

/** Read a definition, refusing anything this code cannot honour. */
export function parseFlowDefinition(raw: unknown): FlowDefinition {
  if (!isRecord(raw)) throw new FlowDefinitionInvalid("The definition is not an object.");
  requireKnownKeys(raw, DEFINITION_KEYS, "The definition");

  const { skill, version, title, note, questions, output } = raw;
  if (typeof skill !== "string" || skill.length === 0) {
    throw new FlowDefinitionInvalid("The definition needs a skill name.");
  }
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new FlowDefinitionInvalid("The definition needs a whole version number above zero.");
  }
  if (typeof title !== "string" || title.length === 0) {
    throw new FlowDefinitionInvalid("The definition needs a title.");
  }
  if (note !== undefined && typeof note !== "string") {
    throw new FlowDefinitionInvalid("The note is not text.");
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new FlowDefinitionInvalid("The definition needs at least one question.");
  }
  if (!isRecord(output) || output.kind !== "rom" || typeof output.recordTbdCount !== "boolean") {
    throw new FlowDefinitionInvalid("The definition needs an output shape of kind rom.");
  }
  requireKnownKeys(output, new Set(["kind", "recordTbdCount"]), "The output shape");

  const parsed = questions.map(parseQuestion);

  const seen = new Set<string>();
  for (const question of parsed) {
    if (seen.has(question.id)) {
      throw new FlowDefinitionInvalid(`Two questions share the id "${question.id}".`);
    }
    seen.add(question.id);
  }

  const openedBy = new Map<string, string>();
  for (const question of parsed) {
    for (const opened of question.opens ?? []) {
      if (!seen.has(opened)) {
        throw new FlowDefinitionInvalid(`Question "${question.id}" opens "${opened}", which is not there.`);
      }
      if (opened === question.id) {
        throw new FlowDefinitionInvalid(`Question "${question.id}" opens itself.`);
      }
      const already = openedBy.get(opened);
      if (already) {
        throw new FlowDefinitionInvalid(
          `Question "${opened}" is opened by both "${already}" and "${question.id}".`,
        );
      }
      openedBy.set(opened, question.id);
    }
  }

  for (const question of parsed) {
    if (!question.requiredWhen) continue;
    if (!seen.has(question.requiredWhen.questionId)) {
      throw new FlowDefinitionInvalid(
        `Question "${question.id}" has a requiredWhen questionId "${question.requiredWhen.questionId}", which is not there.`,
      );
    }
  }

  const engineInputs = new Set<EngineInputName>();
  for (const question of parsed) {
    if (question.mapsTo.target !== "engine_input") continue;
    if (engineInputs.has(question.mapsTo.name)) {
      throw new FlowDefinitionInvalid(`Two questions feed the engine input "${question.mapsTo.name}".`);
    }
    if (openedBy.has(question.id)) {
      throw new FlowDefinitionInvalid(
        `Question "${question.id}" feeds the engine but sits behind a gate, so the engine could go without it.`,
      );
    }
    engineInputs.add(question.mapsTo.name);
  }
  for (const name of Object.keys(ENGINE_INPUT_CHOICES) as EngineInputName[]) {
    if (!engineInputs.has(name)) {
      throw new FlowDefinitionInvalid(`No question feeds the engine input "${name}".`);
    }
  }

  // An intake field and a branch gate section become facts under their own
  // names, so two that share a name would leave one silently overwriting the
  // other and a judgment rule reading the wrong one.
  const sections = new Set<string>();
  for (const question of parsed) {
    if (question.mapsTo.target === "branch_gate") sections.add(question.mapsTo.section);
  }
  for (const question of parsed) {
    if (question.mapsTo.target !== "intake_field") continue;
    if (sections.has(question.mapsTo.name)) {
      throw new FlowDefinitionInvalid(
        `Intake field "${question.mapsTo.name}" has the same name as a branch gate section.`,
      );
    }
  }

  const definition: FlowDefinition = {
    skill,
    version,
    title,
    questions: parsed,
    output: { kind: "rom", recordTbdCount: output.recordTbdCount },
  };
  if (note !== undefined) definition.note = note as string;
  return definition;
}

let tier1: FlowDefinition | undefined;

/** The tier-1 flow the site and every other surface runs. */
export function tier1Flow(): FlowDefinition {
  tier1 ??= parseFlowDefinition(rawTier1Flow);
  return tier1;
}

function gateAnswerFor(gateId: string, responses: Responses): BranchGateAnswer | undefined {
  const answer = responses[gateId];
  return answer && GATE_ANSWER_VALUES.has(answer as BranchGateAnswer)
    ? (answer as BranchGateAnswer)
    : undefined;
}

/**
 * Whether a gate question's own answer opens whatever it gates: a branch
 * gate opens on "yes"; a number question with an `opensWhen` condition opens
 * once its answer meets that condition. Anything else (a number question
 * with no `opensWhen`, which parsing already refuses if it also has
 * `opens`) never opens anything.
 */
function gateSatisfied(gate: Question, responses: Responses): boolean {
  if (gate.kind === "branch_gate") {
    return gateAnswerFor(gate.id, responses) === "yes";
  }
  if (gate.kind === "number" && gate.opensWhen?.type === "number_at_least_one") {
    const raw = responses[gate.id];
    if (raw === undefined || raw === "") return false;
    const value = Number(raw);
    return Number.isFinite(value) && value >= 1;
  }
  return false;
}

/**
 * The questions to put in front of someone, in the file's order. A follow-up
 * appears only once the gate above it is satisfied (`gateSatisfied`); closing
 * that gate closes the branch, so nothing under it is ever asked.
 */
export function visibleQuestions(definition: FlowDefinition, responses: Responses): Question[] {
  const byId = new Map(definition.questions.map((question) => [question.id, question]));
  const gateOf = new Map<string, string>();
  for (const question of definition.questions) {
    for (const opened of question.opens ?? []) gateOf.set(opened, question.id);
  }

  // Every gate above a question has to be open, not just the one directly
  // above it. Closing an outer gate closes the whole branch under it, so a
  // stale answer left on an inner gate cannot keep a grandchild alive.
  const open = new Map<string, boolean>();
  const isOpen = (id: string, visiting: Set<string>): boolean => {
    const cached = open.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return false;

    visiting.add(id);
    const gateId = gateOf.get(id);
    const gate = gateId ? byId.get(gateId) : undefined;
    const result = !gateId || !gate ? true : isOpen(gateId, visiting) && gateSatisfied(gate, responses);
    visiting.delete(id);

    open.set(id, result);
    return result;
  };

  return definition.questions.filter((question) => isOpen(question.id, new Set()));
}

/**
 * Whether a number question's raw answer is one it accepts. A plain number
 * question needs a value above zero. A question that opens follow-ups on its
 * own answer (`opensWhen`) also accepts zero, because zero is the answer
 * that closes those follow-ups rather than an unanswered field.
 */
export function numberAnswerIsValid(question: Question, raw: string): boolean {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return false;
  if (value === 0) return question.opensWhen?.type === "number_at_least_one";
  return true;
}

function readNumber(question: Question, raw: string): number {
  if (!numberAnswerIsValid(question, raw)) {
    throw new FlowAnswersInvalid(
      question.opensWhen
        ? `"${question.prompt}" needs a number, zero or above.`
        : `"${question.prompt}" needs a number above zero.`,
    );
  }
  return Number(raw);
}

/**
 * Whether a text question's raw answer is one it accepts. A question with no
 * `pattern` accepts anything non-empty; a `pattern` is checked as a whole-string
 * match (LA-1224: ZIP's five digits, `^[0-9]{5}$`).
 */
export function textAnswerIsValid(question: Question, raw: string): boolean {
  if (question.pattern === undefined) return true;
  return new RegExp(question.pattern).test(raw);
}

function readText(question: Question, raw: string): string {
  if (!textAnswerIsValid(question, raw)) {
    throw new FlowAnswersInvalid(`"${question.prompt}" is not a valid answer.`);
  }
  return raw;
}

/**
 * Whether a question is mandatory for this set of responses: either it is
 * unconditionally `required`, or its `requiredWhen` condition matches (LA-1199:
 * Stories Above Grade and Unit Count are required for a multifamily project and
 * optional for any other, without being hidden either way).
 */
export function isQuestionRequired(question: Question, responses: Responses): boolean {
  if (question.required) return true;
  if (!question.requiredWhen) return false;
  const value = responses[question.requiredWhen.questionId];
  return value !== undefined && question.requiredWhen.equals.includes(value);
}

/**
 * Turn the collected responses into the engine's answers, plus the record of
 * the flow that produced them.
 *
 * Nothing here knows which question feeds which input. The definition says so,
 * and this walks it.
 */
export function readFlowAnswers(definition: FlowDefinition, responses: Responses): FlowAnswers {
  const asked = visibleQuestions(definition, responses);
  const engineInputs: Partial<Record<EngineInputName, string | number>> = {};
  const branchGates: Record<string, BranchGateAnswer> = {};
  const intakeFields: Record<string, string | number> = {};
  const tbdSections: string[] = [];
  const kept: Responses = {};

  for (const question of asked) {
    const raw = responses[question.id];
    if (raw === undefined || raw === "") {
      if (isQuestionRequired(question, responses)) {
        throw new FlowAnswersInvalid(`"${question.prompt}" was not answered.`);
      }
      continue;
    }
    kept[question.id] = raw;

    if (question.kind === "branch_gate") {
      const answer = gateAnswerFor(question.id, responses);
      if (!answer) {
        throw new FlowAnswersInvalid(`"${question.prompt}" takes yes, no, or don't know.`);
      }
      const section = (question.mapsTo as { target: "branch_gate"; section: string }).section;
      branchGates[section] = answer;
      if (answer === "dont_know") tbdSections.push(section);
      continue;
    }

    if (question.kind === "choice") {
      const legal = question.choices?.some((choice) => choice.value === raw) ?? false;
      if (!legal) throw new FlowAnswersInvalid(`"${question.prompt}" has no such answer.`);
    }

    let value: string | number = raw;
    if (question.kind === "number") value = readNumber(question, raw);
    else if (question.kind === "text") value = readText(question, raw);
    if (question.mapsTo.target === "engine_input") engineInputs[question.mapsTo.name] = value;
    else if (question.mapsTo.target === "intake_field") intakeFields[question.mapsTo.name] = value;
  }

  const { projectType, constructionKind, grossSquareFeet } = engineInputs;
  if (
    typeof projectType !== "string" ||
    typeof constructionKind !== "string" ||
    typeof grossSquareFeet !== "number"
  ) {
    throw new FlowAnswersInvalid("The questions the engine needs were not all answered.");
  }

  // A judgment rule's condition reads a project fact (LA-19). The facts a project
  // gives are its intake fields and its branch gate answers, so both go in under
  // the names the definition file gave them. A gate answer stays the raw yes, no
  // or dont_know, because a rule that turns on "don't know" is a different rule
  // from one that turns on "no". parseFlowDefinition refuses a definition where
  // the two name spaces collide, so neither can quietly overwrite the other.
  const facts: Record<string, string | number | boolean> = { ...intakeFields, ...branchGates };

  const answers = {
    projectType,
    constructionKind,
    grossSquareFeet,
    facts,
    branchGates,
  } as Answers;

  const record: FlowRecord = {
    skill: definition.skill,
    version: definition.version,
    responses: kept,
    branchGates,
    tbdSections,
    intakeFields,
  };
  if (definition.output.recordTbdCount) record.tbdCount = tbdSections.length;

  return { answers, recorded: { ...answers, flow: record } };
}
