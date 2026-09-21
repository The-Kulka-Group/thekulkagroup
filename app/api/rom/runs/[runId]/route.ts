import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { RunNotFound, getRun } from "@/lib/rom/run-records";
import { isUuid } from "@/lib/uuid";

// One run with its steps, inputs and outputs (LA-16). The run page reads this
// while the run is going and again once it has stopped, so a run in flight and
// a finished one come back in the same shape.

type Context = { params: Promise<{ runId: string }> };
const missing = () => NextResponse.json({ error: "Run not found." }, { status: 404 });

export async function GET(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { runId } = await context.params;
  if (!isUuid(runId)) return missing();

  try {
    return NextResponse.json({ run: await getRun(getDb(), runId) });
  } catch (cause) {
    if (cause instanceof RunNotFound) return missing();
    throw cause;
  }
}
