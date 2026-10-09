import type { ReconciliationCheck } from "@kulka/engine";

import { Chip } from "@/components/Status";

import { TraceFold } from "./TraceFold";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

function formatValue(value: number, unit: ReconciliationCheck["unit"]) {
  if (unit === "count") return NUMBER.format(value);
  if (unit === "sf") return `${NUMBER.format(value)} SF`;
  return MONEY.format(value);
}

function CheckTable({ checks }: { checks: ReconciliationCheck[] }) {
  return <div className="underwriting-results-wrap"><table className="underwriting-results"><thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th><th className="right">Difference</th></tr></thead><tbody>
    {checks.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{formatValue(check.expected, check.unit)}</td><td className="num right">{formatValue(check.actual, check.unit)}</td><td className="num right">{formatValue(check.difference, check.unit)}</td></tr>)}
  </tbody></table></div>;
}

/** One line for the result, any check that did not pass in the open, and the full table folded closed (LA-2055). */
export function ReconciliationChecks({ checks }: { checks: ReconciliationCheck[] }) {
  const failing = checks.filter((check) => check.status !== "pass");
  const passed = checks.length - failing.length;
  return <>
    <h4>Reconciliation Checks</h4>
    <p className="t-meta">{checks.length === 0 ? "This run saved no reconciliation checks." : `${passed} of ${checks.length} Checks Pass`}</p>
    {failing.length > 0 ? <CheckTable checks={failing} /> : null}
    {checks.length > 0 ? <TraceFold title="Show Every Check"><CheckTable checks={checks} /></TraceFold> : null}
  </>;
}
