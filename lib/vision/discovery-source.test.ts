import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchDiscoveryRecords } from "./discovery-source";

// Synthetic source responses only. No fixture is imported by the application.
function page(layer: number) {
  return { spatialReference: { wkid: 4326 }, exceededTransferLimit: true, features: [{
    attributes: { OBJECTID: 12, GlobalID: "{00000000-0000-4000-8000-000000000012}", File_No: "TEST-12", Address: "Synthetic address", ...(layer === 0 ? { Municipality: "Synthetic town", Referral_Date: Date.UTC(2026, 8, 1), Type_Referral: "Synthetic referral" } : {}), ...(layer === 1 ? { Init_Filing_Date: null, Approve_Date: Date.UTC(2025, 1, 2), No_Lots: 2 } : {}) },
    geometry: { x: -73.6, y: 40.7 },
  }] };
}
function sourceResponse(transform?: (data: ReturnType<typeof page>) => unknown) {
  const fetcher = vi.fn(async (url: URL) => {
    const layer = Number(url.pathname.split("/").at(-2));
    return Response.json(transform ? transform(page(layer)) : page(layer));
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
afterEach(() => vi.unstubAllGlobals());
describe("Nassau discovery source", () => {
  it("collects bounded source records with stable IDs, typed dates and coordinates", async () => {
    const fetcher = sourceResponse();
    const records = await fetchDiscoveryRecords();
    expect(records).toHaveLength(3);
    expect(records[0]).toMatchObject({externalId:"0:00000000-0000-4000-8000-000000000012",sourceDate:"2026-09-01",sourceDateLabel:"Referral date",town:"Synthetic town",latitude:40.7,longitude:-73.6});
    expect(records[1]).toMatchObject({sourceDate:null,sourceDateLabel:"Initial filing date",town:"",details:{"Approval date reported by source":"2025-02-02"}});
    expect(records[2]).toMatchObject({sourceDate:null,sourceDateLabel:"Source date"});
    expect(new URL(records[0].sourceUrl).searchParams.get("where")).toBe("GlobalID='00000000-0000-4000-8000-000000000012'");
    for (const [url, options] of fetcher.mock.calls as unknown as [URL, RequestInit][]) {
      expect(url.hostname).toBe("services1.arcgis.com");
      expect(url.searchParams.get("resultRecordCount")).toBe("100");
      expect(url.searchParams.get("orderByFields")).toBe("OBJECTID DESC");
      expect(url.searchParams.get("outSR")).toBe("4326");
      expect(options).toMatchObject({redirect:"error",cache:"no-store"});
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });
  it.each([
    (data: ReturnType<typeof page>) => ({...data,features:[]}),
    () => ({error:{code:500}}),
    (data: ReturnType<typeof page>) => ({...data,spatialReference:{wkid:2263}}),
    (data: ReturnType<typeof page>) => ({...data,features:[...data.features,...data.features]}),
    (data: ReturnType<typeof page>) => {data.features[0].geometry.x=100000;return data;},
    (data: ReturnType<typeof page>) => {data.features[0].attributes.GlobalID="not-a-guid";return data;},
    (data: ReturnType<typeof page>) => {data.features[0].attributes.Referral_Date=NaN; return JSON.parse(JSON.stringify(data).replace('"Referral_Date":null','"Referral_Date":"bad"'));},
  ])("rejects incomplete or malformed source results", async transform => {
    sourceResponse(transform);
    await expect(fetchDiscoveryRecords()).rejects.toThrow();
  });
  it("keeps missing coordinates unknown", async () => {
    sourceResponse(data => ({...data,features:data.features.map(feature=>({...feature,geometry:null}))}));
    expect((await fetchDiscoveryRecords())[0]).toMatchObject({latitude:null,longitude:null});
  });
  it("fails the entire check when a later source layer fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(page(0))).mockResolvedValueOnce(new Response("unavailable",{status:503})));
    await expect(fetchDiscoveryRecords()).rejects.toThrow("HTTP 503");
  });
  it("rejects oversized bodies and invalid JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async()=>new Response("x".repeat(1_000_001))));
    await expect(fetchDiscoveryRecords()).rejects.toThrow("size limit");
    vi.stubGlobal("fetch", vi.fn(async()=>new Response("not JSON")));
    await expect(fetchDiscoveryRecords()).rejects.toThrow("unreadable JSON");
  });
});
