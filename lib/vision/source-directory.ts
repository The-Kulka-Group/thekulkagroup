export const JURISDICTION_TYPES = ["county", "city", "town", "village"] as const;
export const ACCESS_MODES = ["automated", "public-online", "request-or-contact", "no-public-feed"] as const;
export const COLLECTION_STATES = ["collectable", "manual", "restricted", "no-public-feed"] as const;

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
  jurisdictionType?: JurisdictionType | "";
  recordFamily?: string;
  accessMode?: SourceAccessMode | "";
};

export const ACCESS_MODE_LABELS: Record<SourceAccessMode, string> = {
  automated: "Vision collects this source",
  "public-online": "Public source, manual review",
  "request-or-contact": "Request or contact needed",
  "no-public-feed": "No public project feed found",
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
    && (!filters.jurisdictionType || source.jurisdictionType === filters.jurisdictionType)
    && (!filters.recordFamily || source.recordFamilies.includes(filters.recordFamily))
    && (!filters.accessMode || source.accessMode === filters.accessMode));
}

export function sourceRecordFamilies(sources: readonly MunicipalSource[]) {
  return [...new Set(sources.flatMap(source => source.recordFamilies))].sort();
}

