import { titleCase } from "@/lib/format/title-case";
import { usd, wholeNumber } from "@/lib/format/usd";
import {
  longDate,
  type BudgetPage,
  type Criterion,
  type Fact,
  type LetterRun,
  type Tone,
  type WaterfallRow,
} from "@/lib/rom/presentation";
import { layerJson, type CommentLayer } from "@/lib/rom/comment-layer";
import { NO_DIVISION, type BasisRow, type DecisionRow, type DivisionItem, type DivisionRow, type PricedAs, type ScopeText } from "@/lib/rom/drill-down";
import { drawSection, sectionStyle } from "@/lib/rom/section";

// LA-1459. The client budget page, "The Ledger, Opened with the Section",
// rendered from the presentation model on the approved frames
// (~/scrollcraft/frames/kulka-ledger-opened, tag approved-2026-10-02;
// brief-v3.md and brief-v3-section.md on LA-1309). The internal saved-budget
// screen grown into a presentation: the black band at full viewport with the
// wordmark alone on it (LA-1467), the wordmark rising into the two-tier
// header, a letter from the estimator, the ledger in MasterFormat order
// with the section drawn beside it row by row, the criteria called
// out, the second black band as the waterfall, What Is In, the ask.
//
// Every figure, label and id comes from the model; nothing here prices,
// words or orders anything. The markup is driven by public/scrollcraft/
// budget-page.js over the vendored engine (scrollcraft.js, untouched), and
// styled by public/scrollcraft/budget-page.css, whose tokens are the
// internal screen's own. The page has one depth, the fullest: the client
// reads everything, with no Summary, Detail or Full switch (LA-1462).
//
// Version 1's element ids are kept, with one departure: the Summary fold
// (`scopes:rest`) is gone, because the ledger shows every row so the section
// can be drawn row by row.

export const esc = (t: string | number): string =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One `data-el`, or a pointer at the element that holds it. */
const elAttr = (el: string | null, ref: string | null = null): string =>
  el ? ` data-el="${esc(el)}"` : ref ? ` data-el-ref="${esc(ref)}"` : "";

/** A source, dot plus ink: the internal ledger's own cell. */
const src = (tone: Tone | "working" | "quiet", text: string, cls = "") =>
  `<span class="src${cls}"><i class="dot dot--${tone}" aria-hidden="true"></i>${esc(text)}</span>`;
const time = (iso: string) => `<time datetime="${esc(iso)}">${longDate(iso)}</time>`;

// --- The drawings ---------------------------------------------------------------------

function drawings(page: BudgetPage) {
  const d = page.drawing;
  const ink = new Map(Object.entries(d.ink));
  // The drawings' style rules live in the head, so no <style> sits in the body.
  // The one section beside the ledger and Design and Engineering owns
  // the criteria's ids on its callouts; the peak keeps its reversed copy and
  // the ink twin it lands on.
  const base = { facts: d.facts, ink, styleInSvg: false as const };
  return {
    section: drawSection({ ...base, criteria: d.criteria, notes: { ink: d.inkNote, noLayer: d.noLayer }, idPrefix: "ds", calloutEl: "criterion:" }),
    peak: drawSection({ ...base, criteria: d.criteria, theme: "band", variant: "plain", idPrefix: "dk" }),
    peakLight: drawSection({ ...base, criteria: d.criteria, variant: "plain", idPrefix: "dq" }),
    style: `<style>${sectionStyle("ds")}${sectionStyle("dk", "band")}${sectionStyle("dq")}</style>`,
  };
}

// --- Chrome: the two-tier header ------------------------------------------------------

/** The one Comment control (LA-1489). Only a reader's page has it; comments.js fills the badge. */
const commentControl = `
    <button class="hd-cmt" type="button" aria-pressed="false" data-cm-toggle hidden><i aria-hidden="true"></i><span data-cm-label>Comment</span></button>`;

/**
 * The opening's numbers, each travelling into its own header slot (LA-1575).
 * Listed in the opening's order; the header reads them in `SLOT_ORDER`.
 */
type Headline = { key: "fig" | "psf" | "dur"; label: string; html: string; ref: string | null };
const SLOT_ORDER: Headline["key"][] = ["fig", "dur", "psf"];

function headlineNumbers(page: BudgetPage): Headline[] {
  const { kulkaContract, perSquareFoot, duration } = page.headline;
  const numbers: (Headline | null)[] = [
    { key: "fig", label: "Total Budget", html: usd(kulkaContract.likely), ref: "total:kulka-contract" },
    perSquareFoot ? { key: "psf", label: "Per Square Foot", html: usd(perSquareFoot.value), ref: "record:per-sf" } : null,
    duration
      ? { key: "dur", label: "Duration", html: `${duration.months}<small>${duration.months === 1 ? "Month" : "Months"}${duration.estimated ? " +/-" : ""}</small>`, ref: null }
      : null,
  ];
  return numbers.filter((n): n is Headline => n !== null);
}

function header(page: BudgetPage, comments: boolean): string {
  const slots = headlineNumbers(page)
    .sort((a, b) => SLOT_ORDER.indexOf(a.key) - SLOT_ORDER.indexOf(b.key))
    .map((n) => `<span class="hd-fig"${elAttr(null, n.ref)}><span class="hd-fig-l">${n.label}</span><span class="hd-fig-v num" data-hd-slot="${n.key}">${n.html}</span></span>`)
    .join("");
  return `
<header class="hd" id="bar" data-state="band">
  <div class="hd-t1">
    <a class="hd-mark" href="#your-number">Kulka</a>
    <span class="hd-proj" data-hd-slot="proj">${esc(page.projectName)}</span>
    <span class="hd-figs">${slots}</span>${comments ? commentControl : ""}
  </div>
  <nav class="hd-t2" aria-label="Sections">
    <ul class="hd-ix">${page.sections
      .filter((s) => s.id !== "design-and-engineering" || page.criteria.length > 0)
      .map((s) => `<li><a href="#${s.id}" data-index="${s.id}">${esc(s.indexLabel)}</a></li>`)
      .join("")}</ul>
    <span class="hd-here" data-here>${esc(page.sections[0].indexLabel)}</span>
  </nav>
</header>`;
}

