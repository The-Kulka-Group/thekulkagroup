// LA-1479, round three. Builds the budget drill-down still frames from MN Test
// #4's real model: data/model.json is presentBudget() run on test/fixtures/
// published-budget-mn4.json (production run 9b995af5, frozen 2026-09-29) at
// commit 38a8e4a, and the section drawings in data/ are the shipped page's own
// (tools/capture.mjs). Every figure, label and answer on a frame is read from
// those files or the fixture. Where the model has no data, a frame shows one
// quiet line naming the field the build needs, and nothing fills the gap.
//
// Round three applies Matt's answers of 2026-10-02 (NOTES.md): a By Division
// and By Element switch, no past-job counts or sources anywhere a client
// reads, the disconnects under 33 Utilities, standard estimate terms, cut
// clarifications, and LA-1480's real Comment control in place of a slot.
//
// Run: node tools/build.mjs   then   node tools/shoot.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../../..");
const M = JSON.parse(fs.readFileSync(`${root}/data/model.json`, "utf8"));
const RAW = JSON.parse(fs.readFileSync(`${repo}/test/fixtures/published-budget-mn4.json`, "utf8")).snapshot;
const sectionStyle = fs.readFileSync(`${root}/data/section-style.css`, "utf8");

/**
 * The shipped section, with the drawing's ink note taken out: it says which
 * layers are priced from Kulka's completed jobs, and clients do not see
 * anything about supporting projects (Matt, 2026-10-02; LA-1483).
 */
const svgOf = (key) =>
  fs
    .readFileSync(`${root}/data/section-${key.replace(":", "-")}.svg`, "utf8")
    .replace(/<text[^>]*><tspan data-ink-note="">[^<]*<\/tspan><\/text>\n?/g, "")
    .replace(">3. Priced, with no layer to draw:", ">2. Priced, with no layer to draw:");

// --- Formatting, the model's own rules (lib/rom/presentation.ts) ---------------------

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const usd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
const GSF = M.headline.grossSquareFeet;
const CONTRACT = M.headline.kulkaContract.likely;
const psf = (n) => `$${(n / GSF).toFixed(2)}`;
const pct = (n) => `${Math.round((n / CONTRACT) * 100)}%`;
const WORD = { high: "High", medium: "Medium", low: "Low", none: "None" };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// MasterFormat titles, as app/(app)/rom/ledger.ts names them.
const TITLES = {
  "02": "Existing Conditions", "03": "Concrete", "04": "Masonry", "05": "Metals", "06": "Wood, Plastics and Composites",
  "07": "Thermal and Moisture Protection", "08": "Openings", "09": "Finishes", "10": "Specialties", "11": "Equipment",
  "12": "Furnishings", "13": "Special Construction", "14": "Conveying Equipment", "21": "Fire Suppression", "22": "Plumbing",
  "23": "HVAC", "26": "Electrical", "27": "Communications", "28": "Electronic Safety and Security", "31": "Earthwork",
  "32": "Exterior Improvements", "33": "Utilities",
};

// --- The groups: by division (the default) and by element ----------------------------

const broughtInBy = new Map(M.gates.unpriced.map((u) => [u.label, u.broughtInBy]));
/** A group takes its lines' mark the way an element does: high only if all are high, low if any is low. */
const markOf = (lines) => (lines.length === 0 ? "none" : lines.every((l) => l.confidence === "high") ? "high" : lines.some((l) => l.confidence === "low") ? "low" : "medium");
/** Matt, 2026-10-02: the four utility disconnects live in Site Work, so the division view files them under 33 Utilities. */
const DISCONNECT_DRIVER = "Structure Demolition";

function finish(g) {
  g.likely = g.lines.reduce((s, l) => s + l.likely, 0);
  g.low = g.lines.reduce((s, l) => s + l.low, 0);
  g.high = g.lines.reduce((s, l) => s + l.high, 0);
  g.mark = markOf(g.lines);
  g.items = g.lines.length + g.unpriced.length;
  g.kulka = g.likely;
  return g;
}
const unpricedOf = (row) => row.scope.unpriced.map((u) => ({ ...u, by: broughtInBy.get(u.label) ?? null }));

const divisions = [];
for (const row of M.ledger) {
  let d = divisions.find((x) => x.code === row.division);
  if (!d) divisions.push((d = { code: row.division, title: TITLES[row.division], lines: [], unpriced: [], keys: [], owner: true }));
  d.lines.push(...row.scope.lines);
  d.unpriced.push(...unpricedOf(row).filter((u) => u.by !== DISCONNECT_DRIVER));
  d.keys.push(row.key);
  d.owner = d.owner && row.scope.ownerDirect;
}
const disconnects = M.ledger.flatMap(unpricedOf).filter((u) => u.by === DISCONNECT_DRIVER);
divisions.push({ code: "33", title: TITLES["33"], lines: [], unpriced: disconnects, keys: [], owner: false });
divisions.forEach(finish);

