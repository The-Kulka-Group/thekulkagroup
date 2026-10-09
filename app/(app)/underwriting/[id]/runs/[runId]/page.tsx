import Link from "next/link";
import { notFound } from "next/navigation";
import {
  APARTMENT_OPERATIONS_ASSUMPTION_KEYS,
  DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS,
  LENDER_TEST_ASSUMPTION_KEYS,
  LENDER_TEST_COMMERCIAL_CAP_KEY,
  PARTNERSHIP_ASSUMPTION_KEYS,
  PERMANENT_LOAN_ASSUMPTION_KEYS,
  PERMANENT_LOAN_CAP_KEYS,
  PROPERTY_RETURNS_ASSUMPTION_KEYS,
  PROPERTY_RETURNS_COMMERCIAL_CAP_KEY,
  PROPERTY_TAX_ASSUMPTION_KEYS,
  SALE_TAX_ASSUMPTION_KEYS,
  type ApartmentOperationsInputs,
  type DevelopmentCapitalInputs,
  type MonthlyCostScheduleInputs,
  type PropertyReturnsInputs,
} from "@kulka/engine";

import { Sheet, Sep } from "@/components/Sheet";
import { Chip } from "@/components/Status";
import { getDb } from "@/lib/db";
import { FACT_DEFINITIONS, getUnderwritingCase } from "@/lib/underwriting/cases";
import {
  UNDERWRITING_INPUT_KEYS,
  UNDERWRITING_INPUT_LABELS,
  UNDERWRITING_LIMITATIONS,
} from "@/lib/underwriting/presentation";
import { getUnderwritingRun } from "@/lib/underwriting/runs";
import { isUuid } from "@/lib/uuid";
import { CollapsibleSection } from "../../CollapsibleSection";
import { CommercialResults } from "../../CommercialResults";
import { TraceFold } from "../../TraceFold";
import { ReconciliationChecks } from "../../ReconciliationChecks";
import { PERMANENT_LOAN_EVIDENCE_LABELS } from "../../PermanentLoanResults";
import { PropertyReturnsResults } from "../../PropertyReturnsResults";
import { ScenarioComparisonResults } from "../../ScenarioComparisonResults";
import { SourcesAndUsesSection } from "../../SourcesAndUsesSection";

export const dynamic = "force-dynamic";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const RATE_BASIS = { fixed: "Fixed Rate", curve: "On Curve", before_curve: "Before Curve, First Rate", after_curve: "After Curve, Last Rate" } as const;

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const INPUT_UNITS = {
  grossBuildingSquareFeet: "GSF",
  proposedUnits: "units",
  purchasePrice: "USD",
  monthlyRent: "USD/month",
  hardCostPerGrossSquareFoot: "USD/GSF",
  softCostPercent: "percent",
  contingencyPercent: "percent",
  vacancyPercent: "percent",
  operatingExpensePercent: "percent",
  debtPercent: "percent",
  interestRatePercent: "percent",
  exitCapRatePercent: "percent",
} as const;

