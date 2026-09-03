import Link from "next/link";
import { notFound } from "next/navigation";

import { Sheet, Sep } from "@/components/Sheet";
import { Chip } from "@/components/Status";
import { getDb } from "@/lib/db";
import { getUnderwritingCase } from "@/lib/underwriting/cases";
import {
  buildUnderwritingReviewItems,
  UNDERWRITING_INPUT_LABELS,
  UNDERWRITING_LIMITATIONS,
} from "@/lib/underwriting/presentation";
import {
  countUnderwritingRuns,
  getLatestUnderwritingRun,
  listUnderwritingRuns,
} from "@/lib/underwriting/runs";
import { isUuid } from "@/lib/uuid";

import { EditUnderwritingCase } from "./EditUnderwritingCase";
import { ApartmentOperationsEditor } from "./ApartmentOperationsEditor";
import { CostScheduleEditor } from "./CostScheduleEditor";
import { DevelopmentCapitalEditor } from "./DevelopmentCapitalEditor";
import { PropertyReturnsEditor } from "./PropertyReturnsEditor";
import { PropertyReturnsResults } from "./PropertyReturnsResults";
import { RunUnderwriting } from "./RunUnderwriting";

export const dynamic = "force-dynamic";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const RUNS_PER_PAGE = 20;

