import {
  AFFORDABILITY_TIERS,
  ANNUAL_SECTION_LABELS,
  ANNUAL_YEAR_BASIS_LABELS,
  affordabilityReport,
  type AffordabilityTier,
  type AnnualCashFlowYears,
  type AnnualYearBasisKind,
  type PropertyReturnsInputs,
  type PropertyReturnsResult,
  type SourcesAndUsesBasis,
} from "@kulka/engine";

import { formatMultiple } from "@/app/(app)/underwriting/[id]/format-multiple";
import type { WorkbookSource } from "@/lib/underwriting/workbook/layout";

import { OPEN_SANS_WOFF2_BASE64 } from "./open-sans";

// LA-1948. The deal summary of one saved run as finished HTML: seven numbered
// sections, for Devin or a lender. Pure. Nothing here reaches the network, the
// database or the filesystem: the font travels inside the page and the renderer
// in ./render.ts prints it from a private origin.
//
// LA-2056. The sections flow one after another instead of one to a printed page,
// and the cover shares page one with Sources and Uses. A heading stays with the
// table under it and no table row splits across a page break (the CSS below).
// render.ts counts the printed pages and refuses a summary that runs long.
//
// The page is client-facing. It carries the deal, never a past job's name or a
// count of past jobs (LA-1483).

export const SUMMARY_PAGE_IDS = ["cover", "sources-and-uses", "unit-mix", "annual-cash-flow", "debt", "partnership", "assumptions"] as const;
export type SummaryPageId = (typeof SUMMARY_PAGE_IDS)[number];

const MONEY = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });

const esc = (value: string | number): string =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Whole dollars, a loss in brackets, the way an estimate or a pro forma reads. */
export function money(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "$0";
  return rounded < 0 ? `($${MONEY.format(-rounded)})` : `$${MONEY.format(rounded)}`;
}

const percent = (ratio: number | null | undefined) => (ratio == null ? "Not Reported" : PERCENT.format(ratio));
const multiple = (value: number | null | undefined) => (value == null ? "Not Reported" : formatMultiple(value));

const DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
export const runDate = (iso: string) => DATE.format(new Date(iso));

const TIER_LABELS: Record<AffordabilityTier, string> = { market: "Market", workforce: "Workforce", affordable: "Affordable" };

type Cell = string | { text: string; className?: string };

function cellHtml(cell: Cell, tag: "td" | "th", className = ""): string {
  const { text, className: own } = typeof cell === "string" ? { text: cell, className: undefined } : cell;
  const classes = [className, own].filter(Boolean).join(" ");
  return `<${tag}${classes ? ` class="${classes}"` : ""}>${text}</${tag}>`;
}

/** A table whose columns after the first are numbers unless `left` names them. Cells are already escaped HTML. */
function table(options: { head: string[]; rows: Cell[][]; left?: number[]; total?: Cell[]; caption?: string; className?: string }): string {
  const left = new Set([0, ...(options.left ?? [])]);
  const cells = (row: Cell[], tag: "td" | "th") => row.map((cell, index) => cellHtml(cell, index === 0 && tag === "td" ? "th" : tag, left.has(index) ? "l" : "r")).join("");
  const head = `<thead><tr>${options.head.map((label, index) => `<th class="${left.has(index) ? "l" : "r"}">${esc(label)}</th>`).join("")}</tr></thead>`;
  const body = options.rows.map((row) => `<tr>${cells(row, "td")}</tr>`).join("");
  const total = options.total ? `<tr class="total">${cells(options.total, "td")}</tr>` : "";
  return `<table data-audit="table" class="${options.className ?? ""}">${options.caption ? `<caption>${esc(options.caption)}</caption>` : ""}${head}<tbody>${body}${total}</tbody></table>`;
}

function page(id: SummaryPageId, number: number, title: string, lede: string, body: string): string {
  return `<section class="sec" data-page="${id}"><header class="ph"><span class="pn">${String(number).padStart(2, "0")}</span><h2>${esc(title)}</h2></header>${lede ? `<p class="lede">${lede}</p>` : ""}${body}</section>`;
}

const note = (text: string) => `<p class="note">${text}</p>`;
const h3 = (text: string) => `<h3>${esc(text)}</h3>`;

function stat(label: string, value: string, className = ""): string {
  return `<div class="stat ${className}"><span class="k">${esc(label)}</span><strong class="v">${esc(value)}</strong></div>`;
}

