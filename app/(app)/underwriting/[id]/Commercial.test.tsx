import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  PERMANENT_LOAN_ASSUMPTION_KEYS,
  PERMANENT_LOAN_INPUT_VERSION,
  computeApartmentOperations,
  computePropertyReturns,
  type CategoryGrowth,
  type OperatingExpenseLine,
  type PermanentLoanPlan,
} from "@kulka/engine";

import type { UnderwritingCase } from "@/lib/underwriting/cases";
import { lenderTestPlan, retailBlock, retailCase } from "../../../../packages/engine/src/fixtures/commercial-cap-cases";
import { ApartmentOperationsEditor } from "./ApartmentOperationsEditor";
import { CommercialResults, hasCommercialMonths } from "./CommercialResults";
import { CommercialSection } from "./CommercialSection";
import { DevelopmentCapitalEditor } from "./DevelopmentCapitalEditor";
import { GrowthSection } from "./GrowthSection";
import { PropertyReturnsEditor } from "./PropertyReturnsEditor";
import { PropertyReturnsResults } from "./PropertyReturnsResults";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined }) }));

const noop = () => undefined;
const working = { reviewState: "working" as const };
const cam: OperatingExpenseLine = { id: "cam", name: "Common Area Maintenance", amount: 30_000, unit: "usd_per_year", appliesTo: "commercial", ...working };
const insurance: OperatingExpenseLine = { id: "insurance", name: "Insurance", amount: 50_000, unit: "usd_per_year", ...working };

function section(overrides: Partial<Parameters<typeof CommercialSection>[0]> = {}) {
  return renderToStaticMarkup(<CommercialSection
    commercial={retailBlock(10)}
    setCommercial={noop}
    expenseLines={[cam, insurance]}
    hasPropertyTax
    milestones={[]}
    defaultMonth="2027-01"
    fieldErrors={{}}
    {...overrides}
  />);
}

describe("commercial spaces editor section", () => {
  it("shows one row per space with every term, a source row each and the vacancy and credit loss pair", () => {
    const block = retailBlock();
    const html = section({ commercial: { ...block, spaces: [block.spaces[0], { ...block.spaces[0], id: "cafe", name: "Corner Cafe" }] } });
    for (const text of ["Add Commercial Spaces", "Commercial Vacancy", "Commercial Credit Loss", "Annual Rent per SF", "Lease Start", "Free Rent Months", "Tenant Improvement per SF", "Leasing Commission", "Lease Term Months", "Recoveries", "Add Commercial Space"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('aria-label="Space 1 name"');
    expect(html).toContain('aria-label="Space 2 name"');
    expect(html).not.toContain('aria-label="Space 3 name"');
    expect(html).toContain('aria-label="Retail A area"');
    expect(html).toContain('aria-label="Corner Cafe area"');
    expect(html).toContain('aria-label="Retail A source label"');
    expect(html).toContain('aria-label="Retail A review state"');
    expect(html).toContain('aria-label="Commercial Vacancy and Credit Loss source label"');
    expect(html).toContain('value="2027-07"');
  });

  it("shows only the switch when the case has no commercial space", () => {
    const html = section({ commercial: undefined });
    expect(html).toContain("Add Commercial Spaces");
    expect(html).not.toContain("Annual Rent per SF");
  });

  it("offers a recovery on a property tax or on named expense lines, with the share blank for the area share", () => {
    const html = section();
    expect(html).toContain("Add Recovery for Retail A");
    expect(html).toMatch(/<option value="property_tax" selected="">Property Tax<\/option>/);
    expect(html).toContain('value="10"');
    const noShare = section({ commercial: { ...retailBlock(), spaces: [{ ...retailBlock().spaces[0], recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] } }] }] } });
    expect(noShare).toContain('placeholder="Area Share"');
    expect(noShare).toMatch(/<input type="checkbox" checked=""[^>]*\/> Common Area Maintenance/);
    expect(noShare).not.toMatch(/<input type="checkbox" checked=""[^>]*\/> Insurance/);
    expect(noShare).toContain("Insurance");
  });

  it("leaves a percent of revenue line out of the recovery choices", () => {
    const html = section({ expenseLines: [cam, { ...insurance, id: "mgmt", name: "Management Fee", unit: "percent_effective_gross_revenue" }] });
    expect(html).not.toContain("Management Fee");
  });

  it("anchors a lease start to a milestone", () => {
    const block = retailBlock();
    const html = section({
      commercial: { ...block, spaces: [{ ...block.spaces[0], leaseStartAnchor: { milestoneId: "tco", offsetMonths: 3 } }] },
      milestones: [{ id: "tco", name: "Certificate of Occupancy", month: "2027-04" }],
    });
    expect(html).toContain("Certificate of Occupancy");
    expect(html).toContain("Retail A lease start offset in months");
    expect(html).toContain("Months From, 2027-07");
  });

  it("shows each engine error under its own field", () => {
    const html = section({
      fieldErrors: {
        "commercial.vacancyPercent": "Commercial vacancy must be from 0 to 100 percent.",
        "commercial.spaces.0.areaSf": "Area must be above zero.",
        "commercial.spaces.0.leaseTermMonths": "Lease term must be a whole number of months from 1 to 360.",
        "commercial.spaces.0.recoveries.0.sharePercent": "Share must be above 0 and at most 100 percent.",
        "commercial.spaces": "Tenants together pay 140 percent of the property tax.",
      },
    });
    for (const text of ["Commercial vacancy must be from 0 to 100 percent.", "Area must be above zero.", "Lease term must be a whole number of months from 1 to 360.", "Share must be above 0 and at most 100 percent.", "Tenants together pay 140 percent of the property tax."]) {
      expect(html).toContain(text);
    }
    expect(html).toMatch(/id="apartment-operations-commercial-spaces-0-areaSf"[^>]*aria-invalid="true"/);
  });
});

