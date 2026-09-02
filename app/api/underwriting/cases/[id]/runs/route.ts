import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import {
  getLatestUnderwritingRun,
  runUnderwritingCase,
  UnderwritingRevisionConflict,
} from "@/lib/underwriting/runs";
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string }> };

async function caseId(context: Context) {
  const { id } = await context.params;
  return isUuid(id) ? id : null;
}

export async function GET(_request: Request, context: Context) {
  const id = await caseId(context);
  if (!id) return NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });

  const run = await getLatestUnderwritingRun(getDb(), id);
  return run
    ? NextResponse.json({ run })
    : NextResponse.json({ error: "No calculation run exists for this case." }, { status: 404 });
}

export async function POST(request: Request, context: Context) {
  const id = await caseId(context);
  if (!id) return NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body with the expected case revision." }, { status: 400 });
  }
  const expectedRevision = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).expectedRevision
    : undefined;
  if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) {
    return NextResponse.json({ error: "Send a valid expected case revision." }, { status: 400 });
  }

  try {
    const run = await runUnderwritingCase(getDb(), id, Number(expectedRevision));
    return run
      ? NextResponse.json({ run }, { status: 201 })
      : NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
  } catch (cause) {
    if (cause instanceof UnderwritingRevisionConflict) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}
