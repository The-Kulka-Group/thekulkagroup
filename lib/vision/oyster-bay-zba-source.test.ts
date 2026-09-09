import {afterEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";

import {
  OYSTER_BAY_ZBA_URL,
  fetchOysterBayZbaRecords,
  mergeOysterBayAppeals,
  parseOysterBayZbaDocument,
  parseOysterBayZbaIndex,
} from "./oyster-bay-zba-source";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/oyster-bay/${name}`, import.meta.url), "utf8");
const index = fixture("index-2026.html");
const pages = JSON.parse(fixture("september-10.json")) as string[];
const documents = parseOysterBayZbaIndex(index, 2026);

afterEach(() => vi.unstubAllGlobals());

describe("Oyster Bay Zoning Board public hearing intake", () => {
  it("discovers only bounded current-year hearing PDFs from the fixed official origin", () => {
    expect(documents).toEqual([
      {meetingDate: "2026-08-20", url: "https://oysterbaytown.com/wp-content/uploads/08-20-PUBLIC-CAL-2.pdf"},
      {meetingDate: "2026-09-10", url: "https://oysterbaytown.com/wp-content/uploads/09-10-PUBLIC-CAL-1.pdf"},
    ]);
    expect(() => parseOysterBayZbaIndex(index, 2027)).toThrow("no 2027");
    expect(() => parseOysterBayZbaIndex(index.replace("https://oysterbaytown.com/wp-content/uploads/09-10", "https://evil.test/09-10"), 2026)).toThrow("unexpected document");
  });

  it("uses the published appeal number as identity and retains the published fields", () => {
    const rows = parseOysterBayZbaDocument(documents[1], pages, "abc123");
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
    const rows = parseOysterBayZbaDocument(documents[1], pages, "abc123");
    expect(rows.filter(row => row.address === "500 Carman Road, Farmingdale, NY").map(row => row.sourceCaseId)).toEqual(["26-210", "26-211"]);
    const [missing] = parseOysterBayZbaDocument(documents[1], [pages[0].replace("SEC. 53 BLK. 27 LOT 221 ZONE LI", "")], "abc123");
    expect(missing.details["Tax section"]).toBeUndefined();
    expect(missing.details.Zone).toBeUndefined();
  });

  it("fails closed when an appeal section has no source-owned identifier", () => {
    expect(() => parseOysterBayZbaDocument(documents[1], [pages[0].replaceAll(/APPEAL NO\. [0-9-]+/g, "APPEAL NUMBER MISSING")], "abc123")).toThrow("appeal structure");
  });

  it("merges a repeated appeal by identity, keeps every document capture, and prefers the latest hearing", () => {
    const oldPages = pages.map(page => page.replace("SEPTEMBER 10, 2026", "AUGUST 20, 2026").replaceAll("09/10/26", "08/20/26"));
    const oldRows = parseOysterBayZbaDocument(documents[0], oldPages, "old");
    const newRows = parseOysterBayZbaDocument(documents[1], pages, "new");
    const merged = mergeOysterBayAppeals([...oldRows, ...newRows]);
    const appeal = merged.find(row => row.sourceCaseId === "26-183")!;
    expect(appeal.sourceDate).toBe("2026-09-10");
    expect(appeal.evidence).toHaveLength(2);
    expect(appeal.details["Hearing dates"]).toBe("2026-08-20, 2026-09-10");
  });

  it("rejects unexpected content types, oversized bodies, and partial batches", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === OYSTER_BAY_ZBA_URL) return new Response(index, {headers: {"content-type": "text/html"}});
      return new Response("not a pdf", {headers: {"content-type": "text/html"}});
    }));
    await expect(fetchOysterBayZbaRecords()).rejects.toThrow("content type");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(1_000_001), {headers: {"content-type": "text/html"}})));
    await expect(fetchOysterBayZbaRecords()).rejects.toThrow("size limit");
  });
});

it.skipIf(process.env.VISION_LIVE_SOURCE_CHECK !== "1")("reads current Oyster Bay Zoning Board appeals from the official source", async () => {
  const records = await fetchOysterBayZbaRecords();
  expect(records.length).toBeGreaterThan(0);
  expect(records.every(record => record.sourceCaseId && record.sourceUrl.startsWith("https://oysterbaytown.com/wp-content/uploads/") && record.latitude === null && record.longitude === null)).toBe(true);
});
