import {
  longDate,
  usd,
  wholeNumber,
  type BudgetPage,
  type Criterion,
  type Fact,
  type LetterRun,
  type Tone,
  type WaterfallRow,
} from "@/lib/rom/presentation";
import { layerJson, type CommentLayer } from "@/lib/rom/comment-layer";
import { NO_DIVISION, type BasisRow, type DecisionRow, type DivisionItem, type DivisionRow, type RaiseRow, type ScopeText, type SupportingItem } from "@/lib/rom/drill-down";
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

function header(page: BudgetPage, comments: boolean): string {
  const figure = `<span class="hd-fig" data-el-ref="total:kulka-contract"><span class="hd-fig-l">Kulka Contract</span><span class="hd-fig-v num">${usd(page.headline.kulkaContract.likely)}</span></span>`;
  return `
<header class="hd" id="bar" data-state="band">
  <div class="hd-t1">
    <a class="hd-mark" href="#your-number">Kulka</a>
    <span class="hd-proj">${esc(page.projectName)}</span>
    ${figure}${comments ? commentControl : ""}
  </div>
  <nav class="hd-t2" aria-label="Sections">
    ${figure}
    <ul class="hd-ix">${page.sections
      .filter((s) => s.id !== "design-and-engineering" || page.criteria.length > 0)
      .map((s) => `<li><a href="#${s.id}" data-index="${s.id}">${esc(s.indexLabel)}</a></li>`)
      .join("")}</ul>
    <span class="hd-here" data-here>${esc(page.sections[0].indexLabel)}</span>
  </nav>
</header>`;
}

// --- 1. The band grown to the viewport: the wordmark, the project, the record ---------------

