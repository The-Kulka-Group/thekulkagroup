import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { discoveryInbox } from "@/lib/vision/discovery";
import { InvalidVisionInput } from "@/lib/vision/input";
import { parseDiscoveryFilters } from "@/lib/vision/discovery-filters";
export async function GET(request:Request) {
  const denied=await requireApiUser(request); if(denied) return denied;
  try { const params=new URL(request.url).searchParams; return NextResponse.json(await discoveryInbox(getDb(),params.get("state") || "new",parseDiscoveryFilters(params))); }
  catch(error) { if(error instanceof InvalidVisionInput) return NextResponse.json({error:error.message},{status:400}); throw error; }
}
