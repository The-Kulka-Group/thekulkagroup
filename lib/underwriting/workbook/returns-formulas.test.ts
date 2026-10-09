import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  calculatePropertyReturns,
  computePropertyReturns,
  propertyTaxScheduleEndMonth,
  runPartnershipWaterfall,
  type PartnershipCashFlowMonth,
  type PartnershipPlan,
  type PropertyReturnsInputs,
} from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_PARTNERSHIP } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-partnership";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-returns";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { COMMERCIAL_CAP_EVIDENCE, COMMERCIAL_CAP_PROPERTY_TAX, retailAbatementCase } from "../../../packages/engine/src/fixtures/commercial-cap-cases";
import { checkWorkbook, findSoffice, numericValue, recalculateWithLibreOffice, waterfallReplayLayout } from "./check";
import { layoutOutputs, SHEET_NAMES, underwritingWorkbookLayout, type WorkbookSource } from "./layout";
import { writeUnderwritingWorkbook } from "./write";

// LA-1952. The sale, the returns, the LP and GP waterfall and the annual view as live formulas. With
// these the whole workbook is formulas, so each case checks every output cell, and every one must be live.

function sourceFor(name: string, inputs: PropertyReturnsInputs): WorkbookSource {
  const run = computePropertyReturns(inputs);
  expect(run.status, run.issues.map(({ code, path }) => `${code} at ${path}`).join(", ")).toBe("complete");
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

const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
const partnershipEvidence = { sourceLabel: "Operating agreement draft", sourceDate: "2026-10-08", reviewState: "working" as const };

function partnership(overrides: Partial<PartnershipPlan>): PartnershipPlan {
  return { ...APARTMENT_DEVELOPMENT_V2_98_PARTNERSHIP, ...overrides };
}

const CASES: Record<string, PropertyReturnsInputs> = {
  "v2.98 sample, three hurdle tiers": base,
  "GP first, a preferred return and a late LP close": {
    ...base,
    partnership: partnership({
      fundingOrder: "gp_first",
      lpFundingSharePercent: 85,
      lpEntryMonth: "2026-07",
      preferredReturn: { ratePercent: 8, accrual: "simple_monthly" },
      tiers: [{ lpIrrHurdlePercent: 14, promotePercent: 20, lpBaseSharePercent: 85 }],
      partnershipEvidence: { funding: partnershipEvidence, preferredReturn: partnershipEvidence, promoteTiers: partnershipEvidence },
    }),
  },
  "a compounding preferred return and no hurdle tiers": {
    ...base,
    partnership: partnership({
      preferredReturn: { ratePercent: 10, accrual: "compound_monthly" },
      tiers: [],
      finalSplit: { promotePercent: 25, lpBaseSharePercent: 90 },
      partnershipEvidence: { funding: partnershipEvidence, preferredReturn: partnershipEvidence, promoteTiers: partnershipEvidence },
    }),
  },
  "full tax sale": retailAbatementCase("full_tax"),
  "a commercial exit cap with the abatement's value at sale": retailAbatementCase("full_tax_plus_abatement_value", {
    commercialTerminalCapRatePercent: 7,
    saleAssumptionEvidence: { ...base.saleAssumptionEvidence, commercialTerminalCapRatePercent: COMMERCIAL_CAP_EVIDENCE },
  }),
};

const SOFFICE = findSoffice();
const AUDIT_DIR = process.env.KULKA_MODEL_AUDIT_DIR;

describe("returns layout", () => {
  for (const [name, inputs] of Object.entries(CASES)) {
    it(`writes every output as a formula: ${name}`, () => {
      const layout = underwritingWorkbookLayout(sourceFor(name, inputs));
      const outputs = layoutOutputs(layout);
      expect(outputs.filter(({ cell }) => /^(returns|waterfall|annual)\./.test(cell.id)).length).toBeGreaterThan(100);
      expect(outputs.filter(({ cell }) => !cell.formula).map(({ cell }) => cell.id)).toEqual([]);
    });
  }

  it("adds the Waterfall sheet after the Loan sheet only when the case has a partnership", () => {
    const withPartnership = underwritingWorkbookLayout(sourceFor("v2.98", base)).sheets.map(({ name }) => name);
    expect(withPartnership.indexOf(SHEET_NAMES.waterfall)).toBe(withPartnership.indexOf(SHEET_NAMES.loan) + 1);
    const without = underwritingWorkbookLayout(sourceFor("No partnership", { ...base, partnership: undefined })).sheets.map(({ name }) => name);
    expect(without).not.toContain(SHEET_NAMES.waterfall);
  });

  it("runs the Operations sheet through the end of the tax schedule when the sale adds the abatement's value", () => {
    const source = sourceFor("Abatement value", CASES["a commercial exit cap with the abatement's value at sale"]);
    const layout = underwritingWorkbookLayout(source);
    const operations = layout.sheets.find(({ name }) => name === SHEET_NAMES.operations)!;
    const lastMonth = layoutOutputs(layout).filter(({ cell }) => cell.id.startsWith("ops.netOperatingIncome.") && !cell.id.endsWith(".total")).at(-1)!;
    const scheduleEnd = propertyTaxScheduleEndMonth(COMMERCIAL_CAP_PROPERTY_TAX);
    // Later than the forward year's last month, so the sheet ran past it for the abatement.
    expect(scheduleEnd > source.result.forwardOperations.endMonth).toBe(true);
    expect(lastMonth.cell.id).toBe(`ops.netOperatingIncome.${scheduleEnd}`);
    expect(operations.rows.some((row) => row.cells.length > 2 + source.result.developmentCapital.months.length)).toBe(true);
  });
});

describe.skipIf(!SOFFICE)("returns in LibreOffice", () => {
  for (const [name, inputs] of Object.entries(CASES)) {
    it(`matches the engine on every output, every one live: ${name}`, async () => {
      const layout = underwritingWorkbookLayout(sourceFor(name, inputs));
      const check = await checkWorkbook(layout, SOFFICE!);
      expect(check.mismatches).toEqual([]);
      expect(check.liveShare).toBe(1);
    }, 180_000);
  }

  it("moves IRR and the LP and GP split the way a new engine run would when the exit cap rate changes in Excel", async () => {
    const changed = { ...base, terminalCapRatePercent: 6.25 };
    const layout = underwritingWorkbookLayout(sourceFor("Before", base));
    const expected = underwritingWorkbookLayout(sourceFor("After", changed));
    const assumptions = layout.sheets.find(({ name }) => name === SHEET_NAMES.assumptions)!;
    const row = assumptions.rows.find(({ cells }) => cells[2]?.kind === "text" && cells[2].text === "terminalCapRatePercent")!;
    const input = row.cells[1]!;
    if (input.kind !== "input") throw new Error("The exit cap rate is not an input cell.");
    input.value = 6.25;

    const recalculated = await recalculateWithLibreOffice(await writeUnderwritingWorkbook(layout, { cachedResults: false }), SOFFICE!);
    const fresh = new Map(layoutOutputs(expected).map(({ cell }) => [cell.id, cell]));
    const compared = layoutOutputs(layout).filter(({ cell }) => /^(returns\.|waterfall\.|annual\.|monthly\.(netSaleProceeds|unleveredCashFlow|leveredCashFlow))/.test(cell.id));
    const off = compared.flatMap(({ sheet, address, cell }) => {
      const actual = numericValue(recalculated.getWorksheet(sheet)?.getCell(address));
      const want = fresh.get(cell.id);
      const tolerance = cell.format === "money" ? 1 : 0.0001;
      return typeof actual === "number" && want !== undefined && Math.abs(actual - want.engineValue) <= tolerance ? [] : [{ id: cell.id, actual, want: want?.engineValue }];
    });
    expect(compared.length).toBeGreaterThan(500);
    expect(off).toEqual([]);

    // The new cap rate must change the answer, or the comparison above proves nothing.
    const before = new Map(layoutOutputs(layout).map(({ cell }) => [cell.id, cell.engineValue]));
    for (const id of ["returns.metric.leveredXirr", "returns.partnership.lpDistributions", "returns.partnership.gpDistributions", "returns.partnership.lpXirr"]) {
      expect(fresh.get(id)!.engineValue, id).not.toBeCloseTo(before.get(id)!, 4);
    }
  }, 180_000);

  it("replays the v2.98 workbook's own levered cash flow through the waterfall formulas", async () => {
    const fixture = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE;
    const property = calculatePropertyReturns(fixture.months, fixture.forwardSalePeriod, fixture.plan).result!;
    const months: PartnershipCashFlowMonth[] = property.months.map((month) => ({
      month: month.month,
      date: month.date,
      leveredCashFlow: month.leveredCashFlow,
      equityContribution: Math.max(-month.leveredCashFlow, 0),
    }));
    await expectReplayToMatch("v2.98 replay", months, APARTMENT_DEVELOPMENT_V2_98_PARTNERSHIP);
  }, 180_000);

  describe.skipIf(!AUDIT_DIR)("audited replay", () => {
    it("replays Benjamin's net equity cash flow through the waterfall formulas", async () => {
      const path = join(AUDIT_DIR!, "benjamin", "waterfall-replay.json");
      expect(existsSync(path), `${path} is missing`).toBe(true);
      const replay = JSON.parse(readFileSync(path, "utf8")) as { plan: PartnershipPlan; months: PartnershipCashFlowMonth[] };
      await expectReplayToMatch("Benjamin replay", replay.months, replay.plan);
    }, 180_000);
  });
});

async function expectReplayToMatch(name: string, months: PartnershipCashFlowMonth[], plan: PartnershipPlan) {
  const run = runPartnershipWaterfall(months, plan);
  expect(run.status, JSON.stringify(run.issues)).toBe("complete");
  const layout = waterfallReplayLayout(name, months, plan, run.result!);
  const check = await checkWorkbook(layout, SOFFICE!);
  expect(check.outputs).toBeGreaterThan(months.length * 10);
  expect(check.mismatches).toEqual([]);
  expect(check.liveShare).toBe(1);
}
