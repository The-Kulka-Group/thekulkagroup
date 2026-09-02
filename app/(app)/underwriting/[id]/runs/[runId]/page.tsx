import Link from "next/link";
import { notFound } from "next/navigation";
import type { MonthlyCostScheduleInputs } from "@kulka/engine";

import { Sheet, Sep } from "@/components/Sheet";
import { Chip } from "@/components/Status";
import { getDb } from "@/lib/db";
import { FACT_DEFINITIONS, getUnderwritingCase } from "@/lib/underwriting/cases";
import {
  UNDERWRITING_INPUT_KEYS,
  UNDERWRITING_INPUT_LABELS,
  UNDERWRITING_LIMITATIONS,
} from "@/lib/underwriting/presentation";
import { getUnderwritingRun } from "@/lib/underwriting/runs";
import { isUuid } from "@/lib/uuid";

export const dynamic = "force-dynamic";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 });
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});
const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

const INPUT_UNITS = {
  grossBuildingSquareFeet: "GSF",
  proposedUnits: "units",
  purchasePrice: "USD",
  monthlyRent: "USD/month",
  hardCostPerGrossSquareFoot: "USD/GSF",
  softCostPercent: "percent",
  contingencyPercent: "percent",
  vacancyPercent: "percent",
  operatingExpensePercent: "percent",
  debtPercent: "percent",
  interestRatePercent: "percent",
  exitCapRatePercent: "percent",
} as const;

