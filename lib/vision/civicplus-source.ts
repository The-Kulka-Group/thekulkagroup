import {createHash} from "node:crypto";

import type {DiscoveredRecord} from "./discovery-source";
import {SourceCollectionFailure, type AutomatedSourceDefinition, type SourceCollectionResult} from "./source-registry";

export type CivicPlusDocument = {
  categoryId: number;
  meetingId: number;
  meetingDate: string;
  kind: "Agenda" | "Minutes";
  title: string;
  url: string;
};

type Evidence = NonNullable<DiscoveredRecord["evidence"]>[number];
type CollectionOptions = {
  year?: number;
  extractPdf?: (bytes: Uint8Array, maxPages: number, signal: AbortSignal) => Promise<string[]>;
};

const HTML_TYPES = new Set(["text/html", "application/xhtml+xml"]);
const PDF_TYPE = "application/pdf";
const WORD_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_PAGE_TEXT = 40_000;
const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const clean = (value: string) => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  .replace(/[ \t]+/g, " ")
  .trim();
const oneLine = (value: string) => clean(value).replace(/\s+/g, " ");

function htmlText(value: string) {
  return oneLine(value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&ndash;|&#8211;/gi, "-")
    .replace(/&mdash;|&#8212;/gi, "-"));
}

function categoryId(source: AutomatedSourceDefinition) {
  const match = new URL(source.endpoint.url).pathname.match(/-(\d+)\/?$/);
  if (!match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) < 1) {
    throw new Error("The CivicPlus source has an invalid category address.");
  }
  return Number(match[1]);
}

function isoDate(month: string, day: string, year: string) {
  const date = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("The CivicPlus source returned an invalid meeting date.");
  }
  return date;
}

function safeDocumentUrl(value: string, source: AutomatedSourceDefinition) {
  const url = new URL(value.replace(/&amp;/gi, "&"), source.endpoint.url);
  if (!source.endpoint.allowedOrigins.includes(url.origin) || url.username || url.password || url.search || url.hash) {
    throw new Error("The CivicPlus source linked an unexpected document address.");
  }
  const match = url.pathname.match(/^\/AgendaCenter\/ViewFile\/(Agenda|Minutes)\/_([0-9]{2})([0-9]{2})([0-9]{4})-(\d+)$/i);
  if (!match) throw new Error("The CivicPlus source linked an unexpected document address.");
  return {
    url: url.toString(),
    kind: `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}` as CivicPlusDocument["kind"],
    meetingDate: isoDate(match[2], match[3], match[4]),
    meetingId: Number(match[5]),
  };
}

