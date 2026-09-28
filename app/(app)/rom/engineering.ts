import type { DerivedAssumption, DerivedValue } from "@kulka/engine";

import { SERVICE_RATINGS } from "@/lib/rom/engineering-tables";

// LA-1265. What the Design and Engineering card needs to draw a criterion
// that the code, not the page, decided: the answers the estimator can pick
// instead, and the scale its one deciding number sits on. Pure, so the card
// only draws. The rules themselves live server-side (lib/rom/elevator-criterion.ts,
// lib/rom/jack-criterion.ts); the thresholds here only draw them.

/** The answers a spec criterion offers. A criterion not listed takes free text in the panel. */
export const CRITERION_CHOICES: Record<string, readonly string[]> = {
  "V-1": ["Hydraulic", "Traction"],
  "V-2": ["In-Ground", "Holeless", "Roped"],
  "M-0": ["Standard Glazing Band", "Elevated Glazing Band"],
};

/** The discipline a criterion belongs to, named on the card's eyebrow. */
export const CRITERION_DISCIPLINE: Record<string, string> = {
  "V-1": "Vertical Transportation",
  "V-2": "Vertical Transportation",
  "V-3": "Vertical Transportation",
  "A-1": "Architectural",
  "E-1": "Electrical",
  "M-0": "Mechanical",
  "M-1": "Mechanical",
};

/**
 * LA-1281, LA-1282: a criterion that sizes something the budget does not yet
 * price by says so on its card, so a lit box with no change in the total
 * reads as intended. Each waits on Matt's pricing answer.
 */
export const CRITERION_PRICING_NOTE: Record<string, string> = {
  "A-1": "The type is shown for reference. The podium deck, exterior walls, rated drywall and sprinklers still price as they do today.",
  "E-1": "Electrical still prices per square foot. The service size is shown for reference until a rate per amp is set.",
  "M-0": "The band feeds M-1's tonnage. HVAC still prices per square foot.",
  "M-1": "HVAC still prices per square foot. The tonnage is shown for reference until a rate per ton is set.",
};

/** A value as the card and its choices show it: "Hydraulic", "2,500 A Service", "189 Tons". */
export function valueText(value: DerivedValue): string {
  return value.kind === "spec" ? value.text : `${value.amount.toLocaleString("en-US")} ${value.unit}`;
}

/** The value a picked choice stands for, in the criterion's own kind and unit. */
export function valueFromChoice(criterion: Pick<DerivedAssumption, "value">, text: string): DerivedValue | null {
  if (criterion.value.kind === "spec") return { kind: "spec", text };
  const amount = Number(/^[\d,.]+/.exec(text.trim())?.[0].replace(/,/g, ""));
  return Number.isFinite(amount) && amount > 0 ? { kind: "quantity", amount, unit: criterion.value.unit } : null;
}

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
export function choicesFor(criterion: Pick<DerivedAssumption, "code" | "steps" | "value">): readonly string[] {
  const fixed = CRITERION_CHOICES[criterion.code];
  if (fixed) return fixed;
  // LA-1298: A-1 offers its own type and the others the code allows, as its
  // "Also Allowed" step names them.
  if (criterion.code === "A-1" && criterion.value.kind === "spec") {
    const also = criterion.steps.find((one) => one.label === "Also Allowed")?.result ?? "None";
    return [criterion.value.text, ...(also === "None" ? [] : also.split("; "))];
  }
  // LA-1281: E-1 offers the rating either side of the one it landed on.
  if (criterion.code === "E-1" && criterion.value.kind === "quantity") {
    const { amount, unit } = criterion.value;
    const at = SERVICE_RATINGS.findIndex((rating) => rating === amount);
    if (at === -1) return [];
    return SERVICE_RATINGS.slice(Math.max(0, at - 1), at + 2).map((rating) => valueText({ kind: "quantity", amount: rating, unit }));
  }
  if (criterion.code === "V-3") {
    const cars = stepNumber(criterion, "Elevators") ?? 1;
    return Array.from({ length: cars + 1 }, (_, count) => (count === 0 ? "None" : `${count} Machine Room${count === 1 ? "" : "s"}`));
  }
  return [];
}

/** A number a criterion's arithmetic states on a named step, such as V-3's "Elevators" or E-1's "Service Load" ("2,274 A"). */
export function stepNumber(criterion: Pick<DerivedAssumption, "steps">, label: string): number | null {
  const step = criterion.steps.find((one) => one.label.toLowerCase() === label.toLowerCase());
  const match = step ? /^([\d,]+(?:\.\d+)?)/.exec(step.result.trim()) : null;
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

/** The text of a criterion's named step, such as M-1's "Climate Zone" ("Zone 4, Suffolk County"). */
export function stepText(criterion: Pick<DerivedAssumption, "steps">, label: string): string | null {
  return criterion.steps.find((one) => one.label.toLowerCase() === label.toLowerCase())?.result ?? null;
}

/**
 * LA-1281: where a load in amps sits on the ladder of standard ratings, as a
 * share of the ladder's width: each rating owns an equal cell, and the load
 * sits between the centres of the two ratings around it.
 */
export function ladderPosition(amps: number): number {
  const n = SERVICE_RATINGS.length;
  if (amps <= SERVICE_RATINGS[0]) return (Math.max(0, amps) / SERVICE_RATINGS[0]) * (0.5 / n) * 100;
  if (amps >= SERVICE_RATINGS[n - 1]) return 100;
  const i = SERVICE_RATINGS.findIndex((rating, index) => amps >= rating && amps <= SERVICE_RATINGS[index + 1]);
  const low = SERVICE_RATINGS[i];
  const high = SERVICE_RATINGS[i + 1];
  return ((i + 0.5 + (amps - low) / (high - low)) / n) * 100;
}

/** "400", "1.2k", "2.5k": a rating short enough for a ladder cell. */
export function ratingLabel(rating: number): string {
  return rating < 1000 ? String(rating) : `${Number((rating / 1000).toFixed(1))}k`;
}

/**
 * LA-1282: which bays of a floor carry windows for M-0's facade, spread
 * evenly: 2 of 10 bays is the standard band (19.9 percent glass), 3 of 10
 * the elevated band (29.8).
 */
export function windowBays(windows: number, bays: number): number[] {
  return Array.from({ length: windows }, (_, j) => Math.round(((j + 0.5) * bays) / windows - 0.5));
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

