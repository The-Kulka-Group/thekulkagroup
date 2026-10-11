import type { DerivedAssumption } from "@kulka/engine";

import { buildingForm, type FormShape, type FormWing, shapeFromText } from "./building-form";
import { STAGE_PARTS, type StagePart } from "./stage-scenes";


// LA-1317: the Design and Engineering stage's building, as plain numbers.
// The stage draws whatever this returns; nothing here knows about 3D. Every
// figure comes from the project's own facts or its Design and Engineering
// cards, so the model shows what the budget assumes and nothing it doesn't.

/** The project facts the stage reads straight off the project record. */
export type StageFacts = {
  grossSquareFeet: number | null;
  stories: number | null;
  unitCount: number | null;
  buildingCount: number;
  parkingType: string | null;
  elevatorCount: number | null;
  belowGrade: boolean;
  balconies: boolean;
  retail: boolean;
  /** LA-2214: the soil answer is yes, "known groundwater or poor soil". Absent reads as good soil. */
  poorSoil?: boolean;
};

/**
 * LA-1318: the same facts from New Budget's answers as they stand, so the
 * stage draws the building while it is still being answered.
 */
export function stageFactsFromResponses(responses: Readonly<Record<string, string | undefined>>): StageFacts {
  const count = (id: string) => {
    const raw = responses[id];
    if (raw === undefined || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  return {
    grossSquareFeet: count("gross_square_feet"),
    stories: count("stories_above_grade"),
    unitCount: count("unit_count"),
    buildingCount: count("building_count") || 1,
    parkingType: responses.parking_type || null,
    elevatorCount: responses.elevator === "yes" ? count("elevator_count") : 0,
    belowGrade: responses.levels_below_grade === "yes",
    balconies: responses.balconies === "yes",
    retail: responses.retail_storefronts === "yes",
    poorSoil: responses.site_conditions === "yes",
  };
}

export type StageLevel ={ kind: "podium" | "frame"; base: number; height: number };

export type StageBuilding = {
  /** The plan's overall extent in feet, the long side along x. */
  width: number;
  depth: number;
  /**
   * LA-1325: the plan as wings, each an extruded rectangle with its own story
   * count. Before A-2 plays it is one block; `shape` and `bayWidth` are null.
   */
  form: { shape: FormShape | null; wings: FormWing[]; bayWidth: number | null };
  levels: StageLevel[];
  height: number;
  podiumLevels: number;
  /** LA-2216: a garage under the podium, from structured parking. A retail podium has none. */
  garage: boolean;
  /** LA-2216: a surface lot beside the building, on a slab on grade. */
  surfaceLot: boolean;
  basement: boolean;
  foundation: { system: string; depth: number };
  /** LA-2214: poor soil swaps the footings for piles. */
  piles: boolean;
  elevators: { cars: number; hydraulic: boolean; jack: string | null; wellDepth: number; rooms: number } | null;
  glazing: "standard" | "elevated";
  balconies: boolean;
  retail: boolean;
  rooftopUnits: number;
  serviceAmps: number | null;
  /** How many identical buildings the job has; the stage draws up to three. */
  buildingCount: number;
};

// The LA-784 floor-to-floor table the elevator cards already use.
const PODIUM_FT = 12;
const FRAME_FT = 10;
const BASEMENT_FT = 10;
/** A multifamily footprint runs about 1.65 to 1 along the street. */
const ASPECT = 1.65;
const TONS_PER_UNIT = 25;

// The stage runs in the browser, so it reads the V-2 and V-3 answers with its
// own copies of those cards' parsers rather than importing their server modules.
const inGround = (jack: string) => /^in[- ]ground/.test(jack.trim().toLowerCase());
function roomsFrom(text: string): number | null {
  if (text.trim().toLowerCase() === "none") return 0;
  const match = /^(\d+)/.exec(text.trim());
  return match ? Number(match[1]) : null;
}

type Card = Pick<DerivedAssumption, "code" | "value" | "steps"> & { correction?: DerivedAssumption["correction"] };

function current(card: Card | undefined) {
  if (!card) return undefined;
  return card.correction?.value ?? card.value;
}
function text(card: Card | undefined): string | null {
  const v = current(card);
  return v && v.kind === "spec" ? v.text : null;
}
function amount(card: Card | undefined): number | null {
  const v = current(card);
  return v && v.kind === "quantity" ? v.amount : null;
}

/** Podium stories: A-1's own step when it has one, else structured parking means one. */
function podiumLevels(facts: StageFacts, a1: Card | undefined, stories: number): number {
  const step = a1?.steps.find((s) => s.label === "Podium Stories");
  const parsed = step ? Number.parseInt(step.result, 10) : Number.NaN;
  const fromCard = Number.isFinite(parsed) ? parsed : text(a1)?.includes("Podium") ? 1 : null;
  const p = fromCard ?? (facts.parkingType === "structured" ? 1 : 0);
  return Math.max(0, Math.min(p, stories - 1));
}

function foundationDepth(system: string, stories: number, piles: boolean): number {
  if (piles || system === "Deep Foundations") return stories >= 7 ? 55 : 40;
  if (system === "Ground Improvement") return 20;
  return 0;
}

export function stageBuilding(facts: StageFacts, cards: readonly Card[]): StageBuilding | null {
  const stories = facts.stories ?? null;
  const gsf = facts.grossSquareFeet ?? null;
  if (!stories || stories < 1 || !gsf || gsf <= 0) return null;
  const by = (code: string) => cards.find((c) => c.code === code);
  const buildings = Math.max(1, facts.buildingCount || 1);

  // LA-1325: A-2's shape, as corrected, when its card has played; a plain block before.
  const a2 = text(by("A-2"));
  const planned = a2 ? buildingForm({ grossSquareFeet: gsf, stories, buildingCount: buildings }, shapeFromText(a2)) : null;
  let width: number, depth: number, form: StageBuilding["form"];
  if (planned) {
    ({ width, depth } = planned);
    form = { shape: planned.shape, wings: planned.wings, bayWidth: planned.bayWidth };
  } else {
    const footprint = gsf / buildings / stories;
    width = Math.sqrt(footprint * ASPECT);
    depth = footprint / width;
    form = { shape: null, wings: [{ x0: -width / 2, x1: width / 2, z0: -depth / 2, z1: depth / 2, stories }], bayWidth: null };
  }

  const podium = podiumLevels(facts, by("A-1"), stories);
  const levels: StageLevel[] = [];
  let base = 0;
  for (let i = 0; i < stories; i++) {
    const kind = i < podium ? "podium" : "frame";
    const height = kind === "podium" ? PODIUM_FT : FRAME_FT;
    levels.push({ kind, base, height });
    base += height;
  }
  const basement = facts.belowGrade || facts.parkingType === "underground";

  const system = text(by("S-1")) ?? "Spread Footings";
  // LA-2214: poor soil, or S-1 landing on deep foundations, puts piles under the building.
  const piles = facts.poorSoil === true || system === "Deep Foundations";

  const cars = facts.elevatorCount ?? 0;
  let elevators: StageBuilding["elevators"] = null;
  if (cars > 0) {
    // The type leads the card's text, so "Hydraulic, 2 Cars" still reads hydraulic.
    const hydraulic = !/^traction/i.test(text(by("V-1")) ?? "");
    const jackText = text(by("V-2"));
    const jack = hydraulic && jackText ? jackText : null;
    const travel = levels[levels.length - 1].base + (basement ? BASEMENT_FT : 0);
    const roomsText = text(by("V-3"));
    const rooms = roomsText ? (roomsFrom(roomsText) ?? 0) : hydraulic ? 1 : 0;
    elevators = {
      cars: Math.min(cars, 4),
      hydraulic,
      jack,
      wellDepth: jack && inGround(jack) ? travel + 6 : 0,
      rooms,
    };
  }

  const glazingText = text(by("M-0")) ?? "";
  const tons = amount(by("M-1"));
  const amps = amount(by("E-1"));

  return {
    width,
    depth,
    form,
    levels,
    height: base,
    podiumLevels: podium,
    garage: podium > 0 && facts.parkingType === "structured",
    surfaceLot: facts.parkingType === "surface",
    basement,
    foundation: { system, depth: foundationDepth(system, stories, piles) },
    piles,
    elevators,
    glazing: glazingText.toLowerCase().startsWith("elevated") ? "elevated" : "standard",
    balconies: facts.balconies,
    retail: facts.retail,
    rooftopUnits: tons ? Math.min(12, Math.max(1, Math.ceil(tons / buildings / TONS_PER_UNIT))) : 0,
    serviceAmps: amps,
    buildingCount: buildings,
  };
}

/** LA-1325: the parts this building has, in assembly order, so the open view lists only what it draws. */
export function partsOf(b: StageBuilding): StagePart[] {
  const has: Record<StagePart, boolean> = {
    site: true,
    foundation: true,
    piles: b.piles,
    basement: b.basement,
    podium: b.podiumLevels > 0,
    massing: true,
    glass: true,
    balconies: b.balconies,
    elevators: b.elevators !== null,
    // LA-2215: the derived type (V-1) picks which the building draws.
    elevatorJack: b.elevators?.hydraulic === true,
    elevatorMachine: b.elevators?.hydraulic === false,
    units: b.rooftopUnits > 0,
    service: b.serviceAmps !== null,
    podiumDeck: b.garage,
    garageElectrical: b.garage,
    garageSprinklers: b.garage,
    garageCoating: b.garage,
    garageWaterproofing: b.garage,
    garageDrySprinklers: b.garage,
    surfaceLot: b.surfaceLot,
  };
  return STAGE_PARTS.filter((p) => has[p]);
}
