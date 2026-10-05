import type { DerivedInput, DerivedStep } from "@kulka/engine";

// LA-1662. The client's words for seven criterion reasons and three steps
// and inputs, approved one by one by Matt on 2026-10-05. The engine writes them on every new run. A
// criterion stored before then (a saved row, a published snapshot) keeps its
// old words, so `currentWording` rewrites those as they are read: the budget
// page, its PDF and the estimator's screen all say the same.

const COUNTS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const count = (n: number) => COUNTS[n] ?? String(n);

export const E1_AMENITY = "Amenity space isn't measured yet, so the budget prices the common area at club rates with no pool or sauna equipment.";
export const E1_ELEVATOR = "Elevator motors use 40 HP until the elevator vendor's numbers come in.";
export const E1_MOTOR_INPUT = "40 HP Per Car [Placeholder]";

export const M0_MIXED = "Nothing in the code or the project facts sets window area, so the budget uses the standard glazing band.";

export const m1Prototype = (zone: number) =>
  `The tonnage comes from the Department of Energy's code-minimum prototype for Zone ${zone}, not a load calculation for this building. The prototype fits a new building with no garage and the same ventilation.`;

export const S1_NO_REPORT = "There is no geotechnical report yet, so the budget assumes adequate ground conditions and no rock removal.";
export const S1_GROUND_STEP = "Adequate Ground, No Rock Removal [Assumed]";
/** The rock flag a footing on grade carries. S1_NO_REPORT already says the budget prices no rock removal. */
export const S1_ROCK_ON_GRADE = "Rock is possible in this area, so footings and trenches may need rock excavation.";

export const v1EitherBand = (travelFeet: number, lowFeet: number, highFeet: number) =>
  `Hydraulic and traction elevators are both common between ${lowFeet} and ${highFeet} ft of travel, and this building has approximately ${Math.round(travelFeet)} ft. The budget assumes hydraulic, the less expensive option, until additional details are provided.`;
export const V1_BAND_STEP = "Hydraulic [Either Works, Less Expensive]";

export const v2WellHole = (travelFeet: number) =>
  `Both jack types work at approximately ${Math.round(travelFeet)} ft. The budget prices the well hole and casing in case the ground is wet.`;
export const V2_ROCK = "Confidence is low because shallow rock is possible in this area.";

export const v3SharedRoom = (cars: number) =>
  `The ${count(cars)} hydraulic cars share one machine room at the lowest landing, conditioned to the maker's range as IBC 3005.2 requires.`;
export const v3SeparateCores = (cars: number) => `Separate elevator cores would need ${count(cars)} rooms.`;
export const V3_TRACTION = "A traction elevator would need no machine room.";

/** The words runs stored before LA-1662, after `publicWording` or before it. */
const STORED = {
  e1Amenity: "Amenity space and equipment are not measured, so the common area is priced at the clubs rate and pool or sauna equipment is left out.",
  e1Elevator: "Elevator motors carry a 40 HP placeholder until the elevator vendor's data replaces it.",
  e1Motor: "40 HP per car, a placeholder",
  m0: "No code or intake fact measures window area directly; balconies and storefronts point different ways, so the standard band is used.",
  m1: /^New construction in a stated climate zone, with no garage in the area and ventilation within the (?:model|prototype); the ratio is DOE's code-minimum (?:model|prototype), not a load calculation for this building\.$/,
  s1: "There is no geotechnical report yet. Ground conditions are not known, so ground improvement or deep foundations may still be needed.",
  s1Ground: "Not known, priced as good ground",
  v1: /Travel of ([\d.]+) ft sits inside the either band \(over (\d+) ft, up to (\d+) ft\), where hydraulic and traction are both common\. (?:Nothing is set up to choose between the two, so V-1 proposes Hydraulic, the cheaper type|No Jev client is configured, so V-1 proposes Hydraulic without calling Jev)\./,
  v1Band: /^Either(?:; nothing set up to choose, so| -- no Jev client configured, proposing) Hydraulic$/,
  v2: /Travel of ([\d.]+) ft works either way, and nobody has said whether the ground is wet, so V-2 prices the well hole to be safe\./,
  v2Rock: "This ZIP can hit shallow rock, and the intake does not ask about rock, so confidence is low.",
  v3Shared: "Hydraulic cars share one machine room per bank at the lowest landing (Otis, Schindler), conditioned to the maker's range (IBC 3005.2).",
  v3Cores: /With (\d+) cars in a building, separate cores would double the rooms\./,
  v3Traction: "V-1 could still flip to traction, which has no machine room.",
};

type Worded = { code: string; confidenceReason: string; steps: readonly DerivedStep[]; inputs: readonly DerivedInput[] };

function reason(code: string, text: string, steps: readonly DerivedStep[]): string {
  switch (code) {
    case "E-1":
      return text.replace(STORED.e1Amenity, E1_AMENITY).replace(STORED.e1Elevator, E1_ELEVATOR);
    case "M-0":
      return text.replace(STORED.m0, M0_MIXED);
    case "M-1": {
      const zone = steps.find((s) => s.label === "Climate Zone")?.result.match(/^Zone (\d+)/);
      return zone && STORED.m1.test(text) ? m1Prototype(Number(zone[1])) : text;
    }
    case "S-1":
      return text.includes(STORED.s1) ? text.replace(STORED.s1, S1_NO_REPORT).replace(` ${S1_ROCK_ON_GRADE}`, "") : text;
    case "V-1":
      return text.replace(STORED.v1, (_all, travel: string, low: string, high: string) => v1EitherBand(Number(travel), Number(low), Number(high)));
    case "V-2":
      return text.replace(STORED.v2, (_all, travel: string) => v2WellHole(Number(travel))).replace(STORED.v2Rock, V2_ROCK);
    case "V-3": {
      const cores = text.match(STORED.v3Cores);
      const cars = cores ? Number(cores[1]) : null;
      return (cars === null ? text : text.replace(STORED.v3Shared, v3SharedRoom(cars)).replace(STORED.v3Cores, v3SeparateCores(cars))).replace(
        STORED.v3Traction,
        V3_TRACTION,
      );
    }
    default:
      return text;
  }
}

function step(code: string, s: DerivedStep): DerivedStep {
  if (code === "S-1" && s.label === "Ground" && s.result === STORED.s1Ground) return { ...s, result: S1_GROUND_STEP };
  if (code === "V-1" && s.label === "Band" && STORED.v1Band.test(s.result)) return { ...s, result: V1_BAND_STEP };
  return s;
}

function input(code: string, i: DerivedInput): DerivedInput {
  return code === "E-1" && i.name === "Elevator Motor" && i.value === STORED.e1Motor ? { ...i, value: E1_MOTOR_INPUT } : i;
}

/** A stored criterion in the approved words. A criterion written since LA-1662 comes back unchanged. */
export function currentWording<T extends Worded>(a: T): T {
  return {
    ...a,
    confidenceReason: reason(a.code, a.confidenceReason, a.steps),
    steps: a.steps.map((s) => step(a.code, s)),
    inputs: a.inputs.map((i) => input(a.code, i)),
  };
}
