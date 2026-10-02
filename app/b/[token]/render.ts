import {
  longDate,
  percentOf,
  usd,
  wholeNumber,
  type BudgetPage,
  type Chip,
  type Criterion,
  type Fact,
  type GateRow,
  type LedgerRow,
  type PricedLine,
  type Tier,
  type Tone,
  type UnpricedLine,
  type WaterfallRow,
} from "@/lib/rom/presentation";
import { drawSection, sectionStyle } from "@/lib/rom/section";

// LA-1459. The client budget page, "The Ledger, Opened with the Section",
// rendered from the presentation model on the approved frames
// (~/scrollcraft/frames/kulka-ledger-opened, tag approved-2026-10-02;
// brief-v3.md and brief-v3-section.md on LA-1309). The internal saved-budget
// screen grown into a presentation: the black band at full viewport, the
// figure rising into the two-tier header, the ledger in MasterFormat order
// with the section drawn beside it row by row, Proven, the criteria called
// out, the second black band as the waterfall, What Is In, the ask.
//
// Every figure, label and id comes from the model; nothing here prices,
// words or orders anything. The markup is driven by public/scrollcraft/
// budget-page.js over the vendored engine (scrollcraft.js, untouched), and
// styled by public/scrollcraft/budget-page.css, whose tokens are the
// internal screen's own. Three tiers of one DOM, switched on <html data-tier>.
//
// Version 1's element ids are kept, with one departure: the Summary fold
// (`scopes:rest`) is gone, because the ledger shows every row at every depth
// so the section can be drawn row by row.

const esc = (t: string | number): string =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One `data-el`, or a pointer at the element that holds it. */
const elAttr = (el: string | null, ref: string | null = null): string =>
  el ? ` data-el="${esc(el)}"` : ref ? ` data-el-ref="${esc(ref)}"` : "";

const tierClass = (tier: Tier): string => (tier === "summary" ? "" : ` tier-${tier}`);

const toneWord: Record<Tone, string> = { high: "High", medium: "Medium", low: "Low", none: "None" };
/** A source, dot plus ink: the internal ledger's own cell. */
const src = (tone: Tone | "working" | "quiet", text: string, cls = "") =>
  `<span class="src${cls}"><i class="dot dot--${tone}" aria-hidden="true"></i>${esc(text)}</span>`;
const srcOf = (c: Chip) => src(c.tone, c.text);
const time = (iso: string) => `<time datetime="${esc(iso)}">${longDate(iso)}</time>`;

/** The range on a scale from $0, as the internal screen's RangeBand draws it: max = high × 1.04. */
function rangeBand(low: number, mid: number, high: number, lowEl: string, highEl: string): string {
  const max = high * 1.04;
  const pct = (v: number) => ((v / max) * 100).toFixed(2);
  return `<span class="prb" aria-label="Range ${usd(low)} to ${usd(high)}">
        <span class="prb-track" aria-hidden="true">
          <span class="prb-band" style="left:${pct(low)}%;width:${pct(high - low)}%"></span>
          <span class="prb-mid" style="left:${pct(mid)}%"></span>
        </span>
        <span class="prb-lbls">
          <span class="prb-lbl num" style="left:${pct(low)}%" data-el="${esc(lowEl)}">${usd(low)}</span>
          <span class="prb-lbl prb-lbl--end num" style="left:${pct(high)}%" data-el="${esc(highEl)}">${usd(high)}</span>
        </span>
      </span>`;
}

// --- The drawings ---------------------------------------------------------------------