function sectionNumber(page: BudgetPage): string {
  const r = page.record;
  return `
<section class="band band--first" id="your-number" data-el="section:your-number" data-sc-act="flow" data-sc-verify-state="travel:0">
  <div class="band-stage">
    <div class="band-main">
      <div class="fig-wrap big">
        <p class="big-mark" data-travel>Kulka</p>
        <p class="big-proj" data-fade>${esc(page.projectName)}</p>
        <p class="band-meta big-meta" data-fade><span>${esc(r.stageLabel)}</span><i aria-hidden="true">·</i><span>Version ${r.version}</span><i aria-hidden="true">·</i><span>Issued ${time(r.issuedAt)}</span></p>
      </div>
    </div>
    <footer class="band-foot" data-fade>
      <ol class="stg" aria-label="Where this budget stands">${page.stages
        .map(
          (st) => `
        <li${st.current ? ' aria-current="step"' : ""}><span class="stg-name">${esc(st.label)}</span><span class="stg-words">${esc(st.words)}</span></li>`,
        )
        .join("")}
      </ol>
    </footer>
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
      ? "Your answers about the whole project. Answers about one trade sit in that division&rsquo;s Basis in The Ledger."
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

// --- 3. The Ledger, with the Section beside it ---------------------------------------------------

const CONFIDENCE_WORD: Record<string, string> = { high: "High", medium: "Medium", low: "Low", none: "None" };

/** A confidence mark, dot plus ink (LA-1479: a full dot, a half dot, a ring). */
const mark = (tone: string, text = CONFIDENCE_WORD[tone] ?? tone) =>
  `<span class="dv-cf"><i class="dot dot--${esc(tone)}" aria-hidden="true"></i>${esc(text)}</span>`;
const chip = (c: { tone: string; text: string }) => src(c.tone as Tone, c.text);
const pill = `<span class="pill"><span class="pill-open">Open</span><span class="pill-close">Close</span></span>`;
const items = (n: number) => `${n} ${n === 1 ? "Item" : "Items"}`;
/** The VE control in its empty state (LA-1481): present, quiet, nothing to open until Kulka supplies options. */
// LA-1532: no VE control shows until a division has VE options (LA-1481).
// "VE None Yet" on every division read as if Kulka had not tried.

function tabs(list: { key: string; label: string; n?: number }[], end = ""): string {
  return `
            <div class="tabs" role="tablist">${list
              .map(
                (t, i) =>
                  `<button class="tab${i === 0 ? " is-on" : ""}" type="button" role="tab" aria-selected="${i === 0}" data-tab="${t.key}">${esc(t.label)}${
                    t.n !== undefined ? ` <span class="tab-n">${t.n}</span>` : ""
                  }</button>`,
              )
              .join("")}${end ? `<span class="tabs-end">${end}</span>` : ""}</div>`;
}

const panel = (key: string, first: boolean, title: string, body: string) =>
  `
            <div class="dv-panel" data-panel="${key}"${first ? "" : " hidden"}><p class="dv-h print-h">${esc(title)}</p>${body}
            </div>`;

function basisRow(row: BasisRow): string {
  const tag = row.tag ? `<span class="crit-tag num">${esc(row.tag)}</span> ` : "";
  return `
                <li data-el="${esc(row.el)}"><span class="as-l">${tag}${esc(row.label)}</span><span class="as-v">${esc(row.value)}</span>${chip(row.chip)}</li>`;
}

function divisionItem(item: DivisionItem): string {
  const scope = item.includes.length + item.excludes.length > 0;
  const side = (title: string, cls: string, list: ScopeText[]) =>
    list.length === 0 ? "" : `<div><p class="io-h ${cls}"><i></i>${title}</p><ul>${list.map((x) => `<li data-el="${esc(x.el)}">${esc(x.text)}</li>`).join("")}</ul></div>`;
  return `
          <div class="si" data-el="${esc(item.el)}" data-open="false">
            <button class="si-head" type="button" aria-expanded="false"><span class="ln-l">${esc(item.label)}</span><span class="ln-v num">${usd(item.likely)}</span>${pill}</button>
            <p class="si-meta"><span class="num si-range">${usd(item.low)} to ${usd(item.high)}</span><i class="si-range">·</i>${mark(item.confidence)}${
              item.sourceText === "Kulka Rate" ? `<i>·</i><span>Kulka Rate</span>` : item.sourceText === "Placeholder Rate" ? `<i>·</i><span>Placeholder Rate</span>` : ""
            }</p>
            <div class="si-body">${tabs([{ key: "basis", label: "Basis", n: item.basis.length }, ...(scope ? [{ key: "scope", label: "Inclusions and Exclusions" }] : [])])}${panel(
              "basis",
              true,
              "Basis",
              `
              <ul class="as">${item.basis.map(basisRow).join("")}
              </ul>`,
            )}${
              scope
                ? panel("scope", false, "Inclusions and Exclusions", `
              <div class="io">${side("Inclusions", "io-h--in", item.includes)}${side("Exclusions", "io-h--out", item.excludes)}</div>`)
                : ""
            }
            </div>
          </div>`;
}

function supportingRow(list: SupportingItem[], open: boolean): string {
  if (list.length === 0) return "";
  return `
          <div class="si si--group" data-open="${open}">
            <button class="si-head" type="button" aria-expanded="${open}"><span class="ln-l">In Scope, No Rate Yet</span><span class="ln-v">${items(list.length)}</span>${pill}</button>
            <p class="si-meta">${mark("none", "No Rate Yet")}<i>·</i><span>Outside the Total</span></p>
            <ul class="sup si-body">${list.map((u) => `<li data-el="${esc(u.el)}">${esc(u.label)}</li>`).join("")}</ul>
          </div>`;
}

function decisionRow(row: DecisionRow): string {
  return `<li${elAttr(row.el || null)}><span class="dec-l">${esc(row.label)}</span><span class="dec-a">${row.answers
    .map((a) => `${esc(a.label)}: <strong>${esc(a.answer)}</strong>`)
    .join(" · ")}</span></li>`;
}

function decisionsPanel(d: DivisionRow): string {
  const groups: [string, DecisionRow[]][] = [
    ["In This Job", d.decisions.inThisJob],
    ["Assumed Present", d.decisions.assumedPresent],
    ["Not in This Job", d.decisions.notInThisJob],
    ["Waiting on an Answer", d.decisions.waiting],
  ];
  return groups
    .filter(([, rows]) => rows.length > 0)
    .map(([title, rows]) => `
              <p class="dv-h">${title}</p>
              <ul class="dec">${rows.map(decisionRow).join("")}</ul>`)
    .join("");
}

function raiseRow(r: RaiseRow): string {
  const tag = r.tag === "Open" ? `<span class="q-tag">Open</span>` : `<span class="crit-tag num">${esc(r.tag)}</span>`;
  return `
                <li data-el="${esc(r.el)}">${tag}<span class="raise-t">${esc(r.label)}</span><span class="raise-v">${esc(r.value)}</span>${chip(r.chip)}</li>`;
}

function divisionRow(d: DivisionRow): string {
  const priced = d.items.length > 0;
  const count = d.items.length + d.supporting.length;
  const word = CONFIDENCE_WORD[d.confidence];
  const rate = [d.perSquareFoot ? `${d.perSquareFoot} per SF` : null, d.shareOfContract].filter(Boolean).join(" · ");
  const longMark = priced ? mark(d.confidence, `${word} Confidence`) : mark("none", "Outside the Total");
  const hasDecisions = Object.values(d.decisions).some((rows) => rows.length > 0);
  const list = [
    { key: "items", label: "Items", n: count },
    ...(priced ? [{ key: "confidence", label: "Confidence" }] : []),
    ...(hasDecisions ? [{ key: "decisions", label: "Scope Decisions" }] : []),
  ];
  const id = `division-${d.division}`;
  return `
      <div class="lg-item${d.ownerDirect ? " lg-item--owner" : ""}" id="${esc(id)}" data-el="${esc(d.el)}" data-layer="${esc(d.el)}" data-layers="${esc(d.layers.join(" "))}" data-open="false" role="row">
        <button class="lg-row lg-btn dv-row" type="button" aria-expanded="false" aria-controls="${esc(id)}-open">
          <span class="lg-div num">${d.division === NO_DIVISION ? "" : esc(d.division)}</span>
          <span class="lg-name">${esc(d.title)}${d.ownerDirect ? ` <span class="lg-tag">Bought by the Owner</span>` : ""}</span>
          ${priced ? mark(d.confidence) : '<span class="dv-cf"></span>'}
          <span class="lg-amt num">${priced ? usd(d.likely) : '<span class="missing">No Rate Yet</span>'}</span>
          <span class="lg-psf num">${esc(d.perSquareFoot ?? "")}</span>
          <span class="lg-pct num">${esc(d.shareOfContract ?? "")}</span>
          <span class="lg-rate num">${esc(rate)}</span>
          <span class="lg-more dv-more">${longMark}<span class="lg-count">${items(count)}</span>${pill}</span>
          <span class="dv-meta">${longMark}<span>${items(count)}</span></span>
        </button>
        <div class="lg-lines dv-open" id="${esc(id)}-open">${tabs(list)}${panel(
          "items",
          true,
          "Items",
          `${d.items.map(divisionItem).join("")}${supportingRow(d.supporting, !priced)}`,
        )}${
          priced
            ? panel(
                "confidence",
                false,
                "Confidence",
                `
              <div class="cf-panel">
                <div class="cf-big" data-el="confidence:${esc(d.division)}">${longMark}</div>${
                  d.raise.length > 0
                    ? `
                <p class="dv-h">What Would Raise It</p>
                <ul class="raise">${d.raise.map(raiseRow).join("")}
                </ul>`
                    : ""
                }
              </div>`,
              )
            : ""
        }${hasDecisions ? panel("decisions", false, "Scope Decisions", decisionsPanel(d)) : ""}
        </div>
      </div>`;
}

function sectionLedger(page: BudgetPage): string {
  const { money, headline } = page;
  return `
<section class="sheet sheet--ledger" id="where-the-money-is" data-el="section:where-the-money-is" data-sc-act="flow" data-sc-verify-state="ledger:-1:0">
  <div class="sheet-hd">
    <h1 class="sheet-h">The Ledger</h1>
    <p class="sheet-sub">By division, in the order the trades build it. Open one to see what is in it.</p>
  </div>
  <div class="lg" role="table" aria-label="The Ledger">
    <div class="lg-row lg-cols dv-row" role="row">
      <span class="lg-div">Div</span>
      <span class="lg-name">Division</span>
      <span class="dv-cf">Confidence</span>
      <span class="lg-amt">Amount</span>
      <span class="lg-psf">$/SF</span>
      <span class="lg-pct">%</span>
    </div>
    <div class="lens" data-lens data-open="false" aria-live="polite" aria-label="The current row"></div>${page.divisions.map(divisionRow).join("")}
    ${
      money.ownerScopes.length > 0
        ? `
    <div class="lg-foot lg-foot--quiet" data-el="total:trade-cost">
      <span>All Trades, Owner-Direct Included <span class="lg-foot-range num">${usd(headline.tradeCost.low)} to ${usd(headline.tradeCost.high)}</span></span>
      <span class="num">${usd(headline.tradeCost.likely)}</span>
    </div>`
        : ""
    }
  </div>
</section>`;
}

// --- 5. Design and Engineering: the criteria called out on the drawing, no money ----------------------

/** The depth under the callouts, from Detail on. The ids sit on the callouts themselves. */
function criterionRow(k: Criterion): string {
  return `
      <article class="criterion lg-row">
        <span class="crit-tag num">${esc(k.code)}</span>
        <div class="crit-body">
          <h2 class="crit-h">${esc(k.label)}</h2>
          <p class="crit-method">${esc(k.method)}</p>${k.prices.length ? `\n          <p class="crit-prices">Prices ${k.prices.map(esc).join("; ")}.</p>` : ""}
          <p class="crit-why">${esc(k.confidenceReason)}</p>
          <dl class="crit-inputs">${k.inputs.map((i) => `<div><dt>${esc(i.name)}</dt><dd>${esc(i.value)} <span class="basis basis--${i.basis}">${i.basis}</span></dd></div>`).join("")}</dl>
          <ol class="crit-steps">${k.steps.map((st) => `<li><span>${esc(st.label)}</span><span>${esc(st.result)}</span></li>`).join("")}</ol>${
            k.corrected ? `\n          <p class="crit-corrected">Corrected by Kulka, ${esc(k.corrected.on)}: ${esc(k.corrected.reason)}</p>` : ""
          }
        </div>
        <span class="crit-v num">${esc(k.value)}</span>
        ${k.settled ? src("high", "Settled") : src("working", "Planning Assumption")}
      </article>`;
}

function sectionDesign(page: BudgetPage): string {
  if (page.criteria.length === 0) return "";
  const settled = page.criteria.filter((x) => x.settled).length;
  return `
<section class="sheet sheet--design" id="design-and-engineering" data-el="section:design-and-engineering" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">Design and Engineering</h1>
    <p class="sheet-sub">${page.criteria.length} criteria set what this budget assumes about the building, called out on the section. ${settled} ${settled === 1 ? "is" : "are"} settled by code; the rest are planning assumptions until your design team decides them.</p>
  </div>
  <ol class="crit crit--keyed" aria-label="Design and Engineering criteria">${page.criteria
    .map(
      (k) => `\n    <li data-crit="${esc(k.code)}"><span class="crit-tag num">${esc(k.code)}</span><span class="crit-l">${esc(k.label)}</span><span class="crit-v">${esc(k.value)}</span>${
        k.settled ? src("high", "Settled") : src("working", "Planning Assumption")
      }</li>`,
    )
    .join("")}
  </ol>
  <div class="crits lg">${page.criteria.map(criterionRow).join("")}
  </div>
</section>`;
}

/**
 * The Ledger and Design and Engineering share one drawing, pinned
 * beside them (above them on a phone), which changes state in place: layers
 * drawing in row by row, then the criteria called out on it with the inks
 * settled.
 */
function trio(page: BudgetPage, svg: string): string {
  const facts = page.drawing.facts;
  const caption = [`${facts.stories} Stories`, facts.units !== null ? `${wholeNumber(facts.units)} Units` : null, facts.grossArea].filter(Boolean).join(" · ");
  return `
<div class="trio" data-trio data-state="ledger">
  <div class="trio-main">${sectionLedger(page)}
${sectionDesign(page)}
  </div>
  <aside class="sheet sheet--dwg" aria-label="The Section">
    <div class="dwg dwg--crop" data-dwg="section">${svg}<p class="dwg-tag" data-dwg-tag hidden></p><i class="dwg-lead" data-dwg-lead hidden></i></div>
    <p class="dwg-cap only-phone"><b>Building Section</b> · ${esc(caption)}</p>
    <p class="dwg-fold" data-dwg-fold><b>Building Section</b><span><i class="dot" aria-hidden="true"></i><span data-fold-name></span></span><button class="pill" type="button" data-fold-show>Show</button></p>
  </aside>
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
          <p class="fig-l" data-fig-label data-label-building="Kulka Contract So Far" data-label-landed="Kulka Contract">Kulka Contract</p>
          <p class="fig fig--beside num" data-el="total:kulka-contract" data-fig-running data-trades="${usd(trades.running ?? trades.likely)}" data-landed="${usd(land.likely)}">${usd(land.likely)}</p>
          <p class="wf-landed">Likely, between <span class="num" data-el="total:kulka-contract:low">${usd(land.low)}</span> and <span class="num" data-el="total:kulka-contract:high">${usd(land.high)}</span>. ${esc(land.basis)} Total Project Cost, with what the owner buys direct, between <span class="num">${usd(page.headline.totalProjectCost.low)}</span> and <span class="num">${usd(page.headline.totalProjectCost.high)}</span>.</p>
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
  <p class="lede">Scope decisions now sit with each division in The Ledger.</p>
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
    <li><b>Check the Basis.</b> Open each division in The Ledger and read the Basis under its items. If anything is wrong, flag it there and Kulka reprices from the corrected fact.</li>${
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
${sectionLetter(page)}
${sectionProject(page)}
${trio(page, svg.section)}
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