const elementRows = M.ledger.filter((r) => r.scope.kind === "element");
const looseRows = M.ledger.filter((r) => r.scope.kind !== "element");
const elements = [
  ...elementRows.map((r) => finish({ code: "", title: r.label, lines: [...r.scope.lines], unpriced: unpricedOf(r), keys: [r.key], owner: false, element: true })),
  {
    ...finish({ code: "", title: "Not in an Element", lines: looseRows.flatMap((r) => r.scope.lines), unpriced: [], keys: looseRows.map((r) => r.key), owner: false, loose: true }),
    // The share of Kulka's contract leaves out what the owner buys direct (Appliances).
    kulka: looseRows.filter((r) => !r.scope.ownerDirect).reduce((s, r) => s + r.scope.likely, 0),
  },
];

const div = (code) => divisions.find((d) => d.code === code);
const crit = (code) => M.criteria.find((c) => c.code === code);
const fact = (key) => M.project.facts.find((f) => f.key === key);
const gateRow = (el) => [...M.gates.answeredYes, ...M.gates.notInThisJob, ...M.gates.waiting].find((g) => g.el === el);
const factFor = (question) => M.project.facts.find((f) => f.basisWords === question);

// Each answer and each gate row, sent to the division whose lines it prices
// (branch_gate_items for the gates, the criteria's cost codes, Kulka's item definitions).
const FACT_HOME = {
  demolition: "02", demolitionStructureCount: "02", demolitionStructureSquareFeet: "02", demolitionStructureType: "02",
  balconies: "06", retail_storefronts: "08", amenity_scope: "13",
  elevator: "14", elevatorCount: "14", elevatorType: "14", hydraulicJackType: "14", elevatorMachineRooms: "14", elevatorMachineRoomHvac: "14",
  radio_amplifier: "28", levels_below_grade: "31", site_conditions: "31",
};
const GATE_HOME = {
  "gate:demolition": "02", "gate:balconies": "06", "gate:amenity_scope": "13", "gate:elevator": "14",
  "gate:3": "03", "gate:15a": "08", "gate:16": "08", "gate:32a": "28", "gate:levels_below_grade": "31", "gate:34a": "31",
};
const gatesOf = (code) => Object.entries(GATE_HOME).filter(([, c]) => c === code).map(([el]) => gateRow(el));

// --- Pieces ----------------------------------------------------------------------------

const src = (tone, text) => `<span class="src"><i class="dot dot--${tone}" aria-hidden="true"></i>${esc(text)}</span>`;
const mark = (tone, text = WORD[tone]) => `<span class="dv-cf"><i class="dot dot--${tone}" aria-hidden="true"></i>${esc(text)}</span>`;
const pill = (open, words = ["Open", "Close"]) => `<span class="pill">${open ? words[1] : words[0]}</span>`;
/** The LA-1481 control in its empty state. */
const ve = () => `<span class="ve" title="Value Engineering, empty until Kulka supplies options">VE <b>None Yet</b></span>`;
/** One quiet line per gap: what the model lacks, and the field the build needs. */
const gm = (words, ...fields) => `<p class="gm"><i aria-hidden="true"></i>Not in the model: ${esc(words)} ${fields.map((f) => `<code>${esc(f)}</code>`).join(" ")}</p>`;
/** A line's source may say Kulka Rate; nothing about past jobs reaches a client (Matt, 2026-10-02). */
const sourceWords = (line) => (line.source.text === "Kulka Rate" ? "Kulka Rate" : null);

function tabs(list, active, end = "") {
  return `
          <div class="tabs" role="tablist">${list
            .map(([label, n]) => `<span class="tab${label === active ? " is-on" : ""}" role="tab" aria-selected="${label === active}">${esc(label)}${n != null ? ` <span class="tab-n">${n}</span>` : ""}</span>`)
            .join("")}${end ? `<span class="tabs-end">${end}</span>` : ""}</div>`;
}

const SECTIONS = [
  ["letter", "Letter"],
  ["project-basis", "Project Basis"],
  ["where-the-money-is", "The Ledger"],
  ["design-and-engineering", "Design and Engineering"],
  ["from-trades-to-total", "From Trades to Total"],
  ["clarifications", "Clarifications"],
  ["what-happens-next", "What Happens Next"],
];
// LA-1480 Decision 4: the header gains one control, Comment. Outside comment
// mode an element shows nothing until it has threads; MN Test #4 has none.
const header = (current) => `
<header class="hd" id="bar" data-state="bar">
  <div class="hd-t1">
    <a class="hd-mark" href="#top">Kulka</a>
    <span class="hd-proj">${esc(M.projectName)}</span>
    <button class="hd-cmt" type="button" aria-pressed="false"><i aria-hidden="true"></i>Comment</button>
  </div>
  <nav class="hd-t2" aria-label="Sections">
    <ul class="hd-ix">${SECTIONS.map(([id, t]) => `<li><a href="#${id}"${id === current ? ' aria-current="true"' : ""}>${t}</a></li>`).join("")}</ul>
    <span class="hd-here">${SECTIONS.find((s) => s[0] === current)[1]}</span>
  </nav>
</header>`;

