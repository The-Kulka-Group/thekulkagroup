import Link from "next/link";

import type { BacktestLine, BacktestPredictedStatus, BacktestProjectResult } from "@kulka/engine";

import { Sheet, Sep } from "@/components/Sheet";
import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { titleCase } from "@/lib/format/title-case";
import { runLeaveOneOutBacktest, type BacktestResult } from "@/lib/rom/backtest";

import "./backtest.css";

export const dynamic = "force-dynamic";

// The leave-one-out backtest (LA-23). Every figure on this page comes from
// lib/rom/backtest.ts, which reads the database and never writes to it.

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const WHOLE = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function money(value: number): string {
  return MONEY.format(value);
}

function percent(value: number | null): string {
  if (value === null) return "n/a";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

const STATUS_WORDS: Record<BacktestPredictedStatus, string> = {
  priced: "Priced",
  not_in_job: "Not in This Job",
  tbd: "TBD",
  breakout: "Breakout, Inside Its Lump",
  not_predicted: "No Other Job Has It",
};

function presenceWords(line: BacktestLine): string {
  if (line.presence === "predicted_only") return "ROM Only";
  if (line.presence === "budget_only") return "Budget Only";
  return "Both";
}

function ResultChip({ project }: { project: BacktestProjectResult }) {
  if (!project.scored) {
    return (
      <span className="chip chip--neutral">
        <span className="dot" />
        Not Scored
      </span>
    );
  }
  return (
    <span className={`chip chip--${project.passed ? "done" : "stuck"}`}>
      <span className="dot" />
      {project.passed ? "Pass" : "Fail"}
    </span>
  );
}

function pricedFromWords(project: BacktestProjectResult, names: Record<string, string>): string {
  if (project.pricedFrom.length === 0) return "no other job";
  return project.pricedFrom.map((id) => names[id] ?? id.slice(0, 8)).join(", ");
}

function LineTable({ lines }: { lines: BacktestLine[] }) {
  return (
    <div className="bt-scroll">
      <table className="bt-table">
        <thead>
          <tr>
            <th>Code</th>
            <th>Line</th>
            <th>ROM</th>
            <th className="right">Predicted Range</th>
            <th className="right">Midpoint</th>
            <th className="right">Budget</th>
            <th className="right">Error</th>
            <th className="right">Error %</th>
            <th>In Range</th>
            <th>Sides</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr
              className={line.countsInPredictedTotal || line.countsInActualTotal ? "" : "bt-muted"}
              key={line.costCode}
            >
              <td className="num">{line.costCode}</td>
              <td className="bt-label">{titleCase(line.label)}</td>
              <td>{STATUS_WORDS[line.predictedStatus]}</td>
              <td className="num right">
                {money(line.predicted.low)} to {money(line.predicted.high)}
              </td>
              <td className="num right">{money(line.predicted.midpoint)}</td>
              <td className="num right">{money(line.actual)}</td>
              <td className="num right">{money(line.error)}</td>
              <td className="num right">{percent(line.errorPercent)}</td>
              <td>{line.insideRange ? "Yes" : "No"}</td>
              <td>{presenceWords(line)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Report({ report }: { report: BacktestResult }) {
  const names = report.projectNames;
  const bar = report.passBarPercent;

  if (report.projectCount === 0) {
    return (
      <p className="empty">
        No job has an approved cost import yet, so there is nothing to backtest. Approve a
        budget on the cost imports page and it will show here.
      </p>
    );
  }

  return (
    <>
      <div className="bt-headline">
        <h2 className="num">
          {report.passingCount} of {report.projectCount} {report.projectCount === 1 ? "job" : "jobs"} within{" "}
          {bar}%
        </h2>
        <div className="bt-stats">
          <span className="num">{report.scoredCount} scored</span>
          <span className="num">
            mean absolute error{" "}
            {report.meanAbsoluteErrorPercent === null ? "n/a" : `${report.meanAbsoluteErrorPercent.toFixed(1)}%`}
          </span>
          {report.meanAbsoluteErrorDollars === null ? null : (
            <span className="num">{money(report.meanAbsoluteErrorDollars)} off on average</span>
          )}
        </div>
      </div>

      <section className="bt-section">
        <h3>Jobs</h3>
        <div className="bt-scroll">
          <table className="bt-table">
            <thead>
              <tr>
                <th>Project</th>
                <th className="right">GSF</th>
                <th className="right">Predicted Range</th>
                <th className="right">Midpoint</th>
                <th className="right">Budget Trade Cost</th>
                <th className="right">Error %</th>
                <th>Result</th>
                <th>In Range</th>
              </tr>
            </thead>
            <tbody>
              {report.projects.map((project) => (
                <tr key={project.projectId}>
                  <td className="bt-label">{project.projectName}</td>
                  <td className="num right">{WHOLE.format(project.grossSquareFeet)}</td>
                  <td className="num right">
                    {money(project.predicted.low)} to {money(project.predicted.high)}
                  </td>
                  <td className="num right">{money(project.predicted.midpoint)}</td>
                  <td className="num right">{money(project.actual)}</td>
                  <td className="num right">{percent(project.errorPercent)}</td>
                  <td>
                    <ResultChip project={project} />
                  </td>
                  <td>{project.error ? "n/a" : project.insideRange ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bt-section">
        <h3>Lines by Job, Largest Miss First</h3>
        {report.projects.map((project) => (
          <details className="bt-project" key={project.projectId}>
            <summary>
              {project.projectName}
              <span className="bt-summary-meta num">
                {project.lines.length} {project.lines.length === 1 ? "line" : "lines"}
              </span>
            </summary>
            <p className="bt-note">Priced from {pricedFromWords(project, names)}.</p>
            {project.error ? <p className="bt-note">The engine could not budget this job: {project.error}</p> : null}
            {project.unscoredReason && !project.error ? (
              <p className="bt-note">Not scored. {project.unscoredReason}</p>
            ) : null}
            {project.lines.length > 0 ? <LineTable lines={project.lines} /> : null}
          </details>
        ))}
      </section>

      <section className="bt-section">
        <h3>Worst Misses</h3>
        {report.worstMisses.length === 0 ? (
          <p className="bt-note">No line has a miss yet.</p>
        ) : (
          <ol className="bt-misses">
            {report.worstMisses.map((miss) => (
              <li key={`${miss.projectId}-${miss.line.costCode}`}>
                <span className="num">{money(Math.abs(miss.line.error))}</span>{" "}
                {miss.line.error > 0 ? "high" : "low"} on {miss.line.costCode} {miss.line.label}, {miss.projectName}.
                The ROM said <span className="num">{money(miss.line.predicted.midpoint)}</span> and the budget
                carried <span className="num">{money(miss.line.actual)}</span>.
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="bt-section">
        <h3>How this is measured</h3>
        <p className="bt-note">
          Each job is priced by the engine from its own project record, with every benchmark it stands
          behind taken out first, so a job is never priced from its own budget. The result is compared to
          that job&apos;s own approved budget lines times its gross square feet.
        </p>
        <p className="bt-note">
          Trade cost is the ROM&apos;s total: every counted line, owner-direct scope included, before General
          Conditions, fee and insurance. The budget side is the job&apos;s approved import lines, owner-direct
          included, with lines routed to GRs/GCs left out. A job passes when the ROM&apos;s midpoint lands
          within {bar}% of its budget trade cost (ADR 0005). A ROM that carries TBD lines is not scored,
          because the budget included that scope.
        </p>
        <p className="bt-note">
          This rests on {report.projectCount} {report.projectCount === 1 ? "job" : "jobs"}. No Kulka job has
          closed, so the target is each job&apos;s budget, not its final cost.
        </p>
        <ul className="bt-misses">
          {report.projects.map((project) => (
            <li key={project.projectId}>
              {project.projectName} was priced from {pricedFromWords(project, names)}.
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export default async function RomBacktestPage() {
  const auth = await authorizeRequest();
  const report = auth.ok ? await runLeaveOneOutBacktest(getDb()) : null;

  return (
    <Sheet
      number="R-130"
      title="Backtest"
      actions={
        <Link className="btn btn--secondary" href="/rom">
          Back to the conceptual budget
        </Link>
      }
      meta={
        report ? (
          <>
            <span>
              {report.projectCount === 1 ? "1 job" : `${report.projectCount} jobs`}, leave one out
            </span>
            <Sep />
            <span className="num">data {report.snapshotHash.slice(0, 8)}</span>
          </>
        ) : (
          <span>leave one out</span>
        )
      }
    >
      {report ? (
        <Report report={report} />
      ) : (
        <p className="empty">Sign in with an authorized account to see the backtest.</p>
      )}
    </Sheet>
  );
}
