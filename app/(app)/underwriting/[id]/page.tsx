import Link from "next/link";
import { notFound } from "next/navigation";

import { Sheet, Sep } from "@/components/Sheet";
import { Chip } from "@/components/Status";
import { getDb } from "@/lib/db";
import { getUnderwritingCase } from "@/lib/underwriting/cases";
import { getLatestUnderwritingRun } from "@/lib/underwriting/runs";

import { RunUnderwriting } from "./RunUnderwriting";

export const dynamic = "force-dynamic";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const MONEY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function UnderwritingCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const savedCase = await getUnderwritingCase(getDb(), id);
  if (!savedCase) notFound();
  const latestRun = await getLatestUnderwritingRun(getDb(), id);

  const missingFacts = [
    savedCase.proposedUnits,
    savedCase.averageUnitSquareFeet,
    savedCase.grossBuildingSquareFeet,
  ].filter((value) => value === undefined).length;

  return (
    <Sheet
      number={savedCase.sheetNumber}
      title={savedCase.name}
      actions={<Link className="btn btn--secondary" href="/underwriting">All cases</Link>}
      meta={
        <>
          <span>{savedCase.address}</span>
          <Sep />
          <span>Ground-up multifamily</span>
          <Sep />
          <span className="num">Updated {DATE.format(new Date(savedCase.updatedAt))}</span>
        </>
      }
      needsReview={latestRun?.status === "failed" ? latestRun.issues.length : missingFacts}
      reviewLabel={latestRun?.status === "failed" ? "calculation inputs need review" : "project facts missing"}
    >
      <div className="record underwriting-record">
        <div className="margin" />
        <div className="col-field underwriting-decision-row">
          <div>
            <span className="t-label">Current state</span>
            <h2 className="t-1">{decisionTitle(latestRun?.status)}</h2>
            <p className="t-meta">{decisionDetail(latestRun?.status)}</p>
          </div>
          <Chip status={savedCase.status} />
        </div>

        <div className="margin" />
        <div className="col-field record-section">
          <h3>Project facts</h3>
          <dl className="record-grid">
            <Fact label="Property address" value={savedCase.address} />
            <Fact label="Development type" value="Ground-up multifamily" />
            <Fact label="Proposed units" value={format(savedCase.proposedUnits)} number />
            <Fact label="Average unit size" value={format(savedCase.averageUnitSquareFeet, " SF")} number />
            <Fact label="Gross building area" value={format(savedCase.grossBuildingSquareFeet, " GSF")} number />
          </dl>
        </div>

        <div className="margin" />
        <div className="col-field record-section">
          <h3>Supplied assumptions</h3>
          {savedCase.assumptions.length === 0 ? (
            <div className="empty empty--inline"><p>No financial assumptions were supplied.</p></div>
          ) : (
            <table className="underwriting-assumptions">
              <thead>
                <tr><th>Assumption</th><th className="right">Value</th><th>Source</th><th>Date</th></tr>
              </thead>
              <tbody>
                {savedCase.assumptions.map((assumption) => (
                  <tr key={assumption.key}>
                    <td>{assumption.label}</td>
                    <td className="num right">{formatAssumption(assumption.value, assumption.unit)}</td>
                    <td>{assumption.sourceLabel}</td>
                    <td className="num">{assumption.sourceDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="margin" />
        <div className="col-field record-section underwriting-results-section">
          <div className="underwriting-section-head">
            <div>
              <h3>Preliminary annual results</h3>
              <p className="t-meta">
                {latestRun
                  ? `${latestRun.formulaVersion} · Run ${DATE.format(new Date(latestRun.createdAt))}`
                  : "The deterministic model has not run for this case."}
              </p>
            </div>
            <RunUnderwriting caseId={savedCase.id} hasRun={Boolean(latestRun)} />
          </div>

          {!latestRun ? (
            <div className="empty empty--inline"><p>Run the calculation to create an immutable input snapshot.</p></div>
          ) : latestRun.status === "failed" ? (
            <div className="underwriting-issues" role="status">
              {latestRun.issues.map((issue) => (
                <div className="underwriting-issue" key={`${issue.inputKey}-${issue.code}`}>
                  <span className="dot dot--amber" />
                  <span>{issue.message}</span>
                </div>
              ))}
              <p className="t-meta">This run has no financial results. Its issues and input snapshot remain in the review record.</p>
            </div>
          ) : (
            <div className="underwriting-results-wrap">
              <table className="underwriting-results">
                <thead>
                  <tr><th>Result</th><th className="right">Value</th><th>Formula trace</th><th>Inputs used</th></tr>
                </thead>
                <tbody>
                  {latestRun.results.map((result) => (
                    <tr key={result.key}>
                      <td>{result.label}</td>
                      <td className="num right">{formatResult(result.value, result.unit)}</td>
                      <td>{result.formula}</td>
                      <td className="t-meta">{result.inputKeys.map(inputLabel).join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

function decisionTitle(status?: "complete" | "failed") {
  if (status === "complete") return "Preliminary annual results are ready for review.";
  if (status === "failed") return "The calculation needs more input.";
  return "The case has not been calculated.";
}

function decisionDetail(status?: "complete" | "failed") {
  if (status === "complete") return "These results apply the listed formula version to the saved input snapshot.";
  if (status === "failed") return "The failed run remains on record and makes no financial claim.";
  return "No financial result exists until the deterministic calculation runs.";
}

function Fact({ label, value, number = false }: { label: string; value: string; number?: boolean }) {
  return <div className="record-row"><dt className="t-label">{label}</dt><dd className={number ? "num" : undefined}>{value}</dd></div>;
}

function format(value?: number, suffix = "") {
  return value === undefined ? "Needs input" : `${NUMBER.format(value)}${suffix}`;
}

function formatAssumption(value: number, unit: string) {
  if (unit === "usd") return MONEY.format(value);
  if (unit === "usd_per_month") return `${MONEY.format(value)}/month`;
  if (unit === "usd_per_gross_square_foot") return `${MONEY.format(value)}/GSF`;
  if (unit === "percent") return `${NUMBER.format(value)}%`;
  return `${NUMBER.format(value)} ${unit}`;
}

function formatResult(value: number, unit: "usd" | "decimal") {
  return unit === "usd" ? MONEY.format(value) : `${NUMBER.format(value * 100)}%`;
}

const INPUT_LABELS: Record<string, string> = {
  grossBuildingSquareFeet: "Gross building area",
  proposedUnits: "Proposed units",
  purchasePrice: "Purchase price",
  monthlyRent: "Average monthly rent",
  hardCostPerGrossSquareFoot: "Hard cost per GSF",
  softCostPercent: "Soft cost percent",
  contingencyPercent: "Contingency percent",
  vacancyPercent: "Vacancy percent",
  operatingExpensePercent: "Operating expense percent",
  debtPercent: "Debt percent",
  interestRatePercent: "Interest rate percent",
  exitCapRatePercent: "Exit cap rate",
};

function inputLabel(key: string) {
  return INPUT_LABELS[key] ?? key;
}