// The frame's only script: the phone crop and lens place the shipped page's
// JS would set, and, when a group is open, the section lit to answer it.
const SCRIPT = `
<script>
  const phone = innerWidth <= 860;
  if (phone) document.querySelectorAll("svg[data-vb-phone]").forEach((s) => s.setAttribute("viewBox", s.getAttribute("data-vb-phone")));
  const aside = document.querySelector(".sheet--dwg"), lens = document.querySelector("[data-lens]");
  if (phone && aside && lens) lens.style.setProperty("--lens-top", document.querySelector(".hd").offsetHeight + aside.offsetHeight + "px");
  // The open group's layers light in place; every other layer stays drawn, in light ink.
  const box = document.querySelector("[data-dwg][data-now]");
  if (box) {
    const now = box.dataset.now.split(" ");
    box.classList.add("dwg--focus");
    const lit = [];
    box.querySelectorAll("[data-layer]").forEach((g) => {
      const on = now.includes(g.dataset.layer);
      g.classList.add("is-drawn");
      g.classList.toggle("is-now", on);
      if (on && g.querySelector(".s")) lit.push(g);
    });
    box.querySelectorAll("[data-story], [data-roof]").forEach((e) => e.classList.add("is-up"));
    // The tag sits beside the lit strokes, with a short lead to them.
    const c = box.getBoundingClientRect();
    const rs = lit.map((g) => g.getBoundingClientRect()).filter((r) => r.width + r.height > 0);
    const tag = box.querySelector(".dwg-tag"), lead = box.querySelector(".dwg-lead");
    if (rs.length && tag) {
      const r = { left: Math.min(...rs.map((x) => x.left)) - c.left, right: Math.max(...rs.map((x) => x.right)) - c.left, top: Math.min(...rs.map((x) => x.top)) - c.top, bottom: Math.max(...rs.map((x) => x.bottom)) - c.top };
      const w = tag.offsetWidth, h = tag.offsetHeight, gap = phone ? 10 : 26;
      // Above the lit strokes when there is room (a low layer); beside them when the layer is tall.
      const above = r.top - gap - h >= 8 && r.bottom - r.top < c.height * 0.45;
      if (above) {
        const x = Math.min(Math.max(8, r.left), c.width - w - 8), y = r.top - gap - h;
        tag.style.left = x + "px"; tag.style.top = y + "px";
        const lx = Math.min(Math.max(x + 12, (r.left + r.right) / 2), x + w - 12);
        Object.assign(lead.style, { left: lx + "px", top: y + h + "px", width: "1px", height: gap - 2 + "px" });
      } else {
        const right = r.right + gap + w <= c.width - 8;
        const x = right ? r.right + gap : Math.max(8, r.left - gap - w);
        const y = Math.min(Math.max(8, r.top + (phone ? 4 : 24)), c.height - h - 8);
        tag.style.left = x + "px"; tag.style.top = y + "px";
        Object.assign(lead.style, { top: y + h / 2 + "px", left: (right ? r.right + 2 : x + w) + "px", width: Math.max(0, right ? x - r.right - 2 : r.left - 2 - (x + w)) + "px", height: "1px" });
      }
      tag.hidden = false; lead.hidden = false;
    }
  }
</script>`;

const page = (title, comment, current, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(M.projectName)} · Kulka</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="page.css">
<link rel="stylesheet" href="drill.css">
<style>${sectionStyle}</style>
</head>
<body class="frame">
<!-- ${comment} -->
${header(current)}
<main id="top">${body}
</main>${SCRIPT}
</body>
</html>
`;

// --- The ledger ---------------------------------------------------------------------------

const elId = (g) => (g.element ? g.keys[0] : g.loose ? "element:none" : `division:${g.code}`);

function groupRow(g, { current = false, open = false, inner = "" } = {}) {
  const amount = g.lines.length ? usd(g.likely) : `<span class="missing">No Rate Yet</span>`;
  return `
      <div class="lg-item${current ? " is-cur" : ""}${g.owner ? " lg-item--owner" : ""}" data-el="${esc(elId(g))}" data-open="${open}" role="row">
        <button class="lg-row lg-btn dv-row" type="button" aria-expanded="${open}">
          <span class="lg-div num">${g.code}</span>
          <span class="lg-name">${esc(g.title)}${g.owner ? ' <span class="lg-tag">Bought by the Owner</span>' : ""}</span>
          ${g.lines.length ? mark(g.mark) : '<span class="dv-cf"></span>'}
          <span class="lg-amt num">${amount}</span>
          <span class="lg-psf num">${g.lines.length ? psf(g.likely) : ""}</span>
          <span class="lg-pct num">${g.owner || !g.lines.length ? "" : pct(g.kulka)}</span>
          <span class="dv-meta">${g.lines.length ? mark(g.mark, `${WORD[g.mark]} Confidence`) : mark("none", "Outside the Total")}<span>${plural(g.items, "Item")}</span></span>
        </button>${inner}
      </div>`;
}

function lens(g, open) {
  return `
    <div class="lens" data-lens data-open="${open}" aria-label="The current row"><div class="lens-in" data-open="${open}">
      <div class="lg-row lg-btn">
        <span class="lg-div num">${g.code}</span>
        <span class="lg-name">${esc(g.title)}</span>
        <span class="lg-amt num">${usd(g.likely)}</span>
        <span class="lg-psf num"></span><span class="lg-pct num"></span>
        <span class="lg-rate num">${psf(g.likely)} per SF${g.owner ? "" : ` · ${pct(g.kulka)}`}</span>
        <span class="lg-more dv-more">${mark(g.mark, `${WORD[g.mark]} Confidence`)}<span class="lg-count">${plural(g.items, "Item")}</span>${pill(open)}</span>
      </div>
    </div></div>`;
}

const viewSwitch = (view) => `
    <div class="views" role="tablist" aria-label="View">${["By Division", "By Element"]
      .map((v) => `<span class="view${v === view ? " is-on" : ""}" role="tab" aria-selected="${v === view}">${v}</span>`)
      .join("")}</div>`;

/**
 * The ledger sheet. `groups` is the view's own list; `current` is the group in
 * the lens; `openInner` is the open group's panel; `from` starts the list there.
 */
function ledger({ groups = divisions, view = "By Division", current, openInner = null, from = null, after = 2 }) {
  const cur = groups.find((g) => g.title === current || g.code === current);
  const start = from ? groups.indexOf(cur) : 0;
  const end = openInner !== null ? Math.min(groups.indexOf(cur) + 1 + after, groups.length) : groups.length;
  const list = groups.slice(start, end);
  const rest = groups.length - end;
  const t = M.headline.tradeCost;
  return `
