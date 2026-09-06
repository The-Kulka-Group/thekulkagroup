import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { requireVisionWriter } from "@/lib/vision/auth";
import { createVisionOpportunity, listVisionOpportunities } from "@/lib/vision/opportunities";
import { InvalidVisionInput, parseVisionDraft, parseVisionFilters } from "@/lib/vision/input";

export async function GET(request: Request) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ opportunities: await listVisionOpportunities(getDb(), parseVisionFilters(new URL(request.url).searchParams)) });
  } catch (error) {
    if (error instanceof InvalidVisionInput) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
export async function POST(request: Request) {
  const denied = await requireVisionWriter(request);
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a JSON body." }, { status: 400 }); }
  try {
    return NextResponse.json({ opportunity: await createVisionOpportunity(getDb(), parseVisionDraft(body)) }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidVisionInput) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