// ------------------------------------------------------------------ the pages

function coverPage(source: WorkbookSource): string {
  const { propertyReturns, developmentCapital } = source.result;
  const levered = propertyReturns.returns.levered;
  const peak = propertyReturns.peakEquity;
  const body = `
    <div class="cover">
      <p class="eyebrow">Underwriting Deal Summary</p>
      <h1>${esc(source.caseName)}</h1>
      ${source.address ? `<p class="addr">${esc(source.address)}</p>` : ""}
      <p class="when">Run On ${esc(runDate(source.runCreatedAt))}</p>
      <div class="headline">
        ${stat("Levered XIRR", percent(levered.xirr), "big")}
        ${stat("Levered Equity Multiple", multiple(levered.equityMultiple), "big")}
        ${stat("Yield On Cost", percent(propertyReturns.yieldOnCost), "big")}
      </div>
      <div class="facts">
        ${stat("Total Project Cost", money(developmentCapital.totals.totalUses))}
        ${stat("Peak Equity", peak ? money(peak.amount) : "Not Reported")}
        ${stat("Levered Net Profit", money(levered.netProfit))}
        ${stat("Gross Sale Value", money(propertyReturns.sale.grossSaleValue))}
      </div>
    </div>
    <footer class="cover-foot">
      <span>Case ${esc(source.caseNumber)}, Sheet ${esc(source.sheetNumber)}, Revision ${esc(source.caseRevision)}</span>
      <span>Run ${esc(source.runId.slice(0, 8))}, Formula Version ${esc(source.formulaVersion)}</span>
    </footer>`;
  return `<section class="sec cover-sec" data-page="cover">${body}</section>`;
}

/** Uses lines split out of "Other Project Costs": the cost schedule's totals by category, as the run saved them. */
type UsesBreakout = Array<{ label: string; amount: number }>;

const BREAKOUT_LINES = [
  ["hardCost", "Hard Cost"],
  ["softCost", "Soft Cost"],
  ["developmentFee", "Development Fee"],
  ["financingFeeCost", "Financing Fee"],
] as const;

/**
 * The categories behind the "Other Project Costs" use, from the annual view's run totals. Only used when
 * they add up to that line to the dollar, so a run saved without the annual view keeps the single line.
 */
function usesBreakout(result: PropertyReturnsResult, basis: SourcesAndUsesBasis): UsesBreakout | null {
  const totals = result.annualCashFlow?.analysis_year.totals;
  const other = basis.uses.find((use) => use.key === "otherProjectCosts");
  if (!totals || !other) return null;
  const lines = BREAKOUT_LINES.map(([key, label]) => ({ label, amount: totals[key] })).filter((line) => Math.round(line.amount) !== 0);
  const sum = lines.reduce((total, line) => total + line.amount, 0);
  return lines.length > 0 && Math.abs(sum - other.amount) < 1 ? lines : null;
}

function basisTable(basis: SourcesAndUsesBasis, caption: string, breakout: UsesBreakout | null): string {
  const uses = breakout
    ? basis.uses.flatMap((use) => (use.key === "otherProjectCosts" ? breakout : [use]))
    : basis.uses;
  const count = Math.max(basis.sources.length, uses.length);
  const rows: Cell[][] = Array.from({ length: count }, (_, index) => {
    const source = basis.sources[index];
    const use = uses[index];
    return [source ? esc(source.label) : "", source ? money(source.amount) : "", { text: use ? esc(use.label) : "", className: "l" }, use ? money(use.amount) : ""];
  });
  return table({
    caption,
    head: ["Sources", "Amount", "Uses", "Amount"],
    left: [2],
    rows,
    total: ["Total Sources", money(basis.totalSources), { text: "Total Uses", className: "l" }, money(basis.totalUses)],
  });
}

