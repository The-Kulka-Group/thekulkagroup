import {
  type Answers,
  type DerivedAssumption,
  type DerivedInput,
  type DerivedStep,
  type FramingSystem,
  effectiveValue,
  ELEVATOR_COST_CODE,
  elevatorTravelFeet,
  floorToFloorFor,
  validateDerivedAssumption,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { deleteDerivedAssumption, saveDerivedAssumption } from "./derived-assumptions";

// LA-1265. V-2, Hydraulic Jack Type: in-ground (a drilled well hole with the
// cylinder in a casing), holeless, or roped. It runs only when V-1 says
// hydraulic, and it decides whether item 26i, Hydraulic Well Hole and Casing,
// comes into the budget. The rule is the research's
// (docs/precon/research/la-hydraulic-jack-type.md, Section 5): travel against
// the manufacturers' reach for each jack, with wet ground tipping the middle
// band toward holeless.
//
// Matt, 2026-09-28: the override is a question the estimator can answer (the
// card's choices, stored as a correction), and a job where rock is possible
// drops to low confidence rather than asking about rock. Code does all of the
// arithmetic; nothing here calls Jev.

export const V2_CODE = "V-2";
export const V2_LABEL = "Hydraulic Jack Type";
/** Item 26i, the well hole an in-ground jack needs (the Elevator element, LA-1257). */
export const WELL_HOLE_COST_CODE = "26i";
export const V2_COST_CODES = [ELEVATOR_COST_CODE, WELL_HOLE_COST_CODE];

/** The three answers, as the card shows them. */
export const JACK_TYPES = ["In-Ground", "Holeless", "Roped"] as const;
export type JackType = (typeof JACK_TYPES)[number];

/** The fact the engine reads, so the well hole's relationship can check it. */
export type JackFact = "in_ground" | "holeless" | "roped";

export function jackFact(text: string): JackFact | null {
  const lower = text.toLowerCase();
  if (lower.startsWith("in-ground") || lower.startsWith("in ground")) return "in_ground";
  if (lower.startsWith("holeless")) return "holeless";
  if (lower.startsWith("roped")) return "roped";
  return null;
}

/** Reach, in feet of travel, from the manufacturers' planning guides (the research, Section 1). */
export const HOLELESS_STANDARD_PIT_FEET = 34;
export const HOLELESS_DEEP_PIT_FEET = 48;
export const IN_GROUND_MAX_FEET = 60;

/**
 * Three-digit ZIP prefixes where shallow rock is possible: Westchester and
 * Putnam (105 to 108), Rockland and Orange (109), and the mid-Hudson Valley
 * (124 to 126). The intake does not ask about rock (rom-spec.md leaves it
 * out for Long Island), so V-2 drops to low confidence here instead.
 */
const ROCK_POSSIBLE_ZIP3 = new Set(["105", "106", "107", "108", "109", "124", "125", "126"]);

export function rockPossible(zip: string | null): boolean {
  return zip !== null && ROCK_POSSIBLE_ZIP3.has(zip.slice(0, 3));
}

export type JackCriterionFacts = {
  storiesAboveGrade: number | null;
  framingSystem: FramingSystem | null;
  hasTallerGroundFloor: boolean;
  /** The levels below grade answer; yes adds a stop (the research assumes the elevator serves it). */
  belowGrade: "yes" | "no" | "dont_know" | null;
  /** Known groundwater or poor soil. */
  siteConditions: "yes" | "no" | "dont_know" | null;
  zip: string | null;
};

function feet(value: number): string {
  const whole = Math.floor(value);
  const inches = Math.round((value - whole) * 12);
  return inches === 0 ? `${whole}'-0"` : `${whole}'-${inches}"`;
}

const WORDS = { yes: "Yes", no: "No", dont_know: "Don't Know" } as const;

/**
 * Derives V-2 for a hydraulic job. Null when Stories Above Grade is not known
 * yet, the same rule V-1 follows: nothing here invents a story count.
 */
export function deriveJackType(facts: JackCriterionFacts): DerivedAssumption | null {
  if (facts.storiesAboveGrade === null) return null;

  const floorToFloor = floorToFloorFor(facts.framingSystem);
  const servesBelowGrade = facts.belowGrade === "yes";
  const stops = facts.storiesAboveGrade + (servesBelowGrade ? 1 : 0);
  const travel = elevatorTravelFeet(stops, floorToFloor.feet, facts.hasTallerGroundFloor);
  const wet = facts.siteConditions === "yes";
  const siteUnknown = facts.siteConditions === null || facts.siteConditions === "dont_know";
  const rock = rockPossible(facts.zip);

  const inputs: DerivedInput[] = [
    { name: "Elevator Type", value: "Hydraulic (V-1)", basis: "stated" },
    { name: "Stories Above Grade", value: String(facts.storiesAboveGrade), basis: "stated" },
    {
      name: "Levels Below Grade",
      value: servesBelowGrade ? "Yes, one stop added" : facts.belowGrade ? WORDS[facts.belowGrade] : "Not answered",
      basis: facts.belowGrade ? "stated" : "assumed",
    },
    {
      name: "Floor-to-Floor",
      value: feet(floorToFloor.feet),
      basis: floorToFloor.assumed ? "assumed" : "stated",
    },
    {
      name: "Groundwater or Poor Soil",
      value: facts.siteConditions ? WORDS[facts.siteConditions] : "Not answered",
      basis: facts.siteConditions && facts.siteConditions !== "dont_know" ? "stated" : "assumed",
    },
  ];
  if (facts.hasTallerGroundFloor) {
    inputs.push({ name: "Ground Floor", value: "Retail or amenity, 15'-0\"", basis: "stated" });
  }
  if (facts.zip) inputs.push({ name: "ZIP", value: facts.zip, basis: "stated" });

  const steps: DerivedStep[] = [
    { label: "Stops", result: `${stops}${servesBelowGrade ? " (with the level below grade)" : ""}` },
    { label: "Floor-to-floor", result: `${feet(floorToFloor.feet)}${floorToFloor.assumed ? " (assumed, wood)" : ""}` },
    { label: "Travel", result: `${feet(travel)} (${travel.toFixed(1)} ft)` },
  ];

  let value: JackType;
  let band: string;
  let confident: boolean;
  let reason: string;
  if (travel <= HOLELESS_STANDARD_PIT_FEET) {
    value = "Holeless";
    band = `${HOLELESS_STANDARD_PIT_FEET} ft or less`;
    confident = true;
    reason = `Travel of ${travel.toFixed(1)} ft is inside a holeless jack's reach with a standard 4 ft pit (TK Elevator 33'-6", Otis 34'-4"), so no well hole.`;
  } else if (travel <= HOLELESS_DEEP_PIT_FEET) {
    band = `Over ${HOLELESS_STANDARD_PIT_FEET} ft, up to ${HOLELESS_DEEP_PIT_FEET} ft`;
    confident = false;
    if (wet) {
      value = "Holeless";
      reason = `Travel of ${travel.toFixed(1)} ft needs a deeper pit for holeless, and wet ground makes drilling a well hole the dearer of the two.`;
    } else if (siteUnknown) {
      value = "In-Ground";
      reason = `Travel of ${travel.toFixed(1)} ft works either way, and nobody has said whether the ground is wet, so V-2 prices the well hole to be safe.`;
    } else {
      value = "In-Ground";
      reason = `Travel of ${travel.toFixed(1)} ft works either way; on dry ground in-ground is the usual choice, but it turns on the owner and the quotes.`;
    }
  } else if (travel <= IN_GROUND_MAX_FEET) {
    value = "In-Ground";
    band = `Over ${HOLELESS_DEEP_PIT_FEET} ft, up to ${IN_GROUND_MAX_FEET} ft`;
    confident = !wet && !siteUnknown;
    reason = confident
      ? `Travel of ${travel.toFixed(1)} ft is past every holeless jack in the manufacturers' guides, so the job needs a well hole about ${Math.round(travel + 6)} ft deep.`
      : `Travel of ${travel.toFixed(1)} ft needs a well hole about ${Math.round(travel + 6)} ft deep, but ${wet ? "wet ground" : "unknown ground"} makes roped hydraulic or traction worth pricing too.`;
  } else {
    value = "Roped";
    band = `Over ${IN_GROUND_MAX_FEET} ft`;
    confident = false;
    reason = `Travel of ${travel.toFixed(1)} ft is past an in-ground jack's 60 ft; only roped hydraulic reaches (70 ft, 3,000 lb cap). V-1 should probably be traction.`;
  }

  if (rock) {
    confident = false;
    reason = `${reason} This ZIP can hit shallow rock, and the intake does not ask about rock, so confidence is low.`;
  }
  steps.push({ label: "Band", result: `${band} -> ${value}` });

  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: V2_CODE,
    label: V2_LABEL,
    value: { kind: "spec", text: value },
    // Source: docs/precon/research/la-hydraulic-jack-type.md.
    method: "Travel against each jack's reach in the manufacturers' planning guides.",
    inputs,
    steps,
    confidence: confident ? "high" : "low",
    confidenceReason: reason,
    costCodes: V2_COST_CODES,
    correction: null,
  };
  validateDerivedAssumption(assumption);
  return assumption;
}

