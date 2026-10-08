import {
  COST_DISTRIBUTION_VERSIONS,
  computePropertyReturns,
  type CostDistributionMethod,
  type MonthlyCostLine,
  type PropertyReturnsInputs,
} from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { retailCase } from "../../../packages/engine/src/fixtures/commercial-cap-cases";
import { checkWorkbook, findSoffice, numericValue, recalculateWithLibreOffice } from "./check";
import { layoutOutputs, SHEET_NAMES, underwritingWorkbookLayout, type WorkbookLayout, type WorkbookSource } from "./layout";
import { writeUnderwritingWorkbook } from "./write";

// LA-1949. The cost schedule and sources and uses as live formulas. The cases below use
// every way the engine prices and spreads a cost line, so one LibreOffice recalculation
// proves each formula against the engine.

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

function costLine(
  id: string,
  name: string,
  category: MonthlyCostLine["category"],
  startMonth: string,
  endMonth: string,
  method: CostDistributionMethod,
  priced: Pick<MonthlyCostLine, "amount" | "basis"> & Partial<MonthlyCostLine>,
): MonthlyCostLine {
  return {
    id,
    name,
    category,
    unit: "usd",
    startMonth,
    endMonth,
    distributionMethod: method,
    distributionVersion: COST_DISTRIBUTION_VERSIONS[method],
    reviewState: "working",
    ...priced,
  };
}

/**
 * The v2.98 deal with every pricing and timing feature added: per gross square foot and per unit
 * lines, percent of line, all three percent of total bases, milestone anchors with an offset and with
 * a duration, each spreading curve, a grant, a soft loan and credited land. `financed` adds the two
 * percent of total lines that count financing, which the funded loan feeds back.
 */
function everyFeatureInputs(options: { financed: boolean }): PropertyReturnsInputs {
  const inputs = structuredClone(APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs);
  const byId = (id: string) => inputs.costLines.find((line) => line.id === id)!;
  inputs.quantities = { grossSquareFeet: 260_000, units: 220 };
  inputs.milestones = [
    { id: "ntp", name: "Notice to Proceed", month: "2026-02" },
    { id: "co", name: "Certificate of Occupancy", month: "2027-07" },
  ];

  const construction = byId("construction-costs");
  construction.startAnchor = { milestoneId: "ntp", offsetMonths: 0 };
  construction.endAnchor = { durationMonths: 18 };
  construction.distributionMethod = "front_loaded";
  construction.distributionVersion = COST_DISTRIBUTION_VERSIONS.front_loaded;

  const otherHard = byId("other-hard-costs");
  delete otherHard.amount;
  otherHard.basis = { type: "percent_of_line", baseLineId: "construction-costs", percent: 1.5 };
  otherHard.distributionMethod = "back_loaded";
  otherHard.distributionVersion = COST_DISTRIBUTION_VERSIONS.back_loaded;

  const design = byId("architecture-engineering");
  delete design.amount;
  design.basis = { type: "per_gross_square_foot", rate: 9.8 };
  design.startAnchor = { milestoneId: "ntp", offsetMonths: 0 };
  design.endAnchor = { milestoneId: "ntp", offsetMonths: 5 };

  const marketing = byId("marketing-leasing");
  delete marketing.amount;
  marketing.basis = { type: "per_unit", rate: 340 };
  marketing.startAnchor = { milestoneId: "co", offsetMonths: -2 };
  marketing.endAnchor = { milestoneId: "co", offsetMonths: 0 };

  inputs.costLines.push(
    costLine("contingency", "Contingency", "hard_cost", "2026-02", "2027-07", "straight_line", {
      basis: { type: "percent_of_total", base: "hard_and_soft", percent: 3.5 },
    }),
    costLine("contingency-admin", "Contingency Administration", "soft_cost", "2026-02", "2027-07", "s_curve", {
      basis: { type: "percent_of_line", baseLineId: "contingency", percent: 10 },
    }),
    ...(options.financed
      ? [
        costLine("owner-reserve", "Owner Reserve", "soft_cost", "2026-02", "2027-07", "straight_line", {
          basis: { type: "percent_of_total", base: "total_cost", percent: 1.25 },
        }),
        costLine("management-fee", "Management Fee", "development_fee", "2026-02", "2027-07", "straight_line", {
          basis: { type: "percent_of_total", base: "total_less_land", percent: 2 },
        }),
      ]
      : []),
  );

  inputs.otherSources = [
    {
      id: "state-grant",
      name: "State Grant",
      kind: "grant",
      draws: [{ month: "2026-04", amount: 400_000 }, { month: "2026-09", amount: 250_000 }],
      reviewState: "working",
    },
    {
      id: "city-loan",
      name: "City Soft Loan",
      kind: "soft_loan",
      draws: [{ month: "2026-05", amount: 750_000 }],
      annualInterestRatePercent: 3,
      repaymentMonth: "2029-03",
      reviewState: "working",
    },
  ];
  inputs.creditedLand = { creditedValue: 10_000_000, countsAsSponsorEquity: true, reviewState: "working" };
  return inputs;
}

const SOFFICE = findSoffice();
const EVERY_FEATURE = sourceFor("Every Feature", everyFeatureInputs({ financed: true }));

const COST_AND_SOURCES_OUTPUTS = ({ cell }: { cell: { id: string } }) =>
  cell.id.startsWith("costs.") || cell.id.startsWith("su.") || /^monthly\.(projectCosts|totalSources|totalUses|softLoanRepayment|other\.)/.test(cell.id);

