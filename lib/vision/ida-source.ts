import { createHash } from "node:crypto";
import type { DiscoveredRecord } from "./discovery-source";
import { NASSAU_IDA_SOURCE, SUFFOLK_IDA_SOURCE } from "./discovery-catalog";
import { readPublicSource } from "./source-fetch";

const MAX_NASSAU_PAGES = 30;
const MAX_DOCUMENTS = 240;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const entities: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
function decode(html: string): string {
  return html.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? original;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
  });
}
function text(html: string): string { return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim(); }
function field(row: string, name: string): string {
  const match = row.match(new RegExp(`<td\\b[^>]*headers=["']${name}["'][^>]*>([\\s\\S]*?)<\\/td>`, "i"));
  if (!match) throw new Error("The Nassau IDA table omitted an expected column.");
  return match[1];
}
function span(html: string, name: string): string {
  return text(html.match(new RegExp(`<span\\b[^>]*class=["']${name}["'][^>]*>([\\s\\S]*?)<\\/span>`, "i"))?.[1] ?? "");
}
function validDate(year: number, month: number, day: number): string {
  const value = `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  if (year < 1900 || year > 2100 || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) throw new Error("The IDA index contains an unreadable date.");
  return value;
}
function documentDate(value: string): string | null {
  if (!value) return null;
  const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!parts) throw new Error("The Nassau IDA index contains an unreadable document date.");
  let year = Number(parts[3]);
  if (parts[3].length === 2) year += year >= 70 ? 1900 : 2000;
  return validDate(year, Number(parts[1]), Number(parts[2]));
}
function documentUrl(raw: string, source: "nassau" | "suffolk"): string {
  const base = source === "nassau" ? NASSAU_IDA_SOURCE.url : SUFFOLK_IDA_SOURCE.url;
  const url = new URL(decode(raw), base);
  const hosts = source === "nassau" ? ["nassauida.org", "nassauida-assets.s3.amazonaws.com"] : ["suffolkida.org"];
  if (url.protocol !== "https:" || url.username || url.password || url.port || !hosts.includes(url.hostname) || !url.pathname.toLowerCase().endsWith(".pdf")) throw new Error("The IDA index linked an unexpected document URL.");
  url.hash = "";
  return url.href;
}
function evidence(url: string, title: string, metadata: string): NonNullable<DiscoveredRecord["evidence"]>[number] {
  const content = `Published index metadata only. PDF contents were not read.\n${metadata}`;
  return { kind: "index-link", url, title: `Index link: ${title}`, checksum: hash(content), page: 1, text: content };
}

/** The publisher provides no project ID. Name and listed address distinguish table rows. */
export function parseNassauIdaPage(html: string, pageUrl = NASSAU_IDA_SOURCE.url): { records: DiscoveredRecord[]; next: string | null; start: number; end: number; total: number } {
  const table = html.match(/<table\b[^>]*class=["'][^"']*views-table[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) throw new Error("The Nassau IDA project table is missing.");
  const rows = [...(table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? "").matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (!rows.length || rows.length > 100) throw new Error("The Nassau IDA project page has an unexpected row count.");
  const records = rows.map(([, row]) => {
    const name = text(field(row, "view-title-table-column"));
    const location = field(row, "view-field-address-table-column");
    const address = text(location);
    const town = span(location, "locality");
    const status = text(field(row, "view-field-status-table-column"));
    if (!name) throw new Error("A Nassau IDA project has no name.");
    const documents: NonNullable<DiscoveredRecord["evidence"]> = [];
    const dates: string[] = [];
    const documentColumn = field(row, "view-field-documents-table-column");
    for (const [, item] of documentColumn.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const link = item.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/i);
      if (!link) continue;
      const url = documentUrl(link[1], "nassau");
      const title = text(item.slice(0, link.index));
      const date = documentDate(span(item, "doc-date"));
      if (date) dates.push(date);
      documents.push(evidence(url, title || name, `Project: ${name}\nAddress: ${address || "Not listed"}\nDocument: ${title}\nListed document date: ${date ?? "Not listed"}\nIndex: ${NASSAU_IDA_SOURCE.url}`));
    }
    const unique = [...new Map(documents.map(doc => [doc.url, doc])).values()].sort((a,b) => a.url.localeCompare(b.url));
    if (unique.length > MAX_DOCUMENTS) throw new Error("A Nassau IDA project exceeds the document limit.");
    return {
      externalId: `project:${hash(`${name.toLowerCase()}\n${address.toLowerCase()}`)}`,
      name, town, county: "Nassau", address, latitude: null, longitude: null,
      classification: "opportunity" as const, identityStatus: "resolved" as const,
      sourceTitle: "Nassau IDA project table", sourceUrl: NASSAU_IDA_SOURCE.url,
      sourceDate: dates.sort().at(-1) ?? null, sourceDateLabel: "Latest listed document date",
      details: { "Record type": "IDA project", "IDA status": status || "Not listed", "Status meaning": "Financial assistance status does not establish construction progress or bid availability.", "Collection scope": "Public project table, up to 30 pages; linked PDF metadata only.", "Identity basis": "Published project name and address. A renamed project or changed address requires review before linking records.", "Linked documents": String(unique.length) },
      evidence: unique,
    };
  });
  const nextAnchor = [...html.matchAll(/<a\b([^>]*)>/gi)].find(([,attrs]) => /\brel=["']next["']/i.test(attrs));
  let next: string | null = null;
  if (nextAnchor) {
    const href = nextAnchor[1].match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) throw new Error("The Nassau IDA next-page link is unreadable.");
    const url = new URL(decode(href), pageUrl);
    if (url.origin !== new URL(NASSAU_IDA_SOURCE.url).origin || url.pathname !== "/projects-documents" || !/^\?page=\d+$/.test(url.search) || url.hash || url.username || url.password) throw new Error("The Nassau IDA index linked an unexpected next page.");
    next = url.href;
  }
  const range = text(html).match(/(\d+) - (\d+) of (\d+) results/);
  if (!range || Number(range[1]) < 1 || Number(range[2]) > Number(range[3]) || Number(range[2]) - Number(range[1]) + 1 !== records.length || (Number(range[2]) < Number(range[3])) !== Boolean(next)) throw new Error("The Nassau IDA result count and pagination disagree. Earlier finds have been kept.");
  return { records, next, start: Number(range[1]), end: Number(range[2]), total: Number(range[3]) };
}

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function meetingDate(value: string): string | null {
  const match = value.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  if (!match) return null;
  const month = months.findIndex(name => name.toLowerCase() === match[1].toLowerCase()) + 1;
  return validDate(Number(match[3]), month, Number(match[2]));
}
/** URL identity avoids merging different sites merely because the applicant name matches. */
export function parseSuffolkIdaIndex(html: string): DiscoveredRecord[] {
  const index = html.match(/<div\b[^>]*id=["']cptapagination-content["'][^>]*>([\s\S]*?)<ul\b[^>]*class=["']list-cptapagination["']/i)?.[1];
  if (!index) throw new Error("The Suffolk IDA resource index is missing.");
  const sections = index.split(/<div\b[^>]*class=["']single-tab["'][^>]*>/i).slice(1);
  if (!sections.length || sections.length > 15) throw new Error("The Suffolk IDA index exceeded the 15-entry collection scope.");
  const grouped = new Map<string, DiscoveredRecord>();
  for (const section of sections) {
    const heading = text(section.match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i)?.[1] ?? "");
    const date = meetingDate(heading);
    for (const [, rawUrl, rawLabel] of section.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
      const label = text(rawLabel);
      const match = label.match(/^(.+?)\s+[-–—]\s+(Project Abstract|Abstract|IDA Application|Application for Financial Assistance|Public Hearing Notice)$/i);
      if (!match || !match[1].trim() || /^(?:IDA|SCIDA|Board|Annual|Schedule|General|Meeting)\b/i.test(match[1])) continue;
      if (!date) throw new Error("A Suffolk IDA project link has no readable meeting date.");
      const url = documentUrl(rawUrl, "suffolk");
      const name = match[1].trim();
      const externalId = `document:${hash(url)}`;
      const record = grouped.get(externalId);
      const metadata = evidence(url, label, `Published label: ${label}\nIndex meeting date: ${date}\nIndex: ${SUFFOLK_IDA_SOURCE.url}`);
      if (record) {
        if (record.name !== name) {
          record.details["Identity review"] = "The index uses different project names for this document. Confirm the project and site before linking it.";
          const labels = new Set(record.details["Published labels"].split(" | ")); labels.add(label);
          record.details["Published labels"] = [...labels].sort().join(" | ");
        }
        if (!record.evidence!.some(item => item.checksum === metadata.checksum)) record.evidence!.push(metadata);
        if (date > record.sourceDate!) record.sourceDate = date;
        continue;
      }
      grouped.set(externalId, {
        externalId, name, town: "", county: "Suffolk", address: "", latitude: null, longitude: null,
        classification: "opportunity", identityStatus: "unresolved",
        sourceTitle: "Suffolk IDA project filing", sourceUrl: url, sourceDate: date, sourceDateLabel: "Latest index meeting date",
        details: { "Record type": `IDA ${match[2].toLowerCase().replace(/^ida /, "")}`, "Published labels": label, "Identity review": "The index identifies a project or applicant but does not confirm its site. Review the linked document and link it to a verified opportunity.", "Collection scope": "First 15 resource entries only. Older archive pages and the separate hearings tab are excluded.", "Date meaning": "The listed meeting date is not a document publication date, approval date or bid deadline." }, evidence: [metadata],
      });
    }
  }
  const records = [...grouped.values()].sort((a,b) => a.externalId.localeCompare(b.externalId));
  if (!records.length || records.length > 300) throw new Error("The Suffolk IDA index has no supported project links or exceeds the record limit.");
  for (const record of records) record.evidence!.sort((a,b) => a.text.localeCompare(b.text));
  return records;
}
async function readIndex(url: string, deadline: AbortSignal): Promise<string> {
  return new TextDecoder().decode(await readPublicSource(url, 2_000_000, deadline, { accept: "text/html", userAgent: "Mozilla/5.0" }));
}
export async function fetchNassauIdaRecords(): Promise<DiscoveredRecord[]> {
  const deadline = AbortSignal.timeout(180_000);
  const records: DiscoveredRecord[] = [];
  const visited = new Set<string>();
  let next: string | null = NASSAU_IDA_SOURCE.url;
  let total: number | null = null;
  while (next) {
    if (visited.has(next) || visited.size >= MAX_NASSAU_PAGES) throw new Error("The Nassau IDA index repeated a page or exceeded the 30-page limit. Earlier finds have been kept.");
    visited.add(next);
    const parsed = parseNassauIdaPage(await readIndex(next, deadline), next);
    if (parsed.start !== records.length + 1 || (total !== null && parsed.total !== total)) throw new Error("The Nassau IDA pages skipped records or changed during collection. Try again later.");
    total = parsed.total;
    records.push(...parsed.records); next = parsed.next;
  }
  if (records.length > 2000 || new Set(records.map(record => record.externalId)).size !== records.length) throw new Error("The Nassau IDA table repeated projects or exceeded the record limit.");
  return records.sort((a,b) => a.externalId.localeCompare(b.externalId));
}
export async function fetchSuffolkIdaRecords(): Promise<DiscoveredRecord[]> {
  return parseSuffolkIdaIndex(await readIndex(SUFFOLK_IDA_SOURCE.url, AbortSignal.timeout(60_000)));
}
