import type { PropertyReturnsInputs } from "@kulka/engine";

import {
  HEADER_ROWS,
  SHEET_NAMES,
  anchoredDate,
  dateOfMonthText,
  header,
  monthCount,
  sheetRef,
  type CellFormat,
  type LayoutCell,
  type LayoutContext,
  type LayoutRow,
  type LayoutSheet,
  type WorkbookLayout,
} from "./frame";
import type { OperationsBuild } from "./operations";

// LA-1951. The Loan sheet: the figures the construction loan reads once for the whole deal,
// following development-capital.ts. The Monthly sheet holds the month by month draws; this sheet
// holds the dates, the fee, the rate curve and the equity the loan commits.
//
// The equity commitment is the one circular figure. It is total uses less the target debt less
// grants and soft loans, and total uses include the interest the loan reserves, which depends on
// how much equity went in first. The engine repeats that until it settles (solveEquityCommitment).
// Excel's iterative calculation did not settle it (LA-2022), so the commitment is the engine's figure
// as a blue input, and the row under it shows what the formulas give and the gap.

/** How the Monthly sheet reads the Loan sheet. */
export type LoanBuild = {
  /** The absolute reference of a figure on the Loan sheet. */
  ref: (key: string) => string;
  /** The rate-curve lookup for a month, as an expression of that month's heading date. */
  baseRate: (monthDate: string) => string;
  /** Builds the sheet once the Monthly sheet knows where its rows are. */
  finish: (monthly: MonthlyAccess) => LayoutSheet;
};

export type MonthlyAccess = {
  /** The Total column cell of a Monthly row, absolute. */
  total: (key: string) => string;
};

type Entry =
  | { kind: "section"; title: string }
  | { kind: "blank" }
  | { kind: "scalar"; key: string; label: string; format: CellFormat; formula: (R: (key: string) => string, m: MonthlyAccess) => string; engine?: number; note?: string }
  | { kind: "input"; key: string; label: string; format: CellFormat; value: number; name: string; note?: string };

const EQUITY_NAME = "in_workbook_equity_commitment";

