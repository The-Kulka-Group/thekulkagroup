import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getUnderwritingCase, updateUnderwritingCase } from "@/lib/underwriting/cases";
import { InvalidCaseDraft, parseCaseDraft } from "@/lib/underwriting/input";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function caseId(context: Context) {
  const { id } = await context.params;
  return UUID.test(id) ? id : null;
}

export async function GET(_request: Request, context: Context) {
  const id = await caseId(context);
  if (!id) return NextResponse.json({ error: "Send a valid case id." }, { status: 400 });

  const savedCase = await getUnderwritingCase(getDb(), id);
  return savedCase
    ? NextResponse.json({ case: savedCase })
    : NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const id = await caseId(context);
  if (!id) return NextResponse.json({ error: "Send a valid case id." }, { status: 400 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  try {
    const savedCase = await updateUnderwritingCase(getDb(), id, parseCaseDraft(body));
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
    throw cause;
  }
}
