import type { PartnershipMetricKey, PropertyReturnsInputs, PropertyReturnsResult } from "@kulka/engine";

import {
  HEADER_ROWS,
  SHEET_NAMES,
  dateOfMonthText,
  header,
  monthCount,
  sheetRef,
  xirrFromFirstFlow,
  type CellFormat,
  type LayoutCell,
  type LayoutContext,
  type LayoutRow,
  type LayoutSheet,
} from "./frame";
import type { OperationsBuild } from "./operations";
import type { WaterfallBuild } from "./waterfall";

// LA-1952. The Returns sheet: the sale and the property returns as live formulas, following
// property-returns.ts. The sale prices the twelve months from the sale month on the Operations sheet,
// which runs past the sale for this, on the tax basis the case states. A working section under the
// figures holds each step in whole cents, as the engine rounds it.

/** How the Returns sheet reads the Monthly sheet. */
export type MonthlyReturnsAccess = {
  /** A row across the month columns, absolute. */
  range: (key: string) => string;
  /** A row in one month. */
  cell: (key: string, position: number) => string;
  has: (key: string) => boolean;
  lastPosition: number;
};

export type ReturnsBuild = {
  /** A working figure on the Returns sheet, absolute. */
  ref: (key: string) => string;
  finish: (deps: { monthly: MonthlyReturnsAccess; waterfall: WaterfallBuild | null }) => LayoutSheet;
};

const METRIC_FORMAT = { usd: "money", ratio: "rate", multiple: "multiple", basis_points: "basis_points" } as const;

