import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { FirefliesError, firefliesKey, firefliesReader } from "@/lib/meetings/fireflies";
import { backfillMeetings } from "@/lib/meetings/sync";

// LA-2279. The scheduled pull (vercel.json), the main path for meetings the
// webhook never reports. Vercel sends `Authorization: Bearer $CRON_SECRET`.

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
  const key = firefliesKey();
  if (!key) return NextResponse.json({ error: "Fireflies is not set up." }, { status: 503 });
  try {
    return NextResponse.json(
      await backfillMeetings(getDb(), firefliesReader(key), new Date(Date.now() - DAYS * 86_400_000)),
    );
  } catch (cause) {
    if (cause instanceof FirefliesError) return NextResponse.json({ error: cause.message }, { status: 502 });
    throw cause;
  }
}
