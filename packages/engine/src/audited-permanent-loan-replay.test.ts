import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { MonthlyApartmentOperations } from "./apartment-operations";
import { PERMANENT_LOAN_ASSUMPTION_KEYS, PERMANENT_LOAN_INPUT_VERSION, schedulePermanentLoan, type PermanentLoanPlan, type PermanentLoanResult } from "./permanent-loan";

/*
 * LA-1867. Replays the permanent loan rules on Graybarn's own loan amount and terms, apart from the
 * construction loan the engine sizes differently. The fixture sits in Dropbox with the deal figures,
 * under BLDG/BLDG Labs/DEVELOPMENT/LA-1685 Model Audit/graybarn/permanent-loan-replay.json, built by
 * la-1867-permanent-loan-adapter.py. Point KULKA_MODEL_AUDIT_DIR at that folder; without it this skips.
 * Printed lines carry percents only.
 */

const AUDIT_DIR = process.env.KULKA_MODEL_AUDIT_DIR;
const FIXTURE = AUDIT_DIR ? join(AUDIT_DIR, "graybarn", "permanent-loan-replay.json") : "";

type Replay = {
  loanAmount: number;
  annualRatePercent: number;
  interestOnlyMonths: number;
  amortizationYears: number;
  termYears: number;
  expected: { interestOnlyAnnualDebtService: number; amortizingAnnualDebtService: number; loanYearBalances: number[] };
};

function addMonths(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function replay(fixture: Replay): PermanentLoanResult {
  const funding = "2027-01";
  const evidence = { sourceLabel: "Graybarn replay", reviewState: "working" as const };
  const plan: PermanentLoanPlan = {
    permanentLoanInputVersion: PERMANENT_LOAN_INPUT_VERSION,
    fundingMonth: funding,
    sizingMode: "construction_balance",
    sizingNoiWindow: { kind: "forward_twelve" },
    noiTaxBasis: "full_tax",
    annualRatePercent: fixture.annualRatePercent,
    interestOnlyMonths: fixture.interestOnlyMonths,
    amortizationYears: fixture.amortizationYears,
    termYears: fixture.termYears,
    feePercent: 0,
    closingCosts: 0,
    cashOut: "distribute",
    evidence: Object.fromEntries(PERMANENT_LOAN_ASSUMPTION_KEYS.map((key) => [key, evidence])) as PermanentLoanPlan["evidence"],
  };
  const termMonths = fixture.termYears * 12;
  const months = Array.from({ length: termMonths + 1 }, (_, offset) => ({ month: addMonths(funding, offset), operatingCashFlow: 0 }));
  // The replay needs no NOI: construction balance sizing reads none, so the window holds zeros.
  const operations = months.slice(0, 12).map(({ month }) => ({ month, netOperatingIncome: 0, propertyTax: 0, fullPropertyTax: 0 }) as MonthlyApartmentOperations);
  const loan = schedulePermanentLoan({
    plan,
    fundingMonth: funding,
    fundingTrace: "replay",
    constructionPayoffCents: Math.round(fixture.loanAmount * 100),
    months,
    operations,
    analysisStartMonth: funding,
    operationPaths: [],
  });
  if ("code" in loan) throw new Error(loan.message);
  return loan;
}

const percentOff = (actual: number, expected: number) => `${((actual - expected) / Math.abs(expected) * 100).toFixed(4)}%`;

describe.skipIf(!AUDIT_DIR)("Graybarn permanent loan replay", () => {
  it("matches the workbook's debt service and interest-only balances, and holds its annual-rate balances red", () => {
    expect(existsSync(FIXTURE), `${FIXTURE} is missing`).toBe(true);
    const fixture = JSON.parse(readFileSync(FIXTURE, "utf8")) as Replay;
    const loan = replay(fixture);
    expect(loan.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);

    // Monthly cents rounding on twelve payments moves each annual figure by six cents at most.
    expect(Math.abs(loan.firstYearDebtService - fixture.expected.interestOnlyAnnualDebtService)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(loan.annualDebtService - fixture.expected.amortizingAnnualDebtService)).toBeLessThanOrEqual(0.06);

    const ioYears = fixture.interestOnlyMonths / 12;
    const lines = loan.loanYearBalances.map(({ loanYear, balance }) => {
      const expected = fixture.expected.loanYearBalances[loanYear - 1];
      if (loanYear <= ioYears) expect(Math.abs(balance - expected)).toBeLessThanOrEqual(0.01);
      // Workbook defect: a full year of interest on the opening balance ignores the principal each monthly payment
      // retires, so the workbook charges more interest and its balance stays higher than the monthly schedule's.
      else expect(expected - balance).toBeGreaterThan(1);
      return `year ${loanYear}: ${loanYear <= ioYears ? "matched" : "held red"} ${percentOff(balance, expected)}`;
    });
    expect(loan.payoffAtSale).toBe(loan.loanYearBalances.at(-1)!.balance);
    console.info(["Graybarn permanent loan replay:", `first-year debt service ${percentOff(loan.firstYearDebtService, fixture.expected.interestOnlyAnnualDebtService)}`,
      `amortizing debt service ${percentOff(loan.annualDebtService, fixture.expected.amortizingAnnualDebtService)}`, ...lines].join("\n"));
  });
});
