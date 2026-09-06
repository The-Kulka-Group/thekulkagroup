import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fetchNassauIdaRecords, fetchSuffolkIdaRecords, parseNassauIdaPage, parseSuffolkIdaIndex } from "./ida-source";
const fixture = (name: string) => readFileSync(new URL(`./fixtures/ida/${name}.html`, import.meta.url), "utf8");
const first = fixture("nassau-first"), last = fixture("nassau-last"), suffolk = fixture("suffolk-index");
afterEach(() => vi.unstubAllGlobals());
describe("IDA public index collection", () => {
  it("keeps Nassau addresses, assistance status and listed document dates with metadata provenance", () => {
    const parsed = parseNassauIdaPage(first);
    expect(parsed.next).toBe("https://nassauida.org/projects-documents?page=1");
    expect(parsed.records).toHaveLength(10);
    const flowers = parsed.records.find(record => record.name === "1-800-Flowers.com, Inc.")!;
    expect(flowers.address).toContain("2 Jericho Plaza");
    expect(flowers.town).toBe("Jericho");
    expect(flowers.details["IDA status"]).toBe("Active");
    expect(flowers.latitude).toBeNull();
    expect(flowers.evidence?.[0].kind).toBe("index-link");
    expect(flowers.evidence?.[0].text).toContain("PDF contents were not read");
    expect(flowers.sourceDateLabel).toBe("Latest listed document date");
    expect(flowers.sourceDate).toMatch(/^20\d\d-\d\d-\d\d$/);
    expect(parseNassauIdaPage(last).next).toBeNull();
    expect(parseNassauIdaPage(last).records).toHaveLength(2);
  });
  it("keeps Nassau identity stable when documents or status change and leaves unknown dates blank", () => {
    const original = parseNassauIdaPage(first).records[0];
    const changed = parseNassauIdaPage(first.replaceAll("Active", "Inactive").replace(/<span class="doc-date">[\s\S]*?<\/span>/g, "")).records[0];
    expect(changed.externalId).toBe(original.externalId);
    expect(changed.sourceDate).toBeNull();
  });
  it("follows Nassau next-page links before returning records", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(first.replace("of 212 results", "of 12 results"))).mockResolvedValueOnce(new Response(last.replace("211 - 212 of 212", "11 - 12 of 12")));
    vi.stubGlobal("fetch", fetcher);
    const records = await fetchNassauIdaRecords();
    expect(records).toHaveLength(12);
    expect(fetcher.mock.calls[1][0]).toBe("https://nassauida.org/projects-documents?page=1");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error", cache: "no-store" });
  });
  it("fails a partial Nassau scan on missing pages, repeated pagination and foreign links", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(first)).mockResolvedValue(new Response("unavailable", {status:403})));
    await expect(fetchNassauIdaRecords()).rejects.toThrow("HTTP 403");
    let calls=0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(first.replace("1 - 10 of 212", `${calls++ * 10 + 1} - ${calls * 10} of 212`)))));
    await expect(fetchNassauIdaRecords()).rejects.toThrow("repeated a page");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(first)).mockResolvedValueOnce(new Response(last)));
    await expect(fetchNassauIdaRecords()).rejects.toThrow("skipped records");
    expect(() => parseNassauIdaPage(first.replace('href="?page=1" title="Go to next page"','href="https://evil.test/?page=1" title="Go to next page"'))).toThrow("unexpected next page");
    expect(() => parseNassauIdaPage(first.replaceAll("nassauida-assets.s3.amazonaws.com", "evil.test"))).toThrow("unexpected document");
    expect(() => parseNassauIdaPage(first.replace(/rel="next"/g, ""))).toThrow("pagination disagree");
    expect(() => parseNassauIdaPage("<html>Login required</html>")).toThrow("table is missing");
  });
  it("stops Nassau collection at the declared 30-page limit", async () => {
    let page = 0;
    const fetcher = vi.fn().mockImplementation(() => {
      page++;
      return Promise.resolve(new Response(first.replace("1 - 10 of 212", `${(page-1)*10+1} - ${page*10} of 1000`).replace('href="?page=1" title="Go to next page"', `href="?page=${page}" title="Go to next page"`)));
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchNassauIdaRecords()).rejects.toThrow("30-page limit");
    expect(fetcher).toHaveBeenCalledTimes(30);
  });
  it("collects named Suffolk documents without treating meetings as projects or company names as locations", () => {
    const records = parseSuffolkIdaIndex(suffolk);
    expect(records.length).toBeGreaterThan(15);
    expect(records.every(record => record.name !== "IDA Agenda" && !record.name.includes("Schedule of"))).toBe(true);
    expect(records.every(record => record.address === "" && record.town === "" && record.latitude === null && record.identityStatus === "unresolved")).toBe(true);
    const arkay = records.filter(record => record.name === "REP 80 Arkay Drive LLC");
    expect(arkay).toHaveLength(3);
    expect(new Set(arkay.map(record => record.externalId)).size).toBe(3);
    expect(arkay.some(record => record.sourceDate === "2026-08-13")).toBe(true);
    expect(records.every(record => record.sourceDateLabel === "Latest index meeting date")).toBe(true);
  });
  it("deduplicates a Suffolk document republished at another meeting while preserving both dates", () => {
    const records = parseSuffolkIdaIndex(suffolk);
    const sourceOne = records.filter(record => record.name === "Source One Packaging LLC");
    const abstract = sourceOne.find(record => record.details["Record type"] === "IDA project abstract")!;
    expect(sourceOne).toHaveLength(2);
    expect(abstract.evidence).toHaveLength(2);
    expect(abstract.evidence?.map(item => item.text).join(" ")).toContain("2025-09-25");
    expect(abstract.evidence?.map(item => item.text).join(" ")).toContain("2025-10-23");
    expect(abstract.sourceDate).toBe("2025-10-23");
    expect(parseSuffolkIdaIndex(suffolk.replace("REP 80 Arkay Drive LLC - Project Abstract", "REP 80 Arkay Drive LLC Revised - Project Abstract"))[0].externalId).toBe(records[0].externalId);
  });
  it("rejects unsupported or untrusted documents and oversized responses", async () => {
    expect(() => parseSuffolkIdaIndex(suffolk.replaceAll("https://suffolkida.org/wp-content", "https://evil.test/wp-content"))).toThrow("unexpected document");
    expect(() => parseSuffolkIdaIndex(suffolk.replaceAll("Project Abstract", "Annual report").replaceAll("IDA Application", "Agenda").replace(/ - Abstract/g, " - Minutes"))).toThrow("no supported project");
    expect(() => parseNassauIdaPage(first.replace('class="doc-date">4/1/20', 'class="doc-date">2/30/20'))).toThrow("unreadable date");
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response("x".repeat(2_000_001)))));
    await expect(fetchSuffolkIdaRecords()).rejects.toThrow("size limit");
  });
});
