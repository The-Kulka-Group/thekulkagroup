import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runCollection } from "@/lib/vision/discovery-http";
export const maxDuration=300;
export async function POST(request:Request) {
  const secret=process.env.VISION_DISCOVERY_CRON_SECRET;
  const supplied=request.headers.get("authorization") || "";
  const expected=`Bearer ${secret}`;
  if(!secret || secret.length<32 || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected))) return NextResponse.json({error:"Unauthorized."},{status:401});
  return runCollection(new URL(request.url).searchParams.get("source") || undefined);
}