function sourcesAndUsesPage(source: WorkbookSource): string {
  const capital = source.result.developmentCapital;
  const breakoutFor = (basis: SourcesAndUsesBasis) => usesBreakout(source.result, basis);
  const { sourcesAndUses, totals, creditedLand } = capital;
  const stats = `<div class="facts">${stat("Total Uses", money(totals.totalUses))}${stat("Equity", money(totals.sponsorEquity))}${stat("Construction Debt", money(totals.totalDebt))}${stat("Debt Share", `${NUMBER.format(totals.debtSharePercent)}%`)}</div>`;
  let body = stats + basisTable(sourcesAndUses.cashBasis, "Sources and Uses with Land at Cash Cost", breakoutFor(sourcesAndUses.cashBasis));
  if (sourcesAndUses.creditedBasis) {
    body += h3("With Land at Credited Value") + basisTable(sourcesAndUses.creditedBasis, "Sources and Uses with Land at Credited Value", breakoutFor(sourcesAndUses.creditedBasis));
    if (creditedLand) body += note(`Credited land: cash cost ${money(creditedLand.cashLandCost)}, credited value ${money(creditedLand.creditedValue)}, step-up ${money(creditedLand.stepUp)}. The step-up is a non-cash use and a non-cash equity source of the same amount.`);
  }
  return page("sources-and-uses", 2, "Sources and Uses", "Land is at cash cost. Total sources equal total uses.", body);
}

function unitTypesOf(inputs: unknown): PropertyReturnsInputs["residentialUnitTypes"] {
  const types = (inputs as Partial<PropertyReturnsInputs> | null)?.residentialUnitTypes;
  return Array.isArray(types) ? types : [];
}

function amiRange(min: number | null, max: number | null): string {
  if (min === null || max === null) return "";
  return min === max ? `${min}%` : `${min}% to ${max}%`;
}

function unitMixPage(source: WorkbookSource): string {
  const unitTypes = unitTypesOf(source.inputs);
  if (unitTypes.length === 0) {
    return page("unit-mix", 3, "Unit Mix by Tier", "", note("This run saved no apartment unit types."));
  }
  const report = affordabilityReport(unitTypes);
  const tierRows: Cell[][] = AFFORDABILITY_TIERS.flatMap((tier): Cell[][] => {
    const row = report.tiers.find((item) => item.tier === tier)!;
    if (row.units === 0) return [];
    return [[
      TIER_LABELS[tier],
      NUMBER.format(row.units),
      NUMBER.format(row.revenueUnits),
      NUMBER.format(row.rentableSf),
      row.averageMonthlyRent === null ? "" : money(row.averageMonthlyRent),
      { text: amiRange(row.minAmiPercent, row.maxAmiPercent), className: "l" },
    ]];
  });
  const tiers = table({
    head: ["Tier", "Units", "Revenue Units", "Rentable SF", "Average Rent", "AMI"],
    left: [5],
    rows: tierRows,
    total: ["Total", NUMBER.format(report.total.units), NUMBER.format(report.total.revenueUnits), NUMBER.format(report.total.rentableSf), "", { text: "", className: "l" }],
  });
  const typeRows: Cell[][] = unitTypes.map((line) => [
    esc(line.name),
    { text: TIER_LABELS[line.affordabilityTier ?? "market"], className: "l" },
    NUMBER.format(line.units),
    NUMBER.format(line.averageAreaSf),
    money(line.monthlyMarketRent),
  ]);
  const types = table({ head: ["Unit Type", "Tier", "Units", "Average SF", "Monthly Rent"], left: [1], rows: typeRows });
  return page(
    "unit-mix",
    3,
    "Unit Mix by Tier",
    "Every unit type counts in its tier. Rent is the entered monthly rent per revenue unit, before growth and losses.",
    tiers + h3("By Unit Type") + types,
  );
}

const ANNUAL_BASIS_ORDER: AnnualYearBasisKind[] = ["operating_year", "analysis_year"];

function annualPage(result: PropertyReturnsResult): string {
  const views = result.annualCashFlow;
  const kind = views && ANNUAL_BASIS_ORDER.find((candidate) => views[candidate]);
  const basis: AnnualCashFlowYears | null = views && kind ? views[kind] : null;
  if (!views || !kind || !basis) {
    return page("annual-cash-flow", 4, "Annual Cash Flow", "", note("This run was saved before the annual view existed. Run the case again to see years."));
  }
  const { years } = basis;
  const heads = ["", ...years.map((year) => (year.partial ? `${year.label} (${year.monthCount} Mo.)` : year.label))];
  let body = "";
  const sections = new Map<string, Cell[][]>();
  for (const trace of views.traces) {
    const key = trace.key;
    if (key === "debtServiceCoverage" || key === "debtYield") continue;
    if (years.every((year) => Math.round(year.lines[key]) === 0)) continue;
    const rows = sections.get(trace.section) ?? [];
    rows.push([esc(trace.label), ...years.map((year) => money(year.lines[key]))]);
    sections.set(trace.section, rows);
  }
  for (const [section, rows] of sections) {
    body += table({ className: "annual", head: [ANNUAL_SECTION_LABELS[section as keyof typeof ANNUAL_SECTION_LABELS], ...heads.slice(1)], rows });
  }
  const measures: Cell[][] = [];
  if (years.some((year) => year.debtServiceCoverage !== null)) measures.push(["Debt Service Coverage", ...years.map((year) => (year.debtServiceCoverage === null ? "" : multiple(year.debtServiceCoverage)))]);
  if (years.some((year) => year.debtYield !== null)) measures.push(["Debt Yield", ...years.map((year) => (year.debtYield === null ? "" : percent(year.debtYield)))]);
  if (measures.length > 0) body += table({ className: "annual", head: ["Lender Measures", ...heads.slice(1)], rows: measures });
  return page("annual-cash-flow", 4, "Annual Cash Flow", `${ANNUAL_YEAR_BASIS_LABELS[kind]}, summed from the monthly run. A part year says how many months it holds.`, body);
}

