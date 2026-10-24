import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { SCHEDULED_RUNNERS } from "@/lib/sources/runners";
import { runDueSources } from "@/lib/sources/schedule";

// LA-3049. The one refresh schedule (vercel.json, hourly). It runs each source
// in data_sources whose interval has passed; the row, not this route, says how
// often. Vercel sends `Authorization: Bearer $CRON_SECRET`. It replaces the
// daily meetings cron (LA-2279, LA-2283, LA-2911).

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (
    !secret ||
    Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  return NextResponse.json({ sources: await runDueSources(getDb(), SCHEDULED_RUNNERS) });
}
