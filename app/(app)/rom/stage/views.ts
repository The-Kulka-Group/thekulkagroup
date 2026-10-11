import type { StageLevel } from "@/lib/rom/stage-model";

// LA-2217: the building's two views, as layout the stage applies to whatever
// it draws. Nothing here names a part, so a part added later (piles, a jack,
// a garage) lifts, stretches and cuts away with no code of its own.
//
// - Assembled: the building as built. A ground plane covers everything below
//   grade, and the top floor's front corner is cut away to show the units.
// - Opened: each story lifts a gap above the one below. What is below grade
//   stays put, and anything that runs through the stories (the risers)
//   stretches so it still runs in one line from bottom to top.

/** Feet between two stories once the building is fully open. */
export const OPENED_GAP = 14;

/**
 * The layer an object rests on, from the height of its origin: -1 below
 * grade, then the story it stands in, and one past the top story for the
 * roof and what stands on it.
 */
export function layerOf(y: number, levels: readonly StageLevel[]): number {
  const EPS = 0.01;
  if (y < -EPS) return -1;
  let layer = 0;
  levels.forEach((level, i) => {
    if (y >= level.base - EPS) layer = i;
  });
  const top = levels.length ? levels[levels.length - 1].base + levels[levels.length - 1].height : 0;
  return levels.length && y >= top - EPS ? levels.length : layer;
}

/** How far a layer lifts, in feet, when the view is `opened` of the way open (0 assembled, 1 opened). */
export function liftOf(layer: number, opened: number): number {
  return layer <= 0 ? 0 : layer * OPENED_GAP * opened;
}

type Wing = { x0: number; x1: number; z0: number; z1: number; stories: number };

/** The Assembled view's cut: everything past x and z (toward the viewer) and above y is taken away. */
export type Cutaway = { x: number; z: number; y: number };

/** A story's slab, which the cutaway leaves as the floor the units stand on. */
const SLAB = 1;

/**
 * The top story's front corner, the one the camera looks at (most +x and
 * +z), on the last building along the street (`offsetX`). The bite is about
 * two units wide and reaches the corridor, and stops at the wing's own top
 * story, so a stepped wing cuts at its own height.
 */
export function cutawayOf(wings: readonly Wing[], levels: readonly StageLevel[], offsetX: number): Cutaway | null {
  if (wings.length === 0 || levels.length === 0) return null;
  const front = wings.reduce((best, w) => (w.x1 + w.z1 > best.x1 + best.z1 ? w : best), wings[0]);
  const top = levels[Math.max(0, Math.min(front.stories, levels.length) - 1)];
  return {
    x: offsetX + front.x1 - Math.min(0.4 * (front.x1 - front.x0), 48),
    z: front.z1 - Math.min(0.6 * (front.z1 - front.z0), 44),
    y: top.base + SLAB,
  };
}

export function inCutaway(cut: Cutaway | null, p: { x: number; y: number; z: number }): boolean {
  return cut !== null && p.x > cut.x && p.z > cut.z && p.y > cut.y;
}

/** A wall inside a story, as a box: its size (w along x, h, d along z) and its centre, in the story's own feet. */
export type Partition = { kind: "corridor" | "demising"; w: number; h: number; d: number; x: number; y: number; z: number };

/** Without A-2's bays, a unit is about this wide. */
const UNIT_FT = 28;
/** Half the corridor's width. */
const CORRIDOR = 3;
/** How far in from the outside face the walls stop: the skin's thickness and a little. */
const SKIN = 1.6;
const WALL = 0.6;

/**
 * A story's unit layout in one wing: a double-loaded corridor down the long
 * side and a demising wall every unit, both sides. Inside a whole building
 * they never show; the cutaway is where they read.
 */
export function partitionsOf(wing: Wing, storyHeight: number, bayWidth: number | null): Partition[] {
  const alongX = wing.x1 - wing.x0 >= wing.z1 - wing.z0;
  // Work in the wing's own frame (a along its length, b across it), then turn back.
  const [a0, a1, b0, b1] = alongX ? [wing.x0, wing.x1, wing.z0, wing.z1] : [wing.z0, wing.z1, wing.x0, wing.x1];
  const len = a1 - a0, mid = (b0 + b1) / 2;
  const h = storyHeight - SLAB - 0.4, y = SLAB + h / 2;
  const box = (kind: Partition["kind"], la: number, lb: number, ca: number, cb: number): Partition =>
    alongX ? { kind, w: la, h, d: lb, x: ca, y, z: cb } : { kind, w: lb, h, d: la, x: cb, y, z: ca };
  const walls: Partition[] = [
    box("corridor", len - 2 * SKIN, WALL, (a0 + a1) / 2, mid - CORRIDOR),
    box("corridor", len - 2 * SKIN, WALL, (a0 + a1) / 2, mid + CORRIDOR),
  ];
  const units = Math.max(1, Math.round(len / (bayWidth ?? UNIT_FT)));
  const near = mid - CORRIDOR - (b0 + SKIN), far = b1 - SKIN - (mid + CORRIDOR);
  for (let i = 1; i < units; i++) {
    const at = a0 + (i * len) / units;
    walls.push(box("demising", WALL, near, at, b0 + SKIN + near / 2));
    walls.push(box("demising", WALL, far, at, mid + CORRIDOR + far / 2));
  }
  return walls;
}

/** How long the switch between the views takes. */
export const OPEN_MS = 700;

const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** How open the building is `elapsed` ms into a switch from `from` to `to`; reduced motion is there at once. */
export function openedAt(from: number, to: number, elapsed: number, reduced: boolean): number {
  if (reduced) return to;
  const p = Math.max(0, Math.min(1, elapsed / OPEN_MS));
  return from + (to - from) * inOut(p);
}

/** Where something runs through the stories, from its foot to its head, in feet. */
export type Run = { bottom: number; top: number };

/** The MEP risers: from the podium's top (grade with no podium) to the roof of the tallest story. */
export function risersOf(spec: { levels: readonly StageLevel[]; podiumLevels: number }): Run {
  const topOf = (stories: number) => (stories > 0 ? spec.levels[stories - 1].base + spec.levels[stories - 1].height : 0);
  return { bottom: topOf(Math.min(spec.podiumLevels, spec.levels.length)), top: topOf(spec.levels.length) };
}

/**
 * Where a run stands and how tall it is: its foot rides the layer it starts
 * on and its head the layer it ends on, so opened it still reaches both.
 */
export function stretchOf(run: Run, opened: number, levels: readonly StageLevel[]): { y: number; height: number } {
  const y = run.bottom + liftOf(layerOf(run.bottom, levels), opened);
  const head = run.top + liftOf(layerOf(run.top, levels), opened);
  return { y, height: head - y };
}