// --- 1. The opening (LA-1558): Kulka, the project, the numbers ------------------------------
//
// One stage pinned for several screens (~/scrollcraft/frames/kulka-first-screen,
// r2/opening.html). The wordmark shrinks into the header's mark as the project
// rises in; the project's name travels into the header as the numbers rise in;
// each number travels into its own header slot as the Schedule of Values
// slides up over the black. budget-page.js drives it; at rest and in print
// every layer reads in order.

function sectionNumber(page: BudgetPage): string {
  const { headline: h, record: r, drawing } = page;
  const stories = drawing.facts.stories;
  const facts = [
    h.unitCount !== null ? `${wholeNumber(h.unitCount)} Units` : null,
    h.grossSquareFeet !== null ? `${wholeNumber(h.grossSquareFeet)} GSF` : null,
    `${stories} ${stories === 1 ? "Story" : "Stories"}`,
  ].filter((f): f is string => f !== null);
  const numbers = headlineNumbers(page).map(
    (n) => `<div><p class="op-n-l">${n.label}</p><p class="op-n-v num" data-op-move="${n.key}"${elAttr(null, n.ref)}>${n.html}</p></div>`,
  );
  return `
<section class="band band--first" id="your-number" data-el="section:your-number" data-sc-act="flow">
  <div class="op-stage" data-op-stage>
    <div class="op-layer op-layer--project" data-op-layer="project">
      <p class="op-lbl">${esc(r.stageLabel)}</p>
      <p class="op-proj" data-op-move="proj">${esc(page.projectName)}</p>
      <p class="op-facts num">${facts.map((f) => `<span>${esc(f)}</span>`).join('<i aria-hidden="true">·</i>')}</p>
    </div>
    <div class="op-layer op-layer--numbers" data-op-layer="numbers">
      <div class="op-three" data-op-three data-count="${numbers.length}">
        ${numbers.join("\n        ")}
      </div>
    </div>
    <div class="op-travel" data-op-travel><p class="op-mark">Kulka</p></div>
  </div>
</section>`;
}

// --- 2. The Letter (LA-1467) --------------------------------------------------------------------

function letterRun(run: LetterRun): string {
  return run.figure ? `<span class="num"${elAttr(run.el ?? null, run.elRef ?? null)}${run.title ? ` title="${esc(run.title)}"` : ""}>${esc(run.text)}</span>` : esc(run.text);
}

function sectionLetter(page: BudgetPage): string {
  const { letter, record: r, headline: h } = page;
  const inside = page.sections.filter((s) => s.id !== "letter" && (s.id !== "design-and-engineering" || page.criteria.length > 0));
  // The margin's record points at the elements that own each id, at the close.
  return `
<section class="sheet sheet--letter" id="letter" data-el="section:letter" data-sc-act="flow">
  <div class="letter">
    <aside class="letter-side">
      <dl class="ref" aria-label="The record">
        <div><dt>Project</dt><dd data-el-ref="record:project">${esc(page.projectName)}</dd></div>
        <div><dt>Prepared For</dt><dd data-el-ref="record:prepared-for">${r.preparedFor ? esc(r.preparedFor) : '<span class="missing">Not Named</span>'}</dd></div>
        <div><dt>Stage</dt><dd>${esc(r.stageLabel)}</dd></div>
        <div><dt>Version</dt><dd data-el-ref="record:version">${r.version}</dd></div>
        <div><dt>Issued</dt><dd data-el-ref="record:issued">${time(r.issuedAt)}</dd></div>${
          h.grossSquareFeet !== null ? `\n        <div><dt>Gross Area</dt><dd data-el-ref="record:gross-area">${wholeNumber(h.grossSquareFeet)} SF</dd></div>` : ""
        }
        <div><dt>Prepared By</dt><dd data-el-ref="record:prepared-by">${esc(r.preparedBy)}</dd></div>
      </dl>
      <nav class="inside" aria-label="Inside">
        <p class="inside-h">Inside</p>
        <ol>${inside.map((s, i) => `\n          <li><span class="num">${i + 1}</span><a href="#${s.id}">${esc(s.title)}</a></li>`).join("")}
        </ol>
      </nav>
    </aside>
    <div class="letter-main">
      <p class="letter-date">${esc(letter.date)}</p>${letter.greeting ? `\n      <p class="letter-to">${esc(letter.greeting)}</p>` : ""}
      <h1 class="letter-h">${esc(letter.title).replace(", ", ',<br class="only-phone"> ')}</h1>${letter.paragraphs
        .map((runs) => `\n      <p>${runs.map(letterRun).join("")}</p>`)
        .join("")}
      <div class="sign">
        <p class="sign-name">${esc(letter.signature.name)}</p>
        <p class="sign-role">${esc(letter.signature.role)}</p>
      </div>
    </div>
  </div>
</section>`;
}

// --- 2. Project Basis (LA-1504; was What You Told Us) -------------------------------------------

function factRow(f: Fact): string {
  return `
      <div class="fact lg-row" data-el="${esc(f.el)}">
        <dt class="fact-l">${esc(f.label)}</dt>
        <dd class="fact-d">
          <span class="fact-v">${esc(f.value)}</span>
          ${f.basis === "assumed" ? src("working", `Assumed, ${f.assumedBy}`) : src("quiet", "Stated")}
          <span class="fact-basis">${esc(f.basisWords)}</span>
        </dd>
      </div>`;
}

