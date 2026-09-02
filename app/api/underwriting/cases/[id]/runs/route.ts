import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getLatestUnderwritingRun, runUnderwritingCase } from "@/lib/underwriting/runs";

type Context = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function caseId(context: Context) {
  const { id } = await context.params;
  return UUID.test(id) ? id : null;
}

export async function GET(_request: Request, context: Context) {
  const id = await caseId(context);
  if (!id) return NextResponse.json({ error: "Send a valid case id." }, { status: 400 });

  const run = await getLatestUnderwritingRun(getDb(), id);
  return run
    ? NextResponse.json({ run })
    : NextResponse.json({ error: "No calculation run exists for this case." }, { status: 404 });
}

export async function POST(_request: Request, context: Context) {
  const id = await caseId(context);
  if (!id) return NextResponse.json({ error: "Send a valid case id." }, { status: 400 });

  const run = await runUnderwritingCase(getDb(), id);
  return run
    ? NextResponse.json({ run }, { status: 201 })
    : NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
}
