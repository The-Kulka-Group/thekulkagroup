import {afterEach, describe, expect, it, vi} from "vitest";
import type {DiscoveredRecord} from "./discovery-source";
import {automatedSourceDefinition} from "./source-registry";
import {fetchSmartGovRecords, parseSmartGovDetail, parseSmartGovSearchPage} from "./smartgov-source";

const firstGuid = "603789a6-8175-4dc6-96f7-b37901171004";
const secondGuid = "39c2a7b1-3014-4291-9c77-b43900fafc86";

function result(guid: string, recordNumber: string, type: string, status: string, date: string, address: string) {
  return `<div class="search-result-item">
    <div class="search-result-title"><a href="javascript:void(0);" onclick="FormSupport.submitAction( 'Detail/${guid}' );">${recordNumber}</a></div>
    <div class="row">
      <div class="col-lg-3"><div class="">${type}</div><div class="">${status}, ${date}</div></div>
      <div class="col-lg-3"><div>${address}</div><div>HEMPSTEAD, NY 11550</div></div>
      <div class="col-lg-3"></div>
    </div>
  </div>`;
}

function searchPage(items: string, total = 2, page = 0) {
  const count = page ? `Page ${page + 1} of ${total} results` : `${total} results`;
  return `<html><div id="search-results"><div class="float-end muted st-mr-md">${count}</div>${items}<input type="hidden" id="_applicationSearchPage" name="_applicationSearchPage" value="${page}" /></div></html>`;
}

function detail(guid: string, recordNumber: string, type: string, status: string, address: string) {
  return `<html><form action="/PermittingPublic/PermitLandingPagePublic">
    <input type="hidden" id="Id" name="Id" value="${guid}"/>
    <table class="header-table-no-outline businessDetail business-license-left">
      <tr><td class="case-header-title">${type}</td></tr>
      <tr><td class="case-header-field-label">Reference Number</td><td class="case-header-field-value"><span>REFERENCE-26-0793</span></td></tr>
      <tr><td class="case-header-field-label">Record Number</td><td class="case-header-field-value"><span>${recordNumber}</span><div class="case-header-status-badge issued">${status}</div></td></tr>
    </table>
    <section id="projectsection-section"><div class="landing-page-section-div">
      <table class="case-main-section-table-left">
        <tr><td class="project-section-field-label"><span>Location</span></td></tr>
        <tr><td class="project-section-field-value"><span>${address}</span></td><td class="project-section-field-value"><span>Parcel</span></td></tr>
        <tr><td class="project-section-field-value"><span>HEMPSTEAD, NY 11550</span></td><td class="project-section-field-value"><span><a href="https://vlg-hempstead-ny.smartgovcommunity.com:443/Parcels/ParcelDetail/Index/parcel-id">34339 00450</a></span></td></tr>
      </table>
      <script>window.ProjectMapV4Point = {"latitude":"40.707854","longitude":"-73.624693","label":"${address}"};</script>
      <table class="case-main-section-table-right">
        <tr><td class="project-section-field-label">Created</td><td class="project-section-field-value">4/27/2026</td></tr>
        <tr><td class="project-section-field-label">Submitted</td><td class="project-section-field-value">4/28/2026</td></tr>
        <tr><td class="project-section-field-label">Approved</td><td class="project-section-field-value">9/9/2026</td></tr>
        <tr><td class="project-section-field-label">Issued</td><td class="project-section-field-value">9/9/2026</td></tr>
        <tr><td class="project-section-field-label">Closed</td><td class="project-section-field-value"> - -</td></tr>
        <tr><td class="project-section-field-label">Application Expires</td><td class="project-section-field-value">9/30/2026</td></tr>
      </table>
    </div></section>
  </form></html>`;
}

afterEach(() => vi.unstubAllGlobals());

