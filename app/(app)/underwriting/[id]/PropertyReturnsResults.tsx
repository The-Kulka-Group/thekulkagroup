import type { LenderTestMetric, LenderTestsResult, PropertyReturnsResult, PropertyTaxResult, ReconciliationCheck, SaleTaxResult } from "@kulka/engine";

import { Chip } from "@/components/Status";

import { CommercialResults, hasCommercialMonths } from "./CommercialResults";
import { PartnershipResults } from "./PartnershipResults";
import { SourcesAndUsesSection } from "./SourcesAndUsesSection";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function PropertyReturnsResults({ result, reconciliations }: { result: PropertyReturnsResult; reconciliations: ReconciliationCheck[] }) {
  const sale = result.propertyReturns.sale;
  const returns = result.propertyReturns.returns;
  const peak = result.propertyReturns.peakEquity;
  return <div className="underwriting-monthly-results">
    <div className="underwriting-summary-band">
      <Summary label="Forward 12-Month NOI" value={MONEY.format(sale.forwardNetOperatingIncome)} />
      <Summary label="Gross Sale Value" value={MONEY.format(sale.grossSaleValue)} />
      <Summary label="Selling Costs" value={MONEY.format(sale.sellingCosts)} />
      <Summary label="Net Sale Proceeds" value={MONEY.format(sale.netSaleProceeds)} />
      <Summary label="Debt Payoff" value={MONEY.format(sale.debtPayoff)} />
      <Summary label="Equity Sale Proceeds" value={MONEY.format(sale.equitySaleProceeds)} />
      <Summary label="Unlevered XIRR" value={PERCENT.format(returns.unlevered.xirr)} />
      <Summary label="Levered XIRR" value={PERCENT.format(returns.levered.xirr)} />
      <Summary label="Unlevered Equity Multiple" value={`${NUMBER.format(returns.unlevered.equityMultiple)}x`} />
      <Summary label="Levered Equity Multiple" value={`${NUMBER.format(returns.levered.equityMultiple)}x`} />
      <Summary label="Yield on Cost" value={PERCENT.format(result.propertyReturns.yieldOnCost)} />
      <Summary label="Development Spread" value={`${NUMBER.format(result.propertyReturns.developmentSpreadBasisPoints)} bps`} />
      {peak ? <Summary label="Peak Equity" value={MONEY.format(peak.amount)} /> : null}
      {peak?.month ? <Summary label="Peak Equity Month" value={peak.month} /> : null}
    </div>
    <h4>Dated Monthly Property Cash Flow</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-monthly-table underwriting-property-cash-flow"><thead><tr><th>Month</th><th>Date</th><th className="right">Project Costs</th><th className="right">Operating Cash Flow</th><th className="right">Gross Interest</th><th className="right">Debt Draws</th><th className="right">Debt Payoff</th><th className="right">Net Sale Proceeds</th><th className="right">Unlevered Cash Flow</th><th className="right">Levered Cash Flow</th></tr></thead><tbody>
      {result.propertyReturns.months.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th><td className="num">{month.date}</td><td className="num right">{MONEY.format(month.projectCosts)}</td><td className="num right">{MONEY.format(month.operatingCashFlow)}</td><td className="num right">{MONEY.format(month.grossInterest)}</td><td className="num right">{MONEY.format(month.totalDebtDraw)}</td><td className="num right">{MONEY.format(month.repayment)}</td><td className="num right">{MONEY.format(month.netSaleProceeds)}</td><td className="num right">{MONEY.format(month.unleveredCashFlow)}</td><td className="num right">{MONEY.format(month.leveredCashFlow)}</td></tr>)}
    </tbody></table></div>
    <h4>Return Metrics and Formula Traces</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Result</th><th className="right">Value</th><th>Formula</th><th>Inputs Used</th></tr></thead><tbody>
      {result.propertyReturns.metrics.map((metric) => <tr key={metric.key}><th scope="row">{metric.label}</th><td className="num right">{formatMetric(metric.value, metric.unit)}</td><td>{metric.formula}</td><td className="t-meta">{metric.inputPaths.join(", ")}</td></tr>)}
    </tbody></table></div>
    {hasCommercialMonths(result.forwardOperations.months) ? <CommercialResults months={result.forwardOperations.months} heading="Forward Commercial and Residential Net Operating Income" /> : null}
    <SourcesAndUsesSection capital={result.developmentCapital} />
    {result.saleTax ? <SaleTax report={result.saleTax} byUse={Boolean(sale.valueSplit)} /> : null}
    {result.lenderTests ? <LenderTests tests={result.lenderTests} /> : null}
    {result.propertyTax ? <PropertyTaxByYear tax={result.propertyTax} /> : null}
    {result.partnership ? <PartnershipResults result={result.partnership} /> : null}
    <h4>Reconciliation Checks</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th><th className="right">Difference</th></tr></thead><tbody>
      {reconciliations.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{formatCheck(check.expected, check.unit)}</td><td className="num right">{formatCheck(check.actual, check.unit)}</td><td className="num right">{formatCheck(check.difference, check.unit)}</td></tr>)}
    </tbody></table></div>
  </div>;
}

