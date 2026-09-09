import {createHash} from "node:crypto";

import type {DiscoveredRecord} from "./discovery-source";
import {readPublicSource} from "./source-fetch";

export const OYSTER_BAY_ZBA_URL = "https://oysterbaytown.com/calendars/zoning-board-of-appeals/";

export type OysterBayZbaDocument = {meetingDate: string; url: string};

const OFFICIAL_ORIGIN = "https://oysterbaytown.com";
const MAX_DOCUMENTS = 26;
const MAX_DOCUMENT_BYTES = 2_000_000;
const MAX_INDEX_BYTES = 1_000_000;
const MAX_TOTAL_BYTES = 30_000_000;
const MAX_PAGES = 20;
const MAX_PAGE_TEXT = 50_000;
const MAX_RECORDS = 500;

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const clean = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000e-\u001f]/g, "").replace(/[ \t]+/g, " ").trim();
const htmlText = (value: string) => clean(value.replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&nbsp;|&#160;/gi, " ").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'"));

function titleCase(value: string): string {
  const fixed = new Set(["LLC", "LLP", "LP", "PC", "PLLC", "INC", "NY"]);
  return clean(value).split(" ").map(word => fixed.has(word) || /\d/.test(word) ? word : word.toLowerCase().replace(/(^|[-'])\p{L}/gu, letter => letter.toUpperCase())).join(" ");
}

function dateFromLabel(value: string, expectedYear: number): string | null {
  const match = clean(value).match(/^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})/i);
  if (!match || Number(match[3]) !== expectedYear) return null;
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(match[1].toLowerCase()) + 1;
  const valueDate = `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  const parsed = new Date(`${valueDate}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === valueDate ? valueDate : null;
}

function safeDocumentUrl(raw: string): string {
  const url = new URL(raw.replace(/&amp;/gi, "&"), OYSTER_BAY_ZBA_URL);
  if (url.origin !== OFFICIAL_ORIGIN || url.username || url.password || url.port || url.search || !/^\/wp-content\/uploads\/[^/]+\.pdf$/i.test(decodeURIComponent(url.pathname))) {
    throw new Error("The Oyster Bay Zoning Board page linked an unexpected document address.");
  }
  url.hash = "";
  return url.toString();
}

export function parseOysterBayZbaIndex(html: string, year: number): OysterBayZbaDocument[] {
  const stripped = html.replace(/<!--[\s\S]*?-->/g, "");
  const heading = new RegExp(`<h2\\b[^>]*>[\\s\\S]*?ZONING BOARD OF APPEALS\\s+${year}\\s+MEETING DATES[\\s\\S]*?<\\/h2>`, "i").exec(stripped);
  if (!heading) throw new Error(`The Oyster Bay Zoning Board page has no ${year} meeting section.`);
  const remainder = stripped.slice(heading.index + heading[0].length);
  const section = remainder.slice(0, remainder.search(/<h2\b/i) < 0 ? remainder.length : remainder.search(/<h2\b/i));
  const documents: OysterBayZbaDocument[] = [];
  for (const row of section.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const link = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(row[1]);
    if (!link || !/\.pdf(?:$|[#?])/i.test(link[1])) continue;
    const meetingDate = dateFromLabel(htmlText(link[2]), year);
    if (!meetingDate) throw new Error("The Oyster Bay Zoning Board page has an unreadable hearing date.");
    documents.push({meetingDate, url: safeDocumentUrl(link[1])});
  }
  const unique = [...new Map(documents.map(document => [document.url, document])).values()].sort((left, right) => left.meetingDate.localeCompare(right.meetingDate) || left.url.localeCompare(right.url));
  if (!unique.length || unique.length > MAX_DOCUMENTS) throw new Error("The Oyster Bay Zoning Board document list is empty or exceeds the 26-document limit. Earlier finds have been kept.");
  return unique;
}

export async function extractOysterBayZbaPages(bytes: Uint8Array, signal?: AbortSignal): Promise<string[]> {
  const {getDocument} = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({data: bytes, useSystemFonts: true, disableFontFace: true, verbosity: 0});
  const abort = () => { void task.destroy(); };
  signal?.throwIfAborted();
  signal?.addEventListener("abort", abort, {once: true});
  try {
    const pdf = await task.promise;
    if (!pdf.numPages || pdf.numPages > MAX_PAGES) throw new Error("An Oyster Bay Zoning Board PDF exceeds the 20-page limit.");
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal?.throwIfAborted();
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is Extract<typeof item, {str: string}> => "str" in item).filter(item => item.str.trim());
      items.sort((left, right) => Math.abs(left.transform[5] - right.transform[5]) < 2 ? left.transform[4] - right.transform[4] : right.transform[5] - left.transform[5]);
      let y: number | undefined;
      let line = "";
      const lines: string[] = [];
      for (const item of items) {
        if (y !== undefined && Math.abs(item.transform[5] - y) >= 2) {
          if (clean(line)) lines.push(clean(line));
          line = "";
        }
        line += ` ${item.str}`;
        y = item.transform[5];
      }
      if (clean(line)) lines.push(clean(line));
      const text = lines.join("\n");
      if (text.length > MAX_PAGE_TEXT) throw new Error("An Oyster Bay Zoning Board PDF page exceeds the text limit.");
      pages.push(text);
      page.cleanup();
    }
    if (pages.join("").trim().length < 80) throw new Error("An Oyster Bay Zoning Board PDF has no usable embedded text. Earlier finds have been kept.");
    return pages;
  } finally {
    signal?.removeEventListener("abort", abort);
    await task.destroy();
  }
}

type PageRange = {page: number; start: number; end: number; text: string};

function joinedPages(pages: string[]): {text: string; ranges: PageRange[]} {
  let text = "";
  const ranges: PageRange[] = [];
  pages.forEach((page, index) => {
    if (text) text += "\n";
    const start = text.length;
    text += page;
    ranges.push({page: index + 1, start, end: text.length, text: page});
  });
  return {text, ranges};
}

function detail(block: string, pattern: RegExp): string {
  return clean(pattern.exec(block)?.[1] ?? "");
}

export function parseOysterBayZbaDocument(document: OysterBayZbaDocument, pages: string[], checksum: string): DiscoveredRecord[] {
  if (!pages.length || pages.length > MAX_PAGES || pages.some(page => page.length > MAX_PAGE_TEXT)) throw new Error("The Oyster Bay Zoning Board document exceeds its page or text limit.");
  const joined = joinedPages(pages);
  if (!/PUBLIC HEARING CALENDAR/i.test(joined.text) || !/ZONING BOARD OF APPEALS/i.test(joined.text)) throw new Error("The Oyster Bay Zoning Board document has an unexpected appeal structure. Earlier finds have been kept.");
  const dateText = joined.text.match(/\bon\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}/i)?.[0].replace(/^on\s+/i, "") ?? "";
  if (dateFromLabel(dateText, Number(document.meetingDate.slice(0, 4))) !== document.meetingDate) throw new Error("The Oyster Bay Zoning Board document date does not match its index date.");

  const pattern = /\bHEARING\s+NO\.?\s*(\d+)\s+APPEAL\s+NO\.?\s*([0-9]{2,4}-[A-Z0-9-]+)(?:\s+-\s+(AMENDMENT|RE-HEARING|EXTENSION OF TIME))?[ \t]+([A-Z][A-Z .'-]{1,80})(?=\n)/gi;
  const matches = [...joined.text.matchAll(pattern)];
  const hearingCount = [...joined.text.matchAll(/\bHEARING\s+NO\.?\s*\d+/gi)].length;
  if (!matches.length || matches.length !== hearingCount) throw new Error(`The Oyster Bay Zoning Board document has an unreadable appeal structure (${matches.length} of ${hearingCount}). Earlier finds have been kept.`);

  return matches.map((match, index) => {
    const start = match.index!;
    const end = matches[index + 1]?.index ?? joined.text.length;
    const block = joined.text.slice(start, end);
    const hearingNumber = match[1];
    const appealNumber = match[2].toUpperCase();
    const qualifier = clean(match[3] ?? "");
    const locality = titleCase(match[4]);
    const applicantLine = /(?:^|\n)([^\n:]{1,160}):\s*/m.exec(block);
    if (!applicantLine) throw new Error("The Oyster Bay Zoning Board document has an unreadable appeal structure. Earlier finds have been kept.");
    const applicant = titleCase(applicantLine[1]);
    const afterApplicant = applicantLine.index + applicantLine[0].length;
    const addressLine = /(?:^|\n)([^\n]*?\ba\/k\/a\s+([^\n]+))/im.exec(block.slice(afterApplicant));
    const reliefEnd = addressLine ? afterApplicant + addressLine.index : block.length;
    const relief = clean(block.slice(afterApplicant, reliefEnd).replace(/\n/g, " "));
    if (!relief) throw new Error("The Oyster Bay Zoning Board document has an unreadable appeal structure. Earlier finds have been kept.");
    const publishedLocation = clean(addressLine?.[1] ?? "");
    const address = clean(addressLine?.[2] ?? "");
    const details: Record<string, string> = {
      "Record type": "Zoning appeal",
      "Hearing number": hearingNumber,
      "Appeal number": appealNumber,
      Applicant: applicant,
      Locality: locality,
      "Requested relief": relief,
      "Evidence text": "Embedded text from the official hearing calendar with a physical page reference.",
      "Collection scope": "Town of Oyster Bay Zoning Board of Appeals public hearing calendars only.",
    };
    if (publishedLocation) details["Published location"] = publishedLocation;
    if (qualifier) details["Appeal qualifier"] = titleCase(qualifier);
    for (const [label, fieldPattern] of [
      ["Tax section", /\bSEC\.?\s*([A-Z0-9.-]+)/i],
      ["Tax block", /\bBLK\.?\s*([A-Z0-9.-]+)/i],
      ["Tax lot", /\bLOT\.?\s*([A-Z0-9., &/-]+?)(?=\s+ZONE\b|\n|$)/i],
      ["Zone", /\bZONE\s+([A-Z0-9-]+)/i],
    ] as const) {
      const value = detail(block, fieldPattern);
      if (value) details[label] = value;
    }
    const evidence = joined.ranges.filter(page => page.end > start && page.start < end).map(page => {
      const from = Math.max(0, start - page.start);
      const to = Math.min(page.text.length, end - page.start);
      return {url: document.url, title: `Zoning Board hearing calendar: ${document.meetingDate}`, checksum, page: page.page, text: clean(page.text.slice(from, to))};
    }).filter(item => item.text);
    return {
      externalId: `town-of-oyster-bay:appeal:${appealNumber.toLowerCase()}`,
      name: applicant ? `${applicant}: Appeal ${appealNumber}` : `Appeal ${appealNumber}`,
      town: locality,
      county: "Nassau",
      address,
      latitude: null,
      longitude: null,
      sourceTitle: "Town of Oyster Bay Zoning Board of Appeals",
      sourceUrl: document.url,
      sourceDate: document.meetingDate,
      sourceDateLabel: "Hearing date",
      details,
      evidence,
      classification: "opportunity",
      identityStatus: "resolved",
      sourceCaseId: appealNumber,
    } satisfies DiscoveredRecord;
  });
}

export function mergeOysterBayAppeals(records: DiscoveredRecord[]): DiscoveredRecord[] {
  const grouped = new Map<string, DiscoveredRecord>();
  const dates = new Map<string, Set<string>>();
  for (const row of [...records].sort((left, right) => (right.sourceDate ?? "").localeCompare(left.sourceDate ?? "") || left.sourceUrl.localeCompare(right.sourceUrl))) {
    const hearingDates = dates.get(row.externalId) ?? new Set<string>();
    if (row.sourceDate) hearingDates.add(row.sourceDate);
    dates.set(row.externalId, hearingDates);
    const current = grouped.get(row.externalId);
    if (!current) {
      grouped.set(row.externalId, {...row, details: {...row.details}, evidence: [...(row.evidence ?? [])]});
      continue;
    }
    current.evidence = [...(current.evidence ?? []), ...(row.evidence ?? [])];
  }
  for (const [externalId, row] of grouped) {
    row.evidence = [...new Map((row.evidence ?? []).map(item => [`${item.url}:${item.checksum}:${item.page}`, item])).values()].sort((left, right) => left.url.localeCompare(right.url) || left.page - right.page || left.checksum.localeCompare(right.checksum));
    if (row.evidence.length > MAX_DOCUMENTS * MAX_PAGES) throw new Error("An Oyster Bay appeal exceeds the evidence limit.");
    row.details["Hearing dates"] = [...dates.get(externalId)!].sort().join(", ");
    row.details["Evidence pages"] = String(row.evidence.length);
  }
  const merged = [...grouped.values()].sort((left, right) => left.externalId.localeCompare(right.externalId));
  if (merged.length > MAX_RECORDS) throw new Error("The Oyster Bay Zoning Board source exceeds the 500-record limit. Earlier finds have been kept.");
  return merged;
}

function read(url: string, maxBytes: number, deadline: AbortSignal, kind: "html" | "pdf") {
  return readPublicSource(url, maxBytes, deadline, {
    accept: kind === "html" ? "text/html" : "application/pdf",
    contentTypes: kind === "html" ? ["text/html"] : ["application/pdf"],
  });
}

export async function fetchOysterBayZbaRecords(): Promise<DiscoveredRecord[]> {
  const controller = new AbortController();
  const deadline = AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]);
  const year = Number(new Intl.DateTimeFormat("en", {timeZone: "America/New_York", year: "numeric"}).format(new Date()));
  const htmlBytes = await read(OYSTER_BAY_ZBA_URL, MAX_INDEX_BYTES, deadline, "html");
  const documents = parseOysterBayZbaIndex(new TextDecoder().decode(htmlBytes), year);
  let next = 0;
  let totalBytes = htmlBytes.length;
  const batches: DiscoveredRecord[][] = [];
  await Promise.all(Array.from({length: 3}, async () => {
    try {
      for (;;) {
        const index = next++;
        if (index >= documents.length) return;
        deadline.throwIfAborted();
        const document = documents[index];
        const bytes = await read(document.url, MAX_DOCUMENT_BYTES, deadline, "pdf");
        totalBytes += bytes.length;
        if (totalBytes > MAX_TOTAL_BYTES) throw new Error("The Oyster Bay Zoning Board scan exceeded the total download limit. Earlier finds have been kept.");
        if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("The Oyster Bay Zoning Board source returned a non-PDF document. Earlier finds have been kept.");
        const pages = await extractOysterBayZbaPages(bytes, deadline);
        batches[index] = parseOysterBayZbaDocument(document, pages, hash(bytes));
      }
    } catch (error) {
      controller.abort(error);
      throw error;
    }
  }));
  const records = mergeOysterBayAppeals(batches.flat());
  for (const row of records) {
    row.details["Collection year"] = String(year);
    row.details["Documents checked"] = String(documents.length);
  }
  return records;
}
