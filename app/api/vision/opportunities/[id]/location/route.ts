import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isUuid } from "@/lib/uuid";
import { requireVisionWriter } from "@/lib/vision/auth";
import { InvalidVisionInput, parseVisionLocation } from "@/lib/vision/input";
import { updateVisionLocation, VisionRevisionConflict } from "@/lib/vision/opportunities";
export async function PATCH(request: Request, context: {params:Promise<{id:string}>}) {
  const denied = await requireVisionWriter(request);
  if (denied) return denied;
  const {id} = await context.params;
  if (!isUuid(id)) return NextResponse.json({error:"Opportunity not found."},{status:404});
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({error:"Send a JSON body."},{status:400}); }
  try {
    const opportunity = await updateVisionLocation(getDb(),id,parseVisionLocation(body));
    return opportunity ? NextResponse.json({opportunity}) : NextResponse.json({error:"Opportunity not found."},{status:404});
  } catch(error) {
    if(error instanceof InvalidVisionInput) return NextResponse.json({error:error.message},{status:400});
    if(error instanceof VisionRevisionConflict) return NextResponse.json({error:"This opportunity changed. Reload the page before saving its location."},{status:409});
    throw error;
  }
}
