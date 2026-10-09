import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import type { PartnershipCashFlowMonth, PartnershipPlan, PartnershipResult, PropertyReturnsResult } from "@kulka/engine";
import ExcelJS from "exceljs";

import { assumptionsFor, layoutOutputs, type CellFormat, type WorkbookLayout } from "./layout";
import { buildWaterfallSheet } from "./waterfall";
import { writeUnderwritingWorkbook } from "./write";

// LA-1947. The check that keeps the workbook's formulas honest. It writes the
// workbook with no cached formula results, has LibreOffice calculate and save
// it, reads every output cell back and compares it with the engine's value.
// Test-only: nothing in the app imports this file.

const run = promisify(execFile);

const TOLERANCE: Record<CellFormat, number> = {
  money: 1,
  count: 0.5,
  basis_points: 0.5,
  rate: 0.0001,
  multiple: 0.0001,
  percent_number: 0.01,
  number: 0.0001,
  date: 0,
  text: 0,
};

/** LibreOffice's command line: KULKA_SOFFICE_PATH, the macOS app, or `soffice` on PATH. */
export function findSoffice(): string | null {
  const candidates = [
    process.env.KULKA_SOFFICE_PATH,
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/usr/bin/soffice",
    "/usr/local/bin/soffice",
    "/opt/homebrew/bin/soffice",
  ];
  return candidates.find((path) => path && existsSync(path)) ?? null;
}

export async function recalculateWithLibreOffice(xlsx: Buffer, soffice: string): Promise<ExcelJS.Workbook> {
  const dir = await mkdtemp(join(tmpdir(), "kulka-workbook-check-"));
  try {
    const input = join(dir, "in.xlsx");
    const outDir = join(dir, "out");
    await writeFile(input, xlsx);
    // A private profile, so the check never collides with an open LibreOffice window or a parallel run.
    await run(soffice, [
      `-env:UserInstallation=${pathToFileURL(join(dir, "profile")).href}`,
      "--headless",
      "--calc",
      "--convert-to",
      "xlsx",
      "--outdir",
      outDir,
      input,
    ], { timeout: 120_000 });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(join(outDir, "in.xlsx"));
    return workbook;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type WorkbookMismatch = { sheet: string; address: string; id: string; expected: number; actual: number | string | null };

export type WorkbookCheckReport = {
  outputs: number;
  live: number;
  /** Live formula cells as a share of all output cells, 0 to 1. */
  liveShare: number;
  mismatches: WorkbookMismatch[];
};

// Read a formula's result from `cell.result`: exceljs's `value` getter drops a result of 0.
export function numericValue(cell: ExcelJS.Cell | undefined): number | string | null {
  if (!cell) return null;
  const value = cell.formula ? cell.result : cell.value;
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "error" in value) return String(value.error);
  return String(value);
}

/**
 * The loan sizes its own equity and a percent-of-total cost line counts the financing the loan funds, so the
 * workbook is circular and Excel repeats the calculation until it settles. LibreOffice does not settle a
 * loop this size, so this check sets the two cells that close the loop to the engine's own figures and has
 * LibreOffice calculate everything else. Every other debt formula is still calculated from the inputs.
 */
export function closeCircularCells(layout: WorkbookLayout) {
  for (const { cell } of layoutOutputs(layout)) {
    if (cell.id === "loan.equity" || cell.id === "costs.financing") cell.formula = String(cell.engineValue);
  }
}

export function compareWorkbookOutputs(layout: WorkbookLayout, recalculated: ExcelJS.Workbook): WorkbookCheckReport {
  const outputs = layoutOutputs(layout);
  const mismatches: WorkbookMismatch[] = [];
  for (const { sheet, address, cell } of outputs) {
    const actual = numericValue(recalculated.getWorksheet(sheet)?.getCell(address));
    const off = typeof actual !== "number" || Math.abs(actual - cell.engineValue) > TOLERANCE[cell.format];
    if (off) mismatches.push({ sheet, address, id: cell.id, expected: cell.engineValue, actual });
  }
  const live = outputs.filter(({ cell }) => cell.formula).length;
  return { outputs: outputs.length, live, liveShare: outputs.length === 0 ? 0 : live / outputs.length, mismatches };
}

export async function checkWorkbook(layout: WorkbookLayout, soffice: string): Promise<WorkbookCheckReport> {
  const xlsx = await writeUnderwritingWorkbook(layout, { cachedResults: false });
  return compareWorkbookOutputs(layout, await recalculateWithLibreOffice(xlsx, soffice));
}

/**
 * A workbook of the waterfall alone, fed by stated monthly levered cash flow and equity rather than a
 * property run, so an audited waterfall replay checks the waterfall formulas apart from the property cash
 * flow (LA-1952). The Assumptions sheet holds the partnership terms and the replayed months.
 */
export function waterfallReplayLayout(name: string, months: PartnershipCashFlowMonth[], plan: PartnershipPlan, result: PartnershipResult): WorkbookLayout {
  const { sheet, names, ctx } = assumptionsFor({
    caseName: name,
    caseNumber: 1,
    sheetNumber: "Replay",
    address: "",
    caseRevision: 1,
    runId: "waterfall-replay",
    runCreatedAt: "2026-10-08T12:00:00.000Z",
    formulaVersion: "partnership_waterfall_replay",
    inputs: { partnership: plan, replay: months.map(({ month, leveredCashFlow, equityContribution }) => ({ month, leveredCashFlow, equityContribution })) },
    // A replay has no property run. The header and the Assumptions sheet never read one.
    result: null as unknown as PropertyReturnsResult,
  });
  const waterfall = buildWaterfallSheet(ctx, plan, result, {
    months: months.map(({ month }) => month),
    levered: (position) => ctx.input(`replay.${position + 1}.leveredCashFlow`),
    equity: (position) => ctx.input(`replay.${position + 1}.equityContribution`),
  });
  return { sheets: [waterfall.sheet, sheet], names };
}
