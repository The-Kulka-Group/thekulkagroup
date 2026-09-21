import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listRuns } from "@/lib/rom/run-records";

// Past runs, newest first (LA-16). The audit trail is the point, so a failed
// run is listed beside a finished one rather than hidden.

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const asked = Number(new URL(request.url).searchParams.get("limit"));
  const limit =
    Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_LIMIT) : DEFAULT_LIMIT;

  return NextResponse.json({ runs: await listRuns(getDb(), limit) });
}
