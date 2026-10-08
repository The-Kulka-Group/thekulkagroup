import {
  ANNUAL_SECTION_LABELS,
  ANNUAL_YEAR_BASIS_LABELS,
  type AnnualCashFlowYears,
  type AnnualYearBasisKind,
  type DevelopmentCapitalTotals,
  type MonthlyDevelopmentCapital,
  type PropertyReturnsResult,
} from "@kulka/engine";

// LA-1947. The workbook as plain data: sheets, rows and cells, with every
// output cell carrying the engine's own value. The writer turns this into an
// .xlsx, and the LibreOffice check reads the recalculated file back against
// the same layout. LA-1949 to LA-1952 replace value cells with formulas here;
// an output with a `formula` is live, one without is the engine's value.

export type CellFormat = "money" | "rate" | "multiple" | "count" | "percent_number" | "basis_points" | "number" | "date" | "text";

export type LayoutCell =
  | { kind: "text"; text: string; role?: "title" | "subtitle" | "meta" | "section" | "column" | "label" | "note" }
  | { kind: "input"; value: number | string | boolean; format: CellFormat; name?: string }
  | { kind: "date"; value: string }
  | { kind: "output"; id: string; format: CellFormat; engineValue: number; formula?: string };

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

export const SHEET_NAMES = { assumptions: "Assumptions", monthly: "Monthly", annual: "Annual", returns: "Returns" } as const;

/** Rows 1 to 4 are the Kulka header on every sheet, row 5 is blank, and content starts on row 6. */
const HEADER_ROWS = 5;

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

function header(source: WorkbookSource, sheetTitle: string): LayoutRow[] {
  const ran = new Date(source.runCreatedAt).toISOString().slice(0, 10);
  return [
    { cells: [{ kind: "text", text: `Kulka  |  ${sheetTitle}`, role: "title" }] },
    { cells: [{ kind: "text", text: `${source.caseName}, Case ${source.caseNumber} (Sheet ${source.sheetNumber})`, role: "subtitle" }] },
    { cells: [{ kind: "text", text: `Run ${source.runId} on ${ran}, revision ${source.caseRevision}, formula version ${source.formulaVersion}`, role: "meta" }] },
    { cells: [{ kind: "text", text: "Blue figures are inputs. Black figures are live formulas. Gray figures are the engine's saved values and are not yet formulas.", role: "note" }] },
    { cells: [] },
  ];
}

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

