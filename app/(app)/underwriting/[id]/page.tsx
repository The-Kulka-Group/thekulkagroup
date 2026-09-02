import Link from "next/link";
import { notFound } from "next/navigation";

import { Sheet, Sep } from "@/components/Sheet";
import { Chip } from "@/components/Status";
import { getDb } from "@/lib/db";
import { getUnderwritingCase } from "@/lib/underwriting/cases";
import {
  buildUnderwritingReviewItems,
  UNDERWRITING_INPUT_LABELS,
  UNDERWRITING_LIMITATIONS,
} from "@/lib/underwriting/presentation";
import {
  countUnderwritingRuns,
  getLatestUnderwritingRun,
  listUnderwritingRuns,
} from "@/lib/underwriting/runs";

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
const RUNS_PER_PAGE = 20;

export default async function UnderwritingCasePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ runPage?: string | string[] }>;
}) {
  const { id } = await params;
  const savedCase = await getUnderwritingCase(getDb(), id);
  if (!savedCase) notFound();

  const requestedPage = pageNumber((await searchParams).runPage);
  const [latestRun, runCount] = await Promise.all([
    getLatestUnderwritingRun(getDb(), id),
    countUnderwritingRuns(getDb(), id),
  ]);
  const pageCount = Math.max(1, Math.ceil(runCount / RUNS_PER_PAGE));
  const runPage = Math.min(requestedPage, pageCount);
  const runs = await listUnderwritingRuns(getDb(), id, RUNS_PER_PAGE, (runPage - 1) * RUNS_PER_PAGE);
  const currentRun = latestRun?.caseRevision === savedCase.caseRevision ? latestRun : undefined;
  const reviewItems = buildUnderwritingReviewItems(savedCase, currentRun, runCount > 0);

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
      needsReview={reviewItems.length}
      reviewLabel="items need review"
    >
      <div className="record underwriting-record">
        <div className="margin" />
        <div className="col-field underwriting-decision-row">
          <div>
            <span className="t-label">Current state</span>
            <h2 className="t-1">{decisionTitle(currentRun?.status, runCount > 0)}</h2>
            <p className="t-meta">{decisionDetail(currentRun?.status, runCount > 0)}</p>
          </div>
          <Chip status={savedCase.status} />
        </div>

        {reviewItems.length > 0 ? (
          <>
            <div className="margin" />
            <section className="col-field underwriting-attention" aria-labelledby="underwriting-review-heading">
              <div className="underwriting-section-head">
                <div>
                  <h3 id="underwriting-review-heading">Needs your review</h3>
                  <p className="t-meta">This list includes case facts, calculation issues, source gaps, and working assumptions.</p>
                </div>
                <span className="chip chip--neutral"><span className="dot" /><span className="num">{reviewItems.length}</span> need review</span>
              </div>
              <div className="underwriting-issues">
                {reviewItems.map((item) => (
                  <div className={`underwriting-issue underwriting-issue--${item.severity}`} key={item.id}>
                    <span className="dot" aria-hidden="true" />
                    <span>{item.message}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        ) : null}

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
                {currentRun
                  ? `${currentRun.formulaVersion} · Run ${DATE.format(new Date(currentRun.createdAt))}`
                  : runCount > 0
                    ? "The case changed after the latest run and needs recalculation."
                    : "The deterministic model has not run for this case."}
              </p>
            </div>
            <RunUnderwriting
              caseId={savedCase.id}
              caseRevision={savedCase.caseRevision}
              hasRun={Boolean(currentRun)}
            />
          </div>

          {!currentRun ? (
            <div className="empty empty--inline">
              <p>{runCount > 0
                ? "Recalculate this case revision before reviewing financial results. Prior runs remain in the history."
                : "Run the calculation to create an immutable input snapshot."}</p>
            </div>
          ) : currentRun.status === "failed" ? (
            <div className="underwriting-issues" role="status">
              {currentRun.issues.map((issue) => (
                <div className="underwriting-issue underwriting-issue--stuck" key={`${issue.inputKey}-${issue.code}`}>
                  <span className="dot" aria-hidden="true" />
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
                  {currentRun.results.map((result) => (
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

          <div className="underwriting-limitations" aria-labelledby="underwriting-limitations-heading">
            <h4 id="underwriting-limitations-heading">Model limits</h4>
            <ul>
              {UNDERWRITING_LIMITATIONS.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </div>
        </div>

        {runCount > 0 ? (
          <>
            <div className="margin" />
            <div className="col-field record-section" id="calculation-history">
              <h3>Calculation history</h3>
              <p className="t-meta underwriting-history-note">
                Every saved run remains available. Open a run to inspect its full inputs, evidence, formulas, and issues.
              </p>
              <div className="underwriting-results-wrap">
                <table className="underwriting-history">
                  <thead>
                    <tr><th>Run</th><th>Date</th><th>Status</th><th>Input snapshot</th><th className="right">Captured result</th></tr>
                  </thead>
                  <tbody>
                    {runs.map((run) => {
                      const totalDevelopmentCost = run.results.find((result) => result.key === "totalDevelopmentCost");
                      const matchesCurrentRevision = run.caseRevision === savedCase.caseRevision;
                      return (
                        <tr key={run.id}>
                          <td>
                            <Link className="underwriting-history-link" href={`/underwriting/${savedCase.id}/runs/${run.id}`}>
                              {matchesCurrentRevision ? "Current revision" : `Revision ${run.caseRevision}`}
                            </Link>
                            <br /><span className="t-meta num">{run.id.slice(0, 8)}</span>
                          </td>
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
              {pageCount > 1 ? (
                <nav className="underwriting-pagination" aria-label="Calculation history pages">
                  {runPage > 1 ? <Link href={`?runPage=${runPage - 1}#calculation-history`}>Newer runs</Link> : <span />}
                  <span className="t-meta num">Page {runPage} of {pageCount}</span>
                  {runPage < pageCount ? <Link href={`?runPage=${runPage + 1}#calculation-history`}>Older runs</Link> : <span />}
                </nav>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function decisionTitle(status: "complete" | "failed" | undefined, hasRunHistory: boolean) {
  if (status === "complete") return "Preliminary annual results are ready for review.";
  if (status === "failed") return "The calculation needs more input.";
  if (hasRunHistory) return "The case changed and needs recalculation.";
  return "The case has not been calculated.";
}

function decisionDetail(status: "complete" | "failed" | undefined, hasRunHistory: boolean) {
  if (status === "complete") return "These results apply the listed formula version to this saved case revision.";
  if (status === "failed") return "The failed run remains on record and makes no financial claim.";
  if (hasRunHistory) return "Prior results do not match this case revision and are not current.";
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

function inputLabel(key: keyof typeof UNDERWRITING_INPUT_LABELS) {
  return UNDERWRITING_INPUT_LABELS[key] ?? key;
}

function pageNumber(value: string | string[] | undefined) {
  const parsed = Number(Array.isArray(value) ? value[0] : value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}
