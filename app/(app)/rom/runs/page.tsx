import Link from "next/link";

import { Sheet, Sep } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import { listRuns } from "@/lib/rom/run-records";
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
      title="ROM runs"
      actions={
        <Link className="btn btn--secondary" href="/rom">
          Back to the conceptual budget
        </Link>
      }
      meta={
        <>
          <span>{runs.length === 1 ? "1 run" : `${runs.length} runs`}</span>
          <Sep />
          <span>newest first</span>
          {running ? (
            <>
              <Sep />
              <span className="num">{running} going now</span>
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
                  <Link href={`/rom/runs/${run.id}`}>{run.id.slice(0, 8)}</Link>
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
