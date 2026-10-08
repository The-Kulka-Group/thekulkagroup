import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PERMANENT_LOAN_ASSUMPTION_KEYS,
  PERMANENT_LOAN_INPUT_VERSION,
  computePropertyReturns,
  runApartmentScenarioComparison,
  type PermanentLoanPlan,
  type PropertyReturnsInputs,
} from "@kulka/engine";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { PermanentLoanResults } from "./PermanentLoanResults";
import { PermanentLoanSection } from "./PermanentLoanSection";
import { ScenarioComparisonResults } from "./ScenarioComparisonResults";

const evidence = { sourceLabel: "Lender quote", sourceDate: "2026-10-07", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;

const plan: PermanentLoanPlan = {
  permanentLoanInputVersion: PERMANENT_LOAN_INPUT_VERSION,
  fundingAnchor: { kind: "stabilization", offsetMonths: 0 },
  sizingMode: "lesser_of_tests",
  sizingNoiWindow: { kind: "trailing", months: 3 },
  noiTaxBasis: "full_tax",
  maxLoanToValuePercent: 65,
  valuationCapRatePercent: 5.5,
  minDebtServiceCoverage: 1.25,
  annualRatePercent: 6,
  interestOnlyMonths: 24,
  amortizationYears: 30,
  termYears: 10,
  feePercent: 0.5,
  closingCosts: 50_000,
  cashOut: "distribute",
  evidence: Object.fromEntries([...PERMANENT_LOAN_ASSUMPTION_KEYS, "maxLoanToValuePercent", "valuationCapRatePercent", "minDebtServiceCoverage"].map((key) => [key, evidence])) as PermanentLoanPlan["evidence"],
};

const input: PropertyReturnsInputs = { ...base, saleMonth: "2032-09", payoffMonth: "2032-09", permanentLoan: plan };

const scenarios = [
  { id: "higher-vacancy", role: "downside" as const, name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1" as const, delta: { vacancyPercent: 12 }, evidence: { vacancyPercent: evidence } },
  { id: "lower-exit-cap", role: "upside" as const, name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1" as const, delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: evidence } },
];

function run() {
  const calculated = computePropertyReturns(input);
  expect(calculated.status, JSON.stringify(calculated.issues)).toBe("complete");
  return calculated.result!;
}

describe("permanent loan views", () => {
  it("shows the takeout, each cap with the binding one marked, debt service by month and the payoff", () => {
    const result = run();
    const loan = result.developmentCapital.permanentLoan!;
    const html = renderToStaticMarkup(<PermanentLoanResults loan={loan} />);
    for (const text of ["Takeout Month", "Permanent Loan Amount", "Binding Test", "Equity Paydown", "First-Year Debt Service", "Debt Service Coverage", "Payoff at Sale", "Permanent Loan Sizing", "Permanent Loan Debt Service by Month", "Permanent Loan Formula Traces", loan.fundingMonth]) {
      expect(html).toContain(text);
    }
    expect(loan.caps.length).toBe(2);
    expect(html.match(/Binding<\/span>/g)).toHaveLength(1);
    expect(html.match(/Not Binding/g)).toHaveLength(1);
    expect(html).not.toContain("<th scope=\"row\" class=\"num\">2025-01</th>");
  });

  it("shows cash out in place of an equity paydown when proceeds pass the payoff", () => {
    const loan = { ...run().developmentCapital.permanentLoan!, cashOut: 125_000, equityPaydown: 0 };
    const html = renderToStaticMarkup(<PermanentLoanResults loan={loan} />);
    expect(html).toContain("Cash Out");
    expect(html).not.toContain('<span class="t-label">Equity Paydown</span>');
    expect(html).toContain("go to the equity holders in the takeout month");
  });

  it("offers the terms, the caps and a source row for each", () => {
    const html = renderToStaticMarkup(<PermanentLoanSection permanentLoan={plan} setPermanentLoan={() => undefined} milestones={[]} defaultMonth="2028-02" fieldErrors={{ "permanentLoan.termYears": "Term must be a whole number of years from 1 to 40." }} />);
    for (const text of ["Funding Month", "First Stabilized Month", "Lesser of the Tests", "Annualized Trailing NOI", "Maximum Loan to Value", "Minimum Debt Service Coverage", "Interest-Only Months", "Permanent Loan Sources", "Closing Costs", "Term must be a whole number of years from 1 to 40."]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("Maximum Loan to Value source label");
    expect(html).not.toContain("Minimum Debt Yield source label");
  });

  it("offers the commercial valuation cap rate only on a case with commercial spaces or a saved rate", () => {
    const section = (permanentLoan: PermanentLoanPlan, hasCommercial: boolean) => renderToStaticMarkup(<PermanentLoanSection permanentLoan={permanentLoan} setPermanentLoan={() => undefined} milestones={[]} defaultMonth="" hasCommercial={hasCommercial} fieldErrors={{}} />);
    expect(section(plan, false)).not.toContain("Commercial Valuation Cap Rate");
    expect(section(plan, true)).toContain("Commercial Valuation Cap Rate");
    const withRate = { ...plan, commercialValuationCapRatePercent: 7.5, evidence: { ...plan.evidence, commercialValuationCapRatePercent: evidence } };
    const html = section(withRate, false);
    expect(html).toContain("Commercial Valuation Cap Rate source label");
  });

  it("shows only the switch when the case has no permanent loan", () => {
    const html = renderToStaticMarkup(<PermanentLoanSection permanentLoan={undefined} setPermanentLoan={() => undefined} milestones={[]} defaultMonth="" fieldErrors={{}} />);
    expect(html).toContain("Add Permanent Loan");
    expect(html).not.toContain("Loan Terms");
  });

  it("shows each scenario's own permanent loan amount and coverage", () => {
    const comparison = runApartmentScenarioComparison(input, scenarios);
    expect(comparison.status, JSON.stringify(comparison.issues)).toBe("complete");
    const html = renderToStaticMarkup(<ScenarioComparisonResults result={comparison.result!} />);
    expect(html).toContain("Permanent Loan Amount");
    expect(html).toContain("Permanent Loan Debt Service Coverage");
    const baseLoan = comparison.result!.base.propertyResult.developmentCapital.permanentLoan!;
    expect(html).toContain(`$${Math.round(baseLoan.loanAmount).toLocaleString("en-US")}`);
  });

  it("leaves the loan rows out of a comparison with no permanent loan", () => {
    const { permanentLoan: _dropped, ...without } = input;
    void _dropped;
    const comparison = runApartmentScenarioComparison(without, scenarios);
    const html = renderToStaticMarkup(<ScenarioComparisonResults result={comparison.result!} />);
    expect(html).not.toContain("Permanent Loan Amount");
  });
});
