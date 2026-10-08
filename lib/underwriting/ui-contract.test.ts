import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(join(process.cwd(), path), "utf8");
}

describe("underwriting form accessibility contract", () => {
  it("uses project language throughout the visible underwriting flow", async () => {
    const list = await source("app/(app)/underwriting/page.tsx");
    const create = await source("app/(app)/underwriting/new/page.tsx");
    const intake = await source("app/(app)/underwriting/CaseIntake.tsx");
    const detail = await source("app/(app)/underwriting/[id]/page.tsx");
    const run = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");

    expect(list).toContain("New Project");
    expect(list).toContain("No underwriting projects have been saved.");
    expect(list).toContain("<th>Project</th>");
    expect(create).toContain('title="New Underwriting Project"');
    expect(intake).toContain("Start a Ground-Up Multifamily Project");
    expect(intake).toContain('label="Project Name"');
    expect(intake).toContain('"Save Project"');
    expect(detail).toContain("The project has not been calculated.");
    expect(run).toContain("Back to Project");
  });

  it("labels inline controls and links field errors with described-by ids", async () => {
    const edit = await source("app/(app)/underwriting/[id]/EditUnderwritingCase.tsx");
    expect(edit).toContain("aria-label={`${field.label} review state`}");
    expect(edit).toContain("aria-label={label}");
    expect(edit).toContain("aria-describedby={error ? errorId : undefined}");
    expect(edit).toContain("<span id={id} className=\"input-error\" role=\"alert\">");
  });

  it("keeps a linked detail route in the paged run history", async () => {
    const casePage = await source("app/(app)/underwriting/[id]/page.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(casePage).toContain("/runs/${run.id}");
    expect(casePage).toContain("runPage=${runPage + 1}");
    expect(runPage).toContain("Full Calculation Input Snapshot");
    expect(runPage).toContain("Saved Evidence Snapshot");
  });

  it("validates page identifiers before any repository read", async () => {
    const casePage = await source("app/(app)/underwriting/[id]/page.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(casePage.indexOf("if (!isUuid(id)) notFound()"))
      .toBeLessThan(casePage.indexOf("getUnderwritingCase(getDb(), id)"));
    expect(runPage.indexOf("if (!isUuid(id) || !isUuid(runId)) notFound()"))
      .toBeLessThan(runPage.indexOf("getUnderwritingCase(getDb(), id)"));
  });

  it("leaves missing evidence blank and restores request buttons in finally blocks", async () => {
    const intake = await source("app/(app)/underwriting/CaseIntake.tsx");
    const edit = await source("app/(app)/underwriting/[id]/EditUnderwritingCase.tsx");
    const run = await source("app/(app)/underwriting/[id]/RunUnderwriting.tsx");
    expect(edit).not.toContain('?? "User entered"');
    expect(edit).not.toContain("defaultSourceDate");
    expect(intake).toContain("finally {");
    expect(edit).toContain("finally {");
    expect(run).toContain("finally {");
  });

  it("offers a dated cost editor and a readable monthly uses table", async () => {
    const editor = await source("app/(app)/underwriting/[id]/CostScheduleEditor.tsx");
    const casePage = await source("app/(app)/underwriting/[id]/page.tsx");
    expect(editor).toContain("Analysis Start Month");
    expect(editor).toContain("Sale Month");
    expect(editor).toContain("Straight-line");
    expect(editor).toContain("S-curve");
    expect(editor).toContain("Source Label");
    expect(editor).toContain("finally {");
    expect(casePage).toContain("Monthly Uses");
    expect(casePage).toContain("Reconciliation Checks");
    expect(casePage).toContain("monthlyCostResult.months");
    expect(casePage).toContain("aggregateFormulaTraces");
  });

  it("links every cost schedule control to its own field error", async () => {
    const editor = await source("app/(app)/underwriting/[id]/CostScheduleEditor.tsx");
    for (const field of [
      "name", "category", "basis", "amount", "startMonth", "endMonth",
      "distributionMethod", "sourceLabel", "sourceDate", "reviewState",
    ]) {
      expect(editor).toContain(`fieldState(fieldErrors, index, "${field}"`);
    }
    expect(editor).toContain('"aria-invalid": Boolean(error)');
    expect(editor).toContain('"aria-describedby": error ? errorId : undefined');
    expect(editor).toContain("id: controlId");
    expect(editor).toContain("<span id={id} className=\"input-error\" role=\"alert\">");
  });

  it("keeps operating inputs and results in separate readable lines", async () => {
    const editor = await source("app/(app)/underwriting/[id]/ApartmentOperationsEditor.tsx");
    const casePage = await source("app/(app)/underwriting/[id]/page.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(editor).toContain("Residential Unit Types");
    expect(editor).toContain("Other Income");
    expect(editor).toContain("Operating Expenses");
    expect(editor).toContain("Capital Expenditures");
    expect(editor).toContain("finally {");
    for (const source of [casePage, runPage]) {
      expect(source).toContain("Lease-Up Loss");
      expect(source).toContain("Occupied Units");
      expect(source).toContain("Non-Revenue Units");
      expect(source).toContain("Other Income");
      expect(source).toContain("Credit Loss");
      expect(source).toContain("Operating Cash Flow");
    }
  });

  it("shows versioned capital rules, typed field errors, and monthly debt results", async () => {
    const editor = await source("app/(app)/underwriting/[id]/DevelopmentCapitalEditor.tsx");
    const casePage = await source("app/(app)/underwriting/[id]/page.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(editor).toContain("Equity First");
    expect(editor).toContain("Opening Balance, Annual Rate Divided by 12");
    expect(editor).toContain("Capital Assumption Sources");
    expect(editor).toContain("MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH");
    expect(editor).toContain("maxLength={MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH}");
    expect(editor).toContain("capital-evidence-${key}-source-label-error");
    expect(editor).toContain("aria-describedby={error ? errorId : undefined}");
    expect(editor).toContain("finally {");
    for (const source of [casePage, runPage]) {
      expect(source).toContain("Debt Before Reserves");
      expect(source).toContain("Interest Reserve");
      expect(source).toContain("Operating Shortfall Reserve");
      expect(source).toContain("Opening Debt");
      expect(source).toContain("Closing Debt");
      expect(source).toContain("formulaTraces");
    }
  });

  it("shows versioned sale terms, dated return streams, and saved evidence", async () => {
    const editor = await source("app/(app)/underwriting/[id]/PropertyReturnsEditor.tsx");
    const results = await source("app/(app)/underwriting/[id]/PropertyReturnsResults.tsx");
    const casePage = await source("app/(app)/underwriting/[id]/page.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(editor).toContain("Sale Month and Next 11 Months");
    expect(editor).toContain("Actual Days Over 365");
    expect(editor).toContain("Sale Assumption Sources");
    expect(editor).toContain("MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH");
    expect(editor).toContain("maxLength={MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH}");
    expect(editor).toContain("const labelId = `returns-evidence-${key}-source-label`");
    expect(editor).toContain("<FieldError id={`${labelId}-error`}");
    expect(editor).toContain("aria-describedby={error ? errorId : undefined}");
    expect(editor).toContain("finally {");
    expect(results).toContain("Dated Monthly Property Cash Flow");
    expect(results).toContain("Unlevered XIRR");
    expect(results).toContain("Levered XIRR");
    expect(results).toContain("Return Metrics and Formula Traces");
    expect(casePage).toContain("PropertyReturnsEditor");
    expect(runPage).toContain("PROPERTY_RETURNS_ASSUMPTION_KEYS");
    expect(runPage).toContain("It does not model permanent debt, investor waterfalls, income taxes, or sensitivity cases.");
  });

  it("takes a dated tax schedule and sale tax basis, and shows NOI, value and lender tests on both tax bases", async () => {
    const operations = await source("app/(app)/underwriting/[id]/ApartmentOperationsEditor.tsx");
    const taxSection = await source("app/(app)/underwriting/[id]/PropertyTaxSection.tsx");
    const editor = await source("app/(app)/underwriting/[id]/PropertyReturnsEditor.tsx");
    const results = await source("app/(app)/underwriting/[id]/PropertyReturnsResults.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(operations).toContain("<PropertyTaxSection");
    expect(taxSection).toContain("Add Property Tax Schedule");
    expect(taxSection).toContain("PROPERTY_TAX_INPUT_VERSION");
    expect(taxSection).toContain("maxLength={MAX_PROPERTY_TAX_SOURCE_LABEL_LENGTH}");
    expect(taxSection).toContain("PILOT Payment");
    expect(taxSection).toContain("Assessment Cap Rate");
    expect(taxSection).toContain("Two Cap Rates");
    expect(taxSection).toContain("Assessment Cap Rate Before Stabilization");
    expect(results).toContain("capRates");
    expect(editor).toContain("Full Tax Plus Abatement Value");
    expect(editor).toContain("SALE_TAX_INPUT_VERSION");
    expect(results).toContain("Sale on Scheduled Tax and Full Tax");
    expect(results).toContain("Property Tax by Fiscal Year");
    expect(results).toContain("Full Tax</th>");
    expect(runPage).toContain("PROPERTY_TAX_ASSUMPTION_KEYS");
    expect(runPage).toContain("SALE_TAX_ASSUMPTION_KEYS");
  });

  it("takes lease-up inputs with their own sources and shows the concession line and turned units in every operations table", async () => {
    const operations = await source("app/(app)/underwriting/[id]/ApartmentOperationsEditor.tsx");
    const leaseUp = await source("app/(app)/underwriting/[id]/LeaseUpSection.tsx");
    const casePage = await source("app/(app)/underwriting/[id]/page.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(operations).toContain("<LeaseUpSection");
    expect(operations).toContain("Variable Share</th>");
    expect(operations).toContain("Lead Months</th>");
    for (const label of [
      "Add Lease-Up Concession", "Add Seasonal Absorption", "Add Stabilization Rule", "Spread Over the Lease Term",
      "Add Lease Turnover", "Vacant Months", "Each New Lease Once", "Every Expiring Lease", "Net Units Gained",
    ]) {
      expect(leaseUp).toContain(label);
    }
    expect(leaseUp).toContain("maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH}");
    for (const page of [casePage, runPage]) {
      expect(page).toContain("Lease-Up Concession</th>");
      expect(page).toContain("month.leaseUpConcessionLoss");
      expect(page).toContain("Turned Units</th>");
      expect(page).toContain("month.turnedUnits");
    }
  });

  it("takes growth by category with its own source", async () => {
    const operations = await source("app/(app)/underwriting/[id]/ApartmentOperationsEditor.tsx");
    const growth = await source("app/(app)/underwriting/[id]/GrowthSection.tsx");
    expect(operations).toContain("<GrowthSection");
    for (const label of ["Add Growth by Category", "Add Year", "Remove Last Year"]) expect(growth).toContain(label);
    expect(growth).toContain("GROWTH_CATEGORY_LABELS");
    expect(growth).toContain("maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH}");
  });

  it("takes lender test inputs with their own sources and shows each test with its trace or its issue", async () => {
    const editor = await source("app/(app)/underwriting/[id]/PropertyReturnsEditor.tsx");
    const results = await source("app/(app)/underwriting/[id]/PropertyReturnsResults.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(editor).toContain("Add Lender Tests");
    expect(editor).toContain("As-Stabilized Cap Rate");
    expect(editor).toContain("Annual Debt Service");
    expect(editor).toContain("NOI Before Reserves");
    expect(editor).toContain("NOI After Reserves");
    expect(editor).toContain("Lender Test Sources");
    expect(editor).toContain("maxLength={MAX_LENDER_TEST_SOURCE_LABEL_LENGTH}");
    expect(editor).toContain("LENDER_TESTS_INPUT_VERSION");
    expect(editor).toContain("fieldErrors[`lenderTests.${key}`]");
    expect(results).toContain("Lender Tests and Formula Traces");
    expect(results).toContain("Not Reported");
    expect(results).toContain("result.lenderTests");
    expect(runPage).toContain("LENDER_TEST_ASSUMPTION_KEYS");
  });

  it("takes the partnership waterfall with its own sources and shows LP and GP results with traces", async () => {
    const editor = await source("app/(app)/underwriting/[id]/PropertyReturnsEditor.tsx");
    const section = await source("app/(app)/underwriting/[id]/PartnershipSection.tsx");
    const results = await source("app/(app)/underwriting/[id]/PropertyReturnsResults.tsx");
    const waterfall = await source("app/(app)/underwriting/[id]/PartnershipResults.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(editor).toContain("<PartnershipSection");
    for (const label of ["Add Partnership Waterfall", "LP Funding Share", "Funding Order", "Pari Passu", "GP First", "LP Entry Month", "Compound Monthly", "Simple Monthly", "IRR Hurdle Tiers", "Add Tier", "Final Split", "Partnership Sources"]) {
      expect(section).toContain(label);
    }
    expect(section).toContain("maxLength={MAX_PARTNERSHIP_SOURCE_LABEL_LENGTH}");
    expect(section).toContain("fieldErrors[`partnership.${path}`]");
    expect(results).toContain("Peak Equity");
    expect(results).toContain("<PartnershipResults");
    for (const label of ["Partnership Waterfall", "Distributions by Tier", "Partnership Formula Traces", "Monthly LP and GP Cash Flow", "Not Reported"]) {
      expect(waterfall).toContain(label);
    }
    expect(runPage).toContain("PARTNERSHIP_ASSUMPTION_KEYS");
  });

  it("takes the permanent loan with its own sources and shows the takeout, caps, debt service and payoff", async () => {
    const editor = await source("app/(app)/underwriting/[id]/DevelopmentCapitalEditor.tsx");
    const section = await source("app/(app)/underwriting/[id]/PermanentLoanSection.tsx");
    const results = await source("app/(app)/underwriting/[id]/PermanentLoanResults.tsx");
    const sourcesAndUses = await source("app/(app)/underwriting/[id]/SourcesAndUsesSection.tsx");
    const scenarios = await source("app/(app)/underwriting/[id]/ScenarioComparisonResults.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(editor).toContain("<PermanentLoanSection");
    expect(editor).toContain("permanentLoan: permanentLoan ?? null");
    for (const label of ["Add Permanent Loan", "Funding Month", "First Stabilized Month", "Sizing Mode", "Sizing NOI Window", "Maximum Loan to Value", "Commercial Valuation Cap Rate", "Minimum Debt Service Coverage", "Interest-Only Months", "Closing Costs", "Proceeds Above Payoff", "Permanent Loan Sources"]) {
      expect(section).toContain(label);
    }
    expect(section).toContain("maxLength={MAX_PERMANENT_LOAN_SOURCE_LABEL_LENGTH}");
    expect(section).toContain("fieldErrors[`permanentLoan.${path}`]");
    for (const label of ["Takeout Month", "Binding Test", "Permanent Loan Sizing", "Permanent Loan Debt Service by Month", "Payoff at Sale", "Permanent Loan Formula Traces", "Not Reported"]) {
      expect(results).toContain(label);
    }
    expect(sourcesAndUses).toContain("<PermanentLoanResults");
    expect(scenarios).toContain("Permanent Loan Amount");
    expect(scenarios).toContain("Permanent Loan Debt Service Coverage");
    expect(runPage).toContain("PERMANENT_LOAN_ASSUMPTION_KEYS");
  });

  it("links every scenario control to field errors and renders scenario evidence in saved runs", async () => {
    const editor = await source("app/(app)/underwriting/[id]/ScenarioComparisonEditor.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(editor).toContain("MAX_APARTMENT_SCENARIO_SOURCE_LABEL_LENGTH");
    expect(editor).toContain("maxLength={MAX_APARTMENT_SCENARIO_SOURCE_LABEL_LENGTH}");
    expect(editor).toContain("scenario-${scenario.role}-${key}-value");
    expect(editor).toContain("scenario-${scenario.role}-${key}-source-label");
    for (const error of ["nameError", "valueError", "labelError", "dateError", "stateError"]) {
      expect(editor).toContain(`aria-invalid={Boolean(${error})}`);
      expect(editor).toContain(`aria-describedby={${error} ?`);
    }
    expect(editor).toContain("min={key === \"growthStartMonthShiftMonths\" ? -MAX_SCENARIO_TIMING_SHIFT_MONTHS");
    expect(editor).toContain("max={key === \"growthStartMonthShiftMonths\" ? MAX_SCENARIO_TIMING_SHIFT_MONTHS : 100}");
    expect(runPage).toContain("run.evidenceSnapshot.scenarios");
    expect(runPage).toContain("Saved Scenario Evidence");
    expect(runPage).toContain("scenario.lastChangedAt");
  });

  it("names the commercial cap fields and the debt service basis in Title Case, with described errors (LA-1870)", async () => {
    const editor = await source("app/(app)/underwriting/[id]/PropertyReturnsEditor.tsx");
    for (const text of ["Commercial Terminal Cap Rate", "Commercial Cap Rate", "Debt Service Basis", "\"Stated\"", "\"Permanent Loan\""]) {
      expect(editor).toContain(text);
    }
    expect(editor).toContain("aria-describedby={lenderError(\"debtServiceBasis\") ?");
    const results = await source("app/(app)/underwriting/[id]/PropertyReturnsResults.tsx");
    expect(results).toContain("Value at Terminal and Commercial Cap Rates");
  });

  it("shows lender test values beside returns in the scenario comparison table", async () => {
    const table = await source("app/(app)/underwriting/[id]/ScenarioComparisonResults.tsx");
    for (const text of ["Loan to Value", "Debt Service Coverage", "Debt Yield", "metrics.lender", "Not Reported"]) {
      expect(table).toContain(text);
    }
  });
});
