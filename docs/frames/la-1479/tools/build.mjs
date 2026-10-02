// LA-1479, round two. Builds the budget drill-down still frames from MN Test
// #4's real model: data/model.json is presentBudget() run on test/fixtures/
// published-budget-mn4.json (production run 9b995af5, frozen 2026-09-29) at
// commit 38a8e4a, and the section drawings in data/ are the shipped page's own
// (tools/capture.mjs). Every figure, label and answer on a frame is read from
// those files or the fixture. Where the model has no data, a frame shows one
// quiet line naming the field the build needs, and nothing fills the gap.
//
// Round two (after an 88 second opinion): one level open at a time, each
// opened state readable in its first screen, the section answering the open
// division and item, and the gap boxes cut to one line each.
//
// Run: node tools/build.mjs   then   node tools/shoot.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repo = path.resolve(root, "../../..");
const M = JSON.parse(fs.readFileSync(`${root}/data/model.json`, "utf8"));
const RAW = JSON.parse(fs.readFileSync(`${repo}/test/fixtures/published-budget-mn4.json`, "utf8")).snapshot;
const svgOf = (key) => fs.readFileSync(`${root}/data/section-${key.replace(":", "-")}.svg`, "utf8");
const sectionStyle = fs.readFileSync(`${root}/data/section-style.css`, "utf8");

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

// --- The divisions: the ledger's rows grouped by their own division ------------------

const broughtInBy = new Map(M.gates.unpriced.map((u) => [u.label, u.broughtInBy]));
/** A division takes its lines' mark the way an element does: high only if all are high, low if any is low. */
const markOf = (lines) => (lines.every((l) => l.confidence === "high") ? "high" : lines.some((l) => l.confidence === "low") ? "low" : "medium");

const divisions = [];
for (const row of M.ledger) {
  let d = divisions.find((x) => x.code === row.division);
  if (!d) divisions.push((d = { code: row.division, title: TITLES[row.division], rows: [] }));
  d.rows.push(row);
}
for (const d of divisions) {
  d.lines = d.rows.flatMap((r) => r.scope.lines.map((l) => ({ ...l, rowKey: r.key })));
  d.unpriced = d.rows.flatMap((r) => r.scope.unpriced.map((u) => ({ ...u, by: broughtInBy.get(u.label) ?? null })));
  d.likely = d.rows.reduce((s, r) => s + r.scope.likely, 0);
  d.low = d.rows.reduce((s, r) => s + r.scope.low, 0);
  d.high = d.rows.reduce((s, r) => s + r.scope.high, 0);
  d.owner = d.rows.every((r) => r.scope.ownerDirect);
  d.mark = markOf(d.lines);
  d.items = d.lines.length + d.unpriced.length;
  d.keys = d.rows.map((r) => r.key);
}
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
const pill = (open) => `<span class="pill">${open ? "Close" : "Open"}</span>`;
/** Room for the LA-1480 flag or comment control; that issue designs it. */
const slot = () => `<span class="slot" title="Reserved for the LA-1480 flag or comment control">LA-1480</span>`;
/** The LA-1481 control in its empty state. */
const ve = () => `<span class="ve" title="LA-1481: Value Engineering, empty until Kulka supplies options">VE <b>None Yet</b></span>`;
/** One quiet line per gap: what the model lacks, and the field the build needs. */
const gm = (words, ...fields) => `<p class="gm"><i aria-hidden="true"></i>Not in the model: ${esc(words)} ${fields.map((f) => `<code>${esc(f)}</code>`).join(" ")}</p>`;

function tabs(list, active, end = "") {
  return `
          <div class="tabs" role="tablist">${list
            .map(([label, n]) => `<span class="tab${label === active ? " is-on" : ""}" role="tab" aria-selected="${label === active}">${esc(label)}${n != null ? ` <span class="tab-n">${n}</span>` : ""}</span>`)
            .join("")}${end ? `<span class="tabs-end">${end}</span>` : ""}</div>`;
}