export default async function UnderwritingRunPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  if (!isUuid(id) || !isUuid(runId)) notFound();
  const [savedCase, run] = await Promise.all([
    getUnderwritingCase(getDb(), id),
    getUnderwritingRun(getDb(), runId),
  ]);
  if (!savedCase || !run || run.caseId !== savedCase.id) notFound();

  return (
    <Sheet
      number={savedCase.sheetNumber}
      title={`Calculation run ${run.id.slice(0, 8)}`}
      actions={<Link className="btn btn--secondary" href={`/underwriting/${savedCase.id}#calculation-history`}>Back to case</Link>}
      meta={
        <>
          <span>{savedCase.name}</span>
          <Sep />
          <span className="num">Revision {run.caseRevision}</span>
          <Sep />
          <span className="num">{DATE_TIME.format(new Date(run.createdAt))}</span>
        </>
      }
    >
      <div className="record underwriting-record underwriting-run-detail">
        <div className="margin" />
        <div className="col-field underwriting-decision-row">
          <div>
            <span className="t-label">Saved run</span>
            <h2 className="t-1">{run.status === "complete" ? "The calculation completed." : "The calculation stopped on input issues."}</h2>
            <p className="t-meta">This record stays tied to case revision {run.caseRevision} and formula version {run.formulaVersion}.</p>
          </div>
          <Chip status={run.status === "complete" ? "done" : "stuck"} />
        </div>

        <div className="margin" />
        <section className="col-field record-section" aria-labelledby="run-results-heading">
          <h3 id="run-results-heading">Saved results and formulas</h3>
          {run.monthlyCostResult ? (
            <>
              <div className="underwriting-summary-band">
                {Object.entries(run.monthlyCostResult.totalsByCategory).map(([category, amount]) => <div key={category}><span className="t-label">{categoryLabel(category)}</span><strong className="num">{MONEY.format(amount)}</strong></div>)}
                <div><span className="t-label">Total Uses</span><strong className="num">{MONEY.format(run.monthlyCostResult.totalUses)}</strong></div>
              </div>
              <div className="underwriting-results-wrap">
                <table className="underwriting-monthly-table">
                  <thead><tr><th>Month</th>{run.monthlyCostResult.costLineSchedules.map((line) => <th className="right" key={line.lineId}>{line.name}</th>)}<th className="right">Total Uses</th></tr></thead>
                  <tbody>{run.monthlyCostResult.months.map((month) => <tr key={month.month}><th scope="row" className="num">{month.month}</th>{run.monthlyCostResult!.costLineSchedules.map((line) => <td className="num right" key={line.lineId}>{MONEY.format(month.lineAmounts[line.lineId])}</td>)}<td className="num right">{MONEY.format(month.totalUses)}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Cost Line</th><th>Formula Trace</th><th>Inputs Used</th></tr></thead>
                  <tbody>{run.monthlyCostResult.costLineSchedules.map((line) => <tr key={line.lineId}><th scope="row">{line.name}</th><td>{line.formulaTrace}</td><td className="t-meta">{line.inputPaths.join(", ")}</td></tr>)}</tbody>
                </table>
              </div>
              <div className="underwriting-results-wrap">
                <table className="underwriting-results">
                  <thead><tr><th>Check</th><th>Status</th><th className="right">Expected</th><th className="right">Actual</th><th className="right">Difference</th></tr></thead>
                  <tbody>{run.reconciliations.map((check) => <tr key={check.id}><th scope="row">{check.label}</th><td><Chip status={check.status === "pass" ? "done" : "stuck"} /></td><td className="num right">{MONEY.format(check.expected)}</td><td className="num right">{MONEY.format(check.actual)}</td><td className="num right">{MONEY.format(check.difference)}</td></tr>)}</tbody>
                </table>
              </div>
            </>
          ) : run.results.length > 0 ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-results">
                <thead>
                  <tr><th>Result</th><th className="right">Value</th><th>Formula trace</th><th>Inputs used</th></tr>
                </thead>
                <tbody>
                  {run.results.map((result) => (
                    <tr key={result.key}>
                      <td>{result.label}</td>
                      <td className="num right">{formatResult(result.value, result.unit)}</td>
                      <td>{result.formula}</td>
                      <td className="t-meta">{result.inputKeys.map((key) => UNDERWRITING_INPUT_LABELS[key]).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="t-meta underwriting-history-note">This run saved no financial results.</p>}
          <div className="underwriting-limitations" aria-labelledby="run-limitations-heading">
            <h4 id="run-limitations-heading">Model limits</h4>
            <ul>{(run.monthlyCostResult ? [
              "This formula version schedules development costs only.",
              "Lease-up, funding, sale proceeds, and property returns follow in later formula versions.",
              "This run does not record a finance approval.",
            ] : UNDERWRITING_LIMITATIONS).map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </section>

        <div className="margin" />
        <section className="col-field record-section" aria-labelledby="run-inputs-heading">
          <h3 id="run-inputs-heading">Full calculation input snapshot</h3>
          {isMonthlySnapshot(run.inputSnapshot) ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-snapshot">
                <thead><tr><th>Analysis Start</th><th>Sale Month</th><th className="right">Cost Lines</th></tr></thead>
                <tbody><tr><td className="num">{run.inputSnapshot.analysisStartMonth}</td><td className="num">{run.inputSnapshot.saleMonth}</td><td className="num right">{run.inputSnapshot.costLines.length}</td></tr></tbody>
              </table>
              <table className="underwriting-cost-lines">
                <thead><tr><th>Cost Line</th><th>Category</th><th className="right">Amount</th><th>Start</th><th>End</th><th>Distribution</th><th>Version</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead>
                <tbody>{run.inputSnapshot.costLines.map((line) => <tr key={line.id}><th scope="row">{line.name}</th><td>{categoryLabel(line.category)}</td><td className="num right">{MONEY.format(line.amount)}</td><td className="num">{line.startMonth}</td><td className="num">{line.endMonth}</td><td>{line.distributionMethod === "straight_line" ? "Straight-line" : "S-curve"}</td><td className="num">{line.distributionVersion}</td><td>{line.sourceLabel || "Missing"}</td><td className="num">{line.sourceDate || "Missing"}</td><td><Chip status={line.reviewState} /></td></tr>)}</tbody>
              </table>
            </div>
          ) : <div className="underwriting-results-wrap">
            <table className="underwriting-snapshot">
              <thead><tr><th>Input</th><th className="right">Saved value</th><th>Unit</th></tr></thead>
              <tbody>
                {UNDERWRITING_INPUT_KEYS.map((key) => (
                  <tr key={key}>
                    <th scope="row">{UNDERWRITING_INPUT_LABELS[key]}</th>
                    <td className="num right">{run.inputSnapshot[key] === undefined ? "Missing" : NUMBER.format(run.inputSnapshot[key])}</td>
                    <td className="t-meta">{INPUT_UNITS[key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </section>

        <div className="margin" />
        <section className="col-field record-section" aria-labelledby="run-evidence-heading">
          <h3 id="run-evidence-heading">Saved evidence snapshot</h3>
          <dl className="underwriting-evidence-facts">
            <div><dt>Case record ID</dt><dd className="num">{run.evidenceSnapshot.caseId}</dd></div>
            <div><dt>Sheet number</dt><dd className="num">{run.evidenceSnapshot.sheetNumber}</dd></div>
            <div><dt>Case number</dt><dd className="num">{run.evidenceSnapshot.caseNumber}</dd></div>
            <div><dt>Case name</dt><dd>{run.evidenceSnapshot.name}</dd></div>
            <div><dt>Property address</dt><dd>{run.evidenceSnapshot.address}</dd></div>
            <div><dt>Development type</dt><dd>Ground-up multifamily</dd></div>
            <div><dt>Saved case status</dt><dd>{run.evidenceSnapshot.status}</dd></div>
            <div><dt>Case revision</dt><dd className="num">{run.evidenceSnapshot.caseRevision}</dd></div>
            <div><dt>Proposed units</dt><dd className="num">{formatOptional(run.evidenceSnapshot.proposedUnits)}</dd></div>
            <div><dt>Average unit size</dt><dd className="num">{formatOptional(run.evidenceSnapshot.averageUnitSquareFeet, " SF")}</dd></div>
            <div><dt>Gross building area</dt><dd className="num">{formatOptional(run.evidenceSnapshot.grossBuildingSquareFeet, " GSF")}</dd></div>
            <div><dt>Case created</dt><dd className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.createdAt))}</dd></div>
            <div><dt>Case updated</dt><dd className="num">{DATE_TIME.format(new Date(run.evidenceSnapshot.updatedAt))}</dd></div>
          </dl>
          <div className="underwriting-results-wrap">
            <table className="underwriting-evidence">
              <thead>
                <tr><th>Project fact</th><th>Source label</th><th>Source date</th><th>Review state</th><th>Evidence changed</th><th>Case revision</th></tr>
              </thead>
              <tbody>
                {Object.entries(FACT_DEFINITIONS).map(([name, definition]) => {
                  const evidence = run.evidenceSnapshot.factMetadata[name as keyof typeof FACT_DEFINITIONS];
                  return (
                    <tr key={name}>
                      <th scope="row">{definition.label}</th>
                      <td>{evidence?.sourceLabel || "Missing"}</td>
                      <td className="num">{evidence?.sourceDate ? DATE.format(new Date(`${evidence.sourceDate}T00:00:00.000Z`)) : "Missing"}</td>
                      <td>{evidence ? <Chip status={evidence.reviewState} /> : "Missing"}</td>
                      <td className="num">{evidence ? DATE_TIME.format(new Date(evidence.lastChangedAt)) : "Missing"}</td>
                      <td className="num">{evidence?.caseRevision ?? "Missing"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {run.evidenceSnapshot.costSchedule ? (
            <div className="underwriting-results-wrap">
              <table className="underwriting-evidence">
                <thead><tr><th>Saved Cost Line</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Evidence Changed</th></tr></thead>
                <tbody>{run.evidenceSnapshot.costSchedule.costLines.map((line) => <tr key={line.id}><th scope="row">{line.name}</th><td>{line.sourceLabel || "Missing"}</td><td className="num">{line.sourceDate || "Missing"}</td><td><Chip status={line.reviewState} /></td><td className="num">{DATE_TIME.format(new Date(line.lastChangedAt))}</td></tr>)}</tbody>
              </table>
            </div>
          ) : null}
          <div className="underwriting-results-wrap">
            <table className="underwriting-evidence">
              <thead>
                <tr><th>Assumption</th><th className="right">Value</th><th>Source type</th><th>Source label</th><th>Source date</th><th>Review state</th><th>Value changed</th></tr>
              </thead>
              <tbody>
                {run.evidenceSnapshot.assumptions.map((assumption) => (
                  <tr key={assumption.name}>
                    <th scope="row">{assumption.label}</th>
                    <td className="num right">{NUMBER.format(assumption.value)} <span className="t-meta">{assumption.unit}</span></td>
                    <td>User supplied</td>
                    <td>{assumption.sourceLabel || "Missing"}</td>
                    <td className="num">{assumption.sourceDate ? DATE.format(new Date(`${assumption.sourceDate}T00:00:00.000Z`)) : "Missing"}</td>
                    <td><Chip status={assumption.reviewState} /></td>
                    <td className="num">{DATE_TIME.format(new Date(assumption.lastChangedAt))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="margin" />
        <section className="col-field record-section" aria-labelledby="run-issues-heading">
          <h3 id="run-issues-heading">Saved calculation issues</h3>
          {run.issues.length > 0 ? (
            <div className="underwriting-issues">
              {run.issues.map((issue) => (
                <div className="underwriting-issue underwriting-issue--stuck" key={`${issuePath(issue)}-${issue.code}`}>
                  <span className="dot" aria-hidden="true" />
                  <span><span className="em">{issueLabel(issue)}:</span> {issue.message}</span>
                </div>
              ))}
            </div>
          ) : <p className="t-meta underwriting-history-note">This run saved no calculation issues.</p>}
        </section>
      </div>
    </Sheet>
  );
}

function formatResult(value: number, unit: "usd" | "decimal") {
  return unit === "usd" ? MONEY.format(value) : `${NUMBER.format(value * 100)}%`;
}

function formatOptional(value: number | undefined, suffix = "") {
  return value === undefined ? "Missing" : `${NUMBER.format(value)}${suffix}`;
}

function isMonthlySnapshot(snapshot: unknown): snapshot is MonthlyCostScheduleInputs {
  return Boolean(snapshot && typeof snapshot === "object" && "costLines" in snapshot);
}

function issuePath(issue: { inputKey?: string; path?: string }) {
  return issue.inputKey ?? issue.path ?? "calculation";
}

function issueLabel(issue: { inputKey?: string; path?: string }) {
  if (issue.inputKey) {
    return UNDERWRITING_INPUT_LABELS[issue.inputKey as keyof typeof UNDERWRITING_INPUT_LABELS] ?? issue.inputKey;
  }
  return issue.path ?? "Calculation";
}

function categoryLabel(category: string) {
  return ({ land: "Land", hard_cost: "Hard Cost", soft_cost: "Soft Cost", development_fee: "Development Fee", financing_fee: "Financing Fee" } as Record<string, string>)[category] ?? category;
}
