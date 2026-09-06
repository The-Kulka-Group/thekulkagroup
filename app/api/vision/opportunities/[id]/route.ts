import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { isUuid } from "@/lib/uuid";
import { requireVisionWriter } from "@/lib/vision/auth";
import { getVisionOpportunity, updateVisionReview, VisionRevisionConflict } from "@/lib/vision/opportunities";
import { InvalidVisionInput, parseVisionReview, parseVisionDraft } from "@/lib/vision/input";

type Context = { params: Promise<{ id: string }> };
const missing = () => NextResponse.json({ error: "Opportunity not found." }, { status: 404 });
export async function GET(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return missing();
  const opportunity = await getVisionOpportunity(getDb(), id);
  return opportunity ? NextResponse.json({ opportunity }) : missing();
}
export async function PATCH(request: Request, context: Context) {
  const denied = await requireVisionWriter(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return missing();
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Send a JSON body." }, { status: 400 }); }
  try {
    const opportunity = await updateVisionReview(getDb(), id, parseVisionReview(body), body && typeof body === "object" && ["name", "town", "county", "address", "latitude", "longitude", "sourceTitle", "sourceUrl", "sourceDate"].some(key => key in body) ? parseVisionDraft(body) : undefined);
    return opportunity ? NextResponse.json({ opportunity }) : missing();
  } catch (error) {
    if (error instanceof InvalidVisionInput) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof VisionRevisionConflict) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