export function createLoan(ctx: LayoutContext, operations: OperationsBuild, names: WorkbookLayout["names"]): LoanBuild {
  const { source } = ctx;
  const inputs = source.inputs as PropertyReturnsInputs;
  const capital = source.result.developmentCapital;
  const n = (path: string) => ctx.input(path);
  const entries: Entry[] = [];
  const section = (title: string) => entries.push({ kind: "section", title });
  const blank = () => entries.push({ kind: "blank" });
  const scalar = (key: string, label: string, format: CellFormat, formula: Extract<Entry, { kind: "scalar" }>["formula"], engine?: number, note?: string) =>
    entries.push({ kind: "scalar", key, label, format, formula, engine, note });

  const permanent = inputs.permanentLoan;
  const ratePath = inputs.ratePath;
  const share = n("targetDebtSharePercent");
  const feePercent = n("loanFeePercent");

  // ------------------------------------------------------------------ dates
  section("Construction Loan Dates");
  scalar("feeDate", "Loan Fee Month", "date", () => dateOfMonthText(n("feeMonth")));
  if (permanent) {
    scalar("takeoutDate", "Permanent Loan Funding Month, When the Construction Loan Repays", "date", () => {
      if (permanent.fundingMonth !== undefined) return dateOfMonthText(n("permanentLoan.fundingMonth"));
      const anchor = permanent.fundingAnchor!;
      if ("milestoneId" in anchor) return anchoredDate(ctx, anchor, "permanentLoan.fundingAnchor", "permanentLoan.fundingMonth");
      return `EDATE(INDEX(${operations.dates()},MATCH(1,${operations.range("stabilized")},0)),${n("permanentLoan.fundingAnchor.offsetMonths")})`;
    });
    scalar("repayDate", "Construction Loan Repayment Month", "date", (R) => R("takeoutDate"));
  } else {
    scalar("repayDate", "Construction Loan Repayment Month", "date", () => dateOfMonthText(n("payoffMonth")));
  }

  // ---------------------------------------------------------------- rate path
  const points = ratePath?.baseRates ?? [];
  if (ratePath) {
    blank();
    section("Rate Curve");
    scalar("curveFirstDate", "First Month of the Curve", "date", () => dateOfMonthText(n("ratePath.baseRates.1.month")));
    scalar("spread", "Spread (Percent)", "percent_number", () => n("ratePath.spreadPercent"));
  }

  // ----------------------------------------------- construction loan sizing caps
  const lender = inputs.lenderTests;
  const sizing = lender?.loanSizing;
  const hasCeiling = capital.debtCeiling != null;
  const dates = operations.dates();
  const sumOver = (rowKey: string, start: string, end: string) => `SUMIFS(${operations.range(rowKey)},${dates},">="&${start},${dates},"<="&${end})`;
  const centsOver = (rowKey: string, start: string, end: string) => `ROUND(${sumOver(rowKey, start, end)}*100,0)`;
  const hasTax = inputs.propertyTax !== undefined;
  /** Annual debt service per dollar of loan, as annualDebtConstant in lender-tests.ts. */
  const debtConstant = (ratePercent: string, years: string) => `IF(${years}=0,${ratePercent}/100,12*(${ratePercent}/100/12)/(1-(1+${ratePercent}/100/12)^(-${years}*12)))`;

  if (sizing && lender && hasCeiling) {
    blank();
    section("Construction Loan Caps, From the Lender Tests");
    const capRate = n("lenderTests.asStabilizedCapRatePercent");
    const commercialCap = lender.commercialCapRatePercent !== undefined ? n("lenderTests.commercialCapRatePercent") : null;
    const fullTax = `${n("lenderTests.loanSizing.noiTaxBasis")}="full_tax"`;
    scalar("cStart", "Valuation Year Start", "date", () => dateOfMonthText(n("lenderTests.valuationMonth")));
    scalar("cEnd", "Valuation Year End", "date", (R) => `EDATE(${R("cStart")},11)`);
    scalar("cScheduledCents", "Valuation Year NOI With Scheduled Tax (Cents)", "number", (R) =>
      `IF(${n("lenderTests.noiBasis")}="noi_after_reserves",${centsOver("operatingCashFlow", R("cStart"), R("cEnd"))},${centsOver("netOperatingIncome", R("cStart"), R("cEnd"))})`);
    scalar("cAbatementCents", "Tax Added by Ending the Abatement (Cents)", "number", (R) =>
      (hasTax ? `${centsOver("fullPropertyTax", R("cStart"), R("cEnd"))}-${centsOver("propertyTax", R("cStart"), R("cEnd"))}` : "0"));
    scalar("cNoiCents", "Sizing NOI (Cents)", "number", (R) => `IF(${fullTax},${R("cScheduledCents")}-${R("cAbatementCents")},${R("cScheduledCents")})`);
    if (commercialCap !== null) {
      scalar("cCommercialCents", "Commercial Part of the Sizing NOI (Cents)", "number", (R) =>
        `${centsOver("commercialNetOperatingIncome", R("cStart"), R("cEnd"))}-IF(${fullTax},${sumOver("commercialAddedTax", R("cStart"), R("cEnd"))},0)`);
    }
    const capKeys: string[] = [];
    if (sizing.maxLoanToValuePercent !== undefined) {
      capKeys.push("cLtvCents");
      scalar("cLtvCents", "Loan to Value Cap (Cents)", "number", (R) => {
        const value = commercialCap === null
          ? `ROUND(${R("cNoiCents")}/(${capRate}/100),0)`
          : `ROUND((${R("cNoiCents")}-${R("cCommercialCents")})/(${capRate}/100),0)+ROUND(${R("cCommercialCents")}/(${commercialCap}/100),0)`;
        return `INT((${value})*${n("lenderTests.loanSizing.maxLoanToValuePercent")}/100)`;
      });
    }
    if (sizing.minDebtYieldPercent !== undefined) {
      capKeys.push("cYieldCents");
      scalar("cYieldCents", "Debt Yield Cap (Cents)", "number", (R) => `INT(${R("cNoiCents")}/(${n("lenderTests.loanSizing.minDebtYieldPercent")}/100))`);
    }
    if (sizing.minDebtServiceCoverage !== undefined) {
      capKeys.push("cCoverageCents");
      scalar("cCoverageCents", "Debt Service Coverage Cap (Cents)", "number", (R) =>
        `INT(${R("cNoiCents")}/${n("lenderTests.loanSizing.minDebtServiceCoverage")}/${debtConstant(n("lenderTests.loanSizing.dscrRatePercent"), n("lenderTests.loanSizing.dscrAmortizationYears"))})`);
    }
    for (const cap of source.result.lenderTests?.loanSizing?.caps ?? []) {
      const key = cap.key === "loanToValue" ? "cLtvCents" : cap.key === "debtYield" ? "cYieldCents" : cap.key === "debtServiceCoverage" ? "cCoverageCents" : null;
      if (key) scalar(`${key}Dollars`, `${cap.label} Cap (Dollars)`, "money", (R) => `${R(key)}/100`, cap.amount);
    }
    scalar("maxLoanCents", "Largest Loan the Caps Allow (Cents)", "number", (R) => `MIN(${capKeys.map((key) => R(key)).join(",")})`);
    scalar("maxLoan", "Largest Loan the Caps Allow", "money", (R) => `${R("maxLoanCents")}/100`, capital.debtCeiling ?? undefined);
  }

  // ------------------------------------------------------------- loan and fee
  blank();
  section("Loan Amount and Fee (Cents)");
  scalar("projectCostCents", "Project Costs", "number", (_, m) => `ROUND(${m.total("projectCosts")}*100,0)`);
  scalar("committedLoanCents", "Loan the Loan to Cost Commits", "number", (R) => `ROUND(${R("projectCostCents")}*${share}/100,0)`);
  scalar("loanFeeCents", "Loan Fee", "number", (R) => {
    const uncapped = `ROUND(${R("projectCostCents")}*(${share}*${feePercent}/100)/100,0)`;
    return hasCeiling && sizing ? `IF(${R("maxLoanCents")}<${R("committedLoanCents")},ROUND(${R("maxLoanCents")}*${feePercent}/100,0),${uncapped})` : uncapped;
  });
  scalar("loanFee", "Loan Fee (Dollars)", "money", (R) => `${R("loanFeeCents")}/100`);

  // ------------------------------------------------------------------- equity
  blank();
  section("Equity the Loan Commits");
  entries.push({
    kind: "input",
    key: "equity",
    label: "Equity Commitment",
    format: "money",
    value: capital.totals.equity,
    name: EQUITY_NAME,
    note: "The engine's figure. When a change leaves a gap below, run the case again, or type the figure the formulas give here until the gap is zero.",
  });
  const otherDrawKeys = (inputs.otherSources ?? []).map((_, index) => `other.${index + 1}.draws`);
  scalar("otherSourceCents", "Grants and Soft Loans Drawn", "number", (_, m) => (otherDrawKeys.length === 0 ? "0" : `ROUND((${otherDrawKeys.map((key) => m.total(key)).join("+")})*100,0)`));
  scalar("usesCents", "Total Uses, Including Reserved Interest", "number", (_, m) => `ROUND(${m.total("totalUses")}*100,0)`);
  scalar("targetDebtCents", "Target Debt", "number", (R) => {
    const target = `ROUND(${R("usesCents")}*${share}/100,0)`;
    return hasCeiling && sizing ? `MIN(${target},${R("maxLoanCents")})` : target;
  });
  scalar(
    "equityCheck",
    "Equity Commitment the Formulas Give",
    "money",
    (R) => `MAX(ROUND((${R("usesCents")}-${R("targetDebtCents")}-${R("otherSourceCents")})/100,2),0)`,
    capital.totals.equity,
    "Total uses less target debt less grants and soft loans. Total uses include the interest the loan reserves, which depends on the equity above.",
  );
  scalar("equityGap", "Gap", "money", (R) => `ROUND(${R("equity")}-${R("equityCheck")},2)`);

  // ----------------------------------------------------------- permanent loan
  const loanResult = capital.permanentLoan;
  if (permanent && loanResult) {
    const pl = (path: string) => n(`permanentLoan.${path}`);
    const trailing = permanent.sizingNoiWindow.kind === "trailing";
    const fullTax = `${pl("noiTaxBasis")}="full_tax"`;
    const commercialCap = permanent.commercialValuationCapRatePercent !== undefined ? pl("commercialValuationCapRatePercent") : null;
    const dollars = (key: string, label: string, centsKey: string, engine: number, format: CellFormat = "money") =>
      scalar(key, label, format, (R) => `${R(centsKey)}/100`, engine);
    blank();
    section("Permanent Loan Sizing Window");
    scalar("pStart", "Window Start", "date", (R) => (trailing ? `EDATE(${R("takeoutDate")},-${pl("sizingNoiWindow.months")})` : R("takeoutDate")));
    scalar("pEnd", "Window End", "date", (R) => (trailing ? `EDATE(${R("takeoutDate")},-1)` : `EDATE(${R("takeoutDate")},11)`));
    scalar("pCount", "Months in the Window", "number", () => (trailing ? pl("sizingNoiWindow.months") : "12"));
    scalar("pSumCents", "NOI in the Window (Cents)", "number", (R) => centsOver("netOperatingIncome", R("pStart"), R("pEnd")));
    scalar("pAbatementCents", "Tax Added by Ending the Abatement in the Window (Cents)", "number", (R) =>
      (hasTax ? `${centsOver("fullPropertyTax", R("pStart"), R("pEnd"))}-${centsOver("propertyTax", R("pStart"), R("pEnd"))}` : "0"));
    scalar("pScheduledCents", "Annualized NOI With Scheduled Tax (Cents)", "number", (R) => `ROUND(${R("pSumCents")}*12/${R("pCount")},0)`);
    scalar("pFullCents", "Annualized NOI With Full Tax (Cents)", "number", (R) => `ROUND((${R("pSumCents")}-${R("pAbatementCents")})*12/${R("pCount")},0)`);
    scalar("pNoiCents", "Sizing NOI on the Chosen Tax Basis (Cents)", "number", (R) => `IF(${fullTax},${R("pFullCents")},${R("pScheduledCents")})`);
    dollars("pNoi", "Sizing NOI", "pNoiCents", loanResult.sizingNoi);
    dollars("pScheduledNoi", "Sizing NOI With Scheduled Tax", "pScheduledCents", loanResult.scheduledTaxSizingNoi);
    dollars("pFullNoi", "Sizing NOI With Full Tax", "pFullCents", loanResult.fullTaxSizingNoi);
    if (commercialCap !== null) {
      scalar("pCommercialCents", "Commercial Part of the Annualized Sizing NOI (Cents)", "number", (R) =>
        `ROUND((${centsOver("commercialNetOperatingIncome", R("pStart"), R("pEnd"))}-IF(${fullTax},${sumOver("commercialAddedTax", R("pStart"), R("pEnd"))},0))*12/${R("pCount")},0)`);
    }

    blank();
    section("Permanent Loan Amount (Cents Unless Marked)");
    const capRate = permanent.valuationCapRatePercent !== undefined ? pl("valuationCapRatePercent") : null;
    const pCapKeys: string[] = [];
    if (permanent.maxLoanToValuePercent !== undefined && capRate !== null) {
      pCapKeys.push("pLtvCents");
      scalar("pValueCents", "Value of the Sizing NOI at the Valuation Cap Rate", "number", (R) => (commercialCap === null
        ? `ROUND(${R("pNoiCents")}/(${capRate}/100),0)`
        : `ROUND((${R("pNoiCents")}-${R("pCommercialCents")})/(${capRate}/100),0)+ROUND(${R("pCommercialCents")}/(${commercialCap}/100),0)`));
      scalar("pLtvCents", "Loan to Value Cap", "number", (R) => `INT(${R("pValueCents")}*${pl("maxLoanToValuePercent")}/100)`);
    }
    if (permanent.minDebtYieldPercent !== undefined) {
      pCapKeys.push("pYieldCents");
      scalar("pYieldCents", "Debt Yield Cap", "number", (R) => `INT(${R("pNoiCents")}/(${pl("minDebtYieldPercent")}/100))`);
    }
    if (permanent.minDebtServiceCoverage !== undefined) {
      pCapKeys.push("pCoverageCents");
      scalar("pCoverageCents", "Debt Service Coverage Cap", "number", (R) =>
        `INT(${R("pNoiCents")}/${pl("minDebtServiceCoverage")}/${debtConstant(pl("annualRatePercent"), pl("amortizationYears"))})`);
    }
    for (const cap of loanResult.caps) {
      const key = cap.key === "loanToValue" ? "pLtvCents" : cap.key === "debtYield" ? "pYieldCents" : cap.key === "debtServiceCoverage" ? "pCoverageCents" : null;
      if (key) dollars(`${key}Dollars`, `${cap.label} Cap (Dollars)`, key, cap.amount);
    }
    scalar("pPayoffCents", "Construction Loan Balance Repaid at Takeout", "number", (_, m) => `ROUND(${m.total("repayment")}*100,0)`);
    scalar("pClosingCents", "Closing Costs", "number", () => `ROUND(${pl("closingCosts")}*100,0)`);
    const feeOn = (loan: string) => `ROUND(${loan}*${pl("feePercent")}/100,0)`;
    scalar("pSizedCents", "Loan Before Any Cut Back to Payoff", "number", (R) =>
      (permanent.sizingMode === "construction_balance" ? R("pPayoffCents") : `MIN(${pCapKeys.map((key) => R(key)).join(",")})`));
    if (permanent.cashOut === "limit_to_payoff") {
      // The smallest loan whose net proceeds cover the payoff (payoffLimitCents in permanent-loan.ts): one of the two cents below the first guess.
      scalar("pGuessCents", "First Guess at the Smallest Loan That Covers the Payoff", "number", (R) => `ROUNDUP((${R("pPayoffCents")}+${R("pClosingCents")})/(1-${pl("feePercent")}/100),0)`);
      const net = (loan: string, R: (key: string) => string) => `(${loan}-${feeOn(loan)}-${R("pClosingCents")})`;
      scalar("pLimitCents", "Smallest Loan That Covers the Payoff", "number", (R) =>
        `IF(${net(`(${R("pGuessCents")}-2)`, R)}>=${R("pPayoffCents")},${R("pGuessCents")}-2,IF(${net(`(${R("pGuessCents")}-1)`, R)}>=${R("pPayoffCents")},${R("pGuessCents")}-1,${R("pGuessCents")}))`);
    }
    scalar("pLoanCents", "Permanent Loan Amount", "number", (R) =>
      (permanent.cashOut === "limit_to_payoff" ? `MIN(${R("pLimitCents")},${R("pSizedCents")})` : R("pSizedCents")));
    scalar("pFeeCents", "Permanent Loan Fee", "number", (R) => feeOn(R("pLoanCents")));
    scalar("pNetCents", "Net Proceeds", "number", (R) => `${R("pLoanCents")}-${R("pFeeCents")}-${R("pClosingCents")}`);
    scalar("pCashOutCents", "Cash-Out to the Equity Holders", "number", (R) => `MAX(${R("pNetCents")}-${R("pPayoffCents")},0)`);
    scalar("pPaydownCents", "Equity Paydown at Takeout", "number", (R) => `MAX(${R("pPayoffCents")}-${R("pNetCents")},0)`);
    dollars("pLoan", "Permanent Loan Amount (Dollars)", "pLoanCents", loanResult.loanAmount);
    dollars("pFee", "Permanent Loan Fee (Dollars)", "pFeeCents", loanResult.fee);
    dollars("pClosing", "Closing Costs (Dollars)", "pClosingCents", loanResult.closingCosts);
    dollars("pNet", "Net Proceeds (Dollars)", "pNetCents", loanResult.netProceeds);
    dollars("pPayoff", "Construction Payoff (Dollars)", "pPayoffCents", loanResult.constructionPayoff);
    dollars("pCashOut", "Cash-Out (Dollars)", "pCashOutCents", loanResult.cashOut);
    dollars("pPaydown", "Equity Paydown (Dollars)", "pPaydownCents", loanResult.equityPaydown);

    blank();
    section("Permanent Loan Payments");
    scalar("pRate", "Monthly Rate", "number", () => `${pl("annualRatePercent")}/1200`);
    scalar("pPaymentCents", "Level Monthly Payment (Cents, Zero When Interest Only)", "number", (R) =>
      `IF(${pl("amortizationYears")}>0,ROUND(${R("pLoanCents")}*${R("pRate")}/(1-(1+${R("pRate")})^(-${pl("amortizationYears")}*12)),0),0)`);
    scalar("pAnnualServiceCents", "Annual Debt Service (Cents)", "number", (R) =>
      `IF(${pl("amortizationYears")}>0,${R("pPaymentCents")}*12,ROUND(${R("pLoanCents")}*${R("pRate")},0)*12)`);
    scalar("pAnnualService", "Annual Debt Service", "money", (R) => `${R("pAnnualServiceCents")}/100`, loanResult.annualDebtService);
    if (loanResult.monthlyPayment !== null) scalar("pPayment", "Level Monthly Payment", "money", (R) => `${R("pPaymentCents")}/100`, loanResult.monthlyPayment);
    scalar("pDebtYield", "Debt Yield", "rate", (R) => `${R("pNoiCents")}/${R("pLoanCents")}`, loanResult.debtYield);
    if (loanResult.debtServiceCoverage !== null) scalar("pCoverage", "Debt Service Coverage", "multiple", (R) => `${R("pNoiCents")}/${R("pAnnualServiceCents")}`, loanResult.debtServiceCoverage);
    if (loanResult.loanToValue !== null && capRate !== null) scalar("pLoanToValue", "Loan to Value", "rate", (R) => `${R("pLoanCents")}/${R("pValueForRatioCents")}`, loanResult.loanToValue);
    if (loanResult.loanToValue !== null && capRate !== null) {
      scalar("pValueForRatioCents", "Value of the Sizing NOI (Cents)", "number", (R) => (commercialCap === null
        ? `ROUND(${R("pNoiCents")}/(${capRate}/100),0)`
        : `ROUND((${R("pNoiCents")}-${R("pCommercialCents")})/(${capRate}/100),0)+ROUND(${R("pCommercialCents")}/(${commercialCap}/100),0)`));
    }
  }

  // ---------------------------------------------------------- row numbering
  const firstEntryRow = HEADER_ROWS + 2;
  const rowOfEntry = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (entry.kind === "scalar" || entry.kind === "input") rowOfEntry.set(entry.key, firstEntryRow + index);
  });
  const pointsStartRow = firstEntryRow + entries.length + (points.length > 0 ? 2 : 0);
  const R = (key: string) => {
    const row = rowOfEntry.get(key);
    if (row === undefined) throw new Error(`The Loan sheet has no figure ${key}.`);
    return sheetRef(SHEET_NAMES.loan, `$B$${row}`);
  };

  const baseRate = (monthDate: string) => {
    const range = sheetRef(SHEET_NAMES.loan, `$B$${pointsStartRow}:$B$${pointsStartRow + points.length - 1}`);
    return `INDEX(${range},MIN(MAX(${monthCount(monthDate)}-${monthCount(R("curveFirstDate"))},0),${points.length - 1})+1)`;
  };

  const finish = (monthly: MonthlyAccess): LayoutSheet => {
    const rows: LayoutRow[] = header(source, "Loan");
    rows.push({ cells: [{ kind: "text", text: "Item", role: "column" }, { kind: "text", text: "Value", role: "column" }, { kind: "text", text: "Note", role: "column" }] });
    const local = (key: string) => `$B$${rowOfEntry.get(key)!}`;
    for (const entry of entries) {
      if (entry.kind === "section") rows.push({ cells: [{ kind: "text", text: entry.title, role: "section" }] });
      else if (entry.kind === "blank") rows.push({ cells: [] });
      else if (entry.kind === "input") {
        rows.push({
          outlineLevel: 1,
          cells: [{ kind: "text", text: entry.label, role: "label" }, { kind: "input", value: entry.value, format: entry.format, name: entry.name }, entry.note ? { kind: "text", text: entry.note, role: "note" } : null],
        });
        names.push({ name: entry.name, sheet: SHEET_NAMES.loan, address: `$B$${rowOfEntry.get(entry.key)}` });
      } else {
        const formula = entry.formula(local, monthly);
        const cell: LayoutCell = entry.engine === undefined
          ? { kind: "calc", format: entry.format, formula }
          : { kind: "output", id: `loan.${entry.key}`, format: entry.format, engineValue: entry.engine, formula };
        rows.push({ outlineLevel: 1, cells: [{ kind: "text", text: entry.label, role: "label" }, cell, entry.note ? { kind: "text", text: entry.note, role: "note" } : null] });
      }
    }
    if (points.length > 0) {
      rows.push({ cells: [] });
      rows.push({ cells: [{ kind: "text", text: "Base Rate by Month (Percent)", role: "section" }] });
      points.forEach((point, index) => {
        rows.push({
          outlineLevel: 1,
          cells: [
            { kind: "text", text: point.month, role: "label" },
            { kind: "calc", format: "percent_number", formula: n(`ratePath.baseRates.${index + 1}.baseRatePercent`) },
          ],
        });
      });
    }
    return { name: SHEET_NAMES.loan, columnWidths: [58, 18, 80], frozen: { rows: HEADER_ROWS + 1, columns: 1 }, rows };
  };

  return { ref: R, baseRate, finish };
}