function savedCaseWith(overrides: { commercial?: boolean; growth?: CategoryGrowth; permanent?: boolean; propertyReturns?: boolean } = {}) {
  const { commercial, operatingExpenseLines, ...inputs } = retailCase();
  return {
    id: "case-1",
    caseRevision: 3,
    costSchedule: { analysisStartMonth: inputs.analysisStartMonth, saleMonth: inputs.saleMonth, milestones: [], costLines: [] },
    apartmentOperations: {
      ...inputs,
      operatingExpenseLines: [cam, ...operatingExpenseLines],
      ...(overrides.commercial === false ? {} : { commercial }),
      ...(overrides.growth ? { categoryGrowth: overrides.growth } : {}),
      lastChangedAt: "2026-10-07T00:00:00Z",
    },
    developmentCapital: overrides.permanent ? { permanentLoan: permanentLoan() } : {},
    propertyReturns: overrides.propertyReturns ? {
      saleInputVersion: "property_returns_inputs.v1",
      terminalCapRatePercent: 4.5,
      sellingCostPercent: 1.5,
      forwardNoiConvention: "forward_twelve_month_noi.v1",
      cashFlowDateConvention: "month_end_dates.v1",
      xirrConvention: "xirr_actual_365.v1",
      saleAssumptionEvidence: {},
      lenderTests: lenderTestPlan(),
    } : {},
  } as unknown as UnderwritingCase;
}

function permanentLoan(): PermanentLoanPlan {
  return {
    permanentLoanInputVersion: PERMANENT_LOAN_INPUT_VERSION,
    fundingAnchor: { kind: "stabilization", offsetMonths: 0 },
    sizingMode: "lesser_of_tests",
    sizingNoiWindow: { kind: "trailing", months: 3 },
    noiTaxBasis: "full_tax",
    maxLoanToValuePercent: 65,
    valuationCapRatePercent: 5.5,
    annualRatePercent: 6,
    interestOnlyMonths: 24,
    amortizationYears: 30,
    termYears: 10,
    feePercent: 0.5,
    closingCosts: 50_000,
    cashOut: "distribute",
    evidence: Object.fromEntries([...PERMANENT_LOAN_ASSUMPTION_KEYS, "maxLoanToValuePercent", "valuationCapRatePercent"].map((key) => [key, working])) as PermanentLoanPlan["evidence"],
  };
}

describe("operations editor with commercial spaces", () => {
  it("gets a Commercial Spaces section and the Applies To choice on every operating expense line", () => {
    const html = renderToStaticMarkup(<ApartmentOperationsEditor savedCase={savedCaseWith()} />);
    expect(html).toContain("Commercial Spaces");
    expect(html).toContain("Applies To");
    expect(html).toContain('aria-label="Common Area Maintenance applies to"');
    expect(html).toMatch(/<option value="commercial" selected="">Commercial<\/option>/);
    expect(html).toContain('<option value="residential">Residential</option>');
    expect(html).toContain("Retail A");
  });

  it("takes a commercial line per unit out of the unit choices", () => {
    const html = renderToStaticMarkup(<ApartmentOperationsEditor savedCase={savedCaseWith()} />);
    const camSelect = html.match(/<select[^>]*aria-label="Common Area Maintenance unit"[^>]*>(.*?)<\/select>/)![1];
    expect(camSelect).not.toContain("USD per Unit per Year");
    expect(camSelect).toContain("Percent of Effective Gross Revenue");
  });

  it("shows only the switch on a case with no commercial space", () => {
    const html = renderToStaticMarkup(<ApartmentOperationsEditor savedCase={savedCaseWith({ commercial: false })} />);
    expect(html).toContain("Add Commercial Spaces");
    expect(html).not.toContain("Annual Rent per SF");
  });
});

