import type {
  ApartmentOperationsTotals,
  CommercialOperationsResult,
  MonthlyApartmentOperations,
  MonthlyCostScheduleResult,
} from "@kulka/engine";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const COST_CATEGORY: Record<string, string> = { hard_cost: "Hard Cost", soft_cost: "Soft Cost" };

/** The months of a run that carry commercial lines. Runs saved before commercial spaces have none of these fields. */
export function hasCommercialMonths(months: MonthlyApartmentOperations[]) {
  return months.some((month) => typeof month.commercialEffectiveGrossRevenue === "number"
    && (month.commercialEffectiveGrossRevenue !== 0 || month.commercialOperatingExpenses !== 0));
}

/**
 * Commercial income and NOI by month beside residential NOI, and, for a run that carries the spaces,
 * each space's rent roll, recoveries and first-generation costs with the cost schedule lines they
 * become (LA-1871). A commercial space is never a unit, so nothing here counts one.
 */
export function CommercialResults({ months, commercial, totals, costSchedule, heading = "Commercial Income and Net Operating Income" }: {
  months: MonthlyApartmentOperations[];
  commercial?: CommercialOperationsResult;
  totals?: ApartmentOperationsTotals;
  costSchedule?: MonthlyCostScheduleResult;
  heading?: string;
}) {
  const costLines = (costSchedule?.costLineSchedules ?? []).filter((line) => line.lineId.startsWith("commercial-ti:") || line.lineId.startsWith("commercial-commission:"));
  return <>
    <h4>{heading}</h4>
    {commercial && totals ? <div className="underwriting-summary-band">
      <Summary label="Commercial Area" value={`${NUMBER.format(commercial.commercialAreaSf)} SF`} />
      <Summary label="Annual Commercial Rent Roll" value={MONEY.format(commercial.annualRentRoll)} />
      <Summary label="Tenant Improvements" value={MONEY.format(commercial.tenantImprovements)} />
      <Summary label="Leasing Commissions" value={MONEY.format(commercial.leasingCommissions)} />
      <Summary label="Commercial Net Operating Income" value={MONEY.format(totals.commercialNetOperatingIncome)} />
      <Summary label="Residential Net Operating Income" value={MONEY.format(totals.residentialNetOperatingIncome)} />
      <Summary label="Total Net Operating Income" value={MONEY.format(totals.netOperatingIncome)} />
    </div> : null}
    <div className="underwriting-results-wrap">
      <table className="underwriting-monthly-table underwriting-commercial-results" aria-label="Commercial income and net operating income by month">
        <thead><tr><th>Month</th><th className="right">Commercial Base Rent</th><th className="right">Commercial Free Rent</th><th className="right">Commercial Recoveries</th><th className="right">Commercial Vacancy</th><th className="right">Commercial Credit Loss</th><th className="right">Commercial Effective Gross Revenue</th><th className="right">Commercial Operating Expenses</th><th className="right">Commercial Net Operating Income</th><th className="right">Residential Net Operating Income</th><th className="right">Total Net Operating Income</th></tr></thead>
        <tbody>{months.map((month) => <tr key={month.month}>
          <th scope="row" className="num">{month.month}</th>
          <td className="num right">{MONEY.format(month.commercialBaseRent)}</td>
          <td className="num right">{MONEY.format(month.commercialFreeRent)}</td>
          <td className="num right">{MONEY.format(month.commercialRecoveries)}</td>
          <td className="num right">{MONEY.format(month.commercialVacancyLoss)}</td>
          <td className="num right">{MONEY.format(month.commercialCreditLoss)}</td>
          <td className="num right">{MONEY.format(month.commercialEffectiveGrossRevenue)}</td>
          <td className="num right">{MONEY.format(month.commercialOperatingExpenses)}</td>
          <td className="num right">{MONEY.format(month.commercialNetOperatingIncome)}</td>
          <td className="num right">{MONEY.format(month.residentialNetOperatingIncome)}</td>
          <td className="num right">{MONEY.format(month.netOperatingIncome)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {commercial ? <>
      <h4>Commercial Spaces</h4>
      <div className="underwriting-results-wrap">
        <table className="underwriting-results" aria-label="Commercial spaces">
          <thead><tr><th>Space</th><th className="right">Area</th><th>Lease Start</th><th className="right">Annual Rent Roll</th><th className="right">Base Rent</th><th className="right">Free Rent</th><th className="right">Tenant Improvements</th><th className="right">Leasing Commission</th><th>Recoveries</th></tr></thead>
          <tbody>{commercial.spaces.map((space) => <tr key={space.id}>
            <th scope="row">{space.name}</th>
            <td className="num right">{NUMBER.format(space.areaSf)} SF</td>
            <td className="num">{space.leaseStartMonth}</td>
            <td className="num right">{MONEY.format(space.annualRentRoll)}</td>
            <td className="num right">{MONEY.format(space.baseRentTotal)}</td>
            <td className="num right">{MONEY.format(space.freeRentTotal)}</td>
            <td className="num right">{MONEY.format(space.tenantImprovements)}</td>
            <td className="num right">{MONEY.format(space.leasingCommission)}</td>
            <td>{space.recoveries.length === 0 ? "None" : space.recoveries.map((recovery, position) => <div key={position}>{recovery.basis}: {NUMBER.format(recovery.sharePercent)}% {recovery.shareSource === "area_share" ? "(area share)" : "(entered)"}, {MONEY.format(recovery.total)}</div>)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {costLines.length > 0 ? <>
        <h4>Commercial Costs in the Cost Schedule</h4>
        <p className="t-meta">Tenant improvements and leasing commissions are development cost paid in the lease start month. The capital plan funds them with the other project costs, and they count in total cost and loan to cost.</p>
        <div className="underwriting-results-wrap">
          <table className="underwriting-results" aria-label="Commercial costs in the cost schedule">
            <thead><tr><th>Cost Line</th><th>Category</th><th>Month</th><th className="right">Amount</th><th>Formula Trace</th></tr></thead>
            <tbody>{costLines.map((line) => <tr key={line.lineId}>
              <th scope="row">{line.name}</th>
              <td>{COST_CATEGORY[line.category] ?? line.category}</td>
              <td className="num">{line.months[0]}</td>
              <td className="num right">{MONEY.format(line.amount)}</td>
              <td>{line.formulaTrace}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </> : null}
    </> : null}
  </>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span className="t-label">{label}</span><strong className="num">{value}</strong></div>;
}
