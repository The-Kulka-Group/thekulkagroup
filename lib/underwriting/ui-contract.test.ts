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
  });
});
