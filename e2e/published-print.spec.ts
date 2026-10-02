import { expect, test } from "@playwright/test";

import { presentBudget } from "../lib/rom/presentation";
import { launchChromium, openPrintPage, PDF_MARGIN, renderPdfWithChromium } from "../lib/rom/pdf-renderer";
import { buildPrintJob } from "../lib/rom/published-pdf";
import { referencePublication } from "../test/fixtures/published-budget";

// LA-1420. The published budget printed by real headless Chromium, from the
// fixture (one real run, LA-1418). No app server is involved: the renderer
// serves the page and its three assets from a private origin, the same way it
// does at publish.

const job = buildPrintJob(presentBudget(referencePublication()));

// What Chromium prints on a Letter page: 11pt text at a 1.6 line height, inside
// 18mm top and bottom margins (lib/rom/pdf-renderer.ts, budget-page.css).
const PAGE_HEIGHT = 792;
const MM = 72 / 25.4;
const BOTTOM_MARGIN = parseFloat(PDF_MARGIN.bottom) * MM;
const TOP_MARGIN = parseFloat(PDF_MARGIN.top) * MM;
const LINE = 11 * 1.6;

type Item = { str: string; x: number; y: number };

async function readPdf(bytes: Uint8Array) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  const pages: Item[][] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    pages.push(
      content.items.flatMap((it) => ("str" in it && it.str.trim() ? [{ str: it.str.trim(), x: it.transform[4], y: it.transform[5] }] : [])),
    );
  }
  // Chromium writes each named destination as `/<id> [<page> /XYZ x y 0]` in the
  // catalog's Dests dictionary, uncompressed. pdfjs does not list them, so read them raw.
  const raw = Buffer.from(bytes).toString("latin1");
  const destinations = [...raw.matchAll(/\/([^\s/[\]()<>]+) \[\d+ 0 R \/XYZ/g)].map((m) => m[1]);
  return { pages, destinations };
}

test("the print page is at rest: every drill-down open, nothing driven by scroll", async () => {
  const browser = await launchChromium();
  try {
    const { page } = await openPrintPage(browser, job);

    const state = await page.evaluate(() => {
      const shown = (el: Element) => el.getClientRects().length > 0;
      const bad: string[] = [];
      for (const el of document.querySelectorAll("*")) {
        if (![...el.attributes].some((a) => a.name.startsWith("data-sc-"))) continue;
        const cs = getComputedStyle(el);
        const problems = [
          cs.display === "none" || !shown(el) ? "hidden" : "",
          cs.visibility !== "visible" ? "invisible" : "",
          cs.opacity !== "1" ? `opacity ${cs.opacity}` : "",
          cs.transform !== "none" && cs.transform !== "matrix(1, 0, 0, 1, 0, 0)" ? `transform ${cs.transform}` : "",
        ].filter(Boolean);
        if (problems.length) bad.push(`${el.tagName.toLowerCase()}.${el.className || ""}[${el.getAttribute("data-el") ?? ""}] ${problems.join(", ")}`);
      }
      const scopes = [...document.querySelectorAll(".lg-item[data-open]")].filter(shown);
      const closed = scopes.filter(
        (s) => s.getAttribute("data-open") !== "true" || getComputedStyle(s.querySelector(".lg-lines")!).display === "none",
      );
      // LA-1459: every layer of the section is drawn, and the drawing at rest is the one sheet.
      const undrawn = [...document.querySelectorAll('[data-dwg="section"] [data-layer], [data-dwg="section"] [data-story]')].filter(
        (g) => getComputedStyle(g).opacity !== "1",
      ).length;
      const drawings = [...document.querySelectorAll("[data-dwg]")].filter(shown).map((d) => d.getAttribute("data-dwg"));
      const acts = [...document.querySelectorAll("[data-sc-act]")];
      return {
        bad,
        scopes: scopes.length,
        closed: closed.length,
        actsNotAtEnd: acts.filter((a) => (a as HTMLElement).style.getPropertyValue("--sc-p") !== "1").length,
        acts: acts.length,
        pinnedStage: getComputedStyle(document.querySelector("#from-trades-to-total [data-sc-stage]")!).position,
        chrome: document.querySelectorAll(".hd, .sw, .hd-ix, [data-sc-progress]").length,
        undrawn,
        drawings,
        engineMounted: document.documentElement.classList.contains("sc-ready"),
        tier: document.documentElement.getAttribute("data-tier"),
      };
    });

    expect(state.bad).toEqual([]);
    expect(state.scopes).toBeGreaterThan(5);
    expect(state.closed).toBe(0);
    expect(state.acts).toBeGreaterThan(0);
    expect(state.actsNotAtEnd).toBe(0);
    expect(state.pinnedStage).toBe("static");
    expect(state.chrome).toBe(0);
    expect(state.undrawn).toBe(0);
    expect(state.drawings).toEqual(["section"]);
    expect(state.engineMounted).toBe(false);
    expect(state.tier).toBe("detail");
  } finally {
    await browser.close();
  }
});

test("the PDF has a stable page count, clean page breaks and named destinations", async () => {
  test.setTimeout(120_000);
  const first = await renderPdfWithChromium(job);
  const second = await renderPdfWithChromium(job);
  const a = await readPdf(first);
  const b = await readPdf(second);

  // Stable: the same fixture prints to the same number of pages every time.
  expect(a.pages.length).toBeGreaterThan(5);
  expect(b.pages.length).toBe(a.pages.length);

  const titles = ["The Ledger", "Design and Engineering", "From Trades to Total", "Notes and Clarifications"];
  // A title starts a page when nothing sits above it in the body area, below the running header.
  const bodyTop = PAGE_HEIGHT - TOP_MARGIN;
  const startsPage = (title: string) =>
    a.pages.some((items) => items.some((it) => it.str === title && !items.some((other) => other.y > it.y && other.y < bodyTop)));
  for (const title of titles) expect(startsPage(title), `${title} starts a page`).toBe(true);

  // No heading sits within 3 lines of a page bottom, where it would strand from its text.
  const headings = await headingTexts();
  const floor = BOTTOM_MARGIN + 3 * LINE;
  const stranded = a.pages.flatMap((items, i) =>
    items.filter((it) => headings.has(it.str) && it.y < floor && it.y > BOTTOM_MARGIN - 1).map((it) => `page ${i + 1}: ${it.str} at ${it.y.toFixed(0)}pt`),
  );
  expect(stranded).toEqual([]);

  // Named destinations: every section, and the ids a question would cite.
  for (const id of ["section:where-the-money-is", "section:from-trades-to-total", "section:appendix", "total:kulka-contract", "note:1"]) {
    expect(a.destinations, id).toContain(id);
  }
  expect(a.destinations.length).toBeGreaterThan(100);

  // Running header and footer on every page.
  for (const [i, items] of a.pages.entries()) {
    const text = items.map((it) => it.str).join(" ");
    expect(text, `page ${i + 1} header`).toContain("MN Test #4");
    expect(text, `page ${i + 1} footer`).toContain(`Page ${i + 1} of ${a.pages.length}`);
  }
});

async function headingTexts(): Promise<Set<string>> {
  const browser = await launchChromium();
  try {
    const { page } = await openPrintPage(browser, job);
    const texts = await page.evaluate(() =>
      [...document.querySelectorAll("h1, h2, h3")].filter((h) => h.getClientRects().length > 0).map((h) => (h as HTMLElement).innerText.trim()),
    );
    return new Set(texts);
  } finally {
    await browser.close();
  }
}
