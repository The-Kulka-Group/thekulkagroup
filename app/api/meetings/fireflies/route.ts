import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { FirefliesError, firefliesKey, firefliesReader } from "@/lib/meetings/fireflies";
import { validFirefliesSignature } from "@/lib/meetings/signature";
import { syncMeeting } from "@/lib/meetings/sync";

// LA-2279. Fireflies' "Transcription completed" webhook. The signature, not a
// signed-in user, proves the call came from Fireflies.

export const maxDuration = 60;

export async function POST(request: Request) {
  const raw = await request.text();
  if (!validFirefliesSignature(raw, request.headers.get("x-hub-signature"), process.env.FIREFLIES_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  let meetingId: unknown;
  try {
    ({ meetingId } = JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400 });
  }
  if (typeof meetingId !== "string" || meetingId.trim() === "") {
    return NextResponse.json({ error: "Send a meetingId." }, { status: 400 });
  }
  const key = firefliesKey();
  if (!key) return NextResponse.json({ error: "Fireflies is not set up." }, { status: 503 });
  try {
    await syncMeeting(getDb(), firefliesReader(key), meetingId);
  } catch (cause) {
    if (cause instanceof FirefliesError) return NextResponse.json({ error: cause.message }, { status: 502 });
    throw cause;
  }
  return NextResponse.json({ ok: true });
}
