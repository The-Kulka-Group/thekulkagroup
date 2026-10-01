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
  type PricedLine,
  type Scope,
  type Tier,
  type Tone,
  type UnpricedLine,
  type WaterfallRow,
} from "@/lib/rom/presentation";

// LA-1418. The LA-1416 reference page (~/scrollcraft/builds/kulka-budget-page,
// tools/render.mjs), rendered from the presentation model instead of the
// build's own snapshot.json. The markup, class names, ids, tiers, receipt and
// print rules are the reference's, kept byte-close so the vendored engine
// (public/scrollcraft/scrollcraft.js) and the page script
// (public/scrollcraft/budget-page.js, the reference's tools/page.js) drive it
// unchanged. Every figure, label and id comes from the model; nothing here
// prices, words or orders anything.
//
// Where this departs from the reference, it is so every id appears once and
// the tiers match LA-1309's table; each departure is named where it happens.

const esc = (t: string | number): string =>
  String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One `data-el`, or a pointer at the element that holds it. */
const elAttr = (el: string | null, ref: string | null = null): string =>
  el ? ` data-el="${esc(el)}"` : ref ? ` data-el-ref="${esc(ref)}"` : "";

const tierClass = (tier: Tier): string => (tier === "summary" ? "" : ` tier-${tier}`);

const toneWord: Record<Tone, string> = { high: "High", medium: "Medium", low: "Low", none: "None" };
const chip = (tone: Tone | "working", text: string) => `<span class="chip chip--${tone}"><i class="dot" aria-hidden="true"></i>${esc(text)}</span>`;
const chipOf = (c: Chip) => chip(c.tone, c.text);
const confChip = (tone: Tone) => chip(tone, `${toneWord[tone]} Confidence`);
const time = (iso: string) => `<time datetime="${esc(iso)}">${longDate(iso)}</time>`;

// --- 1. Your Number ------------------------------------------------------------------

function stageBar(page: BudgetPage): string {
  return `
<ol class="stages" aria-label="Where this estimate stands">
${page.stages
  .map(
    (st) => `  <li class="stage${st.current ? " is-current" : ""}"${st.current ? ' aria-current="step"' : ""}>
    <span class="stage__name">${esc(st.label)}</span>
    <span class="stage__words">${esc(st.words)}</span>
  </li>`,
  )
  .join("\n")}
</ol>`;
}

function record(page: BudgetPage): string {
  const r = page.record;
  const h = page.headline;
  // Departure: the reference names the run's recorded date; a published page
  // names its issue date. Gross Area and Units take record ids here, because
  // the fact rows below hold fact:grossSquareFeet and fact:unitCount.
  return `
<dl class="record">
  <div><dt>Prepared For</dt><dd data-el="record:prepared-for">${r.preparedFor ? esc(r.preparedFor) : '<span class="missing">Not Named</span>'}</dd></div>
  <div><dt>Prepared By</dt><dd data-el="record:prepared-by">${esc(r.preparedBy)}</dd></div>
  <div><dt>Version</dt><dd data-el="record:version">${r.version}</dd></div>
  <div><dt>Issued</dt><dd data-el="record:issued">${time(r.issuedAt)}</dd></div>${
    h.grossSquareFeet !== null ? `\n  <div><dt>Gross Area</dt><dd data-el="record:gross-area">${wholeNumber(h.grossSquareFeet)} SF</dd></div>` : ""
  }${h.unitCount !== null ? `\n  <div><dt>Units</dt><dd data-el="record:units">${wholeNumber(h.unitCount)}</dd></div>` : ""}${
    h.perSquareFoot ? `\n  <div><dt>Per SF</dt><dd data-el="record:per-sf" title="${esc(h.perSquareFoot.arithmetic)}">${usd(h.perSquareFoot.value)}</dd></div>` : ""
  }${h.perUnit ? `\n  <div><dt>Per Unit</dt><dd data-el="record:per-unit" title="${esc(h.perUnit.arithmetic)}">${usd(h.perUnit.value)}</dd></div>` : ""}
  <div><dt>Figures Valid</dt><dd data-el="record:validity">${r.validityDays ? `${r.validityDays} days from issue` : '<span class="missing">Not Set</span>'}</dd></div>
</dl>`;
}

