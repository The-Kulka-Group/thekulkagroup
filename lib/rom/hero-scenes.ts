import { type DerivedAssumption, HYDRAULIC_MAX_FEET, TRACTION_MIN_FEET } from "@kulka/engine";

import { SERVICE_RATINGS } from "./engineering-tables";

// LA-1324. Matt, 2026-09-28: the top of the budget becomes Design and
// Engineering's stage, and each card plays there as the picture of its own
// arithmetic: V-1's travel scale, V-3's machine rooms, S-1's foundation,
// M-0's facade, M-1's climate zone and E-1's amp ladder. This module reads a
// card's value and steps into the numbers its picture needs. It knows
// nothing about drawing. A card's correction wins over its own answer, and a
// card missing the numbers its picture needs has no scene (the stage shows
// its caption alone).

export type TravelBand = { to: number | null; label: string };

export type HeroScene =
  | { kind: "travel"; travelFeet: number; bands: TravelBand[]; answer: string }
  | { kind: "rooms"; cars: number; buildings: number; rooms: number }
  | { kind: "foundation"; system: string; coverage: number | null; poorGround: boolean; slab: string | null }
  | { kind: "facade"; percent: number; elevated: boolean }
  | { kind: "climate"; zone: number | null; place: string | null; gsfPerTon: number | null; tons: number }
  | { kind: "amps"; loadAmps: number | null; rating: number; ratings: number[] }
  | { kind: "height"; heightFeet: number; limitFeet: number | null; answer: string }
  | { kind: "plan"; answer: string };

/** V-1's bands (LA-784): hydraulic to 35 ft of travel, either to 55 ft, traction past it. */
const ELEVATOR_BANDS: TravelBand[] = [
  { to: HYDRAULIC_MAX_FEET, label: "Hydraulic" },
  { to: TRACTION_MIN_FEET, label: "Either" },
  { to: null, label: "Traction" },
];

/**
 * V-2's reach (LA-1265): a holeless jack to 34 ft on a standard pit, 48 ft on
 * a deep one, in-ground to 60 ft, roped past it. The browser cannot import
 * lib/rom/jack-criterion.ts (it reads the database), so these are its
 * figures, which the test holds to the card's own.
 */
export const JACK_BANDS: TravelBand[] = [
  { to: 34, label: "Holeless" },
  { to: 48, label: "Deep Pit" },
  { to: 60, label: "In-Ground" },
  { to: null, label: "Roped" },
];

type Card = Pick<DerivedAssumption, "code" | "value" | "steps"> & {
  correction?: { value: DerivedAssumption["value"] } | null;
};

const step = (card: Card, label: string) => card.steps.find((s) => s.label.toLowerCase() === label.toLowerCase())?.result ?? null;
/** The first number in a step: "2,251 A at 208Y/120 V" is 2,251. */
const lead = (text: string | null) => {
  const match = text ? /(\d[\d,]*(?:\.\d+)?)/.exec(text) : null;
  return match ? Number(match[1].replace(/,/g, "")) : null;
};

export function heroScene(card: Card): HeroScene | null {
  const value = card.correction?.value ?? card.value;
  const text = value.kind === "spec" ? value.text : null;
  const amount = value.kind === "quantity" ? value.amount : null;

  switch (card.code) {
    case "V-1":
    case "V-2": {
      const travel = step(card, "Travel");
      // "50'-0\" (50.0 ft)": the decimal feet in brackets, else the first number.
      const feet = travel ? Number(/\(([\d.]+) ft\)/.exec(travel)?.[1] ?? lead(travel)) : null;
      if (feet === null || !Number.isFinite(feet) || !text) return null;
      return { kind: "travel", travelFeet: feet, bands: card.code === "V-1" ? ELEVATOR_BANDS : JACK_BANDS, answer: text };
    }
    case "V-3": {
      const cars = lead(step(card, "Elevators"));
      if (cars === null) return null;
      const rooms = text ? (text.trim().toLowerCase() === "none" ? 0 : lead(text)) : lead(step(card, "Machine Rooms"));
      return { kind: "rooms", cars, buildings: lead(step(card, "Buildings")) ?? 1, rooms: rooms ?? 0 };
    }
    case "S-1": {
      if (!text) return null;
      // A corrected system has no coverage of its own to show.
      return {
        kind: "foundation",
        system: text,
        coverage: card.correction ? null : lead(step(card, "Coverage")),
        poorGround: /poor|groundwater/i.test(step(card, "Ground") ?? ""),
        slab: step(card, "Lowest Floor Slab"),
      };
    }
    case "M-0": {
      if (!text) return null;
      const elevated = /^elevated/i.test(text);
      const percent = card.correction ? (elevated ? 29.8 : 19.9) : lead(step(card, "Window to Wall"));
      return percent === null ? null : { kind: "facade", percent, elevated };
    }
    case "M-1": {
      if (amount === null) return null;
      const zoneText = step(card, "Climate Zone");
      const zone = zoneText ? lead(/Zone (\d)/.exec(zoneText)?.[1] ?? null) : null;
      const place = zoneText?.split(",").slice(1).join(",").trim() || null;
      return { kind: "climate", zone, place, gsfPerTon: lead(step(card, "GSF per Ton")), tons: amount };
    }
    case "E-1": {
      if (amount === null) return null;
      return { kind: "amps", loadAmps: lead(step(card, "Service Load")), rating: amount, ratings: [...SERVICE_RATINGS] };
    }
    case "A-1": {
      const height = step(card, "Height");
      const feet = lead(height);
      if (feet === null || !text) return null;
      const limit = height ? /against ([\d,]+) ft/.exec(height)?.[1] : undefined;
      return { kind: "height", heightFeet: feet, limitFeet: limit ? Number(limit.replace(/,/g, "")) : null, answer: text };
    }
    case "A-2":
      return text ? { kind: "plan", answer: text } : null;
    default:
      return null;
  }
}
