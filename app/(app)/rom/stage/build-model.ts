import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { StageBuilding } from "@/lib/rom/stage-model";
import { STAGE_PARTS, type StagePart } from "@/lib/rom/stage-scenes";

import { PILE_RADIUS, PILE_SLAB_THICKNESS, pileSpots } from "./parts-piles";
import { type Cutaway, cutawayOf, inCutaway, layerOf, liftOf, partitionsOf, type Run, risersOf, stretchOf } from "./views";

// LA-1317, LA-1318: the Design and Engineering stage's 3D model. A white
// architectural model of the project's building, sitting on a site base that
// is cut open through the building so the foundation shows against a black
// section face. Everything is sized in feet from StageBuilding.
//
// One renderer lives as long as the stage. The building itself rebuilds
// whenever its facts change (New Budget changes them answer by answer), and
// each part of it (foundation, podium, floors, glass, elevators, rooftop
// units, service) is posed on its own: `arrive` brings it in, `tint` settles
// it from blue to the model's own colour. The saved budget's assembly is the
// same parts on one timeline (assemblyStates).
//
// LA-1325: the building is A-2's wings, each with its own story count, so an
// L, a U or a courtyard steps and reads in 28 ft facade bays. The camera is
// axonometric (orthographic). In the open view it orbits and zooms, a plan
// or section cut shows the solids black where they are cut, and a part under
// the pointer lights and can be picked.

/** A part's pose: arrive 0 is hidden and 1 is in place; tint 0 is blue and 1 is settled. */
export type PartState = { arrive: number; tint: number };
export type PartStates = Partial<Record<StagePart, PartState>>;

/** LA-1325: no cut, a plan cut through one level (0 is the ground floor), or a section a share of the way across. */
export type StageCut = { kind: "none" } | { kind: "plan"; level: number } | { kind: "section"; at: number };

export type StageController = {
  setBuilding: (spec: StageBuilding) => void;
  setParts: (states: PartStates) => void;
  /** How far the camera has turned, 0 to 1. The assembly turns it; New Budget holds it at 1. */
  setDrift: (drift: number) => void;
  /** Moves the camera toward its framing. True while it is still moving. */
  tick: (seconds: number) => boolean;
  render: () => void;
  resize: (width: number, height: number) => void;
  /** Where a part sits on screen, in CSS pixels from the canvas's top-left. */
  pointOf: (part: StagePart) => { x: number; y: number } | null;
  /** LA-1325: turns the view by radians around and up, on top of its framing. */
  orbit: (around: number, up: number) => void;
  /** LA-1325: above 1 is closer. */
  zoom: (factor: number) => void;
  resetView: () => void;
  setCut: (cut: StageCut) => void;
  /** LA-1325: the part under a point in CSS pixels from the canvas's top-left, ignoring what a cut has removed. */
  pick: (x: number, y: number) => StagePart | null;
  /** LA-1325: lights these parts blue until set again. */
  setHighlight: (parts: readonly StagePart[]) => void;
  /** LA-2211: fades every part but this one, so a picked part reads against the rest. Null shows them all. */
  setFocus: (part: StagePart | null) => void;
  /** LA-2211: draws these parts faint, edged in a dashed working orange: nothing prices them. */
  setUnpriced: (parts: readonly StagePart[]) => void;
  /**
   * LA-2217: how open the building is, 0 Assembled (a ground plane over what
   * is below grade, the top floor's corner cut away) to 1 Opened (the stories
   * lifted apart, the risers running through them). Any part, drawn now or
   * added later, follows by where it rests; nothing here names a part.
   */
  setOpened: (opened: number) => void;
  /** LA-2213: lights these parts blue by `amount`, 0 to 1, over any highlight. The stage sweeps it up and back once per answer. */
  setPulse: (parts: readonly StagePart[], amount: number) => void;
  /** LA-1325: CSS pixels at the top and bottom that controls cover, so the building frames between them. */
  setInsets: (top: number, bottom: number) => void;
  dispose: () => void;
};

const BLUE = new THREE.Color(0x0073ea);
/** daylight.css --working, the colour of what is not priced yet. */
const WORKING = 0xff9500;
/** How much of a part shows while another part is picked, and while nothing prices it. */
const FADED = 0.12;
const UNPRICED_FILL = 0.4;
/** LA-2217: how much the Assembled view's ground plane hides of what is below grade. */
const GROUND = 0.8;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const outBack = (p: number) => 1 + 2.5 * Math.pow(p - 1, 3) + 1.5 * Math.pow(p - 1, 2);
const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
/** A part's own stagger: item i of n takes its turn inside the part's arrive. */
const staggered = (arrive: number, i: number, n: number, step = 0.35) =>
  n <= 1 ? arrive : clamp(arrive * (1 + (n - 1) * step) - i * step);

type Box = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => void;
const addBox: Box = (arr, w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  arr.push(g);
};

type Wing = StageBuilding["form"]["wings"][number];
const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

/** What is left of the span a0 to a1 once the cut intervals are taken out. */
function remaining(a0: number, a1: number, cuts: [number, number][]): [number, number][] {
  let spans: [number, number][] = [[a0, a1]];
  for (const [c0, c1] of cuts) {
    spans = spans.flatMap(([s0, s1]): [number, number][] =>
      c1 <= s0 || c0 >= s1 ? [[s0, s1]] : ([[s0, c0], [c1, s1]] as [number, number][]).filter(([x0, x1]) => x1 - x0 > 0.5),
    );
  }
  return spans;
}

/** The site depth and framing the camera needs, from the building alone. */
function siteDepthOf(spec: StageBuilding): number {
  const below = spec.basement ? 10 : 0;
  // Only as deep as what the cut holds (a spread footing needs little), so a
  // shallow job is not left sitting on a band of empty black.
  const holds = Math.max(spec.foundation.depth + below, spec.elevators?.wellDepth ?? 0, below + 4);
  return Math.max(18, holds + 10);
}

/**
 * The saved budget's assembly: each part's window on one timeline, piles
 * first and the service last, and the seconds until it has all settled.
 */
export function assemblyPlan(spec: StageBuilding): { windows: Record<StagePart, [number, number]>; duration: number } {
  const frames = spec.levels.filter((l) => l.kind === "frame").length;
  const piles = spec.foundation.depth > 0 ? 1.1 : 0.5;
  const massingStart = 0.2 + piles + 0.6;
  const massingEnd = massingStart + Math.max(0.6, frames * 0.2 + 0.5);
  const windows: Record<StagePart, [number, number]> = {
    // LA-2211: the ground is there from the start; nothing builds it.
    site: [0, 0.2],
    foundation: [0.2, 0.2 + piles],
    piles: [0.2, 0.2 + piles],
    basement: [0.2 + piles - 0.2, 0.2 + piles + 0.3],
    podium: [0.2 + piles, massingStart],
    massing: [massingStart, massingEnd],
    glass: [massingEnd - 0.3, massingEnd + 0.5],
    balconies: [massingEnd - 0.1, massingEnd + 0.5],
    elevators: [massingEnd, massingEnd + 0.5],
    units: [massingEnd + 0.15, massingEnd + 0.65],
    service: [massingEnd + 0.3, massingEnd + 0.8],
  };
  return { windows, duration: massingEnd + 0.8 + 0.6 };
}

