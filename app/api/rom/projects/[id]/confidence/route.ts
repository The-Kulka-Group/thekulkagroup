import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { JobNotFound, parseJobConfidence, readJobConfidence, saveJobConfidence } from "@/lib/rom/job-confidence";
import { isUuid } from "@/lib/uuid";

// LA-2967. Sets or clears a past job's estimator confidence score, with the
// person who gave it and the date. The next run reads it. Saved runs keep the
// weights they were priced with.

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "That past job could not be found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const parsed = parseJobConfidence(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const db = getDb();
    await saveJobConfidence(db, id, parsed.confidence);
    return NextResponse.json({ projectId: id, confidence: await readJobConfidence(db, id) });
  } catch (cause) {
    if (cause instanceof JobNotFound) return NextResponse.json({ error: cause.message }, { status: 404 });
    throw cause;
  }
}
