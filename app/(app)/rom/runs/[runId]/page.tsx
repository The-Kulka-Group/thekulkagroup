import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { RunNotFound, getRun } from "@/lib/rom/run-records";
import { isUuid } from "@/lib/uuid";
import { RunView } from "./RunView";

export const dynamic = "force-dynamic";

// One ROM run, reopened. The server reads the record and hands it to the client
// view, which keeps it current while the run is still going.
export default async function RomRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!isUuid(runId)) notFound();

  let run;
  try {
    run = await getRun(getDb(), runId);
  } catch (cause) {
    if (cause instanceof RunNotFound) notFound();
    throw cause;
  }

  return <RunView initialRun={run} />;
}
