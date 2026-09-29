import Link from "next/link";

import { Sheet, Sep } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import { listRuns } from "@/lib/rom/run-records";
import { runName } from "../saved-runs";
import { RUN_STATUS_CHIP, RUN_STATUS_LABEL, formatTime } from "./run-presentation";

export const dynamic = "force-dynamic";

// Past ROM runs (LA-16). Every run is a record of what the engine did, so a
// failed run is listed beside a finished one and either can be reopened.
export default async function RomRunsPage() {
  const runs = await listRuns(getDb());
  const running = runs.filter((run) => run.status === "running").length;

  return (
    <Sheet
      number="R-110"
      title="ROM Runs"
      actions={
        <Link className="btn btn--secondary" href="/rom">
          Back to the Conceptual Budget
        </Link>
      }
      meta={
        <>
          <span>{runs.length === 1 ? "1 Run" : `${runs.length} Runs`}</span>
          <Sep />
          <span>Newest First</span>
          {running ? (
            <>
              <Sep />
              <span className="num">{running} Going Now</span>
            </>
          ) : null}
        </>
      }
    >
      {runs.length === 0 ? (
        <p className="empty">No ROM has run yet, so there is nothing to reopen.</p>
      ) : (
        <table className="board">
          <thead>
            <tr>
              <th>Run</th>
              <th>Project</th>
              <th>Started</th>
              <th>Finished</th>
              <th className="right">Steps</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr className={`row${run.status === "failed" ? " row--stuck" : ""}`} key={run.id}>
                <td className="num">
                  <Link href={`/rom/runs/${run.id}`} title={`Run ${run.id}`}>
                    {runName(run.startedAt, run.answerCount)}
                  </Link>
                </td>
                <td>{run.projectName}</td>
                <td className="num">{formatTime(run.startedAt)}</td>
                <td className="num">{formatTime(run.finishedAt)}</td>
                <td className="num right">{run.stepCount}</td>
                <td>
                  <span className={`chip chip--${RUN_STATUS_CHIP[run.status]}`}>
                    <span className="dot" />
                    {RUN_STATUS_LABEL[run.status]}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Sheet>
  );
}
