import type { PermanentLoanAssumptionKey, PermanentLoanBindingKey, PermanentLoanCapKey, PermanentLoanResult } from "@kulka/engine";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Plain names for each permanent loan term, shared by the editor and the saved run page. */
export const PERMANENT_LOAN_EVIDENCE_LABELS: Record<PermanentLoanAssumptionKey | PermanentLoanCapKey, string> = {
  fundingMonth: "Funding Month",
  sizingMode: "Sizing Mode",
  sizingNoiWindow: "Sizing NOI Window",
  noiTaxBasis: "Tax Basis",
  annualRatePercent: "Annual Interest Rate",
  interestOnlyMonths: "Interest-Only Months",
  amortizationYears: "Amortization",
  termYears: "Term",
  feePercent: "Loan Fee",
  closingCosts: "Closing Costs",
  cashOut: "Proceeds Above Payoff",
  maxLoanToValuePercent: "Maximum Loan to Value",
  valuationCapRatePercent: "Valuation Cap Rate",
  minDebtServiceCoverage: "Minimum Debt Service Coverage",
  minDebtYieldPercent: "Minimum Debt Yield",
};

const BINDING: Record<PermanentLoanBindingKey, string> = {
  loanToValue: "Loan to Value",
  debtYield: "Debt Yield",
  debtServiceCoverage: "Debt Service Coverage",
  constructionBalance: "Construction Balance",
  payoffLimit: "Cut to Construction Payoff",
};

const WINDOW: Record<PermanentLoanResult["sizingWindow"]["kind"], string> = {
  trailing: "Annualized trailing NOI",
  forward_twelve: "Forward twelve months of NOI",
};

