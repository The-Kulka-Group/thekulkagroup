import type { PropertyReturnsResult, ReconciliationCheck } from "@kulka/engine";

import { Chip } from "@/components/Status";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

export function PropertyReturnsResults({ result, reconciliations }: { result: PropertyReturnsResult; reconciliations: ReconciliationCheck[] }) {
  const sale = result.propertyReturns.sale;
  const returns = result.propertyReturns.returns;
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
      <Summary label="Yield On Cost" value={PERCENT.format(result.propertyReturns.yieldOnCost)} />
      <Summary label="Development Spread" value={`${NUMBER.format(result.propertyReturns.developmentSpreadBasisPoints)} bps`} />
    </div>
    <h4>Dated Monthly Property Cash Flow</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-monthly-table underwriting-property-cash-flow"><thead><tr><th>Month</th><th>Date</th><th className="right">Project Costs</th><th className="right">Operating Cash Flow</th><th className="right">Gross Interest</th><th className="right">Debt Draws</th><th className="right">Debt Payoff</th><th className="right">Net Sale Proceeds</th><th className="right">Unlevered Cash Flow</th><th className="right">Levered Cash Flow</th></tr></thead><tbody>
      {result.propertyReturns.months.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th><td className="num">{month.date}</td><td className="num right">{MONEY.format(month.projectCosts)}</td><td className="num right">{MONEY.format(month.operatingCashFlow)}</td><td className="num right">{MONEY.format(month.grossInterest)}</td><td className="num right">{MONEY.format(month.totalDebtDraw)}</td><td className="num right">{MONEY.format(month.repayment)}</td><td className="num right">{MONEY.format(month.netSaleProceeds)}</td><td className="num right">{MONEY.format(month.unleveredCashFlow)}</td><td className="num right">{MONEY.format(month.leveredCashFlow)}</td></tr>)}
    </tbody></table></div>
    <h4>Return Metrics And Formula Traces</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Result</th><th className="right">Value</th><th>Formula</th><th>Inputs Used</th></tr></thead><tbody>
      {result.propertyReturns.metrics.map((metric) => <tr key={metric.key}><th scope="row">{metric.label}</th><td className="num right">{formatMetric(metric.value, metric.unit)}</td><td>{metric.formula}</td><td className="t-meta">{metric.inputPaths.join(", ")}</td></tr>)}
    </tbody></table></div>
    <h4>Reconciliation Checks</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th><th className="right">Difference</th></tr></thead><tbody>
      {reconciliations.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{formatCheck(check.expected, check.unit)}</td><td className="num right">{formatCheck(check.actual, check.unit)}</td><td className="num right">{formatCheck(check.difference, check.unit)}</td></tr>)}
    </tbody></table></div>
  </div>;
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