function sectionProject(page: BudgetPage): string {
  const { project, projectBasis, headline, record } = page;
  const facts = projectBasis.facts as Fact[];
  const n = facts.filter((f) => f.basis === "assumed").length;
  const moved = projectBasis.moved;
  // A scope decision no division holds shows here, unless its answer already reads in the table above.
  const shown = new Set(facts.map((f) => f.label));
  const unplaced = projectBasis.unplaced.filter((row) => row.el && !row.answers.every((a) => shown.has(a.label)));
  return `
<section class="sheet" id="the-project" data-el="section:the-project" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">Project Basis</h1>${project.line ? `\n    <p class="sheet-sub">${esc(project.line)}</p>` : ""}
  </div>${record.coverSentence ? `\n  <p class="lede cover" data-el="record:cover">${esc(record.coverSentence)}</p>` : ""}${
    headline.grossSquareFeet !== null ? `\n  <p class="fig-md num" data-el="fact:grossSquareFeet:figure">${wholeNumber(headline.grossSquareFeet)} SF</p>` : ""
  }
  <p class="lede">${
    moved.length > 0
      ? "Your answers about the whole project. Answers about one trade sit with that line in the Schedule of Values."
      : "What you told Kulka, read back."
  }${n > 0 ? ` ${n} ${n === 1 ? "answer below was" : "answers below were"} set by Kulka's design criteria rather than stated, and each is marked.` : ""}</p>
  <dl class="facts lg">${facts.map(factRow).join("")}
  </dl>${
    moved.length > 0
      ? `
  <div class="moved">
    <h2 class="gates-h">Your Other Answers, by Division</h2>
    <ul class="plain">${moved
      .map(
        (m) =>
          `<li><a href="#division-${esc(m.division)}">${m.division === NO_DIVISION ? "" : `${esc(m.division)} `}${esc(m.title)}</a><span class="answer">${[
            ...m.answers.map(esc),
            ...m.removed.map((r) => `<strong>${esc(r)}, Not in This Job</strong>`),
          ].join(" · ")}</span></li>`,
      )
      .join("")}</ul>
  </div>`
      : ""
  }${
    unplaced.length > 0
      ? `
  <div class="moved">
    <h2 class="gates-h">Scope Decisions for the Whole Project</h2>
    <ul class="dec">${unplaced.map(decisionRow).join("")}</ul>
  </div>`
      : ""
  }
</section>`;
}

function decisionRow(row: DecisionRow): string {
  return `<li${elAttr(row.el || null)}><span class="dec-l">${esc(row.label)}</span><span class="dec-a">${row.answers
    .map((a) => `${esc(a.label)}: <strong>${esc(a.answer)}</strong>`)
    .join(" · ")}</span></li>`;
}

// --- 3. The Schedule of Values, with the Section beside it (LA-1558) -----------------------------
//
// Drop-down B, Lift the Layer (~/scrollcraft/frames/kulka-first-screen,
// r2/sov-b-lift.html). Every line, its numbered items and each item's card are
// written here, closed; budget-page.js only opens them and places the pins.

const CONFIDENCE_WORD: Record<string, string> = { high: "High", medium: "Medium", low: "Low", none: "None" };

/** A confidence mark, dot plus ink (LA-1479: a full dot, a half dot, a ring). */
const mark = (tone: string, text = `${CONFIDENCE_WORD[tone] ?? tone} Confidence`, el: string | null = null) =>
  `<span class="dv-cf"${elAttr(el)}><i class="dot dot--${esc(tone)}" aria-hidden="true"></i>${esc(text)}</span>`;
/** A range to the nearest $1,000, the way the card prints it. */
const thousands = (n: number) => usd(Math.round(n / 1000) * 1000);
const range = (f: { low: number; high: number }) => (f.high > f.low ? `Range ${thousands(f.low)} to ${thousands(f.high)}` : "No Range");
const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
const pct = (s: string | null) => (s === "0%" ? "<1%" : (s ?? ""));
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const waitDot = `<i class="qdot" title="Waiting on Your Answer"></i>`;

/** The drawing's layers a line lights, and the one each item's pin sits on. */
type Anchors = { layers: string[]; of: (item: DivisionItem) => string | null };
function anchorsOf(d: DivisionRow, drawn: ReadonlySet<string>): Anchors {
  const layers = [...new Set([...d.layers, ...d.items.map((i) => i.el)])].filter((l) => drawn.has(l));
  // An item's own piece, or, when its line is drawn as one piece (the elevator), that piece.
  return { layers, of: (item) => (drawn.has(item.el) ? item.el : layers.length === 1 ? layers[0] : null) };
}

/** An open question: what is unknown, and what moves on the answer. One row per scope decision. */
function waitBlock(rows: DecisionRow[], own: boolean): string {
  const head = (r: DecisionRow) => {
    const open = r.answers.filter((a) => a.answer === "Don't Know" || a.answer === "").map((a) => a.label);
    return open.length > 0 ? `${esc(open.join(" and "))}? <small>You answered Don't Know.</small>` : esc(r.label);
  };
  return `
            <div class="card-wait"><b>Waiting on Your Answer</b>${rows
              .map((r) => `<p${own ? elAttr(r.el || null) : elAttr(null, r.el || null)}><strong>${head(r)}</strong><span class="t">It moves ${esc(r.label)} into or out of this line.</span></p>`)
              .join("")}<button type="button" class="more" data-more>More</button></div>`;
}

function chipOf(b: BasisRow): string {
  const assumed = b.chip.tone === "working";
  return `<span class="chip${assumed ? " chip--assume" : ""}" data-el="${esc(b.el)}"${b.tag ? ` data-tag="${esc(b.tag)}"` : ""}${
    assumed ? ` title="${esc(b.chip.text)}, which holds until your design team decides it"` : ""
  }><i></i>${b.tag ? `<b>${esc(b.tag)}</b>` : ""}${esc(b.label)}: ${esc(b.value)}</span>`;
}

