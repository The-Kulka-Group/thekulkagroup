import type { DiscoveredRecord } from "./discovery-source";
import { InvalidVisionInput } from "./input";

export type AutomatedSourceCoverage = { year: number; documents: string[] } | null;

export type SourceCollectionProgress = {
  coverage: AutomatedSourceCoverage;
  fetched: number;
  rejected: number;
};

export type SourceCollectionResult = SourceCollectionProgress & {
  records: DiscoveredRecord[];
};

/** Lets a bounded adapter retain the work it measured before a failed run. */
export class SourceCollectionFailure extends Error {
  constructor(message: string, readonly progress: SourceCollectionProgress, options?: ErrorOptions) {
    super(message, options);
    this.name = "SourceCollectionFailure";
  }
}

export type SourceCollectionContext = {
  existingRecords?: ReadonlyMap<string, DiscoveredRecord>;
  reportProgress?: (progress: SourceCollectionProgress) => void;
};

export type AutomatedSourceDefinition = {
  id: string;
  name: string;
  officialAgency: string;
  jurisdiction: string;
  county: "Nassau" | "Suffolk";
  adapterKey: string;
  directoryUrl: string;
  endpoint: {
    url: string;
    allowedOrigins: readonly string[];
  };
  limits: {
    maxRequests: number;
    maxRecords: number;
    maxResponseBytes: number;
    maxDurationMs: number;
    maxDocuments?: number;
    maxMeetings?: number;
    maxPages?: number;
    maxYears?: number;
    maxTotalResponseBytes?: number;
  };
  identityRule: string;
  evidenceRule: string;
  coverage: string;
  schedule: { cadence: "daily" };
  enabled: boolean;
};

type SourceAdapter = {
  collect(source: AutomatedSourceDefinition, context?: SourceCollectionContext): Promise<SourceCollectionResult>;
};

function completedCollection(records: DiscoveredRecord[], coverage: AutomatedSourceCoverage = null): SourceCollectionResult {
  return {records, coverage, fetched: records.length, rejected: 0};
}

const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  "arcgis-feature-layers": {
    async collect() {
      const { fetchDiscoveryRecords } = await import("./discovery-source");
      const records = await fetchDiscoveryRecords();
      return completedCollection(records);
    },
  },
  "suffolk-planning-documents": {
    async collect() {
      const { fetchSuffolkRecords } = await import("./suffolk-source");
      const records = await fetchSuffolkRecords();
      const fallbackYear = Number(new Intl.DateTimeFormat("en", { timeZone: "America/New_York", year: "numeric" }).format(new Date()));
      return completedCollection(records, {
        year: Number(records[0]?.details["Collection year"] || fallbackYear),
        documents: [...new Set(records.flatMap(record => record.evidence?.map(page => page.url.split("#")[0]) ?? []))].sort(),
      });
    },
  },
  "nassau-ida-project-table": {
    async collect() {
      const { fetchNassauIdaRecords } = await import("./ida-source");
      const records = await fetchNassauIdaRecords();
      return completedCollection(records);
    },
  },
  "suffolk-ida-resource-index": {
    async collect() {
      const { fetchSuffolkIdaRecords } = await import("./ida-source");
      const records = await fetchSuffolkIdaRecords();
      return completedCollection(records);
    },
  },
  "oyster-bay-zba-documents": {
    async collect(source) {
      const { fetchOysterBayZbaRecords } = await import("./oyster-bay-zba-source");
      return fetchOysterBayZbaRecords(source);
    },
  },
  "civicplus-agenda-center": {
    async collect(source) {
      const { fetchCivicPlusRecords } = await import("./civicplus-source");
      return fetchCivicPlusRecords(source);
    },
  },
  "smartgov-public-permits": {
    async collect(source, context) {
      const { fetchSmartGovRecords } = await import("./smartgov-source");
      let progress: SourceCollectionProgress = {coverage: null, fetched: 0, rejected: 0};
      const records = await fetchSmartGovRecords(source, context?.existingRecords, new Date(), value => {
        progress = value;
        context?.reportProgress?.(value);
      });
      return {records, coverage: null, fetched: Math.max(progress.fetched, records.length), rejected: progress.rejected};
    },
  },
};

export const REGISTERED_SOURCE_ADAPTER_KEYS = Object.freeze(Object.keys(SOURCE_ADAPTERS));