function sectionNumber(page: BudgetPage): string {
  const h = page.headline;
  const r = page.record;
  return `
<section class="sheet hero" id="your-number" data-el="section:your-number" data-sc-act="flow">
  <div class="wrap">
    <p class="meta">${esc(r.stageLabel)} · Version ${r.version} · Issued ${time(r.issuedAt)}</p>
    <h1 class="title">${esc(page.projectName)}</h1>${r.coverSentence ? `\n    <p class="lede cover" data-el="record:cover">${esc(r.coverSentence)}</p>` : ""}
    <div class="hero__grid">
      <div class="hero__figure">
        <p class="label">Kulka Contract</p>
        <p class="figure figure--xl" data-el="total:kulka-contract">${usd(h.kulkaContract.likely)}</p>
        <p class="range">Likely, between <span data-el="total:kulka-contract:low">${usd(h.kulkaContract.low)}</span> and <span data-el="total:kulka-contract:high">${usd(h.kulkaContract.high)}</span></p>
        <p class="label label--gap">Total Project Cost</p>
        <p class="figure figure--md" data-el="total:total-project-cost">${usd(h.totalProjectCost.likely)}</p>
        <p class="range">Kulka's contract plus what the owner buys direct, between ${usd(h.totalProjectCost.low)} and ${usd(h.totalProjectCost.high)}</p>
      </div>
      <aside class="hero__record" aria-label="The record">${record(page)}</aside>
    </div>
    ${stageBar(page)}
  </div>
</section>`;
}

// --- 2. The Project as We Understood It --------------------------------------------------

function factRow(f: Fact): string {
  return `
    <div class="fact${tierClass(f.tier)}" data-el="${esc(f.el)}">
      <dt>${esc(f.label)}</dt>
      <dd>
        <span class="fact__value">${esc(f.value)}</span>
        ${f.basis === "assumed" ? chip("working", `Assumed, ${f.assumedBy}`) : `<span class="chip chip--quiet tier-detail"><i class="dot" aria-hidden="true"></i>Stated</span>`}
        <span class="fact__basis tier-full">${esc(f.basisWords)}</span>
      </dd>
    </div>`;
}