function itemCard(d: DivisionRow, item: DivisionItem, i: number, drawn: boolean): string {
  const [lead, same] = item.pricedAs;
  const shown = new Set([lead?.el, same?.el].filter((el): el is string => !!el));
  const chips = item.basis.filter((b) => !shown.has(b.el));
  const statement = (p: PricedAs) => `<span${elAttr(p.el)}><b>${esc(p.quantity)}</b> at <b>${esc(p.rate)}</b></span>`;
  const scope = (title: string, list: ScopeText[]) =>
    list.length === 0 ? "" : `<p><b>${title}</b>${list.map((x) => `<span data-el="${esc(x.el)}">${esc(x.text)}</span>`).join('<i aria-hidden="true">·</i>')}</p>`;
  const io = scope("Includes", item.includes) + scope("Excludes", item.excludes);
  const n = d.items.length;
  return `
            <div class="card card--item" data-card="${i}" hidden>
              <div class="card-t"><span class="no${drawn ? "" : " no--nd"}">${i + 1}</span><p class="card-n">${esc(item.label)}<small>${share(item.likely, d.likely)}% of <span class="only-desk">${esc(`${d.division} ${d.title}`)}</span><span class="only-phone">Line ${esc(d.division)}</span>${drawn ? "" : " · Not Drawn"}</small></p><p class="card-v num">${usd(item.likely)}</p></div>${
                lead ? `\n              <p class="card-eq num">${statement(lead)}${same ? `, the same as ${statement(same)}` : ""}</p>` : ""
              }
              <div class="card-r">${mark(item.confidence)}<span class="card-src">${esc(item.sourceText)}</span><span class="card-rng num">${range(item)}</span></div>${
                chips.length > 0 ? `\n              <div class="card-r">${chips.map(chipOf).join("")}</div>` : ""
              }${chips.some((b) => b.chip.tone === "working") ? `\n              <p class="legend"><i></i>Orange marks a Planning Assumption.</p>` : ""}${
                io ? `\n              <div class="card-io">${io}</div>` : ""
              }${d.decisions.waiting.length > 0 ? waitBlock(d.decisions.waiting, false) : ""}${
                n > 1
                  ? `\n              <div class="card-f"><span>${i + 1} of ${n} in ${esc(d.title)}</span><span class="step"><button type="button" data-step="-1" aria-label="Previous Item"></button><button type="button" data-step="1" aria-label="Next Item"></button></span></div>`
                  : ""
              }
            </div>`;
}

