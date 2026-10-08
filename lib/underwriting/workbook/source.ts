import type { UnderwritingCase } from "@/lib/underwriting/cases";
import type { SavedUnderwritingRun } from "@/lib/underwriting/runs";

import type { WorkbookSource } from "./layout";

/** The workbook covers a completed full property run; any other run has nothing to export. */
export function workbookSourceFor(savedCase: UnderwritingCase, run: SavedUnderwritingRun): WorkbookSource | null {
  if (run.status !== "complete" || !run.propertyReturnsResult) return null;
  return {
    caseName: savedCase.name,
    caseNumber: savedCase.caseNumber,
    sheetNumber: savedCase.sheetNumber,
    address: savedCase.address,
    caseRevision: run.caseRevision,
    runId: run.id,
    runCreatedAt: run.createdAt,
    formulaVersion: run.formulaVersion,
    inputs: run.inputSnapshot,
    result: run.propertyReturnsResult,
  };
}

export function workbookFileName(source: WorkbookSource) {
  return `Kulka Underwriting ${source.sheetNumber} Run ${source.runId.slice(0, 8)}.xlsx`;
}
