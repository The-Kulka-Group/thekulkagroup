import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import type { StageBuilding } from "@/lib/rom/stage-model";

// LA-1317: the Design and Engineering stage's 3D model. A white architectural
// model of the project's building, sitting on a site base that is cut open
// through the building so the foundation shows against a black section face.
// Everything is sized in feet from StageBuilding. The chosen direction is the
// LA-1308 probe 1 look, with the trees and other decoration left out.

export type StageModel = {
  /** Set the model to its state at t seconds into the assembly. */
  pose: (t: number) => void;
  render: () => void;
  resize: (width: number, height: number) => void;
  dispose: () => void;
  /** Seconds until the assembly is complete. */
  duration: number;
};

const BLUE = new THREE.Color(0x0073ea);
const WHITE = new THREE.Color(0xffffff);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const outCubic = (p: number) => 1 - Math.pow(1 - p, 3);
const outBack = (p: number) => 1 + 2.5 * Math.pow(p - 1, 3) + 1.5 * Math.pow(p - 1, 2);
const inOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

type Box = (arr: THREE.BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number) => void;
const addBox: Box = (arr, w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  arr.push(g);
};

export function buildStageModel(
  canvas: HTMLCanvasElement,
  spec: StageBuilding,
  opts: { occlusion: boolean; pixelRatio: number },
): StageModel {
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
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    slab: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }),
    podium: new THREE.MeshStandardMaterial({ color: 0xe4e1d9, roughness: 0.95 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x8cbcf0, roughness: 0.06, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.8 }),
    inner: new THREE.MeshStandardMaterial({ color: 0xeeede9, roughness: 1 }),
    opening: new THREE.MeshStandardMaterial({ color: 0x9a9892, roughness: 1 }),
    site: new THREE.MeshStandardMaterial({ color: 0xf7f7f5, roughness: 0.95 }),
    cut: new THREE.MeshStandardMaterial({ color: 0x1c1b19, roughness: 1 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xd9d6ce, roughness: 1 }),
    fan: new THREE.MeshStandardMaterial({ color: 0x6b6a64, roughness: 0.8 }),
  };
  const disposables: { dispose: () => void }[] = [env, pmrem, ...Object.values(M)];

  const mesh = (geos: THREE.BufferGeometry[], mat: THREE.Material, parent: THREE.Object3D, cast = true) => {
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    parent.add(m);
    disposables.push(m.geometry);
    geos.forEach((g) => g.dispose());
    return m;
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
  const siteDepth = Math.max(52, spec.foundation.depth + below + 12, (spec.elevators?.wellDepth ?? 0) + 10);
  const SX0 = -span / 2 - Math.max(80, W * 0.6);
  const SZ0 = -hd - Math.max(70, D * 0.8);

  // Site base, cut along two planes through the last building.
  {
    const top: THREE.BufferGeometry[] = [];
    addBox(top, xCut - SX0, siteDepth, zCut - SZ0, (SX0 + xCut) / 2, -siteDepth / 2, (SZ0 + zCut) / 2);
    mesh(top, M.site, scene, false);
    const faces: THREE.BufferGeometry[] = [];
    addBox(faces, 0.4, siteDepth - 0.3, zCut - SZ0, xCut + 0.21, -siteDepth / 2, (SZ0 + zCut) / 2);
    addBox(faces, xCut - SX0, siteDepth - 0.3, 0.4, (SX0 + xCut) / 2, -siteDepth / 2, zCut + 0.21);
    mesh(faces, M.cut, scene, false);
  }

  // The service at grade, beside the first building (E-1).
  const service = new THREE.Group();
  if (spec.serviceAmps) {
    const s: THREE.BufferGeometry[] = [];
    // Out in front of the first building's corner, where the camera can see it.
    const sx = offsets[0] - hw - 34, sz = hd - 14;
    addBox(s, 14, 0.8, 9, sx, 0.4, sz);
    addBox(s, 10, 7, 4.5, sx, 4.3, sz);
    mesh(s, M.white, service);
    scene.add(service);
  }

  type Building = {
    piles: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[];
    podium: THREE.Group;
    floors: { g: THREE.Group; base: number; slab: THREE.MeshStandardMaterial }[];
    roof: THREE.Group;
  };
  const built: Building[] = [];

  offsets.forEach((ox, bi) => {
    const root = new THREE.Group();
    root.position.x = ox;
    scene.add(root);
    const exposed = bi === count - 1;
    const piles: Building["piles"] = [];

    // Below grade: a basement level and the foundation, both seen in the cut.
    const foundationTop = -below - 1.6;
    if (below) {
      const b: THREE.BufferGeometry[] = [];
      addBox(b, W, below, D, 0, -below / 2, 0);
      mesh(b, M.concrete, root);
    }
    if (spec.foundation.depth > 0 && exposed) {
      const deep = spec.foundation.system === "Deep Foundations";
      const r = deep ? 0.9 : 1.6;
      const geo = new THREE.CylinderGeometry(r, r, spec.foundation.depth, deep ? 14 : 10);
      geo.translate(0, -spec.foundation.depth / 2, 0);
      disposables.push(geo);
      const at = (x: number, z: number) => {
        const mat = new THREE.MeshStandardMaterial({ color: BLUE.clone(), roughness: 0.6 });
        disposables.push(mat);
        const p = new THREE.Mesh(geo, mat);
        p.position.set(x, foundationTop, z);
        p.castShadow = true;
        p.visible = false;
        root.add(p);
        piles.push(p);
      };
      const nx = Math.max(4, Math.round(W / 20)), nz = Math.max(3, Math.round(D / 22));
      for (let i = 0; i < nx; i++) at(-hw + 12 + i * ((W - 24) / (nx - 1)), hd - 3.5);
      for (let i = 1; i < nz; i++) at(hw - 3.5, hd - 3.5 - i * ((D - 20) / (nz - 1)));
    } else if (exposed) {
      // Spread footings or a mat: a thick concrete band under the building, in the cut.
      const f: THREE.BufferGeometry[] = [];
      const t = spec.foundation.system === "Mat Foundation" ? 4 : 2.5;
      addBox(f, W + 2, t, D + 2, 0, foundationTop - t / 2, 0);
      mesh(f, M.concrete, root);
    }

    // Podium levels: recessed openings (garage or storefront) between piers.
    const podium = new THREE.Group();
    root.add(podium);
    const P = spec.podiumLevels;
    const podiumTop = spec.levels[P - 1] ? spec.levels[P - 1].base + spec.levels[P - 1].height : 0;
    {
      const beam: THREE.BufferGeometry[] = [];
      addBox(beam, W, 1.6, D, 0, -0.8, 0);
      mesh(beam, M.podium, podium);
      if (P > 0) {
        const core: THREE.BufferGeometry[] = [];
        addBox(core, W - 3, podiumTop, D - 3, 0, podiumTop / 2, 0);
        mesh(core, spec.retail ? M.glass : M.opening, podium, false);
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
        mesh(parts, M.podium, podium);
      }
    }
    podium.visible = false;

    // Frame floors: piers and bands around recessed glass.
    const floors: Building["floors"] = [];
    const big = spec.glazing === "elevated";
    spec.levels.forEach((lv) => {
      if (lv.kind !== "frame") return;
      const g = new THREE.Group();
      const slabMat = M.slab.clone();
      disposables.push(slabMat);
      const slab: THREE.BufferGeometry[] = [];
      addBox(slab, W + 1.6, 1, D + 1.6, 0, 0.5, 0);
      mesh(slab, slabMat, g);
      const skin: THREE.BufferGeometry[] = [], glass: THREE.BufferGeometry[] = [], inner: THREE.BufferGeometry[] = [];
      const T = 1.4, h = lv.height, wh = big ? 7.2 : 6.4, sill = big ? 1.6 : 2.2, head = 1 + sill + wh, pier = big ? 2.2 : 3;
      const faceX = (z: number, s: number, cols: number) => {
        const pitch = W / cols, ww = pitch - pier;
        addBox(skin, W, sill, T, 0, 1 + sill / 2, z - (s * T) / 2);
        addBox(skin, W, h - head, T, 0, head + (h - head) / 2, z - (s * T) / 2);
        for (let c = 0; c <= cols; c++) addBox(skin, pier, wh, T, -hw + c * pitch + (c === 0 ? pier / 2 : c === cols ? -pier / 2 : 0), 1 + sill + wh / 2, z - (s * T) / 2);
        for (let c = 0; c < cols; c++) addBox(glass, ww, wh, 0.3, -hw + pitch * (c + 0.5), 1 + sill + wh / 2, z - s * (T + 0.15));
      };
      const faceZ = (x: number, s: number, cols: number) => {
        const pitch = D / cols, ww = pitch - pier;
        addBox(skin, T, sill, D, x - (s * T) / 2, 1 + sill / 2, 0);
        addBox(skin, T, h - head, D, x - (s * T) / 2, head + (h - head) / 2, 0);
        for (let c = 0; c <= cols; c++) addBox(skin, T, wh, pier, x - (s * T) / 2, 1 + sill + wh / 2, -hd + c * pitch + (c === 0 ? pier / 2 : c === cols ? -pier / 2 : 0));
        for (let c = 0; c < cols; c++) addBox(glass, 0.3, wh, ww, x - s * (T + 0.15), 1 + sill + wh / 2, -hd + pitch * (c + 0.5));
      };
      const colsX = Math.max(4, Math.round(W / 11.25)), colsZ = Math.max(3, Math.round(D / 11));
      faceX(hd, 1, colsX); faceX(-hd, -1, colsX); faceZ(hw, 1, colsZ); faceZ(-hw, -1, colsZ);
      addBox(inner, W - 2 * T - 0.8, h - 1, D - 2 * T - 0.8, 0, 1 + (h - 1) / 2, 0);
      mesh(skin, M.white, g); mesh(glass, M.glass, g, false); mesh(inner, M.inner, g, false);
      if (spec.balconies) {
        const bal: THREE.BufferGeometry[] = [];
        const pitch = W / colsX;
        for (let c = 1; c < colsX; c += 3) {
          const x = -hw + pitch * (c + 1);
          addBox(bal, pitch * 1.6, 0.7, 5.5, x, 1.35, hd + 2.75);
          addBox(bal, pitch * 1.6, 0.25, 0.25, x, 4.6, hd + 5.4);
          addBox(bal, 0.25, 3.2, 0.25, x - pitch * 0.8 + 0.2, 3.1, hd + 5.4);
          addBox(bal, 0.25, 3.2, 0.25, x + pitch * 0.8 - 0.2, 3.1, hd + 5.4);
        }
        mesh(bal, M.slab, g);
      }
      g.position.y = lv.base;
      g.visible = false;
      root.add(g);
      floors.push({ g, base: lv.base, slab: slabMat });
    });

    // Roof: parapet, elevator bulkhead, rooftop units.
    const roof = new THREE.Group();
    roof.position.y = spec.height;
    {
      const r: THREE.BufferGeometry[] = [];
      addBox(r, W + 1.4, 1, D + 1.4, 0, 0.5, 0);
      addBox(r, W + 1.4, 3, 1, 0, 2.5, hd + 0.2);
      addBox(r, W + 1.4, 3, 1, 0, 2.5, -hd - 0.2);
      addBox(r, 1, 3, D + 1.4, hw + 0.2, 2.5, 0);
      addBox(r, 1, 3, D + 1.4, -hw - 0.2, 2.5, 0);
      if (spec.elevators) addBox(r, 10 + spec.elevators.cars * 8, 11, 18, W * 0.18, 6.5, -D * 0.08);
      const n = spec.rooftopUnits;
      for (let i = 0; i < n; i++) {
        const row = i % 2, col = Math.floor(i / 2);
        addBox(r, 8, 3.6, 11, -hw + 22 + col * 22, 2.8, row ? -D * 0.24 : D * 0.24);
      }
      mesh(r, M.white, roof);
      const fans: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) {
        const row = i % 2, col = Math.floor(i / 2);
        const f = new THREE.CylinderGeometry(2, 2, 0.4, 20);
        f.translate(-hw + 22 + col * 22, 4.8, row ? -D * 0.24 : D * 0.24);
        fans.push(f);
      }
      if (fans.length) mesh(fans, M.fan, roof, false);
    }
    roof.visible = false;
    root.add(roof);
    built.push({ piles, podium, floors, roof });
  });

  // Light: a daylight sun and soft fill.
  const sun = new THREE.DirectionalLight(0xffffff, 3.1);
  const reach = Math.max(span, D) * 1.6 + 120;
  sun.position.set(-reach * 0.5, reach, reach);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 10, far: reach * 4 });
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.8;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xe4dfd3, 0.3));

  // Camera: long lens at a three-quarter view, sized to the building.
  const camera = new THREE.PerspectiveCamera(17, 16 / 9, 10, 20000);
  const target = new THREE.Vector3(offsets.length > 1 ? 0 : 6, spec.height * 0.25 - siteDepth * 0.26, 6);
  const radius = Math.hypot(span / 2 + 20, spec.height + siteDepth * 0.7, hd + 20) * 0.6;
  const place = (t: number) => {
    const az = 0.6 + 0.09 * inOut(clamp(t / 6));
    const el = 0.33;
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const dist = radius / Math.sin(Math.min(vHalf, hHalf));
    camera.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    camera.lookAt(target);
  };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let ao: GTAOPass | null = null;
  if (opts.occlusion) {
    ao = new GTAOPass(scene, camera, 800, 400);
    ao.updateGtaoMaterial({ radius: 5, distanceExponent: 1.4, thickness: 2.5, scale: 1.25, samples: 16 });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 16 });
    composer.addPass(ao);
  }
  composer.addPass(new OutputPass());

  // The assembly: piles drive, the podium rises, floors drop in, the roof lands.
  const pileCount = Math.max(...built.map((b) => b.piles.length), 0);
  const PILE_DUR = 0.55;
  const pileEnd = pileCount ? 0.2 + (pileCount - 1) * 0.07 + PILE_DUR : 0.2;
  const podiumAt = pileEnd - 0.1;
  const frames = built[0]?.floors.length ?? 0;
  const floorAt = podiumAt + 0.5;
  const FLOOR_DUR = 0.62;
  const roofAt = floorAt + Math.max(0, frames - 1) * 0.2 + FLOOR_DUR - 0.1;
  const duration = roofAt + 0.5 + 0.8;

  const pose = (t: number) => {
    built.forEach((b) => {
      b.piles.forEach((p, i) => {
        const d = 0.2 + i * 0.07, q = clamp((t - d) / PILE_DUR);
        p.visible = q > 0.001;
        p.scale.y = Math.max(0.0001, q < 1 ? outBack(q) : 1);
        p.material.color.copy(BLUE).lerp(WHITE, outCubic(clamp((t - d - PILE_DUR - 0.15) / 0.45)));
      });
      const pq = outCubic(clamp((t - podiumAt) / 0.6));
      b.podium.visible = pq > 0.001;
      b.podium.scale.y = Math.max(0.0001, pq);
      b.floors.forEach((f, i) => {
        const d = floorAt + i * 0.2, q = clamp((t - d) / FLOOR_DUR);
        f.g.visible = q > 0.001;
        f.g.position.y = f.base + (1 - outCubic(q)) * 24;
        f.slab.color.copy(BLUE).lerp(WHITE, outCubic(clamp((t - d - FLOOR_DUR) / 0.4)));
      });
      const r = clamp((t - roofAt) / 0.5);
      b.roof.visible = r > 0.001;
      b.roof.scale.setScalar(Math.max(0.0001, r < 1 ? outBack(r) : 1));
    });
    service.visible = t >= roofAt;
    place(t);
  };

  return {
    pose,
    render: () => composer.render(),
    resize: (w, h) => {
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      composer.dispose();
      renderer.dispose();
    },
    duration,
  };
}