export default async function UnderwritingCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ runPage?: string | string[] }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const savedCase = await getUnderwritingCase(getDb(), id);
  if (!savedCase) notFound();

  const requestedPage = pageNumber((await searchParams).runPage);
  const [latestRun, runCount] = await Promise.all([
    getLatestUnderwritingRun(getDb(), id),
    countUnderwritingRuns(getDb(), id),
  ]);
  const pageCount = Math.max(1, Math.ceil(runCount / RUNS_PER_PAGE));
  const runPage = Math.min(requestedPage, pageCount);
  const runs = await listUnderwritingRuns(getDb(), id, RUNS_PER_PAGE, (runPage - 1) * RUNS_PER_PAGE);
  const currentRun = latestRun?.caseRevision === savedCase.caseRevision ? latestRun : undefined;
  const reviewItems = buildUnderwritingReviewItems(savedCase, currentRun, runCount > 0);

  return (
    <Sheet
      number={savedCase.sheetNumber}
      title={savedCase.name}
      actions={<Link className="btn btn--secondary" href="/underwriting">All cases</Link>}
      meta={
        <>
          <span>{savedCase.address}</span>
          <Sep />
          <span>Ground-up multifamily</span>
          <Sep />
          <span className="num">Updated {DATE.format(new Date(savedCase.updatedAt))}</span>
        </>
      }
      needsReview={reviewItems.length}
      reviewLabel="items need review"
    >
      <div className="record underwriting-record">
        <div className="margin" />
        <div className="col-field underwriting-decision-row">
          <div>
            <span className="t-label">Current state</span>
            <h2 className="t-1">{decisionTitle(currentRun?.status, runCount > 0)}</h2>
            <p className="t-meta">{decisionDetail(currentRun?.status, runCount > 0)}</p>
          </div>
          <Chip status={savedCase.status} />
        </div>

        {reviewItems.length > 0 ? (
          <>
            <div className="margin" />
            <section className="col-field underwriting-attention" aria-labelledby="underwriting-review-heading">
              <div className="underwriting-section-head">
                <div>
                  <h3 id="underwriting-review-heading">Needs your review</h3>
                  <p className="t-meta">This list includes case facts, calculation issues, source gaps, and working assumptions.</p>
                </div>
                <span className="chip chip--neutral"><span className="dot" /><span className="num">{reviewItems.length}</span> need review</span>
              </div>
              <div className="underwriting-issues">
                {reviewItems.map((item) => (
                  <div className={`underwriting-issue underwriting-issue--${item.severity}`} key={item.id}>
                    <span className="dot" aria-hidden="true" />
                    <span>{item.message}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

        <div className="margin" />
        <div className="col-field">
          <EditUnderwritingCase savedCase={savedCase} />
        </div>

        <div className="margin" />
        <section className="col-field record-section">
          <CostScheduleEditor savedCase={savedCase} />
        </section>

        <div className="margin" />
        <section className="col-field record-section">
          <ApartmentOperationsEditor savedCase={savedCase} />
        </section>

        <div className="margin" />
        <section className="col-field record-section">
          <DevelopmentCapitalEditor savedCase={savedCase} />
        </section>

        <div className="margin" />
        <section className="col-field record-section">
          <PropertyReturnsEditor savedCase={savedCase} />
        </section>

        <div className="margin" />
        <div className="col-field record-section underwriting-results-section">
          <div className="underwriting-section-head">
            <div>
              <h3>{savedCase.propertyReturns ? "Property sale and return results" : savedCase.developmentCapital ? "Monthly development capital results" : savedCase.apartmentOperations ? "Monthly apartment operations results" : savedCase.costSchedule ? "Monthly development cost results" : "Preliminary annual results"}</h3>
              <p className="t-meta">
                {currentRun
                  ? `${currentRun.formulaVersion} · Run ${DATE.format(new Date(currentRun.createdAt))}`
                  : runCount > 0
                    ? "The case changed after the latest run and needs recalculation."
                    : "The deterministic model has not run for this case."}
              </p>
            </div>
            <RunUnderwriting
              caseId={savedCase.id}
              caseRevision={savedCase.caseRevision}
              hasRun={Boolean(currentRun)}
            />
          </div>

          {!currentRun ? (
            <div className="empty empty--inline">
              <p>{runCount > 0
                ? "Recalculate this case revision before reviewing financial results. Prior runs remain in the history."
                : "Run the calculation to create an immutable input snapshot."}</p>
            </div>
          ) : currentRun.status === "failed" ? (
            <div className="underwriting-issues" role="status">
              {currentRun.issues.map((issue) => (
                <div className="underwriting-issue underwriting-issue--stuck" key={`${issuePath(issue)}-${issue.code}`}>
                  <span className="dot" aria-hidden="true" />
                  <span>{issue.message}</span>
                </div>
              ))}
              <p className="t-meta">This run has no financial results. Its issues and input snapshot remain in the review record.</p>
            </div>
          ) : currentRun.propertyReturnsResult ? (
            <PropertyReturnsResults result={currentRun.propertyReturnsResult} reconciliations={currentRun.reconciliations} />
          ) : currentRun.developmentCapitalResult ? (
            <div className="underwriting-monthly-results">
              <div className="underwriting-summary-band">
                <div><span className="t-label">Total Uses</span><strong className="num">{MONEY.format(currentRun.developmentCapitalResult.capital.totals.totalUses)}</strong></div>
                <div><span className="t-label">Equity</span><strong className="num">{MONEY.format(currentRun.developmentCapitalResult.capital.totals.equity)}</strong></div>
                <div><span className="t-label">Debt Before Reserves</span><strong className="num">{MONEY.format(currentRun.developmentCapitalResult.capital.totals.debtBeforeReserves)}</strong></div>
                <div><span className="t-label">Interest Reserve</span><strong className="num">{MONEY.format(currentRun.developmentCapitalResult.capital.totals.interestReserve)}</strong></div>
                <div><span className="t-label">Operating Shortfall Reserve</span><strong className="num">{MONEY.format(currentRun.developmentCapitalResult.capital.totals.operatingShortfallReserve)}</strong></div>
                <div><span className="t-label">Total Debt</span><strong className="num">{MONEY.format(currentRun.developmentCapitalResult.capital.totals.totalDebt)}</strong></div>
                <div><span className="t-label">Debt Share</span><strong className="num">{NUMBER.format(currentRun.developmentCapitalResult.capital.totals.debtSharePercent)}%</strong></div>
                <div><span className="t-label">Capitalized Interest</span><strong className="num">{MONEY.format(currentRun.developmentCapitalResult.capital.totals.capitalizedInterest)}</strong></div>
              </div>
              <h4>Monthly funding and debt balance</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-monthly-table underwriting-capital-results">
                  <thead><tr><th>Month</th><th className="right">Project Costs</th><th className="right">Operating Shortfall</th><th className="right">Loan Fee</th><th className="right">Gross Interest</th><th className="right">Operating Cash To Interest</th><th className="right">Equity</th><th className="right">Debt Before Reserves</th><th className="right">Interest Reserve</th><th className="right">Shortfall Reserve</th><th className="right">Opening Debt</th><th className="right">Repayment</th><th className="right">Closing Debt</th></tr></thead>
                  <tbody>{currentRun.developmentCapitalResult.capital.months.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th><td className="num right">{MONEY.format(month.projectCosts)}</td><td className="num right">{MONEY.format(month.operatingShortfall)}</td><td className="num right">{MONEY.format(month.loanFee)}</td><td className="num right">{MONEY.format(month.grossInterest)}</td><td className="num right">{MONEY.format(month.operatingCashAppliedToInterest)}</td><td className="num right">{MONEY.format(month.equityContribution)}</td><td className="num right">{MONEY.format(month.debtBeforeReservesDraw)}</td><td className="num right">{MONEY.format(month.interestReserveDraw)}</td><td className="num right">{MONEY.format(month.operatingShortfallReserveDraw)}</td><td className="num right">{MONEY.format(month.openingDebtBalance)}</td><td className="num right">{MONEY.format(month.repayment)}</td><td className="num right">{MONEY.format(month.closingDebtBalance)}</td></tr>)}</tbody>
                </table>
              </div>
              <h4>Formula traces</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Result</th><th>Formula</th><th>Inputs Used</th></tr></thead>
                  <tbody>{currentRun.developmentCapitalResult.capital.formulaTraces.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th><td>{trace.formula}</td><td className="t-meta">{trace.inputPaths.join(", ")}</td></tr>)}</tbody>
                </table>
              </div>
              <h4>Reconciliation checks</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th><th className="right">Difference</th></tr></thead>
                  <tbody>{currentRun.reconciliations.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{formatReconciliationValue(check.expected, check.unit)}</td><td className="num right">{formatReconciliationValue(check.actual, check.unit)}</td><td className="num right">{formatReconciliationValue(check.difference, check.unit)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : currentRun.apartmentOperationsResult ? (
            <div className="underwriting-monthly-results">
              <div className="underwriting-summary-band">
                <div><span className="t-label">Unit Total</span><strong className="num">{NUMBER.format(currentRun.apartmentOperationsResult.unitSummary.totalUnits)}</strong></div>
                <div><span className="t-label">Unit Area</span><strong className="num">{NUMBER.format(currentRun.apartmentOperationsResult.unitSummary.totalAreaSf)} SF</strong></div>
                <div><span className="t-label">Residential Rent</span><strong className="num">{MONEY.format(currentRun.apartmentOperationsResult.totals.totalResidentialRent)}</strong></div>
                <div><span className="t-label">Other Income</span><strong className="num">{MONEY.format(currentRun.apartmentOperationsResult.totals.otherIncome)}</strong></div>
                <div><span className="t-label">Effective Gross Revenue</span><strong className="num">{MONEY.format(currentRun.apartmentOperationsResult.totals.effectiveGrossRevenue)}</strong></div>
                <div><span className="t-label">Net Operating Income</span><strong className="num">{MONEY.format(currentRun.apartmentOperationsResult.totals.netOperatingIncome)}</strong></div>
                <div><span className="t-label">Operating Cash Flow</span><strong className="num">{MONEY.format(currentRun.apartmentOperationsResult.totals.operatingCashFlow)}</strong></div>
                <div><span className="t-label">First Stabilized Month</span><strong className="num">{currentRun.apartmentOperationsResult.firstStabilizedMonth ?? "Not reached"}</strong></div>
              </div>
              <h4>Monthly lease-up and operations</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-monthly-table underwriting-operations-results">
                  <thead><tr><th>Month</th><th className="right">Occupied Units</th><th className="right">Gross Rent</th><th className="right">Lease-Up Loss</th><th className="right">Non-Revenue Units</th><th className="right">Rent Adjustment</th><th className="right">Free Rent</th><th className="right">Residential Rent</th><th className="right">Other Income</th><th className="right">Vacancy</th><th className="right">Credit Loss</th><th className="right">Effective Gross Revenue</th><th className="right">Operating Expenses</th><th className="right">NOI</th><th className="right">Capital Expenditures</th><th className="right">Operating Cash Flow</th></tr></thead>
                  <tbody>{currentRun.apartmentOperationsResult.months.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th><td className="num right">{NUMBER.format(month.leasedUnits)} / {NUMBER.format(month.revenueUnits)}</td><td className="num right">{MONEY.format(month.residentialGrossRent)}</td><td className="num right">{MONEY.format(month.leaseUpLoss)}</td><td className="num right">{MONEY.format(month.nonRevenueRentAdjustment)}</td><td className="num right">{MONEY.format(month.rentAdjustmentLoss)}</td><td className="num right">{MONEY.format(month.freeRentLoss)}</td><td className="num right">{MONEY.format(month.totalResidentialRent)}</td><td className="num right">{MONEY.format(month.otherIncome)}</td><td className="num right">{MONEY.format(month.vacancyLoss)}</td><td className="num right">{MONEY.format(month.creditLoss)}</td><td className="num right">{MONEY.format(month.effectiveGrossRevenue)}</td><td className="num right">{MONEY.format(month.operatingExpenses)}</td><td className="num right">{MONEY.format(month.netOperatingIncome)}</td><td className="num right">{MONEY.format(month.capitalExpenditures)}</td><td className="num right">{MONEY.format(month.operatingCashFlow)}</td></tr>)}</tbody>
                </table>
              </div>
              <h4>Formula traces</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Result</th><th>Formula</th><th>Inputs Used</th></tr></thead>
                  <tbody>{currentRun.apartmentOperationsResult.formulaTraces.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th><td>{trace.formula}</td><td className="t-meta">{trace.inputPaths.join(", ")}</td></tr>)}</tbody>
                </table>
              </div>
              <h4>Reconciliation checks</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th><th className="right">Difference</th></tr></thead>
                  <tbody>{currentRun.reconciliations.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{formatReconciliationValue(check.expected, check.unit)}</td><td className="num right">{formatReconciliationValue(check.actual, check.unit)}</td><td className="num right">{formatReconciliationValue(check.difference, check.unit)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : currentRun.monthlyCostResult ? (
            <div className="underwriting-monthly-results">
              <div className="underwriting-summary-band">
                {Object.entries(currentRun.monthlyCostResult.totalsByCategory).map(([category, amount]) => (
                  <div key={category}><span className="t-label">{costCategoryLabel(category)}</span><strong className="num">{MONEY.format(amount)}</strong></div>
                ))}
                <div><span className="t-label">Total Uses</span><strong className="num">{MONEY.format(currentRun.monthlyCostResult.totalUses)}</strong></div>
              </div>
              <h4>Monthly uses</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-monthly-table">
                  <thead><tr><th>Month</th>{currentRun.monthlyCostResult.costLineSchedules.map((line) => <th className="right" key={line.lineId}>{line.name}</th>)}<th className="right">Total Uses</th></tr></thead>
                  <tbody>
                    {currentRun.monthlyCostResult.months.map((month) => (
                      <tr key={month.month}><th scope="row" className="num">{month.month}</th>{currentRun.monthlyCostResult!.costLineSchedules.map((line) => <td className="num right" key={line.lineId}>{MONEY.format(month.lineAmounts[line.lineId])}</td>)}<td className="num right">{MONEY.format(month.totalUses)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h4>Formula traces</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Cost Line</th><th>Distribution</th><th>Inputs Used</th></tr></thead>
                  <tbody>{currentRun.monthlyCostResult.costLineSchedules.map((line) => <tr key={line.lineId}><th scope="row">{line.name}</th><td>{line.formulaTrace}</td><td className="t-meta">{line.inputPaths.join(", ")}</td></tr>)}</tbody>
                </table>
              </div>
              <h4>Aggregate formula traces</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Result</th><th className="right">Value</th><th>Formula</th><th>Inputs Used</th></tr></thead>
                  <tbody>{currentRun.monthlyCostResult.aggregateFormulaTraces.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th><td className="num right">{MONEY.format(trace.value)}</td><td>{trace.formulaTrace}</td><td className="t-meta">{trace.inputPaths.join(", ") || "No cost lines in this period"}</td></tr>)}</tbody>
                </table>
              </div>
              <h4>Reconciliation checks</h4>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th><th className="right">Difference</th></tr></thead>
                  <tbody>{currentRun.reconciliations.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{MONEY.format(check.expected)}</td><td className="num right">{MONEY.format(check.actual)}</td><td className="num right">{MONEY.format(check.difference)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="underwriting-results-wrap">
              <table className="underwriting-results">
                <thead>
                  <tr><th>Result</th><th className="right">Value</th><th>Formula trace</th><th>Inputs used</th></tr>
                </thead>
                <tbody>
                  {currentRun.results.map((result) => (
                    <tr key={result.key}>
                      <td>{result.label}</td>
                      <td className="num right">{formatResult(result.value, result.unit)}</td>
                      <td>{result.formula}</td>
                      <td className="t-meta">{result.inputKeys.map(inputLabel).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="underwriting-limitations" aria-labelledby="underwriting-limitations-heading">
            <h4 id="underwriting-limitations-heading">Model limits</h4>
            <ul>
              {(savedCase.propertyReturns ? [
                "This formula version values the property from forward twelve-month NOI and a direct terminal cap.",
                "It does not model permanent debt, investor waterfalls, taxes, or sensitivity cases.",
                "These results do not record a finance or sale approval.",
              ] : savedCase.developmentCapital ? [
                "This formula version funds monthly project costs, operating shortfalls, and capitalized interest with equity and construction debt.",
                "Sale proceeds and property returns follow in the next formula version.",
                "These results do not record a finance approval.",
              ] : savedCase.apartmentOperations ? [
                "This formula version models apartment lease-up and property operations before debt funding.",
                "Debt funding, sale proceeds, and property returns follow in later formula versions.",
                "These results do not record a finance approval.",
              ] : savedCase.costSchedule ? [
                "This formula version schedules development costs only.",
                "Lease-up, operating cash flow, debt funding, sale proceeds, and property returns follow in later formula versions.",
                "These results do not record a finance approval.",
              ] : UNDERWRITING_LIMITATIONS).map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </div>
        </div>

        {runCount > 0 ? (
          <>
            <div className="margin" />
            <div className="col-field record-section" id="calculation-history">
              <h3>Calculation history</h3>
              <p className="t-meta underwriting-history-note">
                Every saved run remains available. Open a run to inspect its full inputs, evidence, formulas, and issues.
              </p>
              <div className="underwriting-results-wrap">
                <table className="underwriting-history">
                  <thead>
                    <tr><th>Run</th><th>Date</th><th>Status</th><th>Input snapshot</th><th className="right">Captured result</th></tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => {
                      const totalDevelopmentCost = run.results.find((result) => result.key === "totalDevelopmentCost");
                      const capturedResult = totalDevelopmentCost?.value
                        ?? run.propertyReturnsResult?.propertyReturns.returns.levered.netProfit
                        ?? run.developmentCapitalResult?.capital.totals.totalUses
                        ?? run.apartmentOperationsResult?.totals.operatingCashFlow
                        ?? run.monthlyCostResult?.totalUses;
                      const matchesCurrentRevision = run.caseRevision === savedCase.caseRevision;
                      return (
                        <tr key={run.id}>
                          <td>
                            <Link className="underwriting-history-link" href={`/underwriting/${savedCase.id}/runs/${run.id}`}>
                              {matchesCurrentRevision ? "Current revision" : `Revision ${run.caseRevision}`}
                            </Link>
                            <br /><span className="t-meta num">{run.id.slice(0, 8)}</span>
                          </td>
                          <td className="num">{DATE.format(new Date(run.createdAt))}</td>
                          <td><Chip status={run.status === "complete" ? "done" : "stuck"} /></td>
                          <td className="t-meta">{snapshotSummary(run.inputSnapshot)}</td>
                          <td className="num right">{capturedResult !== undefined ? MONEY.format(capturedResult) : `${run.issues.length} inputs need review`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {pageCount > 1 ? (
                <nav className="underwriting-pagination" aria-label="Calculation history pages">
                  {runPage > 1 ? <Link href={`?runPage=${runPage - 1}#calculation-history`}>Newer runs</Link> : <span />}
                  <span className="t-meta num">Page {runPage} of {pageCount}</span>
                  {runPage < pageCount ? <Link href={`?runPage=${runPage + 1}#calculation-history`}>Older runs</Link> : <span />}
                </nav>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function decisionTitle(status: "complete" | "failed" | undefined, hasRunHistory: boolean) {
  if (status === "complete") return "The saved results are ready for review.";
  if (status === "failed") return "The calculation needs more input.";
  if (hasRunHistory) return "The case changed and needs recalculation.";
  return "The case has not been calculated.";
}

function decisionDetail(status: "complete" | "failed" | undefined, hasRunHistory: boolean) {
  if (status === "complete") return "These results apply the listed formula version to this saved case revision.";
  if (status === "failed") return "The failed run remains on record and makes no financial claim.";
  if (hasRunHistory) return "Prior results do not match this case revision and are not current.";
  return "No financial result exists until the deterministic calculation runs.";
}

function formatResult(value: number, unit: "usd" | "decimal") {
  return unit === "usd" ? MONEY.format(value) : `${NUMBER.format(value * 100)}%`;
}

function formatReconciliationValue(value: number, unit: "usd" | "count" | "sf" | "ratio" | "multiple" | "basis_points" | undefined) {
  if (unit === "count") return NUMBER.format(value);
  if (unit === "sf") return `${NUMBER.format(value)} SF`;
  if (unit === "ratio") return `${NUMBER.format(value * 100)}%`;
  if (unit === "multiple") return `${NUMBER.format(value)}x`;
  if (unit === "basis_points") return `${NUMBER.format(value)} bps`;
  return MONEY.format(value);
}

function snapshotSummary(snapshot: {
  grossBuildingSquareFeet?: number;
  proposedUnits?: number;
  purchasePrice?: number;
  monthlyRent?: number;
  analysisStartMonth?: string;
  saleMonth?: string;
  costLines?: unknown[];
}) {
  if (snapshot.analysisStartMonth && snapshot.saleMonth) {
    return `${snapshot.costLines?.length ?? 0} cost lines · ${snapshot.analysisStartMonth} to ${snapshot.saleMonth}`;
  }
  const parts = [
    snapshot.grossBuildingSquareFeet === undefined ? null : `${NUMBER.format(snapshot.grossBuildingSquareFeet)} GSF`,
    snapshot.proposedUnits === undefined ? null : `${NUMBER.format(snapshot.proposedUnits)} units`,
    snapshot.purchasePrice === undefined ? null : `${MONEY.format(snapshot.purchasePrice)} purchase`,
    snapshot.monthlyRent === undefined ? null : `${MONEY.format(snapshot.monthlyRent)}/month rent`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "No calculation inputs were supplied.";
}

function issuePath(issue: { inputKey?: string; path?: string }) {
  return issue.inputKey ?? issue.path ?? "calculation";
}

function costCategoryLabel(category: string) {
  return ({
    land: "Land",
    hard_cost: "Hard Cost",
    soft_cost: "Soft Cost",
    development_fee: "Development Fee",
    financing_fee: "Financing Fee",
  } as Record<string, string>)[category] ?? category;
}

function inputLabel(key: keyof typeof UNDERWRITING_INPUT_LABELS) {
  return UNDERWRITING_INPUT_LABELS[key] ?? key;
}

function pageNumber(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
