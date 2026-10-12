import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { FirefliesError, firefliesKey, firefliesReader } from "@/lib/meetings/fireflies";
import { briefClient } from "@/lib/meetings/brief";
import { backfillMeetings, briefPending } from "@/lib/meetings/sync";

// LA-2279. Saves any Fireflies meeting from the last `days` days (30 unless
// stated, 90 at most) that the webhook missed. Safe to call any number of times.

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const key = firefliesKey();
  if (!key) return NextResponse.json({ error: "Fireflies is not set up." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { days?: unknown };
  const days = body.days === undefined ? 30 : Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return NextResponse.json({ error: "Send days as a whole number from 1 to 90." }, { status: 400 });
  }
  try {
    const result = await backfillMeetings(getDb(), firefliesReader(key), new Date(Date.now() - days * 86_400_000));
    return NextResponse.json({ ...result, briefed: await briefPending(getDb(), briefClient()) });
  } catch (cause) {
    if (cause instanceof FirefliesError) return NextResponse.json({ error: cause.message }, { status: 502 });
    throw cause;
  }
}
