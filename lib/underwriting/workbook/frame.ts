import type { PropertyReturnsInputs, PropertyReturnsResult } from "@kulka/engine";

// LA-1947, LA-1949. What every sheet builder shares: the layout types, cell addresses,
// the Kulka header and the small formula pieces that turn an input into a month.

export type CellFormat = "money" | "rate" | "multiple" | "count" | "percent_number" | "basis_points" | "number" | "date" | "text";

export type LayoutCell =
  | { kind: "text"; text: string; role?: "title" | "subtitle" | "meta" | "section" | "column" | "label" | "note" }
  | { kind: "input"; value: number | string | boolean; format: CellFormat; name?: string }
  | { kind: "date"; value: string }
  /** A figure the engine also produced. */
  | { kind: "output"; id: string; format: CellFormat; engineValue: number; formula?: string }
  /** A working formula the engine has no figure for, such as a round of the percent-of-total solve or a label read from an input. Not compared. */
  | { kind: "calc"; formula: string; format: CellFormat };

export type LayoutRow = { cells: Array<LayoutCell | null>; outlineLevel?: number };

export type LayoutSheet = {
  name: string;
  columnWidths: number[];
  /** Rows and columns frozen at the top left. */
  frozen: { rows: number; columns: number };
  rows: LayoutRow[];
};

export type WorkbookLayout = { sheets: LayoutSheet[]; names: Array<{ name: string; sheet: string; address: string }> };

export type WorkbookSource = {
  caseName: string;
  caseNumber: number;
  sheetNumber: string;
  address: string;
  caseRevision: number;
  runId: string;
  runCreatedAt: string;
  formulaVersion: string;
  inputs: unknown;
  result: PropertyReturnsResult;
};

export const SHEET_NAMES = {
  returns: "Returns",
  sourcesAndUses: "Sources and Uses",
  monthly: "Monthly",
  operations: "Operations",
  costs: "Costs",
  leaseTerms: "Lease Terms",
  settling: "Percent Settling",
  annual: "Annual",
  assumptions: "Assumptions",
} as const;

/** Rows 1 to 4 are the Kulka header on every sheet, row 5 is blank, and content starts on row 6. */
export const HEADER_ROWS = 5;

export function columnLetter(index: number): string {
  let n = index + 1;
  let letters = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

export function cellAddress(rowIndex: number, columnIndex: number) {
  return `${columnLetter(columnIndex)}${rowIndex + 1}`;
}

/** `$K$7`: a cell that keeps its place when a formula is copied across or down. */
export function absoluteAddress(rowIndex: number, columnIndex: number) {
  return `$${columnLetter(columnIndex)}$${rowIndex + 1}`;
}

/** A reference to a cell or range on another sheet. */
export function sheetRef(sheet: string, address: string) {
  return `'${sheet}'!${address}`;
}

export function header(source: WorkbookSource, sheetTitle: string): LayoutRow[] {
  const ran = new Date(source.runCreatedAt).toISOString().slice(0, 10);
  return [
    { cells: [{ kind: "text", text: `Kulka  |  ${sheetTitle}`, role: "title" }] },
    { cells: [{ kind: "text", text: `${source.caseName}, Case ${source.caseNumber} (Sheet ${source.sheetNumber})`, role: "subtitle" }] },
    { cells: [{ kind: "text", text: `Run ${source.runId} on ${ran}, revision ${source.caseRevision}, formula version ${source.formulaVersion}`, role: "meta" }] },
    { cells: [{ kind: "text", text: "Blue figures are inputs. Black figures are live formulas. Gray figures are the engine's saved values and are not yet formulas.", role: "note" }] },
    { cells: [] },
  ];
}

/** The Excel date of the first day of the month held in a YYYY-MM text cell. */
export function dateOfMonthText(textRef: string) {
  return `DATE(VALUE(LEFT(${textRef},4)),VALUE(MID(${textRef},6,2)),1)`;
}

/** Months counted from year zero, so two dates subtract to a whole number of months. */
export function monthCount(dateExpression: string) {
  return `(YEAR(${dateExpression})*12+MONTH(${dateExpression}))`;
}

export function monthIndexOf(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return year * 12 + monthNumber - 1;
}

/** Everything a sheet builder needs to point at the Assumptions sheet. */
export type LayoutContext = {
  source: WorkbookSource;
  /** The Excel name of the Assumptions cell for an input path such as `costLines.1.amount`. Throws for a path the sheet does not hold. */
  input: (path: string) => string;
  has: (path: string) => boolean;
};

/** A month as an Excel date: a typed month, or a milestone's month moved by an offset in months. */
export function anchoredDate(ctx: LayoutContext, anchor: { milestoneId: string; offsetMonths: number } | undefined, anchorPath: string, typedPath: string) {
  if (!anchor) return dateOfMonthText(ctx.input(typedPath));
  const milestones = (ctx.source.inputs as PropertyReturnsInputs).milestones ?? [];
  const found = milestones.findIndex(({ id }) => id === anchor.milestoneId);
  if (found < 0) throw new Error(`The anchor at ${anchorPath} points at a milestone the case does not hold.`);
  return `EDATE(${dateOfMonthText(ctx.input(`milestones.${found + 1}.month`))},${ctx.input(`${anchorPath}.offsetMonths`)})`;
}

/** Excel refuses a formula longer than 8,192 characters. The workbook stops short of that rather than write a file Excel must repair. */
export const MAX_FORMULA_LENGTH = 8_000;

export class WorkbookFormulaTooLongError extends Error {
  constructor(sheet: string, address: string, length: number) {
    super(`The formula at ${sheet}!${address} is ${length} characters, longer than Excel allows.`);
    this.name = "WorkbookFormulaTooLongError";
  }
}

export function assertFormulasFit(layout: WorkbookLayout) {
  for (const sheet of layout.sheets) {
    sheet.rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, columnIndex) => {
        const formula = cell && (cell.kind === "output" || cell.kind === "calc") ? cell.formula : undefined;
        if (formula && formula.length > MAX_FORMULA_LENGTH) throw new WorkbookFormulaTooLongError(sheet.name, cellAddress(rowIndex, columnIndex), formula.length);
      });
    });
  }
}
