import {
  type Answers,
  type DerivedAssumption,
  type DerivedInput,
  type DerivedStep,
  effectiveValue,
  validateDerivedAssumption,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { deleteDerivedAssumption, listDerivedAssumptions, saveDerivedAssumption } from "./derived-assumptions";

// LA-1269. V-3, Elevator Machine Rooms: how many elevator machine rooms or
// control spaces need their own HVAC, so item 26g (Machine Room HVAC) prices
// per room. Matt, 2026-09-28: "I shouldn't be answering the machine room
// question, this should be answered by design/engineering." The rule is the
// research's (docs/precon/research/la-elevator-machine-rooms.md, Section 6):
//
// - Hydraulic: every maker sizes one machine room per group of cars at the
//   lowest landing (Otis 2010 up to four cars in one room; Schindler 330A two
//   or more power units in a common room), so one room per building, cars in
//   one bank. IBC 3005.2 (the same in the 2020 and 2025 NYS codes and the
//   2022 NYC code) requires independent ventilation or air conditioning, and
//   New York's 1% cooling design temperatures (84 to 90°F) sit at the 90°F
//   ceiling the makers state, so the room needs cooling and ventilation.
// - Traction: machine-room-less at this building size, with the controller on
//   the hoistway wall, in a door jamb or in a closet. Those run on building
//   air (Wisconsin DSPS 2023), so no room of its own to condition.
//
// Code does the arithmetic; nothing here calls Jev.

export const V3_CODE = "V-3";
export const V3_LABEL = "Elevator Machine Rooms";
/** Item 26g, Machine Room HVAC (the Elevator element, LA-1257). */
export const MACHINE_ROOM_HVAC_COST_CODE = "26g";
export const V3_COST_CODES = [MACHINE_ROOM_HVAC_COST_CODE];

/** "None", "1 Machine Room", "2 Machine Rooms": the card's answer and the estimator's choices. */
export function machineRoomsText(count: number): string {
  if (count <= 0) return "None";
  return `${count} Machine Room${count === 1 ? "" : "s"}`;
}

/** The count an answer names: "None" is zero, "2 Machine Rooms" is two. */
export function machineRoomsCount(text: string): number | null {
  if (text.trim().toLowerCase() === "none") return 0;
  const match = /^(\d+)/.exec(text.trim());
  return match ? Number(match[1]) : null;
}

/**
 * NYC ZIP prefixes: Manhattan (100 to 102), Staten Island (103), the Bronx
 * (104), Brooklyn (112) and Queens (111, 113, 114, 116). The 110 prefix is
 * shared with Nassau, so only Queens's own 110 codes count.
 */
const NYC_ZIP3 = new Set(["100", "101", "102", "103", "104", "111", "112", "113", "114", "116"]);
const NYC_110 = new Set(["11004", "11005"]);

export function inNewYorkCity(zip: string | null): boolean {
  if (!zip) return false;
  return NYC_ZIP3.has(zip.slice(0, 3)) || NYC_110.has(zip);
}

export type MachineRoomFacts = {
  elevatorType: "hydraulic" | "traction";
  /** Whether V-1 stands firm: high confidence, or an estimator set it. */
  typeSettled: boolean;
  elevatorCount: number;
  buildingCount: number | null;
  /** V-2's answer as the engine reads it, when the job is hydraulic. */
  jackType: "in_ground" | "holeless" | "roped" | null;
  zip: string | null;
};

const JACK_WORDS = { in_ground: "In-Ground", holeless: "Holeless", roped: "Roped" } as const;

export function deriveMachineRooms(facts: MachineRoomFacts): DerivedAssumption {
  const buildings = facts.buildingCount && facts.buildingCount > 0 ? facts.buildingCount : null;
  const nyc = inNewYorkCity(facts.zip);
  const hydraulic = facts.elevatorType === "hydraulic";

  const inputs: DerivedInput[] = [
    {
      name: "Elevator Type",
      value: `${hydraulic ? "Hydraulic" : "Traction"} (V-1)`,
      basis: facts.typeSettled ? "stated" : "assumed",
    },
    { name: "Elevator Count", value: String(facts.elevatorCount), basis: "stated" },
    { name: "Building Count", value: buildings ? String(buildings) : "Not answered, one assumed", basis: buildings ? "stated" : "assumed" },
  ];
  if (facts.jackType) inputs.push({ name: "Jack Type", value: `${JACK_WORDS[facts.jackType]} (V-2)`, basis: "stated" });
  if (facts.zip) inputs.push({ name: "ZIP", value: `${facts.zip}${nyc ? ", New York City" : ""}`, basis: "stated" });

  const perBuilding = Math.ceil(facts.elevatorCount / (buildings ?? 1));
  let rooms: number;
  let hvac: string;
  let confident: boolean;
  let reason: string;
  if (hydraulic) {
    rooms = Math.min(facts.elevatorCount, buildings ?? 1);
    hvac = "Cooling and Ventilation";
    // The rule is firmest when nothing could split or remove the room: NYC
    // bars a hydraulic machine or controller in the hoistway (Appendix K), and
    // an in-ground or roped jack is past every roomless hydraulic's reach.
    const roomCertain = nyc || facts.jackType === "in_ground" || facts.jackType === "roped";
    confident = roomCertain && perBuilding === 1 && facts.typeSettled && buildings !== null;
    reason = confident
      ? `One hydraulic car per building, each with its own machine room at the lowest landing, conditioned to the maker's 55 to 90°F (IBC 3005.2).`
      : [
          "Hydraulic cars share one machine room per bank at the lowest landing (Otis, Schindler), conditioned to the maker's range (IBC 3005.2).",
          perBuilding > 1 ? `With ${perBuilding} cars in a building, separate cores would double the rooms.` : "",
          !facts.typeSettled ? "V-1 could still flip to traction, which has no machine room." : "",
          !roomCertain ? "A holeless jack under 34 ft can go roomless outside NYC." : "",
          buildings === null ? "Building count is not answered, so one is assumed." : "",
        ]
          .filter(Boolean)
          .join(" ");
  } else {
    rooms = 0;
    hvac = "None";
    confident = false;
    reason = nyc
      ? "Machine-room-less traction keeps its controller in the hoistway or a closet; NYC's corridor clearance rules may push it into a closet that needs air, so confidence is low."
      : "Machine-room-less traction keeps its controller on the hoistway wall, in a door jamb or a closet, on building air (Wisconsin DSPS 2023). A strict reading of IBC 3005.2 could still ask for air there, so confidence is low.";
  }

  const steps: DerivedStep[] = [
    { label: "Elevator Type", result: hydraulic ? "Hydraulic" : "Traction, machine-room-less" },
    { label: "Elevators", result: String(facts.elevatorCount) },
    { label: "Buildings", result: String(buildings ?? 1) },
    { label: "Machine Rooms", result: hydraulic ? `${rooms} (one per building, cars in one bank)` : "0 (controller in the hoistway)" },
    { label: "HVAC", result: hvac },
  ];

  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: V3_CODE,
    label: V3_LABEL,
    value: { kind: "spec", text: machineRoomsText(rooms) },
    method: "Machine rooms by elevator type, count and building (docs/precon/research/la-elevator-machine-rooms.md).",
    inputs,
    steps,
    confidence: confident ? "high" : "low",
    confidenceReason: reason,
    costCodes: V3_COST_CODES,
    correction: null,
  };
  validateDerivedAssumption(assumption);
  return assumption;
}

