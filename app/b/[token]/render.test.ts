import { PARAMETER_NAMES } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { presentBudget, rateUsd, usd } from "@/lib/rom/presentation";
import { buildPrintJob } from "@/lib/rom/published-pdf";
import { DIAGRAM_LINE, LAYERS } from "@/lib/rom/section";
import { estimatedPublication, referencePage, referencePublication } from "@/test/fixtures/published-budget";

import * as renderModule from "./render";
import { renderBudgetPage } from "./render";

// LA-1418, LA-1459. The app's page against the LA-1416 reference page, from
// the same run: the same sections in the same order, Version 1's data-el ids
// kept, and every figure on the page traceable to the model. The markup is
// the approved frames' (LA-1456), so what is compared is ids and figures,
// never whitespace.

const page = () => renderBudgetPage(presentBudget(referencePublication()));
const estimated = () => renderBudgetPage(presentBudget(estimatedPublication()));

const idsOf = (html: string) => [...html.matchAll(/data-el="([^"]*)"/g)].map((m) => m[1]);
const moneyOf = (html: string) => [...html.matchAll(/\$[0-9](?:[0-9,]*[0-9])?(?:\.[0-9]{2})?/g)].map((m) => m[0]);

/** What a client reads: the text of the body and the words in titles and labels, never markup or script paths. */
function clientText(html: string): string {
  const body = html.slice(html.indexOf("<body>"));
  const attributes = [...body.matchAll(/(?:title|aria-label)="([^"]*)"/g)].map((m) => m[1]);
  const text = body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return [text, ...attributes].join("\n");
}