function debtPage(result: PropertyReturnsResult): string {
  const { totals, permanentLoan, rateSchedule } = result.developmentCapital;
  let body = permanentLoan ? h3("Construction Loan") : "";
  const construction: Cell[][] = [
    ["Debt Funded", money(totals.totalDebt)],
    ["Debt Share of Total Uses", `${NUMBER.format(totals.debtSharePercent)}%`],
    ["Loan Fees", money(totals.loanFees)],
    ["Gross Interest", money(totals.grossInterest)],
    ["Capitalized Interest", money(totals.capitalizedInterest)],
    ["Interest Reserve", money(totals.interestReserve)],
  ];
  body += table({ head: ["Item", "Amount"], rows: construction });
  if (rateSchedule) body += note(`The rate follows ${esc(rateSchedule.curveSourceLabel)} as of ${esc(rateSchedule.asOfDate)}, plus a ${NUMBER.format(rateSchedule.spreadPercent)}% spread.`);
  if (permanentLoan) {
    body += h3("Permanent Loan");
    const rows: Cell[][] = [
      ["Loan Amount", money(permanentLoan.loanAmount)],
      ["Funds In", esc(permanentLoan.fundingMonth)],
      ["Matures", esc(permanentLoan.maturityMonth)],
      ["Fee and Closing Costs", money(permanentLoan.fee + permanentLoan.closingCosts)],
      ["Construction Loan Payoff", money(permanentLoan.constructionPayoff)],
      ["Cash Out to Equity", money(permanentLoan.cashOut)],
      ["Annual Debt Service", money(permanentLoan.annualDebtService)],
    ];
    body += table({ head: ["Item", "Amount"], rows });
  }
  const tests = result.lenderTests;
  if (tests) {
    body += h3("Lender Tests");
    const rows: Cell[][] = tests.metrics.map((metric) => [esc(metric.label), metric.value === null ? "Not Reported" : metric.unit === "usd" ? money(metric.value) : metric.unit === "ratio" ? percent(metric.value) : multiple(metric.value)]);
    body += table({ head: ["Test", "Value"], rows });
    if (tests.loanSizing) {
      const sizing = tests.loanSizing;
      body += table({
        head: ["Loan Size Limit", "Largest Loan", "Binds"],
        left: [2],
        rows: sizing.caps.map((cap): Cell[] => [esc(cap.label), money(cap.amount), { text: cap.binding ? "Binding" : "", className: "l" }]),
      });
    }
    body += note(`Valuation year ${esc(tests.valuationStartMonth)} to ${esc(tests.valuationEndMonth)}, NOI of ${money(tests.stabilizedNoi)}.`);
  }
  return page("debt", 5, permanentLoan ? "Construction and Permanent Debt" : "Construction Loan", "", body);
}

