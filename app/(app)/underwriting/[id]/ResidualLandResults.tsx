import {
  MAX_RESIDUAL_LAND_TRIALS,
  type PropertyReturnMetric,
  type PropertyReturnsResult,
  type ResidualLandOutcome,
  type ResidualLandPoint,
  type ResidualLandResult,
  type ResidualLandStatus,
} from "@kulka/engine";

import { Chip } from "@/components/Status";

import { formatMultiple } from "./format-multiple";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const CENTS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
/** One cent of land moves a return by a few hundred-millionths of a percent, so the search shows enough places to tell the two ends apart. */
const PRECISE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 });

export const RESIDUAL_LAND_STATUS_LABELS: Record<ResidualLandStatus, string> = {
  solved: "Solved",
  credited_land_cap: "Capped at Credited Land",
  below_minimum: "No Price Meets the Target",
  no_upper_bracket: "No Upper Bound Found",
  trial_failed: "A Search Run Failed",
  unsettled: "Search Did Not Settle",
};

/** Why a status other than Solved has no residual, in words a developer can act on. */
const STATUS_REASONS: Record<Exclude<ResidualLandStatus, "solved">, string> = {
  credited_land_cap: "The run meets the target all the way up to the stated credited land value, so the credited value sets the price, not the target.",
  below_minimum: "The building misses the target even with this land line at one cent. Lower the target, or change the cost, income or sale inputs.",
  no_upper_bracket: "The building meets the target even at the largest price the search tries. Check that the target value is what you meant.",
  trial_failed: "A run at one of the trial prices failed, so the search could not judge any price above it. The failed run's issues are listed below.",
  unsettled: `The search used all ${MAX_RESIDUAL_LAND_TRIALS} trial runs before the price that meets the target and the price that misses it closed to one cent.`,
};

const OUTCOME_LABELS: Record<ResidualLandOutcome, string> = {
  meets: "Meets Target",
  misses: "Misses Target",
  credited_land_cap: "Above Credited Land",
  failed: "Run Failed",
};

