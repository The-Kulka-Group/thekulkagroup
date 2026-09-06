/** Nassau's official Planning page links the map backed by this public service. */
const SERVICE = "https://services1.arcgis.com/rsOafHhKLHpnpr4t/arcgis/rest/services/NCPC_Cases_Map/FeatureServer";
const RECORD_LIMIT = 100;
const RESPONSE_LIMIT = 1_000_000;
export const DISCOVERY_SOURCE = {
  id: "nassau-applications",
  name: "Nassau planning applications",
  url: "https://www.nassaucountyny.gov/Planning",
  coverage: "Checks up to 100 records per category: Nassau zoning, major subdivisions and minor subdivisions, ordered by the county’s record number. These records can include older applications and zoning policy changes. Other sources still require manual review.",
};
export type DiscoveredRecord = {
  externalId: string; name: string; town: string; county: string; address: string;
  latitude: number | null; longitude: number | null;
  sourceTitle: string; sourceUrl: string; sourceDate: string | null;
  sourceDateLabel: string; details: Record<string, string>;
};
const LAYERS = [
  { id: 0, name: "Zoning referral", dateField: "Referral_Date", dateLabel: "Referral date", fields: "OBJECTID,GlobalID,File_No,Referral_Date,Municipality,Type_Referral,Address,Multi_Fam" },
  { id: 1, name: "Major subdivision", dateField: "Init_Filing_Date", dateLabel: "Initial filing date", fields: "OBJECTID,GlobalID,File_No,Init_Filing_Date,Approve_Date,Address,No_Lots" },
  { id: 2, name: "Minor subdivision", dateField: null, dateLabel: "Source date", fields: "OBJECTID,GlobalID,File_No,Section,Block,Lots,Address,No_Lots" },
] as const;
type JsonObject = Record<string, unknown>;
function object(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("The Nassau source returned an unreadable record.");
  return value as JsonObject;
}
function field(attributes: JsonObject, key: string, required = false): string {
  const value = attributes[key];
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > 400 || (required && !value.trim())) throw new Error(`The Nassau source returned an invalid ${key} field.`);
  return value.trim();
}
function date(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("The Nassau source returned an invalid date.");
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.getUTCFullYear() < 1900 || parsed.getUTCFullYear() > 2100) throw new Error("The Nassau source returned an invalid date.");
  // ArcGIS date attributes are epoch milliseconds. Preserve the UTC calendar date.
  return parsed.toISOString().slice(0, 10);
}
function parseFeature(value: unknown, layer: typeof LAYERS[number]): DiscoveredRecord {
  const feature = object(value);
  const attributes = object(feature.attributes);
  if (layer.fields.split(",").some(key => !Object.hasOwn(attributes, key))) throw new Error("The Nassau source omitted expected fields. Earlier finds have been kept.");
  const globalId = field(attributes, "GlobalID", true).replace(/[{}]/g, "").toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(globalId)) throw new Error("The Nassau source returned an invalid record identifier.");
  const objectId = attributes.OBJECTID;
  if (!Number.isSafeInteger(objectId) || (objectId as number) < 1) throw new Error("The Nassau source returned an invalid object identifier.");
  const file = field(attributes, "File_No", true);
  let latitude: number | null = null;
  let longitude: number | null = null;
  if (feature.geometry != null) {
    const geometry = object(feature.geometry);
    if (typeof geometry.x !== "number" || !Number.isFinite(geometry.x) || geometry.x < -180 || geometry.x > 180 || typeof geometry.y !== "number" || !Number.isFinite(geometry.y) || geometry.y < -90 || geometry.y > 90) throw new Error("The Nassau source returned invalid coordinates.");
    longitude = geometry.x; latitude = geometry.y;
  }
  const details: Record<string, string> = { "Record type": layer.name, "File number": file };
  for (const [key, label] of [["Type_Referral", "Referral type"], ["Multi_Fam", "Multi-family field"], ["Block", "Tax block"], ["Lots", "Tax lots"]]) {
    const text = field(attributes, key);
    if (text) details[label] = text;
  }
  for (const [key, label] of [["No_Lots", "Number of lots"], ["Section", "Tax section"]]) {
    const number = attributes[key];
    if (number != null) {
      if (typeof number !== "number" || !Number.isFinite(number) || number < 0) throw new Error(`The Nassau source returned an invalid ${key} field.`);
      details[label] = String(number);
    }
  }
  const approvalDate = date(attributes.Approve_Date);
  if (approvalDate) details["Approval date reported by source"] = approvalDate;
  const sourceUrl = new URL(`${SERVICE}/${layer.id}/query`);
  sourceUrl.search = new URLSearchParams({ where: `GlobalID='${globalId}'`, outFields: "*", returnGeometry: "true", outSR: "4326", f: "html" }).toString();
  return {
    externalId: `${layer.id}:${globalId}`, name: `${layer.name}: ${file}`,
    town: field(attributes, "Municipality"), county: "Nassau", address: field(attributes, "Address"),
    latitude, longitude, sourceTitle: `Nassau Planning Commission: ${layer.name}`,
    sourceUrl: sourceUrl.toString(), sourceDate: layer.dateField ? date(attributes[layer.dateField]) : null,
    sourceDateLabel: layer.dateLabel, details,
  };
}
async function readSource(url: URL): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "error", cache: "no-store", headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`The Nassau source returned HTTP ${response.status}.`);
  if (!response.body) throw new Error("The Nassau source returned no response body.");
  const reader = response.body.getReader();
  let length = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > RESPONSE_LIMIT) throw new Error("The Nassau source exceeded the response size limit.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("The Nassau source returned unreadable JSON."); }
}
export async function fetchDiscoveryRecords(): Promise<DiscoveredRecord[]> {
  const records: DiscoveredRecord[] = [];
  // Three bounded requests. The stated coverage intentionally selects 100 per layer.
  for (const layer of LAYERS) {
    const url = new URL(`${SERVICE}/${layer.id}/query`);
    url.search = new URLSearchParams({ f: "json", where: "1=1", outFields: layer.fields, outSR: "4326", returnGeometry: "true", orderByFields: "OBJECTID DESC", resultRecordCount: String(RECORD_LIMIT) }).toString();
    const result = object(await readSource(url));
    if (result.error || !Array.isArray(result.features) || result.features.length === 0 || result.features.length > RECORD_LIMIT) throw new Error("The Nassau source returned an empty or unexpected result. Earlier finds have been kept.");
    if (object(result.spatialReference).wkid !== 4326) throw new Error("The Nassau source returned an unexpected coordinate system.");
    records.push(...result.features.map(feature => parseFeature(feature, layer)));
  }
  if (new Set(records.map(record => record.externalId)).size !== records.length) throw new Error("The Nassau source returned duplicate record identifiers.");
  return records;
}