describe("the rendered page against the reference", () => {
  it("prints the reference's sections in the reference's order", () => {
    const sections = [...page().matchAll(/<section[^>]*id="([^"]*)"/g)].map((m) => m[1]);

    // LA-1478: Proven is cut. LA-1558: the opening hands off to the Schedule
    // of Values and Design and Engineering, then the letter and Project Basis.
    const rest = referencePage.sections.slice(1).filter((id) => id !== "what-this-rests-on");
    const sheets = ["where-the-money-is", "design-and-engineering"];
    expect(sections).toEqual([referencePage.sections[0], ...sheets, "letter", ...rest.filter((id) => !sheets.includes(id))]);
  });

  it("carries Version 1's element ids, each once", () => {
    const html = page();
    const ids = idsOf(html);
    const notComparable = (id: string) => !id.includes(":comparable:");

    // The departures, each so an id names one element (see render.ts):
    // the run's recorded date is the issue date on a published page; the
    // record's Gross Area and Units no longer reuse the fact rows' ids; a
    // parameter's id is a slug, so no engine parameter key reaches the page.
    // The reference printed the engine snapshot hash in the record; a client
    // has no use for it, so the page leaves it out. LA-1459: the Summary
    // fold (scopes:rest) is gone, because the ledger shows every row so the
    // section can be drawn row by row; the foot names the
    // project (record:project), as the approved close does. LA-1478: Proven
    // and its counts are cut. LA-1483: the ledger's comparable rows, the
    // sourcing line, the parameters that name past jobs, and the note that
    // splits lines off from past jobs are cut, so their ids are not expected.
    const renamed = (id: string) =>
      id === "record:recorded" ? "record:issued" : id.startsWith("parameter:") ? `parameter:${id.slice(10).replace(/[._]/g, "-")}` : id;
    const proven = (id: string) => id === "section:what-this-rests-on" || id.startsWith("count:");
    const pastJobParameters = new Set(["weight-actuals", "weight-proest-budget", "weight-reviewed-judgment", "flag-high-min-comparables", "flag-medium-min-comparables"]);
    // LA-1488: a note's id comes from its words. The reference's `note:<n>` ids are positions, so the
    // reference's notes are swapped for the model's ids, which are the ones the page now prints.
    const modelNotes = presentBudget(referencePublication()).notes.map((n) => n.el);
    const referenceNote = (id: string) => id.startsWith("note:");
    const cutParameter = (id: string) => id.startsWith("parameter:") && pastJobParameters.has(renamed(id).slice(10));
    const clientFacing = (id: string) => notComparable(id) && id !== "record:snapshot" && id !== "scopes:rest" && !proven(id) && !referenceNote(id) && !cutParameter(id);
    // LA-1504: the ledger is By Division. An element's row gives way to its
    // division's, and a scope decision moves from What Is In to its division,
    // or stays off the page when its answer already reads in Project Basis.
    const model = presentBudget(referencePublication());
    const divisionIds = model.divisions.flatMap((d) => [
      d.el,
      ...(d.items.length > 0 ? [`confidence:${d.division}`] : []),
      ...d.items.flatMap((i) => [i.el, ...i.basis.map((b) => b.el), ...i.includes.map((x) => x.el), ...i.excludes.map((x) => x.el)]),
      ...d.supporting.map((u) => u.el),
      ...d.raise.map((r) => r.el),
      ...Object.values(d.decisions).flatMap((rows) => rows.map((r) => r.el)),
    ]);
    const regrouped = (id: string) => id.startsWith("element:") || (id.startsWith("gate:") && !divisionIds.includes(id));
    // LA-1532: the pricing parameters are internal and left the client page.
    const dropped = (id: string) => id.startsWith("parameter:");
    // LA-1467: the page opens on a letter, which has its own section id.
    const expected = new Set([
      ...referencePage.dataEl.filter(clientFacing).filter((id) => !regrouped(id) && !dropped(id)).map(renamed),
      "record:gross-area",
      "record:units",
      "record:project",
      "section:letter",
      ...modelNotes,
      ...divisionIds,
    ]);

    expect(new Set(ids.filter(notComparable))).toEqual(expected);
    expect(ids.filter((id) => id.includes(":comparable:"))).toEqual([]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prints every figure the reference printed, and nothing the model does not hold", () => {
    const html = page();
    const model = presentBudget(referencePublication());
    const onPage = new Set(moneyOf(html));

    // Every figure in the model, as the page may print it.
    const held = new Set<string>();
    const figure = (f: { low: number; high: number; likely: number }) => [f.low, f.high, f.likely].forEach((n) => held.add(usd(n)));
    figure(model.headline.kulkaContract);
    figure(model.headline.totalProjectCost);
    figure(model.headline.tradeCost);
    figure(model.money.trades);
    figure(model.money.ownerDirect);
    if (model.headline.perSquareFoot) held.add(usd(model.headline.perSquareFoot.value));
    if (model.headline.perUnit) held.add(usd(model.headline.perUnit.value));
    for (const sc of [...model.money.scopes, ...model.money.ownerScopes]) {
      figure(sc);
      for (const line of sc.lines) {
        figure(line);
        moneyOf(line.basis).forEach((m) => held.add(m));
      }
    }
    for (const row of model.ledger) if (row.perSquareFoot) held.add(row.perSquareFoot);
    // LA-1504: each division's own figure and rate.
    for (const d of model.divisions) {
      figure(d);
      if (d.perSquareFoot) held.add(d.perSquareFoot);
      for (const item of d.items) {
        figure(item);
        // LA-1535: each item's rate in its Basis.
        for (const b of item.basis) moneyOf(b.value).forEach((m) => held.add(m));
        // LA-1558: how the item is priced, and its range on the card, to the nearest $1,000.
        for (const pr of item.pricedAs) moneyOf(pr.rate).forEach((m) => held.add(m));
        [item.low, item.high].forEach((n) => held.add(usd(Math.round(n / 1000) * 1000)));
      }
      [d.low, d.high].forEach((n) => held.add(usd(Math.round(n / 1000) * 1000)));
    }
    // LA-1558: the schedule's markup lines, at their rate per GSF.
    for (const m of model.scheduleMarkups) if (m.perSquareFoot) held.add(m.perSquareFoot);
    for (const w of model.waterfall) {
      figure(w);
      moneyOf(w.basis).forEach((m) => held.add(m));
      if (w.running !== null) held.add(usd(w.running));
      for (const pl of w.plan) held.add(usd(pl.amount));
    }
    for (const n of model.notes) moneyOf(n.text).forEach((m) => held.add(m));
    const strays = [...onPage].filter((m) => !held.has(m));
    expect(strays).toEqual([]);

    // Every figure the reference printed, less the one departure (PR 130
    // review): a comparable's rate prints in the unit the snapshot knows and
    // to the cent under $100, where the reference printed whole dollars per GSF.
    const romLine = new Map(referencePublication().snapshot.rom.lines.map((l) => [l.costCode, l]));
    const referenceRates = new Set(
      [...model.money.scopes, ...model.money.ownerScopes]
        .flatMap((s) => s.lines)
        .flatMap((line) => romLine.get(line.costCode)!.comparables.filter((c) => c.kind !== "reviewed_judgment").map((c) => usd(c.rate))),
    );
    // Two more departures (LA-1459): the Summary fold's own figure, the 27
    // smallest scopes together, went with the fold, and the running receipt's
    // "$0" went with the receipt.
    // LA-1504: an element's range ("together, between") went with the element's row.
    const elementRanges = model.money.scopes.filter((s) => s.kind === "element").flatMap((s) => [usd(s.low), usd(s.high)]);
    // LA-1558: an item's and a line's range prints on its card to the nearest $1,000.
    const cardRanges = model.divisions.flatMap((d) => [d, ...d.items]).flatMap((f) => [usd(f.low), usd(f.high)]);
    const gone = new Set(["$0", usd(6_280_149.5), ...elementRanges, ...cardRanges]);
    // LA-1532: a line or total may print a dollar off the reference, because
    // the rows now carry the rounding so every column adds to its total.
    const dollars = (m: string) => Number(m.replace(/[$,]/g, ""));
    const onPageDollars = [...onPage].map(dollars);
    const withinADollar = (m: string) => onPageDollars.some((n) => Math.abs(n - dollars(m)) <= 1);
    // The largest line, Drywall, takes the few dollars of rounding left over.
    const largest = model.money.scopes[0].lines[0];
    gone.add(usd((largest.low + largest.high) / 2));
    const missing = [...new Set(referencePage.money)].filter((m) => !onPage.has(m) && !referenceRates.has(m) && !gone.has(m) && !withinADollar(m));
    expect(missing).toEqual([]);

    // The figure first appears at display size in From Trades to Total (LA-1467); the letter only names it.
    expect(html).toMatch(/class="fig fig--beside num" data-el="total:kulka-contract"[^>]*>\$20,296,613</);
    expect(html).not.toMatch(/class="fig num"/);
    expect(html).toContain('data-running="$18,650,603"');
    expect(html).toContain('data-running="$19,256,748"');
    expect(html).toContain('data-landed="$20,296,613"');
    for (const d of model.divisions) expect(html, d.title).toContain(`<li class="sov-line${d.ownerDirect ? " sov-line--owner" : ""}" id="division-${d.division}" data-el="${d.el}"`);
    // LA-1504: 09 Finishes, the largest division, as the frames print it.
    expect(html).toContain(">$66.02<");
    expect(html).toContain(">21%<");
  });
});

describe("the section on the page", () => {
  it("draws one section beside the three sheets and a reversed pair at the peak, every layer keyed by a ledger row", () => {
    const html = page();
    const drawings = [...html.matchAll(/<div class="dwg[^"]*" data-dwg="([^"]*)"/g)].map((m) => m[1]);
    expect(drawings).toEqual(["section", "peak", "peak-light"]);
    // The criteria's ids sit on the one section's callouts, once each.
    expect([...html.matchAll(/data-el="criterion:([^"]*)"/g)].map((m) => m[1]).sort()).toEqual(["A-1", "A-2", "E-1", "M-0", "M-1", "S-1", "V-1", "V-2", "V-3"]);
    const ids = [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const layerKeys = new Set([...html.matchAll(/<g data-layer="([^"]*)"/g)].map((m) => m[1]));
    // LA-1504: a division row draws every layer its lines own.
    const rowKeys = new Set([...html.matchAll(/<li class="sov-line[^"]*" id="[^"]*" data-el="[^"]*" data-layers="([^"]*)"/g)].flatMap((m) => m[1].split(" ").filter(Boolean)));
    for (const key of layerKeys) expect(rowKeys.has(key), key).toBe(true);
    for (const key of rowKeys) if (key in LAYERS) expect(layerKeys.has(key), key).toBe(true);
    expect(html.split(DIAGRAM_LINE).length - 1).toBeGreaterThanOrEqual(3);
  });

  it("orders the schedule of values by MasterFormat division", () => {
    const html = page();
    // The owner's own lines follow the total, outside it.
    const trade = html.slice(html.indexOf("<ol class=\"sov\" data-sov>"), html.indexOf('<div class="sov-total"'));
    const divs = [...trade.matchAll(/<span class="sov-div num">(\d*)<\/span>/g)].map((m) => m[1]).filter(Boolean);
    expect(divs[0]).toBe("02");
    expect(divs).toEqual([...divs].sort());
    expect(divs).toContain("09");
    expect(divs).toContain("32");
  });

  it("keeps the printed page at rest: one sheet, no chrome, no appendix, every id a destination", () => {
    const html = renderBudgetPage(presentBudget(referencePublication()), { print: true });
    expect(html).toContain('<html lang="en" data-print="1">');
    expect(html).not.toContain('class="hd"');
    expect(html).not.toContain("data-sc-progress");
    expect(html).not.toContain("scrollcraft.js");
    // LA-1462: the body is the full depth, so there is nothing left for an appendix to add.
    expect(html).not.toContain('id="appendix"');
    expect(html).toContain('data-dwg="section"');
  });
});

describe("client-facing text", () => {
  // LA-1333's guard: nothing on a budget reads like the inside of the software.
  const LEAKS: [RegExp, string][] = [
    [/docs\//, "a repository path"],
    [/\.md\b/, "a Markdown file name"],
    [/\bjev\b/i, "the internal model's name"],
    [/[\w.+-]+@[\w-]+\.[\w.-]+/, "an email address"],
    ...PARAMETER_NAMES.map((name): [RegExp, string] => [new RegExp(name.replace(/\./g, "\\.")), `the engine parameter ${name}`]),
  ];

  it("passes the LA-1333 copy guard, over the whole document", () => {
    for (const html of [page(), estimated()]) {
      expect(LEAKS.filter(([pattern]) => pattern.test(html)).map(([pattern, why]) => `${why}: ${html.match(pattern)![0]}`)).toEqual([]);
    }
  });

  it("never names AI, an LLM, Jev, a model, Claude or a ROM where a client reads", () => {
    const text = [clientText(page()), clientText(estimated())].join("\n");

    expect(text.match(/\bAI\b|\bLLM\b|\bJev\b|\bmodels?\b|\bClaude\b|\bROM\b|user override|history:|engine parameters?/gi)).toBeNull();
  });

  it("uses no em or en dash, and measures nothing on the section in feet", () => {
    const html = page();
    const text = clientText(html);

    expect(text).not.toMatch(/[–—]/);
    // The criteria's worked steps may say feet; the drawings never do.
    const drawings = [...html.matchAll(/<svg [^>]*data-vb-desk[\s\S]*?<\/svg>/g)].map((m) => m[0].replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " "));
    expect(drawings).toHaveLength(3);
    for (const d of drawings) expect(d).not.toMatch(/\d\s?(ft\b|feet|'|′|"|″|inch)/i);
  });

  it("writes every label in title case", () => {
    const html = page();
    // lib/format/title-case.ts's short words, plus "as", which the reference's headings keep lowercase.
    const SHORT = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "is", "of", "on", "or", "per", "the", "to", "with"]);
    const labels = [
      ...html.matchAll(
        /<(h1|h2|h3|dt|th)[^>]*>([\s\S]*?)<\/\1>|<button type="button" class="sw-t"[^>]*>([^<]*)<\/button>|class="(?:sov-name|op-lbl|op-n-l|fig-l|wf-lab|crit-l|crit-tag num|pill|stg-name|hd-fig-l|ln-l|lg-tag|sheet-h|hd-mark)"[^>]*>([\s\S]*?)<\/(?:a|p|span|h1|h2)>|<a href="#[^"]*" data-index="[^"]*">([^<]*)<\/a>|<span class="src[^"]*"><i[^>]*><\/i>([^<]*)<\/span>/g,
      ),
    ]
      .map((m) => (m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? "").replace(/<span class="(?:lg-count|lg-tag)[^"]*">[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, " "))
      .map((label) => label.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
      .filter((label) => label.length > 0 && !/^\$|^\d+$/.test(label))
      // A heading that is a sentence, with its full stop, stays sentence case: the letter's title (LA-1467).
      .filter((label) => !label.endsWith("."));
    const notTitle = labels.filter((label) =>
      label.split(" ").some((word, i) => {
        const letters = word.replace(/^[^A-Za-z0-9]+/, "");
        if (letters === "" || /^[A-Z0-9]/.test(letters)) return false;
        return i === 0 || !SHORT.has(letters.replace(/[^a-z]/g, ""));
      }),
    );

    expect(labels.length).toBeGreaterThan(100);
    expect(notTitle).toEqual([]);
  });

  it("prints a rate per SF to the cent under $100 on every division row", () => {
    const html = page();
    const model = presentBudget(referencePublication());
    for (const d of model.divisions) {
      if (d.items.length === 0) continue;
      expect(html, d.title).toContain(`<span class="sov-psf num">${rateUsd(d.likely / 64_000)}</span>`);
    }
  });

  it("opens on the wordmark, then the project, then the numbers, and hands off to the schedule (LA-1558)", () => {
    const html = page();
    const band = html.slice(html.indexOf('class="band band--first"'), html.indexOf('<div class="trio"'));
    expect(band).toContain('<p class="op-mark">Kulka</p>');
    expect(band).toContain('<p class="op-lbl">Conceptual Budget</p>');
    expect(band).toContain('<p class="op-proj" data-op-move="proj">MN Test #4</p>');
    expect(band).toContain("<span>70 Units</span>");
    expect(band).toContain("<span>64,000 GSF</span>");
    expect(band).toContain("<span>5 Stories</span>");
    expect(band).toMatch(/<p class="op-n-l">Total Budget<\/p><p class="op-n-v num" data-op-move="fig" data-el-ref="total:kulka-contract">\$20,296,613<\/p>/);
    expect(band).toMatch(/<p class="op-n-l">Per Square Foot<\/p><p class="op-n-v num" data-op-move="psf" data-el-ref="record:per-sf">\$317<\/p>/);
    // The reference run has no schedule, so the opening shows two numbers and never a month count.
    expect(band).toContain('data-count="2"');
    expect(band).not.toContain("Duration");
    expect(html.indexOf('id="where-the-money-is"')).toBeLessThan(html.indexOf('id="letter"'));
    expect(html).toContain('<h1 class="sheet-h">Schedule of Values</h1>');
    expect(html).toContain("You asked Kulka to price a <span class=\"num\">70</span>-unit multifamily building");
    expect(html).toContain('<span class="num" data-el-ref="total:kulka-contract">$20,296,613</span>');
    expect(html).toMatch(/<span class="num" data-el="record:per-sf" title="Total Budget over gross area[^"]*">\$317<\/span> per square foot/);
    expect(html).toContain('<a href="#where-the-money-is" data-index="where-the-money-is">Schedule of Values</a>');
    expect(html).not.toMatch(/Kulka Contract|The Ledger|Your Number/);
  });

  it("shows the duration in months when the budget has a schedule", () => {
    const publication = referencePublication();
    publication.snapshot.allocatedResources = { weeks: { construction: 61 } };
    const html = renderBudgetPage(presentBudget(publication));
    const band = html.slice(html.indexOf('class="band band--first"'), html.indexOf('<div class="trio"'));
    expect(band).toContain('data-count="3"');
    expect(band).toContain('<p class="op-n-l">Duration</p><p class="op-n-v num" data-op-move="dur">14<small>Months</small></p>');
    expect(band).not.toContain("+/-");
  });

  it("marks an estimated duration +/- when the budget has no schedule (LA-1566)", () => {
    const html = renderBudgetPage(presentBudget(estimatedPublication()));
    const band = html.slice(html.indexOf('class="band band--first"'), html.indexOf('<div class="trio"'));
    expect(band).toContain('data-count="3"');
    expect(band).toContain('<p class="op-n-l">Duration</p><p class="op-n-v num" data-op-move="dur">16<small>Months +/-</small></p>');
  });

  it("gives each opening number a header slot, Per Square Foot rightmost (LA-1575)", () => {
    const slotsOf = (html: string) => [...html.slice(html.indexOf('<div class="hd-t1">'), html.indexOf("</div>", html.indexOf('<div class="hd-t1">'))).matchAll(/data-hd-slot="([^"]+)"/g)].map((m) => m[1]);
    const movesOf = (html: string) => [...html.matchAll(/data-op-move="([^"]+)"/g)].map((m) => m[1]);

    const three = renderBudgetPage(presentBudget(estimatedPublication()));
    expect(slotsOf(three)).toEqual(["proj", "fig", "dur", "psf"]);
    expect(new Set(movesOf(three))).toEqual(new Set(slotsOf(three)));
    expect(three).toContain('<span class="hd-fig"><span class="hd-fig-l">Duration</span><span class="hd-fig-v num" data-hd-slot="dur">16<small>Months +/-</small></span></span>');
    expect(three).toContain('<span class="hd-fig" data-el-ref="record:per-sf"><span class="hd-fig-l">Per Square Foot</span><span class="hd-fig-v num" data-hd-slot="psf">$317</span></span>');

    // With no duration, its slot is left out.
    const two = page();
    expect(slotsOf(two)).toEqual(["proj", "fig", "psf"]);
    expect(new Set(movesOf(two))).toEqual(new Set(slotsOf(two)));
    expect(renderBudgetPage(presentBudget(referencePublication()), { print: true })).not.toContain("data-hd-slot");
  });
});

// LA-1483. Matt decided on 2026-10-02 that a client sees nothing about the
// projects behind a number: no past job, no job count, no job name. The
// snapshot and the internal app keep their comparables.
describe("past jobs are off the client page", () => {
  const model = () => presentBudget(referencePublication());
  const documents = (): [string, string][] => [
    ["the page", page()],
    ["the print render", renderBudgetPage(model(), { print: true })],
    ["the stored PDF's source", buildPrintJob(model()).html],
  ];
  // Every job name the fixture froze, with and without its Kulka job code.
  const jobNames = Object.values(referencePublication().snapshot.sourceJobNames ?? {}).flatMap((name) => [name, name.replace(/ \(C\d+\)$/, ""), name.match(/\(C\d+\)$/)?.[0] ?? ""]).filter(Boolean);

  it("has job names in the fixture to look for", () => {
    expect(jobNames.length).toBeGreaterThanOrEqual(4);
  });

  it.each(documents())("carries no comparable id, job name or job code in %s", (_name, html) => {
    expect(idsOf(html).filter((id) => id.includes("comparable"))).toEqual([]);
    expect(html).not.toMatch(/class="cmps?"|class="cmp-/);
    for (const name of jobNames) expect(html, name).not.toContain(name);
    expect(html).not.toMatch(/Fieldstone|Jefferson|\bC00\d{3}\b/);
  });

  it.each(documents())("says nothing of past jobs, job counts or a completed-jobs share in %s", (_name, html) => {
    const text = clientText(html);
    expect(text).not.toMatch(/\bKulka jobs?\b/i);
    expect(text).not.toMatch(/completed jobs?|jobs? Kulka has (?:built|completed)|past jobs?|job actuals|jobs? stands? behind|jobs? behind|buildings Kulka has completed/i);
    expect(text).not.toMatch(/\bcomparables?\b|\bactuals\b|\bmeasured Kulka\b|\bhistory\b|\bweights?\b/i);
    // The share of trade cost by source, in any wording.
    expect(text).not.toMatch(/of the trade cost is priced from/i);
    expect(text).not.toMatch(/\bblend/i);
    expect(text).not.toMatch(/\d+(\.\d)?% (?:of the trade cost )?(?:is priced )?from/i);
  });

  it("opens an item to how it is priced, its range, its confidence and its criteria, and no more", () => {
    const html = page();
    const start = html.indexOf('<button class="pin-row" type="button" data-i="0" data-el="line:26"');
    const card = html.slice(html.indexOf('<div class="card card--item"', start), html.indexOf('<button class="pin-row"', start + 1));
    expect(card).toContain("<b>2 Cars</b> at <b>$175,000 per Car</b></span>, the same as <span data-el=\"assumption:26:rate\"><b>64,000 GSF</b> at <b>$5.47 per GSF</b>");
    expect(card).toContain("Range $228,000 to $473,000");
    expect(card).toContain("Low Confidence");
    expect(card).toMatch(/data-el="assumption:26:V-2" data-tag="V-2"[^>]*><i><\/i><b>V-2<\/b>Hydraulic Jack Type: In-Ground<\/span>/);
    expect(card).not.toMatch(/\d+ (?:Kulka )?jobs?/i);
  });

  it("calls every figure a Kulka rate and never counts the jobs behind it", () => {
    const html = page();
    expect(html).toMatch(/<span class="card-src">Kulka Rate<\/span>/);
    expect(html).not.toMatch(/\d+ Kulka Jobs?/);
  });

  it("leaves the sourcing sentence out whole, and no longer exports a builder for it", () => {
    for (const [name, html] of documents()) {
      expect(html, name).not.toContain("note:sourcing");
      expect(html, name).not.toContain("lg-source");
      expect(clientText(html), name).not.toMatch(/of the trade cost|placeholder rates until Kulka states them/i);
    }
    expect("sourcingLine" in renderModule).toBe(false);
  });

  it("leaves the pricing parameters that name past jobs off the client table", () => {
    const labels = model().parameters.map((p) => p.label).sort();
    expect(labels).toEqual(["High-Confidence Range, Each Side", "Medium-Confidence Range, Each Side", "Low-Confidence Range, Each Side", "Fee Rate", "Insurance Rate"].sort());
  });

  it("keeps the comparables in the snapshot", () => {
    const { rom } = referencePublication().snapshot;
    expect(rom.lines.some((line) => line.comparables.length > 0)).toBe(true);
  });
});
