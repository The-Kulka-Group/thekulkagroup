// V-1, Elevator Type (LA-1205, building LA-784's design and LA-860's shared
// mechanism). Two things live here, both pure:
//
//   1. The travel arithmetic and the hydraulic/traction band, which V-1 uses
//      to decide its value in code, and which the "either" band's candidates
//      are built from before Jev ever sees them (the caller, lib/rom's
//      elevator-criterion.ts, builds the DerivationRequest; this file only
//      does the math).
//   2. Item 26 (Elevators, priced per stop by V-1's type) and item 26a (the
//      elevator bulkhead, priced per shaft), both driven off the same facts.
//
// Matt's rates -- $35,000 hydraulic and $45,300 traction per stop; $16,600 a
// single-car bulkhead, $28,700 for two cars sharing one, stated 2026-09-27 --
// are never hardcoded here. They arrive as benchmark rows with their own
// provenance, the same as every other rate in this engine (GLOSSARY.md:
// Benchmark, Provenance). This file only says which row a project's facts
// pick and what quantity the picked rate multiplies by.

import type { FramingSystem } from "./rom-framing";
import type { Benchmark, RomLine } from "./rom";

export type ElevatorType = "hydraulic" | "traction";

/** Item 26, Elevators (per stop by type) and its bulkhead, item 26a. */
export const ELEVATOR_COST_CODE = "26";
export const ELEVATOR_BULKHEAD_COST_CODE = "26a";

// =====================================================================
// Floor-to-floor and travel (the arithmetic behind V-1's card)
// =====================================================================

/**
 * The five planning figures Matt stated 2026-09-27
 * (docs/precon/research/la-784-elevator-followups.md, Section 4; decisions
 * recorded in docs/precon/criteria/la-784-elevator-type.md). Feet, as a
 * decimal (9'-8" is 9 + 8/12).
 */
export const FLOOR_TO_FLOOR_FEET = {
  wood: 10,
  podium: 12,
  concrete_flat_plate: 9 + 8 / 12,
  steel: 10,
  // "Cold-formed steel uses the wood figure" (Matt, 2026-09-27).
  cold_formed_steel: 10,
} as const;

export type FloorToFloorSource = keyof typeof FLOOR_TO_FLOOR_FEET;

/** One line of source text per planning figure, for the card's method line. */
export const FLOOR_TO_FLOOR_SOURCE: Record<FloorToFloorSource, string> = {
  wood: "Matt, 2026-09-27: wood frame, including over a podium, 10'-0\" (WoodWorks, RSMeans, CTBUH).",
  podium: "Matt, 2026-09-27: podium level, 12'-0\" (WoodWorks 5-story podium example).",
  concrete_flat_plate: "Matt, 2026-09-27: concrete flat plate, 9'-8\" (AISC Design Guide 14, staggered truss).",
  steel: "Matt, 2026-09-27: steel, 10'-0\" (AISC Design Guide 14 range, WoodWorks).",
  cold_formed_steel: "Matt, 2026-09-27: cold-formed steel uses the wood figure, 10'-0\", pending its own source.",
};

/** A retail or amenity ground floor, when known, adds height (Matt, 2026-09-27). */
export const RETAIL_GROUND_FLOOR_FEET = 15;

/**
 * The project's Framing System picks the floor-to-floor figure. Today
 * `projects.framing_system` (LA-1103) only holds "wood" or "metal": "metal"
 * already means load-bearing light-gauge metal (rom-framing.ts), which is
 * cold-formed steel, so it maps onto the cold-formed-steel figure -- itself
 * equal to the wood figure by Matt's own decision. Podium, concrete flat
 * plate and steel framing have no project field yet. "Where it does not
 * decide one, wood is used and the input is marked assumed" (the ticket).
 */
export function floorToFloorFor(framingSystem: FramingSystem | null): {
  feet: number;
  source: FloorToFloorSource;
  assumed: boolean;
} {
  if (framingSystem === "wood") return { feet: FLOOR_TO_FLOOR_FEET.wood, source: "wood", assumed: false };
  if (framingSystem === "metal") {
    return { feet: FLOOR_TO_FLOOR_FEET.cold_formed_steel, source: "cold_formed_steel", assumed: false };
  }
  return { feet: FLOOR_TO_FLOOR_FEET.wood, source: "wood", assumed: true };
}

/**
 * Travel = (Stories Above Grade - 1) x floor-to-floor, plus the extra height
 * of a taller ground floor when one is known (the ticket; research Section 1
 * and 4). A ground floor shorter than the typical figure is never
 * subtracted -- "extra height," never a deduction.
 */
