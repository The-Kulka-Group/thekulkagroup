import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/server";
import { requireVisionWriter } from "@/lib/vision/auth";
import { getDb } from "@/lib/db";
import { discoveryDetail,reviewDiscovery,parseDiscoveryReview,DiscoveryConflict } from "@/lib/vision/discovery";
import { InvalidVisionInput } from "@/lib/vision/input";
type Context={params:Promise<{id:string}>};
const valid=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const missing=()=>NextResponse.json({error:"This source record was not found."},{status:404});
export async function GET(request:Request,context:Context) {
  const denied=await requireApiUser(request); if(denied) return denied;
  const {id}=await context.params; if(!valid(id)) return missing();
  const detail=await discoveryDetail(getDb(),id); return detail ? NextResponse.json(detail):missing();
}
export async function POST(request:Request,context:Context) {
  const denied=await requireVisionWriter(request); if(denied) return denied;
  const {id}=await context.params; if(!valid(id)) return missing();
  let body:unknown; try {body=await request.json();} catch {return NextResponse.json({error:"Send a JSON body."},{status:400});}
  try { const result=await reviewDiscovery(getDb(),id,parseDiscoveryReview(body)); return result?NextResponse.json(result):missing(); }
  catch(error) {if(error instanceof InvalidVisionInput || error instanceof DiscoveryConflict) return NextResponse.json({error:error.message},{status:error instanceof DiscoveryConflict?409:400}); throw error;}
}
