import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { collectionTarget,runCollection } from "@/lib/vision/discovery-http";
import { InvalidVisionInput } from "@/lib/vision/input";
export const maxDuration=300;
export async function POST(request:Request) {
  const secret=process.env.VISION_DISCOVERY_CRON_SECRET;
  const supplied=request.headers.get("authorization") || "";
  const expected=`Bearer ${secret}`;
  if(!secret || secret.length<32 || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return NextResponse.json({error:"Unauthorized."},{status:401});
  try {return runCollection(collectionTarget(request,"all"));}
  catch(error) {return NextResponse.json({error:error instanceof InvalidVisionInput?error.message:"Choose a supported source."},{status:400});}
}
