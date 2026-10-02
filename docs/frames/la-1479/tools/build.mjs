// LA-1479. Builds the budget drill-down still frames from MN Test #4's real
// model: data/model.json is presentBudget() run on test/fixtures/
// published-budget-mn4.json (production run 9b995af5, frozen 2026-09-29) at
// commit 38a8e4a, and the section drawings in data/ are the shipped page's own
// (tools/capture.mjs). Every figure, label, answer and sentence on a frame is
// read from those two files or the fixture, except where a frame shows a gap:
// a hatched box that names the model field the build would need.
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

// --- Pieces ----------------------------------------------------------------------------

const src = (tone, text) => `<span class="src"><i class="dot dot--${tone}" aria-hidden="true"></i>${esc(text)}</span>`;
const mark = (tone, text = WORD[tone]) => `<span class="dv-cf"><i class="dot dot--${tone}" aria-hidden="true"></i>${esc(text)}</span>`;
const pill = (open) => `<span class="pill">${open ? "Close" : "Open"}</span>`;
const slot = (text = "LA-1480", cls = "slot--sm") => `<span class="slot ${cls}" title="Reserved for the flag and comment control in LA-1480">${esc(text)}</span>`;
const gap = (title, body) => `<div class="gap"><p class="gap-t">${esc(title)}</p>${body}</div>`;
const code = (t) => `<code>${esc(t)}</code>`;

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
</main>
<script>
  // The phone crops the section to the building, as the shipped page does (budget-page.js).
  if (innerWidth <= 860) document.querySelectorAll("svg[data-vb-phone]").forEach((s) => s.setAttribute("viewBox", s.getAttribute("data-vb-phone")));
  // On a phone the lens holds under the pinned section, as budget-page.js places it.
  const dwg = document.querySelector(".sheet--dwg"), lens = document.querySelector("[data-lens]");
  if (innerWidth <= 860 && dwg && lens) lens.style.setProperty("--lens-top", document.querySelector(".hd").offsetHeight + dwg.offsetHeight + "px");
</script>
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
          <span class="dv-meta">${mark(d.mark, `${WORD[d.mark]} Confidence`)}<span>${d.items} ${d.items === 1 ? "Item" : "Items"}</span></span>
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
        <span class="lg-more dv-more">${mark(d.mark, `${WORD[d.mark]} Confidence`)}<span class="lg-count">${d.items} ${d.items === 1 ? "Item" : "Items"}</span>${pill(open)}</span>
      </div>
    </div></div>`;
}

function ledger(currentCode, openInner = null, { from = null } = {}) {
  const cur = div(currentCode);
  const start = from ? divisions.indexOf(div(from)) : 0;
  // With a division open, three rows follow it and the rest are elided; frame 01 shows them all.
  const end = openInner !== null ? Math.min(divisions.indexOf(cur) + 4, divisions.length) : divisions.length;
  const list = divisions.slice(start, end);
  const rest = divisions.length - end;
  const t = M.headline.tradeCost;
  return `
<section class="sheet sheet--ledger" id="where-the-money-is" data-el="section:where-the-money-is">
  <div class="sheet-hd">
    <h1 class="sheet-h">The Ledger</h1>
    <p class="sheet-sub">By division, in the order the trades build it. Open a division for its items and how sure the figure is, then open an item for what it assumes.</p>
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
    <p class="lg-elide">${rest} more ${rest === 1 ? "division" : "divisions"}, closed, as frame 01 shows them.</p>` : ""}${from || rest > 0 ? "" : `
    <div class="lg-foot lg-foot--quiet" data-el="total:trade-cost">
      <span>All Trades, Owner-Direct Included <span class="lg-foot-range num">${usd(t.low)} to ${usd(t.high)}</span></span>
      <span class="num">${usd(t.likely)}</span>
    </div>`}
  </div>${from || rest > 0 ? "" : `
  <p class="lg-source" data-el="note:sourcing">96.7% of the trade cost is priced from Kulka's completed jobs, and 3.3% from rates Kulka has stated.</p>`}