const SECTIONS = [
  ["letter", "Letter"],
  ["the-project", "What You Told Us"],
  ["where-the-money-is", "The Ledger"],
  ["design-and-engineering", "Design and Engineering"],
  ["from-trades-to-total", "From Trades to Total"],
  ["notes", "Notes"],
  ["what-happens-next", "What Happens Next"],
];
const header = (current) => `
<header class="hd" id="bar" data-state="bar">
  <div class="hd-t1">
    <a class="hd-mark" href="#top">Kulka</a>
    <span class="hd-proj">${esc(M.projectName)}</span>
  </div>
  <nav class="hd-t2" aria-label="Sections">
    <ul class="hd-ix">${SECTIONS.map(([id, t]) => `<li><a href="#${id}"${id === current ? ' aria-current="true"' : ""}>${t}</a></li>`).join("")}</ul>
    <span class="hd-here">${SECTIONS.find((s) => s[0] === current)[1]}</span>
  </nav>
</header>`;

// The frame's only script: the phone crop and lens place the shipped page's
// JS would set, and, when a division is open, the section lit to answer it.
const SCRIPT = `
<script>
  const phone = innerWidth <= 860;
  if (phone) document.querySelectorAll("svg[data-vb-phone]").forEach((s) => s.setAttribute("viewBox", s.getAttribute("data-vb-phone")));
  const aside = document.querySelector(".sheet--dwg"), lens = document.querySelector("[data-lens]");
  if (phone && aside && lens) lens.style.setProperty("--lens-top", document.querySelector(".hd").offsetHeight + aside.offsetHeight + "px");
  // The open division's layers light in place; every other layer stays drawn, in light ink.
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

function divisionRow(d, { current = false, open = false, inner = "" } = {}) {
  return `
      <div class="lg-item${current ? " is-cur" : ""}${d.owner ? " lg-item--owner" : ""}" data-el="division:${d.code}" data-open="${open}" role="row">
        <button class="lg-row lg-btn dv-row" type="button" aria-expanded="${open}">
          <span class="lg-div num">${d.code}</span>
          <span class="lg-name">${esc(d.title)}${d.owner ? ' <span class="lg-tag">Bought by the Owner</span>' : ""}</span>
          ${mark(d.mark)}
          <span class="lg-amt num">${usd(d.likely)}</span>
          <span class="lg-psf num">${psf(d.likely)}</span>
          <span class="lg-pct num">${d.owner ? "" : pct(d.likely)}</span>
          <span class="dv-meta">${mark(d.mark, `${WORD[d.mark]} Confidence`)}<span>${plural(d.items, "Item")}</span></span>
        </button>${inner}
      </div>`;
}

function lens(d, open) {
  return `
    <div class="lens" data-lens data-open="${open}" aria-label="The current row"><div class="lens-in" data-open="${open}">
      <div class="lg-row lg-btn">
        <span class="lg-div num">${d.code}</span>
        <span class="lg-name">${esc(d.title)}</span>
        <span class="lg-amt num">${usd(d.likely)}</span>
        <span class="lg-psf num"></span><span class="lg-pct num"></span>
        <span class="lg-rate num">${psf(d.likely)} per SF${d.owner ? "" : ` · ${pct(d.likely)}`}</span>
        <span class="lg-more dv-more">${mark(d.mark, `${WORD[d.mark]} Confidence`)}<span class="lg-count">${plural(d.items, "Item")}</span>${pill(open)}</span>
      </div>
    </div></div>`;
}

function ledger(currentCode, openInner = null, { from = null } = {}) {
  const cur = div(currentCode);
  const start = from ? divisions.indexOf(div(from)) : 0;
  // With a division open, two closed rows follow it and the rest are elided; frame 01 shows them all.
  const end = openInner !== null ? Math.min(divisions.indexOf(cur) + 3, divisions.length) : divisions.length;
  const list = divisions.slice(start, end);
  const rest = divisions.length - end;
  const t = M.headline.tradeCost;
  return `
<section class="sheet sheet--ledger" id="where-the-money-is" data-el="section:where-the-money-is">
  <div class="sheet-hd">
    <h1 class="sheet-h">The Ledger</h1>
    <p class="sheet-sub">By division, in the order the trades build it. Open one to see what is in it.</p>
  </div>
  <div class="lg" role="table" aria-label="The Ledger">${from ? "" : `
    <div class="lg-row lg-cols dv-row" role="row">
      <span class="lg-div">Div</span>
      <span class="lg-name">Division</span>
      <span class="dv-cf">Confidence</span>
      <span class="lg-amt">Amount</span>
      <span class="lg-psf">$/SF</span>
      <span class="lg-pct">%</span>
    </div>`}${lens(cur, openInner !== null)}${list
      .map((d) => divisionRow(d, { current: d.code === currentCode, open: d.code === currentCode && openInner !== null, inner: d.code === currentCode && openInner !== null ? openInner : "" }))
      .join("")}${rest > 0 ? `
    <p class="lg-elide">${rest} more ${rest === 1 ? "division" : "divisions"}, closed</p>` : ""}${from || rest > 0 ? "" : `
    <div class="lg-foot lg-foot--quiet" data-el="total:trade-cost">
      <span>All Trades, Owner-Direct Included <span class="lg-foot-range num">${usd(t.low)} to ${usd(t.high)}</span></span>
      <span class="num">${usd(t.likely)}</span>
    </div>`}
  </div>${from || rest > 0 ? "" : `
  <p class="lg-source" data-el="note:sourcing">96.7% of the trade cost is priced from Kulka's completed jobs, and 3.3% from rates Kulka has stated.</p>`}
