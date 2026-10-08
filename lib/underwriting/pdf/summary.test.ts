import { computePropertyReturns, type PropertyReturnsInputs } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { retailAbatementCase, retailCase } from "../../../packages/engine/src/fixtures/commercial-cap-cases";
import type { WorkbookSource } from "../workbook/layout";
import { pdfPageCount, renderSummaryPdf } from "./render";
import { money, renderSummaryHtml, SUMMARY_PAGE_IDS, summaryFileName } from "./summary";

function sourceFor(name: string, inputs: PropertyReturnsInputs): WorkbookSource {
  const run = computePropertyReturns(inputs);
  expect(run.status, run.issues.map(({ code }) => code).join(", ")).toBe("complete");
  return {
    caseName: name,
    caseNumber: 1,
    sheetNumber: "U-101",
    address: "12 Test Street, Nyack, NY",
    caseRevision: 3,
    runId: "00000000-0000-4000-8000-000000000000",
    runCreatedAt: "2026-10-08T12:00:00.000Z",
    formulaVersion: run.formulaVersion,
    inputs: run.inputSnapshot,
    result: run.result!,
  };
}

const WITHOUT_PARTNERSHIP: PropertyReturnsInputs = { ...APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs, partnership: undefined };

const GOLDEN: Array<[string, WorkbookSource]> = [
  ["v2.98 sample", sourceFor("Public Sample", APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs)],
  ["v2.98 without a partnership", sourceFor("No Partnership", WITHOUT_PARTNERSHIP)],
  ["retail and apartments", sourceFor("Retail Case", retailCase())],
  ["abated tax sale", sourceFor("Abated Case", retailAbatementCase("full_tax"))],
];

describe("deal summary HTML", () => {
  it("formats dollars whole, with losses in brackets", () => {
    expect(money(1234567.4)).toBe("$1,234,567");
    expect(money(-980.6)).toBe("($981)");
    expect(money(-0.2)).toBe("$0");
  });

  it.each(GOLDEN)("has the seven pages in order for %s", (_name, source) => {
    const html = renderSummaryHtml(source);
    const ids = [...html.matchAll(/<section class="page[^"]*" data-page="([^"]+)"/g)].map((match) => match[1]);
    expect(ids).toEqual([...SUMMARY_PAGE_IDS]);
  });

  it("puts the deal name, the run date and the three headline returns on the cover", () => {
    const source = GOLDEN[0][1];
    const html = renderSummaryHtml(source);
    const cover = html.slice(html.indexOf('data-page="cover"'), html.indexOf('data-page="sources-and-uses"'));
    const returns = source.result.propertyReturns;
    expect(cover).toContain("Public Sample");
    expect(cover).toContain("October 8, 2026");
    expect(cover).toContain(`${(returns.returns.levered.xirr * 100).toFixed(2)}%`);
    expect(cover).toContain(`${(returns.yieldOnCost * 100).toFixed(2)}%`);
    expect(cover).toContain(`${returns.returns.levered.equityMultiple.toFixed(2)}x`);
  });

  it("carries no network reference and no past job", () => {
    for (const [, source] of GOLDEN) {
      const html = renderSummaryHtml(source);
      expect(html).not.toMatch(/<link|<script|<img|src="http|url\(http|@import/i);
      expect(html).not.toMatch(/completed job|past job|jobs completed|C0\d{4}/i);
    }
  });

  it("says plainly when a run has no partnership", () => {
    expect(renderSummaryHtml(GOLDEN[1][1])).toContain("carries no partnership plan");
    expect(renderSummaryHtml(GOLDEN[0][1])).not.toContain("carries no partnership plan");
  });

  it("names the file for the run", () => {
    expect(summaryFileName(GOLDEN[0][1])).toBe("Kulka Underwriting U-101 Deal Summary 00000000.pdf");
  });
});

// Needs a Chromium: Playwright's own, KULKA_CHROMIUM_PATH, or Chrome. Without one the audit has nothing to print with.
const chromium = await import("../../rom/pdf-renderer").then(async ({ launchChromium }) => {
  try {
    const browser = await launchChromium();
    await browser.close();
    return true;
  } catch {
    return false;
  }
});

describe.skipIf(!chromium)("deal summary PDF", () => {
  it.each(GOLDEN)("prints each page on its own printed page for %s", async (_name, source) => {
    const pdf = await renderSummaryPdf(source);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdfPageCount(pdf)).toBe(SUMMARY_PAGE_IDS.length);
  }, 60_000);
});