</section>`;
}

function trio(svgKey, ledgerHtml) {
  const f = M.drawing.facts;
  return `
<div class="trio" data-trio data-state="ledger">
  <div class="trio-main">${ledgerHtml}
  </div>
  <aside class="sheet sheet--dwg" aria-label="The Section">
    <div class="dwg dwg--crop dwg--live" data-dwg="section">${svgOf(svgKey)}</div>
    <p class="dwg-cap only-phone"><b>Building Section</b> · ${f.stories} Stories · ${f.units} Units · ${esc(f.grossArea)}</p>
  </aside>
</div>`;
}

// --- Inside an open division --------------------------------------------------------------

function cmps(line) {
  return `<ul class="cmps" aria-label="Where the figure came from">${line.comparables
    .map(
      (c) => `
              <li class="cmp"><span class="cmp-k">${esc(c.kindWords)}</span><span class="cmp-j">${esc(c.jobs)}</span><span class="cmp-r num">${esc(c.rate)}</span><span class="cmp-w">Weight ${c.weight}</span><span class="cmp-d">${esc(c.recordedAt)}</span></li>`,
    )
    .join("")}
            </ul>`;
}

function subItem(line, body = "") {
  const open = body !== "";
  return `
          <div class="si" data-el="line:${esc(line.costCode)}" data-open="${open}">
            <div class="si-head"><span class="ln-l">${esc(line.label)}</span>${src(line.source.tone, line.source.text)}<span class="ln-v num">${usd(line.likely)}</span>${pill(open)}</div>
            <p class="ln-range">${usd(line.low)} to ${usd(line.high)}. ${src(line.confidence, `${WORD[line.confidence]} Confidence`)}</p>${body}
          </div>`;
}

function unpricedGroup(d) {
  if (d.unpriced.length === 0) return "";
  const by = [...new Set(d.unpriced.map((u) => u.by))];
  return by
    .map(
      (driver) => `
        <div class="dv-block">
          <p class="dv-h">Brought In by ${esc(driver)}, No Rate Yet</p>${d.unpriced
            .filter((u) => u.by === driver)
            .map(
              (u) => `
          <div class="si si--quiet" data-el="unpriced:${esc(u.costCode)}"><div class="si-head"><span class="ln-l"><i class="dot dot--none" aria-hidden="true"></i> ${esc(u.label)}</span><span class="ln-v num">Outside the Total</span></div></div>`,
            )
            .join("")}
        </div>`,
    )
    .join("");
}

function bar(d) {
  return `
        <div class="dv-bar">
          <p class="ln-sum">Together, between ${usd(d.low)} and ${usd(d.high)}, likely ${usd(d.likely)}.</p>
          <div class="dv-ctl">${slot("Reserved · LA-1480 Flag or Comment", "")}<span class="slot slot--ve" title="Reserved for LA-1481">LA-1481<span class="ve" aria-disabled="true">Value Engineering <b>None Offered Yet</b></span></span></div>
        </div>`;
}

function decided(rows) {
  const groups = [
    ["In the Number", rows.filter((r) => M.gates.answeredYes.includes(r))],
    ["Not in This Job", rows.filter((r) => M.gates.notInThisJob.includes(r))],
    ["Waiting on an Answer", rows.filter((r) => M.gates.waiting.includes(r))],
  ].filter(([, list]) => list.length > 0);
  if (groups.length === 0) return "";
  return `
        <div class="dv-block">
          <p class="dv-h">What Decided It</p>${groups
            .map(
              ([h, list]) => `
          <p class="dec-h">${h}</p>
          <ul class="dec">${list.map((g) => `<li><span>${esc(g.label)}</span><span class="answer">${g.decidedBy.map((x) => `${esc(x.question)} <strong>${esc(x.answer)}</strong>`).join(" · ")}</span></li>`).join("")}</ul>`,
            )
            .join("")}
        </div>`;
}

const RULE = `A division is high only when every line in it is high, and low when any line is low.`;
const JOBS_RULE = `Today the mark comes from Kulka's own figures: a line is medium with at least 2 Kulka jobs behind it inside a 20% spread, and high with at least 5 inside 10% (${"flag.medium_min_comparables"}, ${"flag.high_min_comparables"}). Kulka has 2 completed jobs imported, so no line priced from jobs can be high yet.`;

