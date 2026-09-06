import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { InvalidVisionInput } from "./input";
import { collectDiscovery,DiscoveryConflict } from "./discovery";
export async function runCollection(sourceId?:string) {
  try {return NextResponse.json(await collectDiscovery(getDb(),sourceId));}
  catch(error) {return NextResponse.json({error:error instanceof DiscoveryConflict || error instanceof InvalidVisionInput?error.message:"The source check failed. Saved records remain available. Try again later."},{status:error instanceof DiscoveryConflict?409:error instanceof InvalidVisionInput?400:502});}
}