describe("growth by category with commercial rent", () => {
  const growth: CategoryGrowth = {
    marketRentPercent: [3, 4],
    affordableRentPercent: [2, 2],
    otherIncomePercent: [3, 3],
    operatingExpensePercent: [3, 3],
    ...working,
  };

  it("shows a Commercial Rent Growth row that reads the market rent rates until it is set", () => {
    const html = renderToStaticMarkup(<GrowthSection growth={growth} setGrowth={noop} incomePercent={3} expensePercent={3} fieldErrors={{}} />);
    expect(html).toContain("Commercial Rent Growth");
    expect(html).toMatch(/aria-label="Commercial Rent Growth year 1 percent"[^>]*value="3"/);
    expect(html).toMatch(/aria-label="Commercial Rent Growth year 2 percent"[^>]*value="4"/);
  });

  it("shows saved commercial rates and the error for a bad year", () => {
    const html = renderToStaticMarkup(<GrowthSection growth={{ ...growth, commercialRentPercent: [1.5, 2.5] }} setGrowth={noop} incomePercent={3} expensePercent={3} fieldErrors={{ "categoryGrowth.commercialRentPercent.1": "Commercial Rent Growth for year 2 must be from 0 to 100 percent." }} />);
    expect(html).toMatch(/aria-label="Commercial Rent Growth year 1 percent"[^>]*value="1.5"/);
    expect(html).toContain("Commercial Rent Growth for year 2 must be from 0 to 100 percent.");
  });
});

describe("commercial results", () => {
  const input = retailCase();
  const operations = computeApartmentOperations(input);
  const result = operations.result!;

  it("runs clean on the retail case", () => {
    expect(operations.status, JSON.stringify(operations.issues)).toBe("complete");
    expect(result.commercial!.spaces).toHaveLength(1);
  });

  it("shows commercial income lines, residential and commercial NOI by month, each space and the cost lines", () => {
    const html = renderToStaticMarkup(<CommercialResults months={result.months} commercial={result.commercial} totals={result.totals} costSchedule={result.costSchedule} />);
    for (const text of ["Commercial Base Rent", "Commercial Free Rent", "Commercial Recoveries", "Commercial Vacancy", "Commercial Credit Loss", "Commercial Effective Gross Revenue", "Commercial Net Operating Income", "Residential Net Operating Income", "Total Net Operating Income", "Retail A", "Annual Rent Roll", "Commercial Costs in the Cost Schedule", "Tenant Improvements (Retail A)", "Leasing Commission (Retail A)"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("$400,000");
    expect(html.match(/<tr><th scope="row" class="num">20\d\d-\d\d<\/th>/g)).toHaveLength(result.months.length);
    expect(html).toContain(`${result.commercial!.commercialAreaSf.toLocaleString("en-US")} SF`);
  });

  it("never counts a space as a unit", () => {
    expect(result.unitSummary.totalUnits).toBe(computeApartmentOperations({ ...input, commercial: undefined }).result!.unitSummary.totalUnits);
    const html = renderToStaticMarkup(<CommercialResults months={result.months} commercial={result.commercial} totals={result.totals} costSchedule={result.costSchedule} />);
    expect(html).not.toContain("Occupied Units");
  });

  it("shows the forward twelve months by use on a property run and nothing on a case with no space", () => {
    const run = computePropertyReturns(input);
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const html = renderToStaticMarkup(<PropertyReturnsResults result={run.result!} reconciliations={run.reconciliations} />);
    expect(html).toContain("Forward Commercial and Residential Net Operating Income");
    const without = computePropertyReturns({ ...input, commercial: undefined });
    expect(hasCommercialMonths(without.result!.forwardOperations.months)).toBe(false);
    expect(renderToStaticMarkup(<PropertyReturnsResults result={without.result!} reconciliations={without.reconciliations} />)).not.toContain("Forward Commercial and Residential");
  });

  it("reads a month saved before commercial spaces as having none", () => {
    const earlier = result.months.map((month) => {
      const copy: Record<string, unknown> = { ...month };
      for (const key of Object.keys(copy)) if (key.startsWith("commercial") || key === "residentialNetOperatingIncome") delete copy[key];
      return copy as unknown as (typeof result.months)[number];
    });
    expect(hasCommercialMonths(earlier)).toBe(false);
  });
});

describe("commercial cap fields appear once spaces are saved", () => {
  it("shows the sale and lender commercial caps", () => {
    const html = renderToStaticMarkup(<PropertyReturnsEditor savedCase={savedCaseWith({ propertyReturns: true })} />);
    expect(html).toContain('id="returns-commercial-terminal-cap-rate"');
    expect(html).toContain('id="lender-commercial-cap-rate"');
  });

  it("shows neither cap on a case with no commercial space", () => {
    const html = renderToStaticMarkup(<PropertyReturnsEditor savedCase={savedCaseWith({ propertyReturns: true, commercial: false })} />);
    expect(html).not.toContain("returns-commercial-terminal-cap-rate");
    expect(html).not.toContain("lender-commercial-cap-rate");
  });

  it("shows the permanent loan commercial valuation cap", () => {
    const html = renderToStaticMarkup(<DevelopmentCapitalEditor savedCase={savedCaseWith({ permanent: true })} />);
    expect(html).toContain("Commercial Valuation Cap Rate");
    const without = renderToStaticMarkup(<DevelopmentCapitalEditor savedCase={savedCaseWith({ permanent: true, commercial: false })} />);
    expect(without).not.toContain("Commercial Valuation Cap Rate");
  });
});
