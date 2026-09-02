import Link from "next/link";
import { notFound } from "next/navigation";

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
          {run.results.length > 0 ? (
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
            <ul>{UNDERWRITING_LIMITATIONS.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        </section>

        <div className="margin" />
        <section className="col-field record-section" aria-labelledby="run-inputs-heading">
          <h3 id="run-inputs-heading">Full calculation input snapshot</h3>
          <div className="underwriting-results-wrap">
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
          </div>
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
                <div className="underwriting-issue underwriting-issue--stuck" key={`${issue.inputKey}-${issue.code}`}>
                  <span className="dot" aria-hidden="true" />
                  <span><span className="em">{UNDERWRITING_INPUT_LABELS[issue.inputKey as keyof typeof UNDERWRITING_INPUT_LABELS] ?? issue.inputKey}:</span> {issue.message}</span>
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
