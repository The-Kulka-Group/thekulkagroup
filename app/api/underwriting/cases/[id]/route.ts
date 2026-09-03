import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  getUnderwritingCase,
  UnderwritingCaseRevisionConflict,
  updateUnderwritingCase,
} from "@/lib/underwriting/cases";
import { InvalidCaseDraft, parseCaseDraft } from "@/lib/underwriting/input";
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string }> };

async function caseId(context: Context) {
  const { id } = await context.params;
  return isUuid(id) ? id : null;
}

export async function GET(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  const id = await caseId(context);
  if (!id) return NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });

  const savedCase = await getUnderwritingCase(getDb(), id);
  return savedCase
    ? NextResponse.json({ case: savedCase })
    : NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  const id = await caseId(context);
  if (!id) return NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  try {
    const expectedRevision = body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).expectedRevision
      : undefined;
    if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) {
      return NextResponse.json({ error: "Send a valid expected case revision." }, { status: 400 });
    }
    const savedCase = await updateUnderwritingCase(
      getDb(),
      id,
      parseCaseDraft(body),
      Number(expectedRevision),
    );
    return savedCase
      ? NextResponse.json({ case: savedCase })
      : NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
  } catch (cause) {
    if (cause instanceof InvalidCaseDraft) {
      return NextResponse.json(
        { error: cause.message, fieldErrors: cause.fieldErrors },
        { status: 400 },
      );
    }
    if (cause instanceof UnderwritingCaseRevisionConflict) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}
