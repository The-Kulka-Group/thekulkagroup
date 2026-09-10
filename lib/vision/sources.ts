import {DISCOVERY_SOURCE, NASSAU_IDA_SOURCE, SUFFOLK_IDA_SOURCE, SUFFOLK_SOURCE} from "./discovery-catalog";
import {NASSAU_MUNICIPAL_SOURCES} from "./nassau-municipal-sources";
import {MUNICIPAL_SOURCE_CHECKED_AT, validateMunicipalSources, type MunicipalSource} from "./source-directory";
import {SUFFOLK_MUNICIPAL_SOURCES} from "./suffolk-municipal-sources";
import {AUTOMATED_SOURCE_DEFINITIONS} from "./source-registry";

const MUNICIPAL_SOURCES = [...NASSAU_MUNICIPAL_SOURCES, ...SUFFOLK_MUNICIPAL_SOURCES];
const AUTOMATED_MUNICIPAL_SOURCE_IDS = [
  "nassau-town-oyster-bay-records",
  "nassau-village-hempstead-records",
  "nassau-village-hempstead-zoning-records",
  "nassau-village-garden-city-records",
] as const;

function automatedMunicipalSource(id: typeof AUTOMATED_MUNICIPAL_SOURCE_IDS[number]): MunicipalSource {
  const source = MUNICIPAL_SOURCES.find(item => item.id === id);
  const definition = AUTOMATED_SOURCE_DEFINITIONS.find(item => item.id === id);
  if (!source || !definition) throw new Error(`Missing automated municipal source: ${id}`);
  return {
    ...source,
    name: definition.name,
    officialAgency: definition.officialAgency,
    accessMode: "automated",
    collectionState: "collectable",
    manualSteps: "Review the source record and official meeting document before saving or linking an opportunity.",
    limits: definition.coverage,
    coverage: definition.coverage,
    url: definition.directoryUrl,
  };
}

export const VISION_SOURCES = validateMunicipalSources([
  {
    ...DISCOVERY_SOURCE,
    jurisdiction: "Nassau County",
    jurisdictionType: "county",
    county: "Nassau",
    officialAgency: "Nassau County Planning Commission",
    recordFamilies: ["Planning applications", "Zoning referrals", "Subdivisions"],
    availableFields: ["File number", "Referral or filing date", "Municipality", "Referral type", "Address", "Lot count", "Tax section, block and lots", "Published map coordinates"],
    accessMode: "automated",
    collectionState: "collectable",
    manualSteps: "Review the county record and confirm the project before saving an opportunity.",
    limits: DISCOVERY_SOURCE.coverage,
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  },
  {
    ...SUFFOLK_SOURCE,
    jurisdiction: "Suffolk County",
    jurisdictionType: "county",
    county: "Suffolk",
    officialAgency: "Suffolk County Planning Commission",
    recordFamilies: ["Planning referrals", "Meeting documents"],
    availableFields: ["County file number", "Municipality", "Applicant or petitioner", "Received date", "Location", "Parcel references", "Published report text and page"],
    accessMode: "automated",
    collectionState: "collectable",
    manualSteps: "Review the source document and confirm the site before saving or linking an opportunity.",
    limits: SUFFOLK_SOURCE.coverage,
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  },
  {
    ...NASSAU_IDA_SOURCE,
    jurisdiction: "Nassau County",
    jurisdictionType: "county",
    county: "Nassau",
    officialAgency: "Nassau County Industrial Development Agency",
    recordFamilies: ["IDA projects", "IDA filings"],
    availableFields: ["Published project name", "Listed address", "Linked document title", "Listed document date", "Document URL"],
    accessMode: "automated",
    collectionState: "collectable",
    manualSteps: "Open the linked filing to confirm the project, location and current status.",
    limits: NASSAU_IDA_SOURCE.coverage,
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  },
  {
    ...SUFFOLK_IDA_SOURCE,
    jurisdiction: "Suffolk County",
    jurisdictionType: "county",
    county: "Suffolk",
    officialAgency: "Suffolk County Industrial Development Agency",
    recordFamilies: ["IDA filings", "Public hearings"],
    availableFields: ["Applicant or project name", "Application or abstract title", "Index meeting date", "Document URL"],
    accessMode: "automated",
    collectionState: "collectable",
    manualSteps: "Open the linked filing to confirm the site, project scope and current status.",
    limits: SUFFOLK_IDA_SOURCE.coverage,
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  },
  ...AUTOMATED_MUNICIPAL_SOURCE_IDS.map(automatedMunicipalSource),
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
  ...MUNICIPAL_SOURCES.filter(source => !AUTOMATED_MUNICIPAL_SOURCE_IDS.includes(source.id as typeof AUTOMATED_MUNICIPAL_SOURCE_IDS[number])),
] satisfies MunicipalSource[]);
