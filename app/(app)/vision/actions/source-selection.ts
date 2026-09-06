"use server";
import {cookies} from "next/headers";
import {SOURCE_SELECTION_COOKIE,sourcePreferenceValue} from "@/lib/vision/source-selection";
export async function saveSourceSelection(ids:string[]) {
  const value=sourcePreferenceValue(ids);
  (await cookies()).set(SOURCE_SELECTION_COOKIE,value,{path:"/",maxAge:31536000,sameSite:"lax",secure:process.env.NODE_ENV==="production"});
}
