// LA-1325. A-2, Building Form: the plan shape of a new multifamily building,
// as plain rectangles in feet. Local multifamily is rarely one box. It is a
// double-loaded corridor, units either side, folded into an L, a U or a ring
// once the corridor gets too long for one run. The rule is the design pass's
// (docs/precon/criteria/la-1325-building-form.md):
//
// - Each wing is 64 ft deep: two 29 ft units and a 6 ft corridor.
// - The corridor's length is the typical floor plate over that depth.
// - Up to 300 ft it stays a bar. Past it the plate folds into an L, past
//   480 ft a U, past 720 ft a closed courtyard.
// - At five or six stories the front wing steps down a story, at seven or
//   more two stories. The area it gives up goes to every wing's length, so
//   the gross area never changes.
// - The facade reads in 28 ft bays, about one unit wide, around the outside wall.
//
// Nothing here knows about 3D or the database. The stage and the A-2 card
// both read it, and so can an IFC export later: each wing is an extruded
// rectangle with a story count, and the levels come from the stage model.

export type FormShape = "Bar" | "L-Shape" | "U-Shape" | "Courtyard";

export const FORM_SHAPES: readonly FormShape[] = ["Bar", "L-Shape", "U-Shape", "Courtyard"];

/** One wing in plan, in feet, x along the street and +z toward it, with its own story count. */
export type FormWing = { x0: number; z0: number; x1: number; z1: number; stories: number };

export type BuildingForm = {
  shape: FormShape;
  wings: FormWing[];
  /** The plan's overall extent, centred on the origin. */
  width: number;
  depth: number;
  /** The typical floor plate, per building. */
  plateSquareFeet: number;
  /** The corridor length the plate makes as one wing, before any step. */
  corridorFeet: number;
  wingDepth: number;
  /** Stories the front wing drops; zero when nothing steps. */
  stepStories: number;
  bays: number;
  bayWidth: number;
};

export const WING_DEPTH = 64;
export const BAY_WIDTH = 28;
/** The corridor lengths past which the plate folds into each shape. */
export const FOLD_AT = { "L-Shape": 300, "U-Shape": 480, Courtyard: 720 } as const;
/** The shortest corridor each shape can hold with a court at least 40 ft across. */
const FITS_FROM: Record<FormShape, number> = { Bar: 0, "L-Shape": 160, "U-Shape": 390, Courtyard: 570 };
/** A plate shorter than this has no corridor to speak of, so it draws as a block. */
const BLOCK_UNDER = WING_DEPTH * 1.5;
/** A block runs about 1.65 to 1 along the street, the stage's old footprint. */
const BLOCK_ASPECT = 1.65;

/** Each shape's wings as shares of the corridor, the stepped (front) wing first. */
const SHARES: Record<Exclude<FormShape, "Bar">, number[]> = {
  "L-Shape": [0.58, 0.42],
  "U-Shape": [0.28, 0.44, 0.28],
  Courtyard: [0.3, 0.2, 0.3, 0.2],
};

export function shapeFromText(text: string): FormShape | null {
  const lower = text.trim().toLowerCase();
  return FORM_SHAPES.find((shape) => lower.startsWith(shape.toLowerCase())) ?? null;
}

/** The shape a corridor of this length folds into. */
export function shapeFor(corridorFeet: number): FormShape {
  if (corridorFeet > FOLD_AT.Courtyard) return "Courtyard";
  if (corridorFeet > FOLD_AT["U-Shape"]) return "U-Shape";
  if (corridorFeet > FOLD_AT["L-Shape"]) return "L-Shape";
  return "Bar";
}