function confidencePanel(d, raiseHtml) {
  return `
        <div class="dv-block cf-panel">
          <p class="dv-h">Confidence</p>
          <div class="cf-big">${mark(d.mark, `${WORD[d.mark]} Confidence`)}</div>
          <p class="cf-why">${RULE}</p>
          <ul class="cf-lines">${d.lines.map((l) => `<li><span>${esc(l.label)}</span><span>${WORD[l.confidence]} · ${esc(l.source.text)}</span></li>`).join("")}</ul>
          <p class="dec-h">What Would Raise It</p>${raiseHtml}
        </div>`;
}

// --- Frame 01: the ledger by division, closed ---------------------------------------------------------

const f1 = page(
  "01 The Ledger by Division",
  "Frame 01. The drill-down closed. The ledger's 36 rows grouped into the 21 divisions they already carry, each with its figure, $/SF, share and a confidence mark taken from its lines. The lens holds the first division; the section has drawn its layer.",
  "where-the-money-is",
  trio("element:demolition", ledger("02")),
);

// --- Frame 02: a division opened to its items ---------------------------------------------------------------

const d02 = div("02");
const noOwnerItem02 = gap(
  "Not in the Model Yet",
  `<p>The model ties no item from you to this division: no criterion prices Demolition and every answer behind it is stated. ${esc(JOBS_RULE)}</p>
          <p>The build needs ${code("confidence.raisedBy[]")} on each line: the item, who supplies it, and the mark it would move to.</p>`,
);
const open02 = (sdBody) => `
      <div class="dv-open" id="division-02-lines">${bar(d02)}
        <div class="dv-block">
          <p class="dv-h">Items</p>${d02.lines.map((l) => subItem(l, l.costCode === "1a" ? sdBody : "")).join("")}
        </div>${unpricedGroup(d02)}${confidencePanel(d02, noOwnerItem02)}${decided([gateRow("gate:demolition")])}
      </div>`;

const f2 = page(
  "02 A Division, Opened",
  "Frame 02. 02 Existing Conditions opened to its items: Structure Demolition and Site Demolition priced, and the four utility disconnects Structure Demolition brings in, with no rate yet. The bar holds the room for LA-1480's flag or comment control and LA-1481's Value Engineering control, empty. Below: the confidence mark and why, and What Decided It, moved here from What Is In.",
  "where-the-money-is",
  trio("element:demolition", ledger("02", open02(""))),
);

// --- Frame 03: an item opened to its assumptions, included and excluded ------------------------------------------

const raw1a = RAW.rom.lines.find((l) => l.costCode === "1a");
const rate1a = raw1a.comparables[0];
const sd = d02.lines.find((l) => l.costCode === "1a");
const asRow = (label, value, basisHtml, why = "") => `
                <li><span class="as-l">${esc(label)}</span><span class="as-v">${value}</span><span class="as-b">${basisHtml}</span>${why ? `<span class="as-why">${why}</span>` : ""}${slot()}</li>`;
