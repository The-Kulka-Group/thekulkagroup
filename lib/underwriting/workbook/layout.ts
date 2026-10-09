import {
  ANNUAL_SECTION_LABELS,
  CAPITALIZED_GROSS_INTEREST_VERSION,
  ANNUAL_YEAR_BASIS_LABELS,
  projectApartmentOperationsThrough,
  propertyTaxScheduleEndMonth,
  resolveMilestoneAnchors,
  scheduleOtherSources,
  type AnnualCashFlowYears,
  type AnnualYearBasisKind,
  type ApartmentOperationsResult,
  type CostCategory,
  type MonthlyApartmentOperations,
  type DevelopmentCapitalTotals,
  type MonthlyDevelopmentCapital,
  type OtherFundingSource,
  type PermanentLoanResult,
  type PropertyReturnsInputs,
  type PropertyReturnsResult,
} from "@kulka/engine";

import { buildCostsSheets, operationsFor, type CostsBuild } from "./costs";
import { buildLeaseTermsSheet } from "./lease-terms";
import { createLoan, type LoanBuild } from "./loan";
import { buildOperationsSheet, type OperationsBuild } from "./operations";
import {
  HEADER_ROWS,
  assertFormulasFit,
  SHEET_NAMES,
  cellAddress,
  columnLetter,
  dateOfMonthText,
  header,
  monthCount,
  monthIndexOf,
  sheetRef,
  type CellFormat,
  type LayoutCell,
  type LayoutContext,
  type LayoutRow,
  type LayoutSheet,
  type WorkbookLayout,
  type WorkbookSource,
} from "./frame";
import { createReturns, type MonthlyReturnsAccess, type ReturnsBuild } from "./returns";
import { buildSourcesAndUsesSheet } from "./sources";
import { buildWaterfallSheet } from "./waterfall";

export { SHEET_NAMES, cellAddress, columnLetter };
export { WorkbookFormulaTooLongError } from "./frame";
export type { CellFormat, LayoutCell, LayoutRow, LayoutSheet, WorkbookLayout, WorkbookSource };

// LA-1947. The workbook as plain data: sheets, rows and cells, with every
// output cell carrying the engine's own value. The writer turns this into an
// .xlsx, and the LibreOffice check reads the recalculated file back against
// the same layout. LA-1949 to LA-1952 replace value cells with formulas here;
// an output with a `formula` is live, one without is the engine's value.

// ---------------------------------------------------------------- Assumptions

type Leaf = { path: string[]; value: number | string | boolean };

function leaves(value: unknown, path: string[] = []): Leaf[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "number") return Number.isFinite(value) ? [{ path, value }] : [];
  if (typeof value === "string" || typeof value === "boolean") return [{ path, value }];
  if (Array.isArray(value)) return value.flatMap((item, index) => leaves(item, [...path, String(index + 1)]));
  if (typeof value === "object") return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => leaves(item, [...path, key]));
  return [];
}

