import Link from "next/link";
import { notFound } from "next/navigation";

import { Sheet, Sep } from "@/components/Sheet";
import { Chip } from "@/components/Status";
import { getDb } from "@/lib/db";
import { getUnderwritingCase } from "@/lib/underwriting/cases";
import { listUnderwritingRuns } from "@/lib/underwriting/runs";

import { EditUnderwritingCase } from "./EditUnderwritingCase";
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
  const runs = await listUnderwritingRuns(getDb(), id, 2);
  const latestRun = runs.find((run) => run.caseRevision === savedCase.caseRevision);

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
        <div className="col-field">
          <EditUnderwritingCase
            savedCase={savedCase}
            defaultSourceDate={new Date().toISOString().slice(0, 10)}
          />
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
            <RunUnderwriting
              caseId={savedCase.id}
              caseRevision={savedCase.caseRevision}
              hasRun={Boolean(latestRun)}
            />
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

        {runs.length > 0 ? (
          <>
            <div className="margin" />
            <div className="col-field record-section">
              <h3>Calculation history</h3>
              <p className="t-meta underwriting-history-note">
                Each row is a saved run. Editing the case creates a new row and leaves prior snapshots unchanged.
              </p>
              <div className="underwriting-results-wrap">
                <table className="underwriting-history">
                  <thead>
                    <tr><th>Run</th><th>Date</th><th>Status</th><th>Input snapshot</th><th className="right">Captured result</th></tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => {
                      const totalDevelopmentCost = run.results.find((result) => result.key === "totalDevelopmentCost");
                      return (
                        <tr key={run.id}>
                          <td><span className="em">{run.caseRevision === savedCase.caseRevision ? "Current" : "Prior"}</span><br /><span className="t-meta num">{run.id.slice(0, 8)}</span></td>
                          <td className="num">{DATE.format(new Date(run.createdAt))}</td>
                          <td><Chip status={run.status === "complete" ? "done" : "stuck"} /></td>
                          <td className="t-meta">{snapshotSummary(run.inputSnapshot)}</td>
                          <td className="num right">{totalDevelopmentCost ? formatResult(totalDevelopmentCost.value, totalDevelopmentCost.unit) : `${run.issues.length} inputs need review`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : null}
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

function formatResult(value: number, unit: "usd" | "decimal") {
  return unit === "usd" ? MONEY.format(value) : `${NUMBER.format(value * 100)}%`;
}

function snapshotSummary(snapshot: {
  grossBuildingSquareFeet?: number;
  proposedUnits?: number;
  purchasePrice?: number;
  monthlyRent?: number;
}) {
  const parts = [
    snapshot.grossBuildingSquareFeet === undefined ? null : `${NUMBER.format(snapshot.grossBuildingSquareFeet)} GSF`,
    snapshot.proposedUnits === undefined ? null : `${NUMBER.format(snapshot.proposedUnits)} units`,
    snapshot.purchasePrice === undefined ? null : `${MONEY.format(snapshot.purchasePrice)} purchase`,
    snapshot.monthlyRent === undefined ? null : `${MONEY.format(snapshot.monthlyRent)}/month rent`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "No calculation inputs were supplied.";
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
