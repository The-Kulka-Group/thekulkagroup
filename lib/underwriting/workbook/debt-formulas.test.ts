import {
  PERMANENT_LOAN_ASSUMPTION_KEYS,
  PERMANENT_LOAN_INPUT_VERSION,
  computePropertyReturns,
  type PermanentLoanPlan,
  type PropertyReturnsInputs,
} from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { COMMERCIAL_CAP_EVIDENCE, lenderTestPlan, retailAbatementCase, retailBlock } from "../../../packages/engine/src/fixtures/commercial-cap-cases";
import { checkWorkbook, closeCircularCells, findSoffice, numericValue, recalculateWithLibreOffice } from "./check";
import { layoutOutputs, SHEET_NAMES, underwritingWorkbookLayout, type WorkbookSource } from "./layout";
import { writeUnderwritingWorkbook } from "./write";

// LA-1951. The construction loan, the interest reserve and the permanent loan as live formulas.
// The cases cover each way the engine sizes and schedules debt, so one LibreOffice recalculation
// per case proves the formulas against the engine.

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

const evidence = { sourceLabel: "Permanent loan quote", sourceDate: "2026-10-07", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
const SALE = "2032-09";

function loan(overrides: Partial<PermanentLoanPlan> = {}): PermanentLoanPlan {
  return {
    permanentLoanInputVersion: PERMANENT_LOAN_INPUT_VERSION,
    fundingAnchor: { kind: "stabilization", offsetMonths: 0 },
    sizingMode: "construction_balance",
    sizingNoiWindow: { kind: "trailing", months: 3 },
    noiTaxBasis: "full_tax",
    annualRatePercent: 6,
    interestOnlyMonths: 24,
    amortizationYears: 30,
    termYears: 10,
    feePercent: 0,
    closingCosts: 0,
    cashOut: "distribute",
    evidence: Object.fromEntries(PERMANENT_LOAN_ASSUMPTION_KEYS.map((key) => [key, evidence])) as PermanentLoanPlan["evidence"],
    ...overrides,
  };
}

const capEvidence = { maxLoanToValuePercent: evidence, valuationCapRatePercent: evidence, minDebtYieldPercent: evidence, minDebtServiceCoverage: evidence, commercialValuationCapRatePercent: evidence };

function withLoan(plan: PermanentLoanPlan, extra: Partial<PropertyReturnsInputs> = {}): PropertyReturnsInputs {
  return { ...base, saleMonth: SALE, payoffMonth: SALE, permanentLoan: plan, ...extra };
}

const CASES: Record<string, PropertyReturnsInputs> = {
  "construction balance, trailing window": withLoan(loan()),
  "lesser of the caps with fee and closing costs": withLoan(loan({
    fundingAnchor: undefined,
    fundingMonth: "2029-03",
    sizingMode: "lesser_of_tests",
    sizingNoiWindow: { kind: "trailing", months: 6 },
    maxLoanToValuePercent: 65,
    valuationCapRatePercent: 5.5,
    minDebtYieldPercent: 7.5,
    minDebtServiceCoverage: 1.3,
    feePercent: 1,
    closingCosts: 150_000,
    interestOnlyMonths: 12,
    amortizationYears: 25,
    evidence: { ...loan().evidence, ...capEvidence },
  })),
  "cut back to the payoff, forward window": withLoan(loan({
    sizingMode: "lesser_of_tests",
    sizingNoiWindow: { kind: "forward_twelve" },
    fundingAnchor: { kind: "stabilization", offsetMonths: 2 },
    maxLoanToValuePercent: 95,
    valuationCapRatePercent: 5.5,
    cashOut: "limit_to_payoff",
    feePercent: 0.75,
    closingCosts: 100_000,
    evidence: { ...loan().evidence, ...capEvidence },
  })),
  "interest only, funded off a milestone": withLoan(loan({
    fundingAnchor: { milestoneId: "co", offsetMonths: 1 },
    amortizationYears: 0,
    interestOnlyMonths: 0,
  }), { milestones: [{ id: "co", name: "Certificate of Occupancy", month: "2028-09" }] }),
  "commercial valuation cap with an abatement": retailAbatementCase("scheduled_tax", {
    permanentLoan: loan({
      sizingMode: "lesser_of_tests",
      sizingNoiWindow: { kind: "forward_twelve" },
      maxLoanToValuePercent: 65,
      valuationCapRatePercent: 5.5,
      commercialValuationCapRatePercent: 7.5,
      evidence: { ...loan().evidence, ...capEvidence },
    }),
  }),
  "construction loan capped by the lender tests": retailAbatementCase("scheduled_tax"),
  "construction caps with a commercial cap rate": retailAbatementCase("scheduled_tax", {
    commercial: retailBlock(10),
    lenderTests: lenderTestPlan({
      commercialCapRatePercent: 7,
      lenderTestEvidence: {
        valuationMonth: COMMERCIAL_CAP_EVIDENCE,
        asStabilizedCapRatePercent: COMMERCIAL_CAP_EVIDENCE,
        annualDebtService: COMMERCIAL_CAP_EVIDENCE,
        noiBasis: COMMERCIAL_CAP_EVIDENCE,
        commercialCapRatePercent: COMMERCIAL_CAP_EVIDENCE,
      },
    }),
  }),
};

const SOFFICE = findSoffice();
const DEBT_OUTPUT = /^(loan\.|monthly\.(operatingShortfall|loanFee|grossInterest|operatingCashAppliedToInterest|capitalizedInterest|equityContribution|debtBeforeReservesDraw|interestReserveDraw|operatingShortfallReserveDraw|totalDebtDraw|otherSourcesApplied|repayment|annualRatePercent|openingDebtBalance|closingDebtBalance|permanent|refinanceCosts))/;

describe("debt layout", () => {
  for (const [name, inputs] of Object.entries(CASES)) {
    it(`writes every debt output as a formula: ${name}`, () => {
      const layout = underwritingWorkbookLayout(sourceFor(name, inputs));
      const outputs = layoutOutputs(layout).filter(({ cell }) => DEBT_OUTPUT.test(cell.id));
      expect(outputs.length).toBeGreaterThan(40);
      expect(outputs.filter(({ cell }) => !cell.formula).map(({ cell }) => cell.id)).toEqual([]);
    });
  }

  it("saves the workbook with iterative calculation on", async () => {
    const layout = underwritingWorkbookLayout(sourceFor("v2.98", base));
    expect(layout.iterativeCalculation).toEqual({ maxIterations: 1000, maxChange: 0.001 });
    const xlsx = await writeUnderwritingWorkbook(layout);
    const { default: JSZip } = await import("jszip");
    const xml = await (await JSZip.loadAsync(xlsx)).file("xl/workbook.xml")!.async("string");
    expect(xml).toMatch(/<calcPr [^>]*iterate="1"[^>]*iterateCount="1000"[^>]*iterateDelta="0.001"/);
  });

  it("holds the loan sizing in a Loan sheet after the Monthly sheet", () => {
    const names = underwritingWorkbookLayout(sourceFor("v2.98", base)).sheets.map(({ name }) => name);
    expect(names.indexOf(SHEET_NAMES.loan)).toBe(names.indexOf(SHEET_NAMES.monthly) + 1);
  });
});

describe.skipIf(!SOFFICE)("debt in LibreOffice, with the circular cells closed at the engine's figures", () => {
  for (const [name, inputs] of Object.entries(CASES)) {
    it(`matches the engine on every output: ${name}`, async () => {
      const layout = underwritingWorkbookLayout(sourceFor(name, inputs));
      closeCircularCells(layout);
      const check = await checkWorkbook(layout, SOFFICE!);
      expect(check.mismatches).toEqual([]);
    }, 180_000);
  }

  it("moves the permanent loan the way a new engine run would when its terms change in Excel", async () => {
    const original = CASES["lesser of the caps with fee and closing costs"];
    const changed = structuredClone(original);
    const plan = changed.permanentLoan!;
    plan.annualRatePercent = 6.75;
    plan.feePercent = 1.5;
    plan.maxLoanToValuePercent = 55;
    plan.interestOnlyMonths = 6;
    plan.amortizationYears = 30;

    const layout = underwritingWorkbookLayout(sourceFor("Before", original));
    const expected = underwritingWorkbookLayout(sourceFor("After", changed));
    closeCircularCells(layout);
    const edits: Record<string, number> = {
      "permanentLoan.annualRatePercent": 6.75,
      "permanentLoan.feePercent": 1.5,
      "permanentLoan.maxLoanToValuePercent": 55,
      "permanentLoan.interestOnlyMonths": 6,
      "permanentLoan.amortizationYears": 30,
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
    const compared = layoutOutputs(layout).filter(({ cell }) => /^(loan\.p|monthly\.(permanent|refinance))/.test(cell.id));
    const off = compared.flatMap(({ sheet, address, cell }) => {
      const actual = numericValue(recalculated.getWorksheet(sheet)?.getCell(address));
      const want = fresh.get(cell.id);
      return typeof actual === "number" && want !== undefined && Math.abs(actual - want) <= 1 ? [] : [{ id: cell.id, actual, want }];
    });
    expect(compared.length).toBeGreaterThan(150);
    expect(off).toEqual([]);

    // The edit must change the answer, or the comparison above proves nothing.
    const amount = layoutOutputs(layout).find(({ cell }) => cell.id === "loan.pLoan")!;
    expect(fresh.get("loan.pLoan")).not.toBeCloseTo(amount.cell.engineValue, 0);
  }, 180_000);
});