function sectionProject(page: BudgetPage): string {
  const { project, headline } = page;
  const n = project.assumedCount;
  return `
<section class="sheet" id="the-project" data-el="section:the-project" data-sc-act="flow">
  <div class="wrap">
    <h2>The Project as We Understood It</h2>${
      headline.grossSquareFeet !== null ? `\n    <p class="figure figure--lg" data-el="fact:grossSquareFeet:figure">${wholeNumber(headline.grossSquareFeet)} SF</p>` : ""
    }${project.line ? `\n    <p class="sub">${esc(project.line)}</p>` : ""}
    <p class="lede">What you told Kulka, read back.${n > 0 ? ` ${n} ${n === 1 ? "fact below was" : "facts below were"} set by Kulka's design criteria rather than stated, and each is marked.` : ""}</p>
    <dl class="facts" data-sc-in data-sc-stagger="12">${project.facts.map(factRow).join("")}
    </dl>
  </div>
</section>`;
}

// --- 3. Where the Money Is -----------------------------------------------------------------

function comparableRows(line: PricedLine): string {
  return line.comparables
    .map(
      (c) => `
          <li class="cmp" data-el="${esc(c.el)}">
            <span class="cmp__kind">${esc(c.kindWords)}</span>
            <span class="cmp__job">${esc(c.jobs)}</span>
            <span class="cmp__rate num">${esc(c.rate)}</span>
            <span class="cmp__weight tier-full">Weight ${c.weight}</span>
            <span class="cmp__date tier-full">${esc(c.recordedAt)}</span>
          </li>`,
    )
    .join("");
}

function lineDetail(line: PricedLine): string {
  return `
        <div class="line"${elAttr(line.el)}>
          <div class="line__head">
            <span class="line__label">${esc(line.label)}</span>
            ${chipOf(line.source)}
            <span class="line__likely num">${usd(line.likely)}</span>
          </div>
          <p class="line__range">${usd(line.low)} to ${usd(line.high)}. ${confChip(line.confidence)}</p>
          <ul class="cmps" aria-label="Where the figure came from">${comparableRows(line)}
          </ul>
          <p class="line__basis tier-full">${esc(line.basis)}</p>
        </div>`;
}

function unpricedRow(u: UnpricedLine): string {
  return `
        <div class="line line--unpriced" data-el="${esc(u.el)}">
          <div class="line__head">
            <span class="line__label">${esc(u.label)}</span>
            ${chip("none", "No Rate Yet")}
            <span class="line__likely num missing">Outside the Total</span>
          </div>
        </div>`;
}

function bar(page: BudgetPage, low: number, high: number): string {
  const max = page.money.scaleHigh;
  return `<span class="rbar" aria-hidden="true"><span class="rbar__range" style="left:${((low / max) * 100).toFixed(2)}%;width:${(((high - low) / max) * 100).toFixed(2)}%"></span></span>`;
}

function scopeRow(page: BudgetPage, sc: Scope): string {
  const count = sc.lines.length + sc.unpriced.length;
  return `
    <div class="scope${tierClass(sc.tier)}" id="${esc(sc.domId)}" data-el="${esc(sc.el)}" data-open="false" data-receipt-label="${esc(sc.label)}" data-receipt-amount="${sc.likely}"${sc.ownerDirect ? ' data-receipt-owner="true"' : ""}>
      <button class="scope__row" type="button" aria-expanded="false" aria-controls="${esc(sc.domId)}-lines">
        <span class="scope__label">${esc(sc.label)}${sc.kind === "element" ? ` <span class="scope__count">${count} items</span>` : ""}</span>
        <span class="scope__source">${chipOf(sc.chip)}</span>
        ${bar(page, sc.low, sc.high)}
        <span class="scope__share num tier-detail">${sc.share === null ? "" : percentOf(sc.share)}</span>
        <span class="scope__likely num">${usd(sc.likely)}</span>
        <span class="scope__range num tier-detail">${usd(sc.low)} to ${usd(sc.high)}</span>
      </button>
      <div class="scope__lines" id="${esc(sc.domId)}-lines">${sc.lines.map(lineDetail).join("")}${sc.unpriced.map(unpricedRow).join("")}
      </div>
    </div>`;
}

/** Departure: the reference has no By Division view. It shows at Detail, below By Scope, when the model carries one. */
function divisionLedger(page: BudgetPage): string {
  const divisions = page.money.divisions;
  if (!divisions) return "";
  return `
    <h3 class="ledger__h3 tier-detail">By Division</h3>
    <div class="ledger ledger--division tier-detail">${divisions
      .map(
        (d) => `
      <div class="scope" id="division-${esc(d.division)}" data-el="${esc(d.el)}" data-open="false">
        <button class="scope__row" type="button" aria-expanded="false" aria-controls="division-${esc(d.division)}-lines">
          <span class="scope__label">${esc(d.label)} <span class="scope__count">${d.items.length} items</span></span>
          <span class="scope__source"></span>
          ${bar(page, d.low, d.high)}
          <span class="scope__likely num">${usd(d.likely)}</span>
          <span class="scope__range num tier-detail">${usd(d.low)} to ${usd(d.high)}</span>
        </button>
        <div class="scope__lines" id="division-${esc(d.division)}-lines">${d.items
          .map(
            (item) => `
          <div class="line${item.likely === null ? " line--unpriced" : ""}" data-el="${esc(item.el)}">
            <div class="line__head">
              <span class="line__label">${esc(item.label)}</span>
              <span class="line__likely num${item.likely === null ? " missing" : ""}">${item.likely === null ? "Outside the Total" : usd(item.likely)}</span>
            </div>
          </div>`,
          )
          .join("")}
        </div>
      </div>`,
      )
      .join("")}
      <div class="ledger__foot" data-el-ref="total:trades">
        <span>Trades, Kulka's Contract</span>
        <span class="num">${usd(page.money.trades.likely)}</span>
      </div>
    </div>`;
}

function sectionMoney(page: BudgetPage): string {
  const { money, headline } = page;
  const tradeLikely = money.trades.likely;
  const share = (likely: number) => (tradeLikely > 0 ? likely / tradeLikely : 0);
  const rest = money.rest;
  return `
<section class="sheet money" id="where-the-money-is" data-el="section:where-the-money-is" data-sc-act="flow">
  <div class="wrap">
    <h2>Where the Money Is</h2>
    <p class="label">Trade Cost</p>
    <p class="figure figure--lg" data-el="total:trade-cost">${usd(headline.tradeCost.likely)}</p>
    <p class="range">Every scope below, before General Requirements, General Conditions, fee and insurance. Between ${usd(headline.tradeCost.low)} and ${usd(headline.tradeCost.high)}.</p>
    <div class="strip" aria-label="Share of trade cost by scope">${money.scopes
      .filter((x) => x.tier === "summary")
      .map((x) => `<span class="strip__seg" style="width:${(share(x.likely) * 100).toFixed(2)}%" title="${esc(x.label)}, ${percentOf(share(x.likely))}"></span>`)
      .join("")}${
      rest
        ? `<span class="strip__seg strip__seg--rest" style="width:${(share(rest.likely) * 100).toFixed(2)}%" title="${rest.count} more scopes, ${percentOf(share(rest.likely))}"></span>`
        : ""
    }</div>
    <p class="lede">Largest first. Open any scope to see the lines inside it and where each figure came from.</p>
    <div class="ledger" data-sc-in data-sc-stagger="18">${money.scopes.map((sc) => scopeRow(page, sc)).join("")}${
      rest
        ? `
      <div class="scope scope--rest tier-summary" data-el="scopes:rest" data-receipt-label="${rest.count} More Scopes" data-receipt-amount="${rest.likely}">
        <button class="scope__row" type="button" data-tier-to="detail">
          <span class="scope__label">${rest.count} More Scopes <span class="scope__count">Switch to Detail to read every scope</span></span>
          <span class="scope__source"></span>
          <span class="rbar rbar--none" aria-hidden="true"></span>
          <span class="scope__likely num">${usd(rest.likely)}</span>
        </button>
      </div>`
        : ""
    }
      <div class="ledger__foot" data-el="total:trades">
        <span>Trades, Kulka's Contract</span>
        <span class="num">${usd(tradeLikely)}</span>
      </div>${
        money.ownerScopes.length > 0
          ? `
      <h3 class="ledger__h3">Bought by the Owner</h3>${money.ownerScopes.map((sc) => scopeRow(page, sc)).join("")}
      <div class="ledger__foot" data-el="total:owner-direct">
        <span>Owner-Direct, Outside Kulka's Contract</span>
        <span class="num">${usd(money.ownerDirect.likely)}</span>
      </div>`
          : ""
      }
    </div>${divisionLedger(page)}
  </div>
</section>`;
}

// --- The receipt (signature move). Fixed on screen, in flow under print. ---------------

function receipt(page: BudgetPage): string {
  const h = page.headline;
  return `
<aside class="receipt" id="receipt" aria-label="What you have read so far" data-sc-verify-state="0:0:hidden" data-state="hidden">
  <button class="receipt__toggle" type="button" aria-expanded="false" aria-controls="receipt-body">
    <span class="receipt__title">Read So Far</span>
    <span class="receipt__count" data-receipt-count>No Scopes Yet</span>
    <span class="receipt__running num" data-receipt-running>$0</span>
  </button>
  <div class="receipt__body" id="receipt-body">
    <ol class="receipt__lines" data-receipt-lines aria-live="off"></ol>
    <div class="receipt__total" data-receipt-total>
      <span>Trades So Far</span>
      <span class="num" data-receipt-running-2>$0</span>
    </div>
  </div>
  <div class="receipt__foot">
    <div><span>Kulka Contract</span><span class="num">${usd(h.kulkaContract.likely)}</span></div>
    <div><span>Total Project Cost</span><span class="num">${usd(h.totalProjectCost.likely)}</span></div>
  </div>
  <p class="receipt__print">Printed as read: every scope in order, then the trades total the waterfall starts from.</p>
</aside>`;
}

// --- 4. What This Rests On ----------------------------------------------------------------

function sectionRests(page: BudgetPage): string {
  const c = page.restsOn;
  const shareWords = (share: number) => `<span class="count__share tier-detail">, ${percentOf(share)} of trade cost</span>`;
  const named = c.jobs.filter((j) => j.name !== null);
  // Departure: LA-1309 asks for each group's share of the number, and the jobs by name at Detail.
  return `
<section class="sheet rests" id="what-this-rests-on" data-el="section:what-this-rests-on" data-sc-act="flow">
  <div class="wrap">
    <h2>What This Number Rests On</h2>
    <div class="counts">
      <div class="count" data-el="count:from-kulka-jobs">
        <p class="figure figure--lg num" data-sc-count="0 ${c.fromKulkaJobs}" data-sc-count-at="0.04 0.2">${c.fromKulkaJobs}</p>
        <p class="count__words">of ${c.priced} priced lines come from Kulka's completed jobs${shareWords(c.shares.fromKulkaJobs)}</p>
      </div>
      <div class="count" data-el="count:from-kulka-rates">
        <p class="figure figure--md num" data-sc-count="0 ${c.fromKulkaRates}" data-sc-count-at="0.06 0.22">${c.fromKulkaRates}</p>
        <p class="count__words">rest on rates Kulka has stated${shareWords(c.shares.fromKulkaRates)}</p>
      </div>${
        c.placeholder > 0
          ? `
      <div class="count" data-el="count:placeholder-rates">
        <p class="figure figure--md num" data-sc-count="0 ${c.placeholder}" data-sc-count-at="0.07 0.23">${c.placeholder}</p>
        <p class="count__words">carry a Placeholder Rate until Kulka states one${shareWords(c.shares.placeholder)}</p>
      </div>`
          : ""
      }
      <div class="count" data-el="count:source-jobs">
        <p class="figure figure--md num" data-sc-count="0 ${c.jobs.length}" data-sc-count-at="0.08 0.24">${c.jobs.length}</p>
        <p class="count__words">Kulka jobs stand behind the figures</p>
      </div>
    </div>
    <p class="lede">${c.placeholder === 0 ? "No line on this page is a placeholder. " : ""}Every priced line blends Kulka's own cost records, weighted actuals over budgets, with Kulka's stated rates where no record exists yet.</p>${
      named.length > 0
        ? `
    <ul class="plain tier-detail" aria-label="The jobs behind the figures">${named
      .map((j) => `<li><span>${esc(j.name!)}</span><span class="answer">Behind ${j.lines} priced ${j.lines === 1 ? "line" : "lines"}</span></li>`)
      .join("")}</ul>`
        : ""
    }
    <dl class="confidence" data-sc-in data-sc-stagger="50">
      <div data-el="count:confidence:high"><dt>${confChip("high")}</dt><dd><span class="num">${c.confidence.high}</span> ${c.confidence.high === 1 ? "line" : "lines"}, range 10% each side</dd></div>
      <div data-el="count:confidence:medium"><dt>${confChip("medium")}</dt><dd><span class="num">${c.confidence.medium}</span> ${c.confidence.medium === 1 ? "line" : "lines"}, range 20% each side</dd></div>
      <div data-el="count:confidence:low"><dt>${confChip("low")}</dt><dd><span class="num">${c.confidence.low}</span> ${c.confidence.low === 1 ? "line" : "lines"}, range 35% each side, held for Kulka's review</dd></div>
    </dl>
  </div>
</section>`;
}

// --- 5. Design and Engineering, as Planned -------------------------------------------------

function criterionCard(k: Criterion): string {
  return `
      <article class="criterion" data-el="${esc(k.el)}">
        <header class="criterion__head">
          <span class="criterion__code">${esc(k.code)}</span>
          <h3 class="criterion__label">${esc(k.label)}</h3>
          ${k.settled ? chip("high", "Settled") : chip("working", "Planning Assumption")}
        </header>
        <p class="criterion__value">${esc(k.value)}</p>
        <p class="criterion__method tier-detail">${esc(k.method)}</p>
        <p class="criterion__prices tier-detail">Prices ${k.prices.map(esc).join("; ")}.</p>
        <p class="criterion__why tier-detail">${esc(k.confidenceReason)}</p>
        <dl class="criterion__inputs tier-full">${k.inputs.map((i) => `<div><dt>${esc(i.name)}</dt><dd>${esc(i.value)} <span class="basis basis--${i.basis}">${i.basis}</span></dd></div>`).join("")}</dl>
        <ol class="criterion__steps tier-full">${k.steps.map((st) => `<li><span>${esc(st.label)}</span><span>${esc(st.result)}</span></li>`).join("")}</ol>
        ${k.corrected ? `<p class="criterion__corrected">Corrected by Kulka, ${esc(k.corrected.on)}: ${esc(k.corrected.reason)}</p>` : ""}
      </article>`;
}

function sectionDesign(page: BudgetPage): string {
  if (page.criteria.length === 0) return "";
  const settled = page.criteria.filter((x) => x.settled).length;
  // Departure: LA-1309's table shows Design and Engineering from Detail on; the reference showed it at Summary.
  return `
<section class="sheet design tier-detail" id="design-and-engineering" data-el="section:design-and-engineering" data-sc-act="flow">
  <div class="wrap">
    <h2>Design and Engineering, as Planned</h2>
    <p class="lede">${page.criteria.length} criteria set what this budget assumes about the building's design. ${settled} ${settled === 1 ? "is" : "are"} settled by code. The rest are planning assumptions until your design team decides them, and each says what it prices.</p>
    <div class="criteria" data-sc-in data-sc-stagger="45">${page.criteria.map(criterionCard).join("")}
    </div>
  </div>
</section>`;
}

// --- 6. From Trades to Total (the peak) ------------------------------------------------------

const cueAt: Record<WaterfallRow["key"], string> = {
  subtotal: "-0.2",
  gr: "0.12",
  gc: "0.17",
  fee: "0.29",
  insurance: "0.41",
  "kulka-contract": "0.52",
  "owner-direct": "0.76",
  "total-project-cost": "0.86",
};

function wfRow(w: WaterfallRow): string {
  const land = w.key === "kulka-contract";
  const total = w.key === "total-project-cost";
  return `
      <div class="wf__row${land ? " wf__row--land" : ""}${total ? " wf__row--total" : ""}${w.key === "subtotal" ? " wf__row--trades" : ""}"${elAttr(w.el, w.elRef)} data-sc-cue="${cueAt[w.key]}" data-wf="${esc(w.key)}">
        <div class="wf__line">
          <span class="wf__label">${w.key === "subtotal" || land || total ? "" : "+ "}${esc(w.label)}</span>
          <span class="wf__amount num">${w.tbd ? '<span class="missing">TBD</span>' : usd(w.likely)}</span>
        </div>
        <p class="wf__range num tier-detail">${w.tbd ? "Outside the total until it has a basis" : `${usd(w.low)} to ${usd(w.high)}`}</p>
        <p class="wf__basis">${esc(w.basis)}</p>
        ${w.plan.length > 0 ? `<ul class="wf__plan tier-full">${w.plan.map((pl) => `<li data-el="${esc(pl.el)}"><span>${esc(pl.label)}</span><span class="num">${usd(pl.amount)}</span></li>`).join("")}</ul>` : ""}
      </div>`;
}

function sectionWaterfall(page: BudgetPage): string {
  return `
<section class="band" id="from-trades-to-total" data-el="section:from-trades-to-total" data-sc-act="pin" data-sc-span="3.2">
  <div data-sc-stage class="wf">
    <div class="wf__inner">
      <h2 class="wf__h2">From Trades to Total</h2>${page.waterfall.map(wfRow).join("")}
    </div>
  </div>
</section>`;
}

// --- 7. What Is In, and What Is Not; Notes -------------------------------------------------------

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
  <div class="wrap">
    <h2>What Is In, and What Is Not</h2>
    <div class="gates__grid" data-sc-in data-sc-stagger="40">
      <div class="gates__col">
        <h3>In the Number</h3>
        <p class="sub">The base building and site, plus everything your answers brought in.</p>
        ${gateList(g.answeredYes)}${
          g.assumedPresent.length > 0
            ? `
        <h3 class="tier-detail">Assumed Present</h3>
        <p class="sub tier-detail">Nobody answered the question behind these, so the budget carries them.</p>
        ${gateList(g.assumedPresent, " tier-detail")}`
            : ""
        }
      </div>
      <div class="gates__col">
        <h3>Not in This Job</h3>
        <p class="sub">Removed from the total by an answer.</p>
        ${gateList(g.notInThisJob)}
      </div>
      <div class="gates__col">
        <h3>Waiting on an Answer</h3>
        <p class="sub">Outside the total until you decide.</p>
        ${gateList(g.waiting)}${
          g.unpriced.length > 0
            ? `
        <h3 class="tier-detail">In Scope, No Rate Yet</h3>
        <p class="sub tier-detail">${g.unpriced.length} ${g.unpriced.length === 1 ? "item" : "items"} your answers brought in that Kulka has not rated. Each is kept out of the total rather than guessed.</p>
        <ul class="plain tier-detail">${g.unpriced.map((x) => `<li><span>${esc(x.label)}</span><span class="answer">${x.broughtInBy ? `Brought in by ${esc(x.broughtInBy)}` : "In scope"}</span></li>`).join("")}</ul>`
            : ""
        }
      </div>
    </div>
    <h2 class="h2--notes" id="notes">Notes and Clarifications</h2>
    <ol class="notes" data-sc-in data-sc-stagger="15">${page.notes
      .map(
        (n) => `
      <li class="note${tierClass(n.tier)}" data-el="${esc(n.el)}" value="${n.number}"><span class="note__n num">${n.number}</span><span class="note__text">${esc(n.text)}</span></li>`,
      )
      .join("")}
    </ol>${
      page.parameters.length > 0
        ? `
    <div class="parameters tier-full">
      <h3>Pricing Parameters This Budget Ran With</h3>
      <table class="params">
        <thead><tr><th scope="col">Parameter</th><th scope="col" class="right">Value</th><th scope="col">Set By</th><th scope="col">Date</th></tr></thead>
        <tbody>${page.parameters
          .map(
            (p) => `
          <tr data-el="${esc(p.el)}"><td>${esc(p.label)}</td><td class="right num">${esc(p.value)}</td><td>${esc(p.recordedBy)}</td><td>${esc(p.recordedAt)}</td></tr>`,
          )
          .join("")}
        </tbody>
      </table>${page.markupWords ? `\n      <p class="sub">${esc(page.markupWords)}</p>` : ""}
    </div>`
        : ""
    }
  </div>
</section>`;
}