function drawings(page: BudgetPage) {
  const d = page.drawing;
  const ink = new Map(Object.entries(d.ink));
  // The drawings' style rules live in the head, so no <style> sits in the body.
  // The one section beside the ledger, Proven and Design and Engineering owns
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

function tierSwitch(): string {
  return `<div class="sw" role="group" aria-label="Depth">
      <button type="button" class="sw-t" data-tier="summary" aria-pressed="true">Summary</button><i aria-hidden="true">·</i><button type="button" class="sw-t" data-tier="detail" aria-pressed="false">Detail</button><i aria-hidden="true">·</i><button type="button" class="sw-t" data-tier="full" aria-pressed="false">Full</button>
    </div>`;
}

function header(page: BudgetPage): string {
  const figure = `<span class="hd-fig" data-el-ref="total:kulka-contract"><span class="hd-fig-l">Kulka Contract</span><span class="hd-fig-v num">${usd(page.headline.kulkaContract.likely)}</span></span>`;
  return `
<header class="hd" id="bar" data-state="band">
  <div class="hd-t1">
    <a class="hd-mark" href="#your-number">Kulka</a>
    <span class="hd-proj">${esc(page.projectName)}</span>
    ${figure}
    ${tierSwitch()}
  </div>
  <nav class="hd-t2" aria-label="Sections">
    ${figure}
    <ul class="hd-ix">${page.sections
      .filter((s) => s.id !== "design-and-engineering" || page.criteria.length > 0)
      .map((s) => `<li${s.tier === "summary" ? "" : ` class="tier-${s.tier}"`}><a href="#${s.id}" data-index="${s.id}">${esc(s.indexLabel)}</a></li>`)
      .join("")}</ul>
    <span class="hd-here" data-here>${esc(page.sections[0].indexLabel)}</span>
  </nav>
</header>`;
}

// --- 1. Your Number: the band grown to the viewport -----------------------------------------

function sectionNumber(page: BudgetPage): string {
  const h = page.headline;
  return `
<section class="band band--first" id="your-number" data-el="section:your-number" data-sc-act="flow" data-sc-verify-state="travel:0">
  <div class="band-stage">
    <div class="band-main">
      <div class="fig-wrap">
        <p class="fig-l" data-fade>Kulka Contract</p>
        <p class="fig num" data-el="total:kulka-contract" data-travel>${usd(h.kulkaContract.likely)}</p>
        <span data-fade>${rangeBand(h.kulkaContract.low, h.kulkaContract.likely, h.kulkaContract.high, "total:kulka-contract:low", "total:kulka-contract:high")}</span>
        <p class="rates" data-fade>
          <span>Total Project Cost <b class="num" data-el="total:total-project-cost">${usd(h.totalProjectCost.likely)}</b></span>${
            h.perSquareFoot ? `\n          <span><b class="num" data-el="record:per-sf" title="${esc(h.perSquareFoot.arithmetic)}">${usd(h.perSquareFoot.value)}</b> per SF</span>` : ""
          }${h.perUnit ? `\n          <span><b class="num" data-el="record:per-unit" title="${esc(h.perUnit.arithmetic)}">${usd(h.perUnit.value)}</b> per unit</span>` : ""}
        </p>
        <p class="band-meta tier-detail" data-fade>${esc(page.record.stageLabel)} · Version ${page.record.version} · Issued ${time(page.record.issuedAt)}</p>
      </div>
    </div>
    <footer class="band-foot" data-fade>
      <ol class="stg" aria-label="Where this budget stands">${page.stages
        .map(
          (st) => `
        <li${st.current ? ' aria-current="step"' : ""}><span class="stg-name">${esc(st.label)}</span><span class="stg-words tier-detail">${esc(st.words)}</span></li>`,
        )
        .join("")}
      </ol>
    </footer>
  </div>
</section>`;
}

// --- 2. What You Told Us ------------------------------------------------------------------------

function factRow(f: Fact): string {
  return `
      <div class="fact lg-row${tierClass(f.tier)}" data-el="${esc(f.el)}">
        <dt class="fact-l">${esc(f.label)}</dt>
        <dd class="fact-d">
          <span class="fact-v">${esc(f.value)}</span>
          ${f.basis === "assumed" ? src("working", `Assumed, ${f.assumedBy}`) : src("quiet", "Stated", " tier-detail")}
          <span class="fact-basis tier-full">${esc(f.basisWords)}</span>
        </dd>
      </div>`;
}

function sectionProject(page: BudgetPage): string {
  const { project, headline, record } = page;
  const n = project.assumedCount;
  return `
<section class="sheet" id="the-project" data-el="section:the-project" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">What You Told Us</h1>${project.line ? `\n    <p class="sheet-sub">${esc(project.line)}</p>` : ""}
  </div>${record.coverSentence ? `\n  <p class="lede cover" data-el="record:cover">${esc(record.coverSentence)}</p>` : ""}${
    headline.grossSquareFeet !== null ? `\n  <p class="fig-md num" data-el="fact:grossSquareFeet:figure">${wholeNumber(headline.grossSquareFeet)} SF</p>` : ""
  }
  <p class="lede">What you told Kulka, read back.${n > 0 ? ` ${n} ${n === 1 ? "fact below was" : "facts below were"} set by Kulka's design criteria rather than stated, and each is marked.` : ""}</p>
  <dl class="facts lg">${project.facts.map(factRow).join("")}
  </dl>
</section>`;
}

// --- 3. The Ledger, with the Section beside it ---------------------------------------------------

function comparableRows(line: PricedLine): string {
  return line.comparables
    .map(
      (c) => `
            <li class="cmp" data-el="${esc(c.el)}">
              <span class="cmp-k">${esc(c.kindWords)}</span>
              <span class="cmp-j">${esc(c.jobs)}</span>
              <span class="cmp-r num">${esc(c.rate)}</span>
              <span class="cmp-w tier-full">Weight ${c.weight}</span>
              <span class="cmp-d tier-full">${esc(c.recordedAt)}</span>
            </li>`,
    )
    .join("");
}

function lineDetail(line: PricedLine): string {
  return `
          <div class="ln"${elAttr(line.el)}>
            <div class="ln-head">
              <span class="ln-l">${esc(line.label)}</span>
              ${srcOf(line.source)}
              <span class="ln-v num">${usd(line.likely)}</span>
            </div>
            <p class="ln-range">${usd(line.low)} to ${usd(line.high)}. ${src(line.confidence, `${toneWord[line.confidence]} Confidence`)}</p>
            <ul class="cmps" aria-label="Where the figure came from">${comparableRows(line)}
            </ul>
            <p class="ln-basis tier-full">${esc(line.basis)}</p>
          </div>`;
}

function unpricedRow(u: UnpricedLine): string {
  return `
          <div class="ln ln--unpriced" data-el="${esc(u.el)}">
            <div class="ln-head">
              <span class="ln-l">${esc(u.label)}</span>
              ${src("none", "No Rate Yet")}
              <span class="ln-v num missing">Outside the Total</span>
            </div>
          </div>`;
}

function ledgerRow(row: LedgerRow): string {
  const sc = row.scope;
  const items = sc.lines.length + sc.unpriced.length;
  const amount = sc.kind === "unpriced" ? '<span class="missing">Outside the Total</span>' : usd(row.likely);
  const rate = [row.perSquareFoot ? `${row.perSquareFoot} per SF` : null, row.shareOfContract].filter(Boolean).join(" · ");
  return `
      <div class="lg-item${sc.ownerDirect ? " lg-item--owner" : ""}" id="${esc(sc.domId)}" data-el="${esc(sc.el)}" data-layer="${esc(row.key)}" data-open="false" role="row">
        <button class="lg-row lg-btn" type="button" aria-expanded="false" aria-controls="${esc(sc.domId)}-lines">
          <span class="lg-div num">${esc(row.division ?? "")}</span>
          <span class="lg-name">${esc(row.label)}${sc.ownerDirect ? ` <span class="lg-tag">Bought by the Owner</span>` : ""}${
            sc.kind === "element" ? ` <span class="lg-count tier-detail">${items} ${items === 1 ? "Item" : "Items"}</span>` : ""
          }</span>
          <span class="lg-amt num">${amount}</span>
          <span class="lg-psf num">${esc(row.perSquareFoot ?? "")}</span>
          <span class="lg-pct num">${esc(row.shareOfContract ?? "")}</span>
          <span class="lg-rate num">${esc(rate)}</span>
          <span class="lg-more">${src(row.sourceTone, row.sourceText)}<span class="pill"><span class="pill-open">Open</span><span class="pill-close">Close</span></span></span>
        </button>
        <div class="lg-lines" id="${esc(sc.domId)}-lines">${
          sc.kind === "element" ? `\n          <p class="ln-sum tier-detail">Together, between ${usd(sc.low)} and ${usd(sc.high)}, likely ${usd(sc.likely)}.</p>` : ""
        }${sc.lines.map(lineDetail).join("")}${
          sc.unpriced.length > 0 ? `\n          <p class="ln-sub">Unpriced</p>${sc.unpriced.map(unpricedRow).join("")}` : ""
        }
        </div>
      </div>`;
}

function sectionLedger(page: BudgetPage): string {
  const { money, headline } = page;
  return `
<section class="sheet sheet--ledger" id="where-the-money-is" data-el="section:where-the-money-is" data-sc-act="flow" data-sc-verify-state="ledger:-1:0">
  <div class="sheet-hd">
    <h1 class="sheet-h">The Ledger</h1>
    <p class="sheet-sub">In the order the trades build it. Each row draws its layer on the section. Open any row to see its lines and where each figure came from.</p>
  </div>
  <div class="lg" role="table" aria-label="The Ledger">
    <div class="lg-row lg-cols" role="row">
      <span class="lg-div">Div</span>
      <span class="lg-name">Item</span>
      <span class="lg-amt">Amount</span>
      <span class="lg-psf">$/SF</span>
      <span class="lg-pct">%</span>
    </div>
    <div class="lens" data-lens data-open="false" aria-live="polite" aria-label="The current row"></div>${page.ledger.map(ledgerRow).join("")}
    ${
      money.ownerScopes.length > 0
        ? `
    <div class="lg-foot lg-foot--quiet tier-detail" data-el="total:trade-cost">
      <span>All Trades, Owner-Direct Included <span class="lg-foot-range num">${usd(headline.tradeCost.low)} to ${usd(headline.tradeCost.high)}</span></span>
      <span class="num">${usd(headline.tradeCost.likely)}</span>
    </div>`
        : ""
    }
  </div>
</section>`;
}

// --- 4. Proven: the section complete, the count beside it -------------------------------------------

function sectionProven(page: BudgetPage): string {
  const c = page.restsOn;
  const d = page.drawing;
  const named = c.jobs.filter((j) => j.name !== null);
  const share = (s: number) => `<span class="count-share tier-detail">, ${percentOf(s)} of trade cost</span>`;
  return `
<section class="sheet sheet--proven" id="what-this-rests-on" data-el="section:what-this-rests-on" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">Proven</h1>
    <p class="sheet-sub">The section complete. Full ink is priced from Kulka's completed jobs. The lighter ink is priced from Kulka's stated rates.</p>
  </div>
  <div class="proven-rail">
    <p class="count" data-el="count:from-kulka-jobs"><b class="num">${c.fromKulkaJobs} of ${c.priced}</b> priced lines stand on Kulka's completed jobs${share(c.shares.fromKulkaJobs)}</p>
    <ul class="jobs" data-el="count:source-jobs" aria-label="The jobs behind the figures">${
      named.length > 0
        ? named.map((j) => `\n      <li><i class="dot dot--high" aria-hidden="true"></i><span>${esc(j.name!.replace(/ \(C\d+\)$/, ""))}</span><span class="jobs-n tier-detail">Behind ${j.lines} priced ${j.lines === 1 ? "line" : "lines"}</span></li>`).join("")
        : `\n      <li><i class="dot dot--high" aria-hidden="true"></i><span>${c.jobs.length} Kulka ${c.jobs.length === 1 ? "job stands" : "jobs stand"} behind the figures</span></li>`
    }
    </ul>
    <ul class="key" aria-label="Ink">
      <li><span class="key-ink" aria-hidden="true"></span>Priced from Kulka's completed jobs</li>
      <li><span class="key-ink key-ink--light" aria-hidden="true"></span>Priced from Kulka's stated rates${d.lightRows.length ? `: ${esc(d.lightRows.join(", "))}` : ""}</li>
    </ul>
    <p class="count count--sm tier-detail" data-el="count:from-kulka-rates"><b class="num">${c.fromKulkaRates}</b> rest on rates Kulka has stated${share(c.shares.fromKulkaRates)}</p>${
      c.placeholder > 0
        ? `
    <p class="count count--sm tier-detail" data-el="count:placeholder-rates"><b class="num">${c.placeholder}</b> carry a Placeholder Rate until Kulka states one${share(c.shares.placeholder)}</p>`
        : ""
    }
    <p class="rail-p tier-detail">${c.placeholder === 0 ? "No line on this page is a placeholder. " : ""}Every priced line blends Kulka's own cost records, weighted actuals over budgets, with Kulka's stated rates where no record exists yet.</p>
    <dl class="confidence tier-detail">
      <div data-el="count:confidence:high"><dt>${src("high", "High Confidence")}</dt><dd><span class="num">${c.confidence.high}</span> ${c.confidence.high === 1 ? "line" : "lines"}, range 10% each side</dd></div>
      <div data-el="count:confidence:medium"><dt>${src("medium", "Medium Confidence")}</dt><dd><span class="num">${c.confidence.medium}</span> ${c.confidence.medium === 1 ? "line" : "lines"}, range 20% each side</dd></div>
      <div data-el="count:confidence:low"><dt>${src("low", "Low Confidence")}</dt><dd><span class="num">${c.confidence.low}</span> ${c.confidence.low === 1 ? "line" : "lines"}, range 35% each side, held for Kulka's review</dd></div>
    </dl>
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
          <p class="crit-method tier-detail">${esc(k.method)}</p>${k.prices.length ? `\n          <p class="crit-prices tier-detail">Prices ${k.prices.map(esc).join("; ")}.</p>` : ""}
          <p class="crit-why tier-detail">${esc(k.confidenceReason)}</p>
          <dl class="crit-inputs tier-full">${k.inputs.map((i) => `<div><dt>${esc(i.name)}</dt><dd>${esc(i.value)} <span class="basis basis--${i.basis}">${i.basis}</span></dd></div>`).join("")}</dl>
          <ol class="crit-steps tier-full">${k.steps.map((st) => `<li><span>${esc(st.label)}</span><span>${esc(st.result)}</span></li>`).join("")}</ol>${
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
  <div class="crits lg tier-detail">${page.criteria.map(criterionRow).join("")}
  </div>
</section>`;
}

/**
 * The Ledger, Proven and Design and Engineering share one drawing, pinned
 * beside them (above them on a phone), which changes state in place: layers
 * drawing in row by row, then the inks settled with the count beside it,
 * then the criteria called out on it.
 */
function trio(page: BudgetPage, svg: string): string {
  const facts = page.drawing.facts;
  const caption = [`${facts.stories} Stories`, facts.units !== null ? `${wholeNumber(facts.units)} Units` : null, facts.grossArea].filter(Boolean).join(" · ");
  return `
<div class="trio" data-trio data-state="ledger">
  <div class="trio-main">${sectionLedger(page)}
${sectionProven(page)}
${sectionDesign(page)}
  </div>
  <aside class="sheet sheet--dwg" aria-label="The Section">
    <div class="dwg dwg--crop" data-dwg="section">${svg}</div>
    <p class="dwg-cap only-phone"><b>Building Section</b> · ${esc(caption)}</p>
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
          <span class="wf-range num tier-detail">${w.tbd ? "Outside the total until it has a basis" : `${usd(w.low)} to ${usd(w.high)}`}</span>
          <span class="wf-why">${esc(w.basis)}</span>${
            w.plan.length > 0 ? `\n          <ul class="wf-plan tier-full">${w.plan.map((pl) => `<li data-el="${esc(pl.el)}"><span>${esc(pl.label)}</span><span class="num">${usd(pl.amount)}</span></li>`).join("")}</ul>` : ""
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
        <div class="wf-fig" data-el-ref="total:kulka-contract">
          <p class="fig-l" data-fig-label data-label-building="Kulka Contract So Far" data-label-landed="Kulka Contract">Kulka Contract</p>
          <p class="fig fig--beside num" data-fig-running data-trades="${usd(trades.running ?? trades.likely)}" data-landed="${usd(land.likely)}">${usd(land.likely)}</p>
          <p class="wf-landed tier-detail">Likely, between <span class="num">${usd(land.low)}</span> and <span class="num">${usd(land.high)}</span>. ${esc(land.basis)} Total Project Cost, with what the owner buys direct, between <span class="num">${usd(page.headline.totalProjectCost.low)}</span> and <span class="num">${usd(page.headline.totalProjectCost.high)}</span>.</p>
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

// --- 7. What Is In, and What Is Not; Notes ---------------------------------------------------------------

/** The answer that decided a gate at every tier; the question as asked at Full (LA-1309). */
function decided(row: GateRow): string {
  return row.decidedBy
    .map((d) => `<span class="tier-full">${esc(d.question ?? d.gate)}</span> <strong>${esc(d.answer)}</strong>`)
    .join(" · ");
}

function gateList(rows: GateRow[], cls = ""): string {
  return `<ul class="plain${cls}">${rows.map((x) => `<li${elAttr(x.el)}><span>${esc(x.label)}</span><span class="answer">${decided(x)}</span></li>`).join("")}</ul>`;
}

function sectionGates(page: BudgetPage): string {
  const g = page.gates;
  return `
<section class="sheet gates" id="what-is-in" data-el="section:what-is-in" data-sc-act="flow">
  <div class="sheet-hd">
    <h1 class="sheet-h">What Is In, and What Is Not</h1>
  </div>
  <div class="gates-grid" data-sc-in data-sc-stagger="40">
    <div class="gates-col">
      <h2 class="gates-h">In the Number</h2>
      <p class="sub">The base building and site, plus everything your answers brought in.</p>
      ${gateList(g.answeredYes)}${
        g.assumedPresent.length > 0
          ? `
      <h2 class="gates-h tier-detail">Assumed Present</h2>
      <p class="sub tier-detail">Nobody answered the question behind these, so the budget carries them.</p>
      ${gateList(g.assumedPresent, " tier-detail")}`
          : ""
      }
    </div>
    <div class="gates-col">
      <h2 class="gates-h">Not in This Job</h2>
      <p class="sub">Removed from the total by an answer.</p>
      ${gateList(g.notInThisJob)}
    </div>
    <div class="gates-col">
      <h2 class="gates-h">Waiting on an Answer</h2>
      <p class="sub">Outside the total until you decide.</p>
      ${gateList(g.waiting)}${
        g.unpriced.length > 0
          ? `
      <h2 class="gates-h tier-detail">In Scope, No Rate Yet</h2>
      <p class="sub tier-detail">${g.unpriced.length} ${g.unpriced.length === 1 ? "item" : "items"} your answers brought in that Kulka has not rated. Each is kept out of the total rather than guessed.</p>
      <ul class="plain tier-detail">${g.unpriced.map((x) => `<li><span>${esc(x.label)}</span><span class="answer">${x.broughtInBy ? `Brought in by ${esc(x.broughtInBy)}` : "In scope"}</span></li>`).join("")}</ul>`
          : ""
      }
    </div>
  </div>
  <h2 class="sheet-h sheet-h--notes" id="notes">Notes and Clarifications</h2>
  <ol class="notes" data-sc-in data-sc-stagger="15">${page.notes
    .map(
      (n) => `
    <li class="note${tierClass(n.tier)}" data-el="${esc(n.el)}" value="${n.number}"><span class="note-n num">${n.number}</span><span class="note-text">${esc(n.text)}</span></li>`,
    )
    .join("")}
  </ol>${
    page.parameters.length > 0
      ? `
  <div class="parameters tier-full">
    <h2 class="gates-h">Pricing Parameters This Budget Ran With</h2>
    <table class="params">
      <thead><tr><th scope="col">Parameter</th><th scope="col" class="right">Value</th><th scope="col">Set By</th><th scope="col">Date</th></tr></thead>
      <tbody>${page.parameters
        .map(
          (p) => `
        <tr data-el="${esc(p.el)}"><td>${esc(p.label)}</td><td class="right num">${esc(p.value)}</td><td>${esc(p.recordedBy)}</td><td>${esc(p.recordedAt)}</td></tr>`,
        )
        .join("")}
      </tbody>
    </table>${page.markupWords ? `\n    <p class="sub">${esc(page.markupWords)}</p>` : ""}
  </div>`
      : ""
  }
</section>`;
}

// --- 8. What Happens Next --------------------------------------------------------------------------------------

function record(page: BudgetPage): string {
  const r = page.record;
  const h = page.headline;
  return `
  <dl class="record tier-detail">
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
    <li><b>Confirm the facts.</b> Read What You Told Us. If a fact is wrong, tell Kulka and the budget is repriced from the corrected fact.</li>${
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
 * The stored PDF is the Detail tier with a Full appendix, because paper cannot
 * switch (LA-1309 decision 4). Detail is the body. The appendix carries what
 * only Full adds, grouped by kind, and points back at the body by label: the
 * body already holds every element's id, so the appendix holds none.
 */
function appendix(page: BudgetPage): string {
  const scopes = [...page.money.scopes, ...page.money.ownerScopes];
  const priced = scopes.filter((sc) => sc.lines.length > 0);
  const planned = page.waterfall.filter((w) => w.plan.length > 0);
  const asked = [...page.gates.answeredYes, ...page.gates.notInThisJob, ...page.gates.waiting, ...page.gates.assumedPresent].filter((g) =>
    g.decidedBy.some((d) => d.question),
  );
  const parts: string[] = [];

  parts.push(`
    <div class="appx">
      <h3>Where Each Fact Came From</h3>
      <ul class="plain">${page.project.facts.map((f) => `<li><span>${esc(f.label)}: ${esc(f.value)}</span><span class="answer">${esc(f.basisWords)}</span></li>`).join("")}</ul>
    </div>`);

  if (priced.length > 0) {
    parts.push(`
    <div class="appx">
      <h3>How Each Line Was Priced</h3>${priced
        .map(
          (sc) => `
      <div class="appx-group"><h4>${esc(sc.label)}</h4>${sc.lines
        .map(
          (line) => `
        <div class="appx-line">
          <p class="appx-label">${esc(line.label)}</p>
          <p>${esc(line.basis)}</p>${
            line.comparables.length > 0
              ? `
          <ul class="plain">${line.comparables.map((c) => `<li><span>${esc(c.kindWords)}: ${esc(c.jobs)}, ${esc(c.rate)}</span><span class="answer">Weight ${c.weight}, ${esc(c.recordedAt)}</span></li>`).join("")}</ul>`
              : ""
          }
        </div>`,
        )
        .join("")}
      </div>`,
        )
        .join("")}
    </div>`);
  }

  if (page.criteria.length > 0) {
    parts.push(`
    <div class="appx">
      <h3>How Each Design Criterion Was Worked</h3>${page.criteria
        .map(
          (k) => `
      <div class="appx-group appx-line"><h4>${esc(k.code)} ${esc(k.label)}: ${esc(k.value)}</h4>
        <dl class="crit-inputs">${k.inputs.map((i) => `<div><dt>${esc(i.name)}</dt><dd>${esc(i.value)} <span class="basis basis--${i.basis}">${i.basis}</span></dd></div>`).join("")}</dl>
        <ol class="crit-steps">${k.steps.map((st) => `<li><span>${esc(st.label)}</span><span>${esc(st.result)}</span></li>`).join("")}</ol>
      </div>`,
        )
        .join("")}
    </div>`);
  }

  if (planned.length > 0) {
    parts.push(`
    <div class="appx">
      <h3>Allocated Resources Plan</h3>${planned
        .map((w) => `
      <div class="appx-group"><h4>${esc(w.label)}</h4>
        <ul class="wf-plan">${w.plan.map((pl) => `<li><span>${esc(pl.label)}</span><span class="num">${usd(pl.amount)}</span></li>`).join("")}</ul>
      </div>`)
        .join("")}
    </div>`);
  }

  if (asked.length > 0) {
    parts.push(`
    <div class="appx">
      <h3>The Questions as Asked</h3>
      <ul class="plain">${asked
        .flatMap((g) => g.decidedBy.filter((d) => d.question).map((d) => `<li><span>${esc(g.label)}: ${esc(d.question ?? "")}</span><span class="answer">${esc(d.answer)}</span></li>`))
        .join("")}</ul>
    </div>`);
  }

  if (page.parameters.length > 0) {
    parts.push(`
    <div class="appx">
      <h3>Pricing Parameters This Budget Ran With</h3>
      <table class="params">
        <thead><tr><th scope="col">Parameter</th><th scope="col" class="right">Value</th><th scope="col">Set By</th><th scope="col">Date</th></tr></thead>
        <tbody>${page.parameters.map((p) => `
          <tr><td>${esc(p.label)}</td><td class="right num">${esc(p.value)}</td><td>${esc(p.recordedBy)}</td><td>${esc(p.recordedAt)}</td></tr>`).join("")}
        </tbody>
      </table>${page.markupWords ? `\n      <p class="sub">${esc(page.markupWords)}</p>` : ""}
    </div>`);
  }

  return `
<section class="sheet appendix" id="appendix" data-el="section:appendix">
  <div class="sheet-hd">
    <h1 class="sheet-h">Appendix: Full Depth</h1>
  </div>
  <p class="lede">What the Full depth of the page adds to the Detail pages, in the order the sections above use.</p>${parts.join("")}
</section>`;
}

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
  /** The printed page: Detail tier with a Full appendix, no chrome, no engine, every id a PDF destination. */
  print?: boolean;
};

/** The whole document for one published budget. */
export function renderBudgetPage(page: BudgetPage, options: RenderOptions = {}): string {
  const print = options.print === true;
  const svg = drawings(page);
  const html = `<!doctype html>
<html lang="en" data-tier="${print ? "detail" : "summary"}"${print ? ' data-print="1"' : ""}>
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
${svg.style}
</head>
<body>${print ? "" : "\n<span data-sc-progress></span>"}${print ? "" : header(page)}
<main id="top">${newerBand(page)}
${sectionNumber(page)}
${sectionProject(page)}
${trio(page, svg.section)}
${sectionWaterfall(page, svg)}
${sectionGates(page)}
${sectionNext(page)}${print ? appendix(page) : ""}
</main>${print ? "" : '\n<script src="/scrollcraft/scrollcraft.js"></script>'}
<script src="/scrollcraft/budget-page.js"></script>
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