/** The engine's return metrics that describe the sale; the rest are returns. */
const SALE_METRIC_KEYS = new Set([
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

type Working = { key: string; label: string; format: CellFormat; formula: (W: (key: string) => string, m: MonthlyReturnsAccess) => string };
type Entry =
  | { kind: "section"; title: string }
  | { kind: "blank" }
  | { kind: "metric"; id: string; label: string; format: CellFormat; engineValue: number; formula: (W: (key: string) => string, m: MonthlyReturnsAccess, waterfall: WaterfallBuild | null) => string }
  | ({ kind: "working" } & Working);

export function createReturns(ctx: LayoutContext, operations: OperationsBuild): ReturnsBuild {
  const { source } = ctx;
  const inputs = source.inputs as PropertyReturnsInputs;
  const result: PropertyReturnsResult = source.result;
  const n = (path: string) => ctx.input(path);
  const working: Working[] = [];
  const work = (key: string, label: string, format: CellFormat, formula: Working["formula"]) => working.push({ key, label, format, formula });

  const hasTax = inputs.propertyTax !== undefined;
  const saleTax = inputs.saleTax;
  const addsAbatement = saleTax?.valueBasis === "full_tax_plus_abatement_value";
  const splitByUse = inputs.commercialTerminalCapRatePercent !== undefined;
  const hasPermanentLoan = result.developmentCapital.permanentLoan != null;
  const dates = operations.projectedDates();
  const sumOver = (rowKey: string, W: (key: string) => string) => `SUMIFS(${operations.projectedRange(rowKey)},${dates},">="&${W("saleDate")},${dates},"<="&${W("forwardEnd")})`;
  const centsOver = (rowKey: string, W: (key: string) => string) => `ROUND(${sumOver(rowKey, W)}*100,0)`;

  // ------------------------------------------------------------ sale working
  work("saleDate", "Sale Month", "date", () => dateOfMonthText(n("saleMonth")));
  work("forwardEnd", "Last Month of the Forward Year", "date", (W) => `EDATE(${W("saleDate")},11)`);
  work("egrCents", "Forward Effective Gross Revenue (Cents)", "number", (W) => centsOver("effectiveGrossRevenue", W));
  work("scheduledOpexCents", "Forward Operating Expenses With Scheduled Tax (Cents)", "number", (W) => centsOver("operatingExpenses", W));
  work("addedTaxCents", "Tax Added by Ending the Abatement (Cents)", "number", (W) =>
    (hasTax ? `${centsOver("fullPropertyTax", W)}-${centsOver("propertyTax", W)}` : "0"));
  work("fullTax", "Sale Prices Full Tax (1 = Yes)", "number", () => (saleTax ? `IF(${n("saleTax.valueBasis")}<>"scheduled_tax",1,0)` : "0"));
  work("opexCents", "Forward Operating Expenses on the Sale's Tax Basis (Cents)", "number", (W) => `${W("scheduledOpexCents")}+IF(${W("fullTax")}=1,${W("addedTaxCents")},0)`);
  work("noiCents", "Forward Sale NOI (Cents)", "number", (W) => `${W("egrCents")}-${W("opexCents")}`);
  work("abatementCents", "Present Value of the Abatement Left at Sale (Cents)", "number", (W) => {
    if (!addsAbatement) return "0";
    // abatementValueAtSale in property-tax.ts: each month's saving from the sale month on, discounted from the end of that month.
    const all = operations.projectedDates();
    const saving = `(ROUND(${operations.projectedRange("fullPropertyTax")}*100,0)-ROUND(${operations.projectedRange("propertyTax")}*100,0))`;
    const months = `((YEAR(${all})*12+MONTH(${all}))-${monthCount(W("saleDate"))}+1)`;
    return `IF(${n("saleTax.valueBasis")}="full_tax_plus_abatement_value",ROUND(SUMPRODUCT((${all}>=${W("saleDate")})*${saving}/(1+${n("saleTax.abatementDiscountRatePercent")}/100)^(${months}/12)),0),0)`;
  });
  if (splitByUse) {
    work("commercialCents", "Commercial Forward Sale NOI (Cents)", "number", (W) =>
      `${centsOver("commercialNetOperatingIncome", W)}-IF(${W("fullTax")}=1,${sumOver("commercialAddedTax", W)},0)`);
    work("residentialCents", "Residential Forward Sale NOI (Cents)", "number", (W) => `${W("noiCents")}-${W("commercialCents")}`);
    work("residentialValueCents", "Residential Sale Value (Cents)", "number", (W) => `ROUND(${W("residentialCents")}/(${n("terminalCapRatePercent")}/100),0)`);
    work("commercialValueCents", "Commercial Sale Value (Cents)", "number", (W) => `ROUND(${W("commercialCents")}/(${n("commercialTerminalCapRatePercent")}/100),0)`);
    work("grossCents", "Gross Sale Value (Cents)", "number", (W) => `${W("residentialValueCents")}+${W("commercialValueCents")}+${W("abatementCents")}`);
  } else {
    work("grossCents", "Gross Sale Value (Cents)", "number", (W) => `ROUND(${W("noiCents")}/(${n("terminalCapRatePercent")}/100),0)+${W("abatementCents")}`);
  }
  work("sellingCents", "Selling Costs (Cents)", "number", (W) => `ROUND(${W("grossCents")}*${n("sellingCostPercent")}/100,0)`);
  work("netCents", "Net Sale Proceeds (Cents)", "number", (W) => `${W("grossCents")}-${W("sellingCents")}`);
  work("payoffCents", hasPermanentLoan ? "Permanent Loan Payoff at Sale (Cents)" : "Construction Debt Payoff at Sale (Cents)", "number", (_, m) =>
    [m.cell("repayment", m.lastPosition), ...(hasPermanentLoan ? [m.cell("permanentLoanPayoff", m.lastPosition)] : [])].map((cell) => `ROUND(${cell}*100,0)`).join("+"));
  work("equityCents", "Equity Sale Proceeds (Cents)", "number", (W) => `${W("netCents")}-${W("payoffCents")}`);
  work("costWithCarryCents", "Total Project Cost Including Carry (Cents)", "number", (_, m) => `ROUND(SUM(${m.range("w.costWithCarry")})*100,0)`);
  work("exitCapPercent", "Exit Cap Rate the Spread Reads (Percent)", "percent_number", (W) =>
    (splitByUse ? `${W("noiCents")}/(${W("residentialValueCents")}+${W("commercialValueCents")})*100` : n("terminalCapRatePercent")));

  // --------------------------------------------------------------- metrics
  const stream = (row: string) => ({
    xirr: (m: MonthlyReturnsAccess) => xirrFromFirstFlow(m.range(row), m.range("w.cashFlowDate")),
    multiple: (m: MonthlyReturnsAccess) => `SUMIF(${m.range(row)},">0")/-SUMIF(${m.range(row)},"<0")`,
    profit: (m: MonthlyReturnsAccess) => `SUM(${m.range(row)})`,
  });
  const unlevered = stream("unleveredCashFlow");
  const levered = stream("leveredCashFlow");
  const dollars = (key: string) => (W: (key: string) => string) => `${W(key)}/100`;
  const metricFormulas: Record<string, (W: (key: string) => string, m: MonthlyReturnsAccess) => string> = {
    forwardNetOperatingIncome: dollars("noiCents"),
    grossSaleValue: dollars("grossCents"),
    residentialForwardNetOperatingIncome: dollars("residentialCents"),
    commercialForwardNetOperatingIncome: dollars("commercialCents"),
    residentialSaleValue: dollars("residentialValueCents"),
    commercialSaleValue: dollars("commercialValueCents"),
    sellingCosts: dollars("sellingCents"),
    netSaleProceeds: dollars("netCents"),
    debtPayoff: dollars("payoffCents"),
    equitySaleProceeds: dollars("equityCents"),
    unleveredXirr: (_, m) => unlevered.xirr(m),
    unleveredEquityMultiple: (_, m) => unlevered.multiple(m),
    unleveredNetProfit: (_, m) => unlevered.profit(m),
    leveredXirr: (_, m) => levered.xirr(m),
    leveredEquityMultiple: (_, m) => levered.multiple(m),
    leveredNetProfit: (_, m) => levered.profit(m),
    peakEquity: (_, m) => `MAX(0,MAX(${m.range("w.equityOut")}))`,
    yieldOnCost: (W) => `${W("noiCents")}/${W("costWithCarryCents")}`,
    developmentSpread: (W) => `(${W("noiCents")}/${W("costWithCarryCents")}-${W("exitCapPercent")}/100)*10000`,
  };

  const entries: Entry[] = [];
  const metrics = result.propertyReturns.metrics;
  for (const [title, group] of [["Sale", metrics.filter(({ key }) => SALE_METRIC_KEYS.has(key))], ["Property Returns", metrics.filter(({ key }) => !SALE_METRIC_KEYS.has(key))]] as const) {
    if (group.length === 0) continue;
    if (entries.length > 0) entries.push({ kind: "blank" });
    entries.push({ kind: "section", title });
    for (const metric of group) {
      const formula = metricFormulas[metric.key];
      if (!formula) throw new Error(`The Returns sheet has no formula for the metric ${metric.key}.`);
      entries.push({ kind: "metric", id: `returns.metric.${metric.key}`, label: metric.label, format: METRIC_FORMAT[metric.unit], engineValue: metric.value, formula });
    }
  }
  if (result.partnership) {
    entries.push({ kind: "blank" }, { kind: "section", title: "Partnership" });
    for (const metric of result.partnership.metrics) {
      if (metric.value === null) continue;
      const key = metric.key as PartnershipMetricKey;
      entries.push({
        kind: "metric",
        id: `returns.partnership.${key}`,
        label: metric.label,
        format: METRIC_FORMAT[metric.unit],
        engineValue: metric.value,
        formula: (_, __, waterfall) => {
          if (!waterfall) throw new Error("The Returns sheet shows partnership metrics, so it needs the Waterfall sheet.");
          return waterfall.metric(key);
        },
      });
    }
  }
  entries.push({ kind: "blank" }, { kind: "section", title: "Sale Working (Cents Unless Marked)" });
  for (const item of working) entries.push({ kind: "working", ...item });

  const firstEntryRow = HEADER_ROWS + 1;
  const rowOf = new Map<string, number>();
  entries.forEach((entry, index) => {
    if (entry.kind === "working") rowOf.set(entry.key, firstEntryRow + index);
  });
  const local = (key: string) => {
    const row = rowOf.get(key);
    if (row === undefined) throw new Error(`The Returns sheet has no working figure ${key}.`);
    return `$B$${row}`;
  };

  const finish: ReturnsBuild["finish"] = ({ monthly, waterfall }) => {
    const rows: LayoutRow[] = header(source, "Returns");
    for (const entry of entries) {
      if (entry.kind === "section") {
        rows.push({ cells: [{ kind: "text", text: entry.title, role: "section" }] });
      } else if (entry.kind === "blank") {
        rows.push({ cells: [] });
      } else if (entry.kind === "metric") {
        const cell: LayoutCell = { kind: "output", id: entry.id, format: entry.format, engineValue: entry.engineValue, formula: entry.formula(local, monthly, waterfall) };
        rows.push({ outlineLevel: 1, cells: [{ kind: "text", text: entry.label, role: "label" }, cell] });
      } else {
        rows.push({ outlineLevel: 2, cells: [{ kind: "text", text: entry.label, role: "label" }, { kind: "calc", format: entry.format, formula: entry.formula(local, monthly) }] });
      }
    }
    return { name: SHEET_NAMES.returns, columnWidths: [52, 18], frozen: { rows: HEADER_ROWS, columns: 1 }, rows };
  };

  return { ref: (key) => sheetRef(SHEET_NAMES.returns, local(key)), finish };
}