/** The permanent loan's takeout, sizing, debt service and payoff on one run (LA-1869). */
export function PermanentLoanResults({ loan }: { loan: PermanentLoanResult }) {
  const debtMonths = loan.months.filter((month) => month.month > loan.fundingMonth || month.proceeds !== 0);
  return <>
    <h4>Permanent Loan</h4>
    <p className="t-meta">
      Takeout in {loan.fundingMonth} ({loan.fundingTrace}). The loan matures {loan.maturityMonth}, and the sale falls in {loan.saleMonth}. {WINDOW[loan.sizingWindow.kind]}, {loan.sizingWindow.startMonth} to {loan.sizingWindow.endMonth} ({loan.sizingWindow.monthCount} months), on {loan.noiTaxBasis === "full_tax" ? "full tax" : "abated tax"}: {MONEY.format(loan.sizingNoi)}.
    </p>
    <div className="underwriting-summary-band">
      <Summary label="Takeout Month" value={loan.fundingMonth} />
      <Summary label="Permanent Loan Amount" value={MONEY.format(loan.loanAmount)} />
      <Summary label="Binding Test" value={BINDING[loan.binding]} />
      <Summary label="Construction Payoff" value={MONEY.format(loan.constructionPayoff)} />
      <Summary label="Fee and Closing Costs" value={MONEY.format(loan.fee + loan.closingCosts)} />
      {loan.equityPaydown > 0
        ? <Summary label="Equity Paydown" value={MONEY.format(loan.equityPaydown)} />
        : <Summary label="Cash Out" value={MONEY.format(loan.cashOut)} />}
      <Summary label="Annual Debt Service" value={MONEY.format(loan.annualDebtService)} />
      <Summary label="First-Year Debt Service" value={MONEY.format(loan.firstYearDebtService)} />
      <Summary label="Debt Service Coverage" value={loan.debtServiceCoverage === null ? "Not Reported" : `${NUMBER.format(loan.debtServiceCoverage)}x`} />
      <Summary label="Debt Yield" value={PERCENT.format(loan.debtYield)} />
      <Summary label="Loan to Value" value={loan.loanToValue === null ? "Not Reported" : PERCENT.format(loan.loanToValue)} />
      <Summary label="Payoff at Sale" value={MONEY.format(loan.payoffAtSale)} />
      {loan.equityCalls > 0 ? <Summary label="Equity Calls" value={MONEY.format(loan.equityCalls)} /> : null}
    </div>
    <p className="t-meta">
      Debt service coverage with scheduled tax is {ratio(loan.debtServiceCoverageScheduledTax)} and with full tax is {ratio(loan.debtServiceCoverageFullTax)}. {loan.equityPaydown > 0 ? "The net proceeds fall short of the construction payoff, so the equity holders pay the gap in the takeout month." : loan.cashOut > 0 ? "Net proceeds above the construction payoff go to the equity holders in the takeout month." : "The net proceeds match the construction payoff."}
    </p>

    <h4>Permanent Loan Sizing</h4>
    {loan.caps.length > 0 ? <div className="underwriting-results-wrap"><table className="underwriting-results">
      <thead><tr><th>Test</th><th className="right">Largest Loan</th><th>Binding</th><th>Formula</th></tr></thead>
      <tbody>{loan.caps.map((cap) => <tr key={cap.key}>
        <th scope="row">{cap.label}</th>
        <td className="num right">{MONEY.format(cap.amount)}</td>
        <td>{cap.binding ? <span className="chip chip--done"><span className="dot" />Binding</span> : "Not Binding"}</td>
        <td>{cap.formula}</td>
      </tr>)}</tbody>
    </table></div> : <p className="t-meta">The loan is sized on the construction balance, so no NOI cap applies.</p>}
    {loan.binding === "payoffLimit" ? <p className="t-meta">The smallest cap allows more than the construction payoff and costs need, so the loan is cut back to payoff.</p> : null}

    <h4>Permanent Loan Debt Service by Month</h4>
    <p className="t-meta">{loan.monthlyPayment === null ? "The loan never amortizes, so each month pays interest only." : `The level payment once amortization starts is ${MONEY.format(loan.monthlyPayment)} a month.`} Operating cash pays debt service, and any shortfall is an equity call.</p>
    <div className="underwriting-results-wrap"><table className="underwriting-monthly-table underwriting-permanent-loan-months">
      <thead><tr><th>Month</th><th className="right">Opening Balance</th><th className="right">Proceeds</th><th className="right">Interest</th><th className="right">Principal</th><th className="right">Debt Service</th><th className="right">Operating Cash Flow</th><th className="right">Cash Flow After Debt Service</th><th className="right">Equity Call</th><th className="right">Payoff at Sale</th><th className="right">Closing Balance</th></tr></thead>
      <tbody>{debtMonths.map((month) => <tr key={month.month}>
        <th scope="row" className="num">{month.month}</th>
        <td className="num right">{MONEY.format(month.openingBalance)}</td>
        <td className="num right">{MONEY.format(month.proceeds)}</td>
        <td className="num right">{MONEY.format(month.interest)}</td>
        <td className="num right">{MONEY.format(month.principal)}</td>
        <td className="num right">{MONEY.format(month.debtService)}</td>
        <td className="num right">{MONEY.format(month.operatingCashFlow)}</td>
        <td className="num right">{MONEY.format(month.cashFlowAfterDebtService)}</td>
        <td className="num right">{MONEY.format(month.equityCall)}</td>
        <td className="num right">{MONEY.format(month.payoff)}</td>
        <td className="num right">{MONEY.format(month.closingBalance)}</td>
      </tr>)}</tbody>
    </table></div>

    {loan.loanYearBalances.length > 0 ? <>
      <h4>Permanent Loan Balance by Loan Year</h4>
      <div className="underwriting-results-wrap"><table className="underwriting-results">
        <thead><tr><th>Loan Year</th><th>Ends</th><th className="right">Balance</th></tr></thead>
        <tbody>{loan.loanYearBalances.map((year) => <tr key={year.loanYear}><th scope="row" className="num">{year.loanYear}</th><td className="num">{year.endMonth}</td><td className="num right">{MONEY.format(year.balance)}</td></tr>)}</tbody>
      </table></div>
    </> : null}

    <h4>Permanent Loan Formula Traces</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results">
      <thead><tr><th>Result</th><th>Formula</th><th>Inputs Used</th></tr></thead>
      <tbody>{loan.formulaTraces.map((trace) => <tr key={trace.key}><th scope="row">{trace.label}</th><td>{trace.formula}</td><td className="t-meta">{trace.inputPaths.join(", ")}</td></tr>)}</tbody>
    </table></div>
  </>;
}

function ratio(value: number | null) {
  return value === null ? "not reported" : `${NUMBER.format(value)}x`;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span className="t-label">{label}</span><strong className="num">{value}</strong></div>;
}
