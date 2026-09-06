import {afterEach,describe,expect,it,vi} from "vitest";
import {lookupLocation,parseLocationMatches} from "./location-lookup";
const fixture={result:{addressMatches:[{matchedAddress:"1 TEST ST, TEST TOWN, NY, 10000",coordinates:{x:-73.4,y:40.8}}]}};
afterEach(()=>vi.unstubAllGlobals());
describe("address lookup",()=>{
  it("validates provider coordinates and keeps no match distinct from invalid response",()=>{
    expect(parseLocationMatches(fixture)).toEqual([{address:"1 TEST ST, TEST TOWN, NY, 10000",latitude:40.8,longitude:-73.4}]);
    expect(parseLocationMatches({result:{addressMatches:[]}})).toEqual([]);
    for(const value of [null,{}, {result:{addressMatches:[{}]}},{result:{addressMatches:[{matchedAddress:"Test",coordinates:{x:181,y:0}}]}}])expect(()=>parseLocationMatches(value)).toThrow();
  });
  it("uses a fixed endpoint, explicit benchmark, bounded timeout and encoded address",async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify(fixture)));vi.stubGlobal("fetch",fetcher);
    await expect(lookupLocation("1 Test St & Other, NY")).resolves.toHaveLength(1);
    const [url,options]=fetcher.mock.calls[0];
    expect(url.origin+url.pathname).toBe("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
    expect(url.searchParams.get("address")).toBe("1 Test St & Other, NY");expect(url.searchParams.get("benchmark")).toBe("Public_AR_Current");expect(options.redirect).toBe("error");expect(options.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([()=>Promise.reject(new Error("timeout")),()=>Promise.resolve(new Response("error",{status:503})),()=>Promise.resolve(new Response("x".repeat(1000001)))])("reports service failures without a match",async implementation=>{
    vi.stubGlobal("fetch",vi.fn(implementation));await expect(lookupLocation("1 Test St, NY")).rejects.toThrow("saved location has not changed");
  });
});
