import {createHash} from "node:crypto";
import type {DiscoveredRecord} from "./discovery-source";
import type {AutomatedSourceDefinition, SourceCollectionProgress} from "./source-registry";

type SearchPage = {records: DiscoveredRecord[]; total: number; page: number};
type RequestBudget = {requests: number; bytes: number};

const SEARCH_PAGE_SIZE = 10;
const DETAIL_WORKERS = 4;
const entities: Record<string, string> = {amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“"};
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

function decode(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (original, entity: string) => {
    if (!entity.startsWith("#")) return entities[entity.toLowerCase()] ?? original;
    const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : original;
  });
}

function text(value: string, label = "field", max = 400) {
  const result = decode(value.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  if (result.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(result)) throw new Error(`The SmartGov source returned an invalid ${label}.`);
  return result;
}

function isoDate(value: string, label: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) throw new Error(`The SmartGov source returned an invalid ${label}.`);
  const result = `${match[3]}-${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  if (!Number.isFinite(Date.parse(result)) || new Date(`${result}T00:00:00Z`).toISOString().slice(0, 10) !== result) throw new Error(`The SmartGov source returned an invalid ${label}.`);
  return result;
}

function statusMeaning(status: string) {
  if (/^expired$/i.test(status)) return "SmartGov lists this application as expired. This does not show that the village issued a permit.";
  if (/^issued$/i.test(status)) return "SmartGov lists this permit as issued. This does not show construction progress or bid availability.";
  if (/^(?:closed|finaled)$/i.test(status)) return `SmartGov lists this permit as ${status.toLowerCase()}. This does not show current construction work or bid availability.`;
  return `SmartGov lists this record as ${status}. Vision keeps that source status without treating it as a construction stage, approval, or bid signal.`;
}

function detailUrl(guid: string, origin = "https://vlg-hempstead-ny.smartgovcommunity.com") {
  return `${origin}/PermittingPublic/PermitLandingPagePublic/Index/${guid}`;
}

function evidence(record: DiscoveredRecord) {
  const details = Object.entries(record.details).filter(([key]) => key !== "Status meaning" && key !== "Collection scope").map(([key, value]) => `${key}: ${value}`);
  const content = [`Official SmartGov public record.`, ...details, `Address: ${record.address || "Not listed"}`, `${record.sourceDateLabel}: ${record.sourceDate ?? "Not listed"}`, `Official record: ${record.sourceUrl}`].join("\n");
  return [{kind: "index-link" as const, url: record.sourceUrl, title: `SmartGov record: ${record.sourceCaseId}`, checksum: hash(content), page: 1, text: content}];
}

/** Parse one public search page. SmartGov page numbers are zero based. */
export function parseSmartGovSearchPage(html: string, expectedPage: number): SearchPage {
  if (!/<div\b[^>]*id=["']search-results["']/i.test(html) && !/\bsearch-result-item\b/i.test(html)) throw new Error("The SmartGov search results are missing. Earlier source records remain available.");
  const totalMatch = html.match(/(?:Page\s+(\d+)\s+of\s+)?(\d+)\s+results/i);
  if (!totalMatch) {
    if (/No results found/i.test(html) && expectedPage === 0) return {records: [], total: 0, page: 0};
    throw new Error("The SmartGov result count is missing. Earlier source records remain available.");
  }
  const page = totalMatch[1] ? Number(totalMatch[1]) - 1 : 0;
  const total = Number(totalMatch[2]);
  if (!Number.isSafeInteger(total) || total < 1 || page !== expectedPage) throw new Error("The SmartGov result count or page number is invalid. Earlier source records remain available.");
  const hiddenPage = html.match(/id=["']_applicationSearchPage["'][^>]*value=["'](\d+)["']/i)?.[1];
  if (hiddenPage === undefined || Number(hiddenPage) !== expectedPage) throw new Error("The SmartGov page marker is missing or invalid. Earlier source records remain available.");

  const parts = html.split(/<div\b[^>]*class=["'][^"']*\bsearch-result-item\b[^"']*["'][^>]*>/i).slice(1);
  if (!parts.length || parts.length > SEARCH_PAGE_SIZE || parts.length !== Math.min(SEARCH_PAGE_SIZE, total - expectedPage * SEARCH_PAGE_SIZE)) throw new Error("The SmartGov result rows do not match the published count. Earlier source records remain available.");
  const origin = "https://vlg-hempstead-ny.smartgovcommunity.com";
  const records = parts.map(part => {
    const action = part.match(/submitAction\(\s*["']Detail\/([0-9a-f-]+)["']\s*\)/i);
    const guid = action?.[1]?.toLowerCase() ?? "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(guid)) throw new Error("The SmartGov source returned an invalid record identifier.");
    const anchor = part.match(new RegExp(`<a\\b[^>]*Detail\\/${guid}[^>]*>([\\s\\S]*?)<\\/a>`, "i"));
    const recordNumber = text(anchor?.[1] ?? "", "record number", 100);
    if (!recordNumber) throw new Error("The SmartGov source returned an invalid record number.");
    const values = [...part.matchAll(/<div\b[^>]*>([^<]*)<\/div>/gi)].map(match => text(match[1], "published field", 200)).filter(Boolean);
    const statusIndex = values.findIndex(value => /^.+,\s*\d{1,2}\/\d{1,2}\/\d{4}$/.test(value));
    if (statusIndex < 1 || !values[statusIndex + 1]) throw new Error("The SmartGov source omitted expected permit fields. Earlier source records remain available.");
    const permitType = values[statusIndex - 1];
    const statusAndDate = values[statusIndex].match(/^(.+),\s*(\d{1,2}\/\d{1,2}\/\d{4})$/);
    if (!statusAndDate) throw new Error("The SmartGov source returned an invalid status date.");
    const status = text(statusAndDate[1], "status", 120);
    const street = values[statusIndex + 1];
    const locality = values[statusIndex + 2] ?? "";
    if (!permitType || !status || !street || (locality && !/^HEMPSTEAD,\s*NY(?:\s+\d{5})?$/i.test(locality))) throw new Error("The SmartGov source omitted expected permit fields. Earlier source records remain available.");
    const record: DiscoveredRecord = {
      externalId: `permit:${guid}`,
      sourceCaseId: recordNumber,
      name: `${permitType} ${recordNumber}`,
      town: "Hempstead",
      county: "Nassau",
      address: locality ? `${street}, ${locality}` : street,
      latitude: null,
      longitude: null,
      sourceTitle: "Village of Hempstead SmartGov permit search",
      sourceUrl: detailUrl(guid, origin),
      sourceDate: isoDate(statusAndDate[2], "status date"),
      sourceDateLabel: "SmartGov status date",
      classification: "opportunity",
      identityStatus: "resolved",
      details: {
        "Record type": permitType,
        "Published status": status,
        "Status meaning": statusMeaning(status),
        "Record number": recordNumber,
        "Portal record ID": guid,
        "Collection scope": "Public permit applications submitted in the last 30 days, limited to the first 100 results in SmartGov order.",
      },
    };
    record.evidence = evidence(record);
    return record;
  });
  return {records, total, page};
}

function headerField(html: string, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`<td\\b[^>]*class=["'][^"']*case-header-field-label[^"']*["'][^>]*>\\s*${escaped}\\s*<\\/td>\\s*<td\\b[^>]*class=["'][^"']*case-header-field-value[^"']*["'][^>]*>([\\s\\S]*?)<\\/td>`, "i"));
  return match?.[1] ?? "";
}

/** Parse the public landing page only. No signed-in sections or hidden contacts are read. */
export function parseSmartGovDetail(html: string, record: DiscoveredRecord): DiscoveredRecord {
  const guid = record.details["Portal record ID"];
  const pageId = html.match(/<input\b[^>]*id=["']Id["'][^>]*value=["']([^"']+)["']/i)?.[1]?.toLowerCase();
  if (pageId !== guid) throw new Error("The SmartGov detail page returned a different record identifier. Earlier source records remain available.");
  const permitType = text(html.match(/<td\b[^>]*class=["'][^"']*case-header-title[^"']*["'][^>]*>([\s\S]*?)<\/td>/i)?.[1] ?? "", "permit type", 200);
  if (permitType !== record.details["Record type"]) throw new Error("The SmartGov detail page returned a different permit type. Earlier source records remain available.");
  const recordCell = headerField(html, "Record Number");
  const recordNumber = text(recordCell.match(/<span\b[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "", "record number", 100);
  if (recordNumber !== record.sourceCaseId) throw new Error("The SmartGov detail page returned a different record number. Earlier source records remain available.");
  const status = text(recordCell.match(/<div\b[^>]*class=["'][^"']*case-header-status-badge[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? "", "status", 120);
  if (!status || status !== record.details["Published status"]) throw new Error("The SmartGov detail page returned a different status. Earlier source records remain available.");
  const referenceNumber = text(headerField(html, "Reference Number"), "reference number", 100);

  const section = html.match(/<section\b[^>]*id=["']projectsection-section["'][^>]*>([\s\S]*?)<\/section>/i)?.[1];
  if (!section) throw new Error("The SmartGov detail page omitted project information. Earlier source records remain available.");
  const left = section.match(/<table\b[^>]*class=["'][^"']*case-main-section-table-left[^"']*["'][^>]*>([\s\S]*?)<\/table>/i)?.[1] ?? "";
  const rows = [...left.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);
  const locationRow = rows.findIndex(row => /project-section-field-label/i.test(row) && />\s*Location\s*</i.test(row));
  const valueCells = (row: string) => [...row.matchAll(/<td\b[^>]*class=["'][^"']*project-section-field-value[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi)].map(match => text(match[1], "project field", 400));
  const street = locationRow >= 0 ? valueCells(rows[locationRow + 1] ?? "")[0] : "";
  const localityCells = locationRow >= 0 ? valueCells(rows[locationRow + 2] ?? "") : [];
  const locality = localityCells[0] ?? "";
  const parcel = localityCells[1] ?? "";
  if (!street || !/^HEMPSTEAD,\s*NY(?:\s+\d{5})?$/i.test(locality)) throw new Error("The SmartGov detail page returned an invalid location. Earlier source records remain available.");

  let latitude: number | null = null;
  let longitude: number | null = null;
  const point = html.match(/ProjectMapV4Point\s*=\s*(\{[^;]+\})\s*;/)?.[1];
  if (point) {
    let parsed: unknown;
    try { parsed = JSON.parse(point); } catch { throw new Error("The SmartGov detail page returned invalid published coordinates."); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("The SmartGov detail page returned invalid published coordinates.");
    const value = parsed as Record<string, unknown>;
    latitude = typeof value.latitude === "string" ? Number(value.latitude) : NaN;
    longitude = typeof value.longitude === "string" ? Number(value.longitude) : NaN;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new Error("The SmartGov detail page returned invalid published coordinates.");
  }

  const dateFields: Record<string, string> = {};
  for (const match of section.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*class=["'][^"']*project-section-field-label[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<td\b[^>]*class=["'][^"']*project-section-field-value[^"']*["'][^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi)) {
    const label = text(match[1], "date label", 80);
    const value = text(match[2], "date value", 80);
    if (!label || !value || /^\s*-\s*-\s*$/.test(value)) continue;
    if (["Created", "Submitted", "Approved", "Issued", "Closed", "Application Expires"].includes(label)) dateFields[label === "Application Expires" ? "Application expires" : label] = isoDate(value, `${label.toLowerCase()} date`);
  }
  const next: DiscoveredRecord = {
    ...record,
    address: `${street}, ${locality}`,
    latitude,
    longitude,
    details: {
      ...record.details,
      ...(referenceNumber ? {"Reference number": referenceNumber} : {}),
      ...(parcel ? {Parcel: parcel} : {}),
      ...dateFields,
    },
  };
  next.evidence = evidence(next);
  return next;
}

function dateParts(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric"}).formatToParts(now).filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
  const end = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const start = new Date(end); start.setUTCDate(start.getUTCDate() - 30);
  const format = (value: Date) => `${value.getUTCMonth() + 1}/${value.getUTCDate()}/${value.getUTCFullYear()}`;
  return {start: format(start), end: format(end)};
}

function searchBody(now: Date, validator: string) {
  const dates = dateParts(now);
  return new URLSearchParams({
    Module: "Permitting",
    CaseNumber: "",
    "CaseType.Description": "",
    "CaseType.LicenseType.IsChild": "",
    "Status.ProcessState": "",
    SubmittedOn: `${dates.start} To ${dates.end}`,
    IssuedOn: "",
    FinaledOn: "",
    "SiteAddress.Street1": "",
    "SiteAddress.City": "",
    "SiteAddress.ZipCode": "",
    "PrimaryParcel.Parcel.ParcelNumber": "",
    _conv: "1",
    __submitFormValidator__: validator,
  });
}

function allowedUrl(source: AutomatedSourceDefinition, value: string) {
  const url = new URL(value, source.endpoint.url);
  if (url.protocol !== "https:" || url.username || url.password || !source.endpoint.allowedOrigins.includes(url.origin)) throw new Error("The SmartGov request is outside the fixed allowed origin.");
  return url;
}

async function request(source: AutomatedSourceDefinition, value: string, deadline: AbortSignal, budget: RequestBudget, init: RequestInit = {}, expected: "html" | "json" = "html") {
  if (++budget.requests > source.limits.maxRequests) throw new Error("The SmartGov source exceeded the request limit.");
  const url = allowedUrl(source, value);
  const response = await fetch(url.href, {signal: AbortSignal.any([deadline, AbortSignal.timeout(30_000)]), redirect: "error", cache: "no-store", ...init});
  if (!response.ok) throw new Error(`The SmartGov source returned HTTP ${response.status}. Earlier source records remain available.`);
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (expected === "html" ? !contentType.startsWith("text/html") : !contentType.startsWith("application/json") && !contentType.startsWith("text/html")) throw new Error(`The SmartGov source returned an unexpected ${expected === "html" ? "page" : "validation response"}. Earlier source records remain available.`);
  if (!response.body) throw new Error("The SmartGov source returned an empty body. Earlier source records remain available.");
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let responseBytes = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      responseBytes += part.value.byteLength;
      budget.bytes += part.value.byteLength;
      if (responseBytes > source.limits.maxResponseBytes || (source.limits.maxTotalResponseBytes && budget.bytes > source.limits.maxTotalResponseBytes)) throw new Error("The SmartGov source exceeded the response size limit.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  return {body: new TextDecoder().decode(Buffer.concat(chunks)), headers: response.headers};
}

function cookie(headers: Headers) {
  const values = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") ?? ""];
  const session = values.map(value => value.split(";", 1)[0]).find(value => /^ASP\.NET_SessionId=[A-Za-z0-9_-]+$/.test(value));
  return session ?? null;
}

function sameListFacts(left: DiscoveredRecord, right: DiscoveredRecord) {
  return left.sourceCaseId === right.sourceCaseId && left.address === right.address && left.sourceDate === right.sourceDate && left.details["Record type"] === right.details["Record type"] && left.details["Published status"] === right.details["Published status"];
}

/** Collect the public 30-day permit window. Existing unchanged records skip detail requests. */
export async function fetchSmartGovRecords(source: AutomatedSourceDefinition, existingRecords: ReadonlyMap<string, DiscoveredRecord> = new Map(), now = new Date(), reportProgress?: (progress: SourceCollectionProgress) => void) {
  const deadline = AbortSignal.timeout(source.limits.maxDurationMs);
  const budget: RequestBudget = {requests: 0, bytes: 0};
  const start = await request(source, source.endpoint.url, deadline, budget, {headers: {Accept: "text/html"}});
  const session = cookie(start.headers);
  const validator = `a${now.getTime()}bcd`;
  const body = searchBody(now, validator);
  const headers = {Accept: "text/html", "Content-Type": "application/x-www-form-urlencoded", ...(session ? {Cookie: session} : {})};
  const validate = new URLSearchParams(body); validate.set("ILS-Ajax", "Y");
  const validation = await request(source, "/ApplicationPublic/ApplicationSearchAdvanced/ValidateFormEntries", deadline, budget, {method: "POST", headers: {...headers, Accept: "application/json"}, body: validate.toString()}, "json");
  let validationResult: unknown;
  try { validationResult = JSON.parse(validation.body); } catch { throw new Error("The SmartGov source returned an unreadable validation response."); }
  if (!validationResult || typeof validationResult !== "object" || (validationResult as Record<string, unknown>).status !== "success") throw new Error("The SmartGov source rejected the fixed public permit search. Earlier source records remain available.");
  const first = await request(source, "/ApplicationPublic/ApplicationSearchAdvanced/Search", deadline, budget, {method: "POST", headers, body: body.toString()});
  const initial = parseSmartGovSearchPage(first.body, 0);
  const records = [...initial.records];
  reportProgress?.({coverage: null, fetched: records.length, rejected: 0});
  const pages = Math.min(source.limits.maxPages ?? 1, Math.ceil(initial.total / SEARCH_PAGE_SIZE), Math.ceil(source.limits.maxRecords / SEARCH_PAGE_SIZE));
  for (let page = 1; page < pages; page++) {
    const pageBody = new URLSearchParams(body); pageBody.set("_applicationSearchPage", String(page)); pageBody.set("ILS-Ajax", "Y");
    const response = await request(source, "/ApplicationPublic/ApplicationSearchAdvanced/SearchPage", deadline, budget, {method: "POST", headers, body: pageBody.toString()});
    const parsed = parseSmartGovSearchPage(response.body, page);
    if (parsed.total !== initial.total) throw new Error("The SmartGov result count changed during collection. Earlier source records remain available.");
    records.push(...parsed.records);
    reportProgress?.({coverage: null, fetched: records.length, rejected: 0});
  }
  const bounded = records.slice(0, source.limits.maxRecords);
  if (new Set(bounded.map(record => record.externalId)).size !== bounded.length || new Set(bounded.map(record => record.sourceCaseId)).size !== bounded.length) throw new Error("The SmartGov search repeated a record identity. Earlier source records remain available.");
  const output = new Array<DiscoveredRecord>(bounded.length);
  let rejected = 0;
  let next = 0;
  await Promise.all(Array.from({length: Math.min(DETAIL_WORKERS, bounded.length)}, async () => {
    for (;;) {
      const index = next++;
      if (index >= bounded.length) return;
      const listed = bounded[index];
      const previous = existingRecords.get(listed.externalId);
      if (previous && sameListFacts(previous, listed)) {
        output[index] = previous;
      } else {
        try {
          const detail = await request(source, listed.sourceUrl, deadline, budget, {headers: {Accept: "text/html", ...(session ? {Cookie: session} : {})}});
          output[index] = parseSmartGovDetail(detail.body, listed);
        } catch {
          rejected++;
        }
      }
      reportProgress?.({coverage: null, fetched: records.length, rejected});
    }
  }));
  return output.filter((record): record is DiscoveredRecord => Boolean(record));
}
