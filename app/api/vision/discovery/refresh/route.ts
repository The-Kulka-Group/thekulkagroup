import { requireVisionWriter } from "@/lib/vision/auth";
import { runCollection } from "@/lib/vision/discovery-http";
export const maxDuration=300;
export async function POST(request:Request) {const denied=await requireVisionWriter(request); return denied || runCollection(new URL(request.url).searchParams.get("source") || undefined);}
