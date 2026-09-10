import {afterEach, describe, expect, it, vi} from "vitest";

import type {AutomatedSourceDefinition} from "./source-registry";
import {AUTOMATED_SOURCE_DEFINITIONS} from "./source-registry";
import {
  fetchCivicPlusRecords,
  mergeCivicPlusRecords,
  parseCivicPlusCategory,
  parseCivicPlusDocument,
  type CivicPlusDocument,
} from "./civicplus-source";

const planningSource: AutomatedSourceDefinition = {
  id: "nassau-village-hempstead-records",
  name: "Hempstead Village Planning Board records",
  officialAgency: "Village of Hempstead Planning Board",
  jurisdiction: "Hempstead",
  county: "Nassau",
  adapterKey: "civicplus-agenda-center",
  directoryUrl: "https://www.villageofhempstead.org/AgendaCenter/Planning-Board-3",
  endpoint: {
    url: "https://www.villageofhempstead.org/AgendaCenter/Planning-Board-3",
    allowedOrigins: ["https://www.villageofhempstead.org"],
  },
  limits: {maxRequests: 13, maxRecords: 200, maxResponseBytes: 5_000_000, maxDurationMs: 60_000, maxDocuments: 12, maxMeetings: 12, maxPages: 40, maxYears: 2, maxTotalResponseBytes: 40_000_000},
  identityRule: "Test rule.",
  evidenceRule: "Test evidence.",
  coverage: "Test coverage.",
  schedule: {cadence: "daily"},
  enabled: true,
};

const categoryHtml = `
<table>
  <tr id="row1174abc" class="catAgendaRow">
    <td><h3><strong aria-label="Agenda for July 20, 2026">Jul 20, 2026</strong></h3>
      <a href="/AgendaCenter/ViewFile/Agenda/_07202026-1174">Planning Board Agenda</a>
      <a href="/AgendaCenter/ViewFile/Agenda/_07202026-1174">Agenda</a>
      <a href="/AgendaCenter/ViewFile/Minutes/_07202026-1174">Minutes</a>
    </td>
  </tr>
  <tr id="row999abc" class="catAgendaRow">
    <td><h3><strong aria-label="Agenda for July 20, 2024">Jul 20, 2024</strong></h3>
      <a href="/AgendaCenter/ViewFile/Agenda/_07202024-999">Agenda</a>
    </td>
  </tr>
</table>`;

const agenda: CivicPlusDocument = {
  categoryId: 3,
  meetingId: 1174,
  meetingDate: "2026-07-20",
  kind: "Agenda",
  title: "Planning Board Agenda",
  url: "https://www.villageofhempstead.org/AgendaCenter/ViewFile/Agenda/_07202026-1174",
};

const evidenceChecksum = "a".repeat(64);

afterEach(() => vi.unstubAllGlobals());

