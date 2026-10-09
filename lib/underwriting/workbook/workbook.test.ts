import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { computePropertyReturns, type PropertyReturnsInputs } from "@kulka/engine";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { checkWorkbook, closeCircularCells, findSoffice } from "./check";
import { columnLetter, layoutOutputs, SHEET_NAMES, underwritingWorkbookLayout, type WorkbookLayout, type WorkbookSource } from "./layout";
import { writeUnderwritingWorkbook } from "./write";

function sourceFor(name: string, inputs: PropertyReturnsInputs): WorkbookSource {
  const run = computePropertyReturns(inputs);
  expect(run.status, run.issues.map(({ code }) => code).join(", ")).toBe("complete");
  return {
    caseName: name,
    caseNumber: 1,
    sheetNumber: "U-101",
    address: "",
    caseRevision: 1,
    runId: "00000000-0000-4000-8000-000000000000",
    runCreatedAt: "2026-10-08T12:00:00.000Z",
    formulaVersion: run.formulaVersion,
    inputs: run.inputSnapshot,
    result: run.result!,
  };
}

const V2_98 = sourceFor("v2.98 Public Sample", APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs);

describe("underwriting workbook layout", () => {
  const layout = underwritingWorkbookLayout(V2_98);

  it("lays out the tabs, with Waterfall, Percent Settling and Lease Terms only when the case needs them", () => {
    expect(layout.sheets.map(({ name }) => name)).toEqual([
      SHEET_NAMES.returns,
      SHEET_NAMES.sourcesAndUses,
      SHEET_NAMES.monthly,
      SHEET_NAMES.loan,
      SHEET_NAMES.waterfall,
      SHEET_NAMES.operations,
      SHEET_NAMES.costs,
      SHEET_NAMES.annual,
      SHEET_NAMES.assumptions,
    ]);
  });

  it("gives every output a finite engine value and a unique id", () => {
    const outputs = layoutOutputs(layout);
    expect(outputs.length).toBeGreaterThan(0);
    expect(outputs.filter(({ cell }) => !Number.isFinite(cell.engineValue)).map(({ cell }) => cell.id)).toEqual([]);
    expect(new Set(outputs.map(({ cell }) => cell.id)).size).toBe(outputs.length);
  });

  it("names every input once, in a form no spreadsheet reads as a cell address", () => {
    const names = layout.names.map(({ name }) => name.toLowerCase());
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => /^in_[a-z0-9_]+$/.test(name))).toBe(true);
  });

  it("totals each monthly flow over exactly the month columns", () => {
    const monthly = layout.sheets.find(({ name }) => name === SHEET_NAMES.monthly)!;
    const months = V2_98.result.developmentCapital.months.length;
    const total = layoutOutputs(layout).find(({ cell }) => cell.id === "monthly.projectCosts.total")!;
    const row = Number(total.address.slice(1));
    expect(total.cell.formula).toBe(`SUM(C${row}:${columnLetter(2 + months - 1)}${row})`);
    expect(monthly.rows[row - 1].cells.length).toBe(2 + months);
  });
});

describe("underwriting workbook file", () => {
  it("opens with its tabs, names and cached engine values", async () => {
    const layout = underwritingWorkbookLayout(V2_98);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(new Uint8Array(await writeUnderwritingWorkbook(layout)).buffer);
    expect(workbook.worksheets.map(({ name }) => name)).toEqual(layout.sheets.map(({ name }) => name));
    const total = layoutOutputs(layout).find(({ cell }) => cell.id === "monthly.projectCosts.total")!;
    expect(workbook.getWorksheet(total.sheet)!.getCell(total.address).value).toEqual({ formula: total.cell.formula, result: total.cell.engineValue });
    expect(workbook.definedNames.model.length).toBe(layout.names.length);
  });
});

/*
 * The LibreOffice check. It needs LibreOffice (`brew install --cask libreoffice`, or set
 * KULKA_SOFFICE_PATH) and skips without it. LibreOffice does not settle the loan's circular equity
 * loop, so each check closes it at the engine's own figures first (closeCircularCells). The three live deals read their inputs from Dropbox
 * through KULKA_MODEL_AUDIT_DIR, as the audited scorecard does, and skip without it.
 */
const SOFFICE = findSoffice();
const AUDIT_DIR = process.env.KULKA_MODEL_AUDIT_DIR;
const DEAL_MODELS = ["benjamin", "jll-214-w-main", "graybarn"] as const;

function report(name: string, check: Awaited<ReturnType<typeof checkWorkbook>>) {
  console.info(`${name}: ${check.live} of ${check.outputs} output cells are live formulas (${(check.liveShare * 100).toFixed(1)}%), ${check.mismatches.length} off.`);
}

describe.skipIf(!SOFFICE)("LibreOffice recalculation check", () => {
  it("matches the engine on every output of the v2.98 sample", async () => {
    const layout = underwritingWorkbookLayout(V2_98);
    closeCircularCells(layout);
    const check = await checkWorkbook(layout, SOFFICE!);
    report("v2.98", check);
    expect(check.mismatches).toEqual([]);
    expect(check.live).toBeGreaterThan(0);
  }, 120_000);

  it("names the cell when a formula drifts from the engine", async () => {
    const layout: WorkbookLayout = underwritingWorkbookLayout(V2_98);
    closeCircularCells(layout);
    const total = layoutOutputs(layout).find(({ cell }) => cell.id === "monthly.projectCosts.total")!;
    total.cell.formula = `${total.cell.formula}+5`;
    const check = await checkWorkbook(layout, SOFFICE!);
    expect(check.mismatches).toEqual([
      { sheet: SHEET_NAMES.monthly, address: total.address, id: "monthly.projectCosts.total", expected: total.cell.engineValue, actual: expect.closeTo(total.cell.engineValue + 5, 2) },
    ]);
  }, 120_000);

  describe.skipIf(!AUDIT_DIR)("audited deals", () => {
    for (const folder of DEAL_MODELS) {
      it(`matches the engine on every output of ${folder}`, async () => {
        const path = join(AUDIT_DIR!, folder, "engine-scorecard-input.json");
        expect(existsSync(path), `${path} is missing`).toBe(true);
        const model = JSON.parse(readFileSync(path, "utf8")) as { engineInputs: PropertyReturnsInputs };
        const layout = underwritingWorkbookLayout(sourceFor(folder, model.engineInputs));
        closeCircularCells(layout);
        const check = await checkWorkbook(layout, SOFFICE!);
        report(folder, check);
        expect(check.mismatches).toEqual([]);
      }, 120_000);
    }
  });
});
