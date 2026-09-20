import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listUnmappedLines } from "@/lib/rom/ingest";

// The cross-import review list LA-15's AC4 and AC5 name: every line, from
// any import, that could not be mapped to a canonical work item with
// confidence. Never promoted into a benchmark by an import's own approval
// (lib/rom/ingest.ts's approveCostImport leaves 'unmapped' lines alone);
// resolving one is a human task this ticket makes visible but does not
// itself build a workflow for.
export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({ lines: await listUnmappedLines(getDb()) });
}