describe("CivicPlus Agenda Center source", () => {
  it("discovers bounded meeting documents by category, date, meeting ID and kind", () => {
    expect(parseCivicPlusCategory(categoryHtml, planningSource, 2026)).toEqual([
      agenda,
      {...agenda, kind: "Minutes", title: "Minutes", url: "https://www.villageofhempstead.org/AgendaCenter/ViewFile/Minutes/_07202026-1174"},
    ]);
    expect(() => parseCivicPlusCategory(categoryHtml.replace("/AgendaCenter/ViewFile/Agenda/", "https://evil.test/AgendaCenter/ViewFile/Agenda/"), planningSource, 2026)).toThrow("unexpected document address");
  });

  it("extracts Hempstead Planning cases with source-owned identity and page evidence", () => {
    const pages = [`INCORPORATED VILLAGE OF HEMPSTEAD\nPLANNING BOARD MEETING\nJuly 20, 2026\nCASE 2026-29: 247 Greenwich Street\nPropose: New Signage for Splash Car Wash\nSec. 34 Blk. 369 Lot.159`];
    const [record] = parseCivicPlusDocument(planningSource, agenda, pages, evidenceChecksum);

    expect(record).toMatchObject({
      externalId: "case:3:2026-07-20:1174:2026-29",
      sourceCaseId: "2026-29",
      identityStatus: "resolved",
      town: "Hempstead",
      address: "247 Greenwich Street",
      sourceDate: "2026-07-20",
      details: {
        Board: "Village of Hempstead Planning Board",
        "Case number": "2026-29",
        "Proposed work": "New Signage for Splash Car Wash",
        "CivicPlus meeting ID": "1174",
      },
    });
    expect(record.evidence).toEqual([{url: agenda.url, title: "Agenda: Planning Board Agenda", checksum: evidenceChecksum, page: 1, text: pages[0]}]);
  });

  it("keeps duplicate Hempstead Zoning case numbers unresolved", () => {
    const zoningSource = {...planningSource, id: "nassau-village-hempstead-zoning-records", name: "Hempstead Village Zoning Board records", officialAgency: "Village of Hempstead Board of Zoning Appeals", directoryUrl: "https://www.villageofhempstead.org/AgendaCenter/Zoning-Board-of-Appeals-5", endpoint: {...planningSource.endpoint, url: "https://www.villageofhempstead.org/AgendaCenter/Zoning-Board-of-Appeals-5"}};
    const zoningDoc = {...agenda, categoryId: 5};
    const pages = [
      "CASE #26-0864 - Application of Rachael Judge - Permission to perform interior alterations to medical use at 166 Fulton Ave., Hempstead, NY 11550",
      "CASE #26-0864 - Application of Harrison Lowe - Permission to maintain cellar entrance at 50 Grant St., Hempstead, NY 11550",
    ];
    const records = parseCivicPlusDocument(zoningSource, zoningDoc, pages, evidenceChecksum);

    expect(records).toHaveLength(2);
    expect(records.every(record => record.identityStatus === "unresolved" && record.sourceCaseId === undefined)).toBe(true);
    expect(new Set(records.map(record => record.externalId)).size).toBe(2);
  });

  it("extracts Garden City building applications without guessing map coordinates", () => {
    const gardenSource = {...planningSource, id: "nassau-village-garden-city-records", name: "Garden City Zoning Board records", officialAgency: "Village of Garden City Zoning Board of Appeals", jurisdiction: "Garden City", directoryUrl: "https://www.gardencityny.net/AgendaCenter/Zoning-Board-of-Appeals-9", endpoint: {url: "https://www.gardencityny.net/AgendaCenter/Zoning-Board-of-Appeals-9", allowedOrigins: ["https://www.gardencityny.net"]}};
    const gardenDoc = {...agenda, categoryId: 9, url: "https://www.gardencityny.net/AgendaCenter/ViewFile/Agenda/_08042026-597", meetingId: 597, meetingDate: "2026-08-04"};
    const pages = [`1. APPLICATION & APPEAL OF MICHAEL & KATHRYN RAFFERTY, in accordance with Village Code, for permission to apply for permits, to construct and maintain an 8 x 8 in-ground spa in the rear yard of the premises known as 64 SECOND STREET (Map of Garden City Central, Block 28, Lot 5, R-20 district). Building Department application# 2026-180, Templeton Landscape Design.`];
    const [record] = parseCivicPlusDocument(gardenSource, gardenDoc, pages, evidenceChecksum);

    expect(record).toMatchObject({
      externalId: "application:9:2026-08-04:597:2026-180",
      sourceCaseId: "2026-180",
      identityStatus: "resolved",
      town: "Garden City",
      address: "64 SECOND STREET",
      latitude: null,
      longitude: null,
      details: {Applicant: "MICHAEL & KATHRYN RAFFERTY", "Building application number": "2026-180"},
    });
  });

  it("keeps document revisions and later minutes as distinct evidence captures", () => {
    const first = parseCivicPlusDocument(planningSource, agenda, ["CASE 2026-29: 247 Greenwich Street\nPropose: New Signage\nSec. 34 Blk. 369 Lot.159"], "a".repeat(64));
    const revised = parseCivicPlusDocument(planningSource, agenda, ["CASE 2026-29: 247 Greenwich Street\nPropose: Revised Signage\nSec. 34 Blk. 369 Lot.159"], "b".repeat(64));
    const minutes = parseCivicPlusDocument(planningSource, {...agenda, kind: "Minutes"}, ["CASE 2026-29: 247 Greenwich Street\nPropose: Revised Signage\nSec. 34 Blk. 369 Lot.159"], "c".repeat(64));
    const [record] = mergeCivicPlusRecords([...first, ...revised, ...minutes]);

    expect(record.externalId).toBe("case:3:2026-07-20:1174:2026-29");
    expect(record.evidence?.map(item => `${item.title}:${item.checksum}`)).toEqual([
      `Agenda: Planning Board Agenda:${"a".repeat(64)}`,
      `Agenda: Planning Board Agenda:${"b".repeat(64)}`,
      `Minutes: Planning Board Agenda:${"c".repeat(64)}`,
    ]);
  });

  it("keeps a reused case number in separate meeting records", () => {
    const first = parseCivicPlusDocument(planningSource, agenda, ["CASE 2026-29: 247 Greenwich Street\nPropose: New Signage"], "a".repeat(64));
    const laterDocument = {...agenda, meetingDate: "2026-08-17", meetingId: 1201, url: "https://www.villageofhempstead.org/AgendaCenter/ViewFile/Agenda/_08172026-1201"};
    const later = parseCivicPlusDocument(planningSource, laterDocument, ["CASE 2026-29: 12 Main Street\nPropose: New Apartments"], "b".repeat(64));
    const records = mergeCivicPlusRecords([...first, ...later]);

    expect(records).toHaveLength(2);
    expect(records.map(record => record.externalId)).toEqual([
      "case:3:2026-07-20:1174:2026-29",
      "case:3:2026-08-17:1201:2026-29",
    ]);
    expect(records.map(record => record.address)).toEqual(["247 Greenwich Street", "12 Main Street"]);
  });

  it("collects PDF facts and leaves a public non-PDF meeting document unresolved", async () => {
    const pdf = new Uint8Array(Buffer.from("%PDF-synthetic"));
    const docx = new Uint8Array(Buffer.from("PK-synthetic"));
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url === planningSource.endpoint.url) return new Response(categoryHtml, {headers: {"content-type": "text/html; charset=utf-8"}});
      if (url.includes("/Agenda/")) return new Response(pdf, {headers: {"content-type": "application/pdf"}});
      return new Response(docx, {headers: {"content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}});
    }));

    const result = await fetchCivicPlusRecords(planningSource, {year: 2026, extractPdf: async () => ["CASE 2026-29: 247 Greenwich Street\nPropose: New Signage\nSec. 34 Blk. 369 Lot.159"]});
    expect(result.records).toHaveLength(2);
    expect(result.records.find(record => record.sourceCaseId === "2026-29")?.identityStatus).toBe("resolved");
    expect(result.records.find(record => record.details["Document format"] === "Microsoft Word")?.identityStatus).toBe("unresolved");
    expect(result.coverage).toEqual({year: 2026, documents: [agenda.url, agenda.url.replace("/Agenda/", "/Minutes/")]});
  });

  it("keeps a scanned PDF without embedded text as an unresolved meeting document", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => String(input) === planningSource.endpoint.url
      ? new Response(categoryHtml.replace(/<a href="\/AgendaCenter\/ViewFile\/Minutes\/[\s\S]*?<\/a>/, ""), {headers: {"content-type": "text/html"}})
      : new Response(new Uint8Array(Buffer.from("%PDF-synthetic")), {headers: {"content-type": "application/pdf"}})));

    const result = await fetchCivicPlusRecords(planningSource, {year: 2026, extractPdf: async () => []});
    expect(result.records).toHaveLength(1);
    expect(result.records[0]).toMatchObject({identityStatus: "unresolved", details: {"Document format": "PDF without readable text"}});
  });
});

const liveIt = process.env.VISION_LIVE_SOURCE_CHECK === "1" ? it : it.skip;
describe("CivicPlus live source access", () => {
  liveIt("reads the three fixed public categories without request input", async () => {
    const sources = AUTOMATED_SOURCE_DEFINITIONS.filter(source => source.adapterKey === "civicplus-agenda-center");
    expect(sources).toHaveLength(3);
    for (const source of sources) {
      const result = await fetchCivicPlusRecords(source);
      expect(result.coverage?.documents.length).toBeGreaterThan(0);
      expect(result.records.length).toBeGreaterThan(0);
      expect(result.records.every(record => new URL(record.sourceUrl).origin === new URL(source.endpoint.url).origin)).toBe(true);
    }
  }, 240_000);
});