<section class="sheet sheet--ledger" id="where-the-money-is" data-el="section:where-the-money-is">
  <div class="sheet-hd">
    <h1 class="sheet-h">The Ledger</h1>${viewSwitch(view)}
    <p class="sheet-sub">${view === "By Division" ? "By division, in the order the trades build it." : "By element: each physical thing with the work it brings in."} Open one to see what is in it.</p>
  </div>
  <div class="lg" role="table" aria-label="The Ledger">${from ? "" : `
    <div class="lg-row lg-cols dv-row" role="row">
      <span class="lg-div">${view === "By Division" ? "Div" : ""}</span>
      <span class="lg-name">${view === "By Division" ? "Division" : "Element"}</span>
      <span class="dv-cf">Confidence</span>
      <span class="lg-amt">Amount</span>
      <span class="lg-psf">$/SF</span>
      <span class="lg-pct">%</span>
    </div>`}${lens(cur, openInner !== null)}${list
      .map((g) => groupRow(g, { current: g === cur, open: g === cur && openInner !== null, inner: g === cur && openInner !== null ? openInner : "" }))
      .join("")}${rest > 0 ? `
    <p class="lg-elide">${rest} more ${view === "By Division" ? (rest === 1 ? "division" : "divisions") : rest === 1 ? "row" : "rows"}, closed</p>` : ""}${from || rest > 0 ? "" : `
    <div class="lg-foot lg-foot--quiet" data-el="total:trade-cost">
      <span>All Trades, Owner-Direct Included <span class="lg-foot-range num">${usd(t.low)} to ${usd(t.high)}</span></span>
      <span class="num">${usd(t.likely)}</span>
    </div>`}
  </div>${from || rest > 0 ? "" : `
  <p class="lg-source" data-el="note:sourcing">${(M.restsOn.shares.fromKulkaRates * 100).toFixed(1)}% of the trade cost is priced from rates Kulka has stated.</p>`}
</section>`;
}

/**
 * The trio as shipped. With a group open (`focus`), the section shows every
 * layer, the open group's lit in place and a tag beside it naming what is open.
 * On a phone the pinned section folds to one bar while a group is open; one tap shows it again.
 */
function trio(ledgerHtml, { svgKey = "line:39", focus = null, beside = "" } = {}) {
  const f = M.drawing.facts;
  const tag = focus ? `<p class="dwg-tag" hidden><b>${esc(focus.name)}</b><span class="num">${esc(focus.figure)}</span>${mark(focus.mark)}</p><i class="dwg-lead" hidden></i>` : "";
  return `
<div class="trio${focus ? " trio--open" : ""}" data-trio data-state="ledger">
  <div class="trio-main">${ledgerHtml}${beside ? `<div class="only-phone">${beside}</div>` : ""}
  </div>
  <aside class="sheet sheet--dwg" aria-label="The Section">
    <div class="dwg dwg--crop dwg--live" data-dwg="section"${focus ? ` data-now="${esc(focus.keys.join(" "))}"` : ""}>${svgOf(svgKey)}${tag}</div>
    <p class="dwg-cap only-phone"><b>Building Section</b> · ${f.stories} Stories · ${f.units} Units · ${esc(f.grossArea)}</p>${
      focus ? `\n    <p class="dwg-fold"><b>Building Section</b><span><i class="dot" aria-hidden="true"></i>${esc(focus.name)}</span><span class="pill">Show</span></p>` : ""
    }${beside ? `<div class="only-desk">${beside}</div>` : ""}
  </aside>
