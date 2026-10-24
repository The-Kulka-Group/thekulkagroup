import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { AutodeskError, autodeskSettings } from "@/lib/jobs/autodesk";
import { syncJobsLogged } from "@/lib/jobs/sync";
import { refreshSource } from "@/lib/sources/schedule";

// LA-2283. Refreshes Kulka's job list from Autodesk Construction Cloud. The
// hourly refresh schedule runs the same sync; this route is the Refresh Now
// for Autodesk Projects that every button calls. LA-3049: it answers 409
// while another refresh of the list is running.

export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const settings = autodeskSettings();
  if (!settings) return NextResponse.json({ error: "Autodesk is not set up." }, { status: 503 });
  const db = getDb();
  try {
    const refresh = await refreshSource(db, "autodesk_projects", "button", () => syncJobsLogged(db, settings, "button"));
    if (refresh.status !== "ran") {
      return NextResponse.json({ error: "Autodesk Projects is already refreshing. Try again in a minute." }, { status: 409 });
    }
    return NextResponse.json(refresh.result);
  } catch (cause) {
    if (cause instanceof AutodeskError) return NextResponse.json({ error: cause.message }, { status: 502 });
    throw cause;
  }
}
