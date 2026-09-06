import { createHash } from "node:crypto";
import type { DiscoveredRecord } from "./discovery-source";

import { SUFFOLK_SOURCE } from "./discovery-catalog";
export { SUFFOLK_SOURCE } from "./discovery-catalog";
type Kind = "Staff report" | "Agenda" | "Meeting summary" | "Resolution";
export type SuffolkDocument = { url: string; title: string; kind: Kind; meetingDate: string };
type Evidence = NonNullable<DiscoveredRecord["evidence"]>[number];
const MAX_DOCUMENTS = 80;
const MAX_BYTES = 8_000_000;
const MAX_TOTAL_BYTES = 80_000_000;
const MAX_PAGES = 120;
const MAX_PAGE_TEXT = 40_000;
const CASE = "[A-Za-z]{2}-\\d{2}-\\d{2,3}";
const MUNICIPALITY = "(?:Town|(?:Inc\\.?\\s+)?Village) of [A-Za-z][A-Za-z ]*";
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g, "").replace(/[ \t]+/g, " ").trim();
function htmlText(s: string): string {
  return clean(s.replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&nbsp;|&#160;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'"));
}
function municipality(s: string): string {
  return clean(s).replace(/^Inc\.?\s+Village/i, "Village");
}
function isoDate(s: string): string | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const date = `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}
function safePdfUrl(value: string): string {
  const url = new URL(value, SUFFOLK_SOURCE.url);
  if (url.origin !== "https://www.suffolkcountyny.gov" || url.username || url.password || url.search || !/^\/portals\/0\/formsdocs\/planning\/scplanningcommission\/\d{4}\/[^/]+\.pdf$/i.test(decodeURIComponent(url.pathname))) {
    throw new Error("The Suffolk index linked an unexpected document address.");
  }
  url.hash = "";
  return url.toString();
}
export function parseSuffolkIndex(html: string, year: number): SuffolkDocument[] {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  const heading = new RegExp(`<h[1-6][^>]*>\\s*${year} SCPC Meetings\\s*</h[1-6]>`, "i").exec(stripped);
  if (!heading) throw new Error(`The Suffolk index has no ${year} meeting section.`);
  const section = stripped.slice(heading.index + heading[0].length).split(/<h[1-6][^>]*>/i)[0];
  const docs: SuffolkDocument[] = [];
  for (const row of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length < 6) continue;
    const dateText = htmlText(cells[0]).match(new RegExp(`([A-Za-z]+) (\\d{1,2}), ${year}`));
    if (!dateText) continue;
    const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].findIndex(m => m.toLowerCase() === dateText[1].toLowerCase()) + 1;
    const meetingDate = month ? isoDate(`${month}/${dateText[2]}/${year}`) : null;
    if (!meetingDate) throw new Error("The Suffolk index has an unreadable meeting date.");
    for (const [column, kind] of [[2, "Agenda"], [3, "Staff report"], [4, "Meeting summary"], [5, "Resolution"]] as const) {
      for (const link of cells[column].matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const url = safePdfUrl(link[1].replace(/&amp;/gi, "&"));
        docs.push({ url, title: htmlText(link[2]), kind, meetingDate });
      }
    }
  }
  const unique = [...new Map(docs.map(d => [d.url, d])).values()].sort((a, b) => a.url.localeCompare(b.url));
  if (!unique.length || unique.length > MAX_DOCUMENTS) throw new Error("The Suffolk document list is empty or exceeds the 80-document limit. Earlier finds have been kept.");
  return unique;
}

/** Only embedded PDF text is read. Images and drawing attachments are never interpreted. */
export async function extractSuffolkPages(bytes: Uint8Array, signal?: AbortSignal): Promise<string[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true, verbosity: 0 });
  const abort = () => { void task.destroy(); };
  signal?.throwIfAborted();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const pdf = await task.promise;
    if (!pdf.numPages || pdf.numPages > MAX_PAGES) throw new Error("The Suffolk PDF exceeds the 120-page limit.");
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal?.throwIfAborted();
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is Extract<typeof item, { str: string }> => "str" in item).filter(item => item.str.trim());
      // The content stream can put every label before its value. Physical coordinates
      // restore line order without rendering or interpreting the page's drawings.
      items.sort((a, b) => Math.abs(a.transform[5] - b.transform[5]) < 2 ? a.transform[4] - b.transform[4] : b.transform[5] - a.transform[5]);
      let y: number | undefined;
      let line = "";
      const lines: string[] = [];
      for (const item of items) {
        if (y !== undefined && Math.abs(item.transform[5] - y) >= 2) { lines.push(clean(line)); line = ""; }
        line += ` ${item.str}`;
        y = item.transform[5];
      }
      if (line) lines.push(clean(line));
      const text = lines.join("\n");
      if (text.length > MAX_PAGE_TEXT) throw new Error("A Suffolk PDF page exceeds the text limit.");
      pages.push(text);
      page.cleanup();
    }
    if (pages.join("").trim().length < 80) throw new Error("The Suffolk PDF has no usable embedded text. Earlier finds have been kept.");
    return pages;
  } finally { signal?.removeEventListener("abort", abort); await task.destroy(); }
}
function field(text: string, label: string): string {
  return clean(new RegExp(`^${label}:\\s*(.*)$`, "mi").exec(text)?.[1] ?? "");
}
function evidence(doc: SuffolkDocument, pages: string[], checksum: string): Evidence[] {
  return pages.map((text, i) => ({ url: doc.url, title: `${doc.kind}: ${doc.title}`, checksum, page: i + 1, text }));
}
function record(doc: SuffolkDocument, ev: Evidence[], file = "", town = "", name = "", address = "", received: string | null = null, policy = false, reason = ""): DiscoveredRecord {
  const resolved = Boolean(file && town && !reason);
  return {
    externalId: resolved ? `case:${municipality(town).toLowerCase()}:${file}` : `document:${hash(doc.url)}`,
    name: name || (/^(?:Agenda|Summary|Resolutions?)$/i.test(doc.title) ? `${doc.kind}: ${doc.meetingDate}` : doc.title) || `${doc.kind}: ${doc.meetingDate}`,
    town: municipality(town), county: "Suffolk", address,
    latitude: null, longitude: null,
    sourceTitle: `Suffolk Planning Commission: ${doc.kind}`, sourceUrl: ev[0]?.url ?? doc.url,
    sourceDate: received ?? doc.meetingDate, sourceDateLabel: received ? "Received date" : "Meeting date",
    details: { "Record type": doc.kind, "Meeting date": doc.meetingDate, "Evidence text": "Embedded PDF text with physical page references.", ...(file ? { "File number": file } : {}), ...(received ? { "Received date": received } : {}), ...(!resolved ? { "Identity review": reason || "The document needs a confirmed municipality and application file number." } : {}) },
    evidence: ev, classification: policy ? "policy" : "opportunity", identityStatus: resolved ? "resolved" : "unresolved", ...(resolved ? { sourceCaseId: file } : {}),
  };
}
export function parseSuffolkDocument(doc: SuffolkDocument, pages: string[], checksum: string): DiscoveredRecord[] {
  const ev = evidence(doc, pages, checksum);
  if (doc.kind === "Staff report") {
    const first = pages[0] || "";
    const fileText = field(first, "File Number");
    const file = new RegExp(`^${CASE}$`).test(fileText) ? fileText : "";
    const townText = field(first, "Municipality");
    const town = new RegExp(`^${MUNICIPALITY}$`, "i").test(townText) ? townText : "";
    const name = field(first, "Petitioner") || field(first, "Applicant") || doc.title;
    const locationLines = first.split("\n");
    const locationIndex = locationLines.findIndex(line => /^Location:/i.test(line));
    const addressParts: string[] = [];
    if (locationIndex >= 0) {
      addressParts.push(locationLines[locationIndex].replace(/^Location:\s*/i,""));
      for (const line of locationLines.slice(locationIndex+1)) {
        if (/^[A-Za-z][A-Za-z .]*:/.test(line) || addressParts.length>=4) break;
        addressParts.push(line);
      }
    }
    const address = clean(addressParts.join(" "));
    const kind = field(first, "Type of Action") || field(first, "Jurisdiction");
    const identifiers = [...`${decodeURIComponent(doc.url)} ${doc.title}`.matchAll(new RegExp(CASE, "g"))].map(m => m[0]);
    const conflict = file && identifiers.some(id => id !== file);
    const policy = /moratorium|comp(?:rehensive)?\.? plan|land use plan|zoning (?:text|code) amendment|town.wide|village.wide/i.test(`${doc.title} ${address} ${kind}`);
    const row = record(doc, ev, file, town, name, address, isoDate(field(first, "Received")), policy, conflict ? "The index or filename and the report disagree about the file number." : "");
    if (field(first,"Type of Action")) row.details["Type of Action"] = field(first,"Type of Action");
    if (field(first,"Jurisdiction")) row.details["Jurisdiction"] = field(first,"Jurisdiction");
    return [row];
  }
  if (doc.kind === "Agenda") {
    const rows: DiscoveredRecord[] = [];
    for (let page = 0; page < pages.length; page++) {
      const pattern = new RegExp(`(?:^|\\n)[•*\\s]*(${CASE})\\s+([^\\n]+?),\\s*(${MUNICIPALITY})\\s*(?=\\n|$)`, "g");
      for (const match of pages[page].matchAll(pattern)) {
        const policy = /moratorium|comp(?:rehensive)?\.? plan|land use plan|zoning (?:text|code) amendment|town.wide|village.wide/i.test(match[2]);
        rows.push(record(doc, [ev[page]], match[1], match[3], clean(match[2]), "", null, policy));
      }
    }
    if (rows.length) return [...rows, record(doc, ev, "", "", "", "", null, false, "Full agenda retained for review, including items without a parsed application identifier.")];
  }
  // Minutes and resolutions contain voting tables and more than one case. Retain
  // the document for explicit review rather than assigning an arbitrary town.
  return [record(doc, ev)];
}
export function mergeSuffolkRecords(records: DiscoveredRecord[]): DiscoveredRecord[] {
  const grouped = new Map<string, DiscoveredRecord>();
  // Staff facts take priority over agenda headings, without erasing either source.
  const sorted = [...records].sort((a, b) => Number(b.details["Record type"] === "Staff report") - Number(a.details["Record type"] === "Staff report") || a.sourceUrl.localeCompare(b.sourceUrl));
  for (const row of sorted) {
    const previous = grouped.get(row.externalId);
    if (!previous) { grouped.set(row.externalId, { ...row, evidence: [...(row.evidence || [])] }); continue; }
    const conflicts = ["name", "address", "sourceDate"] as const;
    if (conflicts.some(key => previous[key] && row[key] && previous[key] !== row[key] && (key !== "sourceDate" || previous.sourceDateLabel === row.sourceDateLabel))) {
      previous.details["Conflicting source facts"] = "Sources use different names, locations or dates for this case. Review each document before relying on a field.";
    }
    previous.evidence = [...(previous.evidence || []), ...(row.evidence || [])];
    if (row.classification === "policy") previous.classification = "policy";
  }
  for (const row of grouped.values()) {
    row.evidence = [...new Map((row.evidence || []).map(e => [`${e.url}:${e.checksum}:${e.page}`, e])).values()].sort((a, b) => a.url.localeCompare(b.url) || a.checksum.localeCompare(b.checksum) || a.page - b.page);
    if (row.evidence.length > 240) throw new Error("A Suffolk case exceeds the evidence page limit.");
    row.details["Evidence pages"] = String(row.evidence.length);
  }
  return [...grouped.values()].sort((a, b) => a.externalId.localeCompare(b.externalId));
}
async function readAttempt(url: string, max: number, deadline: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.any([deadline, AbortSignal.timeout(30_000)]), redirect: "error", cache: "no-store", headers: { "User-Agent": "Mozilla/5.0 (compatible; KulkaVision public-record collector)", Accept: url === SUFFOLK_SOURCE.url ? "text/html" : "application/pdf" } });
  if (!response.ok) throw new Error(`The Suffolk source returned HTTP ${response.status}. Earlier finds have been kept.`);
  if (!response.body) throw new Error("The Suffolk source returned an empty body.");
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max) throw new Error("The Suffolk source exceeded the response size limit.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  return new Uint8Array(Buffer.concat(chunks));
}
async function read(url: string, max: number, deadline: AbortSignal): Promise<Uint8Array> {
  try { return await readAttempt(url, max, deadline); }
  catch (error) {
    deadline.throwIfAborted();
    const retryable = error instanceof Error && (error.name === "TimeoutError" || error.message === "fetch failed" || /HTTP 5\d\d/.test(error.message));
    if (!retryable) throw error;
    return readAttempt(url, max, deadline);
  }
}
export async function fetchSuffolkRecords(): Promise<DiscoveredRecord[]> {
  const controller = new AbortController();
  const deadline = AbortSignal.any([controller.signal, AbortSignal.timeout(180_000)]);
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "America/New_York", year: "numeric" }).format(new Date()));
  const html = await read(SUFFOLK_SOURCE.url, 1_000_000, deadline);
  const docs = parseSuffolkIndex(new TextDecoder().decode(html), year);
  let next = 0;
  let bytesRead = html.length;
  const results: DiscoveredRecord[][] = [];
  // Three workers bound bandwidth and keep the whole scan within the source lease.
  await Promise.all(Array.from({ length: 3 }, async () => {
    try {
    for (;;) {
      const index = next++;
      if (index >= docs.length) return;
      deadline.throwIfAborted();
      const bytes = await read(docs[index].url, MAX_BYTES, deadline);
      bytesRead += bytes.length;
      if (bytesRead > MAX_TOTAL_BYTES) throw new Error("The Suffolk scan exceeded the total download limit.");
      if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("The Suffolk source returned a non-PDF document.");
      const checksum = hash(bytes);
      const pages = await extractSuffolkPages(bytes, deadline);
      deadline.throwIfAborted();
      results[index] = parseSuffolkDocument(docs[index], pages, checksum);
    }
    } catch (error) { controller.abort(error); throw error; }
  }));
  const records = mergeSuffolkRecords(results.flat());
  for (const row of records) {
    row.details["Collection year"] = String(year);
    row.details["Documents checked"] = String(docs.length);
  }
  return records;
}
