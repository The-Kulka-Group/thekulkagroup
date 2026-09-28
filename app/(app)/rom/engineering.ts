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

/** The fact the engine reads for a picked answer, so the live budget prices by it. */
export function factFor(code: string, text: string): { name: string; value: string } | null {
  const lower = text.toLowerCase();
  if (code === "V-1") return { name: "elevatorType", value: lower.startsWith("traction") ? "traction" : "hydraulic" };
  if (code === "V-2") {
    if (lower.startsWith("in-ground")) return { name: "hydraulicJackType", value: "in_ground" };
    if (lower.startsWith("holeless")) return { name: "hydraulicJackType", value: "holeless" };
    if (lower.startsWith("roped")) return { name: "hydraulicJackType", value: "roped" };
  }
  return null;
}
