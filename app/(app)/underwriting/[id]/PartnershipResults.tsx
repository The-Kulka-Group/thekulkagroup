import type { PartnerReturns, PartnershipMetric, PartnershipResult } from "@kulka/engine";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const FUNDING_ORDER: Record<PartnershipResult["fundingOrder"], string> = {
  pari_passu: "Pari Passu",
  gp_first: "GP First",
};

/** The LP and GP split of one run's levered cash flow (LA-1863). */
export function PartnershipResults({ result }: { result: PartnershipResult }) {
  const { lp, gp } = result;
  const pref = result.preferredReturn;
  const active = result.months.filter((month) => month.lpContribution !== 0 || month.gpContribution !== 0 || month.lpDistribution !== 0 || month.gpDistribution !== 0);
  return <>
    <h4>Partnership Waterfall</h4>
    <p className="t-meta">{NUMBER.format(result.lpFundingSharePercent)}% LP and {NUMBER.format(100 - result.lpFundingSharePercent)}% GP, funded {FUNDING_ORDER[result.fundingOrder]}{result.lpEntryMonth ? `, with the LP entering ${result.lpEntryMonth} and paying the GP a catch-up` : ""}. {pref ? `A ${NUMBER.format(pref.ratePercent)}% preferred return accrues ${pref.accrual === "compound_monthly" ? "monthly, compounding" : "monthly, simple"}, then capital returns, before the tiers.` : "Capital returns inside the first tier."}{result.cashCalls > 0 ? ` The partners also fund ${MONEY.format(result.cashCalls)} of cash calls where levered cash flow needs more than the capital plan's equity.` : ""}</p>
    <div className="underwriting-summary-band">
      <Summary label="LP XIRR" value={formatRatio(lp.xirr)} />
      <Summary label="GP XIRR" value={formatRatio(gp.xirr)} />
      <Summary label="LP Equity Multiple" value={formatMultiple(lp.equityMultiple)} />
      <Summary label="GP Equity Multiple" value={formatMultiple(gp.equityMultiple)} />
      <Summary label="GP Promote" value={MONEY.format(result.promoteTotal)} />
    </div>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Result</th><th className="right">LP</th><th className="right">GP</th><th className="right">Total</th></tr></thead><tbody>
      <PartnerRow label="Contributions" lp={lp} gp={gp} pick={(partner) => partner.contributions} />
      <PartnerRow label="Distributions" lp={lp} gp={gp} pick={(partner) => partner.distributions} />
      <PartnerRow label="Net Profit" lp={lp} gp={gp} pick={(partner) => partner.netProfit} />
      {pref ? <>
        <PartnerRow label="Preferred Return Accrued" lp={lp} gp={gp} pick={(partner) => partner.preferredReturnAccrued} />
        <PartnerRow label="Preferred Return Paid" lp={lp} gp={gp} pick={(partner) => partner.preferredReturnPaid} />
        <PartnerRow label="Capital Returned" lp={lp} gp={gp} pick={(partner) => partner.capitalReturned} />
      </> : null}
      <tr><th scope="row">Peak Equity</th><td className="num right">{MONEY.format(lp.peakEquity)}{lp.peakEquityMonth ? ` (${lp.peakEquityMonth})` : ""}</td><td className="num right">{MONEY.format(gp.peakEquity)}{gp.peakEquityMonth ? ` (${gp.peakEquityMonth})` : ""}</td><td /></tr>
    </tbody></table></div>
    <h4>Distributions by Tier</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Level</th><th className="right">LP IRR Hurdle</th><th className="right">LP</th><th className="right">GP Base Share</th><th className="right">GP Promote</th><th className="right">Total</th></tr></thead><tbody>
      {pref ? <tr><th scope="row">Preferred Return and Capital</th><td className="num right" /><td className="num right">{MONEY.format(lp.preferredReturnPaid + lp.capitalReturned)}</td><td className="num right">{MONEY.format(gp.preferredReturnPaid + gp.capitalReturned)}</td><td className="num right">{MONEY.format(0)}</td><td className="num right">{MONEY.format(lp.preferredReturnPaid + lp.capitalReturned + gp.preferredReturnPaid + gp.capitalReturned)}</td></tr> : null}
      {result.tiers.map((tier, index) => <tr key={index}><th scope="row">Tier {index + 1}</th><td className="num right">{NUMBER.format(tier.lpIrrHurdlePercent)}%</td><td className="num right">{MONEY.format(tier.lp)}</td><td className="num right">{MONEY.format(tier.gpBase)}</td><td className="num right">{MONEY.format(tier.promote)}</td><td className="num right">{MONEY.format(tier.total)}</td></tr>)}
      <tr><th scope="row">Final Split</th><td className="num right" /><td className="num right">{MONEY.format(result.finalSplit.lp)}</td><td className="num right">{MONEY.format(result.finalSplit.gpBase)}</td><td className="num right">{MONEY.format(result.finalSplit.promote)}</td><td className="num right">{MONEY.format(result.finalSplit.total)}</td></tr>
    </tbody></table></div>
    <h4>Partnership Formula Traces</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Result</th><th className="right">Value</th><th>Formula</th><th>Inputs Used</th></tr></thead><tbody>
      {result.metrics.map((metric) => <tr key={metric.key}><th scope="row">{metric.label}</th><td className="num right">{formatMetric(metric)}</td><td>{metric.formula}</td><td className="t-meta">{metric.inputPaths.join(", ")}</td></tr>)}
    </tbody></table></div>
    {result.issues.length > 0 ? <ul className="underwriting-issues">{result.issues.map((issue) => <li key={issue.code}>{issue.message}</li>)}</ul> : null}
    <h4>Monthly LP and GP Cash Flow</h4>
    <p className="t-meta">Months with a contribution or a distribution. LP plus GP net cash flow equals levered cash flow in every month; the checks below confirm it.</p>
    <div className="underwriting-results-wrap"><table className="underwriting-monthly-table"><thead><tr><th>Month</th><th className="right">Levered Cash Flow</th><th className="right">LP Contribution</th><th className="right">GP Contribution</th><th className="right">LP Distribution</th><th className="right">GP Distribution</th><th className="right">LP Net</th><th className="right">GP Net</th></tr></thead><tbody>
      {active.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th><td className="num right">{MONEY.format(month.leveredCashFlow)}</td><td className="num right">{MONEY.format(month.lpContribution)}</td><td className="num right">{MONEY.format(month.gpContribution)}</td><td className="num right">{MONEY.format(month.lpDistribution)}</td><td className="num right">{MONEY.format(month.gpDistribution)}</td><td className="num right">{MONEY.format(month.lpNetCashFlow)}</td><td className="num right">{MONEY.format(month.gpNetCashFlow)}</td></tr>)}
    </tbody></table></div>
  </>;
}

function PartnerRow({ label, lp, gp, pick }: { label: string; lp: PartnerReturns; gp: PartnerReturns; pick: (partner: PartnerReturns) => number }) {
  return <tr><th scope="row">{label}</th><td className="num right">{MONEY.format(pick(lp))}</td><td className="num right">{MONEY.format(pick(gp))}</td><td className="num right">{MONEY.format(pick(lp) + pick(gp))}</td></tr>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span className="t-label">{label}</span><strong className="num">{value}</strong></div>;
}

function formatRatio(value: number | null) {
  return value === null ? "Not Reported" : PERCENT.format(value);
}

function formatMultiple(value: number | null) {
  return value === null ? "Not Reported" : `${NUMBER.format(value)}x`;
}

function formatMetric(metric: PartnershipMetric) {
  if (metric.value === null) return "Not Reported";
  if (metric.unit === "usd") return MONEY.format(metric.value);
  if (metric.unit === "ratio") return PERCENT.format(metric.value);
  return `${NUMBER.format(metric.value)}x`;
}
