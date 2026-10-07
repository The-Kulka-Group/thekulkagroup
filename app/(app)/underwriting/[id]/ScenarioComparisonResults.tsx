import type { ApartmentScenarioComparisonResult, LenderTestMetricKey, ScenarioLenderMetrics } from "@kulka/engine";
import { Chip } from "@/components/Status";

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat("en-US", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

const LENDER_ROWS: Array<[LenderTestMetricKey, string, (value: number) => string]> = [
  ["asStabilizedValue", "As-Stabilized Value", (value) => MONEY.format(value)],
  ["loanToValue", "Loan to Value", (value) => PERCENT.format(value)],
  ["loanToCost", "Loan to Cost", (value) => PERCENT.format(value)],
  ["debtServiceCoverage", "Debt Service Coverage", (value) => `${NUMBER.format(value)}x`],
  ["debtYield", "Debt Yield", (value) => PERCENT.format(value)],
];

export function ScenarioComparisonResults({ result }: { result: ApartmentScenarioComparisonResult }) {
  const columns = [result.base, ...result.scenarios];
  const names = [result.base.name, ...result.scenarios.map((item) => `${title(item.role)}: ${item.name}`)];
  const rows = [
    ["Forward 12-Month NOI", (value: typeof columns[number]) => MONEY.format(value.metrics.forwardNetOperatingIncome)],
    ["Gross Sale Value", (value: typeof columns[number]) => MONEY.format(value.metrics.grossSaleValue)],
    ["Unlevered XIRR", (value: typeof columns[number]) => PERCENT.format(value.metrics.unleveredXirr)],
    ["Levered XIRR", (value: typeof columns[number]) => PERCENT.format(value.metrics.leveredXirr)],
    ["Unlevered Equity Multiple", (value: typeof columns[number]) => `${NUMBER.format(value.metrics.unleveredEquityMultiple)}x`],
    ["Levered Equity Multiple", (value: typeof columns[number]) => `${NUMBER.format(value.metrics.leveredEquityMultiple)}x`],
    ["Yield on Cost", (value: typeof columns[number]) => PERCENT.format(value.metrics.yieldOnCost)],
    ["Development Spread", (value: typeof columns[number]) => `${NUMBER.format(value.metrics.developmentSpreadBasisPoints)} bps`],
  ] as const;
  const lenderRows = [
    ...lenderRowsFor("scheduledTax", ""),
    ...(result.base.metrics.lender?.fullTax ? lenderRowsFor("fullTax", " on Full Tax") : []),
  ];
  function lenderRowsFor(tax: keyof ScenarioLenderMetrics, suffix: string) {
    if (!result.base.metrics.lender) return [];
    return LENDER_ROWS.map(([key, label, format]) => [`${label}${suffix}`, (value: typeof columns[number]) => {
      const metric = value.metrics.lender?.[tax]?.[key];
      return metric === null || metric === undefined ? "Not Reported" : format(metric);
    }] as const);
  }
  return <div className="underwriting-monthly-results">
    <h4>Scenario Comparison</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results underwriting-scenario-comparison"><thead><tr><th>Metric</th>{names.map((name) => <th className="right" key={name}>{name}</th>)}</tr></thead><tbody>
      {[...rows, ...lenderRows].map(([label, format]) => <tr key={label}><th scope="row">{label}</th>{columns.map((value, index) => <td className="num right" key={names[index]}>{format(value)}</td>)}</tr>)}
      <tr><th scope="row">Reconciliation</th>{columns.map((value, index) => <td className="right" key={names[index]}><Chip status={value.reconciliationStatus === "pass" ? "done" : "stuck"} /></td>)}</tr>
    </tbody></table></div>
    <h4>Changed Inputs</h4>
    <div className="underwriting-results-wrap"><table className="underwriting-results underwriting-scenario-comparison"><thead><tr><th>Scenario</th><th>Input</th><th className="right">Current</th><th className="right">Scenario</th></tr></thead><tbody>
      {result.scenarios.flatMap((scenario) => scenario.changedInputs.map((input) => <tr key={`${scenario.id}-${input.key}`}><th scope="row">{scenario.name}</th><td>{input.label}</td><td className="num right">{formatInput(input.baseValue, input.unit)}</td><td className="num right">{formatInput(input.scenarioValue, input.unit)}</td></tr>))}
    </tbody></table></div>
    <h4>Formula Traces</h4>
    <p className="t-meta">The current inputs and both scenarios use the same formula version and metric formulas.</p>
    <div className="underwriting-results-wrap"><table className="underwriting-results underwriting-scenario-comparison"><thead><tr><th>Metric</th><th>Formula</th><th>Inputs Used</th></tr></thead><tbody>{result.base.propertyResult.propertyReturns.metrics.map((metric) => <tr key={metric.key}><th scope="row">{metric.label}</th><td>{metric.formula}</td><td className="t-meta">{metric.inputPaths.join(", ")}</td></tr>)}</tbody></table></div>
  </div>;
}

function title(value: string) { return `${value[0].toUpperCase()}${value.slice(1)}`; }
function formatInput(value: number | string, unit: "percent" | "month") { return unit === "month" ? String(value) : `${NUMBER.format(Number(value))}%`; }
