import type { DevelopmentCapitalResult, SourcesAndUsesBasis } from "@kulka/engine";

import { PermanentLoanResults } from "./PermanentLoanResults";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * One line per source and use from the run's own totals. Grants and soft loans fund costs first, then
 * equity, then construction debt. Credited land appears only as a non-cash step-up, never as cash spent.
 */
export function SourcesAndUsesSection({ capital }: { capital: DevelopmentCapitalResult }) {
  const { sourcesAndUses, otherSources, creditedLand, totals } = capital;
  return <>
    <h4>Sources and Uses</h4>
    <p className="t-meta">Land is at cash cost. {otherSources.length > 0 ? "Grants and soft loans fund costs first, then equity, then construction debt. " : ""}The run fails if total sources and total uses differ.</p>
    <BasisTable basis={sourcesAndUses.cashBasis} caption="Sources and uses with land at cash cost" />
    {sourcesAndUses.creditedBasis ? <>
      <h4>Sources and Uses with Land at Credited Value</h4>
      <p className="t-meta">The deal counts credited land as sponsor equity, so the step-up over cash land cost appears as a non-cash use and a non-cash equity source of the same amount. No cash is spent on it.</p>
      <BasisTable basis={sourcesAndUses.creditedBasis} caption="Sources and uses with land at credited value" />
    </> : null}
    {creditedLand ? <p className="t-meta">
      Credited land: cash land cost {MONEY.format(creditedLand.cashLandCost)}, credited value {MONEY.format(creditedLand.creditedValue)}, step-up {MONEY.format(creditedLand.stepUp)}.
      {creditedLand.countsAsSponsorEquity
        ? ` Counted as sponsor equity: sponsor equity is ${MONEY.format(totals.sponsorEquity)}, of which ${MONEY.format(totals.creditedLandEquity)} is credited land and ${MONEY.format(totals.equity)} is cash.`
        : " The deal does not count it as sponsor equity, so sponsor equity is cash equity only."}
    </p> : null}
    {otherSources.length > 0 ? <>
      <h4>Grants and Soft Loans</h4>
      <div className="underwriting-results-wrap"><table className="underwriting-results">
        <thead><tr><th>Source</th><th>Kind</th><th className="right">Drawn</th><th className="right">Applied to Uses</th><th className="right">Accrued Interest</th><th className="right">Repaid</th><th className="right">Balance at End</th></tr></thead>
        <tbody>{otherSources.map((source) => <tr key={source.id}>
          <th scope="row">{source.name}</th>
          <td>{source.kind === "grant" ? "Grant" : "Soft Loan"}</td>
          <td className="num right">{MONEY.format(source.drawn)}</td>
          <td className="num right">{MONEY.format(source.applied)}</td>
          <td className="num right">{source.kind === "soft_loan" ? MONEY.format(source.accruedInterest) : "Not Applicable"}</td>
          <td className="num right">{source.kind === "soft_loan" ? MONEY.format(source.repaid) : "Not Applicable"}</td>
          <td className="num right">{source.kind === "soft_loan" ? MONEY.format(source.closingBalance) : "Not Applicable"}</td>
        </tr>)}</tbody>
      </table></div>
      {totals.softLoanInterest > 0 ? <p className="t-meta">Soft loan interest accrues to the loan balance and is paid at repayment. It is not a project use, so it does not appear in total uses.</p> : null}
    </> : null}
    {capital.permanentLoan ? <PermanentLoanResults loan={capital.permanentLoan} /> : null}
  </>;
}

function BasisTable({ basis, caption }: { basis: SourcesAndUsesBasis; caption: string }) {
  const rows = Math.max(basis.sources.length, basis.uses.length);
  return <div className="underwriting-results-wrap"><table className="underwriting-results" aria-label={caption}>
    <thead><tr><th>Source</th><th className="right">Amount</th><th>Use</th><th className="right">Amount</th></tr></thead>
    <tbody>
      {Array.from({ length: rows }, (_, index) => {
        const source = basis.sources[index];
        const use = basis.uses[index];
        return <tr key={index}>
          <th scope="row">{source?.label ?? ""}</th>
          <td className="num right">{source ? MONEY.format(source.amount) : ""}</td>
          <td>{use?.label ?? ""}</td>
          <td className="num right">{use ? MONEY.format(use.amount) : ""}</td>
        </tr>;
      })}
      <tr><th scope="row">Total Sources</th><td className="num right">{MONEY.format(basis.totalSources)}</td><td>Total Uses</td><td className="num right">{MONEY.format(basis.totalUses)}</td></tr>
    </tbody>
  </table></div>;
}
