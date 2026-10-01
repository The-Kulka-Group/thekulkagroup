import type { GrRate } from "@/lib/rom/gr-rates";

import "./gr-rate-card.css";

// LA-1396. The General Requirements rate card, read only, shown beside the
// staffing and field-office rates. Every row comes from one 120,000 SF
// warehouse, so the caveat sits above the table and cannot be missed.

const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** A rate in words: "$0.55 per SF", "$1,400 per week", "$1,500 lump sum". */
export function grRateLabel(rate: GrRate): string {
  if (!rate.priceable) return "Not Priceable";
  if (rate.rate === null) return "No Rate";
  const money = MONEY.format(rate.rate);
  switch (rate.basis) {
    case "phase_weeks":
      return `${money} per week`;
    case "phase_months":
      return `${money} per month`;
    case "lump_sum":
      return `${money} lump sum`;
    case "unit":
      return `${money} per ${rate.unit ?? "unit"}`;
    default:
      return money;
  }
}

export function GrRateCard({ rates }: { rates: GrRate[] }) {
  if (rates.length === 0) return null;
  const sections = [...new Set(rates.map((r) => r.section))];
  return (
    <details className="gr-rates">
      <summary className="t-label markup-sub">General Requirements Rates</summary>
      <p className="markup-note">
        Every rate below comes from one job, {rates[0].sourceJob}, estimate {rates[0].sourceEstimate}. None of it is a
        multifamily benchmark.
      </p>
      {sections.map((section) => (
        <div key={section}>
          <h4 className="gr-rates__section t-label">{section}</h4>
          <ul className="gr-rates__list">
            {rates
              .filter((r) => r.section === section)
              .map((r) => (
                <li key={r.id}>
                  <span>{r.item}</span>
                  <span className="num">{grRateLabel(r)}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </details>
  );
}
