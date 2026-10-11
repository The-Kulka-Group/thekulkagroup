// LA-2214: the piles under the building. Poor soil swaps the spread footings
// for these (the "piles" part); build-model.ts only imports this and wires it.
// The layout is plain numbers so it can be tested without a renderer.

/** Pile radius in feet. */
export const PILE_RADIUS = 0.9;
/** The structural slab that stands in for the footing band when piles carry the building. */
export const PILE_SLAB_THICKNESS = 1;

/**
 * Where the piles go in plan: under the front and right walls, which every
 * shape builds solid, where the section cut shows them. `W` and `D` are the
 * plan's overall extent and `hw`, `hd` its half extents.
 */
export function pileSpots(W: number, D: number, hw: number, hd: number): { x: number; z: number }[] {
  const spots: { x: number; z: number }[] = [];
  const nx = Math.max(4, Math.round(W / 20));
  const nz = Math.max(3, Math.round(D / 22));
  for (let i = 0; i < nx; i++) spots.push({ x: -hw + 12 + i * ((W - 24) / (nx - 1)), z: hd - 3.5 });
  for (let i = 1; i < nz; i++) spots.push({ x: hw - 3.5, z: hd - 3.5 - i * ((D - 20) / (nz - 1)) });
  return spots;
}
