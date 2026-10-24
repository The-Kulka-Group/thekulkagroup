import { after, NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { briefClient, briefMeeting } from "@/lib/meetings/brief";
import { FirefliesError, firefliesKey, firefliesReader } from "@/lib/meetings/fireflies";
import { validFirefliesSignature } from "@/lib/meetings/signature";
import { syncMeetingLogged } from "@/lib/meetings/sync";

// LA-2279. Fireflies' Webhooks V2: `meeting.transcribed` and
// `meeting.summarized`, each carrying `meeting_id`. The signature, not a
// signed-in user, proves the call came from Fireflies. Each call fetches the
// meeting as it stands now, so a retry or a resend saves the same row again.
// LA-2282: the Kulka Brief is written after the response, since Fireflies
// waits only 30 seconds for an answer.

export const maxDuration = 60;

const SYNCED_EVENTS = new Set(["meeting.transcribed", "meeting.summarized"]);

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validFirefliesSignature(raw, request.headers.get("x-hub-signature"), process.env.FIREFLIES_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  let payload: { event?: unknown; meeting_id?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }
  // A bot-joined event carries nothing to save. Answer 2xx so Fireflies does not retry it.
  if (typeof payload.event !== "string" || !SYNCED_EVENTS.has(payload.event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }
  const meetingId = payload.meeting_id;
  if (typeof meetingId !== "string" || meetingId.trim() === "") {
    return NextResponse.json({ error: "Send a meeting_id." }, { status: 400 });
  }
  const key = firefliesKey();
  if (!key) return NextResponse.json({ error: "Fireflies is not set up." }, { status: 503 });
  try {
    await syncMeetingLogged(getDb(), firefliesReader(key), meetingId);
  } catch (cause) {
    if (cause instanceof FirefliesError) return NextResponse.json({ error: cause.message }, { status: 502 });
    throw cause;
  }
  const client = briefClient();
  if (client) after(() => briefMeeting(getDb(), client, meetingId).then(() => undefined));
  return NextResponse.json({ ok: true });
}