// --- 8. What Happens Next -------------------------------------------------------------------------

function sectionNext(page: BudgetPage): string {
  const open = page.next.openQuestions;
  const nextStage = page.next.nextStage;
  const r = page.record;
  return `
<section class="sheet next" id="what-happens-next" data-el="section:what-happens-next" data-sc-act="flow">
  <div class="wrap">
    <h2>What Happens Next</h2>
    <ol class="steps" data-sc-cue="0.02">
      <li><strong>Confirm the facts.</strong> Read The Project as We Understood It. If a fact is wrong, tell Kulka and the budget is repriced from the corrected fact.</li>${
        open.length > 0
          ? `
      <li><strong>Answer the open ${open.length === 1 ? "item" : "items"}.</strong> ${open.map(esc).join(" ")} ${open.length === 1 ? "An answer moves" : "Answers move"} what waits on it into, or out of, the number.</li>`
          : ""
      }${nextStage ? `\n      <li><strong>Reprice at ${esc(nextStage.label)}.</strong> ${esc(nextStage.words)}</li>` : ""}
    </ol>
    <p class="reach">To reach Kulka, reply to the estimator who sent you this link.</p>
    <footer class="foot">
      <span class="wordmark">Kulka</span>
      <span class="foot__meta">${esc(page.projectName)} · Version ${r.version} · Issued ${longDate(r.issuedAt)} · Prepared by ${esc(r.preparedBy)}</span>
    </footer>
  </div>
</section>`;
}

