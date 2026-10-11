import type { Question } from "./question-flow";

// LA-1318: New Budget plays each answer and Design and Engineering card as a
// moment on the stage. This module only says what each moment is: which part
// of the model it builds, what its caption reads, and the short name its price
// tag and the box's source line carry. It knows nothing about 3D or timing.

/**
 * A piece of the model that a moment builds, or lights again once built.
 * LA-2211: "site" is the ground the building stands on. No moment builds it;
 * it is a part so site work has somewhere to sit when the building is priced
 * by part, and so picking the ground picks something.
 */
export type StagePart =
  | "site"
  | "massing"
  | "podium"
  | "basement"
  | "foundation"
  | "elevators"
  | "glass"
  | "balconies"
  | "units"
  | "service";

/** Every part, in the order the saved budget's assembly builds them. */
export const STAGE_PARTS: readonly StagePart[] = [
  "site",
  "foundation",
  "basement",
  "podium",
  "massing",
  "glass",
  "balconies",
  "elevators",
  "units",
  "service",
];

export type StageMoment = {
  /** "setup", a question id, or a card code. Two moments with one source are the same decision. */
  source: string;
  /** What the price tag and a box's source line name: "S-1", "Parking". Empty names nothing. */
  tag: string;
  /** The caption's heading, shown as the moment starts. */
  title: string;
  /** The caption's answer, filled in when the moment lands. */
  answer: string;
  /** What it builds. Empty means a caption only. */
  parts: StagePart[];
};

export type StageEvent = StageMoment & { id: number };

/** The Design and Engineering cards New Budget works out, in the order they play. */
export const CARD_ORDER = ["V-1", "V-2", "V-3", "A-1", "A-2", "S-1", "M-0", "M-1", "E-1"] as const;
export type CardCode = (typeof CARD_ORDER)[number];

const CARD_TITLE: Record<CardCode, string> = {
  "V-1": "Elevator Type",
  "V-2": "Hydraulic Jack Type",
  "V-3": "Elevator Machine Rooms",
  "A-1": "Construction Type",
  "A-2": "Building Form",
  "S-1": "Foundation System",
  "M-0": "Window Area",
  "M-1": "HVAC Tonnage",
  "E-1": "Electrical Service",
};

const CARD_PART: Record<CardCode, StagePart> = {
  "V-1": "elevators",
  "V-2": "elevators",
  "V-3": "elevators",
  "A-1": "massing",
  "A-2": "massing",
  "S-1": "foundation",
  "M-0": "glass",
  "M-1": "units",
  "E-1": "service",
};

/**
 * LA-1325: the cards that decided each part, first choice first, so clicking
 * a part of the model opens its decision. The podium and frame are A-1's
 * type; the frame's shape is A-2's. Balconies are an answer, not a card.
 */
const PART_CARDS: Record<StagePart, readonly string[]> = {
  site: [],
  foundation: ["S-1"],
  basement: ["S-1"],
  podium: ["A-1"],
  massing: ["A-2", "A-1"],
  glass: ["M-0"],
  balconies: [],
  elevators: ["V-1", "V-2", "V-3"],
  units: ["M-1"],
  service: ["E-1"],
};

/** The card a part opens, from the cards the budget has. None when no card decided it. */
export function cardForPart(part: StagePart, codes: ReadonlySet<string>): string | null {
  return PART_CARDS[part].find((code) => codes.has(code)) ?? null;
}

export type StageDecision = { code: string; title: string; parts: StagePart[] };

/**
 * LA-1325: the decisions behind the parts a building has, each card once,
 * from the ground up, with every part it decided. The open building view
 * lists them so each one is a keyboard stop, not only a click on the model.
 */
export function decisionsFor(parts: readonly StagePart[], codes: ReadonlySet<string>): StageDecision[] {
  const out: StageDecision[] = [];
  for (const part of STAGE_PARTS) {
    if (!parts.includes(part)) continue;
    const code = cardForPart(part, codes);
    if (!code) continue;
    const found = out.find((one) => one.code === code);
    if (found) found.parts.push(part);
    else out.push({ code, title: CARD_TITLE[code as CardCode] ?? code, parts: [part] });
  }
  return out;
}

/** The short name an answer goes by on its tag and caption. */
const ANSWER_TAG: Record<string, string> = {
  parking_type: "Parking",
  demolition: "Demolition",
  demolition_structure_count: "Structures Coming Down",
  demolition_structure_square_feet: "Demolition Area",
  demolition_structure_type: "Structure Type",
  levels_below_grade: "Below Grade",
  existing_building_tie_in: "Tie-In",
  site_conditions: "Soil and Water",
  amenity_scope: "Amenities",
  elevator: "Elevator",
  elevator_count: "Elevators",
  retail_storefronts: "Retail",
  balconies: "Balconies",
  radio_amplifier: "Radio Amplifier",
};

/** What an answer builds, when the answer puts something on the model. */
function answerParts(questionId: string, value: string): StagePart[] {
  if (questionId === "parking_type") return value === "structured" ? ["podium"] : [];
  if (questionId === "levels_below_grade") return value === "yes" ? ["basement"] : [];
  if (questionId === "retail_storefronts") return value === "yes" ? ["podium"] : [];
  if (questionId === "balconies") return value === "yes" ? ["balconies"] : [];
  return [];
}

const GATE_LABEL: Record<string, string> = { yes: "Yes", no: "No", dont_know: "Don't Know" };

/** The answer as the caption shows it: the choice's label, or the number as typed. */
function answerLabel(question: Question, value: string): string {
  if (question.kind === "branch_gate") return GATE_LABEL[value] ?? value;
  if (question.kind === "choice") return question.choices?.find((c) => c.value === value)?.label ?? value;
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n.toLocaleString("en-US") : value;
}

/** The moment a question's answer plays. A blank answer (a skipped number) plays none. */
export function answerMoment(question: Question, value: string): StageMoment | null {
  if (value.trim() === "") return null;
  const tag = ANSWER_TAG[question.id] ?? question.prompt;
  return { source: question.id, tag, title: tag, answer: answerLabel(question, value), parts: answerParts(question.id, value) };
}

/** The moment a Design and Engineering card plays, from its answer as it now stands. */
export function cardMoment(code: CardCode, answer: string): StageMoment {
  return { source: code, tag: code, title: CARD_TITLE[code], answer, parts: [CARD_PART[code]] };
}

/**
 * The building's first appearance, once setup has its size. The glass comes
 * with it unless M-0 will decide it, which only multifamily jobs get.
 */
export function setupMoment(stories: number, grossSquareFeet: number, multifamily: boolean): StageMoment {
  return {
    source: "setup",
    tag: "",
    title: "The Building",
    answer: `${stories} ${stories === 1 ? "Story" : "Stories"}, ${grossSquareFeet.toLocaleString("en-US")} SF`,
    parts: multifamily ? ["massing"] : ["massing", "glass"],
  };
}
