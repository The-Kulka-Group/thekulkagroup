import ExcelJS from "exceljs";
import JSZip from "jszip";

import type { CellFormat, LayoutCell, WorkbookLayout } from "./layout";

// LA-1947. Writes a WorkbookLayout to .xlsx. Inputs are blue, live formulas
// black and engine values gray italic, the convention the header states. A
// working formula (kind "calc") has no engine value to cache, so Excel works it
// out on load.

const NUMBER_FORMATS: Record<CellFormat, string> = {
  money: '#,##0;(#,##0);"-"',
  rate: "0.00%",
  multiple: '0.00"x"',
  count: "#,##0",
  percent_number: '0.00"%"',
  basis_points: '#,##0" bps"',
  number: "#,##0.####",
  date: "mmm yyyy",
  text: "@",
};

const INK = "FF323338";
const BRAND = "FF1D1D1F";
const INPUT_BLUE = "FF1F4FD8";
const ENGINE_GRAY = "FF8A8D99";
const RULE = "FFD9DAE0";
const FONT = "Arial";

export type WriteOptions = {
  /**
   * Store each formula's engine value as its cached result, so previews that
   * never calculate still show figures. The LibreOffice check turns this off:
   * LibreOffice keeps a cached result as given, so only an empty cache proves
   * the formula itself was calculated.
   */
  cachedResults?: boolean;
};

function excelDate(isoDate: string) {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function writeCell(cell: ExcelJS.Cell, layoutCell: LayoutCell, columnIndex: number, options: Required<WriteOptions>) {
  switch (layoutCell.kind) {
    case "text": {
      cell.value = layoutCell.text;
      const role = layoutCell.role ?? "label";
      const font: Partial<ExcelJS.Font> = { name: FONT, size: 10, color: { argb: INK } };
      if (role === "title") Object.assign(font, { size: 16, bold: true, color: { argb: BRAND } });
      if (role === "subtitle") Object.assign(font, { size: 12, bold: true, color: { argb: BRAND } });
      if (role === "meta" || role === "note") Object.assign(font, { size: 9, color: { argb: ENGINE_GRAY } });
      if (role === "section") Object.assign(font, { bold: true, color: { argb: BRAND } });
      if (role === "column") {
        Object.assign(font, { bold: true, color: { argb: BRAND } });
        cell.border = { bottom: { style: "thin", color: { argb: RULE } } };
        // Figures sit right of the label column, so their headings align right with them.
        if (columnIndex > 0) cell.alignment = { horizontal: "right" };
      }
      cell.font = font;
      return;
    }
    case "date":
      cell.value = excelDate(layoutCell.value);
      cell.numFmt = NUMBER_FORMATS.date;
      cell.font = { name: FONT, size: 10, bold: true, color: { argb: BRAND } };
      cell.alignment = { horizontal: "right" };
      cell.border = { bottom: { style: "thin", color: { argb: RULE } } };
      return;
    case "input":
      cell.value = layoutCell.value;
      cell.numFmt = NUMBER_FORMATS[layoutCell.format];
      cell.font = { name: FONT, size: 10, color: { argb: INPUT_BLUE } };
      if (layoutCell.format !== "text") cell.alignment = { horizontal: "right" };
      return;
    case "calc":
      if (layoutCell.format !== "text") cell.numFmt = NUMBER_FORMATS[layoutCell.format];
      cell.value = { formula: layoutCell.formula };
      cell.font = { name: FONT, size: 10, color: { argb: INK } };
      if (layoutCell.format === "text") cell.alignment = { horizontal: "left" };
      return;
    case "output":
      cell.numFmt = NUMBER_FORMATS[layoutCell.format];
      if (layoutCell.formula) {
        cell.value = options.cachedResults
          ? { formula: layoutCell.formula, result: layoutCell.engineValue }
          : { formula: layoutCell.formula };
        cell.font = { name: FONT, size: 10, color: { argb: INK } };
      } else {
        cell.value = layoutCell.engineValue;
        cell.font = { name: FONT, size: 10, italic: true, color: { argb: ENGINE_GRAY } };
      }
      return;
  }
}

export async function writeUnderwritingWorkbook(layout: WorkbookLayout, options: WriteOptions = {}): Promise<Buffer> {
  const resolved: Required<WriteOptions> = { cachedResults: options.cachedResults ?? true };
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kulka";
  workbook.calcProperties.fullCalcOnLoad = true;

  for (const sheet of layout.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name, {
      views: [{ state: "frozen", xSplit: sheet.frozen.columns, ySplit: sheet.frozen.rows, showGridLines: false }],
      properties: { outlineLevelRow: 1, defaultRowHeight: 15 },
    });
    worksheet.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
    sheet.columnWidths.forEach((width, index) => {
      worksheet.getColumn(index + 1).width = width;
    });
    sheet.rows.forEach((row, rowIndex) => {
      const excelRow = worksheet.getRow(rowIndex + 1);
      if (row.outlineLevel) excelRow.outlineLevel = row.outlineLevel;
      row.cells.forEach((cell, columnIndex) => {
        if (cell) writeCell(excelRow.getCell(columnIndex + 1), cell, columnIndex, resolved);
      });
    });
  }

  for (const { name, sheet, address } of layout.names) {
    workbook.definedNames.add(`'${sheet}'!${address}`, name);
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  return layout.iterativeCalculation ? withIterativeCalculation(buffer, layout.iterativeCalculation) : buffer;
}

/**
 * exceljs writes only `fullCalcOnLoad` into the workbook's calculation settings, so the iteration
 * settings are added to the saved file's `calcPr` element.
 */
async function withIterativeCalculation(xlsx: Buffer, settings: { maxIterations: number; maxChange: number }): Promise<Buffer> {
  const zip = await JSZip.loadAsync(xlsx);
  const file = zip.file("xl/workbook.xml");
  if (!file) throw new Error("The workbook file has no xl/workbook.xml to set iterative calculation on.");
  const xml = await file.async("string");
  const attributes = `iterate="1" iterateCount="${settings.maxIterations}" iterateDelta="${settings.maxChange}"`;
  const patched = xml.replace(/<calcPr\b/, `<calcPr ${attributes}`);
  if (patched === xml) throw new Error("The workbook file has no calcPr element to set iterative calculation on.");
  zip.file("xl/workbook.xml", patched);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}