// --- Chrome ------------------------------------------------------------------------------------------

function chrome(page: BudgetPage): string {
  return `
<header class="bar" id="bar">
  <div class="bar__top">
    <a class="wordmark" href="#your-number">Kulka</a>
    <span class="bar__project">${esc(page.projectName)}</span>
    <div class="tiers" role="group" aria-label="Depth">
      <button type="button" class="tier" data-tier="summary" aria-pressed="true">Summary</button>
      <button type="button" class="tier" data-tier="detail" aria-pressed="false">Detail</button>
      <button type="button" class="tier" data-tier="full" aria-pressed="false">Full</button>
    </div>
  </div>
  <nav class="bar__index" aria-label="Sections">
    <ul>${page.sections
      .filter((s) => s.id !== "design-and-engineering" || page.criteria.length > 0)
      .map((s) => `<li${s.tier === "summary" ? "" : ` class="tier-${s.tier}"`}><a href="#${s.id}" data-index="${s.id}">${esc(s.indexLabel)}</a></li>`)
      .join("")}</ul>
    <span class="pill" title="Lines with a figure in the total">${page.pricedLineCount} Priced Lines</span>
  </nav>
</header>
`;
}

/** A superseded page keeps its figures under a band naming the newer version (LA-1309 decision 3). */
function newerBand(page: BudgetPage): string {
  if (!page.newer) return "";
  return `
<p class="superseded" role="note">Version ${page.newer.version} replaces this budget. <a href="${esc(page.newer.href)}">Open Version ${page.newer.version}</a></p>`;
}