export default async function UnderwritingRunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  if (!isUuid(id) || !isUuid(runId)) notFound();
  const [savedCase, run] = await Promise.all([
    getUnderwritingCase(getDb(), id),
    getUnderwritingRun(getDb(), runId),
  ]);
  if (!savedCase || !run || run.caseId !== savedCase.id) notFound();

  return (
    <Sheet
      number={savedCase.sheetNumber}
      title={`Calculation run ${run.id.slice(0, 8)}`}
      actions={
        <>
          {run.status === "complete" && run.propertyReturnsResult ? (
            <>
              <a className="btn btn--secondary" href={`/api/underwriting/cases/${savedCase.id}/runs/${run.id}/workbook`} download>Download Excel</a>
              <a className="btn btn--secondary" href={`/api/underwriting/cases/${savedCase.id}/runs/${run.id}/summary-pdf`} download>Download PDF Summary</a>
            </>
          ) : null}
          <Link className="btn btn--secondary" href={`/underwriting/${savedCase.id}#calculation-history`}>Back to Project</Link>
        </>
      }
      meta={
        <>
          <span>{savedCase.name}</span>
          <Sep />
          <span className="num">Revision {run.caseRevision}</span>
          <Sep />
          <span className="num">{DATE_TIME.format(new Date(run.createdAt))}</span>
        </>
      }
    >
      <div className="record underwriting-record underwriting-run-detail">
        <div className="margin" />
        <div className="col-field underwriting-decision-row">
          <div>
            <span className="t-label">Saved Run</span>
            <h2 className="t-1">{run.status === "complete" ? "The calculation completed." : "The calculation stopped on input issues."}</h2>
            <p className="t-meta">This record stays tied to case revision {run.caseRevision} and formula version {run.formulaVersion}.</p>
          </div>
          <Chip status={run.status === "complete" ? "done" : "stuck"} />
        </div>

        <div className="margin" />
        <section className="col-field record-section" aria-labelledby="run-results-heading">
          <h3 id="run-results-heading">Saved Results and Formulas</h3>
          {run.scenarioComparisonResult ? (
            <ScenarioComparisonResults result={run.scenarioComparisonResult} />
          ) : run.propertyReturnsResult ? (
            <PropertyReturnsResults result={run.propertyReturnsResult} reconciliations={run.reconciliations} />
          ) : run.developmentCapitalResult ? (
            <>
              <div className="underwriting-summary-band">
                <div><span className="t-label">Total Uses</span><strong className="num">{MONEY.format(run.developmentCapitalResult.capital.totals.totalUses)}</strong></div>
                <div><span className="t-label">Equity</span><strong className="num">{MONEY.format(run.developmentCapitalResult.capital.totals.equity)}</strong></div>
                <div><span className="t-label">Debt Before Reserves</span><strong className="num">{MONEY.format(run.developmentCapitalResult.capital.totals.debtBeforeReserves)}</strong></div>
                <div><span className="t-label">Interest Reserve</span><strong className="num">{MONEY.format(run.developmentCapitalResult.capital.totals.interestReserve)}</strong></div>
                <div><span className="t-label">Operating Shortfall Reserve</span><strong className="num">{MONEY.format(run.developmentCapitalResult.capital.totals.operatingShortfallReserve)}</strong></div>
                <div><span className="t-label">Total Debt</span><strong className="num">{MONEY.format(run.developmentCapitalResult.capital.totals.totalDebt)}</strong></div>
                <div><span className="t-label">Debt Share</span><strong className="num">{NUMBER.format(run.developmentCapitalResult.capital.totals.debtSharePercent)}%</strong></div>
                <div><span className="t-label">Capitalized Interest</span><strong className="num">{MONEY.format(run.developmentCapitalResult.capital.totals.capitalizedInterest)}</strong></div>
                {run.developmentCapitalResult.capital.otherSources.length > 0 ? <div><span className="t-label">Grants and Soft Loans</span><strong className="num">{MONEY.format(run.developmentCapitalResult.capital.totals.otherSourcesApplied)}</strong></div> : null}
              </div>
              <SourcesAndUsesSection capital={run.developmentCapitalResult.capital} />
              {run.developmentCapitalResult.capital.rateSchedule ? <p className="t-meta">Rate path from {run.developmentCapitalResult.capital.rateSchedule.curveSourceLabel}, as of {run.developmentCapitalResult.capital.rateSchedule.asOfDate}, plus a {run.developmentCapitalResult.capital.rateSchedule.spreadPercent}% spread. The curve runs {run.developmentCapitalResult.capital.rateSchedule.curveFirstMonth} to {run.developmentCapitalResult.capital.rateSchedule.curveLastMonth}. {run.developmentCapitalResult.capital.rateSchedule.monthsBeforeCurve} months before it use the first base rate ({run.developmentCapitalResult.capital.rateSchedule.firstBaseRatePercent}%), and {run.developmentCapitalResult.capital.rateSchedule.monthsAfterCurve} months after it use the last ({run.developmentCapitalResult.capital.rateSchedule.lastBaseRatePercent}%).</p> : null}
              <div className="underwriting-results-wrap">
                <table className="underwriting-monthly-table underwriting-capital-results">
                  <thead><tr><th>Month</th><th className="right">Project Costs</th><th className="right">Operating Cash Flow</th><th className="right">Opening Debt</th><th className="right">Annual Rate</th><th>Rate Basis</th><th className="right">Grants and Soft Loans</th><th className="right">Equity</th><th className="right">Debt Before Reserves</th><th className="right">Operating Shortfall Reserve</th><th className="right">Gross Interest</th><th className="right">Operating Cash Applied</th><th className="right">Interest Reserve</th><th className="right">Total Sources</th><th className="right">Total Uses</th><th className="right">Repayment</th><th className="right">Closing Debt</th></tr></thead>
                  <tbody>{run.developmentCapitalResult.capital.months.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th><td className="num right">{MONEY.format(month.projectCosts)}</td><td className="num right">{MONEY.format(month.operatingCashFlow)}</td><td className="num right">{MONEY.format(month.openingDebtBalance)}</td><td className="num right">{month.annualRatePercent}%</td><td>{RATE_BASIS[month.rateSource]}</td><td className="num right">{MONEY.format(month.otherSourcesApplied)}</td><td className="num right">{MONEY.format(month.equityContribution)}</td><td className="num right">{MONEY.format(month.debtBeforeReservesDraw)}</td><td className="num right">{MONEY.format(month.operatingShortfallReserveDraw)}</td><td className="num right">{MONEY.format(month.grossInterest)}</td><td className="num right">{MONEY.format(month.operatingCashAppliedToInterest)}</td><td className="num right">{MONEY.format(month.interestReserveDraw)}</td><td className="num right">{MONEY.format(month.totalSources)}</td><td className="num right">{MONEY.format(month.totalUses)}</td><td className="num right">{MONEY.format(month.repayment)}</td><td className="num right">{MONEY.format(month.closingDebtBalance)}</td></tr>)}</tbody>
                </table>
              </div>
              <TraceFold title="Formula Traces">
                <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Result</th><th>Formula Trace</th><th>Inputs Used</th></tr></thead>
                  <tbody>{run.developmentCapitalResult.capital.formulaTraces.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th><td>{trace.formula}</td><td className="t-meta">{trace.inputPaths.join(", ")}</td></tr>)}</tbody>
                </table>
                </div>
              </TraceFold>
              {run.developmentCapitalResult.apartmentOperations.commercial ? <CommercialResults months={run.developmentCapitalResult.apartmentOperations.months} commercial={run.developmentCapitalResult.apartmentOperations.commercial} totals={run.developmentCapitalResult.apartmentOperations.totals} costSchedule={run.developmentCapitalResult.apartmentOperations.costSchedule} /> : null}
              <ReconciliationChecks checks={run.reconciliations} />
            </>
          ) : run.apartmentOperationsResult ? (
            <>
              <div className="underwriting-summary-band">
                <div><span className="t-label">Unit Total</span><strong className="num">{NUMBER.format(run.apartmentOperationsResult.unitSummary.totalUnits)}</strong></div>
                <div><span className="t-label">Unit Area</span><strong className="num">{NUMBER.format(run.apartmentOperationsResult.unitSummary.totalAreaSf)} SF</strong></div>
                <div><span className="t-label">Residential Rent</span><strong className="num">{MONEY.format(run.apartmentOperationsResult.totals.totalResidentialRent)}</strong></div>
                <div><span className="t-label">Lease-Up Concession</span><strong className="num">{MONEY.format(run.apartmentOperationsResult.totals.leaseUpConcessionLoss)}</strong></div>
                <div><span className="t-label">Other Income</span><strong className="num">{MONEY.format(run.apartmentOperationsResult.totals.otherIncome)}</strong></div>
                <div><span className="t-label">Effective Gross Revenue</span><strong className="num">{MONEY.format(run.apartmentOperationsResult.totals.effectiveGrossRevenue)}</strong></div>
                <div><span className="t-label">Net Operating Income</span><strong className="num">{MONEY.format(run.apartmentOperationsResult.totals.netOperatingIncome)}</strong></div>
                <div><span className="t-label">Operating Cash Flow</span><strong className="num">{MONEY.format(run.apartmentOperationsResult.totals.operatingCashFlow)}</strong></div>
                <div><span className="t-label">First Stabilized Month</span><strong className="num">{run.apartmentOperationsResult.firstStabilizedMonth ?? "Not reached"}</strong></div>
              </div>
              <div className="underwriting-results-wrap">
                <table className="underwriting-monthly-table underwriting-operations-results">
                  <thead><tr><th>Month</th><th className="right">Occupied Units</th><th className="right">Turned Units</th><th className="right">Gross Rent</th><th className="right">Lease-Up Loss</th><th className="right">Non-Revenue Units</th><th className="right">Rent Adjustment</th><th className="right">Free Rent</th><th className="right">Lease-Up Concession</th><th className="right">Residential Rent</th><th className="right">Other Income</th><th className="right">Vacancy</th><th className="right">Credit Loss</th><th className="right">Effective Gross Revenue</th><th className="right">Operating Expenses</th><th className="right">NOI</th><th className="right">Capital Expenditures</th><th className="right">Operating Cash Flow</th></tr></thead>
                  <tbody>{run.apartmentOperationsResult.months.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th><td className="num right">{NUMBER.format(month.leasedUnits)} / {NUMBER.format(month.revenueUnits)}</td><td className="num right">{NUMBER.format(month.turnedUnits)}</td><td className="num right">{MONEY.format(month.residentialGrossRent)}</td><td className="num right">{MONEY.format(month.leaseUpLoss)}</td><td className="num right">{MONEY.format(month.nonRevenueRentAdjustment)}</td><td className="num right">{MONEY.format(month.rentAdjustmentLoss)}</td><td className="num right">{MONEY.format(month.freeRentLoss)}</td><td className="num right">{MONEY.format(month.leaseUpConcessionLoss)}</td><td className="num right">{MONEY.format(month.totalResidentialRent)}</td><td className="num right">{MONEY.format(month.otherIncome)}</td><td className="num right">{MONEY.format(month.vacancyLoss)}</td><td className="num right">{MONEY.format(month.creditLoss)}</td><td className="num right">{MONEY.format(month.effectiveGrossRevenue)}</td><td className="num right">{MONEY.format(month.operatingExpenses)}</td><td className="num right">{MONEY.format(month.netOperatingIncome)}</td><td className="num right">{MONEY.format(month.capitalExpenditures)}</td><td className="num right">{MONEY.format(month.operatingCashFlow)}</td></tr>)}</tbody>
                </table>
              </div>
              <TraceFold title="Formula Traces">
                <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Result</th><th>Formula Trace</th><th>Inputs Used</th></tr></thead>
                  <tbody>{run.apartmentOperationsResult.formulaTraces.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th><td>{trace.formula}</td><td className="t-meta">{trace.inputPaths.join(", ")}</td></tr>)}</tbody>
                </table>
                </div>
              </TraceFold>
              {run.apartmentOperationsResult.commercial ? <CommercialResults months={run.apartmentOperationsResult.months} commercial={run.apartmentOperationsResult.commercial} totals={run.apartmentOperationsResult.totals} costSchedule={run.apartmentOperationsResult.costSchedule} /> : null}
              <ReconciliationChecks checks={run.reconciliations} />
            </>
          ) : run.monthlyCostResult ? (
            <>
              <div className="underwriting-summary-band">
                {Object.entries(run.monthlyCostResult.totalsByCategory).map(([category, amount]) => <div key={category}><span className="t-label">{categoryLabel(category)}</span><strong className="num">{MONEY.format(amount)}</strong></div>)}
                <div><span className="t-label">Total Uses</span><strong className="num">{MONEY.format(run.monthlyCostResult.totalUses)}</strong></div>
              </div>
              <div className="underwriting-results-wrap">
                <table className="underwriting-monthly-table">
                  <thead><tr><th>Month</th>{run.monthlyCostResult.costLineSchedules.map((line) => <th className="right" key={line.lineId}>{line.name}</th>)}<th className="right">Total Uses</th></tr></thead>
                  <tbody>{run.monthlyCostResult.months.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th>{run.monthlyCostResult!.costLineSchedules.map((line) => <td className="num right" key={line.lineId}>{MONEY.format(month.lineAmounts[line.lineId])}</td>)}<td className="num right">{MONEY.format(month.totalUses)}</td></tr>)}</tbody>
                </table>
              </div>
              <TraceFold title="Cost Line Formula Traces">
                <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Cost Line</th><th>Formula Trace</th><th>Inputs Used</th></tr></thead>
                  <tbody>{run.monthlyCostResult.costLineSchedules.map((line) => <tr key={line.lineId}><th scope="row">{line.name}</th><td>{line.formulaTrace}</td><td className="t-meta">{line.inputPaths.join(", ")}</td></tr>)}</tbody>
                </table>
                </div>
              </TraceFold>
              <TraceFold title="Aggregate Formula Traces">
                <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Aggregate Result</th><th className="right">Value</th><th>Formula</th><th>Inputs Used</th></tr></thead>
                  <tbody>{run.monthlyCostResult.aggregateFormulaTraces.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th><td className="num right">{MONEY.format(trace.value)}</td><td>{trace.formulaTrace}</td><td className="t-meta">{trace.inputPaths.join(", ") || "No cost lines in this period"}</td></tr>)}</tbody>
                </table>
                </div>
              </TraceFold>
              <ReconciliationChecks checks={run.reconciliations} />
            </>
          ) : run.results.length > 0 ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-results">
                <thead>
                  <tr><th>Result</th><th className="right">Value</th><th>Formula Trace</th><th>Inputs Used</th></tr>
                </thead>
                <tbody>
                  {run.results.map((result) => (
                    <tr key={result.key}>
                      <td>{result.label}</td>
                      <td className="num right">{formatResult(result.value, result.unit)}</td>
                      <td>{result.formula}</td>
                      <td className="t-meta">{result.inputKeys.map((key) => UNDERWRITING_INPUT_LABELS[key]).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="t-meta underwriting-history-note">This run saved no financial results.</p>}
          <div className="underwriting-limitations" aria-labelledby="run-limitations-heading">
            <h4 id="run-limitations-heading">Model Limits</h4>
            <ul>{(run.scenarioComparisonResult ? [
              "This formula version changes only the four named apartment sensitivity inputs.",
              "It does not model income taxes.",
              "This run does not record a finance or sale approval.",
            ] : run.propertyReturnsResult ? [
              "This formula version values the property from forward twelve-month NOI and a direct terminal cap.",
              "It does not model income taxes.",
              "This run does not record a finance or sale approval.",
            ] : run.developmentCapitalResult ? [
              "This formula version funds monthly development costs and operating shortfalls with equity and construction debt.",
              "Sale proceeds, permanent debt, and property returns follow in later formula versions.",
              "This run does not record a finance approval.",
            ] : run.apartmentOperationsResult ? [
              "This formula version models apartment lease-up and property operations before debt funding.",
              "Debt funding, sale proceeds, and property returns follow in later formula versions.",
              "This run does not record a finance approval.",
            ] : run.monthlyCostResult ? [
              "This formula version schedules development costs only.",
              "Lease-up, funding, sale proceeds, and property returns follow in later formula versions.",
              "This run does not record a finance approval.",
            ] : UNDERWRITING_LIMITATIONS).map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </section>

        <CollapsibleSection storage="run-snapshot" title="Full Calculation Input Snapshot" className="record-section" defaultCollapsed>
          <h3 id="run-inputs-heading">Full Calculation Input Snapshot</h3>
          {isScenarioSnapshot(run.inputSnapshot) ? (
            <>
              <div className="underwriting-results-wrap"><table className="underwriting-snapshot underwriting-scenario-comparison"><thead><tr><th>Scenario</th><th>Role</th><th>Input Version</th><th>Delta</th></tr></thead><tbody>{run.inputSnapshot.scenarios.map((scenario) => <tr key={scenario.id}><th scope="row">{scenario.name}</th><td>{scenario.role}</td><td className="num">{scenario.inputVersion}</td><td className="num">{Object.entries(scenario.delta).map(([key, value]) => `${key}: ${value}`).join(", ")}</td></tr>)}</tbody></table></div>
              <OperationsSnapshotSummary input={run.inputSnapshot.base} />
              <OperationsInputTables input={run.inputSnapshot.base} />
            </>
          ) : isPropertyReturnsSnapshot(run.inputSnapshot) ? (
            <>
              <div className="underwriting-results-wrap"><table className="underwriting-snapshot"><thead><tr><th>Sale Input Version</th><th className="right">Terminal Cap Rate</th><th className="right">Selling Costs</th><th>Forward NOI Period</th><th>Cash Flow Dates</th><th>XIRR Convention</th></tr></thead><tbody><tr><td className="num">{run.inputSnapshot.saleInputVersion}</td><td className="num right">{run.inputSnapshot.terminalCapRatePercent}%</td><td className="num right">{run.inputSnapshot.sellingCostPercent}%</td><td className="num">{run.inputSnapshot.forwardNoiConvention}</td><td className="num">{run.inputSnapshot.cashFlowDateConvention}</td><td className="num">{run.inputSnapshot.xirrConvention}</td></tr></tbody></table></div>
              <div className="underwriting-results-wrap"><table className="underwriting-snapshot"><thead><tr><th>Capital Input Version</th><th className="right">Target Debt Share</th><th className="right">Annual Interest Rate</th><th className="right">Loan Fee</th><th>Funding Order</th><th>Interest Treatment</th><th>Interest Convention</th><th>Fee Month</th><th>Payoff Month</th></tr></thead><tbody><tr><td className="num">{run.inputSnapshot.capitalInputVersion}</td><td className="num right">{run.inputSnapshot.targetDebtSharePercent}%</td><td className="num right">{run.inputSnapshot.annualInterestRatePercent}%</td><td className="num right">{run.inputSnapshot.loanFeePercent}%</td><td className="num">{run.inputSnapshot.fundingOrder}</td><td className="num">{run.inputSnapshot.interestTreatment}</td><td className="num">{run.inputSnapshot.interestConvention}</td><td className="num">{run.inputSnapshot.feeMonth}</td><td className="num">{run.inputSnapshot.payoffMonth}</td></tr></tbody></table></div>
              <OperationsSnapshotSummary input={run.inputSnapshot} />
              <OperationsInputTables input={run.inputSnapshot} />
            </>
          ) : isDevelopmentCapitalSnapshot(run.inputSnapshot) ? (
            <>
              <div className="underwriting-results-wrap">
                <table className="underwriting-snapshot">
                  <thead><tr><th>Capital Input Version</th><th className="right">Target Debt Share</th><th className="right">Annual Interest Rate</th><th className="right">Loan Fee</th><th>Funding Order</th><th>Interest Treatment</th><th>Interest Convention</th><th>Fee Month</th><th>Payoff Month</th></tr></thead>
                  <tbody><tr><td className="num">{run.inputSnapshot.capitalInputVersion}</td><td className="num right">{run.inputSnapshot.targetDebtSharePercent}%</td><td className="num right">{run.inputSnapshot.annualInterestRatePercent}%</td><td className="num right">{run.inputSnapshot.loanFeePercent}%</td><td className="num">{run.inputSnapshot.fundingOrder}</td><td className="num">{run.inputSnapshot.interestTreatment}</td><td className="num">{run.inputSnapshot.interestConvention}</td><td className="num">{run.inputSnapshot.feeMonth}</td><td className="num">{run.inputSnapshot.payoffMonth}</td></tr></tbody>
                </table>
              </div>
              <OperationsSnapshotSummary input={run.inputSnapshot} />
              <OperationsInputTables input={run.inputSnapshot} />
            </>
          ) : isApartmentOperationsSnapshot(run.inputSnapshot) ? (
            <>
              <div className="underwriting-results-wrap">
                <table className="underwriting-snapshot">
                  <thead><tr><th>Input Version</th><th>Analysis Start</th><th>Operation Start</th><th>Growth Start</th><th>Sale Month</th><th className="right">Pre-Leased Units</th><th className="right">Monthly Lease Pace</th><th className="right">Income Growth</th><th className="right">Expense Growth</th><th className="right">Rent Adjustment</th><th className="right">Free Rent</th><th className="right">Vacancy</th><th className="right">Credit Loss</th></tr></thead>
                  <tbody><tr><td className="num">{run.inputSnapshot.inputVersion}</td><td className="num">{run.inputSnapshot.analysisStartMonth}</td><td className="num">{run.inputSnapshot.operationStartMonth}</td><td className="num">{run.inputSnapshot.growthStartMonth}</td><td className="num">{run.inputSnapshot.saleMonth}</td><td className="num right">{run.inputSnapshot.preleasedUnits}</td><td className="num right">{run.inputSnapshot.leaseUpUnitsPerMonth}</td><td className="num right">{run.inputSnapshot.annualIncomeGrowthPercent}%</td><td className="num right">{run.inputSnapshot.annualExpenseGrowthPercent}%</td><td className="num right">{run.inputSnapshot.rentAdjustmentLossPercent}%</td><td className="num right">{run.inputSnapshot.freeRentPercent}%</td><td className="num right">{run.inputSnapshot.vacancyPercent}%</td><td className="num right">{run.inputSnapshot.creditLossPercent}%</td></tr></tbody>
                </table>
              </div>
              <OperationsInputTables input={run.inputSnapshot} />
            </>
          ) : isMonthlySnapshot(run.inputSnapshot) ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-snapshot">
                <thead><tr><th>Analysis Start</th><th>Sale Month</th><th className="right">Cost Lines</th></tr></thead>
                <tbody><tr><td className="num">{run.inputSnapshot.analysisStartMonth}</td><td className="num">{run.inputSnapshot.saleMonth}</td><td className="num right">{run.inputSnapshot.costLines.length}</td></tr></tbody>
              </table>
              <table className="underwriting-cost-lines">
                <thead><tr><th>Cost Line</th><th>Category</th><th className="right">Amount</th><th>Start</th><th>End</th><th>Distribution</th><th>Version</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead>
                <tbody>{run.inputSnapshot.costLines.map((line) => <tr key={line.id}><th scope="row">{line.name}</th><td>{categoryLabel(line.category)}</td><td className="num right">{line.amount === undefined ? "By Basis" : MONEY.format(line.amount)}</td><td className="num">{line.startMonth}</td><td className="num">{line.endMonth}</td><td>{line.distributionMethod === "straight_line" ? "Straight-line" : "S-curve"}</td><td className="num">{line.distributionVersion}</td><td>{line.sourceLabel || "Missing"}</td><td className="num">{line.sourceDate || "Missing"}</td><td><Chip status={line.reviewState} /></td></tr>)}</tbody>
              </table>
            </div>
          ) : <div className="underwriting-results-wrap">
            <table className="underwriting-snapshot">
              <thead><tr><th>Input</th><th className="right">Saved Value</th><th>Unit</th></tr></thead>
              <tbody>
                {UNDERWRITING_INPUT_KEYS.map((key) => (
                  <tr key={key}>
                    <th scope="row">{UNDERWRITING_INPUT_LABELS[key]}</th>
                    <td className="num right">{run.inputSnapshot[key] === undefined ? "Missing" : NUMBER.format(run.inputSnapshot[key])}</td>
                    <td className="t-meta">{INPUT_UNITS[key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </CollapsibleSection>

        <CollapsibleSection storage="run-evidence" title="Saved Evidence Snapshot" className="record-section" defaultCollapsed>
          <h3 id="run-evidence-heading">Saved Evidence Snapshot</h3>
          <dl className="underwriting-evidence-facts">
            <div><dt>Case record ID</dt><dd className="num">{run.evidenceSnapshot.caseId}</dd></div>
            <div><dt>Sheet Number</dt><dd className="num">{run.evidenceSnapshot.sheetNumber}</dd></div>
            <div><dt>Case Number</dt><dd className="num">{run.evidenceSnapshot.caseNumber}</dd></div>
            <div><dt>Case Name</dt><dd>{run.evidenceSnapshot.name}</dd></div>
            <div><dt>Property Address</dt><dd>{run.evidenceSnapshot.address}</dd></div>
            <div><dt>Development Type</dt><dd>Ground-up multifamily</dd></div>
            <div><dt>Saved Case Status</dt><dd>{run.evidenceSnapshot.status}</dd></div>
            <div><dt>Case Revision</dt><dd className="num">{run.evidenceSnapshot.caseRevision}</dd></div>
            <div><dt>Proposed Units</dt><dd className="num">{formatOptional(run.evidenceSnapshot.proposedUnits)}</dd></div>
            <div><dt>Average Unit Size</dt><dd className="num">{formatOptional(run.evidenceSnapshot.averageUnitSquareFeet, " SF")}</dd></div>
            <div><dt>Gross Building Area</dt><dd className="num">{formatOptional(run.evidenceSnapshot.grossBuildingSquareFeet, " GSF")}</dd></div>
            <div><dt>Case Created</dt><dd className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.createdAt))}</dd></div>
            <div><dt>Case Updated</dt><dd className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.updatedAt))}</dd></div>
          </dl>
          <div className="underwriting-results-wrap">
            <table className="underwriting-evidence">
              <thead>
                <tr><th>Project Fact</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th><th>Case Revision</th></tr>
              </thead>
              <tbody>
                {Object.entries(FACT_DEFINITIONS).map(([name, definition]) => {
                  const evidence = run.evidenceSnapshot.factMetadata[name as keyof typeof FACT_DEFINITIONS];
                  return (
                    <tr key={name}>
                      <th scope="row">{definition.label}</th>
                      <td>{evidence?.sourceLabel || "Missing"}</td>
                      <td className="num">{evidence?.sourceDate ? DATE.format(new Date(`${evidence.sourceDate}T00:00:00.000Z`)) : "Missing"}</td>
                      <td>{evidence ? <Chip status={evidence.reviewState} /> : "Missing"}</td>
                      <td className="num">{evidence ? DATE_TIME.format(new Date(evidence.lastChangedAt)) : "Missing"}</td>
                      <td className="num">{evidence?.caseRevision ?? "Missing"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {run.evidenceSnapshot.costSchedule ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Cost Line</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{run.evidenceSnapshot.costSchedule.costLines.map((line) => <tr key={line.id}><th scope="row">{line.name}</th><td>{line.sourceLabel || "Missing"}</td><td className="num">{line.sourceDate || "Missing"}</td><td><Chip status={line.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(line.lastChangedAt))}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.apartmentOperations ? (
            <><div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Operating Assumption</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{APARTMENT_OPERATIONS_ASSUMPTION_KEYS.map((key) => {
                  const evidence = run.evidenceSnapshot.apartmentOperations!.assumptionEvidence[key];
                  return <tr key={key}><th scope="row">{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.apartmentOperations!.lastChangedAt))}</td></tr>;
                })}</tbody>
              </table>
            </div><div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Operations Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{[
                  ...run.evidenceSnapshot.apartmentOperations.residentialUnitTypes,
                  ...run.evidenceSnapshot.apartmentOperations.otherIncomeLines,
                  ...run.evidenceSnapshot.apartmentOperations.operatingExpenseLines,
                  ...run.evidenceSnapshot.apartmentOperations.capitalExpenditureLines,
                ].map((line) => <tr key={`${line.id}-${line.name}`}><th scope="row">{line.name}</th><td>{line.sourceLabel || "Missing"}</td><td className="num">{line.sourceDate || "Missing"}</td><td><Chip status={line.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.apartmentOperations!.lastChangedAt))}</td></tr>)}</tbody>
              </table>
            </div></>
          ) : null}
          {run.evidenceSnapshot.apartmentOperations?.commercial ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Commercial Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{[
                  { id: "commercial", name: "Commercial Vacancy and Credit Loss", ...run.evidenceSnapshot.apartmentOperations.commercial },
                  ...run.evidenceSnapshot.apartmentOperations.commercial.spaces,
                ].map((item) => <tr key={item.id}><th scope="row">{item.name}</th><td>{item.sourceLabel || "Missing"}</td><td className="num">{item.sourceDate || "Missing"}</td><td><Chip status={item.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.apartmentOperations!.lastChangedAt))}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.developmentCapital ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Capital Assumption</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS.map((key) => {
                  const evidence = run.evidenceSnapshot.developmentCapital!.capitalAssumptionEvidence[key];
                  return <tr key={key}><th scope="row">{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.developmentCapital!.lastChangedAt))}</td></tr>;
                })}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.developmentCapital?.permanentLoan ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Permanent Loan Terms</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{[...PERMANENT_LOAN_ASSUMPTION_KEYS, ...PERMANENT_LOAN_CAP_KEYS].flatMap((key) => {
                  const evidence = run.evidenceSnapshot.developmentCapital!.permanentLoan!.evidence[key];
                  if (!evidence) return [];
                  return [<tr key={key}><th scope="row">{PERMANENT_LOAN_EVIDENCE_LABELS[key]}</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.developmentCapital!.lastChangedAt))}</td></tr>];
                })}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.propertyReturns ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Sale Assumption</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{(run.evidenceSnapshot.propertyReturns.commercialTerminalCapRatePercent === undefined ? [...PROPERTY_RETURNS_ASSUMPTION_KEYS] : [...PROPERTY_RETURNS_ASSUMPTION_KEYS, PROPERTY_RETURNS_COMMERCIAL_CAP_KEY]).map((key) => {
                  const evidence = run.evidenceSnapshot.propertyReturns!.saleAssumptionEvidence[key]!;
                  return <tr key={key}><th scope="row">{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.propertyReturns!.lastChangedAt))}</td></tr>;
                })}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.propertyReturns?.lenderTests ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Lender Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{(run.evidenceSnapshot.propertyReturns.lenderTests.commercialCapRatePercent === undefined ? [...LENDER_TEST_ASSUMPTION_KEYS] : [...LENDER_TEST_ASSUMPTION_KEYS, LENDER_TEST_COMMERCIAL_CAP_KEY]).map((key) => {
                  const evidence = run.evidenceSnapshot.propertyReturns!.lenderTests!.lenderTestEvidence[key]!;
                  return <tr key={key}><th scope="row">{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.propertyReturns!.lastChangedAt))}</td></tr>;
                })}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.apartmentOperations?.propertyTax ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Tax Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{PROPERTY_TAX_ASSUMPTION_KEYS.map((key) => {
                  const evidence = run.evidenceSnapshot.apartmentOperations!.propertyTax!.taxEvidence[key];
                  return <tr key={key}><th scope="row">{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.apartmentOperations!.lastChangedAt))}</td></tr>;
                })}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.propertyReturns?.saleTax ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Sale Tax Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{SALE_TAX_ASSUMPTION_KEYS.flatMap((key) => {
                  const evidence = run.evidenceSnapshot.propertyReturns!.saleTax!.saleTaxEvidence[key];
                  if (!evidence) return [];
                  return [<tr key={key}><th scope="row">{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.propertyReturns!.lastChangedAt))}</td></tr>];
                })}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.propertyReturns?.partnership ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Partnership Terms</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{PARTNERSHIP_ASSUMPTION_KEYS.flatMap((key) => {
                  const evidence = run.evidenceSnapshot.propertyReturns!.partnership!.partnershipEvidence[key];
                  if (!evidence) return [];
                  return [<tr key={key}><th scope="row">{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.propertyReturns!.lastChangedAt))}</td></tr>];
                })}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.propertyReturns?.residualLand ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Residual Land Target</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{(() => {
                  const { evidence } = run.evidenceSnapshot.propertyReturns!.residualLand!;
                  return <tr><th scope="row">Target</th><td>{evidence.sourceLabel || "Missing"}</td><td className="num">{evidence.sourceDate || "Missing"}</td><td><Chip status={evidence.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.propertyReturns!.lastChangedAt))}</td></tr>;
                })()}</tbody>
              </table>
            </div>
          ) : null}
          {run.evidenceSnapshot.scenarios?.length ? (
            <div className="underwriting-results-wrap">
              <h4>Saved Scenario Evidence</h4>
              <table className="underwriting-evidence">
                <thead><tr><th>Scenario</th><th>Changed Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{run.evidenceSnapshot.scenarios.flatMap((scenario) => Object.entries(scenario.evidence).map(([key, evidence]) => (
                  <tr key={`${scenario.id}-${key}`}><th scope="row">{scenario.name}</th><td>{key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())}</td><td>{evidence?.sourceLabel || "Missing"}</td><td className="num">{evidence?.sourceDate || "Missing"}</td><td>{evidence ? <Chip status={evidence.reviewState} /> : "Missing"}</td><td className="num">{DATE_TIME.format(new Date(scenario.lastChangedAt))}</td></tr>
                )))}</tbody>
              </table>
            </div>
          ) : null}
          <div className="underwriting-results-wrap">
            <table className="underwriting-evidence">
              <thead>
                <tr><th>Assumption</th><th className="right">Value</th><th>Source Type</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Value Changed</th></tr>
              </thead>
              <tbody>
                {run.evidenceSnapshot.assumptions.map((assumption) => (
                  <tr key={assumption.name}>
                    <th scope="row">{assumption.label}</th>
                    <td className="num right">{NUMBER.format(assumption.value)} <span className="t-meta">{assumption.unit}</span></td>
                    <td>User Supplied</td>
                    <td>{assumption.sourceLabel || "Missing"}</td>
                    <td className="num">{assumption.sourceDate ? DATE.format(new Date(`${assumption.sourceDate}T00:00:00.000Z`)) : "Missing"}</td>
                    <td><Chip status={assumption.reviewState} /></td>
                    <td className="num">{DATE_TIME.format(new Date(assumption.lastChangedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleSection>

        <CollapsibleSection storage="run-issues" title="Saved Calculation Issues" className="record-section" defaultCollapsed>
          <h3 id="run-issues-heading">Saved Calculation Issues</h3>
          {run.issues.length > 0 ? (
            <div className="underwriting-issues">
              {run.issues.map((issue) => (
                <div className="underwriting-issue underwriting-issue--stuck" key={`${issuePath(issue)}-${issue.code}`}>
                  <span className="dot" aria-hidden="true" />
                  <span><span className="em">{issueLabel(issue)}:</span> {issue.message}</span>
                </div>
              ))}
            </div>
          ) : <p className="t-meta underwriting-history-note">This run saved no calculation issues.</p>}
        </CollapsibleSection>
      </div>
    </Sheet>
  );
}

function formatResult(value: number, unit: "usd" | "decimal") {
  return unit === "usd" ? MONEY.format(value) : `${NUMBER.format(value * 100)}%`;
}

function formatOptional(value: number | undefined, suffix = "") {
  return value === undefined ? "Missing" : `${NUMBER.format(value)}${suffix}`;
}

function isMonthlySnapshot(snapshot: unknown): snapshot is MonthlyCostScheduleInputs {
  return Boolean(snapshot && typeof snapshot === "object" && "costLines" in snapshot);
}

function isApartmentOperationsSnapshot(snapshot: unknown): snapshot is ApartmentOperationsInputs {
  return Boolean(snapshot && typeof snapshot === "object" && "inputVersion" in snapshot && "residentialUnitTypes" in snapshot);
}

function isDevelopmentCapitalSnapshot(snapshot: unknown): snapshot is DevelopmentCapitalInputs {
  return Boolean(snapshot && typeof snapshot === "object" && "capitalInputVersion" in snapshot && "residentialUnitTypes" in snapshot);
}

function isPropertyReturnsSnapshot(snapshot: unknown): snapshot is PropertyReturnsInputs {
  return Boolean(snapshot && typeof snapshot === "object" && "saleInputVersion" in snapshot && "capitalInputVersion" in snapshot && "residentialUnitTypes" in snapshot);
}

function isScenarioSnapshot(snapshot: unknown): snapshot is { base: PropertyReturnsInputs; scenarios: Array<{ id: string; role: string; name: string; inputVersion: string; delta: Record<string, number> }> } {
  return Boolean(snapshot && typeof snapshot === "object" && "base" in snapshot && "scenarios" in snapshot && Array.isArray((snapshot as { scenarios?: unknown }).scenarios));
}

function OperationsInputTables({ input }: { input: ApartmentOperationsInputs }) {
  const sections = [
    ["Residential Unit Types", input.residentialUnitTypes.map((line) => ({ ...line, amount: `${line.units} units, ${NUMBER.format(line.averageAreaSf)} SF average, ${line.nonRevenueUnits} non-revenue, ${MONEY.format(line.monthlyMarketRent)} per month`, unit: "Unit mix" }))],
    ["Other Income", input.otherIncomeLines],
    ["Operating Expenses", input.operatingExpenseLines],
    ["Capital Expenditures", input.capitalExpenditureLines],
  ] as const;
  return <>{sections.map(([title, lines]) => <div className="underwriting-results-wrap" key={title}><h4>{title}</h4><table className="underwriting-evidence"><thead><tr><th>Line</th><th className="right">Amount</th><th>Unit</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><th scope="row">{line.name}</th><td className="num right">{typeof line.amount === "number" ? NUMBER.format(line.amount) : line.amount}</td><td>{line.unit}</td><td>{line.sourceLabel || "Missing"}</td><td className="num">{line.sourceDate || "Missing"}</td><td><Chip status={line.reviewState} /></td></tr>)}</tbody></table></div>)}</>;
}

function OperationsSnapshotSummary({ input }: { input: ApartmentOperationsInputs }) {
  return <div className="underwriting-results-wrap"><table className="underwriting-snapshot"><thead><tr><th>Operations Input Version</th><th>Analysis Start</th><th>Operation Start</th><th>Growth Start</th><th>Sale Month</th><th className="right">Pre-Leased Units</th><th className="right">Monthly Lease Pace</th><th className="right">Income Growth</th><th className="right">Expense Growth</th><th className="right">Rent Adjustment</th><th className="right">Free Rent</th><th className="right">Vacancy</th><th className="right">Credit Loss</th></tr></thead><tbody><tr><td className="num">{input.inputVersion}</td><td className="num">{input.analysisStartMonth}</td><td className="num">{input.operationStartMonth}</td><td className="num">{input.growthStartMonth}</td><td className="num">{input.saleMonth}</td><td className="num right">{input.preleasedUnits}</td><td className="num right">{input.leaseUpUnitsPerMonth}</td><td className="num right">{input.annualIncomeGrowthPercent}%</td><td className="num right">{input.annualExpenseGrowthPercent}%</td><td className="num right">{input.rentAdjustmentLossPercent}%</td><td className="num right">{input.freeRentPercent}%</td><td className="num right">{input.vacancyPercent}%</td><td className="num right">{input.creditLossPercent}%</td></tr></tbody></table></div>;
}

function issuePath(issue: { inputKey?: string; path?: string }) {
  return issue.inputKey ?? issue.path ?? "calculation";
}

function issueLabel(issue: { inputKey?: string; path?: string }) {
  if (issue.inputKey) {
    return UNDERWRITING_INPUT_LABELS[issue.inputKey as keyof typeof UNDERWRITING_INPUT_LABELS] ?? issue.inputKey;
  }
  return issue.path ?? "Calculation";
}

function categoryLabel(category: string) {
  return ({ land: "Land", hard_cost: "Hard Cost", soft_cost: "Soft Cost", development_fee: "Development Fee", financing_fee: "Financing Fee" } as Record<string, string>)[category] ?? category;
}
