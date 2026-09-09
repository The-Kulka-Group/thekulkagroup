import type { DiscoveredRecord } from "./discovery-source";
import { InvalidVisionInput } from "./input";

export type AutomatedSourceCoverage = { year: number; documents: string[] } | null;

export type SourceCollectionResult = {
  records: DiscoveredRecord[];
  coverage: AutomatedSourceCoverage;
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
    maxPages?: number;
    maxTotalResponseBytes?: number;
  };
  identityRule: string;
  evidenceRule: string;
  coverage: string;
  schedule: { cadence: "daily" };
  enabled: boolean;
};

type SourceAdapter = {
  collect(source: AutomatedSourceDefinition): Promise<SourceCollectionResult>;
};

const SOURCE_ADAPTERS: Record<string, SourceAdapter> = {
  "arcgis-feature-layers": {
    async collect() {
      const { fetchDiscoveryRecords } = await import("./discovery-source");
      return { records: await fetchDiscoveryRecords(), coverage: null };
    },
  },
  "suffolk-planning-documents": {
    async collect() {
      const { fetchSuffolkRecords } = await import("./suffolk-source");
      const records = await fetchSuffolkRecords();
      const fallbackYear = Number(new Intl.DateTimeFormat("en", { timeZone: "America/New_York", year: "numeric" }).format(new Date()));
      return {
        records,
        coverage: {
          year: Number(records[0]?.details["Collection year"] || fallbackYear),
          documents: [...new Set(records.flatMap(record => record.evidence?.map(page => page.url.split("#")[0]) ?? []))].sort(),
        },
      };
    },
  },
  "nassau-ida-project-table": {
    async collect() {
      const { fetchNassauIdaRecords } = await import("./ida-source");
      return { records: await fetchNassauIdaRecords(), coverage: null };
    },
  },
  "suffolk-ida-resource-index": {
    async collect() {
      const { fetchSuffolkIdaRecords } = await import("./ida-source");
      return { records: await fetchSuffolkIdaRecords(), coverage: null };
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

export function discoverySourceId(value: unknown = DEFAULT_AUTOMATED_SOURCE_ID): string {
  if (typeof value !== "string" || !DISCOVERY_SOURCE_IDS.includes(value)) throw new InvalidVisionInput("Choose a supported source.");
  return value;
}

export function automatedSourceDefinition(value: unknown = DEFAULT_AUTOMATED_SOURCE_ID): AutomatedSourceDefinition {
  const id = discoverySourceId(value);
  return AUTOMATED_SOURCE_DEFINITIONS.find(source => source.id === id)!;
}

export async function collectAutomatedSource(value: unknown = DEFAULT_AUTOMATED_SOURCE_ID): Promise<SourceCollectionResult> {
  const source = automatedSourceDefinition(value);
  return SOURCE_ADAPTERS[source.adapterKey].collect(source);
}