export function elevatorTravelFeet(
  storiesAboveGrade: number,
  floorToFloorFeet: number,
  hasTallerGroundFloor: boolean,
): number {
  const base = (storiesAboveGrade - 1) * floorToFloorFeet;
  const groundFloorExtra = hasTallerGroundFloor ? Math.max(0, RETAIL_GROUND_FLOOR_FEET - floorToFloorFeet) : 0;
  return base + groundFloorExtra;
}

export type ElevatorBand = "hydraulic" | "either" | "traction";

/** 35 ft or less: Hydraulic. Over 55 ft: Traction. In between: either (Matt, 2026-09-27). */
export const HYDRAULIC_MAX_FEET = 35;
export const TRACTION_MIN_FEET = 55;

export function elevatorBand(travelFeet: number): ElevatorBand {
  if (travelFeet <= HYDRAULIC_MAX_FEET) return "hydraulic";
  if (travelFeet <= TRACTION_MIN_FEET) return "either";
  return "traction";
}

// =====================================================================
// Item 26 and 26a: reading the facts a run gives
// =====================================================================

const KNOWN_ELEVATOR_TYPES: ReadonlySet<string> = new Set(["hydraulic", "traction"]);

/**
 * The elevator facts a quantity reads, off `Answers.facts`. `elevatorType`
 * lands there once V-1 has been derived (lib/rom/elevator-criterion.ts
 * writes it in before `computeRom` runs; see LA-860's pattern for
 * `framingSystem`). `elevatorCount` is LA-1205's new intake field, opened by
 * the elevator gate. `storiesAboveGrade` is LA-1199's. `levelsBelowGradeServed`
 * reads the existing `levels_below_grade` branch gate: the ticket calls for
 * "Levels Below Grade when the elevator serves them," and with no numeric
 * count of levels captured anywhere yet, a "yes" answer is read as one served
 * level. Absent facts read as none of it answered yet, the same silence rule
 * every other quantity in this engine already follows.
 */
export type ElevatorFacts = {
  elevatorType: ElevatorType | null;
  elevatorCount: number | null;
  storiesAboveGrade: number | null;
  levelsBelowGradeServed: boolean;
  /**
   * LA-1269: how many elevator machine rooms or controller spaces need HVAC,
   * as V-3 worked it out (lib/rom/machine-room-criterion.ts). Null until V-3
   * has run.
   */
  machineRooms: number | null;
};

