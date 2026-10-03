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
// The fixture is read from the main checkout, read only.
const repo = "/Users/mattnicosia/dev/Kulka-AI";
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

// --- LA-1484: the comment layer's markers ---------------------------------------------
// MARKS maps an element id to its threads for the frame being built: [count, state].
// The state picks the dot: open (waiting on Kulka), answered (Kulka replied), done (closed).
let MARKS = {};
const STATE_WORD = { open: "Open", answered: "Answered", done: "Closed" };
const cm = (id) => {
  const m = MARKS[id];
  if (!m) return "";
  const [n, state] = m;
  return `<span class="cm cm--${state}" title="${plural(n, "Thread")}, ${STATE_WORD[state]}"><i class="dot" aria-hidden="true"></i>${n}</span>`;
};

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
const header = (current, { mode = false, badge = 0 } = {}) => `
<header class="hd${mode ? " hd--cmode" : ""}" id="bar" data-state="bar">
  <div class="hd-t1">
    <a class="hd-mark" href="#top">Kulka</a>
    <span class="hd-proj">${esc(M.projectName)}</span>
    <button class="hd-cmt${mode ? " is-on" : ""}" type="button" aria-pressed="${mode}">${mode ? "Done" : `<i aria-hidden="true"></i>Comment${badge ? `<b class="hd-badge" aria-label="${plural(badge, "New Reply", "New Replies")}">${badge}</b>` : ""}`}</button>
  </div>
  <nav class="hd-t2" aria-label="Sections">
    <ul class="hd-ix">${SECTIONS.map(([id, t]) => `<li><a href="#${id}"${id === current ? ' aria-current="true"' : ""}>${t}</a></li>`).join("")}</ul>
    <span class="hd-here">${SECTIONS.find((s) => s[0] === current)[1]}</span>
  </nav>${mode ? `
  <p class="cmode-bar">Tap any line, answer or figure to comment on it.</p>` : ""}
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

const page = (title, comment, current, body, opts = {}) => `<!doctype html>
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
<link rel="stylesheet" href="comments.css">
<style>${sectionStyle}</style>
</head>
<body class="frame${opts.mode ? " cmode" : ""}${opts.sheet ? " has-sheet" : ""}">
<!-- ${comment} -->
${header(current, opts)}
<main id="top">${body}
</main>${opts.overlay ?? ""}${SCRIPT}${CARD_SCRIPT}
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
          <span class="dv-meta">${g.lines.length ? mark(g.mark, `${WORD[g.mark]} Confidence`) : mark("none", "Outside the Total")}<span>${plural(g.items, "Item")}</span></span>${cm(elId(g))}
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
function trio(ledgerHtml, { svgKey = "line:39", focus = null, beside = "", under = "" } = {}) {
  const f = M.drawing.facts;
  const tag = focus ? `<p class="dwg-tag" hidden><b>${esc(focus.name)}</b><span class="num">${esc(focus.figure)}</span>${mark(focus.mark)}</p><i class="dwg-lead" hidden></i>` : "";
  return `
<div class="trio${focus ? " trio--open" : ""}" data-trio data-state="ledger">
  <div class="trio-main">${ledgerHtml}${beside ? `<div class="only-phone">${beside}</div>` : ""}${under}
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
            <div class="si-head"><span class="ln-l">${esc(line.label)}</span><span class="ln-v num">${usd(line.likely)}</span>${pill(open)}${cm(`line:${line.costCode}`)}</div>
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

// =====================================================================================
// LA-1484. The client comment layer (LA-1480, docs/precon/client-comments-spec.md,
// Decisions 1, 4 and 5 and the orphan rule), drawn on top of the approved LA-1479
// frames. The drill-down, its words and its layout are unchanged. Every figure is
// read from data/model.json. The threads, the reader, the Kulka replier and every
// date in a thread are SAMPLE content, and each frame says so in a frame note.
// =====================================================================================

const READER = { name: "Dan Reyes", company: "Fieldstone" }; // sample reader
const STAFF = { name: "Sam Ortiz", company: "The Kulka Group" }; // sample replier; the company is the spec's own words

const d02 = div("02");
const sd = d02.lines.find((l) => l.costCode === "1a");
const typeFact = fact("demolitionStructureType");

// The anchored card: positioned beside the ledger at 1440, a bottom sheet on a phone.
const CARD_SCRIPT = `
<script>
  (() => {
    const card = document.querySelector("[data-card]");
    const el = document.querySelector('[data-cm="anchor"]');
    if (!card || !el || innerWidth <= 860) return;
    const row = el.matches(".si, .lg-item") ? el.firstElementChild : el;
    const t = row.getBoundingClientRect(), lg = document.querySelector(".lg").getBoundingClientRect();
    const sheet = document.querySelector(".sheet--ledger").getBoundingClientRect();
    const trio = document.querySelector(".trio").getBoundingClientRect();
    const h = card.offsetHeight, mid = t.top + t.height / 2;
    // The element sits a little above the middle of the card, so a tall card rises above it.
    const left = sheet.right + 32, top = Math.max(trio.top, mid - h * 0.4 - 10) + scrollY;
    Object.assign(card.style, { left: left + "px", top: top + "px" });
    const mk = el.querySelector(".cm"), from = (mk ? mk.getBoundingClientRect().right : lg.right) + 6;
    const lead = document.querySelector(".cc-lead");
    Object.assign(lead.style, { left: from + "px", width: left - from + "px", top: mid + scrollY + "px" });
  })();
</script>`;

/** A frame note: never page content. */
const note = (text) => `<p class="fnote"><b>Frame Note</b>${esc(text)}</p>`;
const SAMPLE = "Sample threads. The reader, the Kulka replier, their words and the dates are sample content. Every figure is MN Test #4's own.";

const st = (state, word) => `<span class="st st--${state}"><i class="dot" aria-hidden="true"></i>${esc(word)}</span>`;
const kinds = (list, on) => `<div class="views cc-kinds" role="tablist" aria-label="Kind">${list.map((k) => `<span class="view${k === on ? " is-on" : ""}" role="tab" aria-selected="${k === on}">${k}</span>`).join("")}</div>`;
const asLine = () => `<p class="cc-as">Commenting As <b>${READER.name}, ${READER.company}</b> <a href="#">Not You?</a></p>`;
const field = (text, ph, cls = "") => `<div class="cc-field${cls}">${text ? `${esc(text)}<i class="caret" aria-hidden="true"></i>` : `<span class="ph">${esc(ph)}</span>`}</div>`;
const ccHead = ({ context = "", label, value = "", right = "" }) => `
    <div class="cc-hd">
      <div class="cc-on">${context ? `<p class="cc-ctx">${esc(context)}</p>` : ""}<p class="cc-l">${esc(label)}</p>${value ? `<p class="cc-v">${value}</p>` : ""}</div>${right}
      <span class="cc-x" aria-label="Close">&times;</span>
    </div>`;
const card = (inner, cls = "") => `
<div class="cc${cls ? ` ${cls}` : ""}" data-card role="dialog"><i class="cc-grab" aria-hidden="true"></i>${inner}
</div><i class="cc-lead" aria-hidden="true"></i>`;
const msg = (who, date, body, kulka = false) => `
      <li class="msg${kulka ? " msg--kulka" : ""}"><p class="msg-who"><b>${esc(who.name)}</b>${esc(who.company)} · ${esc(date)}</p><p class="msg-b">${esc(body)}</p></li>`;
/** Budget Says, from the anchor, beside Owner Says (or the field that becomes it). */
const says = (owner, { input = false } = {}) => `
    <div class="says">
      <div class="says-c says-c--budget"><p class="cc-lab">Budget Says</p><p class="says-v">${esc(typeFact.value)}</p></div>
      <div class="says-c"><p class="cc-lab">${input ? "What It Should Be" : "Owner Says"}</p>${input ? field(owner, "", " cc-field--one") : `<p class="says-v says-v--owner">${esc(owner)}</p>`}</div>
    </div>`;

/** Marks one element: hover (comment mode, at 1440) or anchor (its card is open). */
const markEl = (html, id, how) => html.replace(`data-el="${id}"`, `data-el="${id}" data-cm="${how}"${how === "anchor" ? " data-focus-phone" : ""}`);
const withFocus = (html, needle) => html.replace(needle, `${needle} data-focus`);

// The Basis tab, as frame 03 drew it, without the two gap lines (those were LA-1479 frame notes).
const itemTabs = (active, basis) => tabs([["Basis", basis], ["Inclusions and Exclusions", null]], active);
const basisRow = (label, value, chip, id = "") => `
              <li${id ? ` data-el="${esc(id)}"` : ""}><span class="as-l">${esc(label)}</span><span class="as-v">${value}</span>${chip}${id ? cm(id) : ""}</li>`;
const statedRow = (key) => {
  const f = fact(key);
  return basisRow(f.label, esc(f.value), src("quiet", "Stated"), `assumption:1a:${key}`);
};
const sdBasis = () => `
            <div class="si-body">${itemTabs("Basis", 4)}
              <ul class="as">${statedRow("demolitionStructureCount")}${statedRow("demolitionStructureSquareFeet")}${statedRow("demolitionStructureType")}${basisRow("Rate", "Rate on File", src("low", "Kulka Rate"), "assumption:1a:rate")}
              </ul>
            </div>`;
const d02Open = (itemInner = "") => openGroup(d02, `${groupTabs(d02, "Items")}${itemsPanel(d02, itemInner ? { openCode: "1a", itemInner } : {})}`);

// --- 01: at rest, for a reader ---------------------------------------------------------------

function f01() {
  MARKS = { "division:14": [1, "open"], "division:26": [1, "answered"], "division:31": [1, "done"] };
  return page(
    "01 At Rest",
    "Frame 01. The page at rest for a reader who opened their own link. The header holds the one Comment control, with 1 for the reply that arrived since this browser last opened the page. Three divisions carry a dot with a count at their right edge: 14 has an open thread (orange), 26 an answered one (blue), 31 a closed one (green). Nothing else changes.",
    "where-the-money-is",
    withFocus(trio(ledger({ current: "22" }), { svgKey: "line:28", beside: note(SAMPLE) }), '<div class="lg-item is-cur" data-el="division:22"'),
    { badge: 1 },
  );
}

// --- 02: comment mode ------------------------------------------------------------------------

function f02() {
  MARKS = {};
  const body = markEl(trio(ledger({ current: "02", openInner: d02Open() }), { focus: tagFor(d02), beside: note("Comment mode. Every element a reader can comment on shows a thin outline. At 1440 the one under the pointer shows a solid outline and a plus at its right edge. A phone has no hover, so a tap opens the composer.") }), "line:1a", "hover");
  return page(
    "02 Comment Mode",
    "Frame 02. Comment mode on: the header control reads Done and one line under the header says what to do. Every addressable element shows a thin outline; Structure Demolition is under the pointer. Rows do not open in this mode; a tap opens the composer.",
    "where-the-money-is",
    withFocus(body, '<div class="dv-open"'),
    { mode: true },
  );
}

// --- 03: the composer, on a line ---------------------------------------------------------------

function f03() {
  MARKS = {};
  const composer = card(`${ccHead({ label: sd.label, value: `<span class="num">${usd(sd.likely)}</span>` })}
    ${kinds(["Comment", "Ask a Question"], "Ask a Question")}
    ${field("Does this include the foundations, or only what is above grade?", "")}
    <div class="cc-ft">${asLine()}<span class="btn btn--ink">Post</span></div>`);
  const body = markEl(trio(ledger({ current: "02", openInner: d02Open() }), { focus: tagFor(d02), under: note("A line's figure takes a comment or a question, not a flag, so its composer offers two kinds. A reader who thinks a figure is wrong asks about it, and Kulka answers with the assumption behind it. " + SAMPLE) }), "line:1a", "anchor");
  return page(
    "03 The Composer",
    "Frame 03. Comment mode, after a tap on Structure Demolition. The composer is anchored to the line beside the ledger at 1440 and rises as a bottom sheet on a phone. A line allows two kinds, Comment and Ask a Question. The Commenting As line names the reader, with Not You? to clear it.",
    "where-the-money-is",
    withFocus(body, '<div class="dv-open"'),
    { mode: true, overlay: composer, sheet: true },
  );
}

// --- 04: the flag composer, on a Basis row -------------------------------------------------------

function f04() {
  MARKS = { "line:1a": [1, "open"] };
  const composer = card(`${ccHead({ context: `${sd.label} · Basis`, label: typeFact.label })}
    ${kinds(["Comment", "Ask a Question", "Flag This Assumption"], "Flag This Assumption")}
    ${says("Steel Frame with Metal Deck, No Concrete Fill", { input: true })}
    <div><p class="cc-lab">Why <span>Optional</span></p>${field("The roof deck has bare metal deck with no concrete on it. Our survey shows it.", "", " cc-field--short")}</div>
    <div class="cc-ft">${asLine()}<span class="btn btn--ink">Post</span></div>`, "cc--wide");
  const body = markEl(trio(ledger({ current: "02", openInner: d02Open(sdBasis()) }), { focus: tagFor(d02, sd), under: note("A Basis row is an assumption, so it allows all three kinds. A flag needs What It Should Be and may carry Why. Posting a flag changes nothing in the budget: Kulka reprices in the next version. " + SAMPLE) }), `assumption:1a:${typeFact.key}`, "anchor");
  return page(
    "04 The Flag Composer",
    "Frame 04. Structure Demolition open on its Basis tab, and the composer on Structure Coming Down with Flag This Assumption chosen. Budget Says sits beside What It Should Be, which is required; Why is optional and becomes the opening message. The question from frame 03 shows as an open thread on the line.",
    "where-the-money-is",
    withFocus(body, '<div class="dv-open"'),
    { mode: true, overlay: composer, sheet: true },
  );
}

// --- 05: a thread with a Kulka reply ------------------------------------------------------------------

function f05() {
  MARKS = { "line:1a": [1, "answered"] };
  const thread = card(`${ccHead({ label: sd.label, value: `<span class="num">${usd(sd.likely)}</span>`, right: `<p class="cc-state"><span class="cc-kind">Question</span>${st("answered", "Answered")}</p>` })}
    <ol class="msgs">${msg(READER, "Oct 1", "Does this include the foundations, or only what is above grade?")}${msg(STAFF, "Oct 2", "It includes the slab-on-grade and the footings. Hazardous material survey and abatement are not in it. They are listed under Exclusions.", true)}
    </ol>
    ${field("", "Reply")}
    <div class="cc-ft">${asLine()}<span class="btn">Close Question</span><span class="btn btn--ink">Reply</span></div>`);
  const body = markEl(trio(ledger({ current: "02", openInner: d02Open() }), { focus: tagFor(d02), under: note(SAMPLE) }), "line:1a", "anchor");
  return page(
    "05 A Thread",
    "Frame 05. The reader tapped the blue dot on Structure Demolition. The thread opens beside the line: the question, Kulka's reply under the replier's name and The Kulka Group, then a reply box with Close Question. A reader reply would make it open again.",
    "where-the-money-is",
    withFocus(body, '<div class="dv-open"'),
    { overlay: thread, sheet: true },
  );
}

// --- 05b: a flag thread, Budget Says beside Owner Says -----------------------------------------------------

function f05b() {
  MARKS = { "line:1a": [1, "answered"], [`assumption:1a:${typeFact.key}`]: [1, "open"] };
  const thread = card(`${ccHead({ context: `${sd.label} · Basis`, label: typeFact.label, right: `<p class="cc-state"><span class="cc-kind">Flag</span>${st("open", "Open")}</p>` })}
    ${says("Steel Frame with Metal Deck, No Concrete Fill")}
    <ol class="msgs">${msg(READER, "Oct 1", "The roof deck has bare metal deck with no concrete on it. Our survey shows it.")}${msg(STAFF, "Oct 2", "Thank you. Please send the survey and we will check it before the next version.", true)}
    </ol>
    ${field("", "Reply")}
    <div class="cc-ft">${asLine()}<span class="btn">Withdraw Flag</span><span class="btn btn--ink">Reply</span></div>`, "cc--wide");
  const body = markEl(trio(ledger({ current: "02", openInner: d02Open(sdBasis()) }), { focus: tagFor(d02, sd), under: note("A flag stays open until Kulka accepts or declines it. A Kulka reply does not close it, and the reader may withdraw it while it is open. " + SAMPLE) }), `assumption:1a:${typeFact.key}`, "anchor");
  return page(
    "05b A Flag Thread",
    "Frame 05b. The flag from frame 04, posted. Budget Says sits beside Owner Says, then the messages. Kulka has replied, and the flag stays open until Kulka accepts or declines it. The reader can reply or withdraw it.",
    "where-the-money-is",
    withFocus(body, '<div class="dv-open"'),
    { overlay: thread, sheet: true },
  );
}

// --- 06: the closed states, folded --------------------------------------------------------------------------

function f06() {
  const id = `assumption:1a:${typeFact.key}`;
  MARKS = { [id]: [6, "done"] };
  const fold = (state, kind, date, first, { reply = null, removed = false } = {}) => `
      <li class="fold"><p class="fold-top">${st("done", state)}<span class="fold-k">${kind} · ${date}</span></p><p class="fold-1${removed ? " fold-1--gone" : ""}">${esc(first)}</p>${reply ? `<p class="fold-r"><b>${esc(STAFF.name)}</b> ${esc(reply)}</p>` : ""}</li>`;
  const panel = card(`${ccHead({ context: `${sd.label} · Basis`, label: typeFact.label, right: `<p class="cc-state"><span class="cc-kind">6 Threads</span></p>` })}
    <ol class="folds">${fold("Carried Into Version 2", "Flag", "Oct 1", "Steel Frame with Metal Deck, No Concrete Fill")}${fold("Accepted for Next Version", "Flag", "Oct 21", "Add the Steel Canopy at the Loading Dock")}${fold("Declined", "Flag", "Oct 21", "Light-Gauge Steel Frame", { reply: "The survey shows heavy steel columns, so the rate stays." })}${fold("Withdrawn", "Flag", "Oct 22", "Wood Frame")}${fold("Closed", "Question", "Oct 22", "Does the structure type change the demolition schedule?")}${fold("Closed", "Comment", "Oct 23", "Removed at the Writer's Request", { removed: true })}
    </ol>`, "cc--wide");
  const body = markEl(trio(ledger({ current: "02", openInner: d02Open(sdBasis()) }), { focus: tagFor(d02, sd), under: note("Drawn as Version 2's page, because Carried Into Version 2 only shows there. Version 2 does not exist yet, so the figures and the Basis behind the panel are Version 1's, standing in. The six threads are gathered on one row only to show every closed state. " + SAMPLE) }), id, "anchor");
  return page(
    "06 The Closed States",
    "Frame 06. Every closed state, folded to its first line and its state with a green dot: Carried Into Version 2, Accepted for Next Version, Declined with Kulka's reply, Withdrawn, Closed, and a comment whose words were removed at the writer's request. None disappears from the version it was posted on.",
    "where-the-money-is",
    withFocus(body, '<div class="dv-open"'),
    { overlay: panel, sheet: true },
  );
}

// --- 07: From Earlier Versions, at the end of What Happens Next ------------------------------------------------

function f07() {
  MARKS = {};
  const n6 = M.notes.find((n) => n.number === 6);
  const gas = M.gates.unpriced.find((u) => u.label === "Gas Meter and Service Disconnect");
  const orphan = (quote, where, kind, state, word) => `
      <li class="orph"><div class="orph-a"><p class="orph-q">${esc(quote)}</p><p class="orph-m">${esc(where)} · ${kind} · ${READER.name}, ${READER.company}</p></div>${st(state, word)}<span class="pill">Show</span></li>`;
  return page(
    "07 From Earlier Versions",
    "Frame 07. The end of What Happens Next on Version 2. From Earlier Versions lists the threads whose element Version 2 no longer has, each quoting what the reader was looking at. They never move to a guessed element.",
    "what-happens-next",
    `
<section class="sheet next" id="what-happens-next" data-el="section:what-happens-next">
  ${note("Drawn as Version 2's page. Version 2 does not exist yet. The two quotes are Version 1's own words from the model; the threads on them are sample content.")}
  <div class="sheet-hd">
    <h1 class="sheet-h">What Happens Next</h1>
  </div>
  <ol class="steps">
    <li><b>Check the Basis.</b> Open each division in The Ledger and read the Basis under its items. If anything is wrong, flag it there and Kulka reprices from the corrected fact.</li>
    <li><b>Answer the open item.</b> ${esc(M.next.openQuestions.join(" "))} An answer moves what waits on it into, or out of, the number.</li>
    <li><b>Reprice at ${esc(M.next.nextStage.label)}.</b> ${esc(M.next.nextStage.words)}</li>
  </ol>
  <p class="reach">To reach Kulka, reply to the estimator who sent you this link.</p>
  <div class="earlier">
    <h2 class="gates-h">From Earlier Versions</h2>
    <p class="earlier-sub">These threads were on parts of Version 1 that Version 2 does not have.</p>
    <ul class="orphs">${orphan(n6.text, "Version 1 · Clarification 6", "Question", "open", "Open")}${orphan(`${gas.label}, No Rate Yet`, "Version 1 · 33 Utilities", "Comment", "done", "Closed")}
    </ul>
  </div>
</section>`.replace('<div class="earlier"', '<div class="earlier" data-focus'),
  );
}

// --- Write ------------------------------------------------------------------------------------------------------------------

const FRAMES = {
  "01-at-rest": f01,
  "02-comment-mode": f02,
  "03-composer": f03,
  "04-flag-composer": f04,
  "05-thread": f05,
  "05b-flag-thread": f05b,
  "06-closed-states": f06,
  "07-earlier-versions": f07,
};
for (const f of fs.readdirSync(root).filter((f) => /^\d\d[a-z]?-.*\.html$/.test(f))) fs.unlinkSync(`${root}/${f}`);
for (const [name, build] of Object.entries(FRAMES)) {
  const html = build();
  const visible = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<script[\s\S]*?<\/script>/g, "");
  if (/Kulka Jobs?|completed jobs/.test(visible)) throw new Error(`${name} still carries past-job wording`);
  if (/\bAI\b|artificial intelligence/i.test(visible.replace(/<[^>]+>/g, " "))) throw new Error(`${name} names AI on the client page`);
  if (/[–—]/.test(visible)) throw new Error(`${name} carries a dash`);
  fs.writeFileSync(`${root}/${name}.html`, html);
  console.log("wrote", `${name}.html`);
}