function gate(answers: Answers, section: string): "yes" | "no" | "dont_know" | null {
  const raw = answers.branchGates?.[section] ?? answers.facts?.[section];
  return raw === "yes" || raw === "no" || raw === "dont_know" ? raw : null;
}

/**
 * Derives V-2, saves it, and returns `answers` with `facts.hydraulicJackType`
 * set to the effective value (the estimator's answer when there is one), so
 * the well hole's relationship reads the same jack the card shows. When the
 * job has no hydraulic elevator, V-2 does not apply: any stored V-2 is
 * removed so the card and the well hole both go.
 */
export async function applyJackCriterion(
  db: Db,
  projectId: string,
  answers: Answers,
  framingSystem: FramingSystem | null,
): Promise<Answers> {
  const hydraulic = gate(answers, "elevator") === "yes" && answers.facts?.elevatorType === "hydraulic";
  if (!hydraulic) {
    await deleteDerivedAssumption(db, projectId, V2_CODE);
    return answers;
  }

  const rawStories = answers.facts?.storiesAboveGrade;
  const rawZip = answers.facts?.zip;
  const assumption = deriveJackType({
    storiesAboveGrade: typeof rawStories === "number" ? rawStories : null,
    framingSystem,
    hasTallerGroundFloor: gate(answers, "retail_storefronts") === "yes",
    belowGrade: gate(answers, "levels_below_grade"),
    siteConditions: gate(answers, "site_conditions"),
    zip: typeof rawZip === "string" ? rawZip : null,
  });
  if (!assumption) return answers;

  const stored = await saveDerivedAssumption(db, projectId, assumption, { model: "engine-rule" });
  const value = effectiveValue(stored);
  const fact = value.kind === "spec" ? jackFact(value.text) : null;
  return fact ? { ...answers, facts: { ...answers.facts, hydraulicJackType: fact } } : answers;
}
