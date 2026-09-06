export type LocationMatch = { address:string;latitude:number;longitude:number };
export class LocationLookupError extends Error {}
export function parseLocationMatches(value: unknown): LocationMatch[] {
  const matches = (value as {result?:{addressMatches?:unknown}} | null)?.result?.addressMatches;
  if (!Array.isArray(matches)) throw new LocationLookupError("The address service returned an unreadable response. Try again or place the pin yourself.");
  return matches.slice(0,10).map(value => {
    const item = value as {matchedAddress?:unknown;coordinates?:{x?:unknown;y?:unknown}};
    const latitude = item?.coordinates?.y, longitude = item?.coordinates?.x;
    if (typeof item?.matchedAddress !== "string" || !item.matchedAddress.trim() || item.matchedAddress.length > 400 || typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude)>90 || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude)>180) throw new LocationLookupError("The address service returned an unreadable location. Try again or place the pin yourself.");
    return {address:item.matchedAddress,latitude,longitude};
  });
}
export async function lookupLocation(address: string): Promise<LocationMatch[]> {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.search = new URLSearchParams({address,benchmark:"Public_AR_Current",format:"json"}).toString();
  try {
    const response = await fetch(url,{signal:AbortSignal.timeout(10000),redirect:"error",cache:"no-store"});
    if (!response.ok) throw new Error();
    const reader = response.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let size=0;
    try { while(true) { const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>1000000)throw new Error(); chunks.push(value); } }
    finally { await reader.cancel(); }
    return parseLocationMatches(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch(error) {
    if(error instanceof LocationLookupError) throw error;
    throw new LocationLookupError("The address service is unavailable. Try again or place the pin yourself. Your saved location has not changed.");
  }
}
