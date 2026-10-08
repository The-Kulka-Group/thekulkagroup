import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import ExcelJS from "exceljs";

import { layoutOutputs, type CellFormat, type WorkbookLayout } from "./layout";
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
function numericValue(cell: ExcelJS.Cell | undefined): number | string | null {
  if (!cell) return null;
  const value = cell.formula ? cell.result : cell.value;
  if (typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "error" in value) return String(value.error);
  return String(value);
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
