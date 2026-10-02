// LA-1459. The Section: a schematic building section drawn as line work from
// the budget's own facts and the Design and Engineering criteria (LA-1456,
// brief-v3-section.md). Not a design. Ported from the approved frames'
// tools/section.mjs (tag approved-2026-10-02).
//
// Every element is placed by a fact (story count, below grade, framing,
// foundation, parking, demolition, elevators, balconies, storefront, glazing
// band, service size) and owned by a ledger row, so a layer can be drawn or
// left undrawn by row: one `<g data-layer="<row key>">` per row that owns a
// layer. The title block, key plan, notes and criteria callouts carry
// `data-part` instead. Proportions are the diagram's own; nothing here is
// measured in feet, and the title block says so on its face.
//
// Pure: a function of its input to an SVG string. No clock, no DOM.

export type SectionTheme = "sheet" | "band";

/**
 * What is drawn around the building. "desk" is the whole sheet; "plain" drops
 * the plain notes and level marks (the peak); "phone" is the drawing alone,
 * cropped to the building. The page draws "desk" and "plain" and crops to the
 * phone with the viewBox the SVG carries in `data-vb-phone`.
 */
export type SectionVariant = "desk" | "plain" | "phone";

export type SectionInk = "full" | "light";

export type SectionFacts = {
  project: string;
  version: number;
  /** The issue date in words. */
  date: string;
  stories: number;
  belowGrade: boolean;
  units: number | null;
  /** The gross area in words, "64,000 SF", or null when not stated. */
  grossArea: string | null;
  parking: string | null;
  demolition: boolean;
  elevators: number;
  elevatorType: string | null;
  jack: string | null;
  machineRooms: number;
  balconies: boolean;
  storefront: boolean;
  /** The building form from criterion A-2, for the key plan's caption. */
  form: string | null;
};

export type SectionCriterion = { code: string; value: string };

export type SectionNotes = {
  /** The ink key, when the drawing shows two inks. */
  ink?: string | null;
  /** Priced rows with no layer to draw, named in the notes instead. */
  noLayer?: readonly { key: string; label: string }[];
};

export type SectionOptions = {
  facts: SectionFacts;
  /** Layer keys to draw. Every layer when absent. */
  drawn?: ReadonlySet<string>;
  /** Ink per layer key; full when absent. */
  ink?: ReadonlyMap<string, SectionInk>;
  theme?: SectionTheme;
  variant?: SectionVariant;
  criteria?: readonly SectionCriterion[];
  /** `framing: n` draws the wood frame up to story n: the frame going up. */
  partial?: { framing?: number };
  notes?: SectionNotes;
  /** A prefix for the pattern ids, so several sections share one document. */
  idPrefix?: string;
  /** False leaves the `<style>` out of the SVG; the page then holds `sectionStyle()` in its head. */
  styleInSvg?: boolean;
  /** When set, each criterion callout carries `data-el="<prefix><code>"`, so one drawing on the page owns the criteria's ids. */
  calloutEl?: string;
};

/** Every layer a ledger row can own, by row key, in the words the page uses. */
export const LAYERS: Readonly<Record<string, string>> = {
  "element:demolition": "Grade, the earth, and the structure that came down (dashed, light ink)",
  "line:2": "Spread footings, foundation walls and the slab on grade, hatched concrete",
  "line:3a": "Floor topping on every framed floor",
  "line:6": "Masonry veneer at the base story, both faces",
  "line:7": "Stair stringers and treads in the core, the entry canopy",
  "line:8": "Floor plates, bearing walls and roof framing, story by story; the story count",
  "line:11": "Balconies on one face with their rails and screens",
  "line:12": "Insulation in the exterior walls, dampproofing on the foundation walls",
  "line:13": "Roof membrane and parapet caps",
  "line:14": "The envelope line on both faces",
  "line:15": "Door openings cut in the corridor walls on every floor",
  "line:16": "Storefront glazing across the base story on the street face",
  "line:16a": "Window openings cut in the exterior walls on every floor: the glazing band, balcony doors",
  "line:17": "Interior partitions and ceilings on every floor",
  "line:19": "The floor finish line in every unit",
  "line:24": "Base and wall cabinets in every unit",
  "element:elevator": "Two shafts, the pit, two cars, in-ground hydraulic jacks, the machine room, the bulkhead",
  "line:27": "Fire protection riser with a branch and heads on every floor",
  "line:28": "Plumbing riser",
  "line:30": "Mechanical riser",
  "line:31": "The service from the street, the service gear, and the riser",
  "line:31a": "Low voltage riser",
  "line:32": "Fire alarm riser",
  "line:34": "Excavation limits around the footings, the parking subgrade",
  "line:37": "Ground cover at grade on the garden face",
  "line:38": "Asphalt paving over its base course: the surface parking",
  "line:39": "Curb and walk",
};

export const DIAGRAM_LINE = "Scope Diagram. Drawn from the budget's own lines. Not a design.";

// The sheet and the building, in sheet units. Proportions only.
const G = {
  W: 1000,
  H: 640,
  border: 14,
  x0: 330,
  x1: 740,
  grade: 430,
  floor: 10,
  plenum: 18,
  parapet: 14,
  roof: 10,
  bulkhead: 14,
  extWall: 8,
  corrL: [470, 476] as const,
  corrR: [500, 506] as const,
  chase: [506, 522] as const,
  stair: [522, 576] as const,
  stairWall: 4,
  shafts: [576, 660] as const,
  shaftWall: 4,
  shaftGap: 4,
  machineRoom: [664, 702] as const,
  elecRoom: [338, 378] as const,
  partsLeft: [356, 402, 440] as const,
  partsRight: [700] as const,
  cabL: [378, 402] as const,
  cabR: [676, 696] as const,
  parking: [60, 300] as const,
  curb: [300, 308] as const,
  walk: [308, 330] as const,
  balcony: 32,
  footingW: 32,
  footingH: 12,
  pitSlab: 10,
  well: 80,
  earthBot: 626,
  tb: { x: 626, y: 548, w: 360, h: 78 },
  keyplan: { x: 470, y: 572, w: 110, h: 22 },
  noteL: 262,
  noteR: 830,
};

