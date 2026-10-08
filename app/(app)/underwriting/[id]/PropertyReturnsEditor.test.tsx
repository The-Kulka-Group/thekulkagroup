import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { UnderwritingCase } from "@/lib/underwriting/cases";
import { PropertyReturnsEditor } from "./PropertyReturnsEditor";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const item = { reviewState: "working" as const };
const lenderTests = {
  lenderTestInputVersion: "lender_tests_inputs.v1",
  valuationMonth: "2028-09",
  asStabilizedCapRatePercent: 5.5,
  annualDebtService: 3_000_000,
  noiBasis: "noi_before_reserves",
  lenderTestEvidence: { valuationMonth: item, asStabilizedCapRatePercent: item, annualDebtService: item, noiBasis: item },
};
const sale = {
  saleInputVersion: "property_returns_inputs.v1",
  terminalCapRatePercent: 4.5,
  sellingCostPercent: 1.5,
  forwardNoiConvention: "forward_twelve_month_noi.v1",
  cashFlowDateConvention: "month_end_dates.v1",
  xirrConvention: "xirr_actual_365.v1",
  saleAssumptionEvidence: { saleMonth: item, terminalCapRatePercent: item, sellingCostPercent: item, forwardNoiConvention: item, cashFlowDateConvention: item, xirrConvention: item },
  lenderTests,
};

function render(overrides: { commercial?: boolean; permanentLoan?: boolean; propertyReturns?: object } = {}) {
  const savedCase = {
    id: "case-1",
    caseRevision: 3,
    costSchedule: { saleMonth: "2030-12", costLines: [] },
    apartmentOperations: overrides.commercial ? { commercial: { spaces: [] } } : {},
    developmentCapital: overrides.permanentLoan ? { permanentLoan: { sizingMode: "construction_balance" } } : {},
    propertyReturns: overrides.propertyReturns ?? sale,
  } as unknown as UnderwritingCase;
  return renderToStaticMarkup(<PropertyReturnsEditor savedCase={savedCase} />);
}

describe("sale plan editor commercial cap (LA-1870)", () => {
  it("shows the commercial exit cap and the commercial lender cap when the case has commercial space", () => {
    const html = render({ commercial: true });
    expect(html).toContain('id="returns-commercial-terminal-cap-rate"');
    expect(html).toContain("Commercial Terminal Cap Rate");
    expect(html).toContain('id="lender-commercial-cap-rate"');
    expect(html).toContain("Commercial Cap Rate");
  });

  it("hides both fields on a case with no commercial space and no saved cap", () => {
    const html = render();
    expect(html).not.toContain("returns-commercial-terminal-cap-rate");
    expect(html).not.toContain("lender-commercial-cap-rate");
  });

  it("keeps a saved cap visible, with its own source row, so it can be reviewed or removed", () => {
    const html = render({
      propertyReturns: {
        ...sale,
        commercialTerminalCapRatePercent: 5.5,
        saleAssumptionEvidence: { ...sale.saleAssumptionEvidence, commercialTerminalCapRatePercent: { reviewState: "done", sourceLabel: "Broker opinion" } },
        lenderTests: { ...lenderTests, commercialCapRatePercent: 6, lenderTestEvidence: { ...lenderTests.lenderTestEvidence, commercialCapRatePercent: { reviewState: "done", sourceLabel: "Term sheet" } } },
      },
    });
    expect(html).toContain('value="5.5"');
    expect(html).toContain('aria-label="Commercial Terminal Cap Rate source label"');
    expect(html).toContain('value="Broker opinion"');
    expect(html).toContain('aria-label="Commercial Cap Rate source label"');
    expect(html).toContain('value="Term sheet"');
  });
});

describe("lender tests editor debt service basis (LA-1870)", () => {
  it("offers Stated and Permanent Loan when the case has a permanent loan", () => {
    const html = render({ permanentLoan: true });
    expect(html).toContain('id="lender-debt-service-basis"');
    expect(html).toContain("Debt Service Basis");
    expect(html).toContain('<option value="stated">Stated</option>');
    // With no basis saved, the engine reads the permanent loan, so the select shows it.
    expect(html).toMatch(/<option value="permanent_loan" selected="">Permanent Loan<\/option>/);
  });

  it("shows the saved basis", () => {
    const html = render({ permanentLoan: true, propertyReturns: { ...sale, lenderTests: { ...lenderTests, debtServiceBasis: "stated" } } });
    expect(html).toMatch(/<option value="stated" selected="">Stated<\/option>/);
  });

  it("hides the select when the case has no permanent loan and none is saved", () => {
    expect(render()).not.toContain("lender-debt-service-basis");
  });
});
