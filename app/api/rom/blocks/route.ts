import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { RunBoardNotFound, readRunBoard } from "@/lib/rom/board";
import { isUuid } from "@/lib/uuid";

// The block board payload (LA-884): every block of a finished run grouped by
// its level of detail, with its element, its division, its buyout package and
// its breakout parent carried, level subtotals separating what adds to the
// total from what is carved out, and the element rollups. Read only.

const missing = () => NextResponse.json({ error: "Run not found." }, { status: 404 });

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const runId = new URL(request.url).searchParams.get("runId") ?? "";
  if (!isUuid(runId)) return missing();

  try {
    return NextResponse.json({ board: await readRunBoard(getDb(), runId) });
  } catch (cause) {
    if (cause instanceof RunBoardNotFound) return missing();
    throw cause;
  }
}