/** Wings laid out from the corridor's lengths, x0 and z0 at zero; the front wing runs along the far z edge. */
function layout(shape: FormShape, lengths: number[], d: number): Omit<FormWing, "stories">[] {
  if (shape === "L-Shape") {
    const [front, back] = lengths;
    // The front wing runs the full width; the right wing goes back from its end.
    return [
      { x0: 0, x1: front, z0: back, z1: back + d },
      { x0: front - d, x1: front, z0: 0, z1: back },
    ];
  }
  if (shape === "U-Shape") {
    const [arm, base] = lengths;
    // The base runs down the right side; the arms reach left along the front and back.
    return [
      { x0: 0, x1: arm, z0: base - d, z1: base },
      { x0: arm, x1: arm + d, z0: 0, z1: base },
      { x0: 0, x1: arm, z0: 0, z1: d },
    ];
  }
  if (shape === "Courtyard") {
    const [long, short] = lengths;
    return [
      { x0: 0, x1: long, z0: short + d, z1: short + 2 * d },
      { x0: long - d, x1: long, z0: d, z1: d + short },
      { x0: 0, x1: long, z0: 0, z1: d },
      { x0: 0, x1: d, z0: d, z1: d + short },
    ];
  }
  return [{ x0: 0, x1: lengths[0], z0: 0, z1: d }];
}

/** The outside wall's length: every wing's edges, less the walls two wings share. */
export function perimeterOf(wings: readonly Omit<FormWing, "stories">[]): number {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  let total = wings.reduce((sum, w) => sum + 2 * (w.x1 - w.x0) + 2 * (w.z1 - w.z0), 0);
  for (let i = 0; i < wings.length; i++) {
    for (let j = i + 1; j < wings.length; j++) {
      const a = wings[i], b = wings[j];
      if (near(a.x1, b.x0) || near(a.x0, b.x1)) total -= 2 * overlap(a.z0, a.z1, b.z0, b.z1);
      if (near(a.z1, b.z0) || near(a.z0, b.z1)) total -= 2 * overlap(a.x0, a.x1, b.x0, b.x1);
    }
  }
  return total;
}

export function buildingForm(
  input: { grossSquareFeet: number; stories: number; buildingCount: number | null },
  corrected?: FormShape | null,
): BuildingForm | null {
  const { grossSquareFeet, stories } = input;
  if (!(stories >= 1) || !(grossSquareFeet > 0)) return null;
  const buildings = input.buildingCount && input.buildingCount > 0 ? input.buildingCount : 1;
  const perBuilding = grossSquareFeet / buildings;
  const plate = perBuilding / stories;
  const d = WING_DEPTH;
  const corridor = plate / d;

  let rects: Omit<FormWing, "stories">[];
  let storiesOf: number[];
  let shape: FormShape;
  let step = 0;
  if (corridor < BLOCK_UNDER) {
    shape = "Bar";
    const w = Math.sqrt(plate * BLOCK_ASPECT);
    rects = [{ x0: 0, x1: w, z0: 0, z1: plate / w }];
    storiesOf = [stories];
  } else {
    // A corrected shape the plate cannot hold draws as the largest one it can.
    const wanted = corrected ?? shapeFor(corridor);
    shape = FORM_SHAPES.slice(0, FORM_SHAPES.indexOf(wanted) + 1).filter((one) => corridor >= FITS_FROM[one]).at(-1) ?? "Bar";
    if (shape === "Bar") {
      rects = layout("Bar", [corridor], d);
      storiesOf = [stories];
    } else {
      const shares = SHARES[shape];
      step = stories >= 7 ? 2 : stories >= 5 ? 1 : 0;
      storiesOf = shares.map((_, i) => (i === 0 ? stories - step : stories));
      // The stepped wing gives up area, so every wing runs longer to keep the gross.
      const length = perBuilding / (d * shares.reduce((sum, share, i) => sum + share * storiesOf[i], 0));
      rects = layout(shape, shares.map((share) => share * length), d);
    }
  }

  const minX = Math.min(...rects.map((r) => r.x0)), maxX = Math.max(...rects.map((r) => r.x1));
  const minZ = Math.min(...rects.map((r) => r.z0)), maxZ = Math.max(...rects.map((r) => r.z1));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const wings = rects.map((r, i) => ({ x0: r.x0 - cx, x1: r.x1 - cx, z0: r.z0 - cz, z1: r.z1 - cz, stories: storiesOf[i] }));

  return {
    shape,
    wings,
    width: maxX - minX,
    depth: maxZ - minZ,
    plateSquareFeet: plate,
    corridorFeet: corridor,
    wingDepth: d,
    stepStories: step,
    bays: Math.round(perimeterOf(rects) / BAY_WIDTH),
    bayWidth: BAY_WIDTH,
  };
}
