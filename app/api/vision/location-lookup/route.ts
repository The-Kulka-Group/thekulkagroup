import {NextResponse} from "next/server";
import {requireVisionWriter} from "@/lib/vision/auth";
import {InvalidVisionInput,parseLocationQuery} from "@/lib/vision/input";
import {lookupLocation,LocationLookupError} from "@/lib/vision/location-lookup";
export async function POST(request:Request) {
  const denied=await requireVisionWriter(request); if(denied)return denied;
  let body:unknown;
  try {body=await request.json();} catch {return NextResponse.json({error:"Send a JSON body."},{status:400});}
  try {return NextResponse.json({matches:await lookupLocation(parseLocationQuery(body))});}
  catch(error) {
    if(error instanceof InvalidVisionInput)return NextResponse.json({error:error.message},{status:400});
    if(error instanceof LocationLookupError)return NextResponse.json({error:error.message},{status:502});
    throw error;
  }
}
