import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { runLeaveOneOutBacktest } from "@/lib/rom/backtest";

// The leave-one-out backtest report (LA-23). It reads and never writes, so a
// GET is the right verb and asking twice costs nothing but the reads.
export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json({ backtest: await runLeaveOneOutBacktest(getDb()) });
}