const SOURCE_DEFINITION_INPUTS: AutomatedSourceDefinition[] = [
  {
    id: "nassau-applications",
    name: "Nassau planning applications",
    officialAgency: "Nassau County Planning Commission",
    jurisdiction: "Nassau County",
    county: "Nassau",
    adapterKey: "arcgis-feature-layers",
    directoryUrl: "https://www.nassaucountyny.gov/Planning",
    endpoint: {
      url: "https://services1.arcgis.com/rsOafHhKLHpnpr4t/arcgis/rest/services/NCPC_Cases_Map/FeatureServer",
      allowedOrigins: ["https://services1.arcgis.com"],
    },
    limits: { maxRequests: 3, maxRecords: 300, maxResponseBytes: 1_000_000, maxDurationMs: 45_000 },
    identityRule: "Vision joins the ArcGIS layer ID to the publisher GlobalID.",
    evidenceRule: "Evidence includes the official ArcGIS record URL and the fields returned by the county service.",
    coverage: "Checks up to 100 records per category: Nassau zoning, major subdivisions and minor subdivisions, ordered by the county’s record number. These records can include older applications and zoning policy changes. Local records outside these categories require manual review.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
  {
    id: "suffolk-planning",
    name: "Suffolk planning documents",
    officialAgency: "Suffolk County Planning Commission",
    jurisdiction: "Suffolk County",
    county: "Suffolk",
    adapterKey: "suffolk-planning-documents",
    directoryUrl: "https://www.suffolkcountyny.gov/Departments/Economic-Development-and-Planning/Planning-and-Environment/Regulatory-Review/Suffolk-County-Planning-Commission",
    endpoint: {
      url: "https://www.suffolkcountyny.gov/Departments/Economic-Development-and-Planning/Planning-and-Environment/Regulatory-Review/Suffolk-County-Planning-Commission",
      allowedOrigins: ["https://www.suffolkcountyny.gov"],
    },
    limits: { maxRequests: 162, maxRecords: 2_000, maxResponseBytes: 8_000_000, maxDurationMs: 180_000, maxDocuments: 80, maxPages: 120, maxTotalResponseBytes: 80_000_000 },
    identityRule: "Vision joins the publisher file number to the municipality when both agree. Otherwise, Vision uses the official document URL hash.",
    evidenceRule: "Evidence includes the official meeting document URL, SHA-256 checksum, page number and bounded embedded text.",
    coverage: "Checks the current year's linked agendas, staff reports, meeting summaries and resolutions. Notices and drawing content are excluded. This covers county referrals, not every Suffolk project or local permit. Records without confirmed coordinates stay in the review list.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
  {
    id: "nassau-ida",
    name: "Nassau IDA projects",
    officialAgency: "Nassau County Industrial Development Agency",
    jurisdiction: "Nassau County",
    county: "Nassau",
    adapterKey: "nassau-ida-project-table",
    directoryUrl: "https://nassauida.org/projects-documents",
    endpoint: {
      url: "https://nassauida.org/projects-documents",
      allowedOrigins: ["https://nassauida.org", "https://nassauida-assets.s3.amazonaws.com"],
    },
    limits: { maxRequests: 60, maxRecords: 2_000, maxResponseBytes: 2_000_000, maxDurationMs: 180_000, maxPages: 30 },
    identityRule: "Vision joins the normalized publisher project name to the listed address.",
    evidenceRule: "Evidence includes official project index fields and linked PDF metadata. The collector does not read PDF contents.",
    coverage: "Checks the public project table and its linked document metadata, following up to 30 pages. Dates are listed document dates. IDA status describes financial assistance, not construction or bidding. PDF contents and map coordinates require review.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
  {
    id: "suffolk-ida",
    name: "Suffolk IDA project filings",
    officialAgency: "Suffolk County Industrial Development Agency",
    jurisdiction: "Suffolk County",
    county: "Suffolk",
    adapterKey: "suffolk-ida-resource-index",
    directoryUrl: "https://suffolkida.org/resources/",
    endpoint: {
      url: "https://suffolkida.org/resources/",
      allowedOrigins: ["https://suffolkida.org"],
    },
    limits: { maxRequests: 2, maxRecords: 300, maxResponseBytes: 2_000_000, maxDurationMs: 60_000, maxDocuments: 15 },
    identityRule: "Vision uses the official linked document URL hash.",
    evidenceRule: "Evidence includes the official resource index label, meeting date and linked PDF URL. The collector does not read PDF contents.",
    coverage: "Checks named applications, abstracts and project hearing links in the first 15 resource entries. Older archive pages and the separate hearings tab are excluded. Dates are index meeting dates, not filing dates. PDF contents and project locations require review.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
  {
    id: "nassau-town-oyster-bay-records",
    name: "Oyster Bay Zoning Board hearing calendars",
    officialAgency: "Town of Oyster Bay Zoning Board of Appeals",
    jurisdiction: "Oyster Bay",
    county: "Nassau",
    adapterKey: "oyster-bay-zba-documents",
    directoryUrl: "https://oysterbaytown.com/calendars/zoning-board-of-appeals/",
    endpoint: {
      url: "https://oysterbaytown.com/calendars/zoning-board-of-appeals/",
      allowedOrigins: ["https://oysterbaytown.com"],
    },
    limits: { maxRequests: 27, maxRecords: 500, maxResponseBytes: 2_000_000, maxDurationMs: 120_000, maxDocuments: 26, maxPages: 20, maxTotalResponseBytes: 30_000_000 },
    identityRule: "Vision joins the Town of Oyster Bay publishing authority to the published Zoning Board appeal number.",
    evidenceRule: "Evidence includes the official hearing calendar PDF, SHA-256 checksum, physical page number and bounded embedded text for the appeal.",
    coverage: "Checks linked public hearing calendars in the current year's Zoning Board of Appeals schedule. Planning Advisory Board documents, decisions, permits, approval status, project value and map coordinates are excluded.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
  {
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
    limits: { maxRequests: 13, maxRecords: 200, maxResponseBytes: 5_000_000, maxDurationMs: 90_000, maxDocuments: 12, maxMeetings: 12, maxPages: 240, maxYears: 2, maxTotalResponseBytes: 40_000_000 },
    identityRule: "Vision joins CivicPlus category 3 to a published case number. Records without a case number and address remain unresolved under their meeting and document identity.",
    evidenceRule: "Evidence includes the official agenda or minutes URL, document kind, meeting date, CivicPlus meeting ID, SHA-256 checksum, page number and bounded PDF text.",
    coverage: "Checks up to 12 Planning Board agendas or minutes from the current and prior year. Vision reads embedded PDF text only. Other files remain unresolved, and published records do not prove permit approval or current construction status.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
  {
    id: "nassau-village-hempstead-zoning-records",
    name: "Hempstead Village Zoning Board records",
    officialAgency: "Village of Hempstead Board of Zoning Appeals",
    jurisdiction: "Hempstead",
    county: "Nassau",
    adapterKey: "civicplus-agenda-center",
    directoryUrl: "https://www.villageofhempstead.org/AgendaCenter/Zoning-Board-of-Appeals-5",
    endpoint: {
      url: "https://www.villageofhempstead.org/AgendaCenter/Zoning-Board-of-Appeals-5",
      allowedOrigins: ["https://www.villageofhempstead.org"],
    },
    limits: { maxRequests: 13, maxRecords: 200, maxResponseBytes: 5_000_000, maxDurationMs: 90_000, maxDocuments: 12, maxMeetings: 12, maxPages: 240, maxYears: 2, maxTotalResponseBytes: 40_000_000 },
    identityRule: "Vision joins CivicPlus category 5 to a published zoning case number. Repeated numbers for different matters remain unresolved.",
    evidenceRule: "Evidence includes the official agenda or minutes URL, document kind, meeting date, CivicPlus meeting ID, SHA-256 checksum, page number and bounded PDF text.",
    coverage: "Checks up to 12 Board of Zoning Appeals agendas or minutes from the current and prior year. Vision reads embedded PDF text only. Microsoft Word files remain unresolved, and board records do not prove permit approval or construction status.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
  {
    id: "nassau-village-garden-city-records",
    name: "Garden City Zoning Board records",
    officialAgency: "Village of Garden City Zoning Board of Appeals",
    jurisdiction: "Garden City",
    county: "Nassau",
    adapterKey: "civicplus-agenda-center",
    directoryUrl: "https://www.gardencityny.net/AgendaCenter/Zoning-Board-of-Appeals-9",
    endpoint: {
      url: "https://www.gardencityny.net/AgendaCenter/Zoning-Board-of-Appeals-9",
      allowedOrigins: ["https://www.gardencityny.net"],
    },
    limits: { maxRequests: 13, maxRecords: 200, maxResponseBytes: 5_000_000, maxDurationMs: 90_000, maxDocuments: 12, maxMeetings: 12, maxPages: 240, maxYears: 2, maxTotalResponseBytes: 40_000_000 },
    identityRule: "Vision joins CivicPlus category 9 to the published Building Department application number. Records without that number and an address remain unresolved.",
    evidenceRule: "Evidence includes the official agenda or minutes URL, document kind, meeting date, CivicPlus meeting ID, SHA-256 checksum, page number and bounded PDF text.",
    coverage: "Checks up to 12 Zoning Board of Appeals agendas or minutes from the current and prior year. Vision reads embedded PDF text only. Board records do not prove permit approval or current construction status.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
  {
    id: "hempstead-village-smartgov",
    name: "Hempstead Village permits",
    officialAgency: "Village of Hempstead Building Department",
    jurisdiction: "Hempstead",
    county: "Nassau",
    adapterKey: "smartgov-public-permits",
    directoryUrl: "https://vlg-hempstead-ny.smartgovcommunity.com/ApplicationPublic/ApplicationSearchAdvanced",
    endpoint: {
      url: "https://vlg-hempstead-ny.smartgovcommunity.com/ApplicationPublic/ApplicationSearchAdvanced",
      allowedOrigins: ["https://vlg-hempstead-ny.smartgovcommunity.com"],
    },
    limits: { maxRequests: 112, maxRecords: 100, maxResponseBytes: 1_000_000, maxDurationMs: 180_000, maxPages: 10, maxTotalResponseBytes: 20_000_000 },
    identityRule: "Vision joins SmartGov's portal GUID to its published permit record number and keeps both source-owned identifiers.",
    evidenceRule: "Evidence includes the official public detail link and the permit fields published by SmartGov during collection.",
    coverage: "Checks permit applications submitted in the last 30 days, limited to the first 100 results in SmartGov order. Older records and changes outside that submitted-date window are excluded. SmartGov status is not a claim about construction progress or bid availability.",
    schedule: { cadence: "daily" },
    enabled: true,
  },
];

function freezeDefinition(source: AutomatedSourceDefinition): AutomatedSourceDefinition {
  return Object.freeze({
    ...source,
    endpoint: Object.freeze({ ...source.endpoint, allowedOrigins: Object.freeze([...source.endpoint.allowedOrigins]) }),
    limits: Object.freeze({ ...source.limits }),
    schedule: Object.freeze({ ...source.schedule }),
  });
}

export function validateAutomatedSourceDefinitions(sources: readonly AutomatedSourceDefinition[]): readonly AutomatedSourceDefinition[] {
  const ids = new Set<string>();
  const adapterKeys = new Set(REGISTERED_SOURCE_ADAPTER_KEYS);
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`Duplicate automated source ID: ${source.id}`);
    ids.add(source.id);
    if (!source.id || !source.name || !source.officialAgency || !source.jurisdiction || !source.identityRule || !source.evidenceRule || !source.coverage) throw new Error("An automated source is missing required details.");
    if (!adapterKeys.has(source.adapterKey)) throw new Error(`Automated source ${source.id} names an unregistered adapter.`);
    let endpoint: URL;
    let directory: URL;
    try {
      endpoint = new URL(source.endpoint.url);
      directory = new URL(source.directoryUrl);
    } catch {
      throw new Error(`Automated source ${source.id} has an invalid endpoint.`);
    }
    if (endpoint.protocol !== "https:" || directory.protocol !== "https:" || endpoint.username || endpoint.password || directory.username || directory.password) throw new Error(`Automated source ${source.id} must use fixed HTTPS endpoints.`);
    if (!source.endpoint.allowedOrigins.length || !source.endpoint.allowedOrigins.includes(endpoint.origin)) throw new Error(`Automated source ${source.id} endpoint is outside its fixed allowed origin.`);
    for (const origin of source.endpoint.allowedOrigins) {
      try {
        if (new URL(origin).origin !== origin || new URL(origin).protocol !== "https:") throw new Error();
      } catch {
        throw new Error(`Automated source ${source.id} has an invalid allowed origin.`);
      }
    }
    const limits = Object.values(source.limits);
    if (limits.some(limit => !Number.isSafeInteger(limit) || limit <= 0)) throw new Error(`Automated source ${source.id} has incomplete collection limits.`);
    if (source.schedule.cadence !== "daily" || typeof source.enabled !== "boolean") throw new Error(`Automated source ${source.id} has invalid run settings.`);
  }
  return sources;
}

export const AUTOMATED_SOURCE_DEFINITIONS = Object.freeze(
  validateAutomatedSourceDefinitions(SOURCE_DEFINITION_INPUTS).map(freezeDefinition),
);

export const DEFAULT_AUTOMATED_SOURCE_ID = "nassau-applications";
export const DISCOVERY_SOURCE_IDS = Object.freeze(AUTOMATED_SOURCE_DEFINITIONS.map(source => source.id));

export function enabledAutomatedSourceDefinitions(sources: readonly AutomatedSourceDefinition[] = AUTOMATED_SOURCE_DEFINITIONS) {
  return sources.filter(source => source.enabled);
}

export function discoverySourceId(value: unknown = DEFAULT_AUTOMATED_SOURCE_ID): string {
  if (typeof value !== "string" || !DISCOVERY_SOURCE_IDS.includes(value)) throw new InvalidVisionInput("Choose a supported source.");
  return value;
}

export function automatedSourceDefinition(value: unknown = DEFAULT_AUTOMATED_SOURCE_ID): AutomatedSourceDefinition {
  const id = discoverySourceId(value);
  return AUTOMATED_SOURCE_DEFINITIONS.find(source => source.id === id)!;
}

export async function collectAutomatedSource(value: unknown = DEFAULT_AUTOMATED_SOURCE_ID, context?: SourceCollectionContext): Promise<SourceCollectionResult> {
  const source = automatedSourceDefinition(value);
  return SOURCE_ADAPTERS[source.adapterKey].collect(source, context);
}
