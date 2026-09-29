import { type Answers, type DerivedAssumption, type DerivedStep, validateDerivedAssumption } from "@kulka/engine";

import type { Db } from "@/lib/db";

import { BAY_WIDTH, buildingForm, FOLD_AT, WING_DEPTH } from "./building-form";
import { deleteDerivedAssumption, saveDerivedAssumption } from "./derived-assumptions";

// LA-1325. A-2, Building Form: the plan shape the budget assumes for a new
// multifamily building, from its area, stories and building count. The rule
// lives in ./building-form.ts so the stage can draw a corrected shape in the
// browser. The card always reads low: with no site plan, the shape follows
// from the floor plate alone. It prices nothing yet, but the shape sets how
// much outside wall the building has, so it names item 8.

export const A2_CODE = "A-2";
export const A2_LABEL = "Building Form";
/** Item 8, exterior walls: an L or a U has more wall per square foot than a bar. */
export const A2_COST_CODES = ["8"];

export type BuildingFormFacts = {
  grossSquareFeet: number;
  storiesAboveGrade: number;
  buildingCount: number | null;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function shapeWhy(shape: string, corridor: number, block: boolean): string {
  if (block) return `${shape}, too short for a corridor`;
  if (corridor > FOLD_AT.Courtyard) return `${shape}, past ${FOLD_AT.Courtyard} ft`;
  if (corridor > FOLD_AT["U-Shape"]) return `${shape}, past ${FOLD_AT["U-Shape"]} ft`;
  if (corridor > FOLD_AT["L-Shape"]) return `${shape}, past ${FOLD_AT["L-Shape"]} ft`;
  return `${shape}, ${FOLD_AT["L-Shape"]} ft or less`;
}

export function deriveBuildingForm(facts: BuildingFormFacts): DerivedAssumption {
  const stories = facts.storiesAboveGrade;
  const counted = facts.buildingCount && facts.buildingCount > 0 ? facts.buildingCount : null;
  const form = buildingForm({ grossSquareFeet: facts.grossSquareFeet, stories, buildingCount: counted });
  if (!form) throw new Error("A-2 needs stories and gross square feet.");
  const block = form.corridorFeet < WING_DEPTH * 1.5;

  const wingFeet = form.wings.map((w) => Math.max(w.x1 - w.x0, w.z1 - w.z0));
  const steps: DerivedStep[] = [
    { label: "Floor Plate", result: `${fmt(form.plateSquareFeet)} SF per building` },
    { label: "Corridor Length", result: block ? `${fmt(form.corridorFeet)} ft, no corridor` : `${fmt(form.corridorFeet)} ft at ${WING_DEPTH} ft deep` },
    { label: "Shape", result: shapeWhy(form.shape, form.corridorFeet, block) },
    {
      label: "Wings",
      result: form.wings.length === 1 ? `1, ${fmt(wingFeet[0])} ft` : `${form.wings.length}: ${wingFeet.map((f) => `${fmt(f)} ft`).join(", ")}`,
    },
    {
      label: "Stepped Floors",
      result: form.stepStories > 0 ? `Front wing ${stories - form.stepStories} stories, the rest ${stories}` : "None",
    },
    { label: "Facade Bays", result: `${form.bays} at ${BAY_WIDTH} ft` },
  ];

  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: A2_CODE,
    label: A2_LABEL,
    value: { kind: "spec", text: form.shape },
    // Source: docs/precon/criteria/la-1325-building-form.md.
    method: `Double-loaded corridor wings ${WING_DEPTH} ft deep; past ${FOLD_AT["L-Shape"]} ft of corridor the plate folds into an L, past ${FOLD_AT["U-Shape"]} ft a U, past ${FOLD_AT.Courtyard} ft a courtyard.`,
    inputs: [
      { name: "Gross Square Feet", value: fmt(facts.grossSquareFeet), basis: "stated" },
      { name: "Stories Above Grade", value: String(stories), basis: "stated" },
      counted
        ? { name: "Building Count", value: String(counted), basis: "stated" }
        : { name: "Building Count", value: "Not answered, one assumed", basis: "assumed" },
    ],
    steps,
    confidence: "low",
    confidenceReason: "There is no site plan yet, so the shape follows from the floor plate's length alone.",
    costCodes: A2_COST_CODES,
    correction: null,
  };
  validateDerivedAssumption(assumption);
  return assumption;
}

/**
 * Derives A-2 and saves it. It sets no fact. A project that is not new
 * multifamily, or has no stories or area yet, gets no card; any stored A-2 goes.
 */
export async function applyBuildingFormCriterion(db: Db, projectId: string, answers: Answers): Promise<Answers> {
  const stories = answers.facts?.storiesAboveGrade;
  const buildings = answers.facts?.buildingCount;
  if (
    answers.projectType !== "multifamily" ||
    answers.constructionKind !== "new" ||
    typeof stories !== "number" ||
    stories <= 0 ||
    !(answers.grossSquareFeet > 0)
  ) {
    await deleteDerivedAssumption(db, projectId, A2_CODE);
    return answers;
  }
  const assumption = deriveBuildingForm({
    grossSquareFeet: answers.grossSquareFeet,
    storiesAboveGrade: stories,
    buildingCount: typeof buildings === "number" ? buildings : null,
  });
  await saveDerivedAssumption(db, projectId, assumption, { model: "engine-rule" });
  return answers;
}