function readNumberFact(facts: Record<string, string | number | boolean> | undefined, name: string): number | null {
  const value = facts?.[name];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readElevatorFacts(facts: Record<string, string | number | boolean> | undefined): ElevatorFacts {
  const rawType = facts?.["elevatorType"];
  return {
    elevatorType: typeof rawType === "string" && KNOWN_ELEVATOR_TYPES.has(rawType) ? (rawType as ElevatorType) : null,
    elevatorCount: readNumberFact(facts, "elevatorCount"),
    storiesAboveGrade: readNumberFact(facts, "storiesAboveGrade"),
    levelsBelowGradeServed: facts?.["levels_below_grade"] === "yes",
    machineRooms: readCountFact(facts, "elevatorMachineRooms"),
  };
}

/** A count set by a criterion, which reaches the live budget as text ("2") and a run as a number. */
function readCountFact(facts: Record<string, string | number | boolean> | undefined, name: string): number | null {
  const value = facts?.[name];
  const count = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : null;
}

/** Stops per elevator: Stories Above Grade, plus one for a served below-grade level (the ticket). */
export function stopsPerElevator(facts: ElevatorFacts): number | null {
  if (facts.storiesAboveGrade === null) return null;
  return facts.storiesAboveGrade + (facts.levelsBelowGradeServed ? 1 : 0);
}

export function totalElevatorStops(facts: ElevatorFacts): number | null {
  const perElevator = stopsPerElevator(facts);
  if (perElevator === null || facts.elevatorCount === null) return null;
  return perElevator * facts.elevatorCount;
}

/** Whether item 26 has anything to price: an elevator count above zero and stops to go with it. */
export function hasElevatorScope(facts: ElevatorFacts): boolean {
  return (facts.elevatorCount ?? 0) > 0 && totalElevatorStops(facts) !== null;
}

// =====================================================================
// Item 26: per stop, by V-1's type
// =====================================================================

/** Item 26's rows for a known type: the rate Matt stated for that type (the ticket's replacement for one blended rate). */
export function elevatorTypeRows(rows: readonly Benchmark[], elevatorType: ElevatorType | null): readonly Benchmark[] {
  if (elevatorType === null) return rows;
  const matched = rows.filter((row) => row.elevatorType === elevatorType);
  return matched.length > 0 ? matched : rows;
}

/**
 * Item 26 with no known type yet (V-1 has not run, or the project has no
 * Stories Above Grade): the full span from the lowest rate to the highest,
 * held for review, the same shape `structureDemolitionSpanLine` gives item 1a
 * with no known structure type.
 */
export function elevatorSpanLine(rows: readonly Benchmark[], stops: number, blend: (rows: Benchmark[]) => RomLine): RomLine {
  const shell = blend([...rows]);
  const rates = rows.map((row) => row.value);
  return {
    ...shell,
    low: Math.round(Math.min(...rates) * stops),
    high: Math.round(Math.max(...rates) * stops),
    confidence: "low",
    heldForReview: true,
  };
}

/**
 * Item 26, start to finish: no scope yet (no elevator count, or no stops)
 * produces no line at all, the same "silence prices as nothing" rule item 1a
 * follows. A known type blends that type's own rate; an unknown type prices
 * the full span.
 */
export function priceElevator(
  rows: readonly Benchmark[],
  facts: ElevatorFacts,
  blend: (rows: Benchmark[]) => RomLine,
): RomLine | null {
  // Only the per-stop rows price per stop. A job without the facts per-stop
  // pricing needs (no Stories Above Grade, or no Elevator Count, which only a
  // guided New Budget run records today) keeps the per-GSF pricing it had
  // before LA-1205 from any other row, rather than losing its elevator line.
  // An Elevator Count of zero means no elevator, so no line at all.
  const perStop = rows.filter((row) => row.unit === "usd_per_stop");
  const other = rows.filter((row) => row.unit !== "usd_per_stop");
  if (facts.elevatorCount === 0) return null;
  if (!hasElevatorScope(facts)) return other.length > 0 ? blend([...other]) : null;
  const stops = totalElevatorStops(facts)!;
  if (facts.elevatorType === null) return elevatorSpanLine(perStop, stops, blend);
  return blend([...elevatorTypeRows(perStop, facts.elevatorType)]);
}

// =====================================================================
// Item 26a: the elevator bulkhead
// =====================================================================

/**
 * Which of the bulkhead's stated figures a row prices. `single_car` and
 * `shared_two_car` are the two shaft counts Matt stated a rate for; the door
 * package is a third, separate figure, added only when the bulkhead also
 * holds the roof stair or a machine room -- never automatically, since no
 * fact today says which bulkheads do (the ticket, "added only when stated").
 */
export type BulkheadConfig = "single_car" | "shared_two_car" | "door_package";

function bulkheadRate(rows: readonly Benchmark[], config: BulkheadConfig): number | null {
  const row = rows.find((r) => r.elevatorBulkheadConfig === config);
  return row ? row.value : null;
}

/**
 * Elevator count pairs off into shared two-car bulkheads with one single-car
 * bulkhead left over on an odd count (the ticket names no other pairing
 * rule). Matt's build-up for a shared bulkhead already prices two shafts
 * under one enclosure, so this never doubles the single-car rate.
 */
export function bulkheadCost(rows: readonly Benchmark[], elevatorCount: number): number | null {
  const single = bulkheadRate(rows, "single_car");
  const sharedTwo = bulkheadRate(rows, "shared_two_car");
  if (single === null || sharedTwo === null) return null;
  const pairs = Math.floor(elevatorCount / 2);
  const singles = elevatorCount % 2;
  return pairs * sharedTwo + singles * single;
}

/**
 * Item 26a, one line for every elevator shaft. No elevator count yet, or a
 * database missing one of the two stated rates, produces no line rather than
 * an invented figure. The rate is Matt's own stated build-up, so the line
 * carries no spread: low and high are the same number, at high confidence.
 */
export function priceElevatorBulkhead(
  rows: readonly Benchmark[],
  elevatorCount: number | null,
  blend: (rows: Benchmark[]) => RomLine,
): RomLine | null {
  if (elevatorCount === null || elevatorCount <= 0) return null;
  const cost = bulkheadCost(rows, elevatorCount);
  if (cost === null) return null;
  const shell = blend([...rows]);
  // LA-1502: the figure pairs shafts off rather than multiplying one rate by
  // one quantity, so the line names no quantity.
  return { ...shell, low: cost, high: cost, confidence: "high", heldForReview: false, quantity: null };
}
