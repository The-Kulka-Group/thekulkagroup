import { PARAMETER_NAMES } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { presentBudget, rateUsd, usd } from "@/lib/rom/presentation";
import { DIAGRAM_LINE, LAYERS } from "@/lib/rom/section";
import { referencePage, referencePublication } from "@/test/fixtures/published-budget";

import { renderBudgetPage } from "./render";

// LA-1418, LA-1459. The app's page against the LA-1416 reference page, from
// the same run: the same sections in the same order, Version 1's data-el ids
// kept, and every figure on the page traceable to the model. The markup is
// the approved frames' (LA-1456), so what is compared is ids and figures,
// never whitespace.

const page = () => renderBudgetPage(presentBudget(referencePublication()));

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

    expect(sections).toEqual(referencePage.sections);
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
    // fold (scopes:rest) is gone, because the ledger shows every row at every
    // depth so the section can be drawn row by row; the foot names the
    // project (record:project), as the approved close does.
    const renamed = (id: string) =>
      id === "record:recorded" ? "record:issued" : id.startsWith("parameter:") ? `parameter:${id.slice(10).replace(/[._]/g, "-")}` : id;
    const clientFacing = (id: string) => notComparable(id) && id !== "record:snapshot" && id !== "scopes:rest";
    const expected = new Set([...referencePage.dataEl.filter(clientFacing).map(renamed), "record:gross-area", "record:units", "record:project"]);

    expect(new Set(ids.filter(notComparable))).toEqual(expected);
    expect(ids.filter((id) => id.includes(":comparable:"))).toHaveLength(referencePage.dataEl.filter((id) => id.includes(":comparable:")).length);
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
        for (const c of line.comparables) moneyOf(c.rate).forEach((m) => held.add(m));
      }
    }
    for (const row of model.ledger) if (row.perSquareFoot) held.add(row.perSquareFoot);
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
    // Two more departures (LA-1459): the Summary fold's own figure went with
    // the fold, and the running receipt's "$0" went with the receipt.
    const gone = new Set(["$0", ...(model.money.rest ? [usd(model.money.rest.likely)] : [])]);
    const missing = [...new Set(referencePage.money)].filter((m) => !onPage.has(m) && !referenceRates.has(m) && !gone.has(m));
    expect(missing).toEqual([]);

    // The headline, every ledger row and the built figure, where the frames put them.
    expect(html).toMatch(/class="fig num" data-el="total:kulka-contract"[^>]*>\$20,296,613</);
    expect(html).toContain('data-running="$18,650,604"');
    expect(html).toContain('data-running="$19,256,749"');
    expect(html).toContain('data-landed="$20,296,613"');
    for (const row of model.ledger) expect(html, row.label).toContain(`data-layer="${row.key}"`);
    expect(html).toContain(">$50.69<");
    expect(html).toContain(">16%<");
  });
});

