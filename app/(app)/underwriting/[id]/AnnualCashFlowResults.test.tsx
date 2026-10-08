import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PERMANENT_LOAN_ASSUMPTION_KEYS,
  PERMANENT_LOAN_INPUT_VERSION,
  computePropertyReturns,
  type PermanentLoanPlan,
  type PropertyReturnsInputs,
} from "@kulka/engine";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { retailAbatementCase, retailCase } from "../../../../packages/engine/src/fixtures/commercial-cap-cases";
import { AnnualCashFlowView } from "./AnnualCashFlowResults";
import { PropertyReturnsResults } from "./PropertyReturnsResults";

const evidence = { sourceLabel: "Permanent loan quote", sourceDate: "2026-10-07", reviewState: "working" as const };
const loan: PermanentLoanPlan = {
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
  evidence: Object.fromEntries(PERMANENT_LOAN_ASSUMPTION_KEYS.map((key) => [key, evidence])) as PermanentLoanPlan["evidence"],
};
const input: PropertyReturnsInputs = { ...APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs, saleMonth: "2032-09", payoffMonth: "2032-09", permanentLoan: loan };
const run = computePropertyReturns(input);
const views = run.result!.annualCashFlow!;
const render = (basis: Parameters<typeof AnnualCashFlowView>[0]["basis"]) =>
  renderToStaticMarkup(<AnnualCashFlowView views={views} basis={basis} onBasis={vi.fn()} />);

describe("annual cash flow table", () => {
  it("opens on operating years with the development period first", () => {
    expect(run.status).toBe("complete");
    const html = render(null);
    expect(html).toContain("Annual Cash Flow");
    expect(html.indexOf("Development Period")).toBeGreaterThan(-1);
    expect(html.indexOf("Development Period")).toBeLessThan(html.indexOf("Operating Year 1"));
    expect(html).toContain("Operating Year 5");
    expect(html).toMatch(/aria-pressed="true"[^>]*>Operating Years</);
    expect(html).toContain("Analysis Years");
    expect(html).toContain("Calendar Years");
  });

  it("stacks each year header as a label, a date range and a note, each kept whole", () => {
    const html = render(null).split("Annual Cash Flow Formula Traces")[0];
    expect(html).toMatch(/<th[^>]*scope="col"><span class="annual-head-label">Operating Year 1<\/span><span class="annual-head-range t-meta">\d{4}-\d{2} to \d{4}-\d{2}<\/span>/);
    expect(html).toContain('class="annual-head-note t-meta">Part Year,');
    expect(html).not.toContain("<br/>");
  });

  it("shows the lines a lender reads, with coverage and debt yield on full operating years", () => {
    const html = render(null);
    for (const text of ["Effective Gross Revenue", "Residential Vacancy", "Residential Credit Loss", "Net Operating Income", "Capital Expenditures", "Project Costs", "Construction Interest", "Permanent Debt Service", "Permanent Loan Payoff", "Net Sale Proceeds", "Levered Cash Flow", "Debt Service Coverage", "Debt Yield", "Sale Year"]) {
      expect(html, text).toContain(text);
    }
    expect(html).toMatch(/\d\.\d\dx/);
    expect(html).toContain("Not Reported");
  });

  it("shows commercial lines apart from residential when the case has a commercial space", () => {
    const retail = computePropertyReturns(retailCase({ saleMonth: "2032-09", payoffMonth: "2032-09" }));
    const html = renderToStaticMarkup(<AnnualCashFlowView views={retail.result!.annualCashFlow} basis={null} onBasis={vi.fn()} />).split("Annual Cash Flow Formula Traces")[0];
    for (const text of ["Commercial Base Rent", "Commercial Vacancy", "Commercial Net Operating Income", "Residential Net Operating Income"]) {
      expect(html, text).toContain(text);
    }
  });

  it("leaves out commercial lines when the case has no commercial space, and keeps the core lines", () => {
    const table = render(null).split("Annual Cash Flow Formula Traces")[0];
    expect(table).not.toContain("Commercial Base Rent");
    expect(table).not.toContain("Property Tax, Full");
    expect(table).toContain("Capital Expenditures");
  });

  it("switches the columns with the year basis and marks part years with their month count", () => {
    const analysis = render("analysis_year");
    expect(analysis).toContain("Analysis Year 1");
    expect(analysis).not.toContain("Development Period");
    expect(analysis).toMatch(/aria-pressed="true"[^>]*>Analysis Years</);
    const calendar = render("calendar_year");
    expect(calendar).toContain("Calendar Years");
    expect(calendar).toMatch(/Part Year, \d+ Months/);
  });

  it("shows property tax on the scheduled and full basis when the case has a tax schedule", () => {
    const taxed = computePropertyReturns(retailAbatementCase("full_tax", { saleMonth: "2032-09", payoffMonth: "2032-09" }));
    const html = renderToStaticMarkup(<AnnualCashFlowView views={taxed.result!.annualCashFlow} basis={null} onBasis={vi.fn()} />).split("Annual Cash Flow Formula Traces")[0];
    for (const text of ["Property Tax, Scheduled", "Property Tax, Full", "Net Operating Income, Full Tax"]) expect(html, text).toContain(text);
  });

  it("lists a formula trace for every line and every check", () => {
    const html = render(null);
    expect(html).toContain("Annual Cash Flow Formula Traces");
    expect(html).toContain("monthly net operating income");
    expect(html).toMatch(/All \d+ checks pass/);
  });

  it("says a run saved before the annual view has none", () => {
    for (const missing of [null, undefined]) {
      const html = renderToStaticMarkup(<AnnualCashFlowView views={missing} basis={null} onBasis={vi.fn()} />);
      expect(html).toContain("saved before the annual view");
      expect(html).not.toContain("<table");
    }
  });

  it("falls back to analysis years when the run never stabilizes", () => {
    const html = renderToStaticMarkup(<AnnualCashFlowView views={{ ...views, operating_year: null }} basis="operating_year" onBasis={vi.fn()} />);
    expect(html).toContain("Analysis Year 1");
    expect(html).not.toContain("Operating Years<");
  });

  it("sits on the property results page", () => {
    const html = renderToStaticMarkup(<PropertyReturnsResults result={run.result!} reconciliations={run.reconciliations} />);
    expect(html).toContain("Annual Cash Flow");
    const earlier = renderToStaticMarkup(<PropertyReturnsResults result={{ ...run.result!, annualCashFlow: null }} reconciliations={run.reconciliations} />);
    expect(earlier).toContain("saved before the annual view");
  });
});
