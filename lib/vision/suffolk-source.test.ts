import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { SUFFOLK_SOURCE, parseSuffolkIndex, parseSuffolkDocument, mergeSuffolkRecords, fetchSuffolkRecords, type SuffolkDocument } from "./suffolk-source";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/suffolk/${name}`, import.meta.url), "utf8");
const elwood = JSON.parse(fixture("elwood.json")) as string[];
const conflict = JSON.parse(fixture("brookhaven-conflict.json")) as string[];
const agenda = JSON.parse(fixture("june-agenda.json")) as string[];
const index = fixture("index-2026.html");
const docs = parseSuffolkIndex(index, 2026);
const staff = docs.find(d => d.title.includes("Estates at Elwood"))!;
afterEach(() => vi.unstubAllGlobals());
describe("Suffolk public document intake", () => {
  it("reads current-year actual anchors and leaves notices and comments out", () => {
    expect(docs).toHaveLength(48);
    expect(docs.filter(d => d.kind === "Staff report")).toHaveLength(24);
    expect(docs.some(d => d.title.includes("Rules") || d.title === "Notice")).toBe(false);
    expect(docs.every(d => d.meetingDate < "2026-09-01")).toBe(true);
  });
  it("fails closed on missing year and foreign document URLs", () => {
    expect(() => parseSuffolkIndex(index, 2027)).toThrow("no 2027");
    expect(() => parseSuffolkIndex(index.replaceAll('href="/Portals/', 'href="https://evil.test/Portals/'), 2026)).toThrow("unexpected document");
  });
  it("uses the file and municipality from staff text and retains labeled evidence", () => {
    const [row] = parseSuffolkDocument(staff, elwood, "abc");
    expect(row).toMatchObject({ externalId: "case:town of huntington:HU-26-05", sourceDate: "2026-05-08", sourceDateLabel: "Received date", latitude: null, longitude: null, identityStatus: "resolved" });
    expect(row.address).toContain("Jericho Turnpike");
    expect(row.evidence?.[1].text).toContain("54");
    expect(row.evidence?.[1].text).toContain("46");
    expect(row.evidence?.[0]).toMatchObject({ checksum: "abc", page: 1, url: `${staff.url}#page=1` });
    expect(row.details["Meeting date"]).toBe("2026-06-03");
  });
  it("does not resolve a title and body file-number conflict", () => {
    const doc = docs.find(d => d.title.includes("BR-26-28"))!;
    const [row] = parseSuffolkDocument(doc, conflict, "abc");
    expect(row.identityStatus).toBe("unresolved");
    expect(row.classification).toBe("policy");
    expect(row.sourceCaseId).toBeUndefined();
    expect(row.details["Identity review"]).toContain("disagree");
  });
  it("extracts four agenda cases and keeps Islandia separate from Islip", () => {
    const doc = docs.find(d => d.kind === "Agenda" && d.meetingDate === "2026-06-03")!;
    const rows = parseSuffolkDocument(doc, agenda, "abc");
    expect(rows).toHaveLength(4);
    expect(rows[3]).toMatchObject({ town: "Village of Islandia", sourceCaseId: "Is-26-02" });
    expect(rows[2].evidence?.[0].page).toBe(2);
  });
  it("groups repeat case evidence, preserves revisions and gives staff fields priority", () => {
    const report = parseSuffolkDocument(staff, elwood, "v1");
    const revised = parseSuffolkDocument(staff, elwood, "v2");
    const doc = docs.find(d => d.kind === "Agenda" && d.meetingDate === "2026-06-03")!;
    const rows = parseSuffolkDocument(doc, agenda, "agenda");
    const merged = mergeSuffolkRecords([...rows, ...report, ...report, ...revised]);
    const row = merged.find(r => r.sourceCaseId === "HU-26-05")!;
    expect(merged).toHaveLength(4);
    expect(row.sourceDateLabel).toBe("Received date");
    expect(row.evidence).toHaveLength(5);
    expect(mergeSuffolkRecords([...revised, ...report, ...rows])).toEqual(merged);
  });
  it("keeps missing IDs and document-level minutes unresolved", () => {
    const [missing] = parseSuffolkDocument(staff, [elwood[0].replace("File Number: HU-26-05", "File Number:")], "abc");
    expect(missing.identityStatus).toBe("unresolved");
    const doc: SuffolkDocument = { ...staff, kind: "Meeting summary" };
    expect(parseSuffolkDocument(doc, ["HU-26-05 Town of Huntington\nTown of Islip voting table"], "abc")[0].identityStatus).toBe("unresolved");
  });
  it("does not turn an invalid received date into a filing date", () => {
    const [row] = parseSuffolkDocument(staff, [elwood[0].replace("05/08/2026", "99/99/2026")], "abc");
    expect(row.sourceDateLabel).toBe("Meeting date");
    expect(row.sourceDate).toBe("2026-06-03");
  });
  it("rejects oversized source responses and never returns a partial batch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("x".repeat(1_000_001))));
    await expect(fetchSuffolkRecords()).rejects.toThrow("size limit");
  });
  it("rejects a linked non-PDF response", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(url === SUFFOLK_SOURCE.url ? index : "not a PDF")));
    await expect(fetchSuffolkRecords()).rejects.toThrow("non-PDF");
  });
});
