import {
  type Answers,
  type DerivedAssumption,
  type DerivedInput,
  type DerivedStep,
  type FramingSystem,
  validateDerivedAssumption,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { deleteDerivedAssumption, saveDerivedAssumption } from "./derived-assumptions";
import { inNewYorkCity } from "./machine-room-criterion";

// LA-1298. A-1, Construction Type: the IBC construction type a new
// multifamily building most likely carries, whether it sits on a concrete
// podium, and whether its sprinklers can be NFPA 13R. The rule is the
// research's (docs/precon/research/la-construction-type.md, section 6),
// checked against the R-2 rows of IBC 2021 Tables 504.3, 504.4 and 506.2,
// which match the 2025 Building Code of New York State:
//
// - Podium stories come from structured parking, or ground-floor retail at
//   four or more stories. Framed stories are the rest.
// - Wood: Type V up to four framed stories, Type III at five, Type IIIA over a
//   Type IA podium at six or seven, Type I past that.
// - Light-gauge steel: Type IIB, or IIA past 75 ft or IIB's area; up to two
//   podium levels, then Type IB.
// - New York City bars Type V and IIB for R-2, so wood is IIIA and steel IIA.
// - NFPA 13R only at three stories or fewer counted from grade (2025 BCNYS),
//   with the area inside 13R's limit.
//
// The research's "medium" confidence has no tone of its own here: the card
// reads low and names the assumption. It is a planning assumption, not a code
// analysis of a design, and it prices nothing yet. Code does the arithmetic;
// nothing here calls Jev.

export const A1_CODE = "A-1";
export const A1_LABEL = "Construction Type";
/** Items 3 (podium deck), 8 (exterior walls), 17 (rated drywall) and 27 (sprinklers): what the type moves. */
export const A1_COST_CODES = ["3", "8", "17", "27"];

type Subtype = "IA" | "IB" | "IIA" | "IIB" | "IIIA" | "IIIB" | "VA" | "VB";

/** R-2 limits: stories and height with NFPA 13, and area per story with NFPA 13 (SM) and 13R (NS). */
export const R2_LIMITS: Record<Subtype, { stories: number; heightFeet: number; areaNfpa13: number; area13r: number }> = {
  IA: { stories: Infinity, heightFeet: Infinity, areaNfpa13: Infinity, area13r: Infinity },
  IB: { stories: 12, heightFeet: 180, areaNfpa13: Infinity, area13r: Infinity },
  IIA: { stories: 5, heightFeet: 85, areaNfpa13: 72000, area13r: 24000 },
  IIB: { stories: 5, heightFeet: 75, areaNfpa13: 48000, area13r: 16000 },
  IIIA: { stories: 5, heightFeet: 85, areaNfpa13: 72000, area13r: 24000 },
  IIIB: { stories: 5, heightFeet: 75, areaNfpa13: 48000, area13r: 16000 },
  VA: { stories: 4, heightFeet: 70, areaNfpa13: 36000, area13r: 12000 },
  VB: { stories: 3, heightFeet: 60, areaNfpa13: 21000, area13r: 7000 },
};

/** The research's floor heights (LA-784 Decision 4): framed 10 ft, podium 12 ft, a retail story 15 ft. */
const FRAMED_STORY_FEET = 10;
const PODIUM_STORY_FEET = 12;
const RETAIL_STORY_FEET = 15;
/** Section 506.3: the largest frontage increase adds 75 percent of the NS area. */
const MAX_FRONTAGE_SHARE = 0.75;

export type ConstructionTypeFacts = {
  storiesAboveGrade: number;
  framingSystem: FramingSystem | null;
  parkingType: string | null;
  retailStorefronts: "yes" | "no" | "dont_know" | null;
  grossSquareFeet: number;
  buildingCount: number | null;
  zip: string | null;
};

export type ConstructionTypeResult = {
  text: string;
  subtype: Subtype;
  podiumStories: number;
  framedStories: number;
  retailStory: boolean;
  podiumBelowGrade: boolean;
  heightFeet: number;
  heightLimitFeet: number;
  areaPerStory: number;
  areaLimit: number;
  area: "pass" | "close" | "frontage" | "fire_walls" | "unlimited";
  sprinkler: "NFPA 13" | "NFPA 13R" | "NFPA 13, 13R Possible";
  alsoAllowed: string[];
  /** Retail under four or five wood stories, where a plain wood building is legal too. */
  plainWoodAllowed: boolean;
  woodTooTall: boolean;
  nyc: boolean;
};

const typeText = (subtype: Subtype, podium: number) =>
  subtype === "IA" || subtype === "IB" || podium === 0 ? `Type ${subtype}` : `Type ${subtype} over Type IA Podium`;

export function computeConstructionType(facts: ConstructionTypeFacts): ConstructionTypeResult {
  const stories = facts.storiesAboveGrade;
  const nyc = inNewYorkCity(facts.zip);
  const wood = facts.framingSystem !== "metal";
  const buildings = facts.buildingCount && facts.buildingCount > 0 ? facts.buildingCount : 1;

  // Steps 2 and 3: podium and framed stories.
  let podium = 0;
  const retailStory = facts.retailStorefronts === "yes" && stories >= 4;
  if (facts.parkingType === "structured" || retailStory) podium = 1;
  const podiumBelowGrade = facts.parkingType === "underground";

  // Steps 4, 5 and 9: the type family.
  let subtype: Subtype;
  let woodTooTall = false;
  if (wood) {
    if (stories >= 8) {
      subtype = "IA";
      woodTooTall = true;
      podium = stories;
    } else {
      if (stories - podium > 5) podium = stories - 5;
      const framed = stories - podium;
      subtype = nyc ? "IIIA" : framed <= 4 ? "VA" : "IIIA";
    }
  } else {
    if (stories - podium > 5) podium = stories - 5;
    if (podium > 2) {
      subtype = "IB";
      podium = stories;
    } else {
      subtype = nyc ? "IIA" : "IIB";
    }
  }
  const framed = stories - podium;

  // Step 7: height, 12 ft a podium story (15 ft for retail), 10 ft a framed one.
  const podiumFeet = podium > 0 ? (retailStory ? RETAIL_STORY_FEET : PODIUM_STORY_FEET) + (podium - 1) * PODIUM_STORY_FEET : 0;
  const heightFeet = subtype === "IA" || subtype === "IB" ? stories * PODIUM_STORY_FEET : podiumFeet + framed * FRAMED_STORY_FEET;

  // Step 10: the sprinkler standard, then step 8: the area check against it.
  const areaPerStory = facts.grossSquareFeet / buildings / stories;
  const fits13r = (type: Subtype) => areaPerStory <= R2_LIMITS[type].area13r;
  if (subtype === "IIB" && (heightFeet > R2_LIMITS.IIB.heightFeet || areaPerStory > R2_LIMITS.IIB.areaNfpa13)) subtype = "IIA";
  const sprinkler: ConstructionTypeResult["sprinkler"] =
    stories <= 3 && fits13r(subtype) ? "NFPA 13R" : stories === 4 && fits13r(subtype) ? "NFPA 13, 13R Possible" : "NFPA 13";
  const areaLimit = sprinkler === "NFPA 13R" ? R2_LIMITS[subtype].area13r : R2_LIMITS[subtype].areaNfpa13;
  let area: ConstructionTypeResult["area"] = "unlimited";
  if (Number.isFinite(areaLimit)) {
    const totalOk = sprinkler === "NFPA 13R" || framed <= 3 || areaPerStory * framed <= areaLimit * 3;
    const withFrontage = areaLimit + R2_LIMITS[subtype].area13r * MAX_FRONTAGE_SHARE;
    if (areaPerStory <= areaLimit * 0.9 && totalOk) area = "pass";
    else if (areaPerStory <= areaLimit && totalOk) area = "close";
    else if (areaPerStory <= withFrontage) area = "frontage";
    else area = "fire_walls";
  }

  // The other types the code allows, for the card's choices.
  const alsoAllowed: string[] = [];
  if (subtype === "VA" && podium === 0 && framed <= 3) {
    const vbLimit = sprinkler === "NFPA 13R" ? R2_LIMITS.VB.area13r : R2_LIMITS.VB.areaNfpa13;
    if (areaPerStory <= vbLimit) alsoAllowed.push("Type VB");
  }
  if (subtype === "IIIA" && !nyc && heightFeet <= R2_LIMITS.IIIB.heightFeet && areaPerStory <= R2_LIMITS.IIIB.areaNfpa13) {
    alsoAllowed.push(typeText("IIIB", podium));
  }
  if (subtype === "IIB") alsoAllowed.push(typeText("IIA", podium));
  // Retail under four or five wood stories: a plain wood building is legal too.
  const plainWoodAllowed = wood && !nyc && retailStory && facts.parkingType !== "structured" && podium === 1 && stories <= 5;
  if (plainWoodAllowed) alsoAllowed.push(stories === 5 ? "Type IIIA" : "Type VA");

  return {
    text: woodTooTall ? "Type IA or IB" : typeText(subtype, podium),
    subtype,
    podiumStories: podium,
    framedStories: framed,
    retailStory,
    podiumBelowGrade,
    heightFeet,
    heightLimitFeet: R2_LIMITS[subtype].heightFeet,
    areaPerStory,
    areaLimit,
    area,
    sprinkler,
    alsoAllowed,
    plainWoodAllowed,
    woodTooTall,
    nyc,
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const PARKING_WORDS: Record<string, string> = {
  none: "None",
  surface: "Surface",
  structured: "Structured",
  underground: "Underground",
  dont_know: "Don't Know",
};

export function deriveConstructionType(facts: ConstructionTypeFacts): DerivedAssumption {
  const result = computeConstructionType(facts);
  const typeOne = result.subtype === "IA" || result.subtype === "IB";
  const frame = facts.framingSystem === "metal" ? "light-gauge steel" : facts.framingSystem === "wood" ? "wood" : "wood, assumed";

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
    {
      name: "Retail Storefronts",
      value: facts.retailStorefronts === "yes" ? "Yes" : facts.retailStorefronts === "no" ? "No" : "Not known, no assumed",
      basis: facts.retailStorefronts === "yes" || facts.retailStorefronts === "no" ? "stated" : "assumed",
    },
    { name: "Gross Square Feet", value: fmt(facts.grossSquareFeet), basis: "stated" },
    {
      name: "Building Count",
      value: facts.buildingCount && facts.buildingCount > 0 ? String(facts.buildingCount) : "Not answered, one assumed",
      basis: facts.buildingCount && facts.buildingCount > 0 ? "stated" : "assumed",
    },
  ];
  if (result.podiumStories > 0 && !typeOne) {
    inputs.push({ name: "Podium", value: "One story per podium level, assumed from the intake", basis: "assumed" });
  }

  const podiumWhy = result.retailStory ? ", retail at grade" : facts.parkingType === "structured" ? ", parking at grade" : "";
  const steps: DerivedStep[] = [
    { label: "Stories", result: String(facts.storiesAboveGrade) },
    {
      label: "Podium Stories",
      result: typeOne
        ? `${facts.storiesAboveGrade}, concrete throughout`
        : result.podiumStories > 0
          ? `${result.podiumStories}${podiumWhy}`
          : result.podiumBelowGrade
            ? "0, garage below grade"
            : "0",
    },
    { label: "Framed Stories", result: typeOne ? "0" : `${result.framedStories}, ${frame}` },
    {
      label: "Height",
      result: typeOne ? `${result.heightFeet} ft` : `${result.heightFeet} ft against ${result.heightLimitFeet} ft`,
    },
    {
      label: "Area per Story",
      result: Number.isFinite(result.areaLimit)
        ? `${fmt(result.areaPerStory)} SF against ${fmt(result.areaLimit)} SF`
        : `${fmt(result.areaPerStory)} SF, no limit`,
    },
    { label: "Sprinkler", result: result.sprinkler },
    { label: "Also Allowed", result: result.alsoAllowed.length > 0 ? result.alsoAllowed.join("; ") : "None" },
    { label: "Construction Type", result: result.text },
  ];

  const nearHeight = Number.isFinite(result.heightLimitFeet) && result.heightLimitFeet - result.heightFeet <= 5;
  const reasons = [
    result.nyc ? "The New York City Building Code bars Type V and IIB for R-2, so the NYC types are used and read low." : "",
    result.woodTooTall ? "Wood framing does not fit eight or more stories, so the building is concrete or steel throughout." : "",
    !facts.framingSystem ? "Framing System is not set, so wood is assumed." : "",
    facts.framingSystem === "metal"
      ? "A steel bearing-wall building with wood floors or roof can be Type III or V instead."
      : "",
    facts.parkingType === "dont_know" ? "Parking is not known, so no podium is assumed." : "",
    result.podiumStories > 0 && !typeOne
      ? result.podiumStories > 1
        ? "The building needs two or more podium levels to keep five framed stories."
        : "The podium level is assumed from the parking or retail answer."
      : "",
    result.plainWoodAllowed ? "A plain wood building over ground-floor retail is legal too." : "",
    facts.retailStorefronts === "dont_know" ? "Retail storefronts is not known, so none is assumed." : "",
    nearHeight ? "The height sits within 5 ft of the type's limit." : "",
    result.area === "close" ? "The area per story sits near the type's limit." : "",
    result.area === "frontage" ? "The area per story needs a frontage increase to fit the type." : "",
    result.area === "fire_walls" ? "The area per story passes even a frontage increase, so fire walls are likely; the type stands." : "",
  ].filter(Boolean);

  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: A1_CODE,
    label: A1_LABEL,
    value: { kind: "spec", text: result.text },
    method: "IBC 2021 and 2025 BCNYS R-2 limits by stories, framing and podium (docs/precon/research/la-construction-type.md).",
    inputs,
    steps,
    confidence: reasons.length === 0 ? "high" : "low",
    confidenceReason:
      reasons.length === 0
        ? `Wood framing with no podium, clear of the type's height and area limits.${result.sprinkler === "NFPA 13, 13R Possible" ? " At four stories 13R may still work, so NFPA 13 is carried." : ""}`
        : reasons.join(" "),
    costCodes: A1_COST_CODES,
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
 * Derives A-1 and saves it. It sets no fact yet. A renovation keeps its
 * existing type and a project that is not multifamily or has no stories gets
 * no card; any stored A-1 goes.
 */
export async function applyConstructionTypeCriterion(
  db: Db,
  projectId: string,
  answers: Answers,
  framingSystem: FramingSystem | null,
): Promise<Answers> {
  const stories = answers.facts?.storiesAboveGrade;
  const buildings = answers.facts?.buildingCount;
  const parking = answers.facts?.parkingType;
  const zip = answers.facts?.zip;
  if (answers.projectType !== "multifamily" || answers.constructionKind !== "new" || typeof stories !== "number" || stories <= 0) {
    await deleteDerivedAssumption(db, projectId, A1_CODE);
    return answers;
  }
  const assumption = deriveConstructionType({
    storiesAboveGrade: stories,
    framingSystem,
    parkingType: typeof parking === "string" ? parking : null,
    retailStorefronts: gate(answers, "retail_storefronts"),
    grossSquareFeet: answers.grossSquareFeet,
    buildingCount: typeof buildings === "number" ? buildings : null,
    zip: typeof zip === "string" ? zip : null,
  });
  await saveDerivedAssumption(db, projectId, assumption, { model: "engine-rule" });
  return answers;
}
