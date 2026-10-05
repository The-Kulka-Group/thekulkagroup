import {
  type Answers,
  type DerivedAssumption,
  type DerivedInput,
  type DerivedStep,
  validateDerivedAssumption,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { E1_AMENITY, E1_ELEVATOR } from "./criterion-wording";
import { deleteDerivedAssumption, saveDerivedAssumption } from "./derived-assumptions";
import { SERVICE_RATINGS } from "./engineering-tables";

// LA-1281. E-1, Electrical Service Size: the service each building needs, in
// amps, by NEC's optional calculation for multifamily dwellings (220.84). The
// rule is the design's (docs/precon/criteria/la-776-electrical-service-size.md,
// re-cut 2026-09-28 under Matt's rule that the app answers engineering
// questions itself and only pricing goes to him):
//
// 1. One service per building (230.2), so the demand factor applies per building.
// 2. Connected load per unit from 220.84(C), with the appliances in NEC Annex D
//    Example D4(b) and in-unit laundry (Census 2025: 63 percent of new
//    Northeast multifamily units).
// 3. The Table 220.84 demand factor for the units on the service.
// 4. A house load, always (220.84(B)): common-area lighting, and elevator
//    motors at a labeled 40 HP placeholder.
// 5. 208Y/120 V three-phase, rounded up to a 240.6(A) rating, flagged past
//    4,000 A (PSEG Long Island Red Book 5.2.4).
//
// It sizes a planning quantity from code tables and stated facts; nobody has
// engineered the building. Item 31 keeps its per-square-foot price until Matt
// says how Service and Distribution should price by amps. Code does the
// arithmetic; nothing here calls Jev.

export const E1_CODE = "E-1";
export const E1_LABEL = "Electrical Service Size";
/** Item 31, Electrical System. */
export const ELECTRICAL_COST_CODE = "31";
export const E1_COST_CODES = [ELECTRICAL_COST_CODE];

/** 208 V three-phase: VA ÷ (208 × 1.732) is amps, the NEC's own convention. */
const THREE_PHASE_VOLT_AMPS = 208 * 1.732;
/** DOE mid-rise apartment prototype: apartments take 87 percent of gross area. */
export const DWELLING_SHARE = 0.87;

/** NEC 220.84(C), per unit, beyond the lighting load (Annex D Example D4(b)). */
export const UNIT_LOADS_VA = {
  smallAppliance: 3000,
  laundry: 1500,
  range: 8000,
  dryer: 5000,
  waterHeater: 2500,
  heatingOrCooling: 6000,
} as const;
const LIGHTING_VA_PER_SF = 3;

/** Common-area lighting, 2014 NEC Table 220.12: corridors, or the clubs rate when amenity scope may be there. */
const CORRIDOR_VA_PER_SF = 0.5;
const CLUBS_VA_PER_SF = 2;

/** 40 HP at 208 V three-phase, NEC Table 430.250: 114 A, 41,070 VA. A placeholder until the elevator vendor's data. */
export const ELEVATOR_MOTOR_VA = 41070;

/** One service at 208Y/120 V tops out here with PSEG Long Island (Red Book 5.2.4). */
export const MAX_SERVICE_AMPS = 4000;

/** Table 220.84: the demand factor by the number of units on the service, as the design reads it. */
const DEMAND_FACTORS: readonly [maxUnits: number, factor: number][] = [
  [5, 0.45],
  [7, 0.44],
  [10, 0.43],
  [11, 0.42],
  [13, 0.41],
  [15, 0.4],
  [17, 0.39],
  [20, 0.38],
  [21, 0.37],
  [23, 0.36],
  [25, 0.35],
  [27, 0.34],
  [30, 0.33],
  [31, 0.32],
  [33, 0.31],
  [36, 0.3],
  [38, 0.29],
  [42, 0.28],
  [45, 0.27],
  [50, 0.26],
  [55, 0.25],
  [61, 0.24],
  [Number.POSITIVE_INFINITY, 0.23],
];

/** The Table 220.84 factor, or null under 3 units, where the method does not apply. */
export function demandFactor(units: number): number | null {
  if (units < 3) return null;
  return DEMAND_FACTORS.find(([max]) => units <= max)?.[1] ?? null;
}

/** The smallest 240.6(A) rating that carries the load, or null past 4,000 A. */
export function serviceRating(amps: number): number | null {
  return SERVICE_RATINGS.find((rating) => rating >= amps) ?? null;
}

/** The unit an E-1 amount carries: one service, or each of several. */
export function serviceUnit(buildings: number): string {
  return buildings > 1 ? `A Each, ${buildings} Services` : "A Service";
}

export type ElectricalFacts = {
  constructionKind: "new" | "renovation";
  grossSquareFeet: number;
  unitCount: number;
  buildingCount: number | null;
  /** The amenity gate; null when unanswered, which prices like "don't know". */
  amenityScope: "yes" | "no" | "dont_know" | null;
  /** Elevators on the job, zero when the gate is not yes. */
  elevatorCount: number;
  parkingType: string | null;
};

export type ElectricalResult = {
  buildings: number;
  unitsPerBuilding: number;
  averageUnitSquareFeet: number;
  connectedPerUnitVa: number;
  factor: number;
  dwellingDemandVa: number;
  commonAreaVa: number;
  elevatorVa: number;
  serviceVa: number;
  amps: number;
  /** The 240.6(A) rating, or null past 4,000 A. */
  rating: number | null;
};

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** The arithmetic, steps 1 to 5. Null when a building has fewer than 3 units. */
export function computeElectricalService(facts: ElectricalFacts): ElectricalResult | null {
  const buildings = facts.buildingCount && facts.buildingCount > 0 ? facts.buildingCount : 1;
  const unitsPerBuilding = Math.ceil(facts.unitCount / buildings);
  const factor = demandFactor(unitsPerBuilding);
  if (factor === null) return null;

  const gsfPerBuilding = facts.grossSquareFeet / buildings;
  const averageUnitSquareFeet = (gsfPerBuilding * DWELLING_SHARE) / unitsPerBuilding;
  const connectedPerUnitVa =
    LIGHTING_VA_PER_SF * averageUnitSquareFeet + Object.values(UNIT_LOADS_VA).reduce((sum, va) => sum + va, 0);
  const dwellingDemandVa = unitsPerBuilding * connectedPerUnitVa * factor;

  const commonRate = facts.amenityScope === "no" ? CORRIDOR_VA_PER_SF : CLUBS_VA_PER_SF;
  const commonAreaVa = gsfPerBuilding * (1 - DWELLING_SHARE) * commonRate;
  // The largest motor at 125 percent, the rest at 100 (220.50, 430.24).
  const cars = facts.elevatorCount > 0 ? Math.ceil(facts.elevatorCount / buildings) : 0;
  const elevatorVa = cars > 0 ? ELEVATOR_MOTOR_VA * 1.25 + (cars - 1) * ELEVATOR_MOTOR_VA : 0;

  const serviceVa = dwellingDemandVa + commonAreaVa + elevatorVa;
  const amps = serviceVa / THREE_PHASE_VOLT_AMPS;
  return {
    buildings,
    unitsPerBuilding,
    averageUnitSquareFeet,
    connectedPerUnitVa,
    factor,
    dwellingDemandVa,
    commonAreaVa,
    elevatorVa,
    serviceVa,
    amps,
    rating: serviceRating(amps),
  };
}

const PARKING_WORDS: Record<string, string> = {
  none: "None",
  surface: "Surface",
  structured: "Structured",
  underground: "Underground",
  dont_know: "Don't Know",
};
const GATE_WORDS = { yes: "Yes", no: "No", dont_know: "Don't Know" } as const;

export function deriveElectricalService(facts: ElectricalFacts): DerivedAssumption | null {
  const result = computeElectricalService(facts);
  if (!result) return null;
  const buildingStated = Boolean(facts.buildingCount && facts.buildingCount > 0);
  const garage = facts.parkingType === "structured" || facts.parkingType === "underground" || facts.parkingType === "dont_know";
  const amenity = facts.amenityScope !== "no";
  const overLimit = result.rating === null;

  const inputs: DerivedInput[] = [
    { name: "Unit Count", value: String(facts.unitCount), basis: "stated" },
    {
      name: "Building Count",
      value: buildingStated ? String(result.buildings) : "Not answered, one assumed",
      basis: buildingStated ? "stated" : "assumed",
    },
    { name: "Gross Square Feet", value: fmt(facts.grossSquareFeet), basis: "stated" },
    {
      name: "Amenity Scope",
      value: facts.amenityScope ? GATE_WORDS[facts.amenityScope] : "Not answered",
      basis: facts.amenityScope === "yes" || facts.amenityScope === "no" ? "stated" : "assumed",
    },
    { name: "Elevators", value: String(facts.elevatorCount), basis: "stated" },
    { name: "Dwelling Share of Gross Area", value: "87% (DOE mid-rise apartment)", basis: "assumed" },
    { name: "Appliances per Unit", value: "Range, dryer, water heater, 6 kW heat (NEC Annex D4(b))", basis: "assumed" },
  ];
  if (facts.parkingType) inputs.push({ name: "Parking", value: PARKING_WORDS[facts.parkingType] ?? facts.parkingType, basis: "stated" });
  if (result.elevatorVa > 0) inputs.push({ name: "Elevator Motor", value: "40 HP per car, a placeholder", basis: "assumed" });

  const perBuilding = result.buildings > 1 ? " per Building" : "";
  const amount = result.rating ?? Math.ceil(result.amps / 100) * 100;
  const steps: DerivedStep[] = [
    { label: `Units${perBuilding}`, result: String(result.unitsPerBuilding) },
    { label: "Average Unit", result: `${fmt(result.averageUnitSquareFeet)} SF` },
    { label: "Connected Load per Unit", result: `${fmt(result.connectedPerUnitVa)} VA` },
    { label: "Demand Factor", result: `${Math.round(result.factor * 100)}% (Table 220.84)` },
    { label: "Dwelling Demand", result: `${fmt(result.dwellingDemandVa)} VA` },
    { label: "House Load", result: `${fmt(result.commonAreaVa + result.elevatorVa)} VA` },
    { label: "Service Load", result: `${fmt(result.amps)} A at 208Y/120 V` },
    {
      label: "Service Size",
      result: overLimit
        ? `${fmt(amount)} A, past one 4,000 A service`
        : `${fmt(amount)} A${result.buildings > 1 ? ` each, ${result.buildings} services` : ""}`,
    },
  ];

  const triggers = [
    facts.constructionKind === "renovation"
      ? "A renovation may keep its existing service, and NEC 220.87 lets the engineer size from measured demand."
      : "",
    amenity ? E1_AMENITY : "",
    result.elevatorVa > 0 ? E1_ELEVATOR : "",
    garage ? "Gross square feet may include a garage, which inflates the unit area, and garage exhaust is not sized." : "",
    overLimit
      ? "One service at 208Y/120 V tops out at 4,000 A with PSEG Long Island; the engineer would split the service or go to 480Y/277 V."
      : "",
  ].filter(Boolean);

  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: E1_CODE,
    label: E1_LABEL,
    value: { kind: "quantity", amount, unit: serviceUnit(result.buildings) },
    // Source: docs/precon/criteria/la-776-electrical-service-size.md.
    method: "NEC 220.84 optional multifamily calculation, one service per building.",
    inputs,
    steps,
    confidence: triggers.length === 0 ? "high" : "low",
    confidenceReason:
      triggers.length === 0
        ? "New construction with no amenity scope and no elevator; every load in the figure comes from the NEC method and its worked example."
        : triggers.join(" "),
    costCodes: E1_COST_CODES,
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
 * Derives E-1 and saves it. It sets no fact, since item 31 does not price by
 * amps yet. A project that is not multifamily, has no unit count, or has
 * fewer than 3 units per building gets no card, and any stored E-1 goes.
 */
export async function applyElectricalCriterion(db: Db, projectId: string, answers: Answers): Promise<Answers> {
  const units = answers.facts?.unitCount;
  const buildings = answers.facts?.buildingCount;
  const elevators = answers.facts?.elevatorCount;
  const parking = answers.facts?.parkingType;
  const assumption =
    answers.projectType === "multifamily" && typeof units === "number" && units > 0
      ? deriveElectricalService({
          constructionKind: answers.constructionKind,
          grossSquareFeet: answers.grossSquareFeet,
          unitCount: units,
          buildingCount: typeof buildings === "number" ? buildings : null,
          amenityScope: gate(answers, "amenity_scope"),
          elevatorCount: gate(answers, "elevator") === "yes" && typeof elevators === "number" ? elevators : 0,
          parkingType: typeof parking === "string" ? parking : null,
        })
      : null;
  if (!assumption) {
    await deleteDerivedAssumption(db, projectId, E1_CODE);
    return answers;
  }
  await saveDerivedAssumption(db, projectId, assumption, { model: "engine-rule" });
  return answers;
}