const n2 = (n: number) => Math.round(n * 100) / 100;
const mid = (pair: readonly [number, number]) => (pair[0] + pair[1]) / 2;
const esc = (s: string | number) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function wrapWords(text: string, max: number): string[] {
  const out: string[] = [];
  let cur = "";
  for (const w of text.split(" ")) {
    if ((cur + " " + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * The drawing's own style rules, scoped to one instance by its id. Inside the
 * SVG by default; a page that holds several drawings puts them in its head
 * instead, so no `<style>` sits in the body.
 */
export function sectionStyle(idPrefix: string, theme: SectionTheme = "sheet"): string {
  const sheet = theme === "band" ? "#0B0B0A" : "#FFFFFF";
  const id = `#${idPrefix}`;
  return `
  ${id} .s { fill: none; stroke-linecap: butt; stroke-linejoin: miter; vector-effect: non-scaling-stroke; }
  ${id} .w3 { stroke-width: 1.6px; } ${id} .w2 { stroke-width: 1px; } ${id} .w1 { stroke-width: 0.55px; }
  ${id} .t { font-family: "Open Sans", -apple-system, "Segoe UI", Arial, sans-serif; font-weight: 400; paint-order: stroke; stroke: ${sheet}; stroke-width: 3; stroke-linejoin: round; }
  ${id} .tb { font-weight: 600; } ${id} .tn { font-variant-numeric: tabular-nums; }
`;
}

/** Draws the section. Returns the `<svg>` element as a string. */
export function drawSection(opts: SectionOptions): string {
  const { facts, theme = "sheet", variant = "desk", criteria = [], partial = {}, notes = {} } = opts;
  const drawn = opts.drawn ?? null;
  const ink = opts.ink ?? new Map<string, SectionInk>();
  const pid = opts.idPrefix ?? "sec";
  const dark = theme === "band";
  const C = dark
    ? { sheet: "#0B0B0A", ink: "#F4F3EE", ink2: "#BDBCB3", light: "#7A7972", lightText: "#9E9D94", earth: "#3D3C38", conc: "#A9A8A0", concLight: "#5E5D57", fill: "#1A1A18", tag: "#0B0B0A" }
    : { sheet: "#FFFFFF", ink: "#121211", ink2: "#55544E", light: "#A6A59D", lightText: "#6B6A64", earth: "#CBCAC2", conc: "#55544E", concLight: "#B3B2AA", fill: "#EEEDE8", tag: "#FFFFFF" };

  // The story count sets the frame; a tall building shortens each story so the sheet still holds it.
  const stories = Math.max(1, Math.min(40, Math.round(Number(facts.stories)) || 1));
  const storyH = stories > 6 ? Math.max(14, Math.floor(330 / (stories + 0.5))) : 54;
  const k = storyH / 54;
  const floorT = Math.max(3, Math.round(G.floor * k));
  const plenum = Math.max(4, Math.round(G.plenum * k));
  const belowGrade = facts.belowGrade;
  // Top of floor k's plate. Floor 1 sits at grade; a basement sits one story below it.
  const groundTop = G.grade - 4;
  const F = (n: number) => groundTop - (n - 1) * storyH;
  const slabTop = belowGrade ? groundTop + storyH : groundTop;
  const slabBot = slabTop + 10;
  const footingBot = slabBot + 44;
  const pitBot = slabBot + 34;
  const roofTop = F(stories + 1);
  const parapetTop = roofTop - G.parapet;
  const bulkheadTop = parapetTop - G.bulkhead;
  const ceil = (n: number) => F(n + 1) + floorT + plenum;
  const has = (key: string) => (drawn ? drawn.has(key) : true);
  const col = (key: string) => (ink.get(key) === "light" ? C.light : C.ink);
  const txt = (key: string) => (ink.get(key) === "light" ? C.lightText : C.ink2);
  const phone = variant === "phone";
  const withNotes = variant === "desk";
  const framedTo = Math.min(partial.framing ?? stories, stories);
  const topFramed = framedTo >= stories ? roofTop : F(framedTo + 1) + floorT;
  const story = (n: number) => ` data-story="${n}"`;
  const out: string[] = [];
  const L = (s: string) => out.push(s);

  const line = (x1: number, y1: number, x2: number, y2: number, w: string, color: string, extra = "") =>
    `<line x1="${n2(x1)}" y1="${n2(y1)}" x2="${n2(x2)}" y2="${n2(y2)}" class="s ${w}" stroke="${color}"${extra}/>`;
  const rect = (x: number, y: number, w: number, h: number, cls: string, color: string, fill = "none", extra = "") =>
    `<rect x="${n2(x)}" y="${n2(y)}" width="${n2(w)}" height="${n2(h)}" class="s ${cls}" stroke="${color}" fill="${fill}"${extra}/>`;
  const poly = (pts: [number, number][], cls: string, color: string, fill = "none", extra = "") =>
    `<path d="M${pts.map((p) => `${n2(p[0])} ${n2(p[1])}`).join(" L")}" class="s ${cls}" stroke="${color}" fill="${fill}"${extra}/>`;
  const text = (x: number, y: number, s: string, size: number, color: string, extra = "") => {
    const m = /\s*class="([^"]*)"/.exec(extra);
    const cls = m ? m[1] : "t";
    const ex = m ? extra.replace(m[0], "") : extra;
    return `<text x="${n2(x)}" y="${n2(y)}" class="${cls}" font-size="${size}" fill="${color}"${ex}>${esc(s)}</text>`;
  };
  const dash = (a: number, b: number) => ` stroke-dasharray="${a} ${b}"`;
  const group = (key: string, inner: string[], label: string) =>
    inner.length ? `<g data-layer="${esc(key)}" data-ink="${ink.get(key) === "light" ? "light" : "full"}" aria-label="${esc(label)}">\n${inner.join("\n")}\n</g>` : "";
  const part = (name: string, inner: string[]) => (inner.length ? `<g data-part="${name}">\n${inner.join("\n")}\n</g>` : "");
  const url = (name: string) => `url(#${pid}-${name})`;

  // The phone crops to the building; the sheet shows the whole drawing.
  const cropTop = bulkheadTop - 34;
  const cropBot = pitBot + G.pitSlab + G.well + 24;
  const vbPhone = [40, cropTop, 920, cropBot - cropTop];
  const vbDesk = [0, 0, G.W, G.H];
  const vb = phone ? vbPhone : vbDesk;
  // The floor tops, the grade and the plate thickness ride on the root, so the
  // page can raise the story bracket with the frame without redrawing.
  const floorTops = Array.from({ length: stories + 1 }, (_, i) => n2(F(i + 1))).join(" ");
  L(
    `<svg xmlns="http://www.w3.org/2000/svg" id="${esc(pid)}" viewBox="${vb.join(" ")}" data-vb-desk="${vbDesk.join(" ")}" data-vb-phone="${vbPhone.join(" ")}" data-stories="${stories}" data-floor-tops="${floorTops}" data-floor-t="${floorT}" data-grade="${G.grade}" role="img" aria-label="Scope diagram, building section, drawn from the budget's own lines. Not a design." shape-rendering="geometricPrecision">`,
  );
  L(`<defs>
  <pattern id="${pid}-earth" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="8" stroke="${C.earth}" stroke-width="0.9"/></pattern>
  <pattern id="${pid}-conc" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.5" r="0.6" fill="${C.conc}"/><circle cx="4.4" cy="4.6" r="0.6" fill="${C.conc}"/><path d="M2.2 4.4 l1.2 -1.6 l0.9 1.6 z" fill="${C.conc}"/></pattern>
  <pattern id="${pid}-conc-light" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.5" r="0.6" fill="${C.concLight}"/><circle cx="4.4" cy="4.6" r="0.6" fill="${C.concLight}"/><path d="M2.2 4.4 l1.2 -1.6 l0.9 1.6 z" fill="${C.concLight}"/></pattern>
  <pattern id="${pid}-mas" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="3" stroke="${C.ink}" stroke-width="0.6"/></pattern>
  <pattern id="${pid}-gravel" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2.5" r="1.1" fill="none" stroke="${C.ink2}" stroke-width="0.5"/><circle cx="5.5" cy="5.5" r="0.8" fill="none" stroke="${C.ink2}" stroke-width="0.5"/></pattern>
  <pattern id="${pid}-ins" width="5" height="8" patternUnits="userSpaceOnUse"><path d="M0 0 L5 4 L0 8" fill="none" stroke="${C.ink2}" stroke-width="0.5"/></pattern>
</defs>
${opts.styleInSvg === false ? "" : `<style>${sectionStyle(pid, theme)}</style>`}`);
  L(`<rect x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}" fill="${C.sheet}"/>`);

  type Note = { key: string; from: [number, number]; to: [number, number]; label: string | string[] };
  const notesOut: Note[] = [];
  const note = (key: string, from: [number, number], to: [number, number], label: string | string[]) => {
    if (withNotes) notesOut.push({ key, from, to, label });
  };

  const footingsAt = [G.x0 + G.extWall / 2, G.x1 - G.extWall / 2];
  const thickenedAt = [mid(G.corrL), mid(G.corrR), G.stair[0] + G.stairWall / 2, G.stair[1] - G.stairWall / 2];
  const concrete = (key: string) => (ink.get(key) === "light" ? url("conc-light") : url("conc"));

  // --- 02 Demolition: the site as found. The earth and the structure that came down.
  if (has("element:demolition")) {
    const g: string[] = [];
    g.push(`<rect x="${G.border + 8}" y="${G.grade}" width="${G.W - 2 * G.border - 16}" height="${G.earthBot - G.grade}" fill="${url("earth")}"/>`);
    if (facts.demolition) {
      const lc = (ink.get("element:demolition:structure") ?? ink.get("line:1a")) === "light" ? C.light : C.ink;
      const [px0, px1] = [G.parking[0] + 10, G.parking[0] + 150];
      const top = G.grade - 46;
      g.push(rect(px0, top, px1 - px0, 46, "w2", lc, "none", dash(5, 4)));
      g.push(line(px0, top + 8, px1, top + 8, "w1", lc, dash(5, 4)));
      g.push(line((px0 + px1) / 2, top + 8, (px0 + px1) / 2, G.grade, "w1", lc, dash(5, 4)));
      note("element:demolition", [px0 + 20, top], [px0 + 36, top - 30], "Existing Structure, Removed");
    }
    L(group("element:demolition", g, "02 Demolition"));
  }
  // The grade line is the sheet's own ground: drawn before any row, so the sheet is never blank.
  L(part("grade", [line(G.border + 8, G.grade, G.W - G.border - 8, G.grade, "w3", C.ink)]));

  // --- 03 Concrete: spread footings, foundation walls, the slab, a basement when there is one.
  if (has("line:2")) {
    const g: string[] = [];
    const c = col("line:2");
    const H = concrete("line:2");
    if (belowGrade) {
      g.push(`<rect x="${G.x0}" y="${n2(F(1) + floorT)}" width="${G.x1 - G.x0}" height="${n2(slabTop - F(1) - floorT)}" fill="${C.sheet}"/>`);
      g.push(rect(G.x0, F(1), G.x1 - G.x0, floorT, "w2", c, H));
    }
    const slab = (xa: number, xb: number) => g.push(rect(xa, slabTop, xb - xa, slabBot - slabTop, "w2", c, H));
    if (has("element:elevator") && facts.elevators > 0) {
      slab(G.x0, G.shafts[0]);
      slab(G.shafts[1], G.x1);
    } else slab(G.x0, G.x1);
    const stemTop = belowGrade ? F(1) + floorT : slabBot;
    for (const x of footingsAt) {
      g.push(rect(x - G.extWall / 2, stemTop, G.extWall, footingBot - G.footingH - stemTop, "w2", c, H));
      g.push(rect(x - G.footingW / 2, footingBot - G.footingH, G.footingW, G.footingH, "w2", c, H));
    }
    for (const x of thickenedAt) g.push(rect(x - 11, slabBot, 22, 8, "w2", c, H));
    note("line:2", [G.x1 - 40, slabTop + 5], [G.noteR, slabTop + 30], belowGrade ? "Basement Slab" : "Slab on Grade");
    L(group("line:2", g, "03 Concrete"));
  }

  // --- 04 Masonry: veneer at the base story on both faces.
  if (has("line:6")) {
    const g: string[] = [];
    const c = col("line:6");
    const top = F(2) + floorT;
    g.push(rect(G.x0 - 6, top, 6, G.grade - top, "w2", c, url("mas")));
    g.push(rect(G.x1, top, 6, G.grade - top, "w2", c, url("mas")));
    L(group("line:6", g, "04 Masonry"));
  }

  // --- 05 Metals: stair flights in the core, each as its story is framed, and the entry canopy.
  if (has("line:7")) {
    const g: string[] = [];
    const c = col("line:7");
    const [sx0, sx1] = [G.stair[0] + G.stairWall, G.stair[1] - G.stairWall];
    const risers = 9;
    for (let n = 1; n <= stories - 1; n++) {
      if (n > framedTo - 1) break;
      const rise = (F(n) - F(n + 1)) / risers;
      const run = (sx1 - sx0 - 8) / risers;
      const ltr = n % 2 === 1;
      const pts: [number, number][] = [];
      for (let i = 0; i <= risers; i++) {
        const x = ltr ? sx0 + 4 + i * run : sx1 - 4 - i * run;
        const y = F(n) - i * rise;
        pts.push([x, y]);
        if (i < risers) pts.push([x, y - rise]);
      }
      g.push(poly(pts, "w1", c, "none", story(n + 1)));
      const a = pts[0], b = pts[pts.length - 1];
      g.push(line(a[0], a[1] + 1, b[0], b[1] + 7, "w2", c, story(n + 1)));
    }
    const cy = ceil(1) + 2;
    g.push(line(G.x0, cy, G.x0 - 36, cy, "w2", c));
    g.push(line(G.x0 - 32, cy, G.x0, cy - 22, "w1", c));
    L(group("line:7", g, "05 Metals"));
  }

  // --- 06 Wood Framing: floor plates, bearing walls, roof framing, story by story.
  if (has("line:8")) {
    const g: string[] = [];
    const c = col("line:8");
    const wallsX: [number, number][] = [
      [G.x0, G.extWall],
      [G.x1 - G.extWall, G.extWall],
      [G.corrL[0], 6],
      [G.corrR[0], 6],
      [G.stair[0], G.stairWall],
      [G.stair[1] - G.stairWall, G.stairWall],
    ];
    for (let n = 1; n <= framedTo; n++) {
      const yTop = F(n + 1) + floorT, yBot = F(n);
      for (const [x, w] of wallsX) g.push(rect(x, yTop, w, yBot - yTop, "w2", c, C.sheet, story(n)));
      if (n + 1 <= stories && n < framedTo) g.push(rect(G.x0, F(n + 1), G.x1 - G.x0, floorT, "w2", c, C.sheet, story(n + 1)));
    }
    if (framedTo >= stories) {
      const rx1 = facts.balconies ? G.x1 + G.balcony : G.x1;
      g.push(rect(G.x0, roofTop, rx1 - G.x0, G.roof, "w2", c, C.sheet, story(stories)));
      g.push(rect(G.x0, parapetTop, G.extWall, G.parapet, "w2", c, C.sheet, story(stories)));
      g.push(rect(G.x1 - G.extWall, parapetTop, G.extWall, G.parapet, "w2", c, C.sheet, story(stories)));
    }
    // The story bracket: a count, not a dimension.
    if (!phone) {
      const bx = G.x0 - 24;
      g.push(line(bx, G.grade, bx, topFramed, "w1", C.ink2, ` data-bracket-line=""`));
      for (let n = 1; n <= stories; n++) if (F(n) >= topFramed) g.push(line(bx - 4, F(n), bx + 4, F(n), "w1", C.ink2, story(n)));
      g.push(line(bx - 4, topFramed, bx + 4, topFramed, "w1", C.ink2, ` data-bracket-cap=""`));
      const label = framedTo >= stories ? `${stories} Stories Above Grade` : `Story ${framedTo} of ${stories}`;
      const ty = (G.grade + topFramed) / 2;
      g.push(text(bx - 8, ty, label, 12, C.ink2, ` text-anchor="middle" transform="rotate(-90 ${bx - 8} ${ty})" data-bracket=""`));
    }
    L(group("line:8", g, "06 Wood Framing"));
  }

  // --- 06 Balconies on one face, rails and screens.
  if (has("line:11") && facts.balconies) {
    const g: string[] = [];
    const c = col("line:11");
    const xe = G.x1 + G.balcony;
    for (let n = 2; n <= framedTo; n++) {
      const y = F(n);
      g.push(rect(G.x1, y, G.balcony, 6, "w2", c, C.sheet, story(n)));
      g.push(line(xe - 2, y, xe - 2, y - 26, "w2", c, story(n)));
      g.push(line(G.x1, y - 26, xe, y - 26, "w2", c, story(n)));
      const above = n < stories ? F(n + 1) + 6 : roofTop + G.roof;
      g.push(line(xe - 2, y - 26, xe - 2, above, "w1", c, dash(2, 2) + story(n)));
    }
    const at = Math.min(4, stories);
    note("line:11", [xe - 2, F(at) - 12], [G.noteR, F(at) - 30], "Balconies, Screened");
    L(group("line:11", g, "06 Balconies"));
  }

  // --- 07 Insulation in the exterior walls, dampproofing on the foundation walls.
  if (has("line:12")) {
    const g: string[] = [];
    const c = col("line:12");
    for (let n = 1; n <= framedTo; n++) {
      const yTop = F(n + 1) + floorT, yBot = F(n);
      g.push(`<rect x="${G.x0 + 1.5}" y="${n2(yTop + 1)}" width="5" height="${n2(yBot - yTop - 2)}" fill="${url("ins")}"${story(n)}/>`);
      g.push(`<rect x="${G.x1 - G.extWall + 1.5}" y="${n2(yTop + 1)}" width="5" height="${n2(yBot - yTop - 2)}" fill="${url("ins")}"${story(n)}/>`);
    }
    for (const x of footingsAt) {
      const side = x < G.W / 2 ? -1 : 1;
      const xx = x + side * (G.extWall / 2 + 1.2);
      g.push(line(xx, G.grade, xx, footingBot - G.footingH, "w2", c, dash(3, 2)));
    }
    L(group("line:12", g, "07 Insulation and Dampproofing"));
  }

  // --- 07 Roofing: membrane and parapet caps.
  if (has("line:13") && framedTo >= stories) {
    const g: string[] = [];
    const c = col("line:13");
    const rx1 = facts.balconies ? G.x1 + G.balcony : G.x1;
    g.push(line(G.x0 + G.extWall, roofTop - 1.2, rx1, roofTop - 1.2, "w3", c));
    g.push(line(G.x0 - 2, parapetTop - 1, G.x0 + G.extWall + 2, parapetTop - 1, "w3", c));
    g.push(line(G.x1 - G.extWall - 2, parapetTop - 1, G.x1 + 2, parapetTop - 1, "w3", c));
    note("line:13", [G.x0 + 70, roofTop - 1], [G.noteL, roofTop - 20], "Roof Membrane");
    L(group("line:13", g, "07 Roofing"));
  }

  // --- 07 Siding: the envelope line on both faces.
  if (has("line:14")) {
    const g: string[] = [];
    const c = col("line:14");
    const top = framedTo >= stories ? parapetTop : topFramed;
    const base = has("line:6") ? F(2) + floorT : G.grade;
    g.push(line(G.x0 - 2, top, G.x0 - 2, base, "w3", c));
    g.push(line(G.x1 + 2, top, G.x1 + 2, base, "w3", c));
    L(group("line:14", g, "07 Siding"));
  }

  // --- 08 Doors: unit entry doors cut in the corridor walls.
  if (has("line:15")) {
    const g: string[] = [];
    const c = col("line:15");
    for (let n = 1; n <= framedTo; n++) {
      const yb = F(n) - 1, yt = F(n) - Math.min(34, storyH - 12);
      for (const [x, w] of [
        [G.corrL[0], 6],
        [G.corrR[0], 6],
      ] as const) {
        g.push(`<rect x="${x - 0.5}" y="${n2(yt)}" width="${w + 1}" height="${n2(yb - yt)}" fill="${C.sheet}"${story(n)}/>`);
        g.push(line(x, yt, x + w, yt, "w2", c, story(n)));
        g.push(line(x + w / 2, yt, x + w / 2, yb, "w1", c, story(n)));
      }
    }
    L(group("line:15", g, "08 Doors"));
  }

  // --- 08 Storefront: a glazing band across the base story on the street face.
  if (has("line:16") && facts.storefront) {
    const g: string[] = [];
    const c = col("line:16");
    const head = ceil(1) + 4, sill = F(1) - 2;
    g.push(`<rect x="${G.x0 - 0.5}" y="${n2(head)}" width="${G.extWall + 1}" height="${n2(sill - head)}" fill="${C.sheet}"/>`);
    g.push(line(G.x0 - 1, head, G.x0 + G.extWall + 1, head, "w2", c));
    g.push(line(G.x0 + G.extWall / 2, head, G.x0 + G.extWall / 2, sill, "w2", c));
    g.push(line(G.x0 + G.extWall / 2 - 2, head, G.x0 + G.extWall / 2 - 2, sill, "w1", c));
    g.push(line(G.x0 + G.extWall / 2 + 2, head, G.x0 + G.extWall / 2 + 2, sill, "w1", c));
    note("line:16", [G.x0 + 2, (head + sill) / 2], [G.noteL, (head + sill) / 2], "Storefront");
    L(group("line:16", g, "08 Storefront"));
  }

  // --- 08 Windows: the glazing band cut in the exterior walls; balcony doors on the balcony face.
  if (has("line:16a")) {
    const g: string[] = [];
    const c = col("line:16a");
    for (let n = 1; n <= framedTo; n++) {
      if (n === 1 && facts.storefront && has("line:16")) {
        const head = ceil(1) + 6, sill = F(1) - 14;
        const x = G.x1 - G.extWall;
        g.push(`<rect x="${x - 0.5}" y="${n2(head)}" width="${G.extWall + 1}" height="${n2(sill - head)}" fill="${C.sheet}"${story(n)}/>`);
        g.push(line(x - 1, head, x + G.extWall + 1, head, "w2", c, story(n)));
        g.push(line(x - 1, sill, x + G.extWall + 1, sill, "w2", c, story(n)));
        g.push(line(x + G.extWall / 2, head, x + G.extWall / 2, sill, "w1", c, story(n)));
        continue;
      }
      const head = ceil(n) + 6, sill = F(n) - Math.min(14, storyH / 4);
      const faces: [number, boolean][] = [
        [G.x0, false],
        [G.x1 - G.extWall, facts.balconies && n >= 2],
      ];
      for (const [x, door] of faces) {
        const yb = door ? F(n) - 1 : sill;
        g.push(`<rect x="${x - 0.5}" y="${n2(head)}" width="${G.extWall + 1}" height="${n2(yb - head)}" fill="${C.sheet}"${story(n)}/>`);
        g.push(line(x - 1, head, x + G.extWall + 1, head, "w2", c, story(n)));
        g.push(line(x - 1, yb, x + G.extWall + 1, yb, "w2", c, story(n)));
        g.push(line(x + G.extWall / 2, head, x + G.extWall / 2, yb, "w1", c, story(n)));
      }
    }
    L(group("line:16a", g, "08 Windows"));
  }

  // --- 09 Drywall: partitions and ceilings on every floor.
  if (has("line:17")) {
    const g: string[] = [];
    const c = col("line:17");
    for (let n = 1; n <= framedTo; n++) {
      const cy = ceil(n), yb = F(n);
      g.push(line(G.x0 + G.extWall, cy, G.corrL[0], cy, "w1", c, story(n)));
      g.push(line(G.corrL[1], cy + 4, G.corrR[0], cy + 4, "w1", c, story(n)));
      g.push(line(G.shafts[1], cy, G.x1 - G.extWall, cy, "w1", c, story(n)));
      const parts = n === 1 ? [G.elecRoom[1], G.machineRoom[1], ...G.partsLeft.slice(1)] : [...G.partsLeft, ...G.partsRight];
      for (const x of parts) g.push(rect(x - 1.5, cy, 3, yb - cy, "w1", c, C.sheet, story(n)));
      g.push(rect(G.chase[1] - 1.5, cy, 3, yb - cy, "w1", c, C.sheet, story(n)));
    }
    L(group("line:17", g, "09 Drywall and Ceilings"));
  }

  // --- 03 Gypcrete topping, over the slab and on every framed floor; 09 flooring on every floor.
  if (has("line:3a")) {
    const g: string[] = [];
    const c = ink.get("line:3a") === "light" ? C.light : C.ink2;
    for (let n = 1; n <= Math.max(1, framedTo); n++) g.push(rect(G.x0 + G.extWall, F(n) - 3, G.x1 - G.x0 - 2 * G.extWall, 3, "w2", c, C.fill, n === 1 ? "" : story(n)));
    L(group("line:3a", g, "03 Gypcrete"));
  }
  if (has("line:19")) {
    const g: string[] = [];
    const c = col("line:19");
    for (let n = 1; n <= framedTo; n++) {
      const y = n === 1 ? groundTop - 1 : F(n) - 4;
      g.push(line(G.x0 + G.extWall, y, G.corrL[0], y, "w2", c, story(n)));
      g.push(line(G.shafts[1], y, G.x1 - G.extWall, y, "w2", c, story(n)));
    }
    L(group("line:19", g, "09 Flooring"));
  }

  // --- 12 Cabinets in every unit.
  if (has("line:24")) {
    const g: string[] = [];
    const c = col("line:24");
    const cabH = Math.min(13, storyH / 4), wallH = Math.min(12, storyH / 4);
    for (let n = 1; n <= framedTo; n++) {
      const yb = F(n) - (n === 1 ? 0 : 4), cy = ceil(n);
      const [a, b] = G.cabL;
      g.push(rect(a, yb - cabH, b - a, cabH, "w1", c, C.sheet, story(n)));
      g.push(line(a - 2, yb - cabH, b, yb - cabH, "w2", c, story(n)));
      g.push(rect(a + 2, cy + 8, b - a - 2, wallH, "w1", c, C.sheet, story(n)));
      if (n >= 2) {
        const [ra, rb] = G.cabR;
        g.push(rect(ra, yb - cabH, rb - ra, cabH, "w1", c, C.sheet, story(n)));
        g.push(rect(ra + 2, cy + 8, rb - ra - 2, wallH, "w1", c, C.sheet, story(n)));
      }
    }
    L(group("line:24", g, "12 Cabinets"));
  }

  // --- 14 Elevator: shafts, pit, cars, hydraulic jacks, machine room, bulkhead.
  const hydraulic = /hydraulic/i.test(facts.elevatorType ?? "");
  const inGround = /in[- ]?ground/i.test(facts.jack ?? "");
  const [sx0, sx1] = G.shafts;
  const cars = Math.max(1, Math.min(facts.elevators, 2));
  const innerW = (sx1 - sx0 - 2 * G.shaftWall - (cars - 1) * G.shaftGap) / cars;
  if (has("element:elevator") && facts.elevators > 0) {
    const g: string[] = [];
    const c = col("element:elevator");
    const H = concrete("element:elevator");
    g.push(rect(sx0, slabTop, G.shaftWall, pitBot + G.pitSlab - slabTop, "w2", c, H));
    g.push(rect(sx1 - G.shaftWall, slabTop, G.shaftWall, pitBot + G.pitSlab - slabTop, "w2", c, H));
    g.push(rect(sx0, pitBot, sx1 - sx0, G.pitSlab, "w2", c, H));
    g.push(rect(sx0, bulkheadTop, G.shaftWall, slabTop - bulkheadTop, "w2", c, C.sheet));
    g.push(rect(sx1 - G.shaftWall, bulkheadTop, G.shaftWall, slabTop - bulkheadTop, "w2", c, C.sheet));
    for (let i = 1; i < cars; i++) {
      const x = sx0 + G.shaftWall + i * innerW + (i - 1) * G.shaftGap;
      g.push(rect(x, bulkheadTop, G.shaftGap, pitBot - bulkheadTop, "w2", c, C.sheet));
    }
    g.push(rect(sx0 - 2, bulkheadTop - 6, sx1 - sx0 + 4, 6, "w2", c, C.sheet));
    for (let i = 0; i < cars; i++) {
      const cx0 = sx0 + G.shaftWall + i * (innerW + G.shaftGap);
      const cxm = cx0 + innerW / 2;
      const landing = i === 0 ? 1 : stories;
      const carBot = F(landing) - (landing === 1 ? 0 : 4);
      const carH = Math.min(30, storyH - 8);
      g.push(rect(cx0 + 5, carBot - carH, innerW - 10, carH, "w2", c, C.sheet));
      g.push(line(cx0 + 5, carBot - carH + 6, cx0 + innerW - 5, carBot - carH + 6, "w1", c));
      if (hydraulic) {
        g.push(line(cxm, carBot, cxm, pitBot, "w2", c));
        if (inGround) {
          g.push(rect(cxm - 5, pitBot + G.pitSlab, 10, G.well, "w1", c, "none", dash(3, 3)));
          g.push(line(cxm, pitBot + G.pitSlab, cxm, pitBot + G.pitSlab + G.well - 10, "w2", c));
          g.push(rect(cxm - 3, pitBot + G.pitSlab + G.well - 10, 6, 4, "w1", c, "none"));
        }
      }
    }
    if (facts.machineRooms > 0) {
      const [mx0, mx1] = G.machineRoom;
      const cy = ceil(1);
      g.push(rect(mx0, cy, mx1 - mx0, F(1) - cy, "w1", c, "none"));
      g.push(rect(mx0 + 8, F(1) - 16, 14, 16, "w1", c, C.sheet));
      g.push(rect(mx0 + 8, F(1) - 20, 10, 4, "w1", c, C.sheet));
      g.push(line(sx1, F(1) - 6, mx0 + 8, F(1) - 6, "w1", c, dash(2, 2)));
    }
    note("element:elevator", [sx1 - 2, bulkheadTop + 4], [G.noteR, bulkheadTop + 4], "Elevator Bulkhead");
    L(group("element:elevator", g, "14 Elevator"));
  }

  // --- 21, 22, 23: fire protection, plumbing and mechanical risers in the chase.
  const chaseX = (i: number) => G.chase[0] + 4 + i * 4;
  const riserTop = framedTo >= stories ? roofTop + G.roof - 2 : topFramed;
  const riser = (key: string, i: number, label: string, dashes?: [number, number]) => {
    if (!has(key)) return;
    const g: string[] = [];
    const c = col(key);
    const x = chaseX(i);
    g.push(line(x, slabBot + 8, x, riserTop, "w1", c, dashes ? dash(...dashes) : ""));
    g.push(`<circle cx="${x}" cy="${n2(riserTop)}" r="1.4" fill="${c}"/>`);
    if (key === "line:27") {
      for (let n = 1; n <= framedTo; n++) {
        const y = ceil(n) - 5;
        g.push(line(x, y, G.x0 + G.extWall + 10, y, "w1", c, story(n)));
        for (let hx = G.x0 + G.extWall + 20; hx < G.corrL[0]; hx += 30) g.push(line(hx, y, hx, y + 3, "w1", c, story(n)));
      }
    }
    L(group(key, g, label));
  };
  riser("line:27", 0, "21 Fire Protection");
  riser("line:28", 1, "22 Plumbing", [4, 2]);
  riser("line:30", 2, "23 Mechanical", [1.5, 1.5]);
  const risersDrawn = (["line:27", "line:28", "line:30"] as const).filter(has);
  if (risersDrawn.length) {
    const words = { "line:27": "Fire Protection", "line:28": "Plumbing", "line:30": "Mechanical" } as const;
    const parts = risersDrawn.map((key) => words[key]);
    note(
      risersDrawn[0],
      [chaseX(1), riserTop - 3],
      [G.noteL, bulkheadTop - 24],
      parts.length > 1 ? [parts.slice(0, -1).join(", "), `and ${parts[parts.length - 1]} Risers`] : [`${parts[0]} Riser`],
    );
  }

  // --- 26 Electrical: the service from the street, the service gear, the riser.
  const gearTop = groundTop - 30;
  if (has("line:31")) {
    const g: string[] = [];
    const c = col("line:31");
    // The service comes in under grade, through the foundation wall, and
    // rises through the slab into the gear: its own line, clear of the wall
    // face the dampproofing and the sills sit on.
    const y = G.grade + 34;
    const riserX = G.elecRoom[0] + 9;
    g.push(line(G.border + 8, y, riserX, y, "w2", c));
    g.push(line(riserX, y, riserX, gearTop + 24, "w2", c));
    g.push(rect(G.elecRoom[0] + 4, gearTop, 10, 24, "w2", c, C.sheet));
    g.push(line(riserX, gearTop, riserX, riserTop, "w1", c));
    L(group("line:31", g, "26 Electrical"));
  }
  const closetRiser = (key: string, dx: number, label: string, dashes: [number, number]) => {
    if (!has(key)) return;
    const c = col(key);
    const x = G.elecRoom[0] + 9 + dx;
    L(group(key, [line(x, groundTop - 8, x, riserTop, "w1", c, dash(...dashes))], label));
  };
  closetRiser("line:31a", 4, "27 Low Voltage", [4, 2]);
  closetRiser("line:32", 8, "28 Fire Alarm", [1.5, 1.5]);

  // --- 31 Site Work: excavation limits, the parking subgrade.
  const surface = /surface/i.test(facts.parking ?? "");
  if (has("line:34")) {
    const g: string[] = [];
    const c = col("line:34");
    const fb = footingBot;
    const xa = G.x0 - G.footingW / 2 - 6, xb = G.x1 + G.footingW / 2 + 6;
    g.push(line(xa, fb + 2, xa - (fb - G.grade), G.grade, "w1", c, dash(6, 3)));
    g.push(line(xb, fb + 2, xb + (fb - G.grade), G.grade, "w1", c, dash(6, 3)));
    g.push(line(xa, fb + 2, xb, fb + 2, "w1", c, dash(6, 3)));
    if (surface) g.push(line(G.parking[0], G.grade + 10, G.parking[1], G.grade + 10, "w1", c));
    L(group("line:34", g, "31 Site Work"));
  }

  // --- 32 Asphalt: the surface parking.
  if (has("line:38") && surface) {
    const g: string[] = [];
    const c = col("line:38");
    const [px0, px1] = G.parking;
    g.push(`<rect x="${px0}" y="${G.grade - 3}" width="${px1 - px0}" height="3" fill="${c}"/>`);
    g.push(rect(px0, G.grade, px1 - px0, 10, "w1", c, url("gravel")));
    g.push(line(px0, G.grade - 3, px1, G.grade - 3, "w3", c));
    note("line:38", [px1 - 30, G.grade - 2], [px1 - 60, G.grade + 50], "Surface Parking");
    L(group("line:38", g, "32 Asphalt"));
  }

  // --- 32 Site concrete: curb and walk.
  if (has("line:39")) {
    const g: string[] = [];
    const c = col("line:39");
    const H = concrete("line:39");
    g.push(rect(G.curb[0], G.grade - 12, G.curb[1] - G.curb[0], 24, "w2", c, H));
    g.push(rect(G.walk[0], G.grade - 5, G.walk[1] - G.walk[0], 6, "w2", c, H));
    L(group("line:39", g, "32 Site Concrete"));
  }

  // --- 32 Landscaping: ground cover at grade on the garden face.
  if (has("line:37")) {
    const g: string[] = [];
    const c = col("line:37");
    const lx0 = G.x1 + G.balcony + 64, lx1 = G.W - G.border - 30;
    let x = lx0, i = 0;
    while (x < lx1) {
      g.push(line(x, G.grade, x + 1.5, G.grade - (3 + (i % 3)), "w1", c));
      x += 5 + (i % 4);
      i++;
    }
    L(group("line:37", g, "32 Landscaping"));
  }

  // --- Level marks on the garden face.
  if (withNotes && has("line:8")) {
    const g: string[] = [];
    const x = G.x1 + G.balcony + 6;
    for (let n = 1; n <= stories; n++) {
      if (F(n) < topFramed) continue;
      g.push(line(x, F(n), x + 8, F(n), "w1", C.ink2, story(n)));
      g.push(text(x + 12, F(n) + 4, `Level ${n}`, 11, C.ink2, story(n)));
    }
    if (framedTo >= stories) {
      g.push(line(x, roofTop, x + 8, roofTop, "w1", C.ink2, ` data-roof=""`));
      g.push(text(x + 12, roofTop + 4, "Roof", 11, C.ink2, ` data-roof=""`));
    }
    L(part("levels", g));
  }

  // --- Plain notes with leaders, each owned by the row that drew what it names.
  const noteG: string[] = [];
  for (const nt of notesOut) {
    const c = txt(nt.key);
    const [fx, fy] = nt.from, [tx, ty] = nt.to;
    const right = tx >= fx;
    const sh = right ? 10 : -10;
    const g: string[] = [];
    g.push(line(fx, fy, tx, ty, "w1", C.ink2));
    g.push(line(tx, ty, tx + sh, ty, "w1", C.ink2));
    g.push(`<circle cx="${n2(fx)}" cy="${n2(fy)}" r="1.6" fill="${C.ink2}"/>`);
    const lines = Array.isArray(nt.label) ? nt.label : [nt.label];
    lines.forEach((ln, i) => g.push(text(tx + sh + (right ? 4 : -4), ty + 4 + i * 15, ln, 12.5, c, right ? "" : ` text-anchor="end"`)));
    noteG.push(`<g data-note="${esc(nt.key)}">\n${g.join("\n")}\n</g>`);
  }
  if (noteG.length) L(part("notes", noteG));

  // --- Criteria callouts: keyed tags with leaders, the way a drawing keys its notes.
  if (!phone && criteria.length) {
    const jackX = sx0 + G.shaftWall + (cars - 1) * (innerW + G.shaftGap) + innerW / 2;
    const at4 = Math.min(4, stories);
    const anchors: Record<string, [number, number, [number, number]]> = {
      "M-0": [G.x0 + 4, ceil(at4) + 16, [G.noteL, ceil(at4) - 2]],
      "A-1": [G.x0 + 4, F(at4) + 30, [G.noteL, F(at4) + 6]],
      "E-1": [G.elecRoom[0] + 9, gearTop + 2, [G.noteL, gearTop - 18]],
      "S-1": [G.x0 + 4, footingBot - 4, [G.noteL, footingBot + 22]],
      "M-1": [chaseX(2), riserTop - 3, [G.noteL, bulkheadTop - 50]],
      "V-1": [sx1 - G.shaftWall - 6, F(stories) - 16, [G.noteR, F(stories) - 36]],
      "V-3": [G.machineRoom[1] - 2, F(1) - 24, [G.noteR, F(1) - 26]],
      "V-2": [jackX, pitBot + G.pitSlab + 40, [G.noteR, pitBot + G.pitSlab + 40]],
    };
    const g: string[] = [];
    for (const cr of criteria) {
      const a = anchors[cr.code];
      if (!a) continue;
      if (cr.code.startsWith("V-") && facts.elevators === 0) continue;
      if (cr.code === "V-2" && !(hydraulic && inGround)) continue;
      if (cr.code === "V-3" && facts.machineRooms === 0) continue;
      const [ax, ay, [tx, ty]] = a;
      const right = tx >= ax;
      const sh = right ? 10 : -10;
      const one: string[] = [];
      one.push(line(ax, ay, tx, ty, "w1", C.ink));
      one.push(line(tx, ty, tx + sh, ty, "w1", C.ink));
      one.push(`<circle cx="${n2(ax)}" cy="${n2(ay)}" r="1.6" fill="${C.ink}"/>`);
      const tagW = 30, tagH = 15;
      const bx = right ? tx + sh + 2 : tx + sh - 2 - tagW;
      one.push(rect(bx, ty - tagH / 2, tagW, tagH, "w1", C.ink, C.tag, ` rx="1.5"`));
      one.push(text(bx + tagW / 2, ty + 4, cr.code, 10, C.ink, ` text-anchor="middle" class="t tb tn"`));
      one.push(text(right ? bx + tagW + 6 : bx - 6, ty + 4, cr.value, 12.5, C.ink, right ? "" : ` text-anchor="end"`));
      g.push(`<g data-callout="${esc(cr.code)}"${opts.calloutEl ? ` data-el="${esc(opts.calloutEl + cr.code)}"` : ""}>\n${one.join("\n")}\n</g>`);
    }
    L(part("criteria", g));
  }

  // --- Key plan: the building form from A-2, with the section cut.
  if (!phone) {
    const g: string[] = [];
    const { x: kx, y: ky, w: kw, h: kh } = G.keyplan;
    g.push(rect(kx - 12, ky - 26, 156, 80, "w1", C.sheet, C.sheet));
    g.push(text(kx, ky - 10, "Key Plan", 11, C.ink2, ` class="t tb"`));
    g.push(rect(kx, ky, kw, kh, "w2", C.ink, "none"));
    const cx = kx + Math.round(kw * 0.64);
    g.push(line(cx, ky - 6, cx, ky + kh + 6, "w1", C.ink, dash(4, 2)));
    g.push(poly([[cx - 4, ky - 6], [cx + 4, ky - 6], [cx, ky - 1]], "w1", C.ink, C.ink));
    g.push(poly([[cx - 4, ky + kh + 6], [cx + 4, ky + kh + 6], [cx, ky + kh + 1]], "w1", C.ink, C.ink));
    const a2 = criteria.find((c) => c.code === "A-2");
    if (a2) {
      const tag = [
        rect(kx, ky + kh + 14, 30, 15, "w1", C.ink, C.tag, ` rx="1.5"`),
        text(kx + 15, ky + kh + 25.5, "A-2", 10, C.ink, ` text-anchor="middle" class="t tb tn"`),
        text(kx + 36, ky + kh + 25.5, `${a2.value} Building`, 12.5, C.ink),
      ];
      g.push(`<g data-callout="A-2"${opts.calloutEl ? ` data-el="${esc(opts.calloutEl + "A-2")}"` : ""}>\n${tag.join("\n")}\n</g>`);
    } else if (facts.form) {
      g.push(text(kx, ky + kh + 25.5, `${facts.form} Building`, 11, C.ink2));
    }
    L(part("keyplan", g));
  }

  // --- Border and title block.
  if (!phone) {
    const b = G.border;
    const { x, y, w, h } = G.tb;
    const g: string[] = [];
    g.push(rect(b, b, G.W - 2 * b, G.H - 2 * b, "w1", C.ink));
    g.push(rect(x, y, w, h, "w2", C.ink, C.sheet));
    const c1 = x + 96, c2 = x + 236;
    const rowY = y + h - 22;
    g.push(line(c1, y, c1, rowY, "w1", C.ink));
    g.push(line(c2, y, c2, rowY, "w1", C.ink));
    g.push(line(x, rowY, x + w, rowY, "w1", C.ink));
    g.push(text(x + 12, y + 30, "Kulka", 21, C.ink, ` class="t tb" letter-spacing="-0.4"`));
    g.push(text(x + 12, y + 46, "The Kulka Group", 9.5, C.ink2));
    g.push(text(c1 + 10, y + 15, "Project", 9, C.ink2));
    g.push(text(c1 + 10, y + 28, facts.project, 12.5, C.ink, ` class="t tb"`));
    g.push(text(c1 + 10, y + 41, "Sheet", 9, C.ink2));
    g.push(text(c1 + 10, y + 53, "Building Section", 12.5, C.ink, ` class="t tb"`));
    g.push(text(c2 + 10, y + 15, "Version", 9, C.ink2));
    g.push(text(c2 + 10, y + 28, `${facts.version}`, 12.5, C.ink, ` class="t tb tn"`));
    g.push(text(c2 + 10, y + 41, "Date", 9, C.ink2));
    g.push(text(c2 + 10, y + 53, facts.date, 11.5, C.ink, ` class="t tb tn"`));
    g.push(text(x + 12, y + h - 8, DIAGRAM_LINE, 11, C.ink, ` class="t tb"`));
    L(part("sheet", g));

    // General notes, lower left beside the key plan: the program as labels,
    // the ink, and the rows with no layer, each named by its own row.
    const gn: string[] = [];
    const program = [`${stories} Stories Above Grade`, facts.units !== null ? `${facts.units.toLocaleString("en-US")} Units` : null, facts.grossArea]
      .filter((s): s is string => s !== null)
      .join(", ");
    const items: { text: string; key: string | null }[][] = [];
    items.push(...wrapWords(`1. ${program}.`, 66).map((t) => [{ text: t, key: null }]));
    let n = 2;
    if (notes.ink) items.push(...wrapWords(`${n++}. ${notes.ink}`, 66).map((t) => [{ text: t, key: "ink" }]));
    const noLayer = notes.noLayer ?? [];
    if (noLayer.length) {
      // Each name is its own span, so the row that prices it can reveal it.
      const lines: { text: string; key: string | null }[][] = [[{ text: `${n}. Priced, with no layer to draw: `, key: null }]];
      let len = lines[0][0].text.length;
      noLayer.forEach((row, i) => {
        const word = `${row.label}${i < noLayer.length - 1 ? "," : "."}`;
        if (len + word.length > 66 && len > 0) {
          lines.push([]);
          len = 0;
        }
        const current = lines[lines.length - 1];
        if (current.length) {
          current.push({ text: " ", key: null });
          len += 1;
        }
        current.push({ text: word, key: row.key });
        len += word.length;
      });
      items.push(...lines);
    }
    const nx = b + 12, ny = G.H - b - 10 - items.length * 12.5 - 2;
    gn.push(rect(nx - 6, ny - 26, 420, G.H - b - ny + 24, "w1", C.sheet, C.sheet));
    gn.push(text(nx, ny - 8, "Notes", 11, C.ink, ` class="t tb"`));
    let ly = ny + 6;
    for (const ln of items) {
      // The ink note is the drawing's own, shown once the section is complete; a row's name shows with its row.
      const spans = ln.map((seg) => (seg.key === "ink" ? `<tspan data-ink-note="">${esc(seg.text)}</tspan>` : seg.key ? `<tspan data-note="${esc(seg.key)}">${esc(seg.text)}</tspan>` : esc(seg.text))).join("");
      gn.push(`<text x="${n2(nx)}" y="${n2(ly)}" class="t" font-size="10.5" fill="${C.ink2}">${spans}</text>`);
      ly += 12.5;
    }
    L(part("general-notes", gn));
  }

  L(`</svg>`);
  return out.filter(Boolean).join("\n");
}
