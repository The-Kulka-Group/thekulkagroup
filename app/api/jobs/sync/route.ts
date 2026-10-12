import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { AutodeskError, autodeskSettings } from "@/lib/jobs/autodesk";
import { syncJobs } from "@/lib/jobs/sync";

// LA-2283. Refreshes Kulka's job list from Autodesk Construction Cloud. The
// daily meetings cron runs the same sync; this route is for the first pull
// and for a refresh on demand. Safe to call any number of times.

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const settings = autodeskSettings();
  if (!settings) return NextResponse.json({ error: "Autodesk is not set up." }, { status: 503 });
  try {
    return NextResponse.json(await syncJobs(getDb(), settings));
  } catch (cause) {
    if (cause instanceof AutodeskError) return NextResponse.json({ error: cause.message }, { status: 502 });
    throw cause;
  }
}
