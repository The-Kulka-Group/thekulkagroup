import Link from "next/link";
import { notFound } from "next/navigation";

import { Sheet, Sep } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import { RunBoardNotFound, readRunBoard } from "@/lib/rom/board";
import { listRuns } from "@/lib/rom/run-records";
import { isUuid } from "@/lib/uuid";
import { BlockBoard } from "./BlockBoard";

export const dynamic = "force-dynamic";

// The block board (LA-884). Every block a run produced, on one board, in rows
// by the level of detail its fact arrived at. The page reads a finished run and
// hands the board to the client view, which does the grouping and the tracing
// without storing the blocks a second time.
export default async function RomBlocksPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const { run } = await searchParams;

  const runId = run ?? (await newestFinishedRun());
  if (!runId) {
    return (
      <Sheet number="R-120" title="Block Board" meta={<span>No Finished Run</span>}>
        <p className="empty">
          No ROM has finished yet, so there are no blocks to show. Run one from the
          conceptual budget and come back.
        </p>
      </Sheet>
    );
  }
  if (!isUuid(runId)) notFound();

  let board;
  try {
    board = await readRunBoard(getDb(), runId);
  } catch (cause) {
    if (cause instanceof RunBoardNotFound) notFound();
    throw cause;
  }

  return (
    <Sheet
      number="R-120"
      title="Block Board"
      actions={
        <Link className="btn btn--secondary" href="/rom">
          Back to the Conceptual Budget
        </Link>
      }
      meta={
        <>
          <span>{board.projectName}</span>
          <Sep />
          <Link className="num" href={`/rom/runs/${board.runId}`}>
            run {board.runId.slice(0, 8)}
          </Link>
          <Sep />
          <span>levels are tiers of detail, not storeys</span>
        </>
      }
    >
      <BlockBoard board={board} />
    </Sheet>
  );
}

/** The board opens on the last run that finished, so the page works on its own. */
async function newestFinishedRun(): Promise<string | null> {
  const runs = await listRuns(getDb());
  return runs.find((one) => one.status === "succeeded")?.id ?? null;
}