/**
 * Derives V-3 after V-1 (and V-2), saves it, and returns `answers` with the
 * two facts the engine reads: `elevatorMachineRooms`, the count item 26g
 * multiplies by, and `elevatorMachineRoomHvac`, which brings 26g in only when
 * there is a room to condition. Removed when the job has no elevator yet.
 */
export async function applyMachineRoomCriterion(db: Db, projectId: string, answers: Answers): Promise<Answers> {
  const gate = answers.branchGates?.elevator ?? answers.facts?.elevator;
  const type = answers.facts?.elevatorType;
  const count = answers.facts?.elevatorCount;
  if (gate !== "yes" || (type !== "hydraulic" && type !== "traction") || typeof count !== "number" || count <= 0) {
    await deleteDerivedAssumption(db, projectId, V3_CODE);
    return answers;
  }

  const v1 = (await listDerivedAssumptions(db, projectId)).find((one) => one.code === "V-1");
  const rawBuildings = answers.facts?.buildingCount;
  const rawZip = answers.facts?.zip;
  const jack = answers.facts?.hydraulicJackType;
  const assumption = deriveMachineRooms({
    elevatorType: type,
    typeSettled: v1 ? v1.correction !== null || v1.confidence === "high" : false,
    elevatorCount: count,
    buildingCount: typeof rawBuildings === "number" ? rawBuildings : null,
    jackType: jack === "in_ground" || jack === "holeless" || jack === "roped" ? jack : null,
    zip: typeof rawZip === "string" ? rawZip : null,
  });

  const stored = await saveDerivedAssumption(db, projectId, assumption, { model: "engine-rule" });
  const value = effectiveValue(stored);
  const rooms = value.kind === "spec" ? machineRoomsCount(value.text) : null;
  if (rooms === null) return answers;
  return {
    ...answers,
    facts: { ...answers.facts, elevatorMachineRooms: rooms, elevatorMachineRoomHvac: rooms > 0 ? "yes" : "no" },
  };
}
