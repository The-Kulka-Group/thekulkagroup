import {
  type Answers,
  type DerivedAssumption,
  type DerivedInput,
  type DerivedStep,
  type FramingSystem,
  validateDerivedAssumption,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { S1_GROUND_STEP, S1_NO_REPORT, S1_ROCK_ON_GRADE } from "./criterion-wording";
import { deleteDerivedAssumption, saveDerivedAssumption } from "./derived-assumptions";
import { rockPossible } from "./jack-criterion";

// LA-1300. S-1, Foundation System: what most likely carries the building,
// and the lowest floor slab that follows from it. The rule is the research's
// (docs/precon/research/la-foundation-system.md, section 5):
//
// - Average bearing pressure from the levels the footings carry: 82.5 psf a
//   wood floor, 120.5 psf a light-gauge floor, 55 psf the roof, 259 psf a
//   concrete deck (WoodWorks 2025; STRUCTURE). Coverage is that pressure over
//   2,000 psf, IBC Class 4's presumptive value for sand and most till.
// - Poor soil or groundwater: ground improvement under a light building on
//   grade, a mat under a light building with a basement, deep foundations
//   under a concrete deck or past 30 percent coverage.
// - Good ground: spread footings up to 50 percent coverage, a mat past it
//   (NAVFAC DM-7.02, FHWA GEC 6).
//
// The research proposed a second card for the lowest floor slab (S-2). The
// slab follows from the system with nothing to decide, so it is a line on
// this card. There is never a geotechnical report at this stage, so the card
// reads low unless the building is light, on grade and on stated good
// ground. It prices nothing yet. Code does the arithmetic; nothing here
// calls Jev.

export const S1_CODE = "S-1";
export const S1_LABEL = "Foundation System";
/** Items 2 (footings, foundation walls, slab), 34 (excavation) and 34a (deep foundations). */
export const S1_COST_CODES = ["2", "34", "34a"];

export const FOUNDATION_SYSTEMS = ["Spread Footings", "Mat Foundation", "Deep Foundations", "Ground Improvement"] as const;
export type FoundationSystem = (typeof FOUNDATION_SYSTEMS)[number] | "Existing Foundations";

export const LOADS_PSF = { woodFloor: 82.5, lightGaugeFloor: 120.5, roof: 55, concreteDeck: 259 } as const;
export const ALLOWABLE_BEARING_PSF = 2000;
/** "Light": no concrete deck and footings under 30 percent of the footprint. A mat pays past 50. */
export const LIGHT_COVERAGE = 0.3;
export const MAT_COVERAGE = 0.5;

/** Long Island's ZIP prefixes (Nassau shares 110 with Queens), where a basement may meet shallow water. */
const LONG_ISLAND_ZIP3 = new Set(["110", "115", "117", "118", "119"]);

/** The lowest floor slab each system implies. */
export function slabFor(system: FoundationSystem, belowGrade: boolean): string {
  if (system === "Mat Foundation") return "Mat Slab";
  if (system === "Deep Foundations") return "Structural Slab";
  if (system === "Existing Foundations") return "Not Applicable";
  return belowGrade && system === "Spread Footings" ? "Slab on Grade, Dampproofed" : "Slab on Grade";
}

type Gate = "yes" | "no" | "dont_know" | null;

export type FoundationFacts = {
  constructionKind: "new" | "renovation";
  storiesAboveGrade: number;
  framingSystem: FramingSystem | null;
  parkingType: string | null;
  levelsBelowGrade: Gate;
  siteConditions: Gate;
  tieIn: Gate;
  zip: string | null;
};

export type FoundationResult = {
  system: FoundationSystem;
  slab: string;
  belowGrade: boolean;
  elevatedFloors: number;
  concreteDecks: number;
  pressurePsf: number;
  coverage: number;
  light: boolean;
  flags: string[];
};

export function computeFoundation(facts: FoundationFacts): FoundationResult {
  const stories = facts.storiesAboveGrade;
  const underground = facts.parkingType === "underground";
  const belowGrade = facts.levelsBelowGrade === "yes" || underground;
  const elevatedFloors = stories - 1 + (belowGrade ? 1 : 0);
  const concreteDecks = facts.parkingType === "structured" ? (stories >= 7 ? 2 : 1) : underground ? 1 : 0;
  const floorLoad = facts.framingSystem === "metal" ? LOADS_PSF.lightGaugeFloor : LOADS_PSF.woodFloor;
  const pressurePsf =
    LOADS_PSF.roof + (elevatedFloors - concreteDecks) * floorLoad + concreteDecks * LOADS_PSF.concreteDeck;
  const coverage = pressurePsf / ALLOWABLE_BEARING_PSF;
  const light = concreteDecks === 0 && coverage <= LIGHT_COVERAGE;

  let system: FoundationSystem;
  if (facts.constructionKind === "renovation" && facts.tieIn === "no") system = "Existing Foundations";
  else if (facts.siteConditions === "yes") system = !light ? "Deep Foundations" : belowGrade ? "Mat Foundation" : "Ground Improvement";
  else system = coverage <= MAT_COVERAGE ? "Spread Footings" : "Mat Foundation";

  const flags: string[] = [];
  const zip = facts.zip ?? "";
  if (rockPossible(facts.zip)) {
    flags.push(belowGrade ? "Rock excavation is likely for the basement in this area." : S1_ROCK_ON_GRADE);
  }
  if (LONG_ISLAND_ZIP3.has(zip.slice(0, 3)) && belowGrade && facts.siteConditions !== "no") {
    flags.push("A Long Island basement may meet shallow groundwater.");
  }
  if (facts.tieIn === "yes") {
    flags.push(belowGrade ? "Underpinning the existing building is likely." : "Underpinning the existing building is possible.");
  }
  if (underground && facts.levelsBelowGrade === "no") {
    flags.push("Parking is underground but Levels Below Grade says no, so the building is treated as below grade.");
  }

  return { system, slab: slabFor(system, belowGrade), belowGrade, elevatedFloors, concreteDecks, pressurePsf, coverage, light, flags };
}

const GATE_WORDS = { yes: "Yes", no: "No", dont_know: "Don't Know" } as const;
const PARKING_WORDS: Record<string, string> = {
  none: "None",
  surface: "Surface",
  structured: "Structured",
  underground: "Underground",
  dont_know: "Don't Know",
};
const pct = (n: number) => `${Math.round(n * 100)}%`;
const gateInput = (name: string, value: Gate): DerivedInput => ({
  name,
  value: value ? GATE_WORDS[value] : "Not answered",
  basis: value === "yes" || value === "no" ? "stated" : "assumed",
});

export function deriveFoundation(facts: FoundationFacts): DerivedAssumption {
  const result = computeFoundation(facts);
  const existing = result.system === "Existing Foundations";

  const inputs: DerivedInput[] = [
    { name: "Stories Above Grade", value: String(facts.storiesAboveGrade), basis: "stated" },
    {
      name: "Framing System",
      value: facts.framingSystem === "metal" ? "Metal" : facts.framingSystem === "wood" ? "Wood" : "Not set, wood assumed",
      basis: facts.framingSystem ? "stated" : "assumed",
    },
    {
      name: "Parking",
      value: facts.parkingType ? (PARKING_WORDS[facts.parkingType] ?? facts.parkingType) : "Not answered",
      basis: facts.parkingType && facts.parkingType !== "dont_know" ? "stated" : "assumed",
    },
    gateInput("Levels Below Grade", facts.levelsBelowGrade),
    gateInput("Groundwater or Poor Soil", facts.siteConditions),
    gateInput("Existing Building Tie-In", facts.tieIn),
    { name: "Allowable Bearing", value: "2,000 psf, IBC Class 4 (no geotechnical report)", basis: "assumed" },
  ];

  const deckWords =
    result.concreteDecks === 0 ? "None" : `${result.concreteDecks} concrete deck${result.concreteDecks === 1 ? "" : "s"}`;
  const steps: DerivedStep[] = existing
    ? [
        { label: "Construction", result: "Renovation, no tie-in" },
        { label: "Lowest Floor Slab", result: result.slab },
        { label: "Foundation System", result: result.system },
      ]
    : [
        { label: "Floors Carried", result: `${result.elevatedFloors} and the roof` },
        { label: "Concrete Decks", result: deckWords },
        { label: "Bearing Pressure", result: `${Math.round(result.pressurePsf)} psf` },
        { label: "Coverage", result: `${pct(result.coverage)} of the footprint at 2,000 psf` },
        {
          label: "Ground",
          result:
            facts.siteConditions === "yes"
              ? "Poor soil or groundwater"
              : facts.siteConditions === "no"
                ? "No known poor soil"
                : S1_GROUND_STEP,
        },
        { label: "Lowest Floor Slab", result: result.slab },
        { label: "Foundation System", result: result.system },
      ];

  const high =
    facts.constructionKind === "new" &&
    facts.siteConditions === "no" &&
    facts.levelsBelowGrade === "no" &&
    facts.parkingType !== "underground" &&
    facts.tieIn === "no" &&
    (facts.parkingType === "none" || facts.parkingType === "surface") &&
    result.coverage <= LIGHT_COVERAGE;

  const groundUnknown = facts.siteConditions !== "yes" && facts.siteConditions !== "no";
  const reasons = existing
    ? ["A renovation with no tie-in keeps its foundations; new loads such as a floor or rooftop equipment would need a check."]
    : high
      ? [
          `Light building on grade with no basement, and no poor soil or groundwater; footings need about ${pct(result.coverage)} of the footprint at the code's presumptive sand value.`,
        ]
      : [
          groundUnknown ? S1_NO_REPORT : "There is no geotechnical report yet.",
          facts.siteConditions === "yes" ? "Poor soil or groundwater is reported, and the answer does not say which." : "",
          result.belowGrade ? "The building goes below grade." : "",
          result.concreteDecks > 0 ? "A concrete podium or deck carries the load." : "",
          result.coverage > LIGHT_COVERAGE && result.system === "Spread Footings"
            ? `Footings cover ${pct(result.coverage)} of the footprint${result.coverage > 0.4 ? ", near the 50% line where a mat pays" : ""}.`
            : "",
          facts.constructionKind === "renovation" ? "The work ties into an existing building, so it is treated as an addition." : "",
        ];
  const flags = groundUnknown && !existing ? result.flags.filter((f) => f !== S1_ROCK_ON_GRADE) : result.flags;
  const reason = [...reasons, ...flags].filter(Boolean).join(" ");

  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: S1_CODE,
    label: S1_LABEL,
    value: { kind: "spec", text: result.system },
    // Source: docs/precon/research/la-foundation-system.md.
    method: "Bearing pressure over IBC Class 4's presumptive value, then ground and basement.",
    inputs,
    steps,
    confidence: high && !existing ? "high" : "low",
    confidenceReason: reason,
    costCodes: S1_COST_CODES,
    correction: null,
  };
  validateDerivedAssumption(assumption);
  return assumption;
}

