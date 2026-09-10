import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { InvalidVisionInput } from "./input";
import { collectAllDiscovery,collectDiscovery,DiscoveryConflict } from "./discovery";

export function collectionTarget(request:Request, defaultTarget?:string) {
  const params=new URL(request.url).searchParams;
  if([...params.keys()].some(key=>key!=="source") || params.getAll("source").length>1) throw new InvalidVisionInput("Choose one supported source or all enabled sources.");
  const target=params.get("source") || defaultTarget;
  if(target==="all")return target;
  return target;
}

export async function runCollection(sourceId?:string) {
  try {return NextResponse.json(sourceId==="all" ? await collectAllDiscovery(getDb()) : await collectDiscovery(getDb(),sourceId));}
  catch(error) {return NextResponse.json({error:error instanceof DiscoveryConflict || error instanceof InvalidVisionInput?error.message:"The source check failed. Earlier source records remain available. Try again later."},{status:error instanceof DiscoveryConflict?409:error instanceof InvalidVisionInput?400:502});}
}