function lineCard(d: DivisionRow, anchors: Anchors): string {
  const drawnN = d.items.filter((x) => anchors.of(x)).length;
  const facts = [
    `${count(d.items.length, "Item")}${drawnN < d.items.length ? `, ${drawnN} Drawn` : ""}`,
    d.supporting.length ? `${d.supporting.length} In Scope, No Rate Yet` : "",
    d.decisions.notInThisJob.length ? `${d.decisions.notInThisJob.length} Not in This Job` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const sub = [d.ownerDirect ? "Bought by the Owner" : d.shareOfContract ? `${pct(d.shareOfContract)} of the Total Budget` : null, d.perSquareFoot ? `${d.perSquareFoot} per GSF` : null]
    .filter(Boolean)
    .join(" · ");
  return `
            <div class="card card--line" data-card="line" hidden>
              <div class="card-t"><span class="no no--line">${esc(d.division === NO_DIVISION ? "" : d.division)}</span><p class="card-n">${esc(d.title)}<small>${esc(sub)}</small></p><p class="card-v num">${usd(d.likely)}</p></div>
              <div class="card-r">${mark(d.confidence, undefined, `confidence:${d.division}`)}<span class="card-rng num">${range(d)}</span></div>${
                d.items.length > 1
                  ? `\n              <div class="mix">${d.items
                      .map((x, j) => `<span data-mix="${j}" style="flex:${Math.max(x.likely, d.likely * 0.04)}" title="${esc(x.label)}"><small><b>${j + 1}</b> ${share(x.likely, d.likely)}%</small><i></i></span>`)
                      .join("")}</div>`
                  : ""
              }${
                d.raise.length > 0
                  ? `\n              <div class="card-raise"><p class="card-h">What Would Raise It</p>${d.raise
                      .map((r) => `<p data-el="${esc(r.el)}"><b>${esc(r.tag)}</b>${esc(r.label)}: ${esc(r.value)}</p>`)
                      .join("")}</div>`
                  : ""
              }${d.decisions.waiting.length > 0 ? waitBlock(d.decisions.waiting, true) : ""}
              <div class="card-f"><span>${esc(facts)}</span><span class="hint">Choose an item, or press →</span></div>
            </div>`;
}

function sovLine(d: DivisionRow, drawn: ReadonlySet<string>): string {
  const anchors = anchorsOf(d, drawn);
  const priced = d.items.length > 0;
  const waiting = d.decisions.waiting.length > 0;
  const id = `division-${d.division}`;
  const items = d.items
    .map((item, i) => {
      const on = anchors.of(item) !== null;
      return `
            <button class="pin-row" type="button" data-i="${i}" data-el="${esc(item.el)}" data-anchor="${esc(anchors.of(item) ?? "")}"><span class="no${on ? "" : " no--nd"}">${i + 1}</span><span class="name">${esc(item.label)}${
              on ? "" : `<span class="nd">Not Drawn</span>`
            }</span><span class="amt num">${waiting && d.items.length === 1 ? waitDot : ""}${usd(item.likely)}</span><span></span></button>${itemCard(d, item, i, on)}`;
    })
    .join("");
  const n = d.supporting.length;
  const noRate =
    n > 0
      ? `
            <details class="extra" open data-fold-phone><summary><b><span class="only-desk">In Scope, No Rate Yet, Outside the Total</span><span class="only-phone">${n} More in Scope, No Rate Yet</span></b></summary><p class="nr-note only-phone">Outside the total until each has a rate.</p><ul class="nr">${d.supporting
              .map((u) => `<li data-el="${esc(u.el)}">${esc(u.label)}</li>`)
              .join("")}</ul></details>`
      : "";
  const decided = (title: string, rows: DecisionRow[]) =>
    rows.length === 0
      ? ""
      : `
            <p class="extra"><b>${title}</b>${rows.map((r) => `<span${elAttr(r.el || null)}>${esc(r.label)}</span>`).join('<i aria-hidden="true">·</i>')}</p>`;
  return `
      <li class="sov-line${d.ownerDirect ? " sov-line--owner" : ""}" id="${esc(id)}" data-el="${esc(d.el)}" data-layers="${esc(anchors.layers.join(" "))}" data-open="false">
        <button class="sov-h" type="button" aria-expanded="false" aria-controls="${esc(id)}-open"><span class="sov-div num">${d.division === NO_DIVISION ? "" : esc(d.division)}</span><span class="sov-name">${esc(d.title)}${
          d.ownerDirect ? ` <span class="lg-tag">Bought by the Owner</span>` : ""
        }</span><span class="sov-psf num">${esc(d.perSquareFoot ?? "")}</span><span class="sov-pct num">${esc(pct(d.shareOfContract))}</span>${
          priced ? `<span class="sov-amt num">${waiting ? waitDot : ""}${usd(d.likely)}</span>` : `<span class="sov-amt sov-none">No Rate Yet</span>`
        }<span class="chev" aria-hidden="true"></span></button>
        <div class="fold" id="${esc(id)}-open"><div class="fold-in"><div class="lv2">${items}${noRate}${decided("Not in This Job", d.decisions.notInThisJob)}${decided("In This Job", d.decisions.inThisJob)}${decided(
          "Assumed Present",
          d.decisions.assumedPresent,
        )}${priced ? lineCard(d, anchors) : d.decisions.waiting.length > 0 ? waitBlock(d.decisions.waiting, true) : ""}
        </div></div></div>
      </li>`;
}

function sectionSchedule(page: BudgetPage, drawn: ReadonlySet<string>): string {
  const { headline: h } = page;
  const trade = page.divisions.filter((d) => !d.ownerDirect);
  const owner = page.divisions.filter((d) => d.ownerDirect);
  const ownerWords =
    owner.length === 1
      ? `The owner buys ${owner[0].title} directly, ${usd(owner[0].likely)}, outside the Total Budget.`
      : `The owner buys these directly, outside the Total Budget: ${owner.map((d) => `${d.title}, ${usd(d.likely)}`).join("; ")}.`;
  return `
<section class="sheet sheet--sov" id="where-the-money-is" data-el="section:where-the-money-is" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">Schedule of Values</h1>
    <p class="sheet-sub">By division, in the order the trades build it. Open a line to see what it pays for.</p>
  </div>
  <div class="sov-cols" aria-hidden="true"><span>Div</span><span>Description</span><span>$/GSF</span><span>%</span><span>Amount</span><span></span></div>
  <ol class="sov" data-sov>${trade.map((d) => sovLine(d, drawn)).join("")}${page.scheduleMarkups
    .map(
      (m) => `
      <li class="sov-line sov-line--mk"><div class="sov-h" data-el-ref="${esc(m.elRef)}"><span class="sov-div"></span><span class="sov-name">${esc(m.label)}</span><span class="sov-psf num">${esc(m.perSquareFoot ?? "")}</span><span class="sov-pct num">${
        m.tbd ? "" : esc(pct(m.share))
      }</span><span class="sov-amt num">${m.tbd ? '<span class="missing">TBD</span>' : usd(m.likely)}</span><span></span></div></li>`,
    )
    .join("")}
  </ol>
  <div class="sov-total" data-el-ref="total:kulka-contract"><span></span><span>Total Budget</span><span class="sov-psf num">${h.perSquareFoot ? usd(h.perSquareFoot.value) : ""}</span><span class="sov-pct num">100%</span><span class="sov-amt num">${usd(h.kulkaContract.likely)}</span><span></span></div>${
    owner.length > 0
      ? `
  <p class="sov-owner">${esc(ownerWords)} Lines with no rate yet are outside it too.</p>
  <ol class="sov sov--owner">${owner.map((d) => sovLine(d, drawn)).join("")}
  </ol>`
      : `
  <p class="sov-owner">Lines with no rate yet are outside the Total Budget.</p>`
  }${
    page.money.ownerScopes.length > 0
      ? `
  <p class="sov-foot" data-el="total:trade-cost">All Trades, Owner-Direct Included <span class="num">${usd(h.tradeCost.likely)}</span> <span class="num sov-foot-range">${usd(h.tradeCost.low)} to ${usd(h.tradeCost.high)}</span></p>`
      : ""
  }
</section>`;
}

// --- 5. Design and Engineering in layers (LA-1662) ----------------------------------------------------
//
// Rob's pick from LA-1627, frame A, Open in Place (~/scrollcraft/frames/kulka-de-layers/de-a-open.html):
// a wide line with the count, one row per criterion, and the row opening in place to its detail. The
// server writes every detail, folded; budget-page.js only opens it and lights the drawing.

const CONFIDENCE = { high: "High Confidence", low: "Low Confidence" } as const;
/** A step held to a code maximum ("50 ft against 85 ft") draws as a bar. */
const LIMIT = /^([\d,.]+) \w+ against ([\d,.]+) \w+$/;
const figure = (n: string) => Number(n.replace(/,/g, ""));

/**
 * The piece of the drawing a priced line lights, the way the Schedule of Values pins it, or null
 * when it is not drawn. A line with no rate yet lights its division's piece when the division is
 * drawn as one (the elevator's jacks and machine room are part of the elevator).
 */
function pieceOf(el: string, page: BudgetPage, drawn: ReadonlySet<string>): string | null {
  if (drawn.has(el)) return el;
  for (const d of page.divisions) {
    const anchors = anchorsOf(d, drawn);
    const item = d.items.find((i) => i.el === el);
    if (item) return anchors.of(item);
    if (d.supporting.some((u) => u.el === el)) return anchors.layers.length === 1 ? anchors.layers[0] : null;
  }
  return null;
}

function criterionDetail(k: Criterion, page: BudgetPage, drawn: ReadonlySet<string>): string {
  // The last step usually restates the choice the row already shows.
  const worked = k.steps.length > 0 && k.steps[k.steps.length - 1].result.toLowerCase() === k.value.toLowerCase() ? k.steps.slice(0, -1) : k.steps;
  const limits = worked.flatMap((st) => {
    const m = st.result.match(LIMIT);
    return m ? [{ ...st, share: figure(m[1]) / figure(m[2]) }] : [];
  });
  const steps = worked.filter((st) => !LIMIT.test(st.result));
  const assumed = k.inputs.filter((i) => i.basis === "assumed").length;
  const prices = k.prices.map((pr) => {
    const piece = pieceOf(pr.el, page, drawn);
    return piece
      ? `<li class="de-pr" data-layer="${esc(piece)}"><i aria-hidden="true"></i>${esc(pr.name)}</li>`
      : `<li class="de-pr de-pr--nd"><i aria-hidden="true"></i>${esc(pr.name)} <small>Not Drawn</small></li>`;
  });
  return `
          <div class="de-dt">
            <p class="de-marks">${k.settled ? src("high", "Settled") : src("working", "Planning Assumption")}${src(k.confidence, CONFIDENCE[k.confidence], " src--ring")}</p>
            <p class="de-why">${esc(k.confidenceReason)}</p>${
              prices.length > 0 ? `\n            <div><p class="de-l">Prices</p><ul class="de-prices">${prices.join("")}</ul></div>` : ""
            }${
              limits.length > 0
                ? `\n            <div><p class="de-l">Limits</p><div class="de-lim">${limits
                    .map(
                      (l) =>
                        `<div><p><span>${esc(titleCase(l.label))}</span><b class="num">${esc(l.result)}</b></p><span class="de-bar" aria-hidden="true"><i style="width:${(Math.min(l.share, 1) * 100).toFixed(1)}%"></i></span></div>`,
                    )
                    .join("")}</div></div>`
                : ""
            }
            <details class="de-in"><summary>Steps and Inputs <small>${assumed > 0 ? `<i class="dot dot--working" aria-hidden="true"></i>${assumed} Assumed` : "All Stated"}</small></summary>
              <p class="de-method">${esc(k.method)}</p>${
                steps.length > 0
                  ? `\n              <div class="de-steps">${steps.map((st) => `<div><span>${esc(titleCase(st.label))}</span><span class="num">${esc(st.result.replace(/ -> /g, " → "))}</span></div>`).join("")}</div>`
                  : ""
              }
              <dl class="de-inputs">${k.inputs
                .map(
                  (i) =>
                    `<div><dt>${esc(titleCase(i.name))}</dt><dd class="num">${esc(i.value)}<small><i class="dot dot--${i.basis === "assumed" ? "working" : "high"}" aria-hidden="true"></i>${i.basis === "assumed" ? "Assumed" : "Stated"}</small></dd></div>`,
                )
                .join("")}</dl>${k.corrected ? `\n              <p class="de-method">Corrected by Kulka, ${esc(k.corrected.on)}: ${esc(k.corrected.reason)}</p>` : ""}
            </details>
          </div>`;
}

function criterionRow(k: Criterion, page: BudgetPage, drawn: ReadonlySet<string>): string {
  const id = `crit-${k.code}`;
  return `
    <li class="de-row" data-crit="${esc(k.code)}" data-el-ref="${esc(k.el)}" data-open="false">
      <button class="de-h" type="button" aria-expanded="false" aria-controls="${esc(id)}"><span class="de-tag num">${esc(k.code)}</span><span class="de-name">${esc(k.label)}<small>${esc(k.value)}</small></span><span class="de-v">${esc(k.value)}</span><i class="dot dot--${k.settled ? "high" : "working"}" title="${k.settled ? "Settled" : "Planning Assumption"}"></i><span class="chev" aria-hidden="true"></span></button>
      <div class="fold" id="${esc(id)}"><div class="fold-in">${criterionDetail(k, page, drawn)}
      </div></div>
    </li>`;
}

function sectionDesign(page: BudgetPage, drawn: ReadonlySet<string>): string {
  if (page.criteria.length === 0) return "";
  const settled = page.criteria.filter((k) => k.settled).length;
  const open = page.criteria.length - settled;
  return `
<section class="sheet sheet--design" id="design-and-engineering" data-el="section:design-and-engineering" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">Design and Engineering</h1>
    <p class="sheet-sub">${page.criteria.length} criteria set what this budget assumes about the building.</p>
    <p class="de-tally" title="A Planning Assumption holds until your design team decides it."><span><i class="dot dot--high" aria-hidden="true"></i><b class="num">${settled}</b> Settled</span><span><i class="dot dot--working" aria-hidden="true"></i><b class="num">${open}</b> ${open === 1 ? "Planning Assumption" : "Planning Assumptions"}</span></p>
  </div>
  <ol class="de" data-de aria-label="Design and Engineering criteria">${page.criteria.map((k) => criterionRow(k, page, drawn)).join("")}
  </ol>
</section>`;
}

/**
 * The Schedule of Values and Design and Engineering share one drawing, pinned
 * beside them (above them on a phone). An open line lifts its pieces off it;
 * at Design and Engineering the inks settle and the criteria are called out.
 * The trio is the white sheet that slides up over the opening.
 */
function trio(page: BudgetPage, svg: string): string {
  const drawn = new Set([...svg.matchAll(/<g data-layer="([^"]*)"/g)].map((m) => m[1]));
  return `
<div class="trio" data-trio data-state="sov">
  <div class="trio-in">
  <div class="trio-main">${sectionSchedule(page, drawn)}
${sectionDesign(page, drawn)}
  </div>
  <aside class="sheet sheet--dwg" aria-label="The Section">
    <p class="crumb" data-crumb><b>Building Section</b></p>
    <div class="dwg dwg--crop" data-dwg="section">${svg}</div>
    <div class="card-slot" data-card-slot></div>
  </aside>
  </div>
</div>`;
}

// --- 6. From Trades to Total: the peak ------------------------------------------------------------------

/**
 * Where each line arrives in the band's own scroll, 0 to 1. The last line
 * arrives by 0.48 and has joined by 0.62; the landing holds from there to
 * the end of the pin, the longest hold on the page.
 */
function cueFor(index: number, count: number): string {
  return (0.06 + (index * 0.42) / Math.max(count - 1, 1)).toFixed(2);
}

function wfRow(w: WaterfallRow, index: number, count: number): string {
  const cue = cueFor(index, count);
  return `
        <li class="wf-row"${elAttr(w.el, w.elRef)} data-wf="${esc(w.key)}" data-sc-cue="${cue}" data-cue-at="${cue}"${w.running !== null ? ` data-running="${usd(w.running)}"` : ""}>
          <span class="wf-lab"><i class="dot dot--next" aria-hidden="true"></i><span>${esc(w.label)}</span></span>
          <span class="wf-amt num">${w.tbd ? '<span class="missing">TBD</span>' : usd(w.likely)}</span>
          <span class="wf-range num">${w.tbd ? "Outside the total until it has a basis" : `${usd(w.low)} to ${usd(w.high)}`}</span>
          <span class="wf-why">${esc(w.basis)}</span>${
            w.plan.length > 0 ? `\n          <ul class="wf-plan">${w.plan.map((pl) => `<li data-el="${esc(pl.el)}"><span>${esc(pl.label)}</span><span class="num">${usd(pl.amount)}</span></li>`).join("")}</ul>` : ""
          }
        </li>`;
}

function sectionWaterfall(page: BudgetPage, svg: { peak: string; peakLight: string }): string {
  const built = page.waterfall.filter((w) => w.key === "subtotal" || w.key === "gr" || w.key === "gc" || w.key === "fee" || w.key === "insurance");
  const after = page.waterfall.filter((w) => w.key === "owner-direct" || w.key === "total-project-cost");
  const trades = page.waterfall[0];
  const land = page.waterfall.find((w) => w.key === "kulka-contract")!;
  return `
<section class="band band--peak" id="from-trades-to-total" data-el="section:from-trades-to-total" data-sc-act="pin" data-sc-span="3.6" data-landed="false">
  <div class="band-stage sc-stage" data-sc-stage data-sc-verify-state="wf:0">
    <div class="wf-main">
      <div class="wf-in">
        <h1 class="wf-h">From Trades to Total</h1>
        <div class="wf-fig">
          <p class="fig-l" data-fig-label data-label-building="Total Budget So Far" data-label-landed="Total Budget">Total Budget</p>
          <p class="fig fig--beside num" data-el="total:kulka-contract" data-fig-running data-trades="${usd(trades.running ?? trades.likely)}" data-landed="${usd(land.likely)}">${usd(land.likely)}</p>
          <p class="wf-landed">The Total Budget could land anywhere between <span class="num" data-el="total:kulka-contract:low">${usd(land.low)}</span> and <span class="num" data-el="total:kulka-contract:high">${usd(land.high)}</span>. With what the owner buys direct, Total Project Cost runs between <span class="num">${usd(page.headline.totalProjectCost.low)}</span> and <span class="num">${usd(page.headline.totalProjectCost.high)}</span>.</p>
          <p class="wf-after" data-after>${after
            .map((w) => `<span${elAttr(w.el, w.elRef)} data-wf="${esc(w.key)}">${esc(w.label)} <b class="num">${usd(w.likely)}</b></span>`)
            .join('<i aria-hidden="true">·</i>')}</p>
        </div>
        <div class="dwg-swap" aria-label="The Section">
          <div class="dwg dwg--band dwg--crop dwg--dark" data-dwg="peak">${svg.peak}</div>
          <div class="dwg dwg--crop dwg--light" data-dwg="peak-light" aria-hidden="true">${svg.peakLight}</div>
        </div>
        <ol class="wf">${built.map((w, i) => wfRow(w, i, built.length)).join("")}
        </ol>
      </div>
    </div>
  </div>
</section>`;
}

// --- 7. Clarifications (LA-1504; the notes and parameters, once What Is In moved into the divisions) ---------------------------------------------------------------

function sectionGates(page: BudgetPage): string {
  return `
<section class="sheet gates" id="what-is-in" data-el="section:what-is-in" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">Clarifications</h1>
  </div>
  <p class="lede">Scope decisions sit with each line in the Schedule of Values.</p>
  <ol class="notes" data-sc-in data-sc-stagger="15">${page.notes
    .map(
      (n) => `
    <li class="note" data-el="${esc(n.el)}" value="${n.number}"><span class="note-n num">${n.number}</span><span class="note-text">${esc(n.text)}</span></li>`,
    )
    .join("")}
  </ol>${page.markupWords ? `\n  <p class="sub">${esc(page.markupWords)}</p>` : ""}
</section>`;
}

// --- 8. What Happens Next --------------------------------------------------------------------------------------

function record(page: BudgetPage): string {
  const r = page.record;
  const h = page.headline;
  return `
  <dl class="record">
    <div><dt>Prepared For</dt><dd data-el="record:prepared-for">${r.preparedFor ? esc(r.preparedFor) : '<span class="missing">Not Named</span>'}</dd></div>
    <div><dt>Issued</dt><dd data-el="record:issued">${time(r.issuedAt)}</dd></div>${
      h.grossSquareFeet !== null ? `\n    <div><dt>Gross Area</dt><dd data-el="record:gross-area">${wholeNumber(h.grossSquareFeet)} SF</dd></div>` : ""
    }${h.unitCount !== null ? `\n    <div><dt>Units</dt><dd data-el="record:units">${wholeNumber(h.unitCount)}</dd></div>` : ""}
    <div><dt>Figures Valid</dt><dd data-el="record:validity">${r.validityDays ? `${r.validityDays} days from issue` : '<span class="missing">Not Set</span>'}</dd></div>
  </dl>`;
}

function sectionNext(page: BudgetPage): string {
  const open = page.next.openQuestions;
  const nextStage = page.next.nextStage;
  const r = page.record;
  return `
<section class="sheet next" id="what-happens-next" data-el="section:what-happens-next" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">What Happens Next</h1>
  </div>
  <ol class="steps">
    <li><b>Check the Basis.</b> Open each line in the Schedule of Values and read how its items are priced. If anything is wrong, flag it there and Kulka reprices from the corrected fact.</li>${
      open.length > 0
        ? `
    <li><b>Answer the open ${open.length === 1 ? "item" : "items"}.</b> ${open.map(esc).join(" ")} ${open.length === 1 ? "An answer moves" : "Answers move"} what waits on it into, or out of, the number.</li>`
        : ""
    }${nextStage ? `\n    <li><b>Reprice at ${esc(nextStage.label)}.</b> ${esc(nextStage.words)}</li>` : ""}
  </ol>
  <p class="reach">To reach Kulka, reply to the estimator who sent you this link.</p>${record(page)}
  <footer class="foot">
    <span class="foot-mark">Kulka</span>
    <span class="foot-rec"><span data-el="record:project">${esc(page.projectName)}</span> · <span data-el="record:version">Version ${r.version}</span> · <span data-el="record:prepared-by">Prepared by ${esc(r.preparedBy)}</span></span>
  </footer>
</section>`;
}

/** A superseded page keeps its figures under a band naming the newer version (LA-1309 decision 3). */
function newerBand(page: BudgetPage): string {
  if (!page.newer) return "";
  return `
<p class="superseded" role="note">Version ${page.newer.version} replaces this budget. <a href="${esc(page.newer.href)}">Open Version ${page.newer.version}</a></p>`;
}

// --- Print (LA-1420) -------------------------------------------------------------------------------------------------

/**
 * Names every `data-el` element as a PDF destination. An element with no id
 * takes its `data-el` as its id. One that has an id already (a section, a
 * row) gets an empty marker inside it carrying the `data-el`. Chromium
 * writes a named destination for each same-page link target, so a hidden
 * list of links to every id makes them all reach the PDF (LA-1309, "The PDF
 * carries the same ids as named destinations").
 */
function withDestinations(html: string): string {
  const names: string[] = [];
  const named = html.replace(/<([a-z][a-z0-9]*)((?:\s[^<>]*?)?)\sdata-el="([^"]*)"([^<>]*)>/g, (_all, tag: string, before: string, el: string, after: string) => {
    names.push(el);
    if (/\sid="/.test(`${before}${after}`)) return `<${tag}${before} data-el="${el}"${after}><span class="dest" id="${el}"></span>`;
    return `<${tag}${before} data-el="${el}" id="${el}"${after}>`;
  });
  const links = names.map((el) => `<a href="#${el}">${el}</a>`).join("");
  return named.replace("</body>", `<nav class="dests" aria-hidden="true">${links}</nav>\n</body>`);
}