const NOI_BASIS: Record<LenderTestsResult["noiBasis"], string> = {
  noi_before_reserves: "NOI Before Reserves",
  noi_after_reserves: "NOI After Reserves",
};

function LenderTests({ tests }: { tests: LenderTestsResult }) {
  const fullTax = tests.fullTax;
  const fullMetric = (key: LenderTestMetric["key"]) => fullTax?.metrics.find((metric) => metric.key === key);
  return <>
    <h4>Lender Tests and Formula Traces</h4>
    <p className="t-meta">Valuation year {tests.valuationStartMonth} to {tests.valuationEndMonth} on {NOI_BASIS[tests.noiBasis]}: {MONEY.format(tests.stabilizedNoi)}{fullTax ? `, or ${MONEY.format(fullTax.stabilizedNoi)} with full tax` : ""}. Construction debt {MONEY.format(tests.loanAmount)}, total uses {MONEY.format(tests.totalCost)} with land at cash cost{tests.totalCostAtCreditedLand != null ? `, or ${MONEY.format(tests.totalCostAtCreditedLand)} with land at credited value` : ""}, stated annual debt service {MONEY.format(tests.annualDebtService)}.</p>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Test</th><th className="right">{fullTax ? "Scheduled Tax" : "Value"}</th>{fullTax ? <th className="right">Full Tax</th> : null}<th>Formula</th><th>Inputs Used</th></tr></thead><tbody>
      {fullTax ? <tr><th scope="row">Valuation-Year NOI</th><td className="num right">{MONEY.format(tests.stabilizedNoi)}</td><td className="num right">{MONEY.format(fullTax.stabilizedNoi)}</td><td>{NOI_BASIS[tests.noiBasis]} for the valuation year; full tax removes the abatement for the same months</td><td className="t-meta">propertyTax</td></tr> : null}
      {tests.metrics.map((metric) => {
        const full = fullMetric(metric.key);
        return <tr key={metric.key}><th scope="row">{metric.label}</th><td className="num right">{formatLender(metric)}</td>{fullTax ? <td className="num right">{full ? formatLender(full) : formatLender(metric)}</td> : null}<td>{metric.formula}</td><td className="t-meta">{metric.inputPaths.join(", ")}</td></tr>;
      })}
      {tests.valueSplit?.lines.map((line) => {
        const full = fullTax?.valueSplit?.lines.find((item) => item.key === line.key);
        return <tr key={line.key}><th scope="row">{line.label}</th><td className="num right">{MONEY.format(line.value)}</td>{fullTax ? <td className="num right">{full ? MONEY.format(full.value) : "Not Reported"}</td> : null}<td>{line.formula}</td><td className="t-meta">{line.inputPaths.join(", ")}</td></tr>;
      })}
    </tbody></table></div>
    {tests.issues.length > 0 ? <ul className="underwriting-issues">{tests.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : null}
    {tests.loanSizing ? <LoanSizing sizing={tests.loanSizing} /> : null}
  </>;
}

function LoanSizing({ sizing }: { sizing: NonNullable<LenderTestsResult["loanSizing"]> }) {
  const binding = sizing.caps.find((cap) => cap.binding)!;
  return <>
    <h4>Loan Sizing</h4>
    <p className="t-meta">The loan is the lesser of every cap. {binding.label} binds at {MONEY.format(binding.amount)}, and the funded loan is {MONEY.format(sizing.loanAmount)}. NOI caps size on {MONEY.format(sizing.sizingNoi)} with {sizing.noiTaxBasis === "full_tax" ? "full tax" : "abated tax"}.</p>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Cap</th><th className="right">Largest Loan</th><th>Binds</th><th>Formula</th><th>Inputs Used</th></tr></thead><tbody>
      {sizing.caps.map((cap) => <tr key={cap.key}><th scope="row">{cap.label}</th><td className="num right">{MONEY.format(cap.amount)}</td><td>{cap.binding ? <strong>Binding</strong> : null}</td><td>{cap.formula}</td><td className="t-meta">{cap.inputPaths.join(", ")}</td></tr>)}
    </tbody></table></div>
  </>;
}

function formatLender(metric: LenderTestMetric) {
  return metric.value === null ? "Not Reported" : formatMetric(metric.value, metric.unit);
}

const SALE_TAX_BASIS: Record<SaleTaxResult["valueBasis"], string> = {
  scheduled_tax: "Scheduled Tax",
  full_tax: "Full Tax",
  full_tax_plus_abatement_value: "Full Tax Plus Abatement Value",
};

function SaleTax({ report, byUse }: { report: SaleTaxResult; byUse: boolean }) {
  return <>
    <h4>Sale on Scheduled Tax and Full Tax</h4>
    <p className="t-meta">The sale prices {SALE_TAX_BASIS[report.valueBasis]}. The abatement ends {report.abatementEndMonth}.{report.abatementDiscountRatePercent !== null ? ` Saved tax after the sale is discounted at ${NUMBER.format(report.abatementDiscountRatePercent)}% a year.` : ""}</p>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Sale Result</th><th className="right">Scheduled Tax</th><th className="right">Full Tax</th></tr></thead><tbody>
      <tr><th scope="row">Forward 12-Month NOI</th><td className="num right">{MONEY.format(report.scheduledTaxForwardNoi)}</td><td className="num right">{MONEY.format(report.fullTaxForwardNoi)}</td></tr>
      <tr><th scope="row">{byUse ? "Value at Terminal and Commercial Cap Rates" : "Value at Terminal Cap Rate"}</th><td className="num right">{MONEY.format(report.scheduledTaxValue)}</td><td className="num right">{MONEY.format(report.fullTaxValue)}</td></tr>
      {report.abatementValue !== null ? <tr><th scope="row">Plus Abatement Value at Sale</th><td className="num right">Not Used</td><td className="num right">{MONEY.format(report.abatementValue)}</td></tr> : null}
    </tbody></table></div>
  </>;
}

function PropertyTaxByYear({ tax }: { tax: PropertyTaxResult }) {
  const rows = tax.fiscalYears.filter((row) => row.listed || row.chargedMonths > 0);
  return <>
    <h4>Property Tax by Fiscal Year</h4>
    <p className="t-meta">{tax.mode === "abatement" ? "Scheduled tax is what the property pays under the abatement. Full tax is the same year with no abatement." : "Full tax applies in every year."}{tax.effectiveRateOnMarketValue !== null ? ` The first year taxes ${PERCENT.format(tax.effectiveRateOnMarketValue)} of market value.` : ""}{tax.capRates ? ` Assessment cap rate: ${NUMBER.format(tax.capRates.leaseUpPercent)}% before stabilization, ${NUMBER.format(tax.capRates.stabilizedPercent)}% ${tax.capRates.stabilizedFromMonth ? `from ${tax.capRates.stabilizedFromMonth}` : "once stabilized, which this run never reaches"}.` : ""}</p>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Fiscal Year</th><th>Months</th><th className="right">Rate</th><th className="right">Exemption</th><th className="right">Whole-Year Scheduled</th><th className="right">Whole-Year Full</th><th className="right">Charged Months</th><th className="right">Charged Scheduled</th><th className="right">Charged Full</th></tr></thead><tbody>
      {rows.map((row) => <tr key={row.fiscalYear}><th scope="row">{row.fiscalYear}{row.listed ? "" : " (After Schedule)"}</th><td className="num">{row.startMonth} to {row.endMonth}</td><td className="num right">{NUMBER.format(row.rate)}</td><td className="num right">{row.statedPayment !== null ? "PILOT Payment" : `${NUMBER.format(row.exemptionPercent)}%`}</td><td className="num right">{row.annualScheduledTax === null ? "Follows Revenue" : MONEY.format(row.annualScheduledTax)}</td><td className="num right">{row.annualFullTax === null ? "Follows Revenue" : MONEY.format(row.annualFullTax)}</td><td className="num right">{row.chargedMonths}</td><td className="num right">{MONEY.format(row.chargedScheduledTax)}</td><td className="num right">{MONEY.format(row.chargedFullTax)}</td></tr>)}
    </tbody></table></div>
  </>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span className="t-label">{label}</span><strong className="num">{value}</strong></div>;
}

function formatMetric(value: number, unit: "usd" | "ratio" | "multiple" | "basis_points") {
  if (unit === "usd") return MONEY.format(value);
  if (unit === "ratio") return PERCENT.format(value);
  if (unit === "multiple") return `${NUMBER.format(value)}x`;
  return `${NUMBER.format(value)} bps`;
}

function formatCheck(value: number, unit: ReconciliationCheck["unit"]) {
  return unit === "usd" ? MONEY.format(value) : NUMBER.format(value);
}
