import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { keepSignInAliveLogged } from "@/lib/autodesk/connection";
import { userSettings } from "@/lib/autodesk/oauth";
import { getDb } from "@/lib/db";
import { AutodeskError, autodeskSettings } from "@/lib/jobs/autodesk";
import { syncJobsLogged } from "@/lib/jobs/sync";
import { FirefliesError, firefliesKey, firefliesReader } from "@/lib/meetings/fireflies";
import { briefClient } from "@/lib/meetings/brief";
import { backfillMeetingsLogged, briefPending } from "@/lib/meetings/sync";

// LA-2279. The scheduled pull (vercel.json), the main path for meetings the
// webhook never reports. Vercel sends `Authorization: Bearer $CRON_SECRET`.
// LA-2283: it refreshes the Autodesk job list first, when Autodesk is set up.
// LA-2911: it also refreshes the Autodesk sign-in, which lapses after 15 idle days.
// LA-3048: each of the three logs a run in source_runs.

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
  const settings = userSettings();
  const autodeskSignIn = settings ? await keepSignInAliveLogged(getDb(), settings) : null;
  const key = firefliesKey();
  if (!key) return NextResponse.json({ error: "Fireflies is not set up.", jobs, autodeskSignIn }, { status: 503 });
  try {
    const result = await backfillMeetingsLogged(
      getDb(),
      firefliesReader(key),
      new Date(Date.now() - DAYS * 86_400_000),
      "schedule",
    );
    return NextResponse.json({ ...result, briefed: await briefPending(getDb(), briefClient()), jobs, autodeskSignIn });
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
    return (await syncJobsLogged(getDb(), settings, "schedule")).jobs;
  } catch (cause) {
    if (cause instanceof AutodeskError) return cause.message;
    throw cause;
  }
}