/** LA-1979: the land price that meets the case's target, beside the run at the stated land price. */
export function ResidualLandResults({ result, residual }: { result: PropertyReturnsResult; residual: ResidualLandResult }) {
  const solved = residual.status === "solved" || residual.status === "credited_land_cap";
  const stated = result.developmentCapital.totals;
  const atResidual = residual.capitalAtResidual;
  const residualMetric = (metric: PropertyReturnMetric) => residual.metricsAtResidual?.find(({ key }) => key === metric.key);
  return <>
    <h4>Residual Land</h4>
    <div className="underwriting-summary-band">
      <Summary label="Target" value={`${residual.targetLabel} ${targetText(residual.targetValue, residual.targetUnit)}`} />
      <Summary label="Status" value={RESIDUAL_LAND_STATUS_LABELS[residual.status]} />
      <Summary label="Land Line" value={residual.landLineName} />
      <Summary label="Stated Price" value={CENTS.format(residual.stated.lineAmount)} />
      <Summary label="Residual Price" value={residual.residualLineAmount === null ? "Not Solved" : CENTS.format(residual.residualLineAmount)} />
      <Summary label="Total Land Cost at Residual" value={residual.residualLandCashCost === null ? "Not Solved" : CENTS.format(residual.residualLandCashCost)} />
    </div>
    <p>{residual.message}</p>
    {residual.status !== "solved" ? <p className="t-meta">{STATUS_REASONS[residual.status]}</p> : null}
    {residual.trialIssues.length > 0 ? <ul className="underwriting-issues">{residual.trialIssues.map((issue) => <li key={`${issue.path}-${issue.code}`}>{issue.message}</li>)}</ul> : null}
    {solved && atResidual ? <>
      <h4>Results at Stated Land and at the Residual</h4>
      <div className="underwriting-results-wrap"><table className="underwriting-results underwriting-results--pair"><thead><tr><th>Result</th><th className="right">Stated Land</th><th className="right">Residual Land</th></tr></thead><tbody>
        <tr><th scope="row">Land Cash Cost</th><td className="num right">{MONEY.format(stated.landCashCost)}</td><td className="num right">{MONEY.format(atResidual.landCashCost)}</td></tr>
        <tr><th scope="row">Total Uses</th><td className="num right">{MONEY.format(stated.totalUses)}</td><td className="num right">{MONEY.format(atResidual.totalUses)}</td></tr>
        <tr><th scope="row">Total Debt</th><td className="num right">{MONEY.format(stated.totalDebt)}</td><td className="num right">{MONEY.format(atResidual.totalDebt)}</td></tr>
        <tr><th scope="row">Equity</th><td className="num right">{MONEY.format(stated.equity)}</td><td className="num right">{MONEY.format(atResidual.equity)}</td></tr>
        {result.propertyReturns.metrics.map((metric) => {
          const other = residualMetric(metric);
          return <tr key={metric.key}><th scope="row">{metric.label}</th><td className="num right">{formatMetric(metric.value, metric.unit)}</td><td className="num right">{other ? formatMetric(other.value, other.unit) : "Not Reported"}</td></tr>;
        })}
      </tbody></table></div>
    </> : null}
    <h4>Residual Land Search</h4>
    <p className="t-meta">{residual.trials} of {MAX_RESIDUAL_LAND_TRIALS} trial runs. Each trial is a full property run with only the land line price changed.</p>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Price Tried</th><th className="right">Line Price</th><th className="right">Land Cash Cost</th><th className="right">{residual.targetLabel}</th><th>Outcome</th></tr></thead><tbody>
      <PointRow label="Stated Land" point={residual.stated} unit={residual.targetUnit} />
      <PointRow label="Highest Price That Meets the Target" point={residual.meets} unit={residual.targetUnit} />
      <PointRow label="Lowest Price Above It" point={residual.misses} unit={residual.targetUnit} />
    </tbody></table></div>
    <h4>Residual Land Formula Trace</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Result</th><th>Formula</th><th>Inputs Used</th></tr></thead><tbody>
      <tr><th scope="row">Residual Price</th><td>{residual.formula}</td><td className="t-meta">{residual.inputPaths.join(", ")}</td></tr>
    </tbody></table></div>
    {residual.reconciliations.length > 0 ? <>
      <h4>Residual Land Checks</h4>
      <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th></tr></thead><tbody>
        {residual.reconciliations.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{check.unit === "usd" ? CENTS.format(check.expected) : PRECISE.format(check.expected)}</td><td className="num right">{check.unit === "usd" ? CENTS.format(check.actual) : PRECISE.format(check.actual)}</td></tr>)}
      </tbody></table></div>
    </> : null}
  </>;
}

function PointRow({ label, point, unit }: { label: string; point: ResidualLandPoint | null; unit: ResidualLandResult["targetUnit"] }) {
  if (!point) return <tr><th scope="row">{label}</th><td className="num right">None Found</td><td className="num right" /><td className="num right" /><td /></tr>;
  return <tr><th scope="row">{label}</th><td className="num right">{CENTS.format(point.lineAmount)}</td><td className="num right">{point.landCashCost === null ? "Not Reported" : CENTS.format(point.landCashCost)}</td><td className="num right">{point.metricValue === null ? "Not Reported" : targetText(point.metricValue, unit, PRECISE)}</td><td>{OUTCOME_LABELS[point.outcome]}</td></tr>;
}

function targetText(value: number, unit: ResidualLandResult["targetUnit"], format = NUMBER) {
  return unit === "percent" ? `${format.format(value)}%` : `${format.format(value)} bps`;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span className="t-label">{label}</span><strong className="num">{value}</strong></div>;
}

function formatMetric(value: number, unit: PropertyReturnMetric["unit"]) {
  if (unit === "usd") return MONEY.format(value);
  if (unit === "ratio") return PERCENT.format(value);
  if (unit === "multiple") return formatMultiple(value);
  return `${NUMBER.format(value)} bps`;
}