describe("Village of Hempstead SmartGov source", () => {
  it.runIf(process.env.VISION_LIVE_SMARTGOV === "1")("passes the current anonymous public field contract", async () => {
    const configured = automatedSourceDefinition("hempstead-village-smartgov");
    const source = {...configured, limits: {...configured.limits, maxRequests: 4, maxRecords: 1, maxPages: 1}};
    const records = await fetchSmartGovRecords(source);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({town: "Hempstead", county: "Nassau", latitude: expect.any(Number), longitude: expect.any(Number)});
    expect(records[0].externalId).toMatch(/^permit:[0-9a-f-]{36}$/);
    expect(records[0].sourceCaseId).toBeTruthy();
    expect(records[0].details).toMatchObject({"Record type": expect.any(String), "Published status": expect.any(String)});
  }, 60_000);

  it("parses source-owned identity and published list fields without inferred facts", () => {
    const parsed = parseSmartGovSearchPage(searchPage(
      result(firstGuid, "SOLAR2025-0035", "Solar Permit", "Expired", "9/9/2026", "147 CROWELL ST"),
      1,
    ), 0);

    expect(parsed).toMatchObject({total: 1, page: 0});
    expect(parsed.records[0]).toMatchObject({
      externalId: `permit:${firstGuid}`,
      sourceCaseId: "SOLAR2025-0035",
      name: "Solar Permit SOLAR2025-0035",
      address: "147 CROWELL ST, HEMPSTEAD, NY 11550",
      town: "Hempstead",
      sourceDate: "2026-09-09",
      sourceDateLabel: "SmartGov status date",
      latitude: null,
      longitude: null,
      details: {
        "Record type": "Solar Permit",
        "Published status": "Expired",
        "Status meaning": "SmartGov lists this application as expired. This does not show that the village issued a permit.",
        "Record number": "SOLAR2025-0035",
        "Portal record ID": firstGuid,
      },
    });
    expect(parsed.records[0].details).not.toHaveProperty("Project value");
    expect(parsed.records[0].details).not.toHaveProperty("Owner");
  });

  it("adds only detail fields that the public page states", () => {
    const record = parseSmartGovSearchPage(searchPage(
      result(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "9/9/2026", "51 MAIN ST"),
      1,
    ), 0).records[0];
    const parsed = parseSmartGovDetail(detail(secondGuid, record.sourceCaseId!, "Commercial Building Permit", "Issued", "51 MAIN ST"), record);

    expect(parsed).toMatchObject({latitude: 40.707854, longitude: -73.624693});
    expect(parsed.details).toMatchObject({
      "Reference number": "REFERENCE-26-0793",
      Parcel: "34339 00450",
      Created: "2026-04-27",
      Submitted: "2026-04-28",
      Approved: "2026-09-09",
      Issued: "2026-09-09",
      "Application expires": "2026-09-30",
    });
    expect(parsed.details).not.toHaveProperty("Closed");
    expect(parsed.details["Status meaning"]).toContain("does not show construction progress");
    expect(parsed.evidence?.[0]).toMatchObject({kind: "index-link", url: parsed.sourceUrl, page: 1});
  });

  it("rejects malformed list and detail contracts", () => {
    const valid = searchPage(result(firstGuid, "SOLAR2025-0035", "Solar Permit", "Closed", "9/9/2026", "147 CROWELL ST"), 1);
    expect(() => parseSmartGovSearchPage(valid.replace(firstGuid, "bad-id"), 0)).toThrow("record identifier");
    expect(() => parseSmartGovSearchPage(valid.replace("1 results", "No count"), 0)).toThrow("result count");
    expect(() => parseSmartGovSearchPage(valid.replace("Closed, 9/9/2026", "Closed someday"), 0)).toThrow("expected permit fields");
    const record = parseSmartGovSearchPage(valid, 0).records[0];
    expect(() => parseSmartGovDetail(detail(secondGuid, record.sourceCaseId!, "Solar Permit", "Closed", "147 CROWELL ST"), record)).toThrow("record identifier");
    expect(() => parseSmartGovDetail(detail(firstGuid, "OTHER", "Solar Permit", "Closed", "147 CROWELL ST"), record)).toThrow("record number");
  });

  it("uses a fixed 30-day permit search, bounded pages and detail requests only for new or changed records", async () => {
    const source = automatedSourceDefinition("hempstead-village-smartgov");
    const first = result(firstGuid, "SOLAR2025-0035", "Solar Permit", "Closed", "9/9/2026", "147 CROWELL ST");
    const second = result(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "9/9/2026", "51 MAIN ST");
    const existing = parseSmartGovSearchPage(searchPage(first, 1), 0).records[0];
    const existingRecords = new Map<string, DiscoveredRecord>([[existing.externalId, existing]]);
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/ApplicationPublic/ApplicationSearchAdvanced" && !init?.method) {
        return new Response("<html>Advanced Search</html>", {headers: {"content-type": "text/html", "set-cookie": "ASP.NET_SessionId=test; path=/; secure; HttpOnly"}});
      }
      if (url.pathname.endsWith("/ValidateFormEntries")) return Response.json({status: "success"});
      if (url.pathname.endsWith("/Search")) return new Response(searchPage(first + second, 2), {headers: {"content-type": "text/html"}});
      if (url.pathname.includes("/PermitLandingPagePublic/Index/")) return new Response(detail(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "51 MAIN ST"), {headers: {"content-type": "text/html"}});
      throw new Error(`Unexpected request: ${url.href}`);
    });
    vi.stubGlobal("fetch", fetcher);

    const records = await fetchSmartGovRecords(source, existingRecords, new Date("2026-09-09T16:00:00Z"));

    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(existing);
    expect(records[1].details["Reference number"]).toBe("REFERENCE-26-0793");
    expect(fetcher).toHaveBeenCalledTimes(4);
    for (const [input, init] of fetcher.mock.calls) {
      expect(new URL(typeof input === "string" || input instanceof URL ? input : input.url).origin).toBe("https://vlg-hempstead-ny.smartgovcommunity.com");
      expect(init).toMatchObject({redirect: "error", cache: "no-store"});
    }
    const searchBody = String(fetcher.mock.calls[2][1]?.body);
    expect(searchBody).toContain("Module=Permitting");
    expect(searchBody).toContain("SubmittedOn=8%2F10%2F2026+To+9%2F9%2F2026");
    expect(searchBody).not.toContain("http");
    expect(fetcher.mock.calls[1][1]?.headers).toMatchObject({Cookie: "ASP.NET_SessionId=test"});
  });

  it("keeps valid permits and reports one rejected record when a detail page fails", async () => {
    const source = automatedSourceDefinition("hempstead-village-smartgov");
    const first = result(firstGuid, "SOLAR2025-0035", "Solar Permit", "Closed", "9/9/2026", "147 CROWELL ST");
    const second = result(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "9/9/2026", "51 MAIN ST");
    const progress: Array<{fetched: number; rejected: number}> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/ApplicationPublic/ApplicationSearchAdvanced" && !init?.method) return new Response("<html>Advanced Search</html>", {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith("/ValidateFormEntries")) return Response.json({status: "success"});
      if (url.pathname.endsWith("/Search")) return new Response(searchPage(first + second, 2), {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith(firstGuid)) return new Response(detail(firstGuid, "OTHER", "Solar Permit", "Closed", "147 CROWELL ST"), {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith(secondGuid)) return new Response(detail(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "51 MAIN ST"), {headers: {"content-type": "text/html"}});
      throw new Error(`Unexpected request: ${url.href}`);
    }));

    const records = await fetchSmartGovRecords(source, new Map(), new Date("2026-09-09T16:00:00Z"), value => progress.push(value));

    expect(records).toHaveLength(1);
    expect(records[0].externalId).toBe(`permit:${secondGuid}`);
    expect(progress.at(-1)).toEqual({coverage: null, fetched: 2, rejected: 1});
  });

  it("keeps a valid permit when another detail request fails", async () => {
    const source = automatedSourceDefinition("hempstead-village-smartgov");
    const first = result(firstGuid, "SOLAR2025-0035", "Solar Permit", "Closed", "9/9/2026", "147 CROWELL ST");
    const second = result(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "9/9/2026", "51 MAIN ST");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/ApplicationPublic/ApplicationSearchAdvanced" && !init?.method) return new Response("<html>Advanced Search</html>", {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith("/ValidateFormEntries")) return Response.json({status: "success"});
      if (url.pathname.endsWith("/Search")) return new Response(searchPage(first + second, 2), {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith(firstGuid)) return new Response("Unavailable", {status: 503, headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith(secondGuid)) return new Response(detail(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "51 MAIN ST"), {headers: {"content-type": "text/html"}});
      throw new Error(`Unexpected request: ${url.href}`);
    }));

    const records = await fetchSmartGovRecords(source, new Map(), new Date("2026-09-09T16:00:00Z"));

    expect(records.map(record => record.externalId)).toEqual([`permit:${secondGuid}`]);
  });

  it("fails the run rather than reporting a quiet empty success when every detail page fails", async () => {
    const source = automatedSourceDefinition("hempstead-village-smartgov");
    const first = result(firstGuid, "SOLAR2025-0035", "Solar Permit", "Closed", "9/9/2026", "147 CROWELL ST");
    const second = result(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "9/9/2026", "51 MAIN ST");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/ApplicationPublic/ApplicationSearchAdvanced" && !init?.method) return new Response("<html>Advanced Search</html>", {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith("/ValidateFormEntries")) return Response.json({status: "success"});
      if (url.pathname.endsWith("/Search")) return new Response(searchPage(first + second, 2), {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith(firstGuid) || url.pathname.endsWith(secondGuid)) return new Response("Unavailable", {status: 503, headers: {"content-type": "text/html"}});
      throw new Error(`Unexpected request: ${url.href}`);
    }));

    // A total detail-endpoint outage must surface as a failure, not as "no permits
    // found this cycle" — the whole point of the fix this test guards.
    await expect(fetchSmartGovRecords(source, new Map(), new Date("2026-09-09T16:00:00Z"))).rejects.toThrow("rejected every permit");
  });

  it("fails the run instead of counting every remaining permit as rejected when the request budget runs out mid-loop", async () => {
    const source = {...automatedSourceDefinition("hempstead-village-smartgov"), limits: {...automatedSourceDefinition("hempstead-village-smartgov").limits, maxRequests: 3}};
    const first = result(firstGuid, "SOLAR2025-0035", "Solar Permit", "Closed", "9/9/2026", "147 CROWELL ST");
    const second = result(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "9/9/2026", "51 MAIN ST");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/ApplicationPublic/ApplicationSearchAdvanced" && !init?.method) return new Response("<html>Advanced Search</html>", {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith("/ValidateFormEntries")) return Response.json({status: "success"});
      if (url.pathname.endsWith("/Search")) return new Response(searchPage(first + second, 2), {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith(firstGuid)) return new Response(detail(firstGuid, "SOLAR2025-0035", "Solar Permit", "Closed", "147 CROWELL ST"), {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith(secondGuid)) return new Response(detail(secondGuid, "COMMERCIALBUILDINGPERMIT2026-0026", "Commercial Building Permit", "Issued", "51 MAIN ST"), {headers: {"content-type": "text/html"}});
      throw new Error(`Unexpected request: ${url.href}`);
    }));

    // The start, validate, and search calls already spend the entire budget of 3, so
    // the first detail request must fail the run, not silently count as one rejected
    // permit among otherwise-successful ones.
    await expect(fetchSmartGovRecords(source, new Map(), new Date("2026-09-09T16:00:00Z"))).rejects.toThrow("exceeded the request limit");
  });

  it("fails the collection when the search result set is malformed", async () => {
    const source = automatedSourceDefinition("hempstead-village-smartgov");
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
      if (url.pathname === "/ApplicationPublic/ApplicationSearchAdvanced" && !init?.method) return new Response("<html>Advanced Search</html>", {headers: {"content-type": "text/html"}});
      if (url.pathname.endsWith("/ValidateFormEntries")) return Response.json({status: "success"});
      if (url.pathname.endsWith("/Search")) return new Response("<html>Changed search page</html>", {headers: {"content-type": "text/html"}});
      throw new Error(`Unexpected request: ${url.href}`);
    }));

    await expect(fetchSmartGovRecords(source, new Map(), new Date("2026-09-09T16:00:00Z"))).rejects.toThrow("search results are missing");
  });

  it("fails on oversized responses before parsing records", async () => {
    const source = automatedSourceDefinition("hempstead-village-smartgov");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(source.limits.maxResponseBytes + 1), {headers: {"content-type": "text/html"}})));
    await expect(fetchSmartGovRecords(source, new Map(), new Date("2026-09-09T16:00:00Z"))).rejects.toThrow("size limit");
  });
});
