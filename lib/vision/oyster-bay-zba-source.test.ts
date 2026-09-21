import {afterEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";

import {
  fetchOysterBayZbaRecords,
  mergeOysterBayAppeals,
  parseOysterBayZbaDocument,
  parseOysterBayZbaIndex,
} from "./oyster-bay-zba-source";
import {automatedSourceDefinition} from "./source-registry";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/oyster-bay/${name}`, import.meta.url), "utf8");
const index = fixture("index-2026.html");
const pages = JSON.parse(fixture("september-10.json")) as string[];
const source = automatedSourceDefinition("nassau-town-oyster-bay-records");
const documents = parseOysterBayZbaIndex(index, 2026, source);

afterEach(() => vi.unstubAllGlobals());

describe("Oyster Bay Zoning Board public hearing intake", () => {
  it("discovers only bounded current-year hearing PDFs from the fixed official origin", () => {
    expect(documents).toEqual([
      {meetingDate: "2026-08-20", url: "https://oysterbaytown.com/wp-content/uploads/08-20-PUBLIC-CAL-2.pdf"},
      {meetingDate: "2026-09-10", url: "https://oysterbaytown.com/wp-content/uploads/09-10-PUBLIC-CAL-1.pdf"},
    ]);
    expect(() => parseOysterBayZbaIndex(index, 2027, source)).toThrow("no 2027");
    expect(() => parseOysterBayZbaIndex(index.replace("https://oysterbaytown.com/wp-content/uploads/09-10", "https://evil.test/09-10"), 2026, source)).toThrow("unexpected document");
    expect(() => parseOysterBayZbaIndex(index, 2026, {...source, limits: {...source.limits, maxDocuments: 1}})).toThrow("document limit");
  });

  it("uses the published appeal number as identity and retains the published fields", () => {
    const rows = parseOysterBayZbaDocument(documents[1], pages, "abc123", source);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      externalId: "town-of-oyster-bay:appeal:26-183",
      name: "Trifecta Wellness LLC: Appeal 26-183",
      town: "Massapequa Park",
      county: "Nassau",
      address: "6100 Sunrise Highway, Massapequa Park, NY",
      latitude: null,
      longitude: null,
      sourceDate: "2026-09-10",
      sourceDateLabel: "Hearing date",
      sourceCaseId: "26-183",
      identityStatus: "resolved",
    });
    expect(rows[0].details).toMatchObject({
      "Record type": "Zoning appeal",
      "Hearing number": "1",
      "Appeal number": "26-183",
      Applicant: "Trifecta Wellness LLC",
      Locality: "Massapequa Park",
      "Requested relief": "Variance for the reduction of off-street parking spaces. Reduction of spaces to 76 when 95 parking spaces are required.",
      "Tax section": "53",
      "Tax block": "27",
      "Tax lot": "221",
      Zone: "LI",
    });
    expect(rows[0].evidence?.[0]).toMatchObject({url: documents[1].url, page: 1, checksum: "abc123"});
  });

  it("keeps separate appeals at one address and leaves missing fields empty", () => {
    const rows = parseOysterBayZbaDocument(documents[1], pages, "abc123", source);
    expect(rows.filter(row => row.address === "500 Carman Road, Farmingdale, NY").map(row => row.sourceCaseId)).toEqual(["26-210", "26-211"]);
    const [missing] = parseOysterBayZbaDocument(documents[1], [pages[0].replace("SEC. 53 BLK. 27 LOT 221 ZONE LI", "")], "abc123", source);
    expect(missing.details["Tax section"]).toBeUndefined();
    expect(missing.details.Zone).toBeUndefined();
  });

  it("fails closed when an appeal section has no source-owned identifier", () => {
    expect(() => parseOysterBayZbaDocument(documents[1], [pages[0].replaceAll(/APPEAL NO\. [0-9-]+/g, "APPEAL NUMBER MISSING")], "abc123", source)).toThrow("appeal structure");
  });

  it("merges a repeated appeal by identity, keeps every document capture, and prefers the latest hearing", () => {
    const oldPages = pages.map(page => page.replace("SEPTEMBER 10, 2026", "AUGUST 20, 2026").replaceAll("09/10/26", "08/20/26"));
    const oldRows = parseOysterBayZbaDocument(documents[0], oldPages, "old", source);
    const newRows = parseOysterBayZbaDocument(documents[1], pages, "new", source);
    const merged = mergeOysterBayAppeals([...oldRows, ...newRows], source);
    const appeal = merged.find(row => row.sourceCaseId === "26-183")!;
    expect(appeal.sourceDate).toBe("2026-09-10");
    expect(appeal.evidence).toHaveLength(2);
    expect(appeal.details["Hearing dates"]).toBe("2026-08-20, 2026-09-10");
  });

  it("fails the run when every document has an unexpected content type", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === source.endpoint.url) return new Response(index, {headers: {"content-type": "text/html"}});
      return new Response("not a pdf", {headers: {"content-type": "text/html"}});
    }));
    // Every document fails the same way here, so the run correctly fails rather than
    // reporting a quiet empty success. With more than one document there is no single
    // triggering error left to chain as `cause`, so this checks the aggregate outcome.
    await expect(fetchOysterBayZbaRecords(source)).rejects.toMatchObject({
      name: "SourceCollectionFailure",
      message: expect.stringContaining("rejected every document"),
      progress: {coverage: {year: expect.any(Number), documents: []}, fetched: 0, rejected: documents.length},
    });
  });

  it("rejects oversized bodies", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(source.limits.maxResponseBytes + 1), {headers: {"content-type": "text/html"}})));
    await expect(fetchOysterBayZbaRecords(source)).rejects.toThrow("size limit");
  });

  it("uses the reviewed endpoint and request bound", async () => {
    const reviewed = {...source, endpoint: {url: "https://records.example.test/zba", allowedOrigins: ["https://records.example.test"]}, limits: {...source.limits, maxRequests: 1}};
    const fetcher = vi.fn().mockResolvedValue(new Response(index.replaceAll("https://oysterbaytown.com", "https://records.example.test"), {headers: {"content-type": "text/html"}}));
    vi.stubGlobal("fetch", fetcher);

    await expect(fetchOysterBayZbaRecords(reviewed)).rejects.toThrow("request limit");
    expect(fetcher).toHaveBeenCalledWith(reviewed.endpoint.url, expect.anything());
  });
});

it.skipIf(process.env.VISION_LIVE_SOURCE_CHECK !== "1")("reads current Oyster Bay Zoning Board appeals from the official source", async () => {
  const result = await fetchOysterBayZbaRecords(source);
  expect(result.records.length).toBeGreaterThan(0);
  expect(result.records.every(record => record.sourceCaseId && record.sourceUrl.startsWith("https://oysterbaytown.com/wp-content/uploads/") && record.latitude === null && record.longitude === null)).toBe(true);
});
