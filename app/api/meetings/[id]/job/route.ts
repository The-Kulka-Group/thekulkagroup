import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { matchMeetings, setMeetingJob } from "@/lib/meetings/match";

// LA-2281. A person's correction of a meeting's job: `{ jobId }` for a job,
// `{ jobId: null }` for a meeting that belongs to no job. The matcher never
// replaces it, and the rest of the meeting's calendar series follows it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { jobId?: unknown } | null;
  const jobId = body?.jobId;
  if (!UUID.test(id) || body === null || !("jobId" in body) || (jobId !== null && (typeof jobId !== "string" || !UUID.test(jobId)))) {
    return NextResponse.json({ error: "Send a jobId, or null for no job." }, { status: 400 });
  }
  const db = getDb();
  if (!(await setMeetingJob(db, id, jobId as string | null))) {
    return NextResponse.json({ error: "That meeting or job could not be found." }, { status: 404 });
  }
  await matchMeetings(db);
  return NextResponse.json({ ok: true });
}