describe("the section on the page", () => {
  it("draws the section five times, each with its own pattern ids, and every layer keyed by a ledger row", () => {
    const html = page();
    const drawings = [...html.matchAll(/<div class="dwg[^"]*" data-dwg="([^"]*)"/g)].map((m) => m[1]);
    expect(drawings).toEqual(["ledger", "proven", "design", "peak", "peak-light"]);
    // The criteria's ids sit on the Design and Engineering drawing's callouts, once each.
    expect([...html.matchAll(/data-el="criterion:([^"]*)"/g)].map((m) => m[1]).sort()).toEqual(["A-1", "A-2", "E-1", "M-0", "M-1", "S-1", "V-1", "V-2", "V-3"]);
    const ids = [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const layerKeys = new Set([...html.matchAll(/<g data-layer="([^"]*)"/g)].map((m) => m[1]));
    const rowKeys = new Set([...html.matchAll(/<div class="lg-item[^"]*" id="[^"]*" data-el="[^"]*" data-layer="([^"]*)"/g)].map((m) => m[1]));
    for (const key of layerKeys) expect(rowKeys.has(key), key).toBe(true);
    for (const key of rowKeys) if (key in LAYERS) expect(layerKeys.has(key), key).toBe(true);
    expect(html.split(DIAGRAM_LINE).length - 1).toBeGreaterThanOrEqual(3);
  });

  it("orders the ledger by MasterFormat division", () => {
    const divs = [...page().matchAll(/<span class="lg-div num">(\d*)<\/span>/g)].map((m) => m[1]).filter(Boolean);
    expect(divs[0]).toBe("02");
    expect(divs).toEqual([...divs].sort());
    expect(divs).toContain("09");
    expect(divs).toContain("32");
  });

  it("keeps the printed page at rest: one sheet, no chrome, the appendix, every id a destination", () => {
    const html = renderBudgetPage(presentBudget(referencePublication()), { print: true });
    expect(html).toContain('<html lang="en" data-tier="detail" data-print="1">');
    expect(html).not.toContain('class="hd"');
    expect(html).not.toContain("data-sc-progress");
    expect(html).not.toContain("scrollcraft.js");
    expect(html).toContain('id="appendix"');
    expect(html).toContain('data-dwg="proven"');
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
    const html = page();

    expect(LEAKS.filter(([pattern]) => pattern.test(html)).map(([pattern, why]) => `${why}: ${html.match(pattern)![0]}`)).toEqual([]);
  });

  it("never names AI, an LLM, Jev, a model, Claude or a ROM where a client reads", () => {
    const text = clientText(page());

    expect(text.match(/\bAI\b|\bLLM\b|\bJev\b|\bmodels?\b|\bClaude\b|\bROM\b|user override|history:|engine parameters?/gi)).toBeNull();
  });

  it("uses no em or en dash, and measures nothing on the section in feet", () => {
    const html = page();
    const text = clientText(html);

    expect(text).not.toMatch(/[–—]/);
    // The criteria's worked steps may say feet; the drawings never do.
    const drawings = [...html.matchAll(/<svg [^>]*data-vb-desk[\s\S]*?<\/svg>/g)].map((m) => m[0].replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " "));
    expect(drawings).toHaveLength(5);
    for (const d of drawings) expect(d).not.toMatch(/\d\s?(ft\b|feet|'|′|"|″|inch)/i);
  });

  it("writes every label in title case", () => {
    const html = page();
    // lib/format/title-case.ts's short words, plus "as", which the reference's headings keep lowercase.
    const SHORT = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "is", "of", "on", "or", "per", "the", "to", "with"]);
    const labels = [
      ...html.matchAll(
        /<(h1|h2|h3|dt|th)[^>]*>([\s\S]*?)<\/\1>|<button type="button" class="sw-t"[^>]*>([^<]*)<\/button>|class="(?:lg-name|fig-l|wf-lab|crit-l|crit-tag num|pill|stg-name|hd-fig-l|cmp-k|ln-l|lg-tag|sheet-h|hd-mark)"[^>]*>([\s\S]*?)<\/(?:a|p|span|h1|h2)>|<a href="#[^"]*" data-index="[^"]*">([^<]*)<\/a>|<span class="src[^"]*"><i[^>]*><\/i>([^<]*)<\/span>/g,
      ),
    ]
      .map((m) => (m[2] ?? m[3] ?? m[4] ?? m[5] ?? m[6] ?? "").replace(/<span class="(?:lg-count|lg-tag)[^"]*">[\s\S]*?<\/span>/g, "").replace(/<[^>]+>/g, " "))
      .map((label) => label.replace(/&amp;/g, "&").replace(/\s+/g, " ").trim())
      .filter((label) => label.length > 0 && !/^\$|^\d+$/.test(label));
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

  it("prints a rate per SF to the cent under $100 on every ledger row", () => {
    const html = page();
    const model = presentBudget(referencePublication());
    for (const row of model.ledger) {
      if (row.scope.kind === "unpriced") continue;
      expect(html, row.label).toContain(`<span class="lg-psf num">${rateUsd(row.likely / 64_000)}</span>`);
    }
  });
});