const stated = (key) => {
  const f = fact(key);
  return asRow(f.label, esc(f.value), `${src("quiet", "Stated")}<span>${esc(f.basisWords)}</span>`);
};
const sdBody = `
            <div class="si-body">
              <section class="si-sec">
                <h3 class="si-h">Assumptions</h3>
                <p class="si-sub">What this figure takes as given. Each one shows even if it is wrong, so you can correct it here and Kulka reprices from the corrected fact.</p>
                <ul class="as">${stated("demolitionStructureCount")}${stated("demolitionStructureSquareFeet")}${stated("demolitionStructureType")}${asRow(
                  "Rate",
                  `Rate on File <span class="gap-inline">Unit and Quantity Not in the Model</span>`,
                  `${src("low", "Kulka Rate")}<span>Stated by Kulka, September 26, 2026</span>`,
                )}
                </ul>
                ${gap(
                  "Not in the Model Yet",
                  `<p>The snapshot does not tie an answer to the line it prices. These three are tied by hand from Kulka's definition of item 1a, which says the structure count "also opens the two questions this item prices on". The rate's figure is in the snapshot (${rate1a.rate.toFixed(2)}), but not its unit or the quantity it multiplies, so the page can only say Rate on File.</p>
                  <p>The build needs ${code("line.inputs[]")} (the fact keys a line prices on), ${code("line.quantity")} and ${code("comparable.unit")}.</p>`,
                )}
              </section>
              <section class="si-sec">
                <h3 class="si-h">Included and Excluded</h3>
                ${gap(
                  "Not in the Model Yet",
                  `<p>No line in the snapshot carries its scope. Kulka's own definition of item 1a states it, in docs/precon/canonical-work-items.md, and the build needs it carried as ${code("canonical_work_items.includes")} and ${code("excludes")}, frozen into each line as ${code("line.includes[]")} and ${code("line.excludes[]")}. Shown here as that definition reads, not from the model:</p>
                  <div class="io">
                    <div><p class="io-h io-h--in"><i></i>Included</p><ul><li>Mechanical Demolition of the Structure</li><li>Slab-on-Grade and Footings</li><li>Loading and Trucking</li><li>C&amp;D Disposal</li></ul></div>
                    <div><p class="io-h io-h--out"><i></i>Excluded</p><ul><li>Hazardous Material Survey and Abatement</li><li>Utility Disconnects<small>Their own items, below</small></li><li>Site Demolition<small>Its own item, below</small></li><li>Backfill</li><li>Permits and the Demolition Bond</li></ul></div>
                  </div>`,
                )}
              </section>
              <section class="si-sec">
                <h3 class="si-h">Where the Figure Came From</h3>
                ${cmps(sd)}
                <p class="ln-basis">${esc(sd.basis)}</p>
              </section>
            </div>`;

const f3 = page(
  "03 An Item, Opened",
  "Frame 03. Structure Demolition opened to its assumptions (the three answers it prices on, each Stated, and Kulka's rate), what it includes and excludes, and where the figure came from. Every assumption has room for LA-1480's control. The model holds the answers and the rate's figure; the link between them, the unit, the quantity and the scope are gaps, named in place.",
  "where-the-money-is",
  trio("element:demolition", ledger("02", open02(sdBody))),
);

// --- Frame 04: confidence, and what would raise it -----------------------------------------------------------------

const d14 = div("14");
const raiseCrit = (k) => `
            <li><span class="crit-tag num">${esc(k.code)}</span><span class="raise-t">${esc(k.label)} <span class="raise-v">${esc(k.value)}</span></span><span class="raise-b">${k.settled ? src("high", "Settled") : src("working", "Planning Assumption")}</span><span class="raise-why">${esc(k.confidenceReason)}</span>${slot()}</li>`;
const soil = fact("site_conditions");
const raise14 = `
          <ul class="raise">${["V-1", "V-2", "V-3"].map((c) => raiseCrit(crit(c))).join("")}
            <li><span class="q-tag">Open</span><span class="raise-t">${esc(soil.basisWords)} <span class="raise-v">${esc(soil.value)}</span></span><span class="raise-b">${src("working", "Waiting on You")}</span><span class="raise-why">V-2 reads this answer to choose the jack, and it is the one question still open on this budget.</span>${slot()}</li>
          </ul>
          ${gap(
            "Not in the Model Yet",
            `<p>These are the open items the model ties to this division, through each criterion's cost codes and inputs. It does not record that settling one raises the mark, or to what. ${esc(JOBS_RULE)}</p>
            <p>The build needs ${code("confidence.raisedBy[]")} on each line, or a stated rule for how a settled criterion moves a mark.</p>`,
          )}`;
const f4lines = `
      <div class="dv-open" id="division-14-lines">${bar(d14)}
        <div class="dv-block">
          <p class="dv-h">Items</p>${d14.lines.map((l) => subItem(l)).join("")}
        </div>${unpricedGroup(d14)}${confidencePanel(d14, raise14)}${decided([gateRow("gate:elevator")])}
      </div>`;
