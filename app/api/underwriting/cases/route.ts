import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { createUnderwritingCase, listUnderwritingCases } from "@/lib/underwriting/cases";
import { InvalidCaseDraft, parseCaseDraft } from "@/lib/underwriting/input";

export async function GET(request = new Request("http://localhost/api/underwriting/cases")) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  return NextResponse.json({ cases: await listUnderwritingCases(getDb()) });
}

export async function POST(request: Request) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  try {
    const savedCase = await createUnderwritingCase(getDb(), parseCaseDraft(body));
    return NextResponse.json({ case: savedCase }, { status: 201 });
  } catch (cause) {
    if (cause instanceof InvalidCaseDraft) {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
}
