import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { collectDiscovery,DiscoveryConflict } from "./discovery";
export async function runCollection() {
  try {return NextResponse.json(await collectDiscovery(getDb()));}
  catch(error) {return NextResponse.json({error:error instanceof DiscoveryConflict?error.message:"The source check failed. Saved records remain available. Try again later."},{status:error instanceof DiscoveryConflict?409:502});}
}