</div>`;
}

// --- Inside an open group: one level open at a time --------------------------------------------

const groupTabs = (g, active) =>
  tabs([["Items", g.items], ["Confidence", null], ...(g.code && gatesOf(g.code).length ? [["Scope Decisions", null]] : [])], active, `<span class="only-desk ctl">${ve()}</span>`);
/** On a phone the VE control closes the open group rather than crowd its tabs. */
const phoneControls = `
          <p class="only-phone ctl ctl--foot">${ve()}</p>`;

/** An item, closed: its name, figure and one meta line. Open, it adds its range and its own tabs. */
function item(line, inner = "") {
  const open = inner !== "";
  const words = sourceWords(line);
  return `
          <div class="si" data-el="line:${esc(line.costCode)}" data-open="${open}">
            <div class="si-head"><span class="ln-l">${esc(line.label)}</span><span class="ln-v num">${usd(line.likely)}</span>${pill(open)}</div>
            <p class="si-meta">${open ? `<span class="num">${usd(line.low)} to ${usd(line.high)}</span><i>·</i>` : ""}${mark(line.confidence)}${words ? `<i>·</i><span>${esc(words)}</span>` : ""}</p>${inner}
          </div>`;
}

/** Supporting items with no rate, as one row. `open` lists them, one line each. */
function supporting(g, { label, open = false } = {}) {
  if (!g.unpriced.length) return "";
  return `
          <div class="si si--group" data-open="${open}">
            <div class="si-head"><span class="ln-l">${esc(label)}</span><span class="ln-v">${plural(g.unpriced.length, "Item")}</span>${pill(open)}</div>
            <p class="si-meta">${mark("none", "No Rate Yet")}<i>·</i><span>Outside the Total</span></p>${
              open ? `\n            <ul class="sup">${g.unpriced.map((u) => `<li data-el="unpriced:${esc(u.costCode)}">${esc(u.label)}</li>`).join("")}</ul>` : ""
            }
          </div>`;
}

const openGroup = (g, body) => `
      <div class="dv-open" id="${esc(elId(g).replace(":", "-"))}-lines">${body}${phoneControls}
      </div>`;

const itemsPanel = (g, { openCode = null, itemInner = "", supportLabel = null, supportOpen = false } = {}) =>
  `${g.lines.map((l) => item(l, l.costCode === openCode ? itemInner : "")).join("")}${supportLabel ? supporting(g, { label: supportLabel, open: supportOpen }) : ""}`;

const tagFor = (g, line = null) => ({
  keys: g.keys,
  name: line ? line.label : g.code ? `${g.code} ${g.title}` : g.title,
  figure: usd(line ? line.likely : g.likely),
  mark: line ? line.confidence : g.mark,
});

// --- Frame 01: the ledger by division, closed ---------------------------------------------------------

const f01 = page(
  "01 The Ledger by Division",
  "Frame 01. The drill-down closed, By Division (the default). The ledger's rows grouped into their MasterFormat divisions, with 33 Utilities holding the four disconnects, no rate yet. Mid-scroll, as shipped: the lens holds 22 Plumbing, and the section has drawn every layer down to it.",
  "where-the-money-is",
  trio(ledger({ current: "22" }), { svgKey: "line:28" }),
);

// --- Frame 01b: the ledger by element --------------------------------------------------------------------

const demo = elements.find((e) => e.title === "Demolition");
const loose = elements.find((e) => e.loose);
const elementOpen = openGroup(demo, `${groupTabs(demo, "Items")}${itemsPanel(demo, { supportLabel: "Supporting Items", supportOpen: true })}`);
const f01b = page(
  "01b The Ledger by Element",
  "Frame 01b. The same ledger By Element (Matt's Module view). The model has two elements, Demolition and Elevator. Demolition is open: its two priced items and the four disconnects it brings in, as supporting items with no rate. Every line with no element sits in one row, Not in an Element, so each line still shows once and the total is the same.",
  "where-the-money-is",
  trio(
    ledger({ groups: elements, view: "By Element", current: "Demolition", openInner: `${elementOpen}`, after: 2 }).replace(
      '<div class="lg-item" data-el="element:none"',
      `${gm(`an element for ${loose.lines.length} of ${loose.lines.length + demo.lines.length + elements[1].lines.length} lines`, "line.element")}<div class="lg-item" data-el="element:none"`,
    ),
    { focus: tagFor(demo) },
  ),
);

// --- Frame 02: a division opened to its items ---------------------------------------------------------------

const d02 = div("02");
const f02 = page(
  "02 A Division, Opened",
  "Frame 02. 02 Existing Conditions open on its Items tab: Structure Demolition and Site Demolition. The disconnects now sit under 33 Utilities. The tab row ends in the empty VE control. The section lights the division's layer.",
  "where-the-money-is",
  trio(ledger({ current: "02", openInner: openGroup(d02, `${groupTabs(d02, "Items")}${itemsPanel(d02)}`) }), { focus: tagFor(d02) }),
);

// --- Frames 03 and 03b: an item opened, one tab at a time ----------------------------------------------------------

const sd = d02.lines.find((l) => l.costCode === "1a");
const itemTabs = (active, basis) => tabs([["Basis", basis], ["Inclusions and Exclusions", null]], active);
const basisRow = (label, value, chip) => `
              <li><span class="as-l">${esc(label)}</span><span class="as-v">${value}</span>${chip}</li>`;
const statedRow = (key) => {
  const f = fact(key);
  return basisRow(f.label, esc(f.value), src("quiet", "Stated"));
};
const sdBasis = `
            <div class="si-body">${itemTabs("Basis", 4)}
              <ul class="as">${statedRow("demolitionStructureCount")}${statedRow("demolitionStructureSquareFeet")}${statedRow("demolitionStructureType")}${basisRow("Rate", "Rate on File", src("low", "Kulka Rate"))}
              </ul>
              ${gm("which answers this line prices on", "line.inputs[]")}
              ${gm("the rate's unit and quantity", "line.quantity", "comparable.unit")}
            </div>`;
const sdScope = `
            <div class="si-body">${itemTabs("Inclusions and Exclusions", 4)}
              <div class="io">
                <div><p class="io-h io-h--in"><i></i>Inclusions</p><ul><li>Mechanical Demolition of the Structure</li><li>Slab-on-Grade and Footings</li><li>Loading, Trucking and C&amp;D Disposal</li></ul></div>
                <div><p class="io-h io-h--out"><i></i>Exclusions</p><ul><li>Hazardous Material Survey and Abatement</li><li>Disconnects and Site Demolition, Their Own Items</li><li>Backfill, Permits and the Demolition Bond</li></ul></div>
              </div>
              ${gm("approved lists; these follow Kulka's definition of item 1a", "line.includes[]", "line.excludes[]")}
            </div>`;
const f03 = page(
  "03 An Item, Opened",
  "Frame 03. Structure Demolition open on its Basis tab: the three answers it prices on, each Stated, and Kulka's rate. Two quiet lines name what the model lacks. The section tag names the open item.",
  "where-the-money-is",
  trio(ledger({ current: "02", openInner: openGroup(d02, `${groupTabs(d02, "Items")}${itemsPanel(d02, { openCode: "1a", itemInner: sdBasis })}`) }), { focus: tagFor(d02, sd) }),
);
const f03b = page(
  "03b An Item, Inclusions and Exclusions",
  "Frame 03b. The same item on its Inclusions and Exclusions tab, drawn as an approved list: AI drafts each item's lists and the estimator approves them, and nothing reaches the client unapproved. The model holds no lists yet, so these follow Kulka's own definition of item 1a, marked on one line.",
  "where-the-money-is",
  trio(ledger({ current: "02", openInner: openGroup(d02, `${groupTabs(d02, "Items")}${itemsPanel(d02, { openCode: "1a", itemInner: sdScope })}`) }), { focus: tagFor(d02, sd) }),
);

// --- Frame 04: confidence, and the owner items that would raise it -------------------------------------------------

const d14 = div("14");
const soil = fact("site_conditions");
const raiseRow = (tagHtml, label, value, chip) => `
            <li>${tagHtml}<span class="raise-t">${esc(label)}</span><span class="raise-v">${esc(value)}</span>${chip}</li>`;
const f04body = `${groupTabs(d14, "Confidence")}
          <div class="cf-panel">
            <div class="cf-big">${mark(d14.mark, `${WORD[d14.mark]} Confidence`)}</div>
            <p class="dv-h">What Would Raise It</p>
            <ul class="raise">${["V-1", "V-2", "V-3"]
              .map((c) => crit(c))
              .map((k) => raiseRow(`<span class="crit-tag num">${esc(k.code)}</span>`, k.label, k.value, src("working", "Planning Assumption")))
              .join("")}${raiseRow('<span class="q-tag">Open</span>', soil.label, soil.value, src("working", "Waiting on You"))}
            </ul>
            ${gm("the owner items for each line", "confidence.raisedBy[]")}
          </div>`;
const f04 = page(
  "04 Confidence, and What Would Raise It",
  "Frame 04. 14 Conveying Equipment open on its Confidence tab: the mark, and What Would Raise It as owner items only (the three elevator criteria still planning assumptions, and the open groundwater question). No counts, and no promise of which mark an item moves to.",
  "where-the-money-is",
  trio(ledger({ current: "14", openInner: openGroup(d14, f04body), from: "14" }), { focus: tagFor(d14) }),
);

// --- Frame 04b: scope decisions, moved here from What Is In ---------------------------------------------------------

const d08 = div("08");
const decidedRow = (g) => {
  const why = g.decidedBy.map((x) => {
    const f = factFor(x.question);
    return `${esc(f ? f.label : x.question)}: <strong>${esc(x.answer)}</strong>`;
  });
  return `
            <li><span class="dec-l">${esc(g.label)}</span><span class="dec-a">${why.join(" · ")}</span></li>`;
};
const f04b = page(
  "04b Scope Decisions",
  "Frame 04b. 08 Openings open on its Scope Decisions tab: the two What Is In rows that belong to this division, each with the answer that removed it.",
  "where-the-money-is",
  trio(
    ledger({ current: "08", openInner: openGroup(d08, `${groupTabs(d08, "Scope Decisions")}
          <p class="dv-h">Not in This Job</p>
          <ul class="dec">${gatesOf("08").map(decidedRow).join("")}
          </ul>`), from: "08" }),
    { focus: tagFor(d08) },
  ),
);

// --- Frame 05: a division the model cannot open far, and what the model needs ----------------------------------------

const d22 = div("22");
const needs = `
    <div class="needs" aria-label="What the Model Needs">
      <p class="needs-h">What the Model Needs</p>
      <p class="needs-sub">Frame note, not page content. Every gap on these frames, in one place.</p>
      <ul>
        <li><span class="needs-f"><code>line.inputs[]</code></span><span>The answers each line prices on</span></li>
        <li><span class="needs-f"><code>line.quantity</code> <code>comparable.unit</code></span><span>A stated rate's quantity and unit</span></li>
        <li><span class="needs-f"><code>line.includes[]</code> <code>line.excludes[]</code></span><span>Approved scope, with drafter and approver</span></li>
        <li><span class="needs-f"><code>breakout_of_cost_code</code></span><span>Sub-items inside a one-line division</span></li>
        <li><span class="needs-f"><code>confidence.raisedBy[]</code></span><span>The owner items that would firm a line up</span></li>
        <li><span class="needs-f"><code>line.element</code></span><span>An element for the lines that have none</span></li>
        <li><span class="needs-f"><code>line.division</code></span><span>The division in the snapshot, disconnects in 33</span></li>
      </ul>
    </div>`;
const f05 = page(
  "05 A Division With Gaps",
  "Frame 05. 22 Plumbing open on its Items tab: one line, and one quiet line saying there are no sub-items. The What the Model Needs panel, a frame note, gathers every gap on these frames.",
  "where-the-money-is",
  trio(ledger({ current: "22", openInner: openGroup(d22, `${groupTabs(d22, "Items")}${itemsPanel(d22)}
          ${gm("sub-items; Plumbing is one line", "block_classification.breakout_of_cost_code")}`), from: "22" }), { focus: tagFor(d22), beside: needs }),
);

// --- Frame 06: Project Basis, Clarifications, What Happens Next -----------------------------------------------------------

const projectFacts = M.project.facts.filter((f) => !FACT_HOME[f.key]);
const movedFacts = M.project.facts.filter((f) => FACT_HOME[f.key]);
const homes = [...new Set([...movedFacts.map((f) => FACT_HOME[f.key]), ...Object.values(GATE_HOME)])].sort();
const factRow = (f) => `
      <div class="fact lg-row" data-el="${esc(f.el)}">
        <dt class="fact-l">${esc(f.label)}</dt>
        <dd class="fact-d"><span class="fact-v">${esc(f.value)}</span>${src("quiet", "Stated")}</dd>
      </div>`;
const homeRow = (code) => {
  const d = div(code);
  const n = movedFacts.filter((f) => FACT_HOME[f.key] === code);
  // A scope decision shows here only when its answer stayed with the whole project (Parking), so no question is listed twice.
  const out = Object.entries(GATE_HOME)
    .filter(([el, c]) => c === code && M.gates.notInThisJob.some((g) => g.el === el) && gateRow(el).decidedBy.every((x) => !n.some((f) => f.basisWords === x.question)))
    .map(([el]) => `${gateRow(el).label}, Not in This Job`);
  return `<li><a href="#division-${code}">${code} ${esc(d.title)}</a><span class="answer">${[...n.map((f) => esc(f.label)), ...out.map((o) => `<strong>${esc(o)}</strong>`)].join(" · ")}</span></li>`;
};

// Matt, 2026-10-02: cut notes 9, 13 and 14 (each division now shows them) and
// shorten 5 and 10 to one line with no item names. Note 7 is cut under the
// rule that clients see nothing about supporting figures (see NOTES.md).
const SHORT = {
  // Blend weights and flag thresholds are about supporting jobs, so they leave the parameters table and this note.
  4: "Range widths are recorded pricing parameters, each with its own provenance, listed with this budget.",
  5: `${M.gates.unpriced.length} items are in scope with no rate yet. Each sits under its division.`,
  10: `${M.gates.waiting.length} item sits outside the total until an open question is answered. It sits under its division.`,
};
const CUT = new Set([7, 9, 13, 14]);
const clarifications = M.notes.filter((n) => !CUT.has(n.number)).map((n) => ({ ...n, text: SHORT[n.number] ?? n.text }));
// The pricing parameters a client keeps: none about job weights or job counts (LA-1483).
const JOB_PARAMETERS = new Set(["parameter:weight-actuals", "parameter:weight-proest-budget", "parameter:weight-reviewed-judgment", "parameter:flag-high-min-comparables", "parameter:flag-medium-min-comparables"]);
const parameters = M.parameters.filter((p) => !JOB_PARAMETERS.has(p.el));

const f06 = page(
  "06 Project Basis, Clarifications, What Happens Next",
  "Frame 06. Project Basis (was What You Told Us) keeps the 11 answers about the whole project and lists where the other 16 went. Clarifications (was Notes and Clarifications) holds the cut list: notes 7, 9, 13 and 14 gone, 5 and 10 one line each. What Happens Next asks the reader to check the Basis under each division.",
  "project-basis",
  `
