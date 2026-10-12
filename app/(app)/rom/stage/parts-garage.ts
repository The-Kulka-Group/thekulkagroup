import * as THREE from "three";

import type { StageBuilding } from "@/lib/rom/stage-model";
import type { StagePart } from "@/lib/rom/stage-scenes";

import type { PartState } from "./build-model";

// LA-2216 (spec LA-2209): the parking answer, drawn. A podium garage draws
// its deck, its traffic coating and perimeter waterproofing, and the garage
// electrical, sprinklers and dry sprinkler valve seen through its openings.
// A surface lot draws striped parking behind the building. build-model.ts
// only calls this and wires what it returns; every mesh carries its part's
// tag, so picking, fading and the dashed unpriced edge follow.

type Wing = StageBuilding["form"]["wings"][number];

/** The helpers build-model.ts builds a part with. */
export type GarageTools = {
  tinted: (part: StagePart, color: number, roughness: number) => THREE.MeshStandardMaterial;
  mesh: (geos: THREE.BufferGeometry[], mat: THREE.Material, parent: THREE.Object3D, cast?: boolean, poche?: "dark" | "light" | null) => THREE.Mesh;
  tag: <T extends THREE.Object3D>(obj: T, part: StagePart) => T;
  addBox: (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => void;
  applyTint: (part: StagePart, tint: number) => void;
};

export type GarageBuilt = {
  appliers: Partial<Record<StagePart, (s: PartState) => void>>;
  anchors: Partial<Record<StagePart, THREE.Vector3>>;
};

const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const DECK = 0xcfcac0;
const COATING = 0x8f9aa6;
const MEMBRANE = 0x3d3f45;
const CONDUIT = 0x6a6f78;
/** daylight.css --ink: a neutral darker than the conduit, since red means a blown deadline (LA-2209 review J2). */
const SPRINKLER = 0x323338;
const ASPHALT = 0x5c5b57;
const STRIPE = 0xffffff;

/** Grows each group up from its own base as the part arrives, then settles it from blue. */
function rise(tools: GarageTools, part: StagePart, groups: THREE.Object3D[]) {
  return ({ arrive, tint }: PartState) => {
    for (const g of groups) {
      g.visible = arrive > 0.001;
      g.scale.y = Math.max(0.0001, outCubic(arrive));
    }
    tools.applyTint(part, tint);
  };
}

/**
 * The podium garage under every building: `roots` are the buildings' groups,
 * `topOf(w)` the top of a wing's podium in feet.
 */
export function buildGarage(
  tools: GarageTools,
  spec: StageBuilding,
  roots: readonly { root: THREE.Group; ox: number }[],
  topOf: (w: Wing) => number,
): GarageBuilt {
  const { tinted, mesh, tag, addBox } = tools;
  const deckMat = tinted("podiumDeck", DECK, 0.95);
  const coatingMat = tinted("garageCoating", COATING, 0.7);
  const membraneMat = tinted("garageWaterproofing", MEMBRANE, 0.9);
  const conduitMat = tinted("garageElectrical", CONDUIT, 0.6);
  const sprinklerMat = tinted("garageSprinklers", SPRINKLER, 0.6);
  const dryMat = tinted("garageDrySprinklers", SPRINKLER, 0.6);
  const groups: Partial<Record<StagePart, THREE.Group[]>> = {};
  const anchors: GarageBuilt["anchors"] = {};
  const group = (part: StagePart, root: THREE.Group) => {
    const g = tag(new THREE.Group(), part);
    root.add(g);
    (groups[part] ??= []).push(g);
    return g;
  };

  roots.forEach(({ root, ox }, bi) => {
    const deck: THREE.BufferGeometry[] = [];
    const coating: THREE.BufferGeometry[] = [];
    const membrane: THREE.BufferGeometry[] = [];
    for (const w of spec.form.wings) {
      const ww = w.x1 - w.x0, wd = w.z1 - w.z0, cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
      const top = topOf(w);
      if (top <= 0) continue;
      // The deck: a structural slab over the garage, its edge proud of the piers.
      addBox(deck, ww + 1.2, 1.4, wd + 1.2, cx, top - 0.7, cz);
      // The garage floor's traffic coating, its edge showing in the openings.
      addBox(coating, ww - 1, 0.3, wd - 1, cx, 0.15, cz);
      // Perimeter waterproofing: a dark band at the foot of every podium face.
      addBox(membrane, ww + 0.6, 2, 0.3, cx, 1, w.z1 + 0.15);
      addBox(membrane, ww + 0.6, 2, 0.3, cx, 1, w.z0 - 0.15);
      addBox(membrane, 0.3, 2, wd + 0.6, w.x1 + 0.15, 1, cz);
      addBox(membrane, 0.3, 2, wd + 0.6, w.x0 - 0.15, 1, cz);
    }
    if (deck.length > 0) mesh(deck, deckMat, group("podiumDeck", root));
    if (coating.length > 0) mesh(coating, coatingMat, group("garageCoating", root), false, null);
    if (membrane.length > 0) mesh(membrane, membraneMat, group("garageWaterproofing", root), false, null);

    // The garage's systems, along the front opening of the first wing, under the band.
    const w = spec.form.wings[0];
    const top = topOf(w);
    if (top <= 0) return;
    const ww = w.x1 - w.x0, cx = (w.x0 + w.x1) / 2, front = w.z1 - 1;
    const conduit: THREE.BufferGeometry[] = [];
    addBox(conduit, ww * 0.8, 0.4, 0.4, cx, top - 3.6, front);
    addBox(conduit, 3, 6, 0.8, w.x0 + 6, 4, front);
    mesh(conduit, conduitMat, group("garageElectrical", root), false, null);
    const pipe: THREE.BufferGeometry[] = [];
    addBox(pipe, ww * 0.85, 0.5, 0.5, cx, top - 3.1, front + 0.3);
    for (let x = w.x0 + 8; x < w.x1 - 8; x += 10) addBox(pipe, 0.3, 1, 0.3, x, top - 3.8, front + 0.3);
    mesh(pipe, sprinklerMat, group("garageSprinklers", root), false, null);
    const dry: THREE.BufferGeometry[] = [];
    addBox(dry, 0.6, top - 3.4, 0.6, w.x1 - 6, (top - 3.4) / 2, front + 0.3);
    addBox(dry, 2, 3, 1, w.x1 - 6, 3, front + 0.4);
    mesh(dry, dryMat, group("garageDrySprinklers", root), false, null);

    if (bi === 0) {
      anchors.podiumDeck = new THREE.Vector3(ox + cx, top, w.z1);
      anchors.garageCoating = new THREE.Vector3(ox + cx, 0.3, w.z1);
      anchors.garageWaterproofing = new THREE.Vector3(ox + cx, 1, w.z1 + 0.3);
      anchors.garageElectrical = new THREE.Vector3(ox + w.x0 + 6, 4, front);
      anchors.garageSprinklers = new THREE.Vector3(ox + cx, top - 3.1, front);
      anchors.garageDrySprinklers = new THREE.Vector3(ox + w.x1 - 6, 3, front);
    }
  });

  const appliers: GarageBuilt["appliers"] = {};
  for (const [part, gs] of Object.entries(groups) as [StagePart, THREE.Group[]][]) appliers[part] = rise(tools, part, gs);
  return { appliers, anchors };
}

/**
 * A surface lot behind the first building: an asphalt pad with two rows of
 * striped stalls either side of an aisle. The building stands on its slab on
 * grade, which the podium's grade beam already draws.
 */
export function buildSurfaceLot(
  tools: GarageTools,
  content: THREE.Group,
  at: { x: number; z: number; width: number },
): GarageBuilt {
  const { tinted, mesh, tag, addBox } = tools;
  const lot = tag(new THREE.Group(), "surfaceLot");
  lot.position.set(at.x, 0, at.z);
  content.add(lot);
  const width = Math.max(60, Math.min(at.width, 220));
  const depth = 54;
  const pad: THREE.BufferGeometry[] = [];
  addBox(pad, width, 0.3, depth, 0, 0.15, -depth / 2);
  mesh(pad, tinted("surfaceLot", ASPHALT, 0.95), lot, false, null);
  const stripes: THREE.BufferGeometry[] = [];
  for (let x = -width / 2 + 4; x <= width / 2 - 4; x += 9) {
    addBox(stripes, 0.5, 0.05, 18, x, 0.33, -10);
    addBox(stripes, 0.5, 0.05, 18, x, 0.33, -depth + 10);
  }
  mesh(stripes, tinted("surfaceLot", STRIPE, 0.6), lot, false, null);
  return {
    appliers: { surfaceLot: rise(tools, "surfaceLot", [lot]) },
    anchors: { surfaceLot: new THREE.Vector3(at.x, 1, at.z - depth / 2) },
  };
}
