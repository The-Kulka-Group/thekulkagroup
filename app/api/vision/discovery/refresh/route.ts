import { requireVisionWriter } from "@/lib/vision/auth";
import { collectionTarget,runCollection } from "@/lib/vision/discovery-http";
import { InvalidVisionInput } from "@/lib/vision/input";
import { NextResponse } from "next/server";
export const maxDuration=300;
export async function POST(request:Request) {
  const denied=await requireVisionWriter(request); if(denied)return denied;
  try {return runCollection(collectionTarget(request));}
  catch(error) {return NextResponse.json({error:error instanceof InvalidVisionInput?error.message:"Choose a supported source."},{status:400});}
}
