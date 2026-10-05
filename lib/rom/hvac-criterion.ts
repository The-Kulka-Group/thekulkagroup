import {
  type Answers,
  type DerivedAssumption,
  type DerivedInput,
  type DerivedStep,
  effectiveValue,
  validateDerivedAssumption,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { type ClimateZone, climateZoneFor } from "./climate-zone";
import { M0_MIXED, m1Prototype } from "./criterion-wording";
import { deleteDerivedAssumption, saveDerivedAssumption } from "./derived-assumptions";
import { GLAZING, type GlazingBand, GSF_PER_TON } from "./engineering-tables";

// LA-1282. M-0, Window Area and Orientation, and M-1, HVAC Tonnage. The rules
// are the design's (docs/precon/criteria/la-777-hvac-tonnage.md, re-cut
// 2026-09-28 under Matt's rule that the app answers engineering questions
// itself and only pricing goes to him):
//
// - M-0 picks the glazing band the walls likely carry. Window area is the one
//   input code never fixes (it only caps it at 30 percent, 2025 ECCCNYS
//   C402.5.1), so the card reads low unless balconies and storefronts agree.
// - M-1 divides gross square feet by DOE's own code-minimum apartment models,
//   sized in New York weather: GSF per ton by climate zone and glazing band,
//   from the IECC 2021 mid-rise and high-rise prototypes (their cooling coils
//   summed, DOE's 1.2 sizing factor included). An ASHRAE 62.2 check flags a
//   project whose small units need more outdoor air than the model carries.
//
// M-1 sizes a planning quantity, never a load calculation: nobody has
// engineered the building, and item 30 keeps its per-square-foot price until
// Matt says whether HVAC should price by the ton. Code does the arithmetic;
// nothing here calls Jev.

export const M0_CODE = "M-0";
export const M0_LABEL = "Window Area and Orientation";
export const M1_CODE = "M-1";
export const M1_LABEL = "HVAC Tonnage";
/** Item 30, HVAC System. */
export const HVAC_COST_CODE = "30";
export const HVAC_COST_CODES = [HVAC_COST_CODE];

export const GLAZING_BANDS = [GLAZING.standard.text, GLAZING.elevated.text] as const;

export function glazingBand(text: string): GlazingBand {
  return text.toLowerCase().startsWith("elevated") ? "elevated" : "standard";
}

/** The prototypes' outdoor air: 0.026 m³/s per 950 SF apartment, about 58 cfm per 1,000 SF. */
export const MODEL_OUTDOOR_AIR_CFM_PER_1000 = 58;
/** Census 2025, new Northeast multifamily: 13, 42, 37 and 8 percent, 1.40 bedrooms per unit. */
export const BEDROOMS_PER_UNIT = 1.4;
/** DOE mid-rise prototype: apartments take 87 percent of gross area. */
const DWELLING_SHARE = 0.87;

const GATE_WORDS = { yes: "Yes", no: "No", dont_know: "Don't Know" } as const;
type Gate = "yes" | "no" | "dont_know" | null;

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function deriveGlazing(facts: { balconies: Gate; storefronts: Gate }): DerivedAssumption {
  const both = facts.balconies === "yes" && facts.storefronts === "yes";
  const band: GlazingBand = both ? "elevated" : "standard";
  const agree =
    (facts.balconies === "yes" && facts.storefronts === "yes") || (facts.balconies === "no" && facts.storefronts === "no");
  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: M0_CODE,
    label: M0_LABEL,
    value: { kind: "spec", text: GLAZING[band].text },
    // Source: docs/precon/criteria/la-777-hvac-tonnage.md.
    method: "Glazing band from balconies and storefronts, mapped to DOE's apartment prototypes.",
    inputs: [
      { name: "Balconies", value: facts.balconies ? GATE_WORDS[facts.balconies] : "Not answered", basis: facts.balconies ? "stated" : "assumed" },
      {
        name: "Retail Storefronts",
        value: facts.storefronts ? GATE_WORDS[facts.storefronts] : "Not answered",
        basis: facts.storefronts ? "stated" : "assumed",
      },
    ],
    steps: [
      { label: "Balconies", result: facts.balconies ? GATE_WORDS[facts.balconies] : "Not answered" },
      { label: "Storefronts", result: facts.storefronts ? GATE_WORDS[facts.storefronts] : "Not answered" },
      { label: "Window to Wall", result: `${GLAZING[band].percent}% (DOE ${GLAZING[band].model.toLowerCase()})` },
      { label: "Glazing Band", result: band === "elevated" ? "Elevated, at the 30% code cap" : "Standard" },
    ],
    confidence: agree ? "high" : "low",
    confidenceReason: agree
      ? "Balconies and storefronts agree, both present or both absent."
      : M0_MIXED,
    costCodes: HVAC_COST_CODES,
    correction: null,
  };
  validateDerivedAssumption(assumption);
  return assumption;
}

export type TonnageFacts = {
  constructionKind: "new" | "renovation";
  grossSquareFeet: number;
  unitCount: number | null;
  zip: string | null;
  parkingType: string | null;
  band: GlazingBand;
  /** Whether M-0's band was set by the estimator. */
  bandSet: boolean;
};

export type TonnageResult = {
  zone: ClimateZone;
  gsfPerTon: number;
  tons: number;
  /** ASHRAE 62.2 outdoor air per 1,000 SF, or null with no unit count. */
  ventilationCfmPer1000: number | null;
};