</section>`;
}

/**
 * The trio as shipped. With a division open (`focus`), the section shows every
 * layer, the open division's lit in place and a tag beside it naming what is open.
 */
function trio(ledgerHtml, { svgKey = "line:39", focus = null, beside = "" } = {}) {
  const f = M.drawing.facts;
  const tag = focus
    ? `<p class="dwg-tag" hidden><b>${esc(focus.name)}</b><span class="num">${esc(focus.figure)}</span>${mark(focus.mark)}</p><i class="dwg-lead" hidden></i>`
    : "";
  return `
<div class="trio" data-trio data-state="ledger">
  <div class="trio-main">${ledgerHtml}${beside ? `<div class="only-phone">${beside}</div>` : ""}
  </div>
  <aside class="sheet sheet--dwg" aria-label="The Section">
    <div class="dwg dwg--crop dwg--live" data-dwg="section"${focus ? ` data-now="${esc(focus.keys.join(" "))}"` : ""}>${svgOf(svgKey)}${tag}</div>
    <p class="dwg-cap only-phone"><b>Building Section</b> · ${f.stories} Stories · ${f.units} Units · ${esc(f.grossArea)}</p>${beside ? `<div class="only-desk">${beside}</div>` : ""}
  </aside>
</div>`;
}

// --- Inside an open division: one level open at a time --------------------------------------

const divisionTabs = (d, active) =>
  tabs(
    [["Items", d.items], ["Confidence", null], ...(gatesOf(d.code).length ? [["What Decided It", null]] : [])],
    active,
    `<span class="only-desk ctl">${ve()}${slot()}</span>`,
  );
/** On a phone the two controls close the open division rather than crowd its tabs. */
const phoneControls = `
          <p class="only-phone ctl ctl--foot">${ve()}${slot()}</p>`;

/** An item, closed: its name, figure and one meta line. Open, it adds its range and its own tabs. */
function item(line, inner = "") {
  const open = inner !== "";
  return `
          <div class="si" data-el="line:${esc(line.costCode)}" data-open="${open}">
            <div class="si-head"><span class="ln-l">${esc(line.label)}</span><span class="ln-v num">${usd(line.likely)}</span>${pill(open)}</div>
            <p class="si-meta">${open ? `<span class="num">${usd(line.low)} to ${usd(line.high)}</span><i>·</i>` : ""}${mark(line.confidence)}<i>·</i><span>${esc(line.source.text)}</span></p>${inner}
          </div>`;
}

/** The supporting items a driver brings in, as one closed row: they share a driver and have no rate. */
function broughtIn(d) {
  const by = [...new Set(d.unpriced.map((u) => u.by))];
  return by
    .map(
      (driver) => `
          <div class="si si--group">
            <div class="si-head"><span class="ln-l">Brought In by ${esc(driver)}</span><span class="ln-v">${plural(d.unpriced.filter((u) => u.by === driver).length, "Item")}</span>${pill(false)}</div>
            <p class="si-meta">${mark("none", "No Rate Yet")}<i>·</i><span>Outside the Total</span></p>
          </div>`,
    )
    .join("");
}

const openDivision = (d, body) => `
      <div class="dv-open" id="division-${d.code}-lines">${body}${phoneControls}
      </div>`;

const itemsPanel = (d, openCode = null, itemInner = "") => `${d.lines.map((l) => item(l, l.costCode === openCode ? itemInner : "")).join("")}${broughtIn(d)}`;

const tagFor = (d, line = null) => ({
  keys: d.keys,
  name: line ? line.label : `${d.code} ${d.title}`,
  figure: usd(line ? line.likely : d.likely),
  mark: line ? line.confidence : d.mark,
});

// --- Frame 01: the ledger by division, closed ---------------------------------------------------------

const f01 = page(
  "01 The Ledger by Division",
  "Frame 01. The drill-down closed: the ledger's 36 rows grouped into the 21 divisions they already carry, each with its figure, $/SF, share and a confidence mark. Mid-scroll, as shipped: the lens holds 22 Plumbing, and the section has drawn every layer down to it, Plumbing's in the accent.",
  "where-the-money-is",
  trio(ledger("22"), { svgKey: "line:28" }),
);

// --- Frame 02: a division opened to its items ---------------------------------------------------------------

const d02 = div("02");
const f02 = page(
  "02 A Division, Opened",
  "Frame 02. 02 Existing Conditions open on its Items tab: Structure Demolition, Site Demolition, and the four disconnects Structure Demolition brings in, as one closed row. The tab row carries the empty VE control (LA-1481) and the LA-1480 slot. The section lights the division's layer.",
  "where-the-money-is",
  trio(ledger("02", openDivision(d02, `${divisionTabs(d02, "Items")}${itemsPanel(d02)}`)), { focus: tagFor(d02) }),
);

// --- Frames 03 and 03b: an item opened, one tab at a time ----------------------------------------------------------

const sd = d02.lines.find((l) => l.costCode === "1a");
const itemTabs = (active, assumptions) => tabs([["Assumptions", assumptions], ["Included and Excluded", null], ["Source", null]], active);
const asRow = (label, value, basis) => `
              <li><span class="as-l">${esc(label)}</span><span class="as-v">${value}</span>${basis}${slot()}</li>`;
const statedRow = (key) => {
  const f = fact(key);
  return asRow(f.label, esc(f.value), src("quiet", "Stated"));
};
const sdAssumptions = `
            <div class="si-body">${itemTabs("Assumptions", 4)}
              <ul class="as">${statedRow("demolitionStructureCount")}${statedRow("demolitionStructureSquareFeet")}${statedRow("demolitionStructureType")}${asRow("Rate", "Rate on File", src("low", "Kulka Rate"))}
              </ul>
              ${gm("which answers this line prices on", "line.inputs[]")}
              ${gm("the rate's unit and quantity", "line.quantity", "comparable.unit")}
            </div>`;
const sdScope = `
            <div class="si-body">${itemTabs("Included and Excluded", 4)}
              ${gm("the item's scope; this is Kulka's definition of item 1a", "line.includes[]", "line.excludes[]")}
              <div class="io">
                <div><p class="io-h io-h--in"><i></i>Included</p><ul><li>Mechanical Demolition of the Structure</li><li>Slab-on-Grade and Footings</li><li>Loading, Trucking and C&amp;D Disposal</li></ul></div>
                <div><p class="io-h io-h--out"><i></i>Excluded</p><ul><li>Hazardous Material Survey and Abatement</li><li>Disconnects and Site Demolition, Their Own Items</li><li>Backfill, Permits and the Demolition Bond</li></ul></div>
              </div>
            </div>`;
const f03 = page(
  "03 An Item, Opened",
  "Frame 03. Structure Demolition open on its Assumptions tab: the three answers it prices on, each Stated, and Kulka's rate, each with the LA-1480 slot. Two quiet lines name what the model lacks. The section tag names the open item.",
  "where-the-money-is",
  trio(ledger("02", openDivision(d02, `${divisionTabs(d02, "Items")}${itemsPanel(d02, "1a", sdAssumptions)}`)), { focus: tagFor(d02, sd) }),
);
const f03b = page(
  "03b An Item, Included and Excluded",
  "Frame 03b. The same item on its Included and Excluded tab. No line carries its scope, so the lists are Kulka's own definition of item 1a (docs/precon/canonical-work-items.md), marked as such on one line.",
  "where-the-money-is",
  trio(ledger("02", openDivision(d02, `${divisionTabs(d02, "Items")}${itemsPanel(d02, "1a", sdScope)}`)), { focus: tagFor(d02, sd) }),
);

// --- Frame 04: confidence, and what would raise it -----------------------------------------------------------------

const d14 = div("14");
const soil = fact("site_conditions");
const raiseRow = (tagHtml, label, value, basis) => `
            <li>${tagHtml}<span class="raise-t">${esc(label)}</span><span class="raise-v">${esc(value)}</span>${basis}${slot()}</li>`;
const lineMarks = d14.lines.map((l) => `${esc(l.label)} ${mark(l.confidence)}`).join("<i>·</i>");
const f04body = `${divisionTabs(d14, "Confidence")}
          <div class="cf-panel">
            <div class="cf-big">${mark(d14.mark, `${WORD[d14.mark]} Confidence`)}</div>
            <p class="cf-lines">${lineMarks}</p>
            <p class="dv-h">What Would Raise It</p>
            <ul class="raise">${["V-1", "V-2", "V-3"]
              .map((c) => crit(c))
              .map((k) => raiseRow(`<span class="crit-tag num">${esc(k.code)}</span>`, k.label, k.value, src("working", "Planning Assumption")))
              .join("")}${raiseRow('<span class="q-tag">Open</span>', soil.label, soil.value, src("working", "Waiting on You"))}
            </ul>
            ${gm("whether settling these raises the mark", "confidence.raisedBy[]")}
          </div>`;
const f04 = page(
  "04 Confidence, and What Would Raise It",
  "Frame 04. 14 Conveying Equipment open on its Confidence tab: the division's mark, each line's mark, and What Would Raise It (the three elevator criteria still planning assumptions and the open groundwater question), each with the LA-1480 slot. One quiet line says the model cannot yet promise they raise it.",
  "where-the-money-is",
  trio(ledger("14", openDivision(d14, f04body), { from: "14" }), { focus: tagFor(d14) }),
);

// --- Frame 04b: what decided a division, moved here from What Is In ------------------------------------------------

const d08 = div("08");
const decidedRow = (g) => {
  const why = g.decidedBy.map((x) => {
    const f = factFor(x.question);
    return `${esc(f ? f.label : x.question)}: <strong>${esc(x.answer)}</strong>`;
  });
  const group = M.gates.notInThisJob.includes(g) ? "Not in This Job" : M.gates.waiting.includes(g) ? "Waiting on an Answer" : "In the Number";
  return `
            <li><span class="dec-l">${esc(g.label)}</span><span class="dec-g">${group}</span><span class="dec-a">${why.join(" · ")}</span>${slot()}</li>`;
};
const f04b = page(
  "04b What Decided It",
  "Frame 04b. 08 Openings open on its What Decided It tab: the two What Is In rows that belong to this division, each with the answer that removed it and the LA-1480 slot. This is where What Is In, and What Is Not goes.",
  "where-the-money-is",
  trio(
    ledger("08", openDivision(d08, `${divisionTabs(d08, "What Decided It")}
          <p class="dv-h">Not in This Job</p>
          <ul class="dec">${gatesOf("08").map(decidedRow).join("")}
          </ul>`), { from: "08" }),
    { focus: tagFor(d08) },
  ),
);

// --- Frame 05: a division the model cannot open far, and what the model needs ----------------------------------------

const d22 = div("22");
const needs = `
    <div class="needs" aria-label="What the Model Needs">
      <p class="needs-h">What the Model Needs</p>
      <p class="needs-sub">Frame note, not page content. Every gap on frames 02 to 05, in one place.</p>
      <ul>
        <li><span class="needs-f"><code>line.inputs[]</code></span><span>The answers each line prices on</span></li>
        <li><span class="needs-f"><code>line.quantity</code> <code>comparable.unit</code></span><span>A stated rate's quantity and unit</span></li>
        <li><span class="needs-f"><code>line.includes[]</code> <code>line.excludes[]</code></span><span>Each item's written scope, from Kulka</span></li>
        <li><span class="needs-f"><code>breakout_of_cost_code</code></span><span>Sub-items inside a one-line division</span></li>
        <li><span class="needs-f"><code>confidence.raisedBy[]</code></span><span>What would move each mark, and to what</span></li>
        <li><span class="needs-f"><code>line.division</code></span><span>The division, carried in the snapshot</span></li>
      </ul>
    </div>`;
const f05 = page(
  "05 A Division With Gaps",
  "Frame 05. 22 Plumbing open on its Items tab: one line priced from 2 Kulka jobs, and one quiet line saying there are no sub-items. The What the Model Needs panel, a frame note, gathers every gap from frames 02 to 05.",
  "where-the-money-is",
  trio(ledger("22", openDivision(d22, `${divisionTabs(d22, "Items")}${itemsPanel(d22)}
          ${gm("sub-items; Plumbing is one line", "block_classification.breakout_of_cost_code")}`), { from: "22" }), { focus: tagFor(d22), beside: needs }),
);

// --- Frame 06: where What You Told Us and What Is In go -----------------------------------------------------------------

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

const f06 = page(
  "06 Where the Sections Go",
  "Frame 06. What You Told Us keeps the 11 answers about the whole project and lists where the other 16 went. What Is In, and What Is Not becomes Notes and Clarifications: its rows now sit under each division's What Decided It tab, and the notes and parameters stay as shipped.",
  "the-project",
  `