function partnershipPage(result: PropertyReturnsResult): string {
  const peak = result.propertyReturns.peakEquity;
  const partnership = result.partnership;
  let body = `<div class="facts">${stat("Peak Equity", peak ? money(peak.amount) : "Not Reported")}${stat("Reached In", peak?.month ?? "Not Reported")}${stat("Levered Net Profit", money(result.propertyReturns.returns.levered.netProfit))}</div>`;
  if (!partnership) {
    return page("partnership", 6, "Partnership Returns", "", body + note("This run carries no partnership plan, so it shows no LP and GP split."));
  }
  const { lp, gp } = partnership;
  const row = (label: string, pick: (partner: typeof lp) => string, total?: string): Cell[] => [label, pick(lp), pick(gp), total ?? ""];
  const rows: Cell[][] = [
    row("Contributions", (p) => money(p.contributions), money(lp.contributions + gp.contributions)),
    row("Distributions", (p) => money(p.distributions), money(lp.distributions + gp.distributions)),
    row("Net Profit", (p) => money(p.netProfit), money(lp.netProfit + gp.netProfit)),
    row("XIRR", (p) => percent(p.xirr)),
    row("Equity Multiple", (p) => multiple(p.equityMultiple)),
    row("Peak Equity", (p) => money(p.peakEquity)),
  ];
  body += table({ head: ["Result", "LP", "GP", "Total"], rows });
  body += h3("Distributions by Tier");
  body += table({
    head: ["Tier", "LP IRR Hurdle", "GP Promote", "Distributed", "To LP", "To GP"],
    rows: partnership.tiers.map((tier, index): Cell[] => [
      `Tier ${index + 1}`,
      `${NUMBER.format(tier.lpIrrHurdlePercent)}%`,
      `${NUMBER.format(tier.promotePercent)}%`,
      money(tier.total),
      money(tier.lp),
      money(tier.gpBase + tier.promote),
    ]),
  });
  body += note(`${NUMBER.format(partnership.lpFundingSharePercent)}% of equity is LP and ${NUMBER.format(100 - partnership.lpFundingSharePercent)}% is GP. The GP promote is ${money(partnership.promoteTotal)}.`);
  return page("partnership", 6, "Partnership Returns", "", body);
}

export const MODEL_LIMITS = [
  "The model values the property from forward twelve-month net operating income and a direct terminal cap rate.",
  "It runs by month. It does not model income taxes or financing beyond the loans and the partnership plan saved with the case.",
  "Figures come from the inputs saved with the run. A change to any input needs a new run.",
  "This summary does not record a finance or sale approval, and it is not an appraisal or a lender commitment.",
] as const;

