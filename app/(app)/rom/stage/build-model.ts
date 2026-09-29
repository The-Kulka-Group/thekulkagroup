import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { StageBuilding } from "@/lib/rom/stage-model";
import { STAGE_PARTS, type StagePart } from "@/lib/rom/stage-scenes";

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

/** A part's pose: arrive 0 is hidden and 1 is in place; tint 0 is blue and 1 is settled. */
export type PartState = { arrive: number; tint: number };
export type PartStates = Partial<Record<StagePart, PartState>>;

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
  dispose: () => void;
};

const BLUE = new THREE.Color(0x0073ea);
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
    foundation: [0.2, 0.2 + piles],
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

  // Camera: a long lens at a three-quarter view, sized to the building.
  const camera = new THREE.PerspectiveCamera(17, 16 / 9, 10, 20000);
  const cam = { target: new THREE.Vector3(), radius: 100, goalTarget: new THREE.Vector3(), goalRadius: 100, drift: 1, set: false };
  const place = () => {
    const az = 0.6 + 0.09 * inOut(clamp(cam.drift));
    const el = 0.33;
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = cam.radius / Math.sin(Math.min(vHalf, hHalf));
    const t = cam.target;
    camera.position.set(t.x + Math.sin(az) * Math.cos(el) * dist, t.y + Math.sin(el) * dist, t.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(t);
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
  let current: PartStates = {};

  function build(spec: StageBuilding) {
    scene.remove(content);
    built.disposables.forEach((d) => d.dispose());
    content = new THREE.Group();
    scene.add(content);
    const disposables: { dispose: () => void }[] = [];
    built = { disposables };
    const tints: Partial<Record<StagePart, { mat: THREE.MeshStandardMaterial; base: THREE.Color }[]>> = {};
    const nextAnchors: typeof anchors = {};
    const nextAppliers: typeof appliers = {};

    /** A material of the part's own, which it tints from blue to `color` as it settles. */
    const tinted = (part: StagePart, color: number, roughness: number) => {
      const mat = new THREE.MeshStandardMaterial({ color, roughness });
      disposables.push(mat);
      (tints[part] ??= []).push({ mat, base: new THREE.Color(color) });
      return mat;
    };
    const glassMat = () => {
      const mat = new THREE.MeshPhysicalMaterial({
        color: 0x8cbcf0, roughness: 0.06, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05,
        envMapIntensity: 1.8, transparent: true, opacity: 0,
      });
      disposables.push(mat);
      return mat;
    };
    const mesh = (geos: THREE.BufferGeometry[], mat: THREE.Material, parent: THREE.Object3D, cast = true) => {
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.castShadow = cast;
      m.receiveShadow = true;
      parent.add(m);
      disposables.push(m.geometry);
      geos.forEach((g) => g.dispose());
      return m;
    };
    const applyTint = (part: StagePart, tint: number) => {
      for (const { mat, base } of tints[part] ?? []) mat.color.copy(BLUE).lerp(base, outCubic(clamp(tint)));
    };

    const W = spec.width, D = spec.depth, hw = W / 2, hd = D / 2;
    const count = Math.min(3, spec.buildingCount);
    const gap = 40;
    const span = count * W + (count - 1) * gap;
    const offsets = Array.from({ length: count }, (_, i) => -span / 2 + hw + i * (W + gap));
    const lastX = offsets[offsets.length - 1];
    const zCut = hd - 7;
    const xCut = lastX + hw - 7;
    const below = spec.basement ? 10 : 0;
    const siteDepth = siteDepthOf(spec);
    const SX0 = -span / 2 - Math.max(80, W * 0.6);
    const SZ0 = -hd - Math.max(70, D * 0.8);
    const P = spec.podiumLevels;
    const podiumTop = spec.levels[P - 1] ? spec.levels[P - 1].base + spec.levels[P - 1].height : 0;

    // Site base, cut along two planes through the last building.
    {
      const top: THREE.BufferGeometry[] = [];
      addBox(top, xCut - SX0, siteDepth, zCut - SZ0, (SX0 + xCut) / 2, -siteDepth / 2, (SZ0 + zCut) / 2);
      mesh(top, M.site, content, false);
      const faces: THREE.BufferGeometry[] = [];
      addBox(faces, 0.4, siteDepth - 0.3, zCut - SZ0, xCut + 0.21, -siteDepth / 2, (SZ0 + zCut) / 2);
      addBox(faces, xCut - SX0, siteDepth - 0.3, 0.4, (SX0 + xCut) / 2, -siteDepth / 2, zCut + 0.21);
      mesh(faces, M.cut, content, false);
    }

    // The service at grade, out in front of the first building's corner (E-1).
    if (spec.serviceAmps) {
      const service = new THREE.Group();
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
    const balconiesAll: THREE.Group[][] = [];
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
    const pileMat = tinted("foundation", 0xffffff, 0.6);
    const balconyMat = tinted("balconies", 0xffffff, 0.8);
    const bulkheadMat = tinted("elevators", 0xffffff, 0.9);
    const unitMat = tinted("units", 0xffffff, 0.9);
    const storefront = glassMat();
    storefront.opacity = 1;

    offsets.forEach((ox, bi) => {
      const root = new THREE.Group();
      root.position.x = ox;
      content.add(root);
      const exposed = bi === count - 1;
      const foundationTop = -below - 1.6;

      // Below grade: a basement level and the foundation, both seen in the cut.
      if (below) {
        const b: THREE.BufferGeometry[] = [];
        addBox(b, W, below, D, 0, below / 2, 0);
        const m = mesh(b, concreteMat, root);
        m.position.y = -below;
        basements.push(m);
      }
      const piles: THREE.Mesh[] = [];
      if (spec.foundation.depth > 0 && exposed) {
        const deep = spec.foundation.system === "Deep Foundations";
        const r = deep ? 0.9 : 1.6;
        const geo = new THREE.CylinderGeometry(r, r, spec.foundation.depth, deep ? 14 : 10);
        geo.translate(0, -spec.foundation.depth / 2, 0);
        disposables.push(geo);
        const at = (x: number, z: number) => {
          const p = new THREE.Mesh(geo, pileMat);
          p.position.set(x, foundationTop, z);
          p.castShadow = true;
          root.add(p);
          piles.push(p);
        };
        const nx = Math.max(4, Math.round(W / 20)), nz = Math.max(3, Math.round(D / 22));
        for (let i = 0; i < nx; i++) at(-hw + 12 + i * ((W - 24) / (nx - 1)), hd - 3.5);
        for (let i = 1; i < nz; i++) at(hw - 3.5, hd - 3.5 - i * ((D - 20) / (nz - 1)));
        nextAnchors.foundation = new THREE.Vector3(ox + hw * 0.6, foundationTop - spec.foundation.depth * 0.45, hd);
      } else if (exposed) {
        // Spread footings or a mat: a thick concrete band under the building, in the cut.
        const f: THREE.BufferGeometry[] = [];
        const t = spec.foundation.system === "Mat Foundation" ? 4 : 2.5;
        addBox(f, W + 2, t, D + 2, 0, t / 2, 0);
        const m = mesh(f, footingMat, root);
        m.position.y = foundationTop - t;
        footings.push(m);
        nextAnchors.foundation = new THREE.Vector3(ox + hw * 0.6, foundationTop - t / 2, hd);
      }
      pilesAll.push(piles);
      if (exposed && below) nextAnchors.basement = new THREE.Vector3(ox + hw * 0.5, -below / 2, hd);

      // Podium levels: recessed openings (garage or storefront) between piers.
      const podium = new THREE.Group();
      root.add(podium);
      {
        const beam: THREE.BufferGeometry[] = [];
        addBox(beam, W, 1.6, D, 0, -0.8, 0);
        mesh(beam, podiumMat, podium);
        if (P > 0) {
          const core: THREE.BufferGeometry[] = [];
          addBox(core, W - 3, podiumTop, D - 3, 0, podiumTop / 2, 0);
          mesh(core, spec.retail ? storefront : M.opening, podium, false);
          const parts: THREE.BufferGeometry[] = [];
          const bays = Math.max(4, Math.round(W / 20)), bw = W / bays;
          for (let i = 0; i <= bays; i++) {
            const edge = i === 0 || i === bays;
            addBox(parts, edge ? 3 : 2.4, podiumTop, 1.6, -hw + i * bw + (i === 0 ? 1.5 : i === bays ? -1.5 : 0), podiumTop / 2, hd - 0.8);
          }
          const sb = Math.max(3, Math.round(D / 18)), sw = D / sb;
          for (let i = 0; i <= sb; i++) {
            const edge = i === 0 || i === sb;
            addBox(parts, 1.6, podiumTop, edge ? 3 : 2.4, hw - 0.8, podiumTop / 2, -hd + i * sw + (i === 0 ? 1.5 : i === sb ? -1.5 : 0));
          }
          for (let l = 0; l < P; l++) {
            const top = spec.levels[l].base + spec.levels[l].height;
            addBox(parts, W, 3, 1.6, 0, top - 1.5, hd - 0.8);
            addBox(parts, 1.6, 3, D, hw - 0.8, top - 1.5, 0);
          }
          addBox(parts, W, podiumTop, 1.6, 0, podiumTop / 2, -hd + 0.8);
          addBox(parts, 1.6, podiumTop, D, -hw + 0.8, podiumTop / 2, 0);
          mesh(parts, podiumMat, podium);
          if (bi === 0) nextAnchors.podium = new THREE.Vector3(ox, podiumTop / 2, hd);
        }
      }
      podiums.push(podium);

      // Frame floors: piers and bands around recessed glass, and balconies.
      const floors: { g: THREE.Group; base: number }[] = [];
      const glass: { pane: THREE.Mesh; mat: THREE.MeshPhysicalMaterial }[] = [];
      const balconies: THREE.Group[] = [];
      const big = spec.glazing === "elevated";
      spec.levels.forEach((lv) => {
        if (lv.kind !== "frame") return;
        const g = new THREE.Group();
        const slab: THREE.BufferGeometry[] = [];
        addBox(slab, W + 1.6, 1, D + 1.6, 0, 0.5, 0);
        mesh(slab, slabMat, g);
        const skin: THREE.BufferGeometry[] = [], panes: THREE.BufferGeometry[] = [], inner: THREE.BufferGeometry[] = [];
        const T = 1.4, h = lv.height, wh = big ? 7.2 : 6.4, sill = big ? 1.6 : 2.2, head = 1 + sill + wh, pier = big ? 2.2 : 3;
        const faceX = (z: number, s: number, cols: number) => {
          const pitch = W / cols, ww = pitch - pier;
          addBox(skin, W, sill, T, 0, 1 + sill / 2, z - (s * T) / 2);
          addBox(skin, W, h - head, T, 0, head + (h - head) / 2, z - (s * T) / 2);
          for (let c = 0; c <= cols; c++) addBox(skin, pier, wh, T, -hw + c * pitch + (c === 0 ? pier / 2 : c === cols ? -pier / 2 : 0), 1 + sill + wh / 2, z - (s * T) / 2);
          for (let c = 0; c < cols; c++) addBox(panes, ww, wh, 0.3, -hw + pitch * (c + 0.5), 1 + sill + wh / 2, z - s * (T + 0.15));
        };
        const faceZ = (x: number, s: number, cols: number) => {
          const pitch = D / cols, ww = pitch - pier;
          addBox(skin, T, sill, D, x - (s * T) / 2, 1 + sill / 2, 0);
          addBox(skin, T, h - head, D, x - (s * T) / 2, head + (h - head) / 2, 0);
          for (let c = 0; c <= cols; c++) addBox(skin, T, wh, pier, x - (s * T) / 2, 1 + sill + wh / 2, -hd + c * pitch + (c === 0 ? pier / 2 : c === cols ? -pier / 2 : 0));
          for (let c = 0; c < cols; c++) addBox(panes, 0.3, wh, ww, x - s * (T + 0.15), 1 + sill + wh / 2, -hd + pitch * (c + 0.5));
        };
        const colsX = Math.max(4, Math.round(W / 11.25)), colsZ = Math.max(3, Math.round(D / 11));
        faceX(hd, 1, colsX); faceX(-hd, -1, colsX); faceZ(hw, 1, colsZ); faceZ(-hw, -1, colsZ);
        addBox(inner, W - 2 * T - 0.8, h - 1, D - 2 * T - 0.8, 0, 1 + (h - 1) / 2, 0);
        mesh(skin, skinMat, g);
        mesh(inner, M.inner, g, false);
        const pane = glassMat();
        const paneMesh = mesh(panes, pane, g, false);
        paneMesh.visible = false;
        glass.push({ pane: paneMesh, mat: pane });
        if (spec.balconies) {
          // Built out from the wall, so they can grow outward when they arrive.
          const bg = new THREE.Group();
          bg.position.z = hd;
          const bal: THREE.BufferGeometry[] = [];
          const pitch = W / colsX;
          for (let c = 1; c < colsX; c += 3) {
            const x = -hw + pitch * (c + 1);
            addBox(bal, pitch * 1.6, 0.7, 5.5, x, 1.35, 2.75);
            addBox(bal, pitch * 1.6, 0.25, 0.25, x, 4.6, 5.4);
            addBox(bal, 0.25, 3.2, 0.25, x - pitch * 0.8 + 0.2, 3.1, 5.4);
            addBox(bal, 0.25, 3.2, 0.25, x + pitch * 0.8 - 0.2, 3.1, 5.4);
          }
          if (bal.length) mesh(bal, balconyMat, bg);
          g.add(bg);
          balconies.push(bg);
        }
        g.position.y = lv.base;
        root.add(g);
        floors.push({ g, base: lv.base });
      });
      floorsAll.push(floors);
      glassAll.push(glass);
      balconiesAll.push(balconies);

      // Roof: the parapet lands with the top floor; the bulkhead and rooftop
      // units are their own parts.
      const roof = new THREE.Group();
      roof.position.y = spec.height;
      {
        const r: THREE.BufferGeometry[] = [];
        addBox(r, W + 1.4, 1, D + 1.4, 0, 0.5, 0);
        addBox(r, W + 1.4, 3, 1, 0, 2.5, hd + 0.2);
        addBox(r, W + 1.4, 3, 1, 0, 2.5, -hd - 0.2);
        addBox(r, 1, 3, D + 1.4, hw + 0.2, 2.5, 0);
        addBox(r, 1, 3, D + 1.4, -hw - 0.2, 2.5, 0);
        mesh(r, skinMat, roof);
      }
      root.add(roof);
      roofs.push(roof);

      if (spec.elevators) {
        const bulk = new THREE.Group();
        bulk.position.set(W * 0.18, spec.height + 1, -D * 0.08);
        const b: THREE.BufferGeometry[] = [];
        addBox(b, 10 + spec.elevators.cars * 8, 11, 18, 0, 5.5, 0);
        mesh(b, bulkheadMat, bulk);
        root.add(bulk);
        bulkheads.push(bulk);
        if (bi === 0) nextAnchors.elevators = new THREE.Vector3(ox + W * 0.18, spec.height + 10, -D * 0.08);
      }
      if (spec.rooftopUnits > 0) {
        const units = new THREE.Group();
        units.position.y = spec.height + 1;
        const n = spec.rooftopUnits;
        const u: THREE.BufferGeometry[] = [], fans: THREE.BufferGeometry[] = [];
        for (let i = 0; i < n; i++) {
          const row = i % 2, col = Math.floor(i / 2);
          const x = -hw + 22 + col * 22, z = row ? -D * 0.24 : D * 0.24;
          addBox(u, 8, 3.6, 11, x, 1.8, z);
          const f = new THREE.CylinderGeometry(2, 2, 0.4, 20);
          f.translate(x, 3.8, z);
          fans.push(f);
        }
        mesh(u, unitMat, units);
        mesh(fans, M.fan, units, false);
        root.add(units);
        unitGroups.push(units);
        if (bi === 0) nextAnchors.units = new THREE.Vector3(ox - hw + 30, spec.height + 5, 0);
      }
      if (bi === 0) {
        nextAnchors.massing = new THREE.Vector3(ox, spec.height * 0.55, hd);
        nextAnchors.glass = new THREE.Vector3(ox, spec.height * 0.6, hd);
        if (spec.balconies) nextAnchors.balconies = new THREE.Vector3(ox, spec.height * 0.5, hd + 5);
      }
    });

    // --- How each part poses ---
    nextAppliers.foundation = ({ arrive, tint }) => {
      for (const piles of pilesAll) {
        piles.forEach((p, i) => {
          const q = staggered(arrive, i, piles.length, 0.12);
          p.visible = q > 0.001;
          p.scale.y = Math.max(0.0001, q < 1 ? outBack(q) : 1);
        });
      }
      for (const f of footings) {
        f.visible = arrive > 0.001;
        f.scale.y = Math.max(0.0001, outCubic(arrive));
      }
      applyTint("foundation", tint);
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
        balconies.forEach((b, i) => {
          const q = staggered(arrive, i, balconies.length, 0.25);
          b.visible = q > 0.001;
          b.scale.z = Math.max(0.0001, outCubic(q));
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
      for (const u of unitGroups) {
        u.children.forEach((c, i) => {
          c.visible = arrive > 0.001;
          c.position.y = (1 - outCubic(staggered(arrive, i, u.children.length, 0.4))) * 14;
        });
      }
      applyTint("units", tint);
    };

    appliers = nextAppliers;
    anchors = nextAnchors;

    // Sun and camera follow the building's size.
    const reach = Math.max(span, D) * 1.6 + 120;
    sun.position.set(-reach * 0.5, reach, reach);
    Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 10, far: reach * 4 });
    sun.shadow.camera.updateProjectionMatrix();
    const radius = Math.hypot(span / 2 + 20, spec.height + siteDepth * 0.7, hd + 20) * 0.6;
    cam.goalTarget.set(count > 1 ? 0 : 6, spec.height * 0.28 - siteDepth * 0.3, 6);
    cam.goalRadius = radius;
    if (opts.captionRoom) {
      // Slide the view so the building sits right of the caption and a little
      // lower, and pull back a touch so it still fits.
      const az = 0.69;
      const shift = radius * 0.2;
      cam.goalTarget.x -= Math.cos(az) * shift;
      cam.goalTarget.z += Math.sin(az) * shift;
      cam.goalTarget.y += radius * 0.05;
      cam.goalRadius = radius * 1.08;
    }
    if (!cam.set) {
      cam.target.copy(cam.goalTarget);
      cam.radius = cam.goalRadius;
      cam.set = true;
    }
    pose(current);
  }

  function pose(states: PartStates) {
    current = states;
    for (const part of STAGE_PARTS) appliers[part]?.(states[part] ?? { arrive: 0, tint: 1 });
  }

  return {
    setBuilding: build,
    setParts: pose,
    setDrift: (drift) => {
      cam.drift = drift;
    },
    tick: (seconds) => {
      const k = 1 - Math.exp(-seconds * 5);
      cam.target.lerp(cam.goalTarget, k);
      cam.radius += (cam.goalRadius - cam.radius) * k;
      place();
      return cam.target.distanceTo(cam.goalTarget) > 0.05 || Math.abs(cam.radius - cam.goalRadius) > 0.05;
    },
    render: () => {
      place();
      composer.render();
    },
    resize: (w, h) => {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    pointOf: (part) => {
      const at = anchors[part];
      if (!at) return null;
      const v = at.clone().project(camera);
      const w = canvas.clientWidth, h = canvas.clientHeight;
      return { x: ((v.x + 1) / 2) * w, y: ((1 - v.y) / 2) * h };
    },
    dispose: () => {
      built.disposables.forEach((d) => d.dispose());
      lasting.forEach((d) => d.dispose());
      composer.dispose();
      renderer.dispose();
    },
  };
}
