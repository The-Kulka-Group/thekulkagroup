import { computePropertyReturns, PERMANENT_LOAN_ASSUMPTION_KEYS, PERMANENT_LOAN_INPUT_VERSION, type PermanentLoanPlan, type PropertyReturnsInputs } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { retailAbatementCase, retailCase } from "../../../packages/engine/src/fixtures/commercial-cap-cases";
import type { WorkbookSource } from "../workbook/layout";
import { MAX_SUMMARY_PAGES, pdfPageCount, renderSummaryPdf } from "./render";
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

const EVIDENCE = { sourceLabel: "Permanent loan quote", sourceDate: "2026-10-07", reviewState: "working" as const };
const WITH_PERMANENT_LOAN: PropertyReturnsInputs = {
  ...APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs,
  saleMonth: "2032-09",
  payoffMonth: "2032-09",
  permanentLoan: {
    permanentLoanInputVersion: PERMANENT_LOAN_INPUT_VERSION,
    fundingAnchor: { kind: "stabilization", offsetMonths: 0 },
    sizingMode: "construction_balance",
    sizingNoiWindow: { kind: "trailing", months: 3 },
    noiTaxBasis: "full_tax",
    annualRatePercent: 6,
    interestOnlyMonths: 24,
    amortizationYears: 30,
    termYears: 10,
    feePercent: 0,
    closingCosts: 0,
    cashOut: "distribute",
    evidence: Object.fromEntries(PERMANENT_LOAN_ASSUMPTION_KEYS.map((key) => [key, EVIDENCE])) as PermanentLoanPlan["evidence"],
  },
};

const GOLDEN: Array<[string, WorkbookSource]> = [
  ["v2.98 sample", sourceFor("Public Sample", APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs)],
  ["v2.98 without a partnership", sourceFor("No Partnership", WITHOUT_PARTNERSHIP)],
  ["retail and apartments", sourceFor("Retail Case", retailCase())],
  ["abated tax sale", sourceFor("Abated Case", retailAbatementCase("full_tax"))],
  ["permanent loan", sourceFor("Permanent Loan", WITH_PERMANENT_LOAN)],
];

describe("deal summary HTML", () => {
  it("formats dollars whole, with losses in brackets", () => {
    expect(money(1234567.4)).toBe("$1,234,567");
    expect(money(-980.6)).toBe("($981)");
    expect(money(-0.2)).toBe("$0");
  });

  it.each(GOLDEN)("has the seven sections in order for %s", (_name, source) => {
    const html = renderSummaryHtml(source);
    const ids = [...html.matchAll(/<section class="sec[^"]*" data-page="([^"]+)"/g)].map((match) => match[1]);
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

  const section = (html: string, id: string) => {
    const start = html.indexOf(`data-page="${id}"`);
    const next = html.indexOf("<section", start);
    return html.slice(start, next === -1 ? undefined : next);
  };

  it("lets sections flow and keeps each heading with its table", () => {
    const html = renderSummaryHtml(GOLDEN[0][1]);
    expect(html).not.toMatch(/\.page\{|height:915px|break-after:page/);
    expect(html).toMatch(/\.ph,\.lede,h3,caption\{break-after:avoid/);
    expect(html).toMatch(/tr\{break-inside:avoid/);
    expect(html).toMatch(/\.limits\{[^}]*break-inside:avoid/);
    expect(html).toContain('class="sec cover-sec" data-page="cover"');
  });

  it("breaks Other Project Costs into the categories the run carries", () => {
    for (const [, source] of GOLDEN) {
      const totals = source.result.annualCashFlow!.analysis_year.totals;
      const html = section(renderSummaryHtml(source), "sources-and-uses");
      expect(html).not.toContain("Other Project Costs");
      expect(html).toContain(">Hard Cost<");
      expect(html).toContain(">Soft Cost<");
      expect(html).toContain(money(totals.hardCost));
      expect(html).toContain(money(totals.softCost));
      if (Math.round(totals.developmentFee) !== 0) expect(html).toContain(">Development Fee<");
    }
  });

  it("keeps the single Other Project Costs line when the run has no annual view", () => {
    const source = { ...GOLDEN[0][1], result: { ...GOLDEN[0][1].result, annualCashFlow: null } };
    const html = section(renderSummaryHtml(source), "sources-and-uses");
    expect(html).toContain("Other Project Costs");
    expect(html).not.toContain(">Hard Cost<");
  });

  describe("unit mix by tier", () => {
    const withTypes = (unitTypes: PropertyReturnsInputs["residentialUnitTypes"]): WorkbookSource => ({
      ...GOLDEN[0][1],
      inputs: { ...(GOLDEN[0][1].inputs as PropertyReturnsInputs), residentialUnitTypes: unitTypes },
    });
    const base = GOLDEN[0][1].inputs as PropertyReturnsInputs;
    const market = base.residentialUnitTypes[0];

    it("leaves out tiers with no units and never prints None", () => {
      const html = section(renderSummaryHtml(withTypes([{ ...market, affordabilityTier: "market" }])), "unit-mix");
      expect(html).not.toContain("None");
      expect(html).not.toContain(">Workforce<");
      expect(html).not.toContain(">Affordable<");
      expect(html).toContain(">Market<");
    });

    it("prints a blank where a tier has no AMI or no rent", () => {
      const html = section(
        renderSummaryHtml(withTypes([
          { ...market, affordabilityTier: "market" },
          { ...market, name: "Workforce Studio", affordabilityTier: "workforce", amiPercent: undefined } as typeof market,
        ])),
        "unit-mix",
      );
      expect(html).not.toContain("None");
      expect(html).toContain(">Workforce<");
    });
  });

  it("titles section 05 for the loans the run has", () => {
    for (const [, source] of GOLDEN) {
      const html = section(renderSummaryHtml(source), "debt");
      const title = html.match(/<h2>([^<]+)<\/h2>/)![1];
      expect(title).toBe(source.result.developmentCapital.permanentLoan ? "Construction and Permanent Debt" : "Construction Loan");
    }
    expect(GOLDEN.some(([, source]) => source.result.developmentCapital.permanentLoan)).toBe(true);
    expect(GOLDEN.some(([, source]) => !source.result.developmentCapital.permanentLoan)).toBe(true);
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
  it.each(GOLDEN)("prints %s in about three pages", async (_name, source) => {
    const pdf = await renderSummaryPdf(source);
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    expect(pdfPageCount(pdf)).toBeLessThanOrEqual(MAX_SUMMARY_PAGES);
    expect(pdfPageCount(pdf)).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("prints a run with a partnership and no permanent loan in three pages, Model Limits whole", async () => {
    const source = GOLDEN[0][1];
    expect(source.result.partnership).not.toBeNull();
    expect(source.result.developmentCapital.permanentLoan).toBeFalsy();
    expect(pdfPageCount(await renderSummaryPdf(source))).toBe(3);
  }, 60_000);
});