function words(key: string) {
  if (/^\d+$/.test(key)) return `#${key}`;
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced
    .split(" ")
    .filter(Boolean)
    .map((word) => (/^[A-Z0-9]+$/.test(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ");
}

function inputFormat(path: string[], value: number | string | boolean): CellFormat {
  if (typeof value !== "number") return "text";
  const key = path[path.length - 1];
  if (/Percent$/i.test(key)) return "percent_number";
  if (/(Units|Count|Months|Month|Years|Year|Index|Order)$/i.test(key)) return "number";
  if (/(Amount|Cost|Price|Fee|Rent|Value|Income|Expense|Budget|Balance|Proceeds|Payment)$/i.test(key)) return "money";
  return "number";
}

/** An Excel name for an input path. Unique, letters and underscores, never shaped like a cell address. */
function nameFor(path: string[], used: Set<string>) {
  const base = `in_${path.join("_").replace(/[^A-Za-z0-9_]+/g, "_")}`.slice(0, 200);
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base}_${n}`;
  used.add(name.toLowerCase());
  return name;
}

function assumptionsSheet(source: WorkbookSource, names: WorkbookLayout["names"], inputNames: Map<string, string>): LayoutSheet {
  const rows = header(source, "Assumptions");
  rows.push({ cells: [{ kind: "text", text: "Input", role: "column" }, { kind: "text", text: "Value", role: "column" }, { kind: "text", text: "Path", role: "column" }] });
  const used = new Set<string>();
  let section: string | null = null;
  for (const leaf of leaves(source.inputs)) {
    const top = leaf.path[0];
    if (top !== section) {
      section = top;
      rows.push({ cells: [{ kind: "text", text: words(top), role: "section" }] });
    }
    const name = nameFor(leaf.path, used);
    inputNames.set(leaf.path.join("."), name);
    names.push({ name, sheet: SHEET_NAMES.assumptions, address: `$B$${rows.length + 1}` });
    rows.push({
      outlineLevel: 1,
      cells: [
        { kind: "text", text: leaf.path.slice(1).map(words).join(" / ") || words(top), role: "label" },
        { kind: "input", value: leaf.value, format: inputFormat(leaf.path, leaf.value), name },
        { kind: "text", text: leaf.path.join("."), role: "note" },
      ],
    });
  }
  return { name: SHEET_NAMES.assumptions, columnWidths: [48, 18, 60], frozen: { rows: HEADER_ROWS + 1, columns: 1 }, rows };
}

// -------------------------------------------------------------------- Monthly

type PropertyRow = PropertyReturnsResult["propertyReturns"]["months"][number];

/** One month's column, for a line's formula to read the other rows of the same month. */
type MonthAt = {
  position: number;
  /** The month's heading date, with its row anchored. */
  date: string;
  /** The cell for a row key in this month's column. */
  cell: (key: string) => string;
  /** The same row one month earlier, or null in the first month. */
  prior: (key: string) => string | null;
};

type MonthlyLine = {
  key: string;
  label: string;
  format: CellFormat;
  read: (month: MonthlyDevelopmentCapital, property: PropertyRow | undefined) => number;
  /** A flow sums to a Total; a balance or rate has none. */
  total: false | { engineTotal: (totals: DevelopmentCapitalTotals, result: PropertyReturnsResult) => number | undefined };
  /** Makes the month cells live. A line without one holds the engine's values. */
  formula?: (at: MonthAt) => string;
  /** A working row the engine has no figure for, such as one draw of a grant. */
  working?: boolean;
};

type MonthlyEntry = { section: string } | { line: MonthlyLine };

const flow = (engineTotal: (totals: DevelopmentCapitalTotals, result: PropertyReturnsResult) => number | undefined = () => undefined) => ({ engineTotal });

type CapitalDeps = {
  ctx: LayoutContext;
  costs: CostsBuild["refs"];
  operations: OperationsBuild;
  loan: LoanBuild;
  softLoanRepayments: string[];
  /** The Monthly rows that total each grant's and soft loan's draws. */
  otherDrawKeys: string[];
  hasPermanentLoan: boolean;
  hasRatePath: boolean;
};

/**
 * LA-1951, development-capital.ts `simulate` line for line. Each month funds its project costs and
 * loan fee, then its operating shortfall, then its capitalized interest, and each takes grant and
 * soft loan cash first, then the equity left, then the loan.
 */
function capitalLines(deps: CapitalDeps): MonthlyLine[] {
  const { ctx, costs, operations, loan, softLoanRepayments, hasPermanentLoan, hasRatePath } = deps;
  const monthIs = (at: MonthAt, dateRef: string) => `${monthCount(at.date)}=${monthCount(dateRef)}`;
  return [
    { key: "projectCosts", label: "Project Costs", format: "money", read: (m) => m.projectCosts, total: flow((t) => t.projectCosts), formula: (at) => costs.monthTotal(at.position) },
    { key: "operatingCashFlow", label: "Operating Cash Flow", format: "money", read: (m) => m.operatingCashFlow, total: flow(), formula: (at) => operations.cell("operatingCashFlow", at.position) },
    {
      key: "operatingShortfall",
      label: "Operating Shortfall",
      format: "money",
      read: (m) => m.operatingShortfall,
      total: flow((t) => t.operatingShortfall),
      // After a permanent loan takes out the construction loan, a shortfall is an equity call on the permanent loan schedule.
      formula: (at) => hasPermanentLoan
        ? `IF(${monthCount(at.date)}>${monthCount(loan.ref("takeoutDate"))},0,MAX(-${at.cell("operatingCashFlow")},0))`
        : `MAX(-${at.cell("operatingCashFlow")},0)`,
    },
    {
      key: "loanFee",
      label: "Loan Fees",
      format: "money",
      read: (m) => m.loanFee,
      total: flow((t) => t.loanFees),
      formula: (at) => `IF(${monthIs(at, loan.ref("feeDate"))},${loan.ref("loanFee")},0)`,
    },
    {
      key: "grossInterest",
      label: "Gross Interest",
      format: "money",
      read: (m) => m.grossInterest,
      total: flow((t) => t.grossInterest),
      formula: (at) => `ROUND(ROUND(${at.cell("openingDebtBalance")}*100,0)*(${at.cell("annualRatePercent")}/12)/100,0)/100`,
    },
    {
      key: "operatingCashAppliedToInterest",
      label: "Operating Cash Applied to Interest",
      format: "money",
      read: (m) => m.operatingCashAppliedToInterest,
      total: flow((t) => t.operatingCashAppliedToInterest),
      formula: (at) => `IF(${ctx.input("interestTreatment")}="${CAPITALIZED_GROSS_INTEREST_VERSION}",0,MIN(MAX(${at.cell("operatingCashFlow")},0),${at.cell("grossInterest")}))`,
    },
    {
      key: "capitalizedInterest",
      label: "Capitalized Interest",
      format: "money",
      read: (m) => m.capitalizedInterest,
      total: flow((t) => t.capitalizedInterest),
      formula: (at) => `ROUND(${at.cell("grossInterest")}-${at.cell("operatingCashAppliedToInterest")},2)`,
    },
    {
      key: "equityContribution",
      label: "Equity",
      format: "money",
      read: (m) => m.equityContribution,
      total: flow((t) => t.equity),
      formula: (at) => `ROUND(${at.cell("w.projectEquity")}+${at.cell("w.shortfallEquity")}+${at.cell("w.interestEquity")},2)`,
    },
    {
      key: "debtBeforeReservesDraw",
      label: "Debt Before Reserves",
      format: "money",
      read: (m) => m.debtBeforeReservesDraw,
      total: flow((t) => t.debtBeforeReserves),
      formula: (at) => `ROUND(${at.cell("projectCosts")}+${at.cell("loanFee")}-${at.cell("w.otherProject")}-${at.cell("w.projectEquity")},2)`,
    },
    {
      key: "interestReserveDraw",
      label: "Interest Reserve",
      format: "money",
      read: (m) => m.interestReserveDraw,
      total: flow((t) => t.interestReserve),
      formula: (at) => `ROUND(${at.cell("capitalizedInterest")}-${at.cell("w.otherInterest")}-${at.cell("w.interestEquity")},2)`,
    },
    {
      key: "operatingShortfallReserveDraw",
      label: "Operating Shortfall Reserve",
      format: "money",
      read: (m) => m.operatingShortfallReserveDraw,
      total: flow((t) => t.operatingShortfallReserve),
      formula: (at) => `ROUND(${at.cell("operatingShortfall")}-${at.cell("w.otherShortfall")}-${at.cell("w.shortfallEquity")},2)`,
    },
    {
      key: "totalDebtDraw",
      label: "Total Debt Draw",
      format: "money",
      read: (m) => m.totalDebtDraw,
      total: flow((t) => t.totalDebt),
      formula: (at) => `ROUND(${at.cell("debtBeforeReservesDraw")}+${at.cell("interestReserveDraw")}+${at.cell("operatingShortfallReserveDraw")},2)`,
    },
    {
      key: "otherSourcesApplied",
      label: "Grants and Soft Loans Applied",
      format: "money",
      read: (m) => m.otherSourcesApplied,
      total: flow((t) => t.otherSourcesApplied),
      formula: (at) => `ROUND(${at.cell("w.otherProject")}+${at.cell("w.otherShortfall")}+${at.cell("w.otherInterest")},2)`,
    },
    {
      key: "softLoanRepayment",
      label: "Soft Loan Repayment",
      format: "money",
      read: (m) => m.softLoanRepayment,
      total: flow((t) => t.softLoanRepayment),
      formula: (at) => softLoanRepayments.length === 0 ? "0" : softLoanRepayments.map((key) => at.cell(key)).join("+"),
    },
    {
      key: "totalSources",
      label: "Total Sources",
      format: "money",
      read: (m) => m.totalSources,
      total: flow((t) => t.totalSources),
      formula: (at) => `${at.cell("equityContribution")}+${at.cell("totalDebtDraw")}+${at.cell("otherSourcesApplied")}`,
    },
    {
      key: "totalUses",
      label: "Total Uses",
      format: "money",
      read: (m) => m.totalUses,
      total: flow((t) => t.totalUses),
      formula: (at) => `${at.cell("projectCosts")}+${at.cell("loanFee")}+${at.cell("operatingShortfall")}+${at.cell("capitalizedInterest")}`,
    },
    {
      key: "repayment",
      label: "Construction Loan Repayment",
      format: "money",
      read: (m) => m.repayment,
      total: flow(),
      formula: (at) => `IF(${monthIs(at, loan.ref("repayDate"))},ROUND(${at.cell("openingDebtBalance")}+${at.cell("totalDebtDraw")},2),0)`,
    },
    {
      key: "annualRatePercent",
      label: "Annual Rate",
      format: "percent_number",
      read: (m) => m.annualRatePercent,
      total: false,
      formula: (at) => hasRatePath
        ? `ROUND(${at.cell("w.baseRate")}+${loan.ref("spread")},8)`
        : ctx.input("annualInterestRatePercent"),
    },
    {
      key: "openingDebtBalance",
      label: "Opening Debt Balance",
      format: "money",
      read: (m) => m.openingDebtBalance,
      total: false,
      formula: (at) => at.prior("closingDebtBalance") ?? "0",
    },
    {
      key: "closingDebtBalance",
      label: "Closing Debt Balance",
      format: "money",
      read: (m) => m.closingDebtBalance,
      total: false,
      formula: (at) => `ROUND(${at.cell("openingDebtBalance")}+${at.cell("totalDebtDraw")}-${at.cell("repayment")},2)`,
    },
  ];
}

/** The steps of the funding order that the engine does not report: what each pool covers before the loan does. */
function fundingWorkingLines(deps: CapitalDeps): MonthlyLine[] {
  const { loan, otherDrawKeys, hasRatePath } = deps;
  const working = (key: string, label: string, formula: (at: MonthAt) => string): MonthlyLine => ({ key, label, format: "money", read: () => 0, total: false, working: true, formula });
  return [
    ...(hasRatePath ? [working("w.baseRate", "Base Rate From the Curve (Percent)", (at) => loan.baseRate(at.date))] : []),
    working("w.otherDraws", "Grant and Soft Loan Cash Arriving", (at) => (otherDrawKeys.length === 0 ? "0" : otherDrawKeys.map((key) => at.cell(key)).join("+"))),
    working("w.otherStart", "Grant and Soft Loan Cash Available", (at) => `ROUND(${at.prior("w.otherEnd") ?? "0"}+${at.cell("w.otherDraws")},2)`),
    working("w.otherProject", "Grant and Soft Loan Cash Applied to Costs and Fee", (at) => `MIN(${at.cell("w.otherStart")},ROUND(${at.cell("projectCosts")}+${at.cell("loanFee")},2))`),
    working("w.otherShortfall", "Grant and Soft Loan Cash Applied to Shortfall", (at) => `MIN(ROUND(${at.cell("w.otherStart")}-${at.cell("w.otherProject")},2),${at.cell("operatingShortfall")})`),
    working("w.otherInterest", "Grant and Soft Loan Cash Applied to Interest", (at) => `MIN(ROUND(${at.cell("w.otherStart")}-${at.cell("w.otherProject")}-${at.cell("w.otherShortfall")},2),${at.cell("capitalizedInterest")})`),
    working("w.otherEnd", "Grant and Soft Loan Cash Left", (at) => `ROUND(${at.cell("w.otherStart")}-${at.cell("w.otherProject")}-${at.cell("w.otherShortfall")}-${at.cell("w.otherInterest")},2)`),
    working("w.equityStart", "Equity Left at the Start of the Month", (at) => at.prior("w.equityEnd") ?? loan.ref("equity")),
    working("w.projectEquity", "Equity Funding Costs and Fee", (at) => `MIN(${at.cell("w.equityStart")},ROUND(${at.cell("projectCosts")}+${at.cell("loanFee")}-${at.cell("w.otherProject")},2))`),
    working("w.shortfallEquity", "Equity Funding Shortfall", (at) => `MIN(ROUND(${at.cell("w.equityStart")}-${at.cell("w.projectEquity")},2),ROUND(${at.cell("operatingShortfall")}-${at.cell("w.otherShortfall")},2))`),
    working("w.interestEquity", "Equity Funding Interest", (at) => `MIN(ROUND(${at.cell("w.equityStart")}-${at.cell("w.projectEquity")}-${at.cell("w.shortfallEquity")},2),ROUND(${at.cell("capitalizedInterest")}-${at.cell("w.otherInterest")},2))`),
    working("w.equityEnd", "Equity Left at the End of the Month", (at) => `ROUND(${at.cell("w.equityStart")}-${at.cell("equityContribution")},2)`),
  ];
}

/**
 * LA-1951, permanent-loan.ts `schedulePermanentLoan` line for line. The loan funds in the takeout month
 * the construction loan repays, charges interest on the opening balance from the month after, pays a level
 * payment once the interest-only months pass, and repays its balance at the sale.
 */
function permanentLines(deps: CapitalDeps, loan: PermanentLoanResult): MonthlyLine[] {
  const { ctx, loan: sheet } = deps;
  const byMonth = new Map(loan.months.map((row) => [row.month, row]));
  const working = (key: string, label: string, formula: (at: MonthAt) => string): MonthlyLine => ({ key, label, format: "money", read: () => 0, total: false, working: true, formula });
  const funding = (at: MonthAt) => at.cell("pl.offset");
  const line = (key: string, label: string, read: (row: PermanentLoanResult["months"][number] | undefined) => number, formula: (at: MonthAt) => string): MonthlyLine =>
    ({ key, label, format: "money", read: (m) => read(byMonth.get(m.month)), total: flow(), formula });
  return [
    working("pl.offset", "Months Since the Permanent Loan Funded", (at) => `${monthCount(at.date)}-${monthCount(sheet.ref("takeoutDate"))}`),
    working("pl.opening", "Permanent Loan Opening Balance", (at) => (at.prior("pl.closing") === null ? "0" : `IF(${funding(at)}<=0,0,${at.prior("pl.closing")})`)),
    working("pl.interest", "Permanent Loan Interest", (at) => `ROUND(ROUND(${at.cell("pl.opening")}*100,0)*${sheet.ref("pRate")},0)/100`),
    working("pl.principal", "Permanent Loan Principal", (at) =>
      `IF(AND(${funding(at)}>0,${ctx.input("permanentLoan.amortizationYears")}>0,${funding(at)}>${ctx.input("permanentLoan.interestOnlyMonths")}),MIN(MAX(ROUND(${sheet.ref("pPaymentCents")}/100-${at.cell("pl.interest")},2),0),${at.cell("pl.opening")}),0)`),
    line("permanentLoanProceeds", "Permanent Loan Proceeds", (row) => row?.proceeds ?? 0, (at) => `IF(${funding(at)}=0,${sheet.ref("pLoan")},0)`),
    line("refinanceCosts", "Refinance Costs", (row) => (row ? (Math.round(row.fee * 100) + Math.round(row.closingCosts * 100)) / 100 : 0), (at) => `IF(${funding(at)}=0,(${sheet.ref("pFeeCents")}+${sheet.ref("pClosingCents")})/100,0)`),
    line("permanentDebtService", "Permanent Debt Service", (row) => row?.debtService ?? 0, (at) => `ROUND(${at.cell("pl.interest")}+${at.cell("pl.principal")},2)`),
    working("pl.balance", "Permanent Loan Balance Before Payoff", (at) => `ROUND(${at.cell("pl.opening")}+${at.cell("permanentLoanProceeds")}-${at.cell("pl.principal")},2)`),
    line("permanentLoanPayoff", "Permanent Loan Payoff", (row) => row?.payoff ?? 0, (at) =>
      `IF(${monthCount(at.date)}=${monthCount(dateOfMonthText(ctx.input("saleMonth")))},${at.cell("pl.balance")},0)`),
    working("pl.closing", "Permanent Loan Closing Balance", (at) => `ROUND(${at.cell("pl.balance")}-${at.cell("permanentLoanPayoff")},2)`),
    line("permanentCashOut", "Cash-Out to the Equity Holders", (row) => row?.cashOut ?? 0, (at) => `IF(${funding(at)}=0,${sheet.ref("pCashOut")},0)`),
    line("permanentEquityPaydown", "Equity Paydown at Takeout", (row) => row?.equityPaydown ?? 0, (at) => `IF(${funding(at)}=0,${sheet.ref("pPaydown")},0)`),
    line("permanentEquityCall", "Equity Call for Debt Service and Shortfall", (row) => row?.equityCall ?? 0, (at) =>
      `IF(${funding(at)}<=0,0,MAX(ROUND(${at.cell("permanentDebtService")}-${at.cell("operatingCashFlow")},2),0))`),
  ];
}

/**
 * LA-1952, property-returns.ts `calculatePropertyReturns`: the sale proceeds land in the sale month, and each
 * month's unlevered and levered cash flow add up from the rows above. The working rows give XIRR its
 * month-end dates and feed the yield on cost and peak equity on the Returns sheet.
 */
function propertyLines(deps: CapitalDeps, returns: ReturnsBuild): MonthlyLine[] {
  const permanent = deps.hasPermanentLoan;
  const working = (key: string, label: string, format: CellFormat, formula: (at: MonthAt) => string): MonthlyLine => ({ key, label, format, read: () => 0, total: false, working: true, formula });
  const levered = (at: MonthAt) => {
    const minus = ["loanFee", "projectCosts", "grossInterest", "repayment", "softLoanRepayment", ...(permanent ? ["refinanceCosts", "permanentDebtService", "permanentLoanPayoff"] : [])];
    const plus = ["totalDebtDraw", "otherSourcesApplied", "operatingCashFlow", "netSaleProceeds", ...(permanent ? ["permanentLoanProceeds"] : [])];
    return `ROUND(${plus.map((key) => at.cell(key)).join("+")}-${minus.map((key) => at.cell(key)).join("-")},2)`;
  };
  return [
    {
      key: "netSaleProceeds",
      label: "Net Sale Proceeds",
      format: "money",
      read: (_, p) => p?.netSaleProceeds ?? 0,
      total: flow((_, r) => r.propertyReturns.sale.netSaleProceeds),
      formula: (at) => `IF(${monthCount(at.date)}=${monthCount(returns.ref("saleDate"))},${returns.ref("netCents")}/100,0)`,
    },
    {
      key: "unleveredCashFlow",
      label: "Unlevered Cash Flow",
      format: "money",
      read: (_, p) => p?.unleveredCashFlow ?? 0,
      total: flow((_, r) => r.propertyReturns.returns.unlevered.netProfit),
      formula: (at) => `ROUND(${at.cell("operatingCashFlow")}+${at.cell("netSaleProceeds")}-${at.cell("projectCosts")},2)`,
    },
    {
      key: "leveredCashFlow",
      label: "Levered Cash Flow",
      format: "money",
      read: (_, p) => p?.leveredCashFlow ?? 0,
      total: flow((_, r) => r.propertyReturns.returns.levered.netProfit),
      formula: levered,
    },
    working("w.cashFlowDate", "Cash Flow Date, Month End", "date", (at) => `EOMONTH(${at.date},0)`),
    working("w.costWithCarry", "Project Cost Including Carry", "money", (at) =>
      `${at.cell("projectCosts")}+${at.cell("loanFee")}+MAX(-${at.cell("operatingCashFlow")},0)+MAX(${at.cell("grossInterest")}-MAX(${at.cell("operatingCashFlow")},0),0)`),
    working("w.equityOut", "Levered Equity Out, Running", "money", (at) => `${at.prior("w.equityOut") ?? "0"}-${at.cell("leveredCashFlow")}`),
  ];
}

/**
 * LA-1949, other-sources.ts line for line: a draw lands in its month, a soft loan accrues
 * interest on the opening balance (rounded to the cent) and repays balance, draws and
 * interest in the repayment month. A grant has draws only.
 */
function otherSourceLines(ctx: LayoutContext, sources: OtherFundingSource[], monthKeys: string[]) {
  const schedule = scheduleOtherSources(sources, monthKeys);
  const lines: MonthlyLine[] = [];
  const repaymentKeys: string[] = [];
  const draws = new Map<string, string>();
  const dollars = (cents: number) => cents / 100;
  const monthPosition = (month: string) => monthKeys.indexOf(month);
  sources.forEach((entry, sourceIndex) => {
    const s = sourceIndex + 1;
    const input = (path: string) => ctx.input(`otherSources.${s}.${path}`);
    const months = schedule[sourceIndex].months;
    const at = (month: MonthlyDevelopmentCapital) => months[monthPosition(month.month)];
    const drawKeys = entry.draws.map((_, drawIndex) => `other.${s}.draw.${drawIndex + 1}`);
    const keys = { draws: `other.${s}.draws`, interest: `other.${s}.interest`, repayment: `other.${s}.repayment`, balance: `other.${s}.balance` };
    const isLoan = entry.kind === "soft_loan";
    entry.draws.forEach((_, drawIndex) => {
      const d = drawIndex + 1;
      lines.push({
        key: drawKeys[drawIndex],
        label: `${entry.name}: Draw ${d}`,
        format: "money",
        read: () => 0,
        total: false,
        working: true,
        formula: (month) => `IF(${monthCount(month.date)}=${monthCount(dateOfMonthText(input(`draws.${d}.month`)))},${input(`draws.${d}.amount`)},0)`,
      });
    });
    draws.set(entry.id, keys.draws);
    lines.push({
      key: keys.draws,
      label: `${entry.name}: ${isLoan ? "Soft Loan" : "Grant"} Draws`,
      format: "money",
      read: (month) => dollars(at(month).drawCents),
      total: flow(),
      formula: (month) => `SUM(${month.cell(drawKeys[0])}:${month.cell(drawKeys[drawKeys.length - 1])})`,
    });
    if (!isLoan) return;
    repaymentKeys.push(keys.repayment);
    lines.push(
      {
        key: keys.interest,
        label: `${entry.name}: Interest Accrued`,
        format: "money",
        read: (month) => dollars(at(month).interestCents),
        total: flow(),
        formula: (month) => {
          const prior = month.prior(keys.balance);
          return prior === null ? "0" : `ROUND(${prior}*${input("annualInterestRatePercent")}/12/100,2)`;
        },
      },
      {
        key: keys.repayment,
        label: `${entry.name}: Repayment`,
        format: "money",
        read: (month) => dollars(at(month).repaymentCents),
        total: flow(),
        formula: (month) => {
          const prior = month.prior(keys.balance) ?? "0";
          return `IF(${monthCount(month.date)}=${monthCount(dateOfMonthText(input("repaymentMonth")))},${prior}+${month.cell(keys.draws)}+${month.cell(keys.interest)},0)`;
        },
      },
      {
        key: keys.balance,
        label: `${entry.name}: Closing Balance`,
        format: "money",
        read: (month) => dollars(at(month).closingBalanceCents),
        total: false,
        formula: (month) => `${month.prior(keys.balance) ?? "0"}+${month.cell(keys.draws)}+${month.cell(keys.interest)}-${month.cell(keys.repayment)}`,
      },
    );
  });
  return { lines, repaymentKeys, draws };
}

/** Engine values are whole cents; the sum of a month row is rounded the same way. */
function centsSum(values: number[]) {
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
}

type MonthlyBuild = {
  sheet: LayoutSheet;
  /** The Total column of a funding row, for the sources and uses sheet. */
  total: (key: string) => string;
  otherSourceDraws: (sourceId: string) => string;
  /** The month rows, for the Returns, Waterfall and Annual sheets. */
  access: MonthlyReturnsAccess & {
    /** The month heading dates across the month columns, absolute. */
    dates: string;
    firstDate: string;
    lastDate: string;
  };
};

function monthlySheet(ctx: LayoutContext, costs: CostsBuild["refs"], operations: OperationsBuild, loan: LoanBuild, returns: ReturnsBuild): MonthlyBuild {
  const { source } = ctx;
  const { developmentCapital, propertyReturns } = source.result;
  const months = developmentCapital.months;
  const monthKeys = months.map(({ month }) => month);
  const property = new Map(propertyReturns.months.map((row) => [row.month, row]));
  const firstMonthColumn = 2;
  const lastMonthColumn = firstMonthColumn + months.length - 1;
  const sources = (source.inputs as PropertyReturnsInputs).otherSources ?? [];
  const other = otherSourceLines(ctx, sources, monthKeys);

  const inputs = ctx.source.inputs as PropertyReturnsInputs;
  const deps: CapitalDeps = {
    ctx,
    costs,
    operations,
    loan,
    softLoanRepayments: other.repaymentKeys,
    otherDrawKeys: [...other.draws.values()],
    hasPermanentLoan: inputs.permanentLoan !== undefined,
    hasRatePath: inputs.ratePath !== undefined,
  };
  const entries: MonthlyEntry[] = [
    { section: "Development Costs and Funding" },
    ...capitalLines(deps).map((line): MonthlyEntry => ({ line })),
    { section: "Funding Working" },
    ...fundingWorkingLines(deps).map((line): MonthlyEntry => ({ line })),
    ...(other.lines.length > 0 ? [{ section: "Grants and Soft Loans" } as MonthlyEntry, ...other.lines.map((line): MonthlyEntry => ({ line }))] : []),
    ...(developmentCapital.permanentLoan ? [{ section: "Permanent Loan" } as MonthlyEntry, ...permanentLines(deps, developmentCapital.permanentLoan).map((line): MonthlyEntry => ({ line }))] : []),
    { section: "Property Cash Flow" },
    ...propertyLines(deps, returns).map((line): MonthlyEntry => ({ line })),
  ];
  const headingRow = HEADER_ROWS;
  const rowIndexOf = new Map<string, number>();
  entries.forEach((entry, index) => {
    if ("line" in entry) rowIndexOf.set(entry.line.key, headingRow + 1 + index);
  });
  const rowOf = (key: string) => {
    const row = rowIndexOf.get(key);
    if (row === undefined) throw new Error(`The Monthly sheet has no row ${key}.`);
    return row + 1;
  };

  const rows = header(source, "Monthly Cash Flow");
  rows.push({
    cells: [
      { kind: "text", text: "Line", role: "column" },
      { kind: "text", text: "Total", role: "column" },
      ...months.map(({ month }): LayoutCell => ({ kind: "date", value: property.get(month)?.date ?? `${month}-01` })),
    ],
  });

  for (const entry of entries) {
    if ("section" in entry) {
      rows.push({ cells: [{ kind: "text", text: entry.section, role: "section" }] });
      continue;
    }
    const { line } = entry;
    const rowIndex = rows.length;
    const values = months.map((month) => line.read(month, property.get(month.month)));
    const at = (position: number): MonthAt => {
      const letter = columnLetter(firstMonthColumn + position);
      const previous = position === 0 ? null : columnLetter(firstMonthColumn + position - 1);
      return {
        position,
        date: `${letter}$${headingRow + 1}`,
        cell: (key) => `${letter}${rowOf(key)}`,
        prior: (key) => (previous === null ? null : `${previous}${rowOf(key)}`),
      };
    };
    const total: LayoutCell | null = line.total && !line.working
      ? {
        kind: "output",
        id: `monthly.${line.key}.total`,
        format: line.format,
        engineValue: line.total.engineTotal(developmentCapital.totals, source.result) ?? centsSum(values),
        formula: `SUM(${cellAddress(rowIndex, firstMonthColumn)}:${cellAddress(rowIndex, lastMonthColumn)})`,
      }
      : null;
    rows.push({
      outlineLevel: line.working ? 2 : 1,
      cells: [
        { kind: "text", text: line.label, role: "label" },
        total,
        ...values.map((engineValue, index): LayoutCell => {
          const formula = line.formula?.(at(index));
          if (line.working) return { kind: "calc", format: line.format, formula: formula! };
          return { kind: "output", id: `monthly.${line.key}.${months[index].month}`, format: line.format, engineValue, ...(formula ? { formula } : {}) };
        }),
      ],
    });
  }

  const sheet: LayoutSheet = {
    name: SHEET_NAMES.monthly,
    columnWidths: [36, 16, ...months.map(() => 13)],
    frozen: { rows: HEADER_ROWS + 1, columns: 2 },
    rows,
  };
  const monthsRow = (row: number) => sheetRef(SHEET_NAMES.monthly, `$${columnLetter(firstMonthColumn)}$${row}:$${columnLetter(lastMonthColumn)}$${row}`);
  return {
    sheet,
    total: (key) => sheetRef(SHEET_NAMES.monthly, `B${rowOf(key)}`),
    otherSourceDraws: (sourceId) => {
      const key = other.draws.get(sourceId);
      if (!key) throw new Error(`The Monthly sheet has no schedule for the source ${sourceId}.`);
      return sheetRef(SHEET_NAMES.monthly, `B${rowOf(key)}`);
    },
    access: {
      range: (key) => monthsRow(rowOf(key)),
      cell: (key, position) => sheetRef(SHEET_NAMES.monthly, `$${columnLetter(firstMonthColumn + position)}$${rowOf(key)}`),
      has: (key) => rowIndexOf.has(key),
      lastPosition: months.length - 1,
      dates: monthsRow(headingRow + 1),
      firstDate: sheetRef(SHEET_NAMES.monthly, `$${columnLetter(firstMonthColumn)}$${headingRow + 1}`),
      lastDate: sheetRef(SHEET_NAMES.monthly, `$${columnLetter(lastMonthColumn)}$${headingRow + 1}`),
    },
  };
}

// --------------------------------------------------------------------- Annual

function annualBasis(result: PropertyReturnsResult): { kind: AnnualYearBasisKind; years: AnnualCashFlowYears } | null {
  const views = result.annualCashFlow;
  if (!views) return null;
  return views.operating_year ? { kind: "operating_year", years: views.operating_year } : { kind: "analysis_year", years: views.analysis_year };
}

type AnnualDeps = {
  ctx: LayoutContext;
  operations: OperationsBuild;
  costs: CostsBuild["refs"];
  monthly: MonthlyBuild["access"];
  returns: ReturnsBuild;
  loan: LoanBuild;
  monthlyTotal: (key: string) => string;
};

/** Where each annual line reads its months (annual-cash-flow.ts LINE_DEFINITIONS): the Operations, Costs or Monthly sheet. */
type AnnualSource = { range: string; dates: string } | { formula: (sum: (source: { range: string; dates: string }) => string) => string } | "sale" | null;

const OPERATIONS_LINE_KEYS = new Set([
  "residentialGrossRent", "nonRevenueRentAdjustment", "leaseUpLoss", "rentAdjustmentLoss", "freeRentLoss", "leaseUpConcessionLoss",
  "totalResidentialRent", "otherIncome", "totalPotentialIncome", "vacancyLoss", "creditLoss", "commercialBaseRent", "commercialFreeRent",
  "commercialRecoveries", "commercialVacancyLoss", "commercialCreditLoss", "commercialEffectiveGrossRevenue", "effectiveGrossRevenue",
  "operatingExpenses", "commercialOperatingExpenses", "propertyTax", "fullPropertyTax", "netOperatingIncome", "residentialNetOperatingIncome",
  "commercialNetOperatingIncome", "capitalExpenditures", "operatingCashFlow",
]);
const COST_CATEGORY_OF: Record<string, CostCategory> = {
  landCost: "land",
  hardCost: "hard_cost",
  softCost: "soft_cost",
  developmentFee: "development_fee",
  financingFeeCost: "financing_fee",
};
const MONTHLY_KEY_OF: Record<string, string> = {
  projectCosts: "projectCosts",
  loanFee: "loanFee",
  constructionInterest: "grossInterest",
  totalDebtDraw: "totalDebtDraw",
  otherSourcesApplied: "otherSourcesApplied",
  repayment: "repayment",
  softLoanRepayment: "softLoanRepayment",
  permanentLoanProceeds: "permanentLoanProceeds",
  refinanceCosts: "refinanceCosts",
  permanentDebtService: "permanentDebtService",
  permanentLoanPayoff: "permanentLoanPayoff",
  netSaleProceeds: "netSaleProceeds",
  unleveredCashFlow: "unleveredCashFlow",
  leveredCashFlow: "leveredCashFlow",
};

function annualSourceFor(key: string, deps: AnnualDeps): AnnualSource {
  const { operations, costs, monthly } = deps;
  const ops = (rowKey: string) => (operations.has(rowKey) ? { range: operations.range(rowKey), dates: operations.dates() } : null);
  if (OPERATIONS_LINE_KEYS.has(key)) return ops(key);
  if (key === "netOperatingIncomeFullTax") {
    const noi = ops("netOperatingIncome")!;
    const full = ops("fullPropertyTax");
    const scheduled = ops("propertyTax");
    return full && scheduled ? { formula: (sum) => `${sum(noi)}-${sum(full)}+${sum(scheduled)}` } : noi;
  }
  if (key in COST_CATEGORY_OF) return { range: costs.categoryRange(COST_CATEGORY_OF[key]), dates: costs.dates };
  if (key in MONTHLY_KEY_OF) return monthly.has(MONTHLY_KEY_OF[key]) ? { range: monthly.range(MONTHLY_KEY_OF[key]), dates: monthly.dates } : null;
  if (key === "grossSaleValue" || key === "sellingCosts") return "sale";
  throw new Error(`The Annual sheet does not know where the line ${key} reads its months.`);
}

/**
 * LA-1952, annual-cash-flow.ts: each year sums its months from the sheets that hold them. A year's first and
 * last month are live, so a change that moves stabilization moves the operating years with it. The years
 * themselves are the ones the run reported, so a change that adds or removes a year needs a new run.
 */
function annualSheet(deps: AnnualDeps): LayoutSheet {
  const { ctx, operations, monthly, returns, loan } = deps;
  const { source } = ctx;
  const rows = header(source, "Annual Cash Flow");
  const basis = annualBasis(source.result);
  if (!basis || !source.result.annualCashFlow) {
    rows.push({ cells: [{ kind: "text", text: "This run was saved before the annual view existed. Run the case again to see years.", role: "note" }] });
    return { name: SHEET_NAMES.annual, columnWidths: [40], frozen: { rows: HEADER_ROWS, columns: 1 }, rows };
  }
  const { years } = basis.years;
  const firstYearColumn = 1;
  const letterOf = (index: number) => columnLetter(firstYearColumn + index);
  rows.push({
    cells: [
      { kind: "text", text: ANNUAL_YEAR_BASIS_LABELS[basis.kind], role: "column" },
      ...years.map((year): LayoutCell => ({ kind: "text", text: year.partial ? `${year.label} (${year.monthCount} Mo.)` : year.label, role: "column" })),
    ],
  });

  // The months each year covers, from the first day of its first month to the last day of its last, since the
  // Monthly sheet heads its months with month-end dates and the other sheets with the first of the month.
  // Operating years count from the first stabilized month on the Operations sheet.
  const anchorRow = rows.length + 1;
  const startRow = anchorRow + 1;
  const endRow = anchorRow + 2;
  const countRow = anchorRow + 3;
  const anchor = basis.kind === "operating_year"
    ? `INDEX(${operations.dates()},MATCH(1,${operations.range("stabilized")},0))`
    : `EOMONTH(${monthly.firstDate},-1)+1`;
  rows.push({
    outlineLevel: 2,
    cells: [{ kind: "text", text: basis.kind === "operating_year" ? "First Stabilized Month" : "First Model Month", role: "label" }, { kind: "calc", format: "date", formula: anchor }],
  });
  let yearNumber = 0;
  const starts = years.map((year) => {
    if (year.kind === "development") return `EOMONTH(${monthly.firstDate},-1)+1`;
    yearNumber += 1;
    return `EDATE($B$${anchorRow},${12 * (yearNumber - 1)})`;
  });
  rows.push({ outlineLevel: 2, cells: [{ kind: "text", text: "Year Starts", role: "label" }, ...starts.map((formula): LayoutCell => ({ kind: "calc", format: "date", formula }))] });
  rows.push({
    outlineLevel: 2,
    cells: [
      { kind: "text", text: "Year Ends", role: "label" },
      ...years.map((year, index): LayoutCell => ({
        kind: "calc",
        format: "date",
        formula: year.kind === "development" ? `EOMONTH($B$${anchorRow},-1)` : `MIN(EOMONTH(${letterOf(index)}${startRow},11),EOMONTH(${monthly.lastDate},0))`,
      })),
    ],
  });
  rows.push({
    outlineLevel: 2,
    cells: [
      { kind: "text", text: "Months", role: "label" },
      ...years.map((_, index): LayoutCell => ({ kind: "calc", format: "count", formula: `${monthCount(`${letterOf(index)}$${endRow}`)}-${monthCount(`${letterOf(index)}$${startRow}`)}+1` })),
    ],
  });

  const lineRow = new Map<string, number>();
  let section: string | null = null;
  for (const trace of source.result.annualCashFlow.traces) {
    if (trace.key === "debtServiceCoverage" || trace.key === "debtYield") continue;
    if (trace.section !== section) {
      section = trace.section;
      rows.push({ cells: [{ kind: "text", text: ANNUAL_SECTION_LABELS[trace.section], role: "section" }] });
    }
    const key = trace.key;
    const from = annualSourceFor(key, deps);
    lineRow.set(key, rows.length + 1);
    rows.push({
      outlineLevel: 1,
      cells: [
        { kind: "text", text: trace.label, role: "label" },
        ...years.map((year, index): LayoutCell => {
          const start = `${letterOf(index)}$${startRow}`;
          const end = `${letterOf(index)}$${endRow}`;
          const sum = ({ range, dates }: { range: string; dates: string }) => `SUMIFS(${range},${dates},">="&${start},${dates},"<="&${end})`;
          const formula = from === null
            ? "0"
            : from === "sale"
              ? `IF(AND(${returns.ref("saleDate")}>=${start},${returns.ref("saleDate")}<=${end}),${returns.ref(key === "grossSaleValue" ? "grossCents" : "sellingCents")}/100,0)`
              : `ROUND(${"formula" in from ? from.formula(sum) : sum(from)},2)`;
          return { kind: "output", id: `annual.${key}.${year.key}`, format: "money", engineValue: year.lines[key], formula };
        }),
      ],
    });
  }

  // Lender measures, for a full operating year only (annual-cash-flow.ts).
  const permanent = source.result.developmentCapital.permanentLoan != null;
  const statedService = !permanent && ctx.has("lenderTests.annualDebtService") ? ctx.input("lenderTests.annualDebtService") : null;
  const loanAmount = permanent ? loan.ref("pLoan") : deps.monthlyTotal("totalDebtDraw");
  const measures = (index: number) => {
    const letter = letterOf(index);
    const noi = `${letter}${lineRow.get("netOperatingIncome")}`;
    const fullOperatingYear = `AND(${letter}$${countRow}=12,${monthCount(`${letter}$${startRow}`)}>=${operations.scalar("s.opStart")})`;
    const window = (range: string) => `${range},${monthly.dates},">="&${letter}$${startRow},${monthly.dates},"<="&${letter}$${endRow}`;
    let service: string | null = statedService;
    if (permanent) {
      const paid = `COUNTIFS(${window(`${monthly.range("permanentDebtService")},">0"`)})`;
      service = `IF(${paid}>0,ROUND(ROUND(SUMIFS(${window(monthly.range("permanentDebtService"))})*100,0)*12/${paid},0)/100,0)`;
    }
    return {
      debtServiceCoverage: service === null ? `""` : `IF(AND(${fullOperatingYear},${service}>0),${noi}/(${service}),"")`,
      debtYield: `IF(AND(${fullOperatingYear},${loanAmount}>0),${noi}/${loanAmount},"")`,
    };
  };
  rows.push({ cells: [{ kind: "text", text: "Lender Measures", role: "section" }] });
  for (const [key, label, format] of [["debtServiceCoverage", "Debt Service Coverage", "multiple"], ["debtYield", "Debt Yield", "rate"]] as const) {
    rows.push({
      outlineLevel: 1,
      cells: [
        { kind: "text", text: label, role: "label" },
        ...years.map((year, index): LayoutCell | null => {
          if (year.kind === "development") return null;
          const formula = measures(index)[key];
          const value = year[key];
          return value === null ? { kind: "calc", format, formula } : { kind: "output", id: `annual.${key}.${year.key}`, format, engineValue: value, formula };
        }),
      ],
    });
  }
  return { name: SHEET_NAMES.annual, columnWidths: [40, ...years.map(() => 18)], frozen: { rows: HEADER_ROWS + 1, columns: 1 }, rows };
}

/** The Assumptions sheet, its input names, and the context every other sheet reads them through. */
export function assumptionsFor(source: WorkbookSource): { sheet: LayoutSheet; names: WorkbookLayout["names"]; ctx: LayoutContext } {
  const names: WorkbookLayout["names"] = [];
  const inputNames = new Map<string, string>();
  const sheet = assumptionsSheet(source, names, inputNames);
  const ctx: LayoutContext = {
    source,
    input: (path) => {
      const name = inputNames.get(path);
      if (!name) throw new Error(`The Assumptions sheet holds no input at ${path}.`);
      return name;
    },
    has: (path) => inputNames.has(path),
  };
  return { sheet, names, ctx };
}

export function underwritingWorkbookLayout(source: WorkbookSource): WorkbookLayout {
  const { sheet: assumptions, names, ctx } = assumptionsFor(source);
  const run = operationsFor(ctx);
  const operations = buildOperationsSheet(ctx, run, projectedOperations(source, run));
  const leaseTerms = buildLeaseTermsSheet(ctx, run, operations);
  const costs = buildCostsSheets(ctx, run.costSchedule, leaseTerms?.commission);
  const loan = createLoan(ctx, operations, names);
  const returns = createReturns(ctx, operations);
  const monthly = monthlySheet(ctx, costs.refs, operations, loan, returns);
  const loanSheet = loan.finish({ total: monthly.total });
  const inputs = source.inputs as PropertyReturnsInputs;
  const partnership = inputs.partnership && source.result.partnership
    ? buildWaterfallSheet(ctx, inputs.partnership, source.result.partnership, {
      months: source.result.developmentCapital.months.map(({ month }) => month),
      levered: (position) => monthly.access.cell("leveredCashFlow", position),
      equity: (position) => monthly.access.cell("equityContribution", position),
    })
    : null;
  costs.refs.linkFinancing(`${monthly.total("loanFee")}+${monthly.total("operatingShortfall")}+${monthly.total("capitalizedInterest")}`);
  const sourcesAndUses = buildSourcesAndUsesSheet(ctx, {
    costs: costs.refs,
    monthlyTotal: monthly.total,
    otherSourceDraws: monthly.otherSourceDraws,
  });
  const layout: WorkbookLayout = {
    sheets: [
      returns.finish({ monthly: monthly.access, waterfall: partnership }),
      sourcesAndUses,
      monthly.sheet,
      loanSheet,
      ...(partnership ? [partnership.sheet] : []),
      operations.sheet,
      ...(leaseTerms ? [leaseTerms.sheet] : []),
      costs.costs,
      ...(costs.settling ? [costs.settling] : []),
      annualSheet({ ctx, operations, costs: costs.refs, monthly: monthly.access, returns, loan, monthlyTotal: monthly.total }),
      assumptions,
    ],
    names,
    // Excel repeats the calculation until the equity the loan commits and the interest it reserves agree, and stops once no cell moves by more than a tenth of a cent.
    iterativeCalculation: { maxIterations: 1000, maxChange: 0.001 },
  };
  assertFormulasFit(layout);
  return layout;
}

/**
 * The months after the sale the engine projects to price it (property-returns.ts): the forward twelve
 * months, and through the end of the tax schedule when the sale adds the abatement's value.
 */
function projectedOperations(source: WorkbookSource, run: ApartmentOperationsResult): MonthlyApartmentOperations[] {
  const inputs = structuredClone(source.inputs as PropertyReturnsInputs);
  resolveMilestoneAnchors(inputs);
  const forwardEnd = monthIndexOf(inputs.saleMonth) + 11;
  const abatementEnd = inputs.saleTax?.valueBasis === "full_tax_plus_abatement_value" && inputs.propertyTax
    ? monthIndexOf(propertyTaxScheduleEndMonth(inputs.propertyTax))
    : forwardEnd;
  const end = Math.max(forwardEnd, abatementEnd);
  const lastModelMonth = monthIndexOf(run.months.at(-1)!.month);
  const label = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
  return projectApartmentOperationsThrough(inputs, label(end)).filter(({ month }) => monthIndexOf(month) > lastModelMonth);
}

export type LayoutOutput = { sheet: string; address: string; cell: Extract<LayoutCell, { kind: "output" }> };

export function layoutOutputs(layout: WorkbookLayout): LayoutOutput[] {
  return layout.sheets.flatMap((sheet) =>
    sheet.rows.flatMap((row, rowIndex) =>
      row.cells.flatMap((cell, columnIndex) =>
        cell?.kind === "output" ? [{ sheet: sheet.name, address: cellAddress(rowIndex, columnIndex), cell }] : [],
      ),
    ),
  );
}