function gate(answers: Answers, section: string): Gate {
  const raw = answers.branchGates?.[section] ?? answers.facts?.[section];
  return raw === "yes" || raw === "no" || raw === "dont_know" ? raw : null;
}

/** Derives S-1 and saves it. It sets no fact yet. No stories, no card: nothing invents a story count. */
export async function applyFoundationCriterion(
  db: Db,
  projectId: string,
  answers: Answers,
  framingSystem: FramingSystem | null,
): Promise<Answers> {
  const stories = answers.facts?.storiesAboveGrade;
  const parking = answers.facts?.parkingType;
  const zip = answers.facts?.zip;
  if (answers.projectType !== "multifamily" || typeof stories !== "number" || stories <= 0) {
    await deleteDerivedAssumption(db, projectId, S1_CODE);
    return answers;
  }
  const assumption = deriveFoundation({
    constructionKind: answers.constructionKind,
    storiesAboveGrade: stories,
    framingSystem,
    parkingType: typeof parking === "string" ? parking : null,
    levelsBelowGrade: gate(answers, "levels_below_grade"),
    siteConditions: gate(answers, "site_conditions"),
    tieIn: gate(answers, "existing_building_tie_in"),
    zip: typeof zip === "string" ? zip : null,
  });
  await saveDerivedAssumption(db, projectId, assumption, { model: "engine-rule" });
  return answers;
}