const f4 = page(
  "04 Confidence, and What Would Raise It",
  "Frame 04. 14 Conveying Equipment opened: Low Confidence because Elevators is low, the two lines' own marks, and What Would Raise It: the three elevator criteria still planning assumptions and the open groundwater question, each with room for LA-1480's control. Whether settling them moves the mark is a gap the model cannot answer yet.",
  "where-the-money-is",
  trio("element:elevator", ledger("14", f4lines, { from: "14" })),
);

// --- Frame 05: a division the model cannot open far --------------------------------------------------------------------

const d22 = div("22");
const pl = d22.lines[0];
const units = fact("unitCount");
const plBody = `
            <div class="si-body">
              <section class="si-sec">
                <h3 class="si-h">Assumptions</h3>
                <ul class="as">${asRow(units.label, esc(units.value), `${src("quiet", "Stated")}<span>${esc(units.basisWords)}</span>`, "Plumbing is priced per unit: $25,886 across 70 units.")}
                </ul>
                ${gap("Not in the Model Yet", `<p>No criterion prices Plumbing, and the snapshot does not say which answers the line prices on beyond its per-unit basis. The build needs ${code("line.inputs[]")}.</p>`)}
              </section>
              <section class="si-sec">
                <h3 class="si-h">Included and Excluded</h3>
                ${gap(
                  "Not in the Model Yet",
                  `<p>Kulka's definition of item 28 (Plumbing Rough-In and Piping) records its sources and quantity driver but no included or excluded list, so there is nothing to show yet. The build needs ${code("line.includes[]")} and ${code("line.excludes[]")}, written by Kulka per item.</p>`,
                )}
              </section>
              <section class="si-sec">
                <h3 class="si-h">Where the Figure Came From</h3>
                ${cmps(pl)}
                <p class="ln-basis">${esc(pl.basis)}</p>
              </section>
            </div>`;
const f5lines = `
      <div class="dv-open" id="division-22-lines">${bar(d22)}
        <div class="dv-block">
          <p class="dv-h">Items</p>${subItem(pl, plBody)}
          ${gap(
            "Not in the Model Yet",
            `<p>The model prices Plumbing as one line, so the division has one item. Sub-items need either breakouts (${code("block_classification.breakout_of_cost_code = '28'")}, each with a figure carved from the line) or separate canonical items priced on their own. Item 29, Plumbing Fixtures, is defined but not in this run.</p>`,
          )}
        </div>${confidencePanel(
          d22,
          gap("Not in the Model Yet", `<p>The model ties no item from you to Plumbing. ${esc(JOBS_RULE)}</p><p>The build needs ${code("confidence.raisedBy[]")}.</p>`),
        )}
      </div>`;
const f5 = page(
  "05 A Division With Gaps",
  "Frame 05. 22 Plumbing opened, the honest case for most divisions: one line priced from 2 Kulka jobs per unit, no sub-items, no written scope, no item from the owner that would raise the mark. Each gap names the field the build needs.",
  "where-the-money-is",
  trio("line:28", ledger("22", f5lines, { from: "22" })),
);

// --- Frame 06: where What You Told Us and What Is In go -----------------------------------------------------------------

// Each answer and each gate row, sent to the division whose lines it prices (branch_gate_items, the criteria's cost codes).
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
const projectFacts = M.project.facts.filter((f) => !FACT_HOME[f.key]);
const movedFacts = M.project.facts.filter((f) => FACT_HOME[f.key]);
const homes = [...new Set([...movedFacts.map((f) => FACT_HOME[f.key]), ...Object.values(GATE_HOME)])].sort();
const staying = [...M.gates.notInThisJob, ...M.gates.answeredYes, ...M.gates.waiting].filter((g) => !GATE_HOME[g.el]);

const factRow = (f) => `
      <div class="fact lg-row" data-el="${esc(f.el)}">
        <dt class="fact-l">${esc(f.label)}</dt>
        <dd class="fact-d"><span class="fact-v">${esc(f.value)}</span>${src("quiet", "Stated")}<span class="fact-basis">${esc(f.basisWords)}</span></dd>
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

