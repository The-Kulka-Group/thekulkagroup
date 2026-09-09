export const JURISDICTION_TYPES = ["county", "city", "town", "village"] as const;
export const ACCESS_MODES = ["automated", "public-online", "request-or-contact", "no-public-feed"] as const;
export const COLLECTION_STATES = ["collectable", "manual", "restricted", "no-public-feed"] as const;
export const MUNICIPAL_SOURCE_CHECKED_AT = "2026-09-09";

export type JurisdictionType = typeof JURISDICTION_TYPES[number];
export type SourceAccessMode = typeof ACCESS_MODES[number];
export type SourceCollectionState = typeof COLLECTION_STATES[number];

export type MunicipalSource = {
  id: string;
  name: string;
  jurisdiction: string;
  jurisdictionType: JurisdictionType;
  county: "Nassau" | "Suffolk";
  officialAgency: string;
  recordFamilies: readonly string[];
  retrievableFields: readonly string[];
  accessMode: SourceAccessMode;
  collectionState: SourceCollectionState;
  manualSteps: string;
  limits: string;
  coverage: string;
  url: string;
  checkedAt: string;
};

export type SourceDirectoryFilters = {
  county?: MunicipalSource["county"] | "";
  jurisdiction?: string;
  jurisdictionType?: JurisdictionType | "";
  recordFamily?: string;
  accessMode?: SourceAccessMode | "";
};

export type SourceCoverageSummary = {
  localJurisdictions: {total: number; Nassau: number; Suffolk: number};
  countySources: number;
  directorySources: number;
  collectableSources: number;
  accessModes: Record<SourceAccessMode, number>;
};

export const ACCESS_MODE_LABELS: Record<SourceAccessMode, string> = {
  automated: "Vision collects this source",
  "public-online": "Public source, manual review",
  "request-or-contact": "Request or contact needed",
  "no-public-feed": "No public project feed found",
};

export const ACCESS_MODE_STATUS_LABELS: Record<SourceAccessMode, string> = {
  automated: "Collected",
  "public-online": "Public manual",
  "request-or-contact": "Request needed",
  "no-public-feed": "No public feed",
};

export const COLLECTION_STATE_STATUS: Record<SourceCollectionState, "done" | "open" | "working" | "stuck"> = {
  collectable: "done",
  manual: "open",
  restricted: "working",
  "no-public-feed": "stuck",
};

export function validateMunicipalSources(sources: readonly MunicipalSource[]) {
  const ids = new Set<string>();
  for (const source of sources) {
    if (ids.has(source.id)) throw new Error(`Duplicate municipal source ID: ${source.id}`);
    ids.add(source.id);
    if (!source.id || !source.name || !source.jurisdiction || !source.officialAgency) throw new Error("A municipal source is missing its identity.");
    if (!source.recordFamilies.length || !source.retrievableFields.length) throw new Error(`Municipal source ${source.id} is missing capability details.`);
    if (!/^https:\/\//.test(source.url)) throw new Error(`Municipal source ${source.id} must use an official HTTPS URL.`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(source.checkedAt)) throw new Error(`Municipal source ${source.id} has an invalid checked date.`);
    if (source.accessMode === "automated" && source.collectionState !== "collectable") throw new Error(`Municipal source ${source.id} has inconsistent collection claims.`);
    if (source.collectionState === "collectable" && source.accessMode !== "automated") throw new Error(`Municipal source ${source.id} has inconsistent access claims.`);
  }
  return sources;
}

export function filterMunicipalSources(sources: readonly MunicipalSource[], filters: SourceDirectoryFilters) {
  return sources.filter(source =>
    (!filters.county || source.county === filters.county)
    && (!filters.jurisdiction || jurisdictionFilterValue(source) === filters.jurisdiction)
    && (!filters.jurisdictionType || source.jurisdictionType === filters.jurisdictionType)
    && (!filters.recordFamily || source.recordFamilies.includes(filters.recordFamily))
    && (!filters.accessMode || source.accessMode === filters.accessMode));
}

export function jurisdictionFilterValue(source: MunicipalSource) {
  return `${source.county}:${source.jurisdictionType}:${source.jurisdiction}`;
}

export function sourceJurisdictions(sources: readonly MunicipalSource[]) {
  const unique = new Map<string, {value: string; label: string}>();
  for (const source of sources) {
    const value = jurisdictionFilterValue(source);
    unique.set(value, {
      value,
      label: `${source.jurisdiction} · ${source.jurisdictionType.replace(/^./, letter => letter.toUpperCase())} · ${source.county}`,
    });
  }
  return [...unique.values()].sort((left, right) => left.label.localeCompare(right.label));
}

export function sourceCoverageSummary(sources: readonly MunicipalSource[]): SourceCoverageSummary {
  const local = sources.filter(source => source.jurisdictionType !== "county");
  const localKeys = new Set(local.map(jurisdictionFilterValue));
  const countyCount = (county: MunicipalSource["county"]) =>
    new Set(local.filter(source => source.county === county).map(jurisdictionFilterValue)).size;
  const accessModes = Object.fromEntries(ACCESS_MODES.map(mode => [mode, sources.filter(source => source.accessMode === mode).length])) as Record<SourceAccessMode, number>;

  return {
    localJurisdictions: {total: localKeys.size, Nassau: countyCount("Nassau"), Suffolk: countyCount("Suffolk")},
    countySources: sources.filter(source => source.jurisdictionType === "county").length,
    directorySources: sources.length,
    collectableSources: sources.filter(source => source.collectionState === "collectable").length,
    accessModes,
  };
}

export function sourceRecordFamilies(sources: readonly MunicipalSource[]) {
  return [...new Set(sources.flatMap(source => source.recordFamilies))].sort();
}
