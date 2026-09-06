import { DISCOVERY_SOURCES } from "./discovery-catalog";
import { InvalidVisionInput } from "./input";
export const SOURCE_SELECTION_COOKIE = "vision-sources";
export const DEFAULT_SOURCE_IDS = DISCOVERY_SOURCES.map(source => source.id);
const supported = (id:string) => DEFAULT_SOURCE_IDS.includes(id);
export function parseSelectedSources(value:string):string[] {
  const ids=value ? value.split(",") : [];
  if(ids.some(id=>!supported(id)))throw new InvalidVisionInput("Choose supported discovery sources.");
  return DEFAULT_SOURCE_IDS.filter(id=>ids.includes(id));
}
export function readSourcePreference(value:string|undefined):string[] {
  if(!value?.startsWith("v1:"))return [...DEFAULT_SOURCE_IDS];
  const raw=value.slice(3);
  if(raw==="")return [];
  const ids=raw.split(",").filter(supported);
  return ids.length ? DEFAULT_SOURCE_IDS.filter(id=>ids.includes(id)) : [...DEFAULT_SOURCE_IDS];
}
export function sourcePreferenceValue(ids:string[]) {return `v1:${parseSelectedSources(ids.join(",")).join(",")}`;}
export type SourceCheckResult = {status:"running"}|{status:"success";count:number}|{status:"error";error:string};
export async function checkSelectedSources(ids:string[],check:(id:string)=>Promise<{count:number}>,onResult:(id:string,result:SourceCheckResult)=>void) {
  const selected=parseSelectedSources(ids.join(","));
  await Promise.all(selected.map(async id=>{
    onResult(id,{status:"running"});
    try {const result=await check(id);onResult(id,{status:"success",count:result.count});}
    catch(error){onResult(id,{status:"error",error:error instanceof Error?error.message:"The source check failed. Try again."});}
  }));
}
