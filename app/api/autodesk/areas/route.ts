import { NextResponse, type NextRequest } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { accAccountId, readProjectAreas } from "@/lib/autodesk/areas";
import { NotConnectedError } from "@/lib/autodesk/connection";
import { NO_STORE, blockedRequest } from "@/lib/autodesk/gate";
import { AutodeskSignInError, userSettings } from "@/lib/autodesk/oauth";
import { getDb } from "@/lib/db";
import { isUuid } from "@/lib/uuid";

// LA-2894. The admin readout: which ACC areas of one project answer as the
// connected person, and how many records each holds. It stores nothing.

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: NO_STORE });
  const blocked = blockedRequest(request);
  if (blocked) return blocked;
  const settings = userSettings();
  const accountId = accAccountId();
  if (!settings || !accountId) {
    return NextResponse.json({ error: "Autodesk sign-in is not set up." }, { status: 503, headers: NO_STORE });
  }
  const jobId = request.nextUrl.searchParams.get("job");
  if (!jobId || !isUuid(jobId)) return NextResponse.json({ error: "Pick a project." }, { status: 400, headers: NO_STORE });
  const db = getDb();
  const { rows } = await db.query<{ autodesk_id: string; name: string; job_number: string | null }>(
    `select autodesk_id, name, job_number from jobs where id = $1`,
    [jobId],
  );
  const job = rows[0];
  if (!job) return NextResponse.json({ error: "No such project." }, { status: 404, headers: NO_STORE });
  try {
    const areas = await readProjectAreas(db, settings, accountId, job.autodesk_id);
    return NextResponse.json({ project: { name: job.name, jobNumber: job.job_number }, areas }, { headers: NO_STORE });
  } catch (cause) {
    if (cause instanceof NotConnectedError) return NextResponse.json({ error: cause.message }, { status: 409, headers: NO_STORE });
    if (cause instanceof AutodeskSignInError) return NextResponse.json({ error: cause.message }, { status: 502, headers: NO_STORE });
    throw cause;
  }
}
