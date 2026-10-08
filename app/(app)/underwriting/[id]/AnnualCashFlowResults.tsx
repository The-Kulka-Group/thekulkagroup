"use client";

import { useState } from "react";

import {
  ANNUAL_SECTION_LABELS,
  ANNUAL_YEAR_BASIS_LABELS,
  annualCashFlowChecks,
  type AnnualCashFlowViews,
  type AnnualCashFlowYears,
  type AnnualLineKey,
  type AnnualSection,
  type AnnualYear,
  type AnnualYearBasisKind,
} from "@kulka/engine";

import { Chip } from "@/components/Status";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const BASIS_ORDER: AnnualYearBasisKind[] = ["operating_year", "analysis_year", "calendar_year"];

/** Rows that always show. Every other line shows only when some year carries a figure on it. */
const CORE_LINES = new Set<AnnualLineKey>([
  "effectiveGrossRevenue",
  "operatingExpenses",
  "netOperatingIncome",
  "capitalExpenditures",
  "operatingCashFlow",
  "projectCosts",
  "unleveredCashFlow",
  "leveredCashFlow",
]);

const SECTION_ORDER: AnnualSection[] = ["revenue", "expenses", "net_operating_income", "project_costs", "debt", "sale", "cash_flow"];

/**
 * The monthly results rolled into years (LA-1872). It reads the years saved inside the run result, so a
 * run page needs no monthly grid. Operating years are the default, with the development period as the
 * first column. A run saved before the annual view carries none and says so.
 */
export function AnnualCashFlowResults({ views }: { views: AnnualCashFlowViews | null | undefined }) {
  const [basis, setBasis] = useState<AnnualYearBasisKind | null>(null);
  return <AnnualCashFlowView views={views} basis={basis} onBasis={setBasis} />;
}

/** The table for one chosen basis. The choice lives in the caller, so the view is the same on the server and in tests. */
export function AnnualCashFlowView({ views, basis, onBasis }: { views: AnnualCashFlowViews | null | undefined; basis: AnnualYearBasisKind | null; onBasis: (basis: AnnualYearBasisKind) => void }) {
  const available = views ? BASIS_ORDER.filter((kind) => views[kind] !== null) : [];
  if (!views || available.length === 0) {
    return <>
      <h4>Annual Cash Flow</h4>
      <p className="t-meta">This run was saved before the annual view, so it has none. Run the case again to see it.</p>
    </>;
  }
  const chosen = basis && available.includes(basis) ? basis : available[0];
  const view = views[chosen]!;
  const checks = annualCashFlowChecks(view);
  const failing = checks.filter(({ status }) => status === "fail");
  return <>
    <h4>Annual Cash Flow</h4>
    <p className="t-meta">{describe(view, chosen)}</p>
    <div role="group" aria-label="Year Basis" className="underwriting-form-actions">
      {available.map((kind) => <button key={kind} type="button" className={`btn ${kind === chosen ? "btn--primary" : "btn--secondary"}`} aria-pressed={kind === chosen} onClick={() => onBasis(kind)}>{ANNUAL_YEAR_BASIS_LABELS[kind]}</button>)}
    </div>
    <div className="underwriting-results-wrap"><table className="underwriting-monthly-table underwriting-annual-cash-flow"><thead><tr>
      <th>Line</th>
      {view.years.map((year) => <th key={year.key} className="right" scope="col"><span className="annual-head-label">{year.label}</span><span className="annual-head-range t-meta">{yearRange(year)}</span>{yearNote(year) ? <span className="annual-head-note t-meta">{yearNote(year)}</span> : null}</th>)}
    </tr></thead><tbody>
      {SECTION_ORDER.map((section) => <Section key={section} section={section} views={views} view={view} />)}
      <tr><th scope="row" colSpan={view.years.length + 1}>Coverage</th></tr>
      <tr><th scope="row">Debt Service Coverage</th>{view.years.map((year) => <td key={year.key} className="num right">{year.debtServiceCoverage === null ? "Not Reported" : `${NUMBER.format(year.debtServiceCoverage)}x`}</td>)}</tr>
      <tr><th scope="row">Debt Yield</th>{view.years.map((year) => <td key={year.key} className="num right">{year.debtYield === null ? "Not Reported" : PERCENT.format(year.debtYield)}</td>)}</tr>
    </tbody></table></div>
    <p className="t-meta">Coverage and debt yield show for each full operating year. A part year or the development period shows Not Reported.</p>
    <h4>Annual Cash Flow Formula Traces</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Line</th><th>Section</th><th>Formula</th><th>Inputs Used</th></tr></thead><tbody>
      {views.traces.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th><td>{ANNUAL_SECTION_LABELS[trace.section]}</td><td>{trace.formula}</td><td className="t-meta">{trace.inputPaths.join(", ")}</td></tr>)}
    </tbody></table></div>
    <h4>Annual Cash Flow Checks</h4>
    <p className="t-meta">{failing.length === 0 ? `All ${checks.length} checks pass. Each year's lines add up to its months, and the years add up to the monthly totals.` : `${failing.length} of ${checks.length} checks fail.`}</p>
    <details>
      <summary>Show Every Check</summary>
      <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th><th className="right">Difference</th></tr></thead><tbody>
        {checks.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{formatCheck(check.expected, check.unit)}</td><td className="num right">{formatCheck(check.actual, check.unit)}</td><td className="num right">{formatCheck(check.difference, check.unit)}</td></tr>)}
      </tbody></table></div>
    </details>
  </>;
}

function Section({ section, views, view }: { section: AnnualSection; views: AnnualCashFlowViews; view: AnnualCashFlowYears }) {
  const rows = views.traces.filter((trace) => trace.section === section && isLine(trace.key)
    && (CORE_LINES.has(trace.key as AnnualLineKey) || view.years.some((year) => year.lines[trace.key as AnnualLineKey] !== 0)));
  if (rows.length === 0) return null;
  return <>
    <tr><th scope="row" colSpan={view.years.length + 1}>{ANNUAL_SECTION_LABELS[section]}</th></tr>
    {rows.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th>{view.years.map((year) => <td key={year.key} className="num right">{MONEY.format(year.lines[trace.key as AnnualLineKey])}</td>)}</tr>)}
  </>;
}

function isLine(key: string) {
  return key !== "debtServiceCoverage" && key !== "debtYield";
}

function yearRange(year: AnnualYear) {
  return `${year.startMonth} to ${year.endMonth}`;
}

function yearNote(year: AnnualYear) {
  if (year.kind === "development") return `${year.monthCount} Months`;
  const marks = [year.partial ? `Part Year, ${year.monthCount} Months` : null, year.saleYear ? "Sale Year" : null].filter(Boolean);
  return marks.join(", ");
}

function describe(view: AnnualCashFlowYears, kind: AnnualYearBasisKind) {
  const lead = `${view.monthCount} model months from ${view.firstMonth} to ${view.lastMonth}, summed from the monthly results.`;
  if (kind === "operating_year") return `${lead} Operating years run twelve months from the first stabilized month, with the months before it as one development column. The model ends in the sale month, so it shows no year after the sale.`;
  if (kind === "analysis_year") return `${lead} Analysis years run twelve months from the first model month. The last year ends in the sale month.`;
  return `${lead} Calendar years run January to December, so the first and last year can be part years.`;
}

function formatCheck(value: number, unit: "usd" | "count" | "sf" | "ratio" | "multiple" | "basis_points" | undefined) {
  return unit === "usd" ? MONEY.format(value) : NUMBER.format(value);
}
