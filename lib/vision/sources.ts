import {NASSAU_MUNICIPAL_SOURCES} from "./nassau-municipal-sources";
import {MUNICIPAL_SOURCE_CHECKED_AT, validateMunicipalSources, type MunicipalSource} from "./source-directory";
import {SUFFOLK_MUNICIPAL_SOURCES} from "./suffolk-municipal-sources";
import {AUTOMATED_SOURCE_DEFINITIONS, type AutomatedSourceDefinition} from "./source-registry";

const MUNICIPAL_SOURCES = [...NASSAU_MUNICIPAL_SOURCES, ...SUFFOLK_MUNICIPAL_SOURCES];
const MUNICIPAL_SOURCE_BY_ID = new Map(MUNICIPAL_SOURCES.map(source => [source.id, source]));
const AUTOMATED_SOURCE_BY_ID = new Map(AUTOMATED_SOURCE_DEFINITIONS.map(source => [source.id, source]));

type AutomatedDirectoryResearch = Pick<MunicipalSource,
  "jurisdictionType" | "recordFamilies" | "availableFields" | "manualSteps" | "checkedAt">;

function registryOwnedDirectoryFields(definition: AutomatedSourceDefinition) {
  return {
    id: definition.id,
    name: definition.name,
    jurisdiction: definition.jurisdiction,
    county: definition.county,
    officialAgency: definition.officialAgency,
    accessMode: "automated" as const,
    collectionState: "collectable" as const,
    limits: definition.coverage,
    coverage: definition.coverage,
    url: definition.directoryUrl,
  };
}

function automatedCountySource(id: string, research: AutomatedDirectoryResearch): MunicipalSource {
  const definition = AUTOMATED_SOURCE_BY_ID.get(id);
  if (!definition) throw new Error(`Missing automated source definition: ${id}`);
  return {...research, ...registryOwnedDirectoryFields(definition)};
}

export function joinAutomatedSourceDirectory(
  directorySources: readonly MunicipalSource[],
  definitions: readonly AutomatedSourceDefinition[] = AUTOMATED_SOURCE_DEFINITIONS,
): MunicipalSource[] {
  const sourceCounts = new Map<string, number>();
  for (const source of directorySources) sourceCounts.set(source.id, (sourceCounts.get(source.id) ?? 0) + 1);

  for (const definition of definitions) {
    if (sourceCounts.get(definition.id) !== 1) throw new Error(`Automated source ${definition.id} must match one directory entry.`);
  }

  const definitionsById = new Map(definitions.map(definition => [definition.id, definition]));
  return directorySources.map(source => {
    const definition = definitionsById.get(source.id);
    if (!definition) {
      if (source.collectionState === "collectable") throw new Error(`Collectable directory source ${source.id} has no automated source definition.`);
      return source;
    }
    return {...source, ...registryOwnedDirectoryFields(definition)};
  });
}

const AUTOMATED_COUNTY_SOURCES: MunicipalSource[] = [
  automatedCountySource("nassau-applications", {
    jurisdictionType: "county",
    recordFamilies: ["Planning applications", "Zoning referrals", "Subdivisions"],
    availableFields: ["File number", "Referral or filing date", "Municipality", "Referral type", "Address", "Lot count", "Tax section, block and lots", "Published map coordinates"],
    manualSteps: "Review the county record and confirm the project before saving an opportunity.",
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  }),
  automatedCountySource("suffolk-planning", {
    jurisdictionType: "county",
    recordFamilies: ["Planning referrals", "Meeting documents"],
    availableFields: ["County file number", "Municipality", "Applicant or petitioner", "Received date", "Location", "Parcel references", "Published report text and page"],
    manualSteps: "Review the source document and confirm the site before saving or linking an opportunity.",
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  }),
  automatedCountySource("nassau-ida", {
    jurisdictionType: "county",
    recordFamilies: ["IDA projects", "IDA filings"],
    availableFields: ["Published project name", "Listed address", "Linked document title", "Listed document date", "Document URL"],
    manualSteps: "Open the linked filing to confirm the project, location and current status.",
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  }),
  automatedCountySource("suffolk-ida", {
    jurisdictionType: "county",
    recordFamilies: ["IDA filings", "Public hearings"],
    availableFields: ["Applicant or project name", "Application or abstract title", "Index meeting date", "Document URL"],
    manualSteps: "Open the linked filing to confirm the site, project scope and current status.",
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  }),
];

const AUTOMATED_MUNICIPAL_SOURCES = AUTOMATED_SOURCE_DEFINITIONS.flatMap(definition => {
  const source = MUNICIPAL_SOURCE_BY_ID.get(definition.id);
  // Keep automated permit portals in their existing place among the municipal routes.
  return source && definition.adapterKey !== "smartgov-public-permits" ? [source] : [];
});
const AUTOMATED_MUNICIPAL_SOURCE_IDS = new Set(AUTOMATED_MUNICIPAL_SOURCES.map(source => source.id));

const DIRECTORY_SOURCES: MunicipalSource[] = [
  ...AUTOMATED_COUNTY_SOURCES,
  ...AUTOMATED_MUNICIPAL_SOURCES,
  {
    id: "nassau-hearings",
    name: "Nassau Planning Commission hearings",
    jurisdiction: "Nassau County",
    jurisdictionType: "county",
    county: "Nassau",
    officialAgency: "Nassau County Planning Commission",
    recordFamilies: ["Public hearings", "Meeting documents"],
    availableFields: ["Hearing date", "Agenda", "Transcript", "Resolution", "SEQRA document link"],
    accessMode: "public-online",
    collectionState: "manual",
    manualSteps: "Open the meeting page and review the linked notice, agenda, transcript or resolution.",
    limits: "Vision links to these files but does not collect them. A meeting record does not prove permit approval or construction status.",
    coverage: "Public Planning Commission hearings, agendas, transcripts, resolutions and SEQRA files.",
    url: "https://www.nassaucountyny.gov/5697/Planning-Commission",
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  },
  ...MUNICIPAL_SOURCES.filter(source => !AUTOMATED_MUNICIPAL_SOURCE_IDS.has(source.id)),
];

export const VISION_SOURCES = validateMunicipalSources(
  joinAutomatedSourceDirectory(DIRECTORY_SOURCES),
);
