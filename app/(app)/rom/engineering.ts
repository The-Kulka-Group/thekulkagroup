import type { DerivedAssumption, DerivedValue } from "@kulka/engine";

import { FORM_SHAPES } from "@/lib/rom/building-form";
import { SERVICE_RATINGS } from "@/lib/rom/engineering-tables";

// LA-1265, LA-1318. What the page needs to show a Design and Engineering
// criterion that the code, not the page, decided: its answer as text, the
// answers the estimator can pick instead, and the facts a picked answer sets
// for the live budget. The rules themselves live server-side
// (lib/rom/elevator-criterion.ts, lib/rom/jack-criterion.ts and the rest).

/** The answers a spec criterion offers. A criterion not listed takes free text in the panel. */
export const CRITERION_CHOICES: Record<string, readonly string[]> = {
  "V-1": ["Hydraulic", "Traction"],
  "V-2": ["In-Ground", "Holeless", "Roped"],
  "M-0": ["Standard Glazing Band", "Elevated Glazing Band"],
  "S-1": ["Spread Footings", "Mat Foundation", "Deep Foundations", "Ground Improvement"],
  // LA-1325: the stage redraws a picked shape, or the largest one the plate can hold.
  "A-2": FORM_SHAPES,
};

/** A value as the card and its choices show it: "Hydraulic", "2,500 A Service", "189 Tons". */
export function valueText(value: DerivedValue): string {
  return value.kind === "spec" ? value.text : `${value.amount.toLocaleString("en-US")} ${value.unit}`;
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
