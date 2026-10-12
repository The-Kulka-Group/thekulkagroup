import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { AutodeskError, autodeskSettings } from "@/lib/jobs/autodesk";
import { syncJobs } from "@/lib/jobs/sync";
import { FirefliesError, firefliesKey, firefliesReader } from "@/lib/meetings/fireflies";
import { briefClient } from "@/lib/meetings/brief";
import { backfillMeetings, briefPending } from "@/lib/meetings/sync";

// LA-2279. The scheduled pull (vercel.json), the main path for meetings the
// webhook never reports. Vercel sends `Authorization: Bearer $CRON_SECRET`.
// LA-2283: it refreshes the Autodesk job list first, when Autodesk is set up.

export const maxDuration = 300;

const DAYS = 3;

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
  const jobs = await refreshJobs();
  const key = firefliesKey();
  if (!key) return NextResponse.json({ error: "Fireflies is not set up.", jobs }, { status: 503 });
  try {
    const result = await backfillMeetings(getDb(), firefliesReader(key), new Date(Date.now() - DAYS * 86_400_000));
    return NextResponse.json({ ...result, briefed: await briefPending(getDb(), briefClient()), jobs });
  } catch (cause) {
    if (cause instanceof FirefliesError) return NextResponse.json({ error: cause.message }, { status: 502 });
    throw cause;
  }
}

/** The job count after a refresh, the error if Autodesk failed, or null when it is not set up. */
async function refreshJobs(): Promise<number | string | null> {
  const settings = autodeskSettings();
  if (!settings) return null;
  try {
    return (await syncJobs(getDb(), settings)).jobs;
  } catch (cause) {
    if (cause instanceof AutodeskError) return cause.message;
    throw cause;
  }
}
