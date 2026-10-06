import {
  AFFORDABILITY_TIERS,
  affordabilityReport,
  type AffordabilityTier,
  type ApartmentOperationsResult,
  type ResidentialUnitType,
} from "@kulka/engine";

export const TIER_LABELS: Record<AffordabilityTier, string> = {
  market: "Market",
  workforce: "Workforce",
  affordable: "Affordable",
};

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function ami(min: number | null, max: number | null) {
  if (min === null || max === null) return "None";
  return min === max ? `${min}%` : `${min}% to ${max}%`;
}

export function UnitMixByTier({ unitTypes, result }: { unitTypes: ResidentialUnitType[]; result?: ApartmentOperationsResult | null }) {
  const report = affordabilityReport(unitTypes, result);
  const noiByTier = new Map(report.noi?.tiers.map((row) => [row.tier, row]));
  return (
    <section aria-labelledby="unit-mix-heading" className="underwriting-line-section">
      <h4 id="unit-mix-heading">Unit Mix by Tier</h4>
      <p className="t-meta">Every unit type counts in its tier. Rent is the entered monthly rent per revenue unit.{report.noi ? ` NOI is for the twelve months from ${report.noi.firstMonth}.` : " NOI by tier appears once a run reaches a stabilized month."}</p>
      <div className="underwriting-results-wrap">
        <table className="underwriting-monthly-table">
          <thead><tr><th>Tier</th><th className="right">Unit Types</th><th className="right">Units</th><th className="right">Revenue Units</th><th className="right">Rentable SF</th><th className="right">Average Rent</th><th>AMI</th><th className="right">NOI</th><th className="right">NOI per Unit</th><th className="right">NOI per SF</th></tr></thead>
          <tbody>
            {AFFORDABILITY_TIERS.map((tier) => {
              const row = report.tiers.find((item) => item.tier === tier)!;
              const noi = noiByTier.get(tier);
              return <tr key={tier}>
                <th scope="row">{TIER_LABELS[tier]}</th>
                <td className="num right">{row.unitTypeCount}</td>
                <td className="num right">{NUMBER.format(row.units)}</td>
                <td className="num right">{NUMBER.format(row.revenueUnits)}</td>
                <td className="num right">{NUMBER.format(row.rentableSf)}</td>
                <td className="num right">{row.averageMonthlyRent === null ? "None" : MONEY.format(row.averageMonthlyRent)}</td>
                <td className="num">{ami(row.minAmiPercent, row.maxAmiPercent)}</td>
                <td className="num right">{noi ? MONEY.format(noi.netOperatingIncome) : "None"}</td>
                <td className="num right">{noi?.noiPerUnit == null ? "None" : MONEY.format(noi.noiPerUnit)}</td>
                <td className="num right">{noi?.noiPerRentableSf == null ? "None" : `$${noi.noiPerRentableSf.toFixed(2)}`}</td>
              </tr>;
            })}
            <tr>
              <th scope="row">Total</th>
              <td className="num right">{unitTypes.length}</td>
              <td className="num right">{NUMBER.format(report.total.units)}</td>
              <td className="num right">{NUMBER.format(report.total.revenueUnits)}</td>
              <td className="num right">{NUMBER.format(report.total.rentableSf)}</td>
              <td />
              <td />
              <td className="num right">{report.noi ? MONEY.format(report.noi.total.netOperatingIncome) : "None"}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      {report.noi ? <p className="t-meta">{report.allocationRule}</p> : null}
      {report.problems.length > 0 ? <p className="input-error" role="alert">{report.problems.join(" ")}</p> : null}
    </section>
  );
}