<section class="sheet" id="project-basis" data-el="section:the-project">
  <div class="sheet-hd">
    <h1 class="sheet-h">Project Basis</h1>
    <p class="sheet-sub">${esc(M.project.line)}</p>
  </div>
  <p class="fig-md num" data-el="fact:grossSquareFeet:figure">${GSF.toLocaleString("en-US")} SF</p>
  <p class="lede">Your answers about the whole project. Answers about one trade sit in that division's Basis in The Ledger.</p>
  <dl class="facts lg">${projectFacts.map(factRow).join("")}
  </dl>
  <div class="moved">
    <h2 class="gates-h">Your Other Answers, by Division</h2>
    <ul class="plain">${homes.map(homeRow).join("")}</ul>
  </div>
</section>
<p class="elide">The Ledger, Design and Engineering and From Trades to Total follow here, as frames 01 to 05 and PR 134 show them.</p>
<section class="sheet gates" id="clarifications" data-el="section:what-is-in">
  <div class="sheet-hd">
    <h1 class="sheet-h">Clarifications</h1>
  </div>
  <p class="lede">Scope decisions now sit with each division in The Ledger.</p>
  <ol class="notes">${clarifications.map((n, i) => `
    <li class="note" data-el="${esc(n.el)}" value="${i + 1}"><span class="note-n num">${i + 1}</span><span class="note-text">${esc(n.text)}</span></li>`).join("")}
  </ol>
  <div class="parameters">
    <h2 class="gates-h">Pricing Parameters This Budget Ran With</h2>
    <table class="params">
      <thead><tr><th scope="col">Parameter</th><th scope="col" class="right">Value</th><th scope="col">Set By</th><th scope="col">Date</th></tr></thead>
      <tbody>${parameters.map((p) => `
        <tr data-el="${esc(p.el)}"><td>${esc(p.label)}</td><td class="right num">${esc(p.value)}</td><td>${esc(p.recordedBy)}</td><td>${esc(p.recordedAt)}</td></tr>`).join("")}
      </tbody>
    </table>
  </div>