function assumptionsPage(source: WorkbookSource): string {
  const inputs = (source.inputs ?? {}) as Partial<PropertyReturnsInputs>;
  const months = source.result.developmentCapital.months;
  const sale = source.result.propertyReturns.months.at(-1);
  const rows: Cell[][] = [];
  const add = (label: string, value: string | null) => {
    if (value !== null) rows.push([esc(label), { text: esc(value), className: "r" }]);
  };
  const pct = (value: number | undefined) => (typeof value === "number" ? `${NUMBER.format(value)}%` : null);
  if (months.length > 0) add("Model Months", `${months[0].month} to ${months[months.length - 1].month}`);
  add("Sale Month", sale?.month ?? null);
  add("Exit Cap Rate", pct(inputs.terminalCapRatePercent));
  add("Commercial Exit Cap Rate", pct(inputs.commercialTerminalCapRatePercent));
  add("Selling Costs", pct(inputs.sellingCostPercent));
  add("Loan to Cost, % of Total Uses", pct(inputs.targetDebtSharePercent));
  add("Construction Loan Rate", pct(inputs.annualInterestRatePercent));
  add("Loan Fee", pct(inputs.loanFeePercent));
  add("Interest Treatment", inputs.interestTreatment ? inputs.interestTreatment.replace(/\.v\d+$/, "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : null);
  add("Lender Valuation Cap Rate", pct(inputs.lenderTests?.asStabilizedCapRatePercent));
  const table_ = table({ head: ["Assumption", "Value"], rows });
  const limits = `<ul class="limits">${MODEL_LIMITS.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
  return page("assumptions", 7, "Assumptions and Model Limits", "The headline assumptions behind this run. The full input set travels with the Excel workbook.", table_ + h3("Model Limits") + limits);
}

// ------------------------------------------------------------------- the page

const CSS = `
@font-face{font-family:"Open Sans";font-weight:400 800;font-style:normal;src:url(data:font/woff2;base64,${OPEN_SANS_WOFF2_BASE64}) format("woff2")}
:root{--ink:#323338;--ink-2:#676879;--brand:#1D1D1F;--border:#D0D4E4;--border-light:#E6E9EF;--canvas:#F6F7FB;--primary:#0073EA;--primary-tint:#EAF3FE}
*{box-sizing:border-box}
html,body{margin:0;background:#fff;color:var(--ink);font-family:"Open Sans",Arial,sans-serif;font-size:11px;line-height:1.4;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.sec{margin:0 0 8px}
.ph,.lede,h3,caption{break-after:avoid;page-break-after:avoid}
.ph{display:flex;align-items:baseline;gap:10px;border-bottom:2px solid var(--brand);padding-bottom:4px;margin-bottom:6px}
.pn{font-size:11px;font-weight:700;color:var(--ink-2);font-variant-numeric:tabular-nums}
h2{margin:0;font-size:20px;font-weight:800;letter-spacing:-.012em;color:var(--brand)}
h3{margin:10px 0 3px;font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-2)}
.lede,.note{margin:0 0 6px;font-size:11px;color:var(--ink-2)}
.note{margin-top:6px}
table{width:100%;border-collapse:collapse;margin:0 0 8px;font-variant-numeric:tabular-nums;break-inside:avoid;page-break-inside:avoid}
caption{caption-side:top;text-align:left;font-size:11px;font-weight:700;color:var(--ink-2);padding:0 0 3px}
th,td{padding:2px 6px;border-bottom:1px solid var(--border-light);font-size:11px;vertical-align:top}
thead th{background:var(--canvas);border-bottom:1px solid var(--border);font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-2)}
tbody th{font-weight:400;text-align:left}
tr{break-inside:avoid;page-break-inside:avoid}
.l{text-align:left}.r{text-align:right}
.total th,.total td{font-weight:700;border-top:1px solid var(--brand);border-bottom:0}
table.annual th,table.annual td{font-size:9.5px;padding:1.5px 4px}
table.annual{table-layout:fixed;margin-bottom:6px}
table.annual th:first-child{width:25%}
table.annual thead th{font-size:8.5px}
.facts,.headline{display:flex;gap:10px;margin:0 0 10px}
.stat{flex:1;border:1px solid var(--border);border-radius:8px;padding:8px 10px;background:#fff}
.stat .k{display:block;font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-2)}
.stat .v{display:block;margin-top:2px;font-size:16px;font-weight:700;color:var(--brand);font-variant-numeric:tabular-nums}
.stat.big{padding:10px 14px;background:var(--canvas)}
.stat.big .v{font-size:30px;font-weight:800;letter-spacing:-.02em}
.cover-sec{break-inside:avoid}
.cover{padding-top:0}
.eyebrow{margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2)}
h1{margin:0;font-size:40px;line-height:46px;font-weight:800;letter-spacing:-.02em;color:var(--brand)}
.addr{margin:6px 0 0;font-size:15px;color:var(--ink-2)}
.when{margin:4px 0 16px;font-size:13px;color:var(--ink-2)}
.cover-foot{display:flex;justify-content:space-between;border-top:1px solid var(--border);padding-top:8px;margin-bottom:6px;font-size:10px;color:var(--ink-2)}
.limits{margin:0;padding-left:18px;break-inside:avoid;page-break-inside:avoid}.limits li{margin:0 0 2px}
`;

export function renderSummaryHtml(source: WorkbookSource): string {
  const pages = [
    coverPage(source),
    sourcesAndUsesPage(source),
    unitMixPage(source),
    annualPage(source.result),
    debtPage(source.result),
    partnershipPage(source.result),
    assumptionsPage(source),
  ].join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(source.caseName)}, Underwriting Deal Summary</title><style>${CSS}</style></head><body>${pages}</body></html>`;
}

const HEADER_STYLE = "width:100%;font-family:'Open Sans',Arial,sans-serif;font-size:8px;color:#676879;padding:0 14mm;display:flex;justify-content:space-between;";

/** Chromium's running header and footer. The cover is page one, so its header repeats the deal quietly. */
export function summaryTemplates(source: WorkbookSource): { headerTemplate: string; footerTemplate: string } {
  return {
    headerTemplate: `<div style="${HEADER_STYLE}"><span style="font-weight:700;color:#1D1D1F">Kulka</span><span>${esc(source.caseName)} · Underwriting Deal Summary</span></div>`,
    footerTemplate: `<div style="${HEADER_STYLE}"><span>Run ${esc(source.runId.slice(0, 8))} · ${esc(runDate(source.runCreatedAt))}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  };
}

export function summaryFileName(source: WorkbookSource) {
  return `Kulka Underwriting ${source.sheetNumber} Deal Summary ${source.runId.slice(0, 8)}.pdf`;
}
