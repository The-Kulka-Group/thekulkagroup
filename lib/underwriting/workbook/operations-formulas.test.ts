import { computePropertyReturns, type PropertyReturnsInputs, type PropertyTaxPlan } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { COMMERCIAL_CAP_EVIDENCE, COMMERCIAL_CAP_PROPERTY_TAX, retailBlock, saleTaxPlan } from "../../../packages/engine/src/fixtures/commercial-cap-cases";
import { checkWorkbook, closeCircularCells, findSoffice, numericValue, recalculateWithLibreOffice } from "./check";
import { layoutOutputs, SHEET_NAMES, underwritingWorkbookLayout, type WorkbookSource } from "./layout";
import { writeUnderwritingWorkbook } from "./write";

// LA-1950. Operations through net operating income as live formulas. Each case turns on a group of
// features the audited deals do not all reach, and one LibreOffice recalculation checks every
// operations output against the engine.

const evidence = COMMERCIAL_CAP_EVIDENCE;
const base = () => structuredClone(APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs);

function sourceFor(name: string, inputs: PropertyReturnsInputs): WorkbookSource {
  const run = computePropertyReturns(inputs);
  expect(run.status, run.issues.map(({ code, path, message }) => `${code} at ${path}: ${message}`).join("; ")).toBe("complete");
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

/** Three unit types across the tiers, seasonal absorption, a stabilization rule, a concession at move-in, growth by category, lead months and variable shares. */
function leasingInputs(turnoverBasis?: "each_new_lease_once" | "every_expiring_lease" | "net_units_gained"): PropertyReturnsInputs {
  const inputs = base();
  inputs.residentialUnitTypes = [
    { id: "market", name: "Market", units: 180, nonRevenueUnits: 2, averageAreaSf: 850, monthlyMarketRent: 1850, ...evidence },
    { id: "workforce", name: "Workforce", units: 80, nonRevenueUnits: 0, averageAreaSf: 780, monthlyMarketRent: 1500, affordabilityTier: "workforce", amiPercent: 100, ...evidence },
    { id: "affordable", name: "Affordable", units: 40, nonRevenueUnits: 0, averageAreaSf: 700, monthlyMarketRent: 1100, affordabilityTier: "affordable", amiPercent: 60, ...evidence },
  ];
  inputs.preleasedUnits = 25;
  inputs.leaseUpUnitsPerMonth = 18;
  inputs.freeRentPercent = 1.5;
  inputs.rentAdjustmentLossPercent = 0.75;
  inputs.leaseUpConcession = { monthsFree: 1.5, leaseTermMonths: 12, timing: "at_move_in", ...evidence };
  inputs.seasonalAbsorption = { monthlyFactors: [0.6, 0.7, 1.1, 1.3, 1.4, 1.5, 1.4, 1.2, 1, 0.8, 0.6, 0.5], ...evidence };
  inputs.stabilizationRule = { targetOccupancyPercent: 93, holdMonths: 3, ...evidence };
  inputs.categoryGrowth = {
    marketRentPercent: [2.5, 3, 3.5],
    affordableRentPercent: [1, 1.5],
    otherIncomePercent: [2],
    operatingExpensePercent: [3, 3.5, 4, 4.5],
    ...evidence,
  };
  inputs.otherIncomeLines.push({ id: "storage", name: "Storage", amount: 36_000, unit: "usd_per_year", ...evidence });
  inputs.operatingExpenseLines.push(
    { id: "pre-opening", name: "Pre-Opening Staffing", amount: 84_000, unit: "usd_per_year", leadMonths: 3, variablePercent: 20, ...evidence },
    { id: "unit-turn", name: "Unit Turns", amount: 410, unit: "usd_per_unit_year", variablePercent: 60, ...evidence },
  );
  inputs.capitalExpenditureLines.push({ id: "unit-reserve", name: "Unit Reserve", amount: 150, unit: "usd_per_unit_year", variablePercent: 40, ...evidence });
  if (turnoverBasis) inputs.leaseTurnover = { turnoverPercent: turnoverBasis === "every_expiring_lease" ? 8 : 35, leaseTermMonths: 6, vacantMonths: 2, basis: turnoverBasis, ...evidence };
  return inputs;
}

function occupancyCapInputs(): PropertyReturnsInputs {
  const inputs = leasingInputs();
  inputs.occupancyCap = { ...evidence };
  inputs.stabilizationRule = { targetOccupancyPercent: 94, holdMonths: 2, ...evidence };
  inputs.leaseUpConcession = { monthsFree: 1, leaseTermMonths: 13, timing: "spread_over_term", ...evidence };
  return inputs;
}

const incomeTax = (overrides: Partial<PropertyTaxPlan> = {}): PropertyTaxPlan => ({
  ...COMMERCIAL_CAP_PROPERTY_TAX,
  assessmentBasis: "income",
  landAssessedValue: undefined,
  improvementAssessedValue: undefined,
  assessorExpenseRatioPercent: 35,
  assessmentCapRatePercent: 7,
  leaseUpAssessmentCapRatePercent: 9,
  assessmentRatioPercent: 100,
  rateUnit: "percent_of_assessed_value",
  fiscalYears: [
    { rate: 1.2, exemptionPercent: 100 },
    { rate: 1.2, exemptionPercent: 75, statedPayment: 180_000 },
    { rate: 1.25, exemptionPercent: 50 },
  ],
  ...overrides,
});

/** Two retail spaces (one anchored to a milestone), recoveries on the tax and on expense lines, and commercial-only expense lines. */
function commercialInputs(tax: PropertyTaxPlan | null): PropertyReturnsInputs {
  const inputs = leasingInputs();
  const block = retailBlock(10);
  inputs.milestones = [{ id: "co", name: "Certificate of Occupancy", month: "2027-08" }];
  block.spaces = [
    {
      ...block.spaces[0],
      leaseStartMonth: "2027-09",
      freeRentMonths: 3,
      recoveries: [
        ...(tax ? [{ basis: { kind: "property_tax" as const }, sharePercent: 12 }] : []),
        { basis: { kind: "expense_lines" as const, lineIds: ["insurance", "repairs-maintenance", "commercial-cam"] } },
      ],
    },
    {
      ...block.spaces[0],
      id: "retail-b",
      name: "Retail B",
      areaSf: 4_500,
      annualRentPerSf: 34.5,
      leaseStartMonth: undefined,
      leaseStartAnchor: { milestoneId: "co", offsetMonths: 3 },
      freeRentMonths: 0,
      leasingCommissionPercent: 4.5,
      leaseTermMonths: 84,
      recoveries: [{ basis: { kind: "expense_lines", lineIds: ["insurance"] }, sharePercent: 20 }],
    },
  ];
  delete block.spaces[1].leaseStartMonth;
  inputs.commercial = block;
  inputs.operatingExpenseLines.push(
    { id: "commercial-cam", name: "Common Area Maintenance", amount: 60_000, unit: "usd_per_year", appliesTo: "commercial", leadMonths: 2, ...evidence },
    { id: "commercial-management", name: "Commercial Management", amount: 4, unit: "percent_effective_gross_revenue", appliesTo: "commercial", ...evidence },
  );
  inputs.categoryGrowth = { ...inputs.categoryGrowth!, commercialRentPercent: [2, 2.5, 3] };
  if (tax) {
    inputs.propertyTax = tax;
    if (tax.mode === "abatement") inputs.saleTax = saleTaxPlan("full_tax");
  }
  return inputs;
}

const CASES: Array<[string, () => PropertyReturnsInputs]> = [
  ["leasing features with each new lease turning once", () => leasingInputs("each_new_lease_once")],
  ["leasing features with every expiring lease turning", () => leasingInputs("every_expiring_lease")],
  ["leasing features with net units gained turning", () => leasingInputs("net_units_gained")],
  ["occupancy cap with a spread concession", () => occupancyCapInputs()],
  ["commercial spaces with stated tax, an abatement and a stated payment", () => commercialInputs({
    ...COMMERCIAL_CAP_PROPERTY_TAX,
    fiscalYears: [
      { rate: 20, exemptionPercent: 100 },
      { rate: 20, exemptionPercent: 80, statedPayment: 150_000 },
      { rate: 20, exemptionPercent: 60 },
    ],
  })],
  ["commercial spaces with stated tax at full tax", () => commercialInputs({
    ...COMMERCIAL_CAP_PROPERTY_TAX,
    mode: "full_tax",
    fiscalYears: COMMERCIAL_CAP_PROPERTY_TAX.fiscalYears.map(({ rate }) => ({ rate, exemptionPercent: 0 })),
  })],
  ["commercial spaces with income-basis tax and a lease-up cap rate", () => commercialInputs(incomeTax())],
  ["commercial spaces with income-basis tax at full tax", () => commercialInputs(incomeTax({ mode: "full_tax", leaseUpAssessmentCapRatePercent: undefined, fiscalYears: [{ rate: 1.2, exemptionPercent: 0 }, { rate: 1.25, exemptionPercent: 0 }] }))],
];

const SOFFICE = findSoffice();
const isOperationsOutput = ({ cell }: { cell: { id: string } }) => cell.id.startsWith("ops.") || cell.id.startsWith("lease.");

describe("operations as live formulas", () => {
  it("writes every operations output as a formula", () => {
    const layout = underwritingWorkbookLayout(sourceFor("v2.98", base()));
    const outputs = layoutOutputs(layout).filter(isOperationsOutput);
    expect(outputs.length).toBeGreaterThan(500);
    expect(outputs.filter(({ cell }) => !cell.formula).map(({ cell }) => cell.id)).toEqual([]);
  });

  it("adds Lease Terms only when there is commercial space, and writes the leasing commission as a formula", () => {
    expect(underwritingWorkbookLayout(sourceFor("v2.98", base())).sheets.map(({ name }) => name)).not.toContain(SHEET_NAMES.leaseTerms);
    const layout = underwritingWorkbookLayout(sourceFor("Commercial", commercialInputs(null)));
    expect(layout.sheets.map(({ name }) => name)).toContain(SHEET_NAMES.leaseTerms);
    const commissions = layoutOutputs(layout).filter(({ cell }) => /^costs\.commercial-commission:.*\.amount$/.test(cell.id));
    expect(commissions.length).toBe(2);
    expect(commissions.filter(({ cell }) => !cell.formula)).toEqual([]);
  });

  it("refuses to write a formula longer than Excel allows", () => {
    const inputs = base();
    inputs.residentialUnitTypes = Array.from({ length: 130 }, (_, i) => ({
      id: `type-${i}`,
      name: `Type ${i}`,
      units: 3,
      nonRevenueUnits: 0,
      averageAreaSf: 700 + i,
      monthlyMarketRent: 1500 + i,
      ...evidence,
    }));
    inputs.preleasedUnits = 30;
    inputs.leaseUpUnitsPerMonth = 20;
    expect(() => underwritingWorkbookLayout(sourceFor("Many Types", inputs))).toThrow("longer than Excel allows");
  });

  it("feeds the Monthly sheet's operating cash flow from the Operations sheet", () => {
    const layout = underwritingWorkbookLayout(sourceFor("v2.98", base()));
    const cell = layoutOutputs(layout).find(({ cell: output }) => output.id.startsWith("monthly.operatingCashFlow.2027"))!.cell;
    expect(cell.formula).toMatch(/^'Operations'!/);
  });
});

describe.skipIf(!SOFFICE)("operations in LibreOffice", () => {
  it("matches the engine on every output of the v2.98 sample", async () => {
    const layout = underwritingWorkbookLayout(sourceFor("v2.98", base()));
    closeCircularCells(layout);
    const check = await checkWorkbook(layout, SOFFICE!);
    expect(check.mismatches).toEqual([]);
  }, 180_000);

  for (const [name, inputs] of CASES) {
    it(`matches the engine on every output with ${name}`, async () => {
      const layout = underwritingWorkbookLayout(sourceFor(name, inputs()));
      closeCircularCells(layout);
      const check = await checkWorkbook(layout, SOFFICE!);
      expect(check.mismatches).toEqual([]);
    }, 180_000);
  }

  /** Edits Assumptions cells in a layout built from `original`, recalculates, and compares to a fresh engine run of `changed`. */
  async function movesLikeANewRun(original: PropertyReturnsInputs, changed: PropertyReturnsInputs, edits: Record<string, number | string>) {
    const layout = underwritingWorkbookLayout(sourceFor("Before", original));
    const expected = underwritingWorkbookLayout(sourceFor("After", changed));
    closeCircularCells(layout);
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
    const compared = layoutOutputs(layout).filter(({ cell }) => isOperationsOutput({ cell }) || cell.id.startsWith("monthly.operatingCashFlow."));
    const off = compared.flatMap(({ sheet, address, cell }) => {
      const actual = numericValue(recalculated.getWorksheet(sheet)?.getCell(address));
      const want = fresh.get(cell.id);
      const tolerance = cell.format === "money" ? 1 : 0.01;
      return typeof actual === "number" && want !== undefined && Math.abs(actual - want) <= tolerance ? [] : [{ id: cell.id, actual, want }];
    });
    expect(compared.length).toBeGreaterThan(500);
    expect(off).toEqual([]);
    const before = layoutOutputs(layout).find(({ cell }) => cell.id === "ops.netOperatingIncome.total")!.cell.engineValue;
    expect(fresh.get("ops.netOperatingIncome.total")).not.toBeCloseTo(before, 0);
  }

  it("moves net operating income the way a new engine run would when a rent or expense changes in Excel", async () => {
    const original = leasingInputs("every_expiring_lease");
    const changed = structuredClone(original);
    changed.residentialUnitTypes[0].monthlyMarketRent = 1960;
    changed.residentialUnitTypes[2].monthlyMarketRent = 1175;
    changed.operatingExpenseLines.find(({ id }) => id === "payroll")!.amount = 430_000;
    changed.otherIncomeLines.find(({ id }) => id === "storage")!.amount = 42_000;
    changed.vacancyPercent = 6;
    changed.leaseUpUnitsPerMonth = 22;
    changed.categoryGrowth!.operatingExpensePercent = [3, 3.5, 5, 4.5];
    await movesLikeANewRun(original, changed, {
      "residentialUnitTypes.1.monthlyMarketRent": 1960,
      "residentialUnitTypes.3.monthlyMarketRent": 1175,
      "operatingExpenseLines.2.amount": 430_000,
      "otherIncomeLines.4.amount": 42_000,
      vacancyPercent: 6,
      leaseUpUnitsPerMonth: 22,
      "categoryGrowth.operatingExpensePercent.3": 5,
    });
  }, 240_000);

  it("moves net operating income the way a new engine run would when commercial rent or the tax rate changes in Excel", async () => {
    const original = commercialInputs(incomeTax());
    const changed = structuredClone(original);
    changed.commercial!.spaces[0].annualRentPerSf = 33;
    changed.commercial!.spaces[1].freeRentMonths = 2;
    changed.commercial!.vacancyPercent = 7;
    changed.propertyTax!.fiscalYears[2].rate = 1.4;
    changed.propertyTax!.assessmentCapRatePercent = 7.5;
    await movesLikeANewRun(original, changed, {
      "commercial.spaces.1.annualRentPerSf": 33,
      "commercial.spaces.2.freeRentMonths": 2,
      "commercial.vacancyPercent": 7,
      "propertyTax.fiscalYears.3.rate": 1.4,
      "propertyTax.assessmentCapRatePercent": 7.5,
    });
  }, 240_000);
});