function assumptionsSheet(source: WorkbookSource, names: WorkbookLayout["names"]): LayoutSheet {
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

type MonthlyLine = {
  key: string;
  label: string;
  format: CellFormat;
  read: (month: MonthlyDevelopmentCapital, property: PropertyRow | undefined) => number;
  /** A flow sums to a Total; a balance or rate has none. */
  total: false | { engineTotal: (totals: DevelopmentCapitalTotals, result: PropertyReturnsResult) => number | undefined };
};

type PropertyRow = PropertyReturnsResult["propertyReturns"]["months"][number];

const flow = (engineTotal: (totals: DevelopmentCapitalTotals, result: PropertyReturnsResult) => number | undefined = () => undefined) => ({ engineTotal });

const CAPITAL_LINES: MonthlyLine[] = [
  { key: "projectCosts", label: "Project Costs", format: "money", read: (m) => m.projectCosts, total: flow((t) => t.projectCosts) },
  { key: "operatingCashFlow", label: "Operating Cash Flow", format: "money", read: (m) => m.operatingCashFlow, total: flow() },
  { key: "loanFee", label: "Loan Fees", format: "money", read: (m) => m.loanFee, total: flow((t) => t.loanFees) },
  { key: "grossInterest", label: "Gross Interest", format: "money", read: (m) => m.grossInterest, total: flow((t) => t.grossInterest) },
  { key: "operatingCashAppliedToInterest", label: "Operating Cash Applied to Interest", format: "money", read: (m) => m.operatingCashAppliedToInterest, total: flow((t) => t.operatingCashAppliedToInterest) },
  { key: "capitalizedInterest", label: "Capitalized Interest", format: "money", read: (m) => m.capitalizedInterest, total: flow((t) => t.capitalizedInterest) },
  { key: "equityContribution", label: "Equity", format: "money", read: (m) => m.equityContribution, total: flow((t) => t.equity) },
  { key: "debtBeforeReservesDraw", label: "Debt Before Reserves", format: "money", read: (m) => m.debtBeforeReservesDraw, total: flow((t) => t.debtBeforeReserves) },
  { key: "interestReserveDraw", label: "Interest Reserve", format: "money", read: (m) => m.interestReserveDraw, total: flow((t) => t.interestReserve) },
  { key: "operatingShortfallReserveDraw", label: "Operating Shortfall Reserve", format: "money", read: (m) => m.operatingShortfallReserveDraw, total: flow((t) => t.operatingShortfallReserve) },
  { key: "totalDebtDraw", label: "Total Debt Draw", format: "money", read: (m) => m.totalDebtDraw, total: flow((t) => t.totalDebt) },
  { key: "otherSourcesApplied", label: "Grants and Soft Loans Applied", format: "money", read: (m) => m.otherSourcesApplied, total: flow((t) => t.otherSourcesApplied) },
  { key: "softLoanRepayment", label: "Soft Loan Repayment", format: "money", read: (m) => m.softLoanRepayment, total: flow((t) => t.softLoanRepayment) },
  { key: "totalSources", label: "Total Sources", format: "money", read: (m) => m.totalSources, total: flow((t) => t.totalSources) },
  { key: "totalUses", label: "Total Uses", format: "money", read: (m) => m.totalUses, total: flow((t) => t.totalUses) },
  { key: "repayment", label: "Construction Loan Repayment", format: "money", read: (m) => m.repayment, total: flow() },
  { key: "annualRatePercent", label: "Annual Rate", format: "percent_number", read: (m) => m.annualRatePercent, total: false },
  { key: "openingDebtBalance", label: "Opening Debt Balance", format: "money", read: (m) => m.openingDebtBalance, total: false },
  { key: "closingDebtBalance", label: "Closing Debt Balance", format: "money", read: (m) => m.closingDebtBalance, total: false },
];

const PERMANENT_LINES: MonthlyLine[] = [
  { key: "permanentLoanProceeds", label: "Permanent Loan Proceeds", format: "money", read: (_, p) => p?.permanentLoanProceeds ?? 0, total: flow() },
  { key: "refinanceCosts", label: "Refinance Costs", format: "money", read: (_, p) => p?.refinanceCosts ?? 0, total: flow() },
  { key: "permanentDebtService", label: "Permanent Debt Service", format: "money", read: (_, p) => p?.permanentDebtService ?? 0, total: flow() },
  { key: "permanentLoanPayoff", label: "Permanent Loan Payoff", format: "money", read: (_, p) => p?.permanentLoanPayoff ?? 0, total: flow() },
];

const PROPERTY_LINES: MonthlyLine[] = [
  { key: "netSaleProceeds", label: "Net Sale Proceeds", format: "money", read: (_, p) => p?.netSaleProceeds ?? 0, total: flow((_, r) => r.propertyReturns.sale.netSaleProceeds) },
  { key: "unleveredCashFlow", label: "Unlevered Cash Flow", format: "money", read: (_, p) => p?.unleveredCashFlow ?? 0, total: flow((_, r) => r.propertyReturns.returns.unlevered.netProfit) },
  { key: "leveredCashFlow", label: "Levered Cash Flow", format: "money", read: (_, p) => p?.leveredCashFlow ?? 0, total: flow((_, r) => r.propertyReturns.returns.levered.netProfit) },
];

/** Engine values are whole cents; the sum of a month row is rounded the same way. */
function centsSum(values: number[]) {
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
}

function monthlySheet(source: WorkbookSource): LayoutSheet {
  const { developmentCapital, propertyReturns } = source.result;
  const months = developmentCapital.months;
  const property = new Map(propertyReturns.months.map((row) => [row.month, row]));
  const firstMonthColumn = 2;
  const lastMonthColumn = firstMonthColumn + months.length - 1;
  const rows = header(source, "Monthly Cash Flow");

  rows.push({
    cells: [
      { kind: "text", text: "Line", role: "column" },
      { kind: "text", text: "Total", role: "column" },
      ...months.map(({ month }): LayoutCell => ({ kind: "date", value: property.get(month)?.date ?? `${month}-01` })),
    ],
  });

  const section = (title: string, lines: MonthlyLine[]) => {
    rows.push({ cells: [{ kind: "text", text: title, role: "section" }] });
    for (const line of lines) {
      const rowIndex = rows.length;
      const values = months.map((month) => line.read(month, property.get(month.month)));
      const total: LayoutCell | null = line.total
        ? {
          kind: "output",
          id: `monthly.${line.key}.total`,
          format: line.format,
          engineValue: line.total.engineTotal(developmentCapital.totals, source.result) ?? centsSum(values),
          formula: `SUM(${cellAddress(rowIndex, firstMonthColumn)}:${cellAddress(rowIndex, lastMonthColumn)})`,
        }
        : null;
      rows.push({
        outlineLevel: 1,
        cells: [
          { kind: "text", text: line.label, role: "label" },
          total,
          ...values.map((engineValue, index): LayoutCell => ({ kind: "output", id: `monthly.${line.key}.${months[index].month}`, format: line.format, engineValue })),
        ],
      });
    }
  };

  section("Development Costs and Funding", CAPITAL_LINES);
  if (developmentCapital.permanentLoan) section("Permanent Loan", PERMANENT_LINES);
  section("Property Cash Flow", PROPERTY_LINES);

  return {
    name: SHEET_NAMES.monthly,
    columnWidths: [36, 16, ...months.map(() => 13)],
    frozen: { rows: HEADER_ROWS + 1, columns: 2 },
    rows,
  };
}

// --------------------------------------------------------------------- Annual

function annualBasis(result: PropertyReturnsResult): { kind: AnnualYearBasisKind; years: AnnualCashFlowYears } | null {
  const views = result.annualCashFlow;
  if (!views) return null;
  return views.operating_year ? { kind: "operating_year", years: views.operating_year } : { kind: "analysis_year", years: views.analysis_year };
}

function annualSheet(source: WorkbookSource): LayoutSheet {
  const rows = header(source, "Annual Cash Flow");
  const basis = annualBasis(source.result);
  if (!basis || !source.result.annualCashFlow) {
    rows.push({ cells: [{ kind: "text", text: "This run was saved before the annual view existed. Run the case again to see years.", role: "note" }] });
    return { name: SHEET_NAMES.annual, columnWidths: [40], frozen: { rows: HEADER_ROWS, columns: 1 }, rows };
  }
  const { years } = basis.years;
  rows.push({
    cells: [
      { kind: "text", text: ANNUAL_YEAR_BASIS_LABELS[basis.kind], role: "column" },
      ...years.map((year): LayoutCell => ({ kind: "text", text: year.partial ? `${year.label} (${year.monthCount} Mo.)` : year.label, role: "column" })),
    ],
  });
  let section: string | null = null;
  for (const trace of source.result.annualCashFlow.traces) {
    if (trace.key === "debtServiceCoverage" || trace.key === "debtYield") continue;
    if (trace.section !== section) {
      section = trace.section;
      rows.push({ cells: [{ kind: "text", text: ANNUAL_SECTION_LABELS[trace.section], role: "section" }] });
    }
    const key = trace.key;
    rows.push({
      outlineLevel: 1,
      cells: [
        { kind: "text", text: trace.label, role: "label" },
        ...years.map((year): LayoutCell => ({ kind: "output", id: `annual.${key}.${year.key}`, format: "money", engineValue: year.lines[key] })),
      ],
    });
  }
  rows.push({ cells: [{ kind: "text", text: "Lender Measures", role: "section" }] });
  for (const [key, label, format] of [["debtServiceCoverage", "Debt Service Coverage", "multiple"], ["debtYield", "Debt Yield", "rate"]] as const) {
    rows.push({
      outlineLevel: 1,
      cells: [
        { kind: "text", text: label, role: "label" },
        ...years.map((year): LayoutCell | null => {
          const value = year[key];
          return value === null ? null : { kind: "output", id: `annual.${key}.${year.key}`, format, engineValue: value };
        }),
      ],
    });
  }
  return { name: SHEET_NAMES.annual, columnWidths: [40, ...years.map(() => 18)], frozen: { rows: HEADER_ROWS + 1, columns: 1 }, rows };
}

// -------------------------------------------------------------------- Returns

const METRIC_FORMAT = { usd: "money", ratio: "rate", multiple: "multiple", basis_points: "basis_points" } as const;

/** The engine's return metrics that describe the sale; the rest are returns. */
const SALE_METRIC_KEYS = new Set([
  "effectiveGrossRevenue",
  "forwardNetOperatingIncome",
  "residentialForwardNetOperatingIncome",
  "commercialForwardNetOperatingIncome",
  "residentialSaleValue",
  "commercialSaleValue",
  "grossSaleValue",
  "sellingCosts",
  "netSaleProceeds",
  "debtPayoff",
  "equitySaleProceeds",
]);

function returnsSheet(source: WorkbookSource): LayoutSheet {
  const rows = header(source, "Returns");
  const { propertyReturns, partnership } = source.result;
  const line = (id: string, label: string, format: CellFormat, engineValue: number): LayoutRow => ({
    outlineLevel: 1,
    cells: [{ kind: "text", text: label, role: "label" }, { kind: "output", id, format, engineValue }],
  });

  const metrics = propertyReturns.metrics;
  const sale = metrics.filter(({ key }) => SALE_METRIC_KEYS.has(key));
  const returns = metrics.filter(({ key }) => !SALE_METRIC_KEYS.has(key));
  for (const [title, group] of [["Sale", sale], ["Property Returns", returns]] as const) {
    if (group.length === 0) continue;
    if (rows.length > HEADER_ROWS) rows.push({ cells: [] });
    rows.push({ cells: [{ kind: "text", text: title, role: "section" }] });
    for (const metric of group) rows.push(line(`returns.metric.${metric.key}`, metric.label, METRIC_FORMAT[metric.unit], metric.value));
  }

  if (partnership) {
    rows.push({ cells: [] }, { cells: [{ kind: "text", text: "Partnership", role: "section" }] });
    for (const metric of partnership.metrics) {
      if (metric.value === null) continue;
      rows.push(line(`returns.partnership.${metric.key}`, metric.label, METRIC_FORMAT[metric.unit], metric.value));
    }
  }

  return { name: SHEET_NAMES.returns, columnWidths: [44, 18], frozen: { rows: HEADER_ROWS, columns: 1 }, rows };
}

export function underwritingWorkbookLayout(source: WorkbookSource): WorkbookLayout {
  const names: WorkbookLayout["names"] = [];
  const assumptions = assumptionsSheet(source, names);
  return { sheets: [returnsSheet(source), monthlySheet(source), annualSheet(source), assumptions], names };
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
