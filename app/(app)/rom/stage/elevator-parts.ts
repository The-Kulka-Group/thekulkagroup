// LA-2215: the two things the derived elevator type (V-1) draws that the
// shaft and bulkhead do not. A hydraulic elevator shows its jack running
// below grade. A traction elevator shows its machine at the top of the
// hoistway. This module only says where the boxes go; build-model.ts turns
// them into meshes, tags them with the part and tints them.

/** One box: size, then centre, in feet, relative to the group that holds it. */
export type PartBox = { w: number; h: number; d: number; x: number; y: number; z: number };

/** How deep a jack runs when the job's jack type gives no well hole (V-2): a pit for the cylinder. */
export const PIT_FEET = 7;

/**
 * The hydraulic jack, below grade: a pit slab, the cylinder casing and a collar
 * at grade, from grade (y = 0) down. `wellDepth` is the in-ground
 * well V-2 sets; with none the jack sits in a shallow pit.
 */
export function jackBoxes(wellDepth: number): PartBox[] {
  const depth = Math.max(PIT_FEET, wellDepth);
  return [
    { w: 9, h: 1.2, d: 9, x: 0, y: -depth + 0.6, z: 0 },
    { w: 3.4, h: depth - 1.2, d: 3.4, x: 0, y: -(depth - 1.2) / 2, z: 0 },
    { w: 6, h: 0.6, d: 6, x: 0, y: -0.3, z: 0 },
  ];
}

/**
 * The traction machine, at the top of the hoistway: a machine bed on the
 * bulkhead roof, the machine on it and the sheave beside it. `long` is the
 * bulkhead's length along its run.
 */
export function machineBoxes(long: number, alongX: boolean): PartBox[] {
  const at = (along: number, y: number, w: number, h: number, d: number): PartBox =>
    alongX ? { w, h, d, x: along, y, z: 0 } : { w: d, h, d: w, x: 0, y, z: along };
  return [
    at(0, 0.5, Math.min(long - 4, 14), 1, 8),
    at(-1.5, 3, 6, 4, 5),
    at(3, 3.4, 2.4, 4.8, 2.4),
  ];
}