export function computeTonnage(facts: TonnageFacts): TonnageResult {
  const zone = climateZoneFor(facts.zip);
  const gsfPerTon = GSF_PER_TON[zone.zone][facts.band];
  const tons = Math.round(facts.grossSquareFeet / gsfPerTon);
  let ventilationCfmPer1000: number | null = null;
  if (facts.unitCount && facts.unitCount > 0) {
    const area = (facts.grossSquareFeet * DWELLING_SHARE) / facts.unitCount;
    const cfmPerUnit = 0.03 * area + 7.5 * (BEDROOMS_PER_UNIT + 1);
    ventilationCfmPer1000 = (cfmPerUnit / area) * 1000;
  }
  return { zone, gsfPerTon, tons, ventilationCfmPer1000 };
}

export function deriveTonnage(facts: TonnageFacts): DerivedAssumption {
  const result = computeTonnage(facts);
  const glazing = GLAZING[facts.band];
  const garage = facts.parkingType === "structured" || facts.parkingType === "underground" || facts.parkingType === "dont_know";
  const ventilationFails =
    result.ventilationCfmPer1000 !== null && result.ventilationCfmPer1000 > MODEL_OUTDOOR_AIR_CFM_PER_1000;

  const inputs: DerivedInput[] = [
    { name: "Gross Square Feet", value: fmt(facts.grossSquareFeet), basis: "stated" },
    {
      name: "Climate Zone",
      value: `Zone ${result.zone.zone}, ${result.zone.area}`,
      basis: result.zone.basis,
    },
    { name: "Glazing Band", value: `${glazing.text} (M-0)`, basis: facts.bandSet ? "stated" : "assumed" },
    {
      name: "Unit Count",
      value: facts.unitCount ? String(facts.unitCount) : "Not answered",
      basis: facts.unitCount ? "stated" : "assumed",
    },
    { name: "Unit Mix", value: "1.40 bedrooms per unit (Census 2025, Northeast)", basis: "assumed" },
  ];

  const steps: DerivedStep[] = [
    { label: "Climate Zone", result: `Zone ${result.zone.zone}, ${result.zone.area}` },
    { label: "DOE Model", result: `${glazing.model}, ${glazing.percent}% glazing` },
    { label: "GSF per Ton", result: fmt(result.gsfPerTon) },
    {
      label: "Ventilation Check",
      result:
        result.ventilationCfmPer1000 === null
          ? "No unit count"
          : `${fmt(result.ventilationCfmPer1000)} cfm per 1,000 SF, ${ventilationFails ? "over" : "within"} the model's 58`,
    },
    { label: "HVAC Tonnage", result: `${fmt(result.tons)} tons${facts.constructionKind === "renovation" ? ", a floor" : ""}` },
  ];

  const triggers = [
    facts.constructionKind === "renovation"
      ? "A renovation that keeps its walls and windows can run worse than the code-minimum model (ECCCNYS C503.1), so the figure is a floor."
      : "",
    result.zone.basis === "assumed" ? (result.zone.note ?? "The climate zone is assumed.") : "",
    garage ? "Gross square feet may include an uncooled garage, so the figure errs high." : "",
    result.ventilationCfmPer1000 === null ? "Unit count is blank, so the ventilation check cannot run." : "",
    ventilationFails ? "Small units need more outdoor air than the model carries, so the ratio may understate the ventilation load." : "",
  ].filter(Boolean);

  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: M1_CODE,
    label: M1_LABEL,
    value: { kind: "quantity", amount: result.tons, unit: "Tons" },
    // Source: docs/precon/criteria/la-777-hvac-tonnage.md.
    method: "Gross square feet over DOE's IECC 2021 apartment prototype GSF per ton, by climate zone and glazing band.",
    inputs,
    steps,
    confidence: triggers.length === 0 ? "high" : "low",
    confidenceReason: triggers.length === 0 ? m1Prototype(result.zone.zone) : triggers.join(" "),
    costCodes: HVAC_COST_CODES,
    correction: null,
  };
  validateDerivedAssumption(assumption);
  return assumption;
}

function gate(answers: Answers, section: string): Gate {
  const raw = answers.branchGates?.[section] ?? answers.facts?.[section];
  return raw === "yes" || raw === "no" || raw === "dont_know" ? raw : null;
}

/**
 * Derives M-0, then M-1 from M-0's effective band (the estimator's, when set),
 * and saves both. They set no fact, since item 30 does not price by the ton
 * yet. A project that is not multifamily gets neither: DOE publishes no
 * self-storage prototype.
 */
export async function applyHvacCriteria(db: Db, projectId: string, answers: Answers): Promise<Answers> {
  if (answers.projectType !== "multifamily") {
    await deleteDerivedAssumption(db, projectId, M1_CODE);
    await deleteDerivedAssumption(db, projectId, M0_CODE);
    return answers;
  }
  const m0 = await saveDerivedAssumption(
    db,
    projectId,
    deriveGlazing({ balconies: gate(answers, "balconies"), storefronts: gate(answers, "retail_storefronts") }),
    { model: "engine-rule" },
  );
  const band = effectiveValue(m0);
  const units = answers.facts?.unitCount;
  const zip = answers.facts?.zip;
  const parking = answers.facts?.parkingType;
  await saveDerivedAssumption(
    db,
    projectId,
    deriveTonnage({
      constructionKind: answers.constructionKind,
      grossSquareFeet: answers.grossSquareFeet,
      unitCount: typeof units === "number" ? units : null,
      zip: typeof zip === "string" ? zip : null,
      parkingType: typeof parking === "string" ? parking : null,
      band: band.kind === "spec" ? glazingBand(band.text) : "standard",
      bandSet: m0.correction !== null,
    }),
    { model: "engine-rule" },
  );
  return answers;
}