const f6 = page(
  "06 Where the Sections Go",
  "Frame 06. What You Told Us keeps the 11 answers about the whole project and points to the 16 that moved under their divisions. What Is In, and What Is Not becomes Notes and Clarifications: every gate row moved under its division, Tie-in to an Existing Building (no division) is read back as a fact, and the numbered notes and the pricing parameters stay as shipped. The ledger, Design and Engineering and From Trades to Total sit between the two, as frames 01 to 05 and PR 134 show them.",
  "the-project",
  `
<section class="sheet" id="the-project" data-el="section:the-project">
  <div class="sheet-hd">
    <h1 class="sheet-h">What You Told Us</h1>
    <p class="sheet-sub">${esc(M.project.line)}</p>
  </div>
  <p class="fig-md num" data-el="fact:grossSquareFeet:figure">${GSF.toLocaleString("en-US")} SF</p>
  <p class="lede">What you told Kulka about the whole project, read back. Answers that price one trade now sit under that trade in The Ledger, beside the items they price, where you can correct them.</p>
  <dl class="facts lg">${projectFacts.map(factRow).join("")}
  </dl>
  <div class="moved">
    <h2 class="gates-h">Your Other Answers, by Division</h2>
    <p class="sub">${movedFacts.length} answers moved under the ${homes.length} divisions they price, each beside what it brought in or left out.</p>
    <ul class="plain">${homes.map(homeRow).join("")}</ul>
  </div>
</section>
<p class="elide">The Ledger, Design and Engineering and From Trades to Total follow here: frames 01 to 05, and the waterfall as PR 134 shipped it.</p>
<section class="sheet gates" id="notes" data-el="section:what-is-in">
  <div class="sheet-hd">
    <h1 class="sheet-h">Notes and Clarifications</h1>
  </div>
  <p class="lede">What is in the number and what is not now sits with each division in The Ledger. ${esc(staying.map((x) => x.label).join(", "))}, the one decision that touches no trade, is read back in What You Told Us.</p>
  <ol class="notes">${M.notes.map((n) => `
    <li class="note" data-el="${esc(n.el)}" value="${n.number}"><span class="note-n num">${n.number}</span><span class="note-text">${esc(n.text)}</span></li>`).join("")}
  </ol>
  <div class="parameters">
    <h2 class="gates-h">Pricing Parameters This Budget Ran With</h2>
    <table class="params">
      <thead><tr><th scope="col">Parameter</th><th scope="col" class="right">Value</th><th scope="col">Set By</th><th scope="col">Date</th></tr></thead>
      <tbody>${M.parameters.map((p) => `
        <tr data-el="${esc(p.el)}"><td>${esc(p.label)}</td><td class="right num">${esc(p.value)}</td><td>${esc(p.recordedBy)}</td><td>${esc(p.recordedAt)}</td></tr>`).join("")}
      </tbody>
    </table>
    <p class="sub">${esc(M.markupWords)}</p>
  </div>
</section>`,
);

const FRAMES = { "01-ledger-closed": f1, "02-division-open": f2, "03-item-open": f3, "04-confidence": f4, "05-division-gaps": f5, "06-where-sections-go": f6 };
// Where tools/shoot.mjs scrolls for each frame's one-screen view: the place a reader would be looking.
const FOCUS = {
  "02-division-open": '<div class="dv-open" id="division-02-lines"',
  "03-item-open": '<div class="si" data-el="line:1a" data-open="true"',
  "04-confidence": '<div class="dv-block cf-panel"',
  "05-division-gaps": '<div class="dv-open" id="division-22-lines"',
  "06-where-sections-go": '<div class="moved"',
};
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
  gates: Object.entries(GATE_HOME).filter(([, c]) => c === d.code).map(([el]) => gateRow(el)?.label),
}));
fs.writeFileSync(`${root}/data/audit.json`, JSON.stringify(audit, null, 1));
console.log("wrote data/audit.json");
