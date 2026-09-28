import type { DerivedAssumption } from "@kulka/engine";

// LA-1265. What the Design and Engineering card needs to draw a criterion
// that the code, not the page, decided: the answers the estimator can pick
// instead, and the scale its one deciding number sits on. Pure, so the card
// only draws. The rules themselves live server-side (lib/rom/elevator-criterion.ts,
// lib/rom/jack-criterion.ts); the thresholds here only draw them.

/** The answers a spec criterion offers. A criterion not listed takes free text in the panel. */
export const CRITERION_CHOICES: Record<string, readonly string[]> = {
  "V-1": ["Hydraulic", "Traction"],
  "V-2": ["In-Ground", "Holeless", "Roped"],
};

/** The discipline a criterion belongs to, named on the card's eyebrow. */
export const CRITERION_DISCIPLINE: Record<string, string> = {
  "V-1": "Vertical Transportation",
  "V-2": "Vertical Transportation",
  "V-3": "Vertical Transportation",
  "E-1": "Electrical",
  "M-1": "Mechanical",
};

export type GaugeZone = { upTo: number; label: string };
export type Gauge = { max: number; unit: string; zones: GaugeZone[] };

/**
 * The travel scale each elevator criterion reads, with the bands its rule
 * draws. V-1: the hydraulic-to-traction band (docs/precon/criteria/la-784-elevator-type.md).
 * V-2: each jack's reach (docs/precon/research/la-hydraulic-jack-type.md).
 */
export const CRITERION_GAUGE: Record<string, Gauge> = {
  "V-1": {
    max: 70,
    unit: "ft of travel",
    zones: [
      { upTo: 35, label: "Hydraulic" },
      { upTo: 55, label: "Either" },
      { upTo: 70, label: "Traction" },
    ],
  },
  "V-2": {
    max: 70,
    unit: "ft of travel",
    zones: [
      { upTo: 34, label: "Holeless" },
      { upTo: 48, label: "Either" },
      { upTo: 60, label: "Well Hole" },
      { upTo: 70, label: "Roped" },
    ],
  },
};

/** The travel a criterion's arithmetic came to, read off its "Travel" step: `42'-0" (42.0 ft)`. */
export function travelFeet(criterion: Pick<DerivedAssumption, "steps">): number | null {
  const step = criterion.steps.find((one) => one.label.toLowerCase() === "travel");
  const match = step ? /\(([\d.]+) ft\)/.exec(step.result) : null;
  return match ? Number(match[1]) : null;
}

/** Which zone a value sits in, by index. */
export function zoneIndex(gauge: Gauge, value: number): number {
  const found = gauge.zones.findIndex((zone) => value <= zone.upTo);
  return found === -1 ? gauge.zones.length - 1 : found;
}

/** The facts the engine reads for a picked answer, so the live budget prices by them. */
export function factsFor(code: string, text: string): Record<string, string> {
  const lower = text.toLowerCase();
  if (code === "V-1") return { elevatorType: lower.startsWith("traction") ? "traction" : "hydraulic" };
  if (code === "V-2") {
    if (lower.startsWith("in-ground")) return { hydraulicJackType: "in_ground" };
    if (lower.startsWith("holeless")) return { hydraulicJackType: "holeless" };
    if (lower.startsWith("roped")) return { hydraulicJackType: "roped" };
  }
  if (code === "V-3") {
    const rooms = roomsIn(text);
    if (rooms !== null) return { elevatorMachineRooms: String(rooms), elevatorMachineRoomHvac: rooms > 0 ? "yes" : "no" };
  }
  return {};
}

/** V-3's answer as a count: "None" is zero, "2 Machine Rooms" is two. */
function roomsIn(text: string): number | null {
  if (text.trim().toLowerCase() === "none") return 0;
  const match = /^(\d+)/.exec(text.trim());
  return match ? Number(match[1]) : null;
}

/**
 * The answers a criterion's card and panel offer. V-1 and V-2 have set
 * answers; V-3 offers every count from none up to one room per car.
 */
export function choicesFor(criterion: Pick<DerivedAssumption, "code" | "steps">): readonly string[] {
  const fixed = CRITERION_CHOICES[criterion.code];
  if (fixed) return fixed;
  if (criterion.code === "V-3") {
    const cars = stepNumber(criterion, "Elevators") ?? 1;
    return Array.from({ length: cars + 1 }, (_, count) => (count === 0 ? "None" : `${count} Machine Room${count === 1 ? "" : "s"}`));
  }
  return [];
}

/** A number a criterion's arithmetic states on a named step, such as V-3's "Elevators" and "Machine Rooms". */
export function stepNumber(criterion: Pick<DerivedAssumption, "steps">, label: string): number | null {
  const step = criterion.steps.find((one) => one.label.toLowerCase() === label.toLowerCase());
  const match = step ? /^(\d+)/.exec(step.result.trim()) : null;
  return match ? Number(match[1]) : null;
}

/**
 * LA-1269: V-3's cars grouped into the rooms that serve them, as evenly as
 * the count allows, for the card's diagram: 3 cars in 2 rooms reads [2, 1].
 */
export function carsPerRoom(cars: number, rooms: number): number[] {
  if (rooms <= 0 || cars <= 0) return [];
  const base = Math.floor(cars / rooms);
  const extra = cars % rooms;
  return Array.from({ length: rooms }, (_, index) => base + (index < extra ? 1 : 0));
}