describe("cost schedule and sources and uses layout", () => {
  it("writes every cost schedule and sources and uses output as a formula on the v2.98 deal", () => {
    const layout = underwritingWorkbookLayout(sourceFor("v2.98", APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs));
    const outputs = layoutOutputs(layout).filter(COST_AND_SOURCES_OUTPUTS);
    expect(outputs.length).toBeGreaterThan(100);
    expect(outputs.filter(({ cell }) => !cell.formula).map(({ cell }) => cell.id)).toEqual([]);
  });

  it("adds the Percent Settling sheet when a percent of total line needs it", () => {
    const layout = underwritingWorkbookLayout(EVERY_FEATURE);
    expect(layout.sheets.map(({ name }) => name)).toContain(SHEET_NAMES.settling);
  });

  it("writes every output of the every-feature case as a formula except the engine-only ones", () => {
    const layout = underwritingWorkbookLayout(EVERY_FEATURE);
    expect(layoutOutputs(layout).filter(COST_AND_SOURCES_OUTPUTS).filter(({ cell }) => !cell.formula).map(({ cell }) => cell.id)).toEqual([]);
  });

  it("keeps a leasing commission as the engine's value and writes the tenant improvement as a formula", () => {
    const layout = underwritingWorkbookLayout(sourceFor("Retail", retailCase()));
    const outputs = layoutOutputs(layout);
    const amount = (prefix: string) => outputs.find(({ cell }) => cell.id.startsWith(`costs.${prefix}`) && cell.id.endsWith(".amount"))!.cell;
    expect(amount("commercial-ti:").formula).toMatch(/^ROUND\(/);
    expect(amount("commercial-commission:").formula).toBeUndefined();
  });
});

describe("a run whose saved inputs no longer calculate", () => {
  it("fails the layout with a plain message", () => {
    const inputs = structuredClone(EVERY_FEATURE.inputs) as PropertyReturnsInputs;
    inputs.costLines[0].amount = -5;
    expect(() => underwritingWorkbookLayout({ ...EVERY_FEATURE, inputs })).toThrow("saved inputs no longer calculate");
  });
});

describe.skipIf(!SOFFICE)("cost schedule and sources and uses in LibreOffice", () => {
  it("matches the engine on every output when every cost basis, curve and anchor is in use", async () => {
    const check = await checkWorkbook(underwritingWorkbookLayout(EVERY_FEATURE), SOFFICE!);
    expect(check.mismatches).toEqual([]);
    expect(check.live).toBeGreaterThan(1000);
  }, 180_000);

  it("matches the engine on a deal with commercial space", async () => {
    const check = await checkWorkbook(underwritingWorkbookLayout(sourceFor("Retail", retailCase())), SOFFICE!);
    expect(check.mismatches).toEqual([]);
  }, 180_000);

  it("moves the totals the way a new engine run would when a cost input changes in Excel", async () => {
    const original = everyFeatureInputs({ financed: false });
    const changed = structuredClone(original);
    changed.costLines.find(({ id }) => id === "construction-costs")!.amount! *= 1.08;
    changed.costLines.find(({ id }) => id === "contingency")!.basis = { type: "percent_of_total", base: "hard_and_soft", percent: 5 };
    const otherHard = changed.costLines.find(({ id }) => id === "other-hard-costs")!;
    otherHard.basis = { type: "percent_of_line", baseLineId: "construction-costs", percent: 2.5 };
    const construction = changed.costLines.find(({ id }) => id === "construction-costs")!;
    construction.distributionMethod = "s_curve";
    construction.distributionVersion = COST_DISTRIBUTION_VERSIONS.s_curve;
    changed.quantities = { grossSquareFeet: 280_000, units: 230 };
    changed.milestones![0].month = "2026-03";

    const layout: WorkbookLayout = underwritingWorkbookLayout(sourceFor("Before", original));
    const expected = underwritingWorkbookLayout(sourceFor("After", changed));

    // The edits an estimator makes on the Assumptions sheet.
    const edits: Record<string, number | string> = {
      "costLines.3.amount": changed.costLines[2].amount!,
      "costLines.9.basis.percent": 5,
      "costLines.4.basis.percent": 2.5,
      "costLines.3.distributionMethod": "s_curve",
      "quantities.grossSquareFeet": 280_000,
      "quantities.units": 230,
      "milestones.1.month": "2026-03",
    };
    const assumptions = layout.sheets.find(({ name }) => name === SHEET_NAMES.assumptions)!;
    let edited = 0;
    for (const row of assumptions.rows) {
      const [, input, path] = row.cells;
      if (input?.kind === "input" && path?.kind === "text" && path.text in edits) {
        input.value = edits[path.text];
        edited += 1;
      }
    }
    expect(edited).toBe(Object.keys(edits).length);

    const recalculated = await recalculateWithLibreOffice(await writeUnderwritingWorkbook(layout, { cachedResults: false }), SOFFICE!);
    const fresh = new Map(layoutOutputs(expected).map(({ cell }) => [cell.id, cell.engineValue]));
    const compared = layoutOutputs(layout).filter(({ cell }) => /^(costs\.|monthly\.projectCosts\.|su\.cash\.uses\.(land|otherProjectCosts))/.test(cell.id) && cell.id !== "costs.financing");
    const off = compared.flatMap(({ sheet, address, cell }) => {
      const actual = numericValue(recalculated.getWorksheet(sheet)?.getCell(address));
      const want = fresh.get(cell.id);
      return typeof actual === "number" && want !== undefined && Math.abs(actual - want) <= 1 ? [] : [{ id: cell.id, actual, want }];
    });
    expect(compared.length).toBeGreaterThan(500);
    expect(off).toEqual([]);

    // The edit must change the answer, or the comparison above proves nothing.
    const total = layoutOutputs(layout).find(({ cell }) => cell.id === "costs.total.total")!;
    expect(fresh.get("costs.total.total")).not.toBeCloseTo(total.cell.engineValue, 0);
  }, 180_000);
});