/** Every part's pose at t seconds into the saved budget's assembly. */
export function assemblyStates(spec: StageBuilding, t: number): PartStates {
  const { windows } = assemblyPlan(spec);
  const states: PartStates = {};
  for (const part of STAGE_PARTS) {
    const [start, end] = windows[part];
    states[part] = { arrive: clamp((t - start) / (end - start)), tint: outCubic(clamp((t - end - 0.1) / 0.45)) };
  }
  return states;
}

export function createStage(
  canvas: HTMLCanvasElement,
  opts: {
    occlusion: boolean;
    pixelRatio: number;
    /** LA-1318: New Budget's caption sits top left, so the building frames right of it. */
    captionRoom?: boolean;
  },
): StageController {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(opts.pixelRatio);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NeutralToneMapping;
  // LA-2217: the Assembled view's corner cutaway clips materials one by one.
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  // Neutral tone mapping tops out below white, so the background is set over-bright to land on it.
  scene.background = new THREE.Color(6, 6, 6);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.32;

  const M = {
    inner: new THREE.MeshStandardMaterial({ color: 0xeeede9, roughness: 1 }),
    opening: new THREE.MeshStandardMaterial({ color: 0x9a9892, roughness: 1 }),
    site: new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.95 }),
    cut: new THREE.MeshStandardMaterial({ color: 0x1c1b19, roughness: 1 }),
    fan: new THREE.MeshStandardMaterial({ color: 0x6b6a64, roughness: 0.8 }),
    // LA-1325: what a cut shows. Walls, slabs and ground cut black, the way a
    // drawn section does; a room's volume cuts a light gray.
    poche: new THREE.MeshBasicMaterial({ color: 0x1c1b19, side: THREE.BackSide }),
    pocheLight: new THREE.MeshBasicMaterial({ color: 0xd9d6ce, side: THREE.BackSide }),
    // LA-2217: the unit walls the cutaway shows, the risers, and the ground
    // plane the Assembled view lays over what is below grade.
    partition: new THREE.MeshStandardMaterial({ color: 0xfbfaf7, roughness: 0.9 }),
    riser: new THREE.MeshStandardMaterial({ color: 0x5f7d99, roughness: 0.5, metalness: 0.2 }),
    ground: new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.95, transparent: true, opacity: GROUND, depthWrite: false }),
  };
  const lasting: { dispose: () => void }[] = [env, pmrem, ...Object.values(M)];

  // Light: a daylight sun and soft fill. Its shadow box follows the building.
  const sun = new THREE.DirectionalLight(0xffffff, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.8;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe4dfd3, 0.3));

  // Camera: axonometric at a three-quarter view from above, framed on the
  // building's box so the whole of it fits whatever the canvas's shape.
  const DISTANCE = 6000;
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 20000);
  const cam = {
    box: new THREE.Box3(),
    goal: new THREE.Box3(),
    drift: 1,
    set: false,
    aspect: 16 / 9,
    height: 1,
    insetTop: 0,
    insetBottom: 0,
    around: 0,
    up: 0,
    zoom: 1,
  };
  // New Budget's caption sits top left, so the view slides the building right and down.
  const slide = opts.captionRoom ? { x: -0.2, y: 0.12 } : { x: 0, y: 0 };
  const corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  const place = () => {
    const az = 0.6 + 0.09 * inOut(clamp(cam.drift)) + cam.around;
    const el = Math.max(0.06, Math.min(1.5, 0.5 + cam.up));
    const center = cam.box.getCenter(new THREE.Vector3());
    const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.position.copy(center).addScaledVector(dir, DISTANCE);
    camera.lookAt(center);
    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    const upward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    const { min, max } = cam.box;
    let hx = 0, hy = 0;
    corners.forEach((c, i) => {
      c.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(center);
      hx = Math.max(hx, Math.abs(c.dot(right)));
      hy = Math.max(hy, Math.abs(c.dot(upward)));
    });
    const room = 1 + Math.max(Math.abs(slide.x), Math.abs(slide.y));
    // The share of the canvas's height the controls leave clear.
    const clear = Math.max(0.35, 1 - (cam.insetTop + cam.insetBottom) / cam.height);
    const halfH = (Math.max(hy / clear, hx / cam.aspect) * 1.22 * room) / cam.zoom;
    const halfW = halfH * cam.aspect;
    const lift = ((cam.insetTop - cam.insetBottom) / cam.height) * halfH;
    camera.position.addScaledVector(right, slide.x * halfW).addScaledVector(upward, slide.y * halfH + lift);
    Object.assign(camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  if (opts.occlusion) {
    const ao = new GTAOPass(scene, camera, 800, 400);
    ao.updateGtaoMaterial({ radius: 5, distanceExponent: 1.4, thickness: 2.5, scale: 1.25, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    composer.addPass(ao);
  }
  composer.addPass(new OutputPass());

  // --- The building, rebuilt whenever its facts change ---
  let content = new THREE.Group();
  scene.add(content);
  let built: { disposables: { dispose: () => void }[] } = { disposables: [] };
  let appliers: Partial<Record<StagePart, (s: PartState) => void>> = {};
  let anchors: Partial<Record<StagePart, THREE.Vector3>> = {};
  let glows: Partial<Record<StagePart, (THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial)[]>> = {};
  let current: PartStates = {};
  let lit = new Set<StagePart>();
  let focus: StagePart | null = null;
  let unpriced = new Set<StagePart>();
  let pulsed = new Set<StagePart>();
  let pulseAmount = 0;
  // LA-2211: see-through copies of the building's materials, made as a fade
  // first needs them and dropped with the building.
  let see: Map<THREE.Material, THREE.Material>[] = [new Map(), new Map()];
  let outlines: THREE.LineSegments[] = [];
  const dash = new THREE.LineDashedMaterial({ color: WORKING, dashSize: 2.4, gapSize: 1.6 });
  const dashFaded = new THREE.LineDashedMaterial({ color: WORKING, dashSize: 2.4, gapSize: 1.6, transparent: true, opacity: 0.3 });
  lasting.push(dash, dashFaded);
  let spec: StageBuilding | null = null;
  let span = 0;
  const cutPlane = new THREE.Plane();
  let cut: StageCut = { kind: "none" };
  // LA-2217: the two views. Every object straight under a building (or the
  // scene) rests on a layer and lifts with it; an object with a run stretches
  // across the layers it spans.
  let opened = 0;
  let layered: { obj: THREE.Object3D; layer: number }[] = [];
  let runs: { obj: THREE.Object3D; run: Run }[] = [];
  let lifted = new Map<THREE.Object3D, number>();
  let ground: THREE.Mesh | null = null;
  let cutaway: Cutaway | null = null;
  let goalTop = 0;
  const cornerPlanes = [new THREE.Plane(), new THREE.Plane(), new THREE.Plane()];
  let cornerCopies = new Map<THREE.Material, THREE.Material>();

  function build(next: StageBuilding) {
    spec = next;
    scene.remove(content);
    built.disposables.forEach((d) => d.dispose());
    dropLooks();
    content = new THREE.Group();
    scene.add(content);
    const disposables: { dispose: () => void }[] = [];
    built = { disposables };
    const tints: Partial<Record<StagePart, { mat: THREE.MeshStandardMaterial; base: THREE.Color }[]>> = {};
    const nextGlows: typeof glows = {};
    const nextAnchors: typeof anchors = {};
    const nextAppliers: typeof appliers = {};

    /** A material of the part's own, which it tints from blue to `color` as it settles. */
    const tinted = (part: StagePart, color: number, roughness: number) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness });
      disposables.push(mat);
      (tints[part] ??= []).push({ mat, base: new THREE.Color(color) });
      (nextGlows[part] ??= []).push(mat);
      return mat;
    };
    const glassMat = (part: StagePart) => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x8cbcf0, roughness: 0.06, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05,
        envMapIntensity: 1.8, transparent: true, opacity: 0,
      });
      disposables.push(mat);
      (nextGlows[part] ??= []).push(mat);
      return mat;
    };
    /** Merged boxes as one mesh, with a black (or light) inside that only a cut shows. */
    const mesh = (geos: THREE.BufferGeometry[], mat: THREE.Material, parent: THREE.Object3D, cast = true, poche: "dark" | "light" | null = "dark") => {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      parent.add(m);
      disposables.push(m.geometry);
      geos.forEach((g) => g.dispose());
      if (poche) {
        const inside = new THREE.Mesh(m.geometry, poche === "dark" ? M.poche : M.pocheLight);
        inside.userData.poche = true;
        m.add(inside);
      }
      return m;
    };
    const applyTint = (part: StagePart, tint: number) => {
      for (const { mat, base } of tints[part] ?? []) mat.color.copy(BLUE).lerp(base, outCubic(clamp(tint)));
    };
    const tag = <T extends THREE.Object3D>(obj: T, part: StagePart): T => {
      obj.userData.part = part;
      return obj;
    };

    const { form, levels } = next;
    const W = next.width, D = next.depth, hw = W / 2, hd = D / 2;
    const count = Math.min(3, next.buildingCount);
    const gap = 40;
    span = count * W + (count - 1) * gap;
    const offsets = Array.from({ length: count }, (_, i) => -span / 2 + hw + i * (W + gap));
    const lastX = offsets[offsets.length - 1];
    const zCut = hd - 7;
    const xCut = lastX + hw - 7;
    const below = next.basement ? 10 : 0;
    const siteDepth = siteDepthOf(next);
    const SX0 = -span / 2 - Math.max(80, W * 0.6);
    const SZ0 = -hd - Math.max(70, D * 0.8);
    const P = next.podiumLevels;
    const topOf = (stories: number) => (stories > 0 ? levels[stories - 1].base + levels[stories - 1].height : 0);
    const podiumTop = topOf(P);
    const wingTop = (w: Wing) => topOf(Math.min(w.stories, levels.length));
    const tallest = form.wings.reduce((best, w) => (w.stories > best.stories ? w : best), form.wings[0]);
    // A wing's long side, the way its corridor runs.
    const alongX = (w: Wing) => w.x1 - w.x0 >= w.z1 - w.z0;
    const bay = form.bayWidth;
    /** Window columns along a face: three to a bay once A-2 sets the bays. */
    const colsFor = (len: number) => (bay ? Math.max(1, Math.round(len / bay)) * 3 : Math.max(3, Math.round(len / 11.25)));

    // Site base, cut along two planes through the last building.
    {
      const top: THREE.BufferGeometry[] = [];
      addBox(top, xCut - SX0, siteDepth, zCut - SZ0, (SX0 + xCut) / 2, -siteDepth / 2, (SZ0 + zCut) / 2);
      tag(mesh(top, M.site, content, false), "site");
      const faces: THREE.BufferGeometry[] = [];
      addBox(faces, 0.4, siteDepth - 0.3, zCut - SZ0, xCut + 0.21, -siteDepth / 2, (SZ0 + zCut) / 2);
      addBox(faces, xCut - SX0, siteDepth - 0.3, 0.4, (SX0 + xCut) / 2, -siteDepth / 2, zCut + 0.21);
      tag(mesh(faces, M.cut, content, false, null), "site");
      nextAnchors.site = new THREE.Vector3(SX0 + 30, 0, zCut - 20);
      // LA-2217: the ground plane, closing the cut over what is below grade
      // out to the building line. Nothing picks it, so a pile under it still picks.
      const lid: THREE.BufferGeometry[] = [];
      const edgeX = lastX + hw, edgeZ = hd;
      for (const [x0, x1, z0, z1] of [[xCut, edgeX, SZ0, edgeZ], [SX0, xCut, zCut, edgeZ]]) {
        const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
        g.rotateX(-Math.PI / 2);
        g.translate((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
        lid.push(g);
      }
      ground = mesh(lid, M.ground, content, false, null);
      ground.raycast = () => {};
      ground.userData.ground = true;
    }

    // The service at grade, out in front of the first building's corner (E-1).
    if (next.serviceAmps) {
      const service = tag(new THREE.Group(), "service");
      const sx = offsets[0] - hw - 34, sz = hd - 14;
      service.position.set(sx, 0, sz);
      const s: THREE.BufferGeometry[] = [];
      addBox(s, 14, 0.8, 9, 0, 0.4, 0);
      addBox(s, 10, 7, 4.5, 0, 4.3, 0);
      mesh(s, tinted("service", 0xffffff, 0.9), service);
      content.add(service);
      nextAnchors.service = new THREE.Vector3(sx, 6, sz);
      nextAppliers.service = ({ arrive, tint }) => {
        service.visible = arrive > 0.001;
        service.scale.y = Math.max(0.0001, arrive < 1 ? outBack(arrive) : 1);
        applyTint("service", tint);
      };
    }

    const floorsAll: { g: THREE.Group; base: number }[][] = [];
    const glassAll: { pane: THREE.Mesh; mat: THREE.MeshPhysicalMaterial }[][] = [];
    const balconiesAll: { g: THREE.Group; axis: "x" | "z" }[][] = [];
    const pilesAll: THREE.Mesh[][] = [];
    const footings: THREE.Mesh[] = [];
    const podiums: THREE.Group[] = [];
    const basements: THREE.Mesh[] = [];
    const roofs: THREE.Group[] = [];
    const bulkheads: THREE.Group[] = [];
    const unitGroups: THREE.Group[] = [];

    const skinMat = tinted("massing", 0xffffff, 0.9);
    const slabMat = tinted("massing", 0xffffff, 0.8);
    const podiumMat = tinted("podium", 0xe4e1d9, 0.95);
    // Cast-in-place gray, darker than the podium, so the basement reads as below grade.
    const concreteMat = tinted("basement", 0xa9a59b, 1);
    const footingMat = tinted("foundation", 0xd9d6ce, 1);
    const pileMat = tinted("piles", 0xffffff, 0.6);
    const balconyMat = tinted("balconies", 0xffffff, 0.8);
    const bulkheadMat = tinted("elevators", 0xffffff, 0.9);
    const unitMat = tinted("units", 0xffffff, 0.9);
    const storefront = glassMat("podium");
    storefront.opacity = 1;

    offsets.forEach((ox, bi) => {
      const root = new THREE.Group();
      root.position.x = ox;
      // LA-2217: what this building holds lifts layer by layer in the Opened view.
      root.userData.building = true;
      content.add(root);
      const exposed = bi === count - 1;
      const foundationTop = -below - 1.6;

      // Below grade: a basement level under every wing, and the foundation, both seen in the cut.
      if (below) {
        const b: THREE.BufferGeometry[] = [];
        for (const w of form.wings) addBox(b, w.x1 - w.x0, below, w.z1 - w.z0, (w.x0 + w.x1) / 2, below / 2, (w.z0 + w.z1) / 2);
        const m = tag(mesh(b, concreteMat, root), "basement");
        m.position.y = -below;
        basements.push(m);
      }
      const piles: THREE.Mesh[] = [];
      if (exposed) {
        // Spread footings or a mat: a thick concrete band under every wing, in the cut.
        // LA-2214: with piles carrying the building it thins to a structural slab on top of them.
        const f: THREE.BufferGeometry[] = [];
        const t = next.piles ? PILE_SLAB_THICKNESS : next.foundation.system === "Mat Foundation" ? 4 : 2.5;
        for (const w of form.wings) addBox(f, w.x1 - w.x0 + 2, t, w.z1 - w.z0 + 2, (w.x0 + w.x1) / 2, t / 2, (w.z0 + w.z1) / 2);
        const m = tag(mesh(f, footingMat, root), "foundation");
        m.position.y = foundationTop - t;
        footings.push(m);
        nextAnchors.foundation = new THREE.Vector3(ox + hw * 0.6, foundationTop - t / 2, hd);
        if (next.piles) {
          const geo = new THREE.CylinderGeometry(PILE_RADIUS, PILE_RADIUS, next.foundation.depth, 14);
          geo.translate(0, -next.foundation.depth / 2, 0);
          disposables.push(geo);
          for (const { x, z } of pileSpots(W, D, hw, hd)) {
            const p = tag(new THREE.Mesh(geo, pileMat), "piles");
            p.position.set(x, foundationTop - t, z);
            p.castShadow = true;
            root.add(p);
            piles.push(p);
          }
          nextAnchors.piles = new THREE.Vector3(ox + hw * 0.6, foundationTop - t - next.foundation.depth * 0.45, hd);
        }
      }
      pilesAll.push(piles);
      if (exposed && below) nextAnchors.basement = new THREE.Vector3(ox + hw * 0.5, -below / 2, hd);

      // Podium levels: recessed openings (garage or storefront) between piers, on every wing.
      const podium = tag(new THREE.Group(), "podium");
      root.add(podium);
      {
        const beam: THREE.BufferGeometry[] = [];
        for (const w of form.wings) addBox(beam, w.x1 - w.x0, 1.6, w.z1 - w.z0, (w.x0 + w.x1) / 2, -0.8, (w.z0 + w.z1) / 2);
        mesh(beam, podiumMat, podium);
        if (P > 0) {
          const core: THREE.BufferGeometry[] = [];
          const parts: THREE.BufferGeometry[] = [];
          // A stepped wing can have fewer stories than the podium (a concrete
          // building stepped down two), so each wing's podium stops at its own top.
          const bands = (along: "x" | "z", a0: number, len: number, at: number, levelsUp: number, top: number) => {
            const bays = Math.max(2, Math.round(len / 20)), bw = len / bays;
            for (let i = 0; i <= bays; i++) {
              const edge = i === 0 || i === bays;
              const p = a0 + i * bw + (i === 0 ? 1.5 : i === bays ? -1.5 : 0);
              if (along === "x") addBox(parts, edge ? 3 : 2.4, top, 1.6, p, top / 2, at);
              else addBox(parts, 1.6, top, edge ? 3 : 2.4, at, top / 2, p);
            }
            for (let l = 0; l < levelsUp; l++) {
              const band = levels[l].base + levels[l].height;
              if (along === "x") addBox(parts, len, 3, 1.6, a0 + len / 2, band - 1.5, at);
              else addBox(parts, 1.6, 3, len, at, band - 1.5, a0 + len / 2);
            }
          };
          for (const w of form.wings) {
            const ww = w.x1 - w.x0, wd = w.z1 - w.z0;
            const levelsUp = Math.min(P, w.stories), top = topOf(levelsUp);
            addBox(core, ww - 3, top, wd - 3, (w.x0 + w.x1) / 2, top / 2, (w.z0 + w.z1) / 2);
            bands("x", w.x0, ww, w.z1 - 0.8, levelsUp, top);
            bands("x", w.x0, ww, w.z0 + 0.8, levelsUp, top);
            bands("z", w.z0, wd, w.x1 - 0.8, levelsUp, top);
            bands("z", w.z0, wd, w.x0 + 0.8, levelsUp, top);
          }
          mesh(core, next.retail ? storefront : M.opening, podium, false, next.retail ? null : "light");
          mesh(parts, podiumMat, podium);
          if (bi === 0) nextAnchors.podium = new THREE.Vector3(ox, podiumTop / 2, hd);
        }
      }
      podiums.push(podium);

      // Frame floors: piers and bands around recessed glass, and balconies,
      // one group a level holding every wing that reaches it.
      const floors: { g: THREE.Group; base: number }[] = [];
      const glass: { pane: THREE.Mesh; mat: THREE.MeshPhysicalMaterial }[] = [];
      const balconies: { g: THREE.Group; axis: "x" | "z" }[] = [];
      const big = next.glazing === "elevated";
      levels.forEach((lv, li) => {
        if (lv.kind !== "frame") return;
        const reaching = form.wings.filter((w) => li < w.stories);
        if (reaching.length === 0) return;
        const g = tag(new THREE.Group(), "massing");
        const slab: THREE.BufferGeometry[] = [], skin: THREE.BufferGeometry[] = [], panes: THREE.BufferGeometry[] = [], inner: THREE.BufferGeometry[] = [];
        const walls: THREE.BufferGeometry[] = [];
        const T = 1.4, h = lv.height, wh = big ? 7.2 : 6.4, sill = big ? 1.6 : 2.2, head = 1 + sill + wh, pier = big ? 2.2 : 3;
        /** A wall running along x at z, facing s (+1 faces +z), from x0 for len. */
        const faceX = (x0: number, len: number, z: number, s: number) => {
          const cols = colsFor(len), pitch = len / cols, ww = pitch - pier;
          addBox(skin, len, sill, T, x0 + len / 2, 1 + sill / 2, z - (s * T) / 2);
          addBox(skin, len, h - head, T, x0 + len / 2, head + (h - head) / 2, z - (s * T) / 2);
          for (let c = 0; c <= cols; c++) addBox(skin, pier, wh, T, x0 + c * pitch + (c === 0 ? pier / 2 : c === cols ? -pier / 2 : 0), 1 + sill + wh / 2, z - (s * T) / 2);
          for (let c = 0; c < cols; c++) addBox(panes, ww, wh, 0.3, x0 + pitch * (c + 0.5), 1 + sill + wh / 2, z - s * (T + 0.15));
          // A-2's bays: a pilaster standing proud of the wall every 28 ft or so.
          if (bay) for (let c = 3; c < cols; c += 3) addBox(skin, 2.4, h - 1, 1.6, x0 + c * pitch, 1 + (h - 1) / 2, z + s * 0.3);
        };
        const faceZ = (z0: number, len: number, x: number, s: number) => {
          const cols = colsFor(len), pitch = len / cols, ww = pitch - pier;
          addBox(skin, T, sill, len, x - (s * T) / 2, 1 + sill / 2, z0 + len / 2);
          addBox(skin, T, h - head, len, x - (s * T) / 2, head + (h - head) / 2, z0 + len / 2);
          for (let c = 0; c <= cols; c++) addBox(skin, T, wh, pier, x - (s * T) / 2, 1 + sill + wh / 2, z0 + c * pitch + (c === 0 ? pier / 2 : c === cols ? -pier / 2 : 0));
          for (let c = 0; c < cols; c++) addBox(panes, 0.3, wh, ww, x - s * (T + 0.15), 1 + sill + wh / 2, z0 + pitch * (c + 0.5));
          if (bay) for (let c = 3; c < cols; c += 3) addBox(skin, 1.6, h - 1, 2.4, x + s * 0.3, 1 + (h - 1) / 2, z0 + c * pitch);
        };
        for (const w of reaching) {
          const ww = w.x1 - w.x0, wd = w.z1 - w.z0, cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
          addBox(slab, ww + 1.6, 1, wd + 1.6, cx, 0.5, cz);
          faceX(w.x0, ww, w.z1, 1);
          faceX(w.x0, ww, w.z0, -1);
          faceZ(w.z0, wd, w.x1, 1);
          faceZ(w.z0, wd, w.x0, -1);
          addBox(inner, ww - 2 * T - 0.8, h - 1, wd - 2 * T - 0.8, cx, 1 + (h - 1) / 2, cz);
          // LA-2217: a wing's top story holds its unit walls, for the Assembled view's cutaway.
          if (li === Math.min(w.stories, levels.length) - 1) {
            for (const p of partitionsOf(w, h, bay)) addBox(walls, p.w, p.h, p.d, p.x, p.y, p.z);
          }
          if (next.balconies) {
            // On the wing's outward long face, built out from the wall so they
            // can grow outward when they arrive.
            const x = alongX(w);
            const len = x ? ww : wd;
            const s = x ? (cz >= 0 ? 1 : -1) : cx >= 0 ? 1 : -1;
            const bg = tag(new THREE.Group(), "balconies");
            if (x) bg.position.z = s > 0 ? w.z1 : w.z0;
            else bg.position.x = s > 0 ? w.x1 : w.x0;
            const bal: THREE.BufferGeometry[] = [];
            const a0 = x ? w.x0 : w.z0;
            const cols = colsFor(len), pitch = len / cols;
            const at = (p: number, wide: number, tall: number, deep: number, px: number, py: number, out: number) =>
              x ? addBox(bal, wide, tall, deep, a0 + p + px, py, s * out) : addBox(bal, deep, tall, wide, s * out, py, a0 + p + px);
            // With bays, one on the middle window of every other bay; before
            // A-2, one every third column as LA-1317 drew them.
            for (let c = 1; c < cols; c += bay ? 6 : 3) {
              const p = bay ? pitch * (c + 0.5) : pitch * (c + 1);
              const bw = pitch * 1.6;
              at(p, bw, 0.7, 5.5, 0, 1.35, 2.75);
              at(p, bw, 0.25, 0.25, 0, 4.6, 5.4);
              at(p, 0.25, 3.2, 0.25, -bw / 2 + 0.2, 3.1, 5.4);
              at(p, 0.25, 3.2, 0.25, bw / 2 - 0.2, 3.1, 5.4);
            }
            if (bal.length) mesh(bal, balconyMat, bg);
            g.add(bg);
            balconies.push({ g: bg, axis: x ? "z" : "x" });
          }
        }
        mesh(slab, slabMat, g);
        mesh(skin, skinMat, g);
        mesh(inner, M.inner, g, false, "light");
        if (walls.length) mesh(walls, M.partition, g, false).userData.keep = true;
        const pane = glassMat("glass");
        const paneMesh = tag(mesh(panes, pane, g, false, null), "glass");
        paneMesh.visible = false;
        glass.push({ pane: paneMesh, mat: pane });
        g.position.y = lv.base;
        root.add(g);
        floors.push({ g, base: lv.base });
      });
      floorsAll.push(floors);
      glassAll.push(glass);
      balconiesAll.push(balconies);

      // Roofs: each wing's parapet lands with its top floor, except along a
      // wall it shares with a wing as tall or taller. The bulkhead and
      // rooftop units are their own parts.
      for (const w of form.wings) {
        const ww = w.x1 - w.x0, wd = w.z1 - w.z0, cx = (w.x0 + w.x1) / 2, cz = (w.z0 + w.z1) / 2;
        const roof = tag(new THREE.Group(), "massing");
        roof.position.set(cx, wingTop(w), cz);
        const r: THREE.BufferGeometry[] = [];
        addBox(r, ww + 1.4, 1, wd + 1.4, 0, 0.5, 0);
        const others = form.wings.filter((v) => v !== w && v.stories >= w.stories);
        const along = (edge: "front" | "back" | "right" | "left"): [number, number][] =>
          others.flatMap((v): [number, number][] => {
            if (edge === "front" && near(v.z0, w.z1)) return [[v.x0, v.x1]];
            if (edge === "back" && near(v.z1, w.z0)) return [[v.x0, v.x1]];
            if (edge === "right" && near(v.x0, w.x1)) return [[v.z0, v.z1]];
            if (edge === "left" && near(v.x1, w.x0)) return [[v.z0, v.z1]];
            return [];
          });
        for (const [a, b] of remaining(w.x0 - 0.7, w.x1 + 0.7, along("front"))) addBox(r, b - a, 3, 1, (a + b) / 2 - cx, 2.5, wd / 2 + 0.2);
        for (const [a, b] of remaining(w.x0 - 0.7, w.x1 + 0.7, along("back"))) addBox(r, b - a, 3, 1, (a + b) / 2 - cx, 2.5, -wd / 2 - 0.2);
        for (const [a, b] of remaining(w.z0 - 0.7, w.z1 + 0.7, along("right"))) addBox(r, 1, 3, b - a, ww / 2 + 0.2, 2.5, (a + b) / 2 - cz);
        for (const [a, b] of remaining(w.z0 - 0.7, w.z1 + 0.7, along("left"))) addBox(r, 1, 3, b - a, -ww / 2 - 0.2, 2.5, (a + b) / 2 - cz);
        mesh(r, skinMat, roof);
        root.add(roof);
        roofs.push(roof);
      }

      if (next.elevators) {
        // On the tallest wing, running along it.
        const w = tallest, x = alongX(w);
        const ww = w.x1 - w.x0, wd = w.z1 - w.z0;
        const bulk = tag(new THREE.Group(), "elevators");
        const bx = (w.x0 + w.x1) / 2 + (x ? ww * 0.18 : -wd * 0.08);
        const bz = (w.z0 + w.z1) / 2 + (x ? -wd * 0.08 : ww * 0.18);
        bulk.position.set(bx, wingTop(w) + 1, bz);
        const b: THREE.BufferGeometry[] = [];
        const long = 10 + next.elevators.cars * 8;
        addBox(b, x ? long : 18, 11, x ? 18 : long, 0, 5.5, 0);
        mesh(b, bulkheadMat, bulk);
        root.add(bulk);
        bulkheads.push(bulk);
        if (bi === 0) nextAnchors.elevators = new THREE.Vector3(ox + bx, wingTop(w) + 10, bz);
      }
      {
        // LA-2217: the MEP risers, a bundle in the tallest wing's front units,
        // close enough to the face that the Opened view's gaps show them, from
        // the podium's top to the roof. A unit tall, so the views stretch them
        // across the stories they run through.
        const w = tallest, x = alongX(w);
        const ww = w.x1 - w.x0, wd = w.z1 - w.z0;
        const rx = x ? (w.x0 + w.x1) / 2 - ww * 0.12 : w.x1 - 9;
        const rz = x ? w.z1 - 9 : (w.z0 + w.z1) / 2 - wd * 0.12;
        const risers = tag(new THREE.Group(), "massing");
        risers.position.set(rx, 0, rz);
        const r: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 4; i++) {
          const pipe = new THREE.CylinderGeometry(0.9, 0.9, 1, 12);
          pipe.translate(x ? (i - 1.5) * 2.2 : 0, 0.5, x ? 0 : (i - 1.5) * 2.2);
          r.push(pipe);
        }
        mesh(r, M.riser, risers, true, null);
        risers.userData.run = risersOf(next);
        root.add(risers);
      }
      if (next.rooftopUnits > 0) {
        // Down the wings' roofs, tallest first, two rows to a wing.
        let left = next.rooftopUnits;
        const order = [...form.wings].sort((a, b) => b.stories - a.stories);
        for (const w of order) {
          if (left <= 0) break;
          const x = alongX(w);
          const len = x ? w.x1 - w.x0 : w.z1 - w.z0, across = x ? w.z1 - w.z0 : w.x1 - w.x0;
          const a0 = x ? w.x0 : w.z0, mid = x ? (w.z0 + w.z1) / 2 : (w.x0 + w.x1) / 2;
          const units = tag(new THREE.Group(), "units");
          units.position.y = wingTop(w) + 1;
          const u: THREE.BufferGeometry[] = [], fans: THREE.BufferGeometry[] = [];
          for (let col = 0; left > 0 && 22 + col * 22 < len - 12; col++) {
            for (let row = 0; row < 2 && left > 0; row++, left--) {
              const a = a0 + 22 + col * 22, b = mid + (row ? -across * 0.24 : across * 0.24);
              const [px, pz] = x ? [a, b] : [b, a];
              addBox(u, x ? 8 : 11, 3.6, x ? 11 : 8, px, 1.8, pz);
              const f = new THREE.CylinderGeometry(2, 2, 0.4, 20);
              f.translate(px, 3.8, pz);
              fans.push(f);
              if (bi === 0 && !nextAnchors.units) nextAnchors.units = new THREE.Vector3(ox + px, wingTop(w) + 5, pz);
            }
          }
          if (u.length === 0) continue;
          mesh(u, unitMat, units);
          mesh(fans, M.fan, units, false, null);
          root.add(units);
          unitGroups.push(units);
        }
      }
      if (bi === 0) {
        nextAnchors.massing = new THREE.Vector3(ox, next.height * 0.55, hd);
        nextAnchors.glass = new THREE.Vector3(ox, next.height * 0.6, hd);
        if (next.balconies) nextAnchors.balconies = new THREE.Vector3(ox, next.height * 0.5, hd + 5);
      }
    });

    // --- How each part poses ---
    nextAppliers.foundation = ({ arrive, tint }) => {
      for (const f of footings) {
        f.visible = arrive > 0.001;
        f.scale.y = Math.max(0.0001, outCubic(arrive));
      }
      applyTint("foundation", tint);
    };
    nextAppliers.piles = ({ arrive, tint }) => {
      for (const piles of pilesAll) {
        piles.forEach((p, i) => {
          const q = staggered(arrive, i, piles.length, 0.12);
          p.visible = q > 0.001;
          p.scale.y = Math.max(0.0001, q < 1 ? outBack(q) : 1);
        });
      }
      applyTint("piles", tint);
    };
    nextAppliers.basement = ({ arrive, tint }) => {
      for (const b of basements) {
        b.visible = arrive > 0.001;
        b.scale.y = Math.max(0.0001, outCubic(arrive));
      }
      applyTint("basement", tint);
    };
    nextAppliers.podium = ({ arrive, tint }) => {
      for (const p of podiums) {
        p.visible = arrive > 0.001;
        p.scale.y = Math.max(0.0001, outCubic(arrive));
      }
      applyTint("podium", tint);
    };
    nextAppliers.massing = ({ arrive, tint }) => {
      for (const floors of floorsAll) {
        floors.forEach((f, i) => {
          const q = staggered(arrive, i, floors.length, 0.3);
          f.g.visible = q > 0.001;
          f.g.position.y = f.base + (1 - outCubic(q)) * 24;
        });
      }
      const r = clamp((arrive - 0.82) / 0.18);
      for (const roof of roofs) {
        roof.visible = r > 0.001;
        roof.scale.setScalar(Math.max(0.0001, r < 1 ? outBack(r) : 1));
      }
      applyTint("massing", tint);
    };
    nextAppliers.glass = ({ arrive }) => {
      for (const glass of glassAll) {
        glass.forEach(({ pane, mat }, i) => {
          const q = outCubic(staggered(arrive, i, glass.length, 0.25));
          mat.opacity = q;
          pane.visible = q > 0.001;
        });
      }
    };
    nextAppliers.balconies = ({ arrive, tint }) => {
      for (const balconies of balconiesAll) {
        balconies.forEach(({ g, axis }, i) => {
          const q = staggered(arrive, i, balconies.length, 0.25);
          g.visible = q > 0.001;
          g.scale[axis] = Math.max(0.0001, outCubic(q));
        });
      }
      applyTint("balconies", tint);
    };
    nextAppliers.elevators = ({ arrive, tint }) => {
      for (const b of bulkheads) {
        b.visible = arrive > 0.001;
        b.scale.y = Math.max(0.0001, arrive < 1 ? outBack(arrive) : 1);
      }
      applyTint("elevators", tint);
    };
    nextAppliers.units = ({ arrive, tint }) => {
      const all = unitGroups.flatMap((u) => u.children);
      all.forEach((c, i) => {
        c.visible = arrive > 0.001;
        c.position.y = (1 - outCubic(staggered(arrive, i, all.length, 0.4))) * 14;
      });
      applyTint("units", tint);
    };

    appliers = nextAppliers;
    anchors = nextAnchors;
    glows = nextGlows;

    // LA-2217: each object's layer, read where it rests now, before any pose
    // moves it. The ground and the site never lift.
    lifted = new Map();
    layered = [];
    runs = [];
    const holders = content.children.flatMap((c) => (c.userData.building ? c.children : [c]));
    for (const obj of holders) {
      if (obj.userData.run) runs.push({ obj, run: obj.userData.run as Run });
      else if (!obj.userData.ground && partOfObject(obj) !== "site") layered.push({ obj, layer: layerOf(obj.position.y, levels) });
    }
    cutaway = cutawayOf(form.wings, levels, lastX);
    if (cutaway) {
      cornerPlanes[0].set(new THREE.Vector3(-1, 0, 0), cutaway.x);
      cornerPlanes[1].set(new THREE.Vector3(0, 0, -1), cutaway.z);
      cornerPlanes[2].set(new THREE.Vector3(0, -1, 0), cutaway.y);
    }

    // Sun and camera follow the building's size.
    const reach = Math.max(span, D) * 1.6 + 120;
    sun.position.set(-reach * 0.5, reach, reach);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 10, far: reach * 4 });
    sun.shadow.camera.updateProjectionMatrix();
    cam.goal.set(
      new THREE.Vector3(-span / 2 - 16, -siteDepth * 0.6, -hd - 16),
      new THREE.Vector3(span / 2 + 16, next.height + 14, hd + 16),
    );
    goalTop = cam.goal.max.y;
    cam.goal.max.y = goalTop + liftOf(levels.length, opened);
    if (!cam.set) {
      cam.box.copy(cam.goal);
      cam.set = true;
    }
    applyCut();
    drawOutlines();
    pose(current);
  }

  /** The part an object belongs to, from the nearest tagged ancestor. */
  function partOfObject(obj: THREE.Object3D): StagePart | null {
    for (let o: THREE.Object3D | null = obj; o; o = o.parent) if (o.userData.part) return o.userData.part as StagePart;
    return null;
  }

  /** A see-through copy of `base` at `level` (0 faded, 1 unpriced fill), following its colour and opacity as they change. */
  function seeThrough(base: THREE.Material, level: 0 | 1): THREE.Material {
    const cache = see[level];
    let copy = cache.get(base);
    if (!copy) {
      copy = base.clone();
      copy.transparent = true;
      copy.depthWrite = false;
      cache.set(base, copy);
    }
    (copy as THREE.MeshBasicMaterial).color.copy((base as THREE.MeshBasicMaterial).color);
    copy.opacity = (level === 0 ? FADED : UNPRICED_FILL) * base.opacity;
    return copy;
  }

  function clearOutlines() {
    outlines.forEach((line) => {
      line.removeFromParent();
      line.geometry.dispose();
    });
    outlines = [];
  }

  function dropLooks() {
    for (const cache of see) cache.forEach((copy) => copy.dispose());
    see = [new Map(), new Map()];
    cornerCopies.forEach((copy) => copy.dispose());
    cornerCopies = new Map();
    clearOutlines();
  }

  /** LA-2211: a dashed working-orange edge on every solid of an unpriced part. */
  function drawOutlines() {
    clearOutlines();
    const solids: THREE.Mesh[] = [];
    content.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh) || obj.userData.poche) return;
      const part = partOfObject(obj);
      if (part && unpriced.has(part)) solids.push(obj);
    });
    for (const solid of solids) {
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(solid.geometry, 25), dash);
      edge.computeLineDistances();
      solid.add(edge);
      outlines.push(edge);
    }
  }

  /** LA-2211: the picked part shows whole; every other part fades, and an unpriced part stays faint. */
  function applyLooks() {
    content.traverse((obj) => {
      const part = partOfObject(obj);
      const away = focus !== null && part !== focus;
      if (obj instanceof THREE.LineSegments) {
        const line = away ? dashFaded : dash;
        // LA-2217: an edge goes with its solid when the cutaway takes it.
        obj.material = cutawayOn() && !kept(obj.parent ?? obj) ? cornerCut(line) : line;
        return;
      }
      if (!(obj instanceof THREE.Mesh) || obj.userData.ground) return;
      const base = (obj.userData.base ??= obj.material) as THREE.Material;
      obj.userData.cast ??= obj.castShadow;
      const faint = part !== null && unpriced.has(part);
      const look = away ? seeThrough(base, 0) : faint ? seeThrough(base, 1) : base;
      obj.material = cutawayOn() && !kept(obj) ? cornerCut(look) : look;
      obj.castShadow = away || faint ? false : (obj.userData.cast as boolean);
    });
  }

  /** LA-2217: the unit walls (and their cut faces) stand inside the cutaway; everything else is cut by it. */
  function kept(obj: THREE.Object3D): boolean {
    return Boolean(obj.userData.keep || obj.parent?.userData.keep);
  }

  /** LA-2217: a copy of `look` with the top floor's corner clipped away, following its colour, glow and opacity. */
  function cornerCut(look: THREE.Material): THREE.Material {
    let copy = cornerCopies.get(look);
    if (!copy) {
      copy = look.clone();
      copy.clippingPlanes = cornerPlanes;
      copy.clipIntersection = true;
      cornerCopies.set(look, copy);
    }
    const from = look as THREE.MeshStandardMaterial, to = copy as THREE.MeshStandardMaterial;
    to.color?.copy(from.color);
    if (from.emissive && to.emissive) {
      to.emissive.copy(from.emissive);
      to.emissiveIntensity = from.emissiveIntensity;
    }
    to.opacity = from.opacity;
    return copy;
  }

  /** LA-2217: the Assembled cutaway is on while the building is less than half open. */
  const cutawayOn = () => cutaway !== null && opened < 0.5;

  /**
   * LA-2217: lays the posed building out for the view. A part's applier poses
   * it where it rests; this lifts it by its layer on top, so the two never
   * need to know of each other. The last lift comes off before the appliers
   * run, so an object no applier moves does not climb pose after pose.
   */
  function layout() {
    if (!spec) return;
    for (const { obj, layer } of layered) {
      const dy = liftOf(layer, opened);
      obj.position.y += dy;
      lifted.set(obj, dy);
    }
    for (const { obj, run } of runs) {
      const { y, height } = stretchOf(run, opened, spec.levels);
      obj.position.y = y;
      obj.scale.y = Math.max(0.0001, height);
      const part = partOfObject(obj);
      // A run shows once the part it belongs to has arrived.
      obj.visible = height > 0.5 && (part === null || (current[part]?.arrive ?? 0) >= 0.999);
    }
    M.ground.opacity = GROUND * (1 - opened);
    if (ground) ground.visible = opened < 0.99;
  }

  function pose(states: PartStates) {
    current = states;
    for (const [obj, dy] of lifted) obj.position.y -= dy;
    lifted.clear();
    for (const part of STAGE_PARTS) appliers[part]?.(states[part] ?? { arrive: 0, tint: 1 });
    layout();
    applyGlows();
    applyLooks();
  }

  function applyGlows() {
    for (const part of STAGE_PARTS) {
      const glow = Math.max(lit.has(part) ? 0.45 : 0, pulsed.has(part) ? 0.9 * pulseAmount : 0);
      for (const mat of glows[part] ?? []) {
        mat.emissive.copy(BLUE);
        mat.emissiveIntensity = glow;
      }
    }
  }

  function applyCut() {
    if (!spec || cut.kind === "none") {
      renderer.clippingPlanes = [];
      return;
    }
    if (cut.kind === "plan") {
      const lv = spec.levels[Math.max(0, Math.min(spec.levels.length - 1, cut.level))];
      // Through the windows, the way a floor plan is cut.
      // LA-2217: an opened story has lifted, and the cut goes with it.
      const level = Math.max(0, Math.min(spec.levels.length - 1, cut.level));
      cutPlane.set(new THREE.Vector3(0, -1, 0), lv.base + Math.min(5, lv.height * 0.5) + liftOf(level, opened));
    } else {
      cutPlane.set(new THREE.Vector3(-1, 0, 0), -span / 2 + clamp(cut.at) * span);
    }
    renderer.clippingPlanes = [cutPlane];
  }

  const raycaster = new THREE.Raycaster();
  const shown = (obj: THREE.Object3D | null): boolean => {
    for (let o = obj; o; o = o.parent) if (!o.visible) return false;
    return true;
  };

  return {
    setBuilding: build,
    setParts: pose,
    setDrift: (drift) => {
      cam.drift = drift;
    },
    tick: (seconds) => {
      const k = 1 - Math.exp(-seconds * 5);
      cam.box.min.lerp(cam.goal.min, k);
      cam.box.max.lerp(cam.goal.max, k);
      place();
      return cam.box.min.distanceTo(cam.goal.min) > 0.05 || cam.box.max.distanceTo(cam.goal.max) > 0.05;
    },
    render: () => {
      place();
      composer.render();
    },
    resize: (w, h) => {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      cam.aspect = w / h;
      cam.height = h;
    },
    pointOf: (part) => {
      const at = anchors[part];
      if (!at) return null;
      place();
      const v = at.clone();
      if (spec) v.y += liftOf(layerOf(at.y, spec.levels), opened);
      v.project(camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    },
    orbit: (around, up) => {
      cam.around += around;
      cam.up = Math.max(-0.44, Math.min(1.0, cam.up + up));
    },
    zoom: (factor) => {
      cam.zoom = Math.max(0.6, Math.min(6, cam.zoom * factor));
    },
    resetView: () => {
      cam.around = 0;
      cam.up = 0;
      cam.zoom = 1;
    },
    setCut: (next) => {
      cut = next;
      applyCut();
    },
    pick: (x, y) => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return null;
      place();
      raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, 1 - (y / h) * 2), camera);
      const clipped = renderer.clippingPlanes.length > 0;
      for (const hit of raycaster.intersectObject(content, true)) {
        if (!shown(hit.object)) continue;
        if (clipped && cutPlane.distanceToPoint(hit.point) < 0) continue;
        // LA-2217: what the Assembled cutaway has taken away is not there to pick.
        if (cutawayOn() && !kept(hit.object) && inCutaway(cutaway, hit.point)) continue;
        for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
          if (o.userData.part) return o.userData.part as StagePart;
        }
        // Nothing tagged: nothing to pick, and it hides what is behind it.
        return null;
      }
      return null;
    },
    setOpened: (next) => {
      opened = clamp(next);
      cam.goal.max.y = goalTop + (spec ? liftOf(spec.levels.length, opened) : 0);
      applyCut();
      pose(current);
    },
    setInsets: (top, bottom) => {
      cam.insetTop = top;
      cam.insetBottom = bottom;
    },
    setHighlight: (parts) => {
      lit = new Set(parts);
      pose(current);
    },
    setPulse: (parts, amount) => {
      pulsed = new Set(parts);
      pulseAmount = clamp(amount);
      applyGlows();
      // LA-2217: the cutaway's clipped copies take the glow from their materials.
      if (cutawayOn()) applyLooks();
    },
    setFocus: (part) => {
      focus = part;
      applyLooks();
    },
    setUnpriced: (parts) => {
      const next = new Set(parts);
      if ([...next].join() === [...unpriced].join()) return;
      unpriced = next;
      drawOutlines();
      applyLooks();
    },
    dispose: () => {
      built.disposables.forEach((d) => d.dispose());
      dropLooks();
      lasting.forEach((d) => d.dispose());
      composer.dispose();
      renderer.dispose();
    },
  };
}