</section>
<section class="sheet next" id="what-happens-next" data-el="section:what-happens-next">
  <div class="sheet-hd">
    <h1 class="sheet-h">What Happens Next</h1>
  </div>
  <ol class="steps">
    <li><b>Check the Basis.</b> Open each division in The Ledger and read the Basis under its items. If anything is wrong, flag it there and Kulka reprices from the corrected fact.</li>
    <li><b>Answer the open item.</b> ${esc(M.next.openQuestions.join(" "))} An answer moves what waits on it into, or out of, the number.</li>
    <li><b>Reprice at ${esc(M.next.nextStage.label)}.</b> ${esc(M.next.nextStage.words)}</li>
  </ol>
  <p class="reach">To reach Kulka, reply to the estimator who sent you this link.</p>
</section>`,
);

// --- Write ------------------------------------------------------------------------------------------------------------------

const FRAMES = {
  "01-ledger-closed": f01,
  "01b-ledger-by-element": f01b,
  "02-division-open": f02,
  "03-item-open": f03,
  "03b-item-scope": f03b,
  "04-confidence": f04,
  "04b-scope-decisions": f04b,
  "05-division-gaps": f05,
  "06-where-sections-go": f06,
};
// Where tools/shoot.mjs scrolls for each frame's first screen: the open group, just under the lens.
const FOCUS = {
  "01-ledger-closed": '<div class="lg-item is-cur" data-el="division:22"',
  "01b-ledger-by-element": '<div class="dv-open"',
  "02-division-open": '<div class="dv-open"',
  "03-item-open": '<div class="dv-open"',
  "03b-item-scope": '<div class="dv-open"',
  "04-confidence": '<div class="dv-open"',
  "04b-scope-decisions": '<div class="dv-open"',
  "05-division-gaps": '<div class="dv-open"',
  "06-where-sections-go": '<div class="moved"',
};
for (const f of fs.readdirSync(root).filter((f) => /^\d\d[a-z]?-.*\.html$/.test(f))) fs.unlinkSync(`${root}/${f}`);
for (const [name, built] of Object.entries(FRAMES)) {
  if (/Kulka Jobs?|completed jobs/.test(built.replace(/<!--[\s\S]*?-->/g, ""))) throw new Error(`${name} still carries past-job wording`);
  const html = FOCUS[name] ? built.replace(FOCUS[name], `${FOCUS[name]} data-focus`) : built;
  fs.writeFileSync(`${root}/${name}.html`, html);
  console.log("wrote", `${name}.html`);
}

// The audit table NOTES.md quotes: per division, what the model holds.
const audit = divisions.map((d) => ({
  division: `${d.code} ${d.title}`,
  likely: d.lines.length ? usd(d.likely) : "No Rate Yet",
  mark: WORD[d.mark],
  priced: d.lines.map((l) => `${l.label} (${WORD[l.confidence]})`),
  unpriced: d.unpriced.map((u) => u.label),
  criteria: M.criteria.filter((k) => RAW.criteria.find((r) => r.code === k.code).costCodes.some((c) => d.lines.some((l) => l.costCode === c) || d.unpriced.some((u) => u.costCode === c))).map((k) => `${k.code} ${k.settled ? "Settled" : "Planning Assumption"}`),
  answers: movedFacts.filter((f) => FACT_HOME[f.key] === d.code).map((f) => f.label),
  gates: gatesOf(d.code).map((g) => g?.label),
}));
fs.writeFileSync(`${root}/data/audit.json`, JSON.stringify(audit, null, 1));
console.log("wrote data/audit.json");
