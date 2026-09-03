import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(join(process.cwd(), path), "utf8");
}

describe("underwriting form accessibility contract", () => {
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
    expect(runPage).toContain("Full calculation input snapshot");
    expect(runPage).toContain("Saved evidence snapshot");
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
    expect(editor).toContain("Analysis start month");
    expect(editor).toContain("Sale month");
    expect(editor).toContain("Straight-line");
    expect(editor).toContain("S-curve");
    expect(editor).toContain("Source label");
    expect(editor).toContain("finally {");
    expect(casePage).toContain("Monthly uses");
    expect(casePage).toContain("Reconciliation checks");
    expect(casePage).toContain("monthlyCostResult.months");
    expect(casePage).toContain("aggregateFormulaTraces");
  });

  it("links every cost schedule control to its own field error", async () => {
    const editor = await source("app/(app)/underwriting/[id]/CostScheduleEditor.tsx");
    for (const field of [
      "name", "category", "amount", "startMonth", "endMonth",
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
    expect(editor).toContain("Opening Balance, Annual Rate Divided By 12");
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
    expect(editor).toContain("Sale Month And Next 11 Months");
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
    expect(results).toContain("Return Metrics And Formula Traces");
    expect(casePage).toContain("PropertyReturnsEditor");
    expect(runPage).toContain("PROPERTY_RETURNS_ASSUMPTION_KEYS");
    expect(runPage).toContain("It does not model permanent debt, investor waterfalls, taxes, or sensitivity cases.");
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
});