// --- Print (LA-1420) -----------------------------------------------------------------------------

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
      <div class="appx__group"><h4>${esc(sc.label)}</h4>${sc.lines
        .map(
          (line) => `
        <div class="appx__line">
          <p class="appx__label">${esc(line.label)}</p>
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
      <div class="appx__group appx__line"><h4>${esc(k.code)} ${esc(k.label)}: ${esc(k.value)}</h4>
        <dl class="criterion__inputs">${k.inputs.map((i) => `<div><dt>${esc(i.name)}</dt><dd>${esc(i.value)} <span class="basis basis--${i.basis}">${i.basis}</span></dd></div>`).join("")}</dl>
        <ol class="criterion__steps">${k.steps.map((st) => `<li><span>${esc(st.label)}</span><span>${esc(st.result)}</span></li>`).join("")}</ol>
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
      <div class="appx__group"><h4>${esc(w.label)}</h4>
        <ul class="wf__plan">${w.plan.map((pl) => `<li><span>${esc(pl.label)}</span><span class="num">${usd(pl.amount)}</span></li>`).join("")}</ul>
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
  <div class="wrap">
    <h2>Appendix: Full Depth</h2>
    <p class="lede">What the Full depth of the page adds to the Detail pages, in the order the sections above use.</p>${parts.join("")}
  </div>
</section>`;
}

/**
 * Names every `data-el` element as a PDF destination. An element with no id
 * takes its `data-el` as its id. One that has an id already (a section, a
 * scope) gets an empty marker inside it carrying the `data-el`. Chromium
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
  const html = `<!doctype html>
<html lang="en" data-tier="${print ? "detail" : "summary"}"${print ? ' data-print="1"' : ""}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${esc(page.documentTitle)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='%231D1D1F'/><text x='16' y='22' text-anchor='middle' font-family='Open Sans, Arial, sans-serif' font-weight='800' font-size='18' fill='white'>K</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/scrollcraft/scrollcraft.css">
<link rel="stylesheet" href="/scrollcraft/budget-page.css">
</head>
<body>${print ? "" : "\n<span data-sc-progress></span>"}${print ? "" : chrome(page)}
<main id="top">${newerBand(page)}
${sectionNumber(page)}
${sectionProject(page)}
${sectionMoney(page)}
${receipt(page)}
${sectionRests(page)}
${sectionDesign(page)}
${sectionWaterfall(page)}
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
  <div class="wrap">
    <p class="meta">The Kulka Group</p>
    <h1 class="title">This budget was withdrawn</h1>
    <p class="lede">Version ${version} is no longer open. Ask ${esc(who)} for the current figures.</p>
  </div>
</main>
</body>
</html>
`;
}