export type RenderOptions = {
  /** The printed page: the same one depth, no chrome, no engine, every id a PDF destination. */
  print?: boolean;
  /**
   * The comment layer, for a browser with a valid reader cookie (LA-1489).
   * Ignored when printing, so the print render and the stored PDF never carry it.
   */
  comments?: CommentLayer | null;
};

/** The whole document for one published budget. */
export function renderBudgetPage(page: BudgetPage, options: RenderOptions = {}): string {
  const print = options.print === true;
  const comments = print ? null : (options.comments ?? null);
  const svg = drawings(page);
  const html = `<!doctype html>
<html lang="en"${print ? ' data-print="1"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(page.documentTitle)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%230B0B0A'/><text x='16' y='22' text-anchor='middle' font-family='Open Sans, Arial, sans-serif' font-weight='800' font-size='18' fill='white'>K</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/scrollcraft/scrollcraft.css">
<link rel="stylesheet" href="/scrollcraft/budget-page.css">
<link rel="stylesheet" href="/scrollcraft/drill-down.css">${comments ? '\n<link rel="stylesheet" href="/scrollcraft/comments.css">' : ""}
${svg.style}
</head>
<body>${print ? "" : "\n<span data-sc-progress></span>"}${print ? "" : header(page, comments !== null)}
<main id="top">${newerBand(page)}
${sectionNumber(page)}
${trio(page, svg.section)}
${sectionLetter(page)}
${sectionProject(page)}
${sectionWaterfall(page, svg)}
${sectionGates(page)}
${sectionNext(page)}
</main>${print ? "" : '\n<script src="/scrollcraft/scrollcraft.js"></script>'}
<script src="/scrollcraft/budget-page.js"></script>${
    comments
      ? `\n<script type="application/json" id="cm-data">${layerJson(comments)}</script>\n<script src="/scrollcraft/comments.js"></script>`
      : ""
  }
</body>
</html>
`;
  return print ? withDestinations(html) : html;
}

/** The plain sheet a withdrawn link shows: no figures, only whom to ask. */
export function renderWithdrawnPage(version: number, preparedBy: string | null): string {
  const who = preparedBy ?? "The Kulka Group";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>Budget Withdrawn · Kulka</title>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/scrollcraft/scrollcraft.css">
<link rel="stylesheet" href="/scrollcraft/budget-page.css">
</head>
<body class="withdrawn">
<main class="sheet">
  <p class="meta">The Kulka Group</p>
  <h1 class="sheet-h">This budget was withdrawn</h1>
  <p class="lede">Version ${version} is no longer open. Ask ${esc(who)} for the current figures.</p>
</main>
</body>
</html>
`;
}
