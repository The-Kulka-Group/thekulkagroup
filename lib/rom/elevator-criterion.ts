import {
  type Answers,
  type DerivedAssumption,
  type DerivedInput,
  type DerivedStep,
  type FramingSystem,
  effectiveValue,
  elevatorBand,
  ELEVATOR_COST_CODE,
  elevatorTravelFeet,
  floorToFloorFor,
  FLOOR_TO_FLOOR_SOURCE,
  HYDRAULIC_MAX_FEET,
  RETAIL_GROUND_FLOOR_FEET,
  TRACTION_MIN_FEET,
  validateDerivedAssumption,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { v1EitherBand } from "./criterion-wording";
import { saveDerivedAssumption } from "./derived-assumptions";
import { createJevClient, deriveAssumption, type DerivationCandidate, type JevClient } from "./jev";

/**
 * The real Jev client when `TYPESAFE_API_KEY` is set in the environment, or
 * null when it is not. Only the either band ever touches this, and only to
 * decide whether to call Jev at all -- "if no Jev client is configured in the
 * environment, V-1 inside the band proposes Hydraulic at low confidence
 * without calling Jev and says so" (the ticket).
 */
export function defaultJevClient(): JevClient | null {
  return process.env.TYPESAFE_API_KEY ? createJevClient() : null;
}

// LA-1205, building V-1 on the LA-860 mechanism (jev.ts) and LA-784's design
// (docs/precon/criteria/la-784-elevator-type.md, decisions of 2026-09-27).
//
// Code does every bit of the arithmetic and decides the band. Jev is asked
// only inside the "either" band (over 35 ft, up to and including 55 ft of
// travel), and only when a client is configured -- the wrapper is injected,
// so a test never reaches the network (LA-860). Outside the band, or with no
// client configured, this file builds the DerivedAssumption directly and
// never calls Jev at all.

export const V1_CODE = "V-1";
export const V1_LABEL = "Elevator Type";
/** V-1 feeds item 26, Elevators (LA-1205). */
export const V1_COST_CODES = [ELEVATOR_COST_CODE];

/** The facts V-1 reads. No new intake question: every one of these already exists on the project. */
export type ElevatorCriterionFacts = {
  storiesAboveGrade: number | null;
  framingSystem: FramingSystem | null;
  /** True when the retail_storefronts gate answered yes (a taller, retail or amenity ground floor). */
  hasTallerGroundFloor: boolean;
};

function feet(value: number): string {
  const whole = Math.floor(value);
  const inches = Math.round((value - whole) * 12);
  return inches === 0 ? `${whole}'-0"` : `${whole}'-${inches}"`;
}

function direct(
  value: "Hydraulic" | "Traction",
  confidence: "high" | "low",
  confidenceReason: string,
  inputs: DerivedInput[],
  steps: DerivedStep[],
): DerivedAssumption {
  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: V1_CODE,
    label: V1_LABEL,
    value: { kind: "spec", text: value },
    // Source: docs/precon/criteria/la-784-elevator-type.md.
    method: "Travel from Stories Above Grade against the hydraulic-to-traction band.",
    inputs,
    steps,
    confidence,
    confidenceReason,
    costCodes: V1_COST_CODES,
    correction: null,
  };
  validateDerivedAssumption(assumption);
  return assumption;
}

function candidatesFor(
  travelFeet: number,
  commonSteps: DerivedStep[],
): Record<"hydraulic" | "traction", DerivationCandidate> {
  // LA-1265: every step the code worked out, so the Design and Engineering
  // card shows the whole arithmetic whichever way Jev picks.
  const band = `Over ${HYDRAULIC_MAX_FEET} ft, up to ${TRACTION_MIN_FEET} ft`;
  return {
    hydraulic: {
      description: `Travel of ${travelFeet.toFixed(1)} ft, inside the either band (over 35 ft, up to 55 ft); hydraulic is the cheaper of the two types and the more common choice at this travel.`,
      value: { kind: "spec", text: "Hydraulic" },
      method: "Travel sits in the either band; picked Hydraulic from the facts given.",
      steps: [...commonSteps, { label: "Band", result: `${band} -> Hydraulic` }],
    },
    traction: {
      description: `Travel of ${travelFeet.toFixed(1)} ft, inside the either band (over 35 ft, up to 55 ft); traction is also common at this travel and fits a faster car speed or a below-grade or tall ground floor pushing travel toward the hydraulic ceiling.`,
      value: { kind: "spec", text: "Traction" },
      method: "Travel sits in the either band; picked Traction from the facts given.",
      steps: [...commonSteps, { label: "Band", result: `${band} -> Traction` }],
    },
  };
}

/**
 * Derives V-1 for one project. Returns null when Stories Above Grade is not
 * yet known: "a project with no Stories Above Grade shows the card as needing
 * that fact, with no default" (the ticket) -- there is nothing to derive, and
 * nothing here invents a story count to derive one anyway.
 *
 * `jevClient` is optional. Outside the either band it is never touched.
 * Inside the band, a configured client is asked to choose; with none
 * configured, V-1 proposes Hydraulic at low confidence and says so in the
 * confidence reason, without any call leaving the process.
 */
