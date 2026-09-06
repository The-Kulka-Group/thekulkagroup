import { InvalidVisionInput } from "./input";

export type DiscoveryFilters = { applicationType:string; location:string; dateMode:string; from:string; to:string };
export function parseDiscoveryFilters(params:URLSearchParams):DiscoveryFilters {
  const applicationType=(params.get("applicationType") || "").trim();
  const location=(params.get("location") || "").trim();
  const dateMode=params.get("dateMode") || "all";
  const from=params.get("from") || "",to=params.get("to") || "";
  if(applicationType.length>100 || location.length>400) throw new InvalidVisionInput("Shorten the application type or location filter.");
  if(!["all","known","unknown"].includes(dateMode)) throw new InvalidVisionInput("Choose a valid source date filter.");
  for(const value of [from,to]) {
    if(value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000") || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10)!==value)) throw new InvalidVisionInput("Enter valid source dates.");
  }
  if(from && to && from>to) throw new InvalidVisionInput("The start date must be on or before the end date.");
  if(dateMode==="unknown" && (from || to)) throw new InvalidVisionInput("Clear the date range to find records with unknown dates.");
  return {applicationType,location,dateMode,from,to};
}