<section class="sheet" id="the-project" data-el="section:the-project">
  <div class="sheet-hd">
    <h1 class="sheet-h">What You Told Us</h1>
    <p class="sheet-sub">${esc(M.project.line)}</p>
  </div>
  <p class="fig-md num" data-el="fact:grossSquareFeet:figure">${GSF.toLocaleString("en-US")} SF</p>
  <p class="lede">Your answers about the whole project. Answers about one trade sit with that trade in The Ledger.</p>
  <dl class="facts lg">${projectFacts.map(factRow).join("")}
  </dl>
  <div class="moved">
    <h2 class="gates-h">Your Other Answers, by Division</h2>
    <ul class="plain">${homes.map(homeRow).join("")}</ul>
  </div>
</section>
<p class="elide">The Ledger, Design and Engineering and From Trades to Total follow here, as frames 01 to 05 and PR 134 show them.</p>
<section class="sheet gates" id="notes" data-el="section:what-is-in">
  <div class="sheet-hd">
    <h1 class="sheet-h">Notes and Clarifications</h1>
  </div>
  <p class="lede">What is in the number and what is not now sits with each division in The Ledger.</p>
  <ol class="notes">${M.notes.slice(0, 3).map((n) => `
    <li class="note" data-el="${esc(n.el)}" value="${n.number}"><span class="note-n num">${n.number}</span><span class="note-text">${esc(n.text)}</span></li>`).join("")}
  </ol>
  <p class="elide elide--in">Notes 4 to ${M.notes.length} and the ${M.parameters.length} pricing parameters follow, as shipped.</p>