export function parseCivicPlusCategory(html: string, source: AutomatedSourceDefinition, currentYear: number): CivicPlusDocument[] {
  if (Buffer.byteLength(html) > source.limits.maxResponseBytes) throw new Error("The CivicPlus category exceeded the response size limit.");
  const id = categoryId(source);
  const minYear = currentYear - (source.limits.maxYears ?? 1) + 1;
  const documents = new Map<string, CivicPlusDocument>();
  for (const rowMatch of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[0];
    if (!/\bcatAgendaRow\b/i.test(row)) continue;
    for (const link of row.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      if (!/\/AgendaCenter\/ViewFile\/(?:Agenda|Minutes)\//i.test(link[1])) continue;
      const parsed = safeDocumentUrl(link[1], source);
      const year = Number(parsed.meetingDate.slice(0, 4));
      if (year < minYear || year > currentYear) continue;
      const title = htmlText(link[2]) || `${parsed.kind} for ${parsed.meetingDate}`;
      const key = `${id}:${parsed.meetingDate}:${parsed.meetingId}:${parsed.kind}`;
      const prior = documents.get(key);
      if (prior && prior.url !== parsed.url) throw new Error("The CivicPlus category returned conflicting meeting identities.");
      documents.set(key, {categoryId: id, ...parsed, title: /^(?:Agenda|Minutes)$/i.test(title) && prior ? prior.title : title});
    }
  }
  const rows = [...documents.values()].sort((left, right) =>
    right.meetingDate.localeCompare(left.meetingDate)
    || right.meetingId - left.meetingId
    || left.kind.localeCompare(right.kind));
  if (!rows.length) throw new Error("The CivicPlus category had no supported recent meeting documents. Earlier source records remain available.");
  const meetings = new Set<string>();
  const selected: CivicPlusDocument[] = [];
  for (const row of rows) {
    const meeting = `${row.meetingDate}:${row.meetingId}`;
    if (!meetings.has(meeting) && meetings.size >= (source.limits.maxMeetings ?? 0)) continue;
    meetings.add(meeting);
    if (selected.length >= (source.limits.maxDocuments ?? 0)) break;
    selected.push(row);
  }
  return selected;
}

function pageEvidence(document: CivicPlusDocument, pages: string[], checksum: string): Evidence[] {
  return pages.map((text, index) => ({
    url: document.url,
    title: `${document.kind}: ${document.title}`,
    checksum,
    page: index + 1,
    text: clean(text).slice(0, MAX_PAGE_TEXT),
  }));
}

function detailBase(source: AutomatedSourceDefinition, document: CivicPlusDocument) {
  return {
    "Record type": source.name.includes("Planning") ? "Planning application" : "Zoning appeal",
    Board: source.officialAgency,
    "Meeting date": document.meetingDate,
    "Document kind": document.kind,
    "CivicPlus category ID": String(document.categoryId),
    "CivicPlus meeting ID": String(document.meetingId),
  };
}

function unresolvedDocument(source: AutomatedSourceDefinition, document: CivicPlusDocument, evidence: Evidence[], format?: string): DiscoveredRecord {
  return {
    externalId: `document:${document.categoryId}:${document.meetingDate}:${document.meetingId}:${document.kind.toLowerCase()}`,
    name: `${source.officialAgency}: ${document.kind} for ${document.meetingDate}`,
    town: source.jurisdiction,
    county: source.county,
    address: "",
    latitude: null,
    longitude: null,
    sourceTitle: `${source.officialAgency}: ${document.kind}`,
    sourceUrl: document.url,
    sourceDate: document.meetingDate,
    sourceDateLabel: "Meeting date",
    details: {
      ...detailBase(source, document),
      "Identity review": "The document did not provide a reliable application number and location in readable PDF text.",
      ...(format ? {"Document format": format} : {}),
    },
    evidence,
    classification: "opportunity",
    identityStatus: "unresolved",
  };
}

function resolvedRecord(source: AutomatedSourceDefinition, document: CivicPlusDocument, evidence: Evidence[], input: {
  prefix: "case" | "application";
  sourceCaseId: string;
  name: string;
  address: string;
  page: number;
  details: Record<string, string>;
}): DiscoveredRecord {
  const page = evidence[input.page - 1] ? [evidence[input.page - 1]] : evidence.slice(0, 1);
  return {
    externalId: `${input.prefix}:${document.categoryId}:${document.meetingDate}:${document.meetingId}:${input.sourceCaseId.toLowerCase()}`,
    sourceCaseId: input.sourceCaseId,
    name: input.name,
    town: source.jurisdiction,
    county: source.county,
    address: input.address,
    latitude: null,
    longitude: null,
    sourceTitle: `${source.officialAgency}: ${document.kind}`,
    sourceUrl: document.url,
    sourceDate: document.meetingDate,
    sourceDateLabel: "Meeting date",
    details: {...detailBase(source, document), ...input.details},
    evidence: page,
    classification: "opportunity",
    identityStatus: "resolved",
  };
}

function parseHempsteadPlanning(source: AutomatedSourceDefinition, document: CivicPlusDocument, pages: string[], evidence: Evidence[]) {
  const records: DiscoveredRecord[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const text = clean(pages[pageIndex]);
    const pattern = /(?:^|\n)\s*(?:[•*]\s*)?CASE\s*#?\s*([0-9]{1,4}-[0-9]{1,4})\s*:\s*([^\n]{3,240})\n\s*Propose:\s*([^\n]{3,600})(?:\n\s*Sec\.?\s*([^\n]{1,200}))?/gi;
    for (const match of text.matchAll(pattern)) {
      const caseId = match[1].toUpperCase();
      const address = oneLine(match[2]);
      const proposed = oneLine(match[3]);
      records.push(resolvedRecord(source, document, evidence, {
        prefix: "case",
        sourceCaseId: caseId,
        name: `Case ${caseId}: ${proposed}`,
        address,
        page: pageIndex + 1,
        details: {"Case number": caseId, "Proposed work": proposed, ...(match[4] ? {"Tax parcel": oneLine(match[4])} : {})},
      }));
    }
  }
  return records;
}

function parseHempsteadZoning(source: AutomatedSourceDefinition, document: CivicPlusDocument, pages: string[], evidence: Evidence[]) {
  const records: DiscoveredRecord[] = [];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const text = oneLine(pages[pageIndex]);
    const starts = [...text.matchAll(/\bCASE\s*#?\s*([0-9]{2}-[0-9]{4})\s*[-–—]/gi)];
    for (let index = 0; index < starts.length; index++) {
      const start = starts[index];
      const block = text.slice(start.index, starts[index + 1]?.index ?? text.length);
      const caseId = start[1].toUpperCase();
      const applicant = oneLine(/Application of\s+(.+?)(?=\s+[-–—]\s+|\s+for (?:a|an) variance|\s+for permission)/i.exec(block)?.[1] ?? "");
      const facts = /permission to\s+(.+?)\s+at\s+(.+?)(?:,?\s+Hempstead,\s+(?:NY|New York)\s*\d{5}|\.\s*Said property)/i.exec(block);
      const proposed = oneLine(facts?.[1] ?? "");
      const address = oneLine(facts?.[2] ?? "").replace(/^(?:the\s+)?(?:premises|dwelling)\s+(?:known as\s+)?/i, "");
      const parcel = /Section\s+([^, ]+),?\s+Block\s+([^, ]+),?\s+Lot\(s\)\s+([^ .]+)/i.exec(block);
      if (!applicant || !proposed || !address) continue;
      records.push(resolvedRecord(source, document, evidence, {
        prefix: "case",
        sourceCaseId: caseId,
        name: `Case ${caseId}: ${applicant}`,
        address,
        page: pageIndex + 1,
        details: {
          "Case number": caseId,
          Applicant: applicant,
          "Proposed work": proposed,
          ...(parcel ? {"Tax parcel": `Section ${parcel[1]}, Block ${parcel[2]}, Lot ${parcel[3]}`} : {}),
        },
      }));
    }
  }
  return records;
}

function parseGardenCity(source: AutomatedSourceDefinition, document: CivicPlusDocument, pages: string[], evidence: Evidence[]) {
  const joined = pages.map(clean).join("\n");
  const starts = [...joined.matchAll(/(?:^|\n)\s*(\d{1,2})\.\s+(?:APPLICATION(?:\s*&\s*APPEAL)?|APPEAL)\s+OF\s+/gi)];
  const records: DiscoveredRecord[] = [];
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const block = oneLine(joined.slice(start.index, starts[index + 1]?.index ?? joined.length));
    const applicationId = /Building Department application\s*#\s*([0-9]{4}-[0-9]{1,6})/i.exec(block)?.[1] ?? "";
    const applicant = oneLine(/(?:APPLICATION(?:\s*&\s*APPEAL)?|APPEAL)\s+OF\s+(.+?)(?=,?\s+(?:in accordance|for (?:a|an|variances)|to allow))/i.exec(block)?.[1] ?? "");
    const address = oneLine(/known as\s+(.+?)\s+\(Map of/i.exec(block)?.[1] ?? "");
    const proposed = oneLine(/(?:for permission to|to allow(?: for)? the issue of (?:building )?permits? for|for the approval to file building permits for|to permit)\s+(.+?)(?=\s+(?:at|in)\s+(?:the\s+)?(?:rear|front|side|dwelling|premises)|\s+of\s+the\s+(?:dwelling|premises))/i.exec(block)?.[1] ?? "");
    if (!applicationId || !applicant || !address) continue;
    const page = pages.findIndex(text => text.includes(applicationId) || text.includes(applicant.slice(0, 30))) + 1;
    records.push(resolvedRecord(source, document, evidence, {
      prefix: "application",
      sourceCaseId: applicationId,
      name: `Application ${applicationId}: ${applicant}`,
      address,
      page: Math.max(1, page),
      details: {
        "Building application number": applicationId,
        Applicant: applicant,
        ...(proposed ? {"Proposed work": proposed} : {}),
        "Agenda item": start[1],
      },
    }));
  }
  return records;
}

function makeDuplicateIdsUnresolved(records: DiscoveredRecord[], document: CivicPlusDocument) {
  const groups = new Map<string, DiscoveredRecord[]>();
  for (const record of records) (groups.get(record.externalId) ?? groups.set(record.externalId, []).get(record.externalId)!).push(record);
  const result: DiscoveredRecord[] = [];
  for (const group of groups.values()) {
    const facts = new Set(group.map(record => `${record.address}\n${record.name}`.toLowerCase()));
    if (group.length === 1 || facts.size === 1) {
      result.push(group[0]);
      continue;
    }
    group.forEach((record, index) => result.push({
      ...record,
      externalId: `document:${document.categoryId}:${document.meetingDate}:${document.meetingId}:${document.kind.toLowerCase()}:conflict:${index + 1}`,
      sourceCaseId: undefined,
      identityStatus: "unresolved",
      details: {...record.details, "Identity review": "The document repeats this case or application number for different matters."},
    }));
  }
  return result;
}

export function parseCivicPlusDocument(source: AutomatedSourceDefinition, document: CivicPlusDocument, pages: string[], checksum: string): DiscoveredRecord[] {
  if (!pages.length || pages.length > (source.limits.maxPages ?? 0)) throw new Error("The CivicPlus document exceeded its page limit.");
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error("The CivicPlus document has an invalid checksum.");
  if (pages.some(page => page.length > MAX_PAGE_TEXT)) throw new Error("A CivicPlus document page exceeded its text limit.");
  const evidence = pageEvidence(document, pages, checksum);
  let records: DiscoveredRecord[] = [];
  if (document.categoryId === 3) records = parseHempsteadPlanning(source, document, pages, evidence);
  else if (document.categoryId === 5) records = parseHempsteadZoning(source, document, pages, evidence);
  else if (document.categoryId === 9) records = parseGardenCity(source, document, pages, evidence);
  records = makeDuplicateIdsUnresolved(records, document);
  return records.length ? records : [unresolvedDocument(source, document, evidence)];
}

export function mergeCivicPlusRecords(records: DiscoveredRecord[]) {
  const grouped = new Map<string, DiscoveredRecord>();
  for (const record of records) {
    const previous = grouped.get(record.externalId);
    if (!previous) {
      grouped.set(record.externalId, {...record, evidence: [...(record.evidence ?? [])]});
      continue;
    }
    const preferred = (record.sourceDate ?? "") >= (previous.sourceDate ?? "") ? record : previous;
    const evidence = [...(previous.evidence ?? []), ...(record.evidence ?? [])];
    grouped.set(record.externalId, {...preferred, evidence});
  }
  for (const record of grouped.values()) {
    record.evidence = [...new Map((record.evidence ?? []).map(item => [`${item.url}:${item.checksum}:${item.page}`, item])).values()]
      .sort((left, right) => left.url.localeCompare(right.url) || left.checksum.localeCompare(right.checksum) || left.page - right.page);
    if (record.evidence.length > 240) throw new Error("A CivicPlus record exceeded its evidence page limit.");
    record.details["Evidence pages"] = String(record.evidence.length);
  }
  return [...grouped.values()].sort((left, right) => left.externalId.localeCompare(right.externalId));
}

async function responseBytes(response: Response, maxBytes: number) {
  if (!response.body) throw new Error("The CivicPlus source returned an empty body.");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("The CivicPlus source exceeded the response size limit.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > maxBytes) throw new Error("The CivicPlus source exceeded the response size limit.");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  return new Uint8Array(Buffer.concat(chunks));
}

async function read(source: AutomatedSourceDefinition, url: string, accept: string, types: Set<string>, deadline: AbortSignal) {
  const parsed = new URL(url);
  if (!source.endpoint.allowedOrigins.includes(parsed.origin) || parsed.username || parsed.password) throw new Error("The CivicPlus request was outside its fixed origin.");
  const response = await fetch(parsed, {
    signal: AbortSignal.any([deadline, AbortSignal.timeout(Math.min(30_000, source.limits.maxDurationMs))]),
    redirect: "error",
    cache: "no-store",
    headers: {"User-Agent": "Mozilla/5.0 (compatible; KulkaVision public-record collector)", Accept: accept},
  });
  if (!response.ok) throw new Error(`The CivicPlus source returned HTTP ${response.status}. Earlier source records remain available.`);
  const type = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  if (!types.has(type)) throw new Error("The CivicPlus source returned an unexpected content type. Earlier source records remain available.");
  return {bytes: await responseBytes(response, source.limits.maxResponseBytes), type};
}

export async function extractCivicPlusPages(bytes: Uint8Array, maxPages: number, signal: AbortSignal) {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("The CivicPlus source returned an unreadable PDF.");
  const {getDocument} = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({data: bytes, useSystemFonts: true, disableFontFace: true, verbosity: 0});
  const abort = () => { void task.destroy(); };
  signal.throwIfAborted();
  signal.addEventListener("abort", abort, {once: true});
  try {
    const pdf = await task.promise;
    if (!pdf.numPages || pdf.numPages > maxPages) throw new Error("The CivicPlus document exceeded its page limit.");
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items.filter((item): item is Extract<typeof item, {str: string}> => "str" in item).filter(item => item.str.trim());
      items.sort((left, right) => Math.abs(left.transform[5] - right.transform[5]) < 2 ? left.transform[4] - right.transform[4] : right.transform[5] - left.transform[5]);
      let y: number | undefined;
      let line = "";
      const lines: string[] = [];
      for (const item of items) {
        if (y !== undefined && Math.abs(item.transform[5] - y) >= 2) {
          lines.push(clean(line));
          line = "";
        }
        line += ` ${item.str}`;
        y = item.transform[5];
      }
      if (line) lines.push(clean(line));
      const text = lines.join("\n");
      if (text.length > MAX_PAGE_TEXT) throw new Error("A CivicPlus document page exceeded its text limit.");
      pages.push(text);
      page.cleanup();
    }
    if (pages.join("").trim().length < 40) return [];
    return pages;
  } finally {
    signal.removeEventListener("abort", abort);
    await task.destroy();
  }
}

export async function fetchCivicPlusRecords(source: AutomatedSourceDefinition, options: CollectionOptions = {}): Promise<SourceCollectionResult> {
  const deadline = AbortSignal.timeout(source.limits.maxDurationMs);
  const currentYear = options.year ?? Number(new Intl.DateTimeFormat("en", {timeZone: "America/New_York", year: "numeric"}).format(new Date()));
  const records: DiscoveredRecord[] = [];
  const checkedDocuments: string[] = [];
  let receivedSourceUnit = false;
  try {
    const category = await read(source, source.endpoint.url, "text/html,application/xhtml+xml", HTML_TYPES, deadline);
    receivedSourceUnit = true;
    let totalBytes = category.bytes.length;
    const documents = parseCivicPlusCategory(new TextDecoder().decode(category.bytes), source, currentYear);
    if (documents.length + 1 > source.limits.maxRequests) throw new Error("The CivicPlus source exceeded its request limit.");
    let totalPages = 0;
    for (const document of documents) {
      deadline.throwIfAborted();
      receivedSourceUnit = false;
      const response = await read(source, document.url, `${PDF_TYPE},${WORD_TYPE}`, new Set([PDF_TYPE, WORD_TYPE]), deadline);
      receivedSourceUnit = true;
      totalBytes += response.bytes.length;
      if (totalBytes > (source.limits.maxTotalResponseBytes ?? source.limits.maxResponseBytes)) throw new Error("The CivicPlus source exceeded its total response size limit.");
      const checksum = hash(response.bytes);
      if (response.type === WORD_TYPE) {
        const note = `CivicPlus category ${document.categoryId}. ${document.kind} for ${document.meetingDate}. Meeting ID ${document.meetingId}. Vision did not extract application facts from the Microsoft Word file.`;
        records.push(unresolvedDocument(source, document, pageEvidence(document, [note], checksum), "Microsoft Word"));
        checkedDocuments.push(document.url);
        continue;
      }
      const remainingPages = (source.limits.maxPages ?? 0) - totalPages;
      if (remainingPages < 1) throw new Error("The CivicPlus source exceeded its page limit.");
      const pages = await (options.extractPdf ?? extractCivicPlusPages)(response.bytes, remainingPages, deadline);
      if (!pages.length) {
        const note = `CivicPlus category ${document.categoryId}. ${document.kind} for ${document.meetingDate}. Meeting ID ${document.meetingId}. The PDF had no readable embedded text, so Vision did not extract application facts.`;
        records.push(unresolvedDocument(source, document, pageEvidence(document, [note], checksum), "PDF without readable text"));
        checkedDocuments.push(document.url);
        continue;
      }
      totalPages += pages.length;
      records.push(...parseCivicPlusDocument(source, document, pages, checksum));
      checkedDocuments.push(document.url);
    }
    const merged = mergeCivicPlusRecords(records);
    if (merged.length > source.limits.maxRecords) throw new Error("The CivicPlus source exceeded its record limit.");
    return {records: merged, coverage: {year: currentYear, documents: checkedDocuments.sort()}};
  } catch (error) {
    if (!receivedSourceUnit && !checkedDocuments.length && !records.length) throw error;
    throw new SourceCollectionFailure("The CivicPlus check stopped before it read every document.", {
      coverage: {year: currentYear, documents: checkedDocuments.sort()},
      fetched: records.length,
      rejected: receivedSourceUnit ? 1 : 0,
    }, {cause: error});
  }
}