export async function deriveElevatorType(
  jevClient: JevClient | null,
  facts: ElevatorCriterionFacts,
): Promise<{ assumption: DerivedAssumption; jev: { model: string; choice: string; confidence: number } | null } | null> {
  if (facts.storiesAboveGrade === null) return null;

  const floorToFloor = floorToFloorFor(facts.framingSystem);
  const travel = elevatorTravelFeet(facts.storiesAboveGrade, floorToFloor.feet, facts.hasTallerGroundFloor);
  const band = elevatorBand(travel);

  const inputs: DerivedInput[] = [
    { name: "Stories Above Grade", value: String(facts.storiesAboveGrade), basis: "stated" },
    {
      name: "Framing System",
      value: `${floorToFloor.source.replace(/_/g, " ")}, ${feet(floorToFloor.feet)} floor-to-floor`,
      basis: floorToFloor.assumed ? "assumed" : "stated",
    },
  ];
  if (facts.hasTallerGroundFloor) {
    inputs.push({ name: "Ground Floor", value: `Retail or amenity, ${feet(RETAIL_GROUND_FLOOR_FEET)}`, basis: "stated" });
  }

  const steps: DerivedStep[] = [
    { label: "Stories Above Grade", result: String(facts.storiesAboveGrade) },
    { label: "Floor-to-floor", result: `${feet(floorToFloor.feet)}${floorToFloor.assumed ? " (assumed, wood)" : ""}` },
    { label: "Travel", result: `${feet(travel)} (${travel.toFixed(1)} ft)` },
  ];

  if (band === "hydraulic") {
    return {
      assumption: direct(
        "Hydraulic",
        "high",
        `Travel of ${travel.toFixed(1)} ft is 35 ft or less: Hydraulic, high confidence (${FLOOR_TO_FLOOR_SOURCE[floorToFloor.source]}).`,
        inputs,
        [...steps, { label: "Band", result: `35 ft or less -> Hydraulic` }],
      ),
      jev: null,
    };
  }
  if (band === "traction") {
    return {
      assumption: direct(
        "Traction",
        "high",
        `Travel of ${travel.toFixed(1)} ft is over ${TRACTION_MIN_FEET} ft: Traction, high confidence (${FLOOR_TO_FLOOR_SOURCE[floorToFloor.source]}).`,
        inputs,
        [...steps, { label: "Band", result: `Over ${TRACTION_MIN_FEET} ft -> Traction` }],
      ),
      jev: null,
    };
  }

  // The either band: over 35 ft, up to and including 55 ft of travel.
  const reasons = {
    high: "Stories Above Grade and travel sit clearly on one side of the hydraulic-to-traction band.",
    low: `Travel of ${travel.toFixed(1)} ft sits inside the either band (over ${HYDRAULIC_MAX_FEET} ft, up to ${TRACTION_MIN_FEET} ft), where hydraulic and traction are both common.`,
  };

  if (jevClient) {
    const result = await deriveAssumption(jevClient, {
      code: V1_CODE,
      label: V1_LABEL,
      costCodes: V1_COST_CODES,
      facts: inputs,
      question: "Which elevator type fits the travel these facts give?",
      candidates: candidatesFor(travel, steps),
      reasons,
    });
    return { assumption: result.assumption, jev: result.jev };
  }

  // No Jev client configured: V-1 proposes Hydraulic, the cheaper type, at
  // low confidence, and says plainly that Jev was never called (the ticket).
  return {
    assumption: direct(
      "Hydraulic",
      "low",
      v1EitherBand(travel, HYDRAULIC_MAX_FEET, TRACTION_MIN_FEET),
      inputs,
      [...steps, { label: "Band", result: "Either; nothing set up to choose, so Hydraulic" }],
    ),
    jev: null,
  };
}

/**
 * Derives V-1, saves it, and returns `answers` with `facts.elevatorType` set
 * to the effective value (the estimator's correction, when there is one,
 * otherwise Jev's or the code's own), so item 26's per-stop price
 * (packages/engine/src/elevator.ts) reads the same type the card shows.
 *
 * A no-op, returning `answers` unchanged, whenever the elevator gate is not
 * yes or `deriveElevatorType` has nothing to derive yet (no Stories Above
 * Grade). Called from `runRom` inside its `read_answers` step, so it adds no
 * sixth step to a run's record.
 */
export async function applyElevatorCriterion(
  db: Db,
  projectId: string,
  answers: Answers,
  framingSystem: FramingSystem | null,
): Promise<Answers> {
  const elevatorGate = answers.branchGates?.elevator ?? (answers.facts?.elevator as string | undefined);
  if (elevatorGate !== "yes") return answers;

  const rawStories = answers.facts?.storiesAboveGrade;
  const storiesAboveGrade = typeof rawStories === "number" ? rawStories : null;
  const retailGate = answers.branchGates?.retail_storefronts ?? (answers.facts?.retail_storefronts as string | undefined);

  const result = await deriveElevatorType(defaultJevClient(), {
    storiesAboveGrade,
    framingSystem,
    hasTallerGroundFloor: retailGate === "yes",
  });
  if (!result) return answers;

  const stored = await saveDerivedAssumption(db, projectId, result.assumption, {
    model: result.jev?.model ?? "engine-band",
    confidence: result.jev?.confidence ?? null,
  });
  const value = effectiveValue(stored);
  if (value.kind !== "spec") return answers;
  const elevatorType = value.text.toLowerCase().startsWith("hydraulic") ? "hydraulic" : "traction";
  return { ...answers, facts: { ...answers.facts, elevatorType } };
}