</section>`,
);

// --- Write ------------------------------------------------------------------------------------------------------------------

const FRAMES = {
  "01-ledger-closed": f01,
  "02-division-open": f02,
  "03-item-open": f03,
  "03b-item-scope": f03b,
  "04-confidence": f04,
  "04b-what-decided-it": f04b,
  "05-division-gaps": f05,
  "06-where-sections-go": f06,
};
// Where tools/shoot.mjs scrolls for each frame's one-screen view: the open division, just under the lens.
const FOCUS = {
  "01-ledger-closed": '<div class="lg-item is-cur" data-el="division:22"',
  "02-division-open": '<div class="dv-open"',
  "03-item-open": '<div class="dv-open"',
  "03b-item-scope": '<div class="dv-open"',
  "04-confidence": '<div class="dv-open"',
  "04b-what-decided-it": '<div class="dv-open"',
  "05-division-gaps": '<div class="dv-open"',
  "06-where-sections-go": '<div class="moved"',
};
for (const f of fs.readdirSync(root).filter((f) => /^\d\d[a-z]?-.*\.html$/.test(f))) fs.unlinkSync(`${root}/${f}`);
for (const [name, built] of Object.entries(FRAMES)) {
  const html = FOCUS[name] ? built.replace(FOCUS[name], `${FOCUS[name]} data-focus`) : built;
  fs.writeFileSync(`${root}/${name}.html`, html);
  console.log("wrote", `${name}.html`);
}

// The audit table NOTES.md quotes: per division, what the model holds.
const audit = divisions.map((d) => ({
  division: `${d.code} ${d.title}`,
  likely: usd(d.likely),
  mark: WORD[d.mark],
  priced: d.lines.map((l) => `${l.label} (${WORD[l.confidence]})`),
  unpriced: d.unpriced.map((u) => u.label),
  criteria: M.criteria.filter((k) => RAW.criteria.find((r) => r.code === k.code).costCodes.some((c) => d.lines.some((l) => l.costCode === c) || d.unpriced.some((u) => u.costCode === c))).map((k) => `${k.code} ${k.settled ? "Settled" : "Planning Assumption"}`),
  answers: movedFacts.filter((f) => FACT_HOME[f.key] === d.code).map((f) => f.label),
  gates: gatesOf(d.code).map((g) => g?.label),
}));
fs.writeFileSync(`${root}/data/audit.json`, JSON.stringify(audit, null, 1));
console.log("wrote data/audit.json");
