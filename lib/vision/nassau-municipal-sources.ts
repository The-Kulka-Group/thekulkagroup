import {MUNICIPAL_SOURCE_CHECKED_AT, type JurisdictionType, type MunicipalSource} from "./source-directory";

type NassauJurisdiction = {
  jurisdiction: string;
  jurisdictionType: Exclude<JurisdictionType, "county">;
  officialUrl: string;
};

// Nassau County's official directory is the source of truth for this list:
// https://www.nassaucountyny.gov/3406/Cities-Towns-Villages
export const NASSAU_AUTHORITATIVE_JURISDICTIONS: readonly NassauJurisdiction[] = [
  {jurisdiction: "Glen Cove", jurisdictionType: "city", officialUrl: "https://glencoveny.gov/"},
  {jurisdiction: "Long Beach", jurisdictionType: "city", officialUrl: "https://www.longbeachny.gov/"},
  {jurisdiction: "Hempstead", jurisdictionType: "town", officialUrl: "https://hempsteadny.gov/"},
  {jurisdiction: "North Hempstead", jurisdictionType: "town", officialUrl: "https://www.northhempsteadny.gov/"},
  {jurisdiction: "Oyster Bay", jurisdictionType: "town", officialUrl: "https://oysterbaytown.com/"},
  {jurisdiction: "Atlantic Beach", jurisdictionType: "village", officialUrl: "https://www.villageofatlanticbeach.com/"},
  {jurisdiction: "Bellerose", jurisdictionType: "village", officialUrl: "https://www.bellerosevillage.org/"},
  {jurisdiction: "Cedarhurst", jurisdictionType: "village", officialUrl: "https://www.cedarhurst.gov/"},
  {jurisdiction: "East Rockaway", jurisdictionType: "village", officialUrl: "https://www.villageofeastrockaway.org/"},
  {jurisdiction: "Floral Park", jurisdictionType: "village", officialUrl: "https://www.fpvillage.org/"},
  {jurisdiction: "Freeport", jurisdictionType: "village", officialUrl: "https://www.freeportny.gov/"},
  {jurisdiction: "Garden City", jurisdictionType: "village", officialUrl: "https://www.gardencityny.net/"},
  {jurisdiction: "Hempstead", jurisdictionType: "village", officialUrl: "https://www.villageofhempstead.org/"},
  {jurisdiction: "Hewlett Bay Park", jurisdictionType: "village", officialUrl: "https://hewlettbayparkny.gov/"},
  {jurisdiction: "Hewlett Harbor", jurisdictionType: "village", officialUrl: "https://www.hewlettharbor.org/"},
  {jurisdiction: "Hewlett Neck", jurisdictionType: "village", officialUrl: "https://hewlettneck.org/"},
  {jurisdiction: "Island Park", jurisdictionType: "village", officialUrl: "https://www.villageofislandpark.com/"},
  {jurisdiction: "Lawrence", jurisdictionType: "village", officialUrl: "https://www.villageoflawrence.org/"},
  {jurisdiction: "Lynbrook", jurisdictionType: "village", officialUrl: "https://www.lynbrookvillage.net/"},
  {jurisdiction: "Malverne", jurisdictionType: "village", officialUrl: "https://www.malvernevillage.org/"},
  {jurisdiction: "Mineola", jurisdictionType: "village", officialUrl: "https://www.mineola-ny.gov/"},
  {jurisdiction: "New Hyde Park", jurisdictionType: "village", officialUrl: "https://vnhp.org/"},
  {jurisdiction: "Rockville Centre", jurisdictionType: "village", officialUrl: "https://www.rvcny.us/"},
  {jurisdiction: "South Floral Park", jurisdictionType: "village", officialUrl: "https://www.southfloralpark.org/"},
  {jurisdiction: "Stewart Manor", jurisdictionType: "village", officialUrl: "https://stewartmanor.org/"},
  {jurisdiction: "Valley Stream", jurisdictionType: "village", officialUrl: "https://www.vsvny.org/"},
  {jurisdiction: "Woodsburgh", jurisdictionType: "village", officialUrl: "https://woodsburghny.com/"},
  {jurisdiction: "Baxter Estates", jurisdictionType: "village", officialUrl: "https://www.baxterestates.org/"},
  {jurisdiction: "East Hills", jurisdictionType: "village", officialUrl: "https://www.villageofeasthills.org/"},
  {jurisdiction: "East Williston", jurisdictionType: "village", officialUrl: "https://www.eastwilliston.org/"},
  {jurisdiction: "Flower Hill", jurisdictionType: "village", officialUrl: "https://villageflowerhill.org/"},
  {jurisdiction: "Great Neck", jurisdictionType: "village", officialUrl: "https://www.greatneckvillage.org/"},
  {jurisdiction: "Great Neck Estates", jurisdictionType: "village", officialUrl: "https://www.vgne.com/"},
  {jurisdiction: "Great Neck Plaza", jurisdictionType: "village", officialUrl: "https://www.greatneckplaza.net/"},
  {jurisdiction: "Kensington", jurisdictionType: "village", officialUrl: "https://vok-ny.com/"},
  {jurisdiction: "Kings Point", jurisdictionType: "village", officialUrl: "https://www.villageofkingspoint.org/"},
  {jurisdiction: "Lake Success", jurisdictionType: "village", officialUrl: "https://www.villageoflakesuccess.com/"},
  {jurisdiction: "Manorhaven", jurisdictionType: "village", officialUrl: "https://www.manorhaven.org/"},
  {jurisdiction: "Munsey Park", jurisdictionType: "village", officialUrl: "https://www.munseypark.org/"},
  {jurisdiction: "North Hills", jurisdictionType: "village", officialUrl: "https://www.villagenorthhills.com/"},
  {jurisdiction: "Old Westbury", jurisdictionType: "village", officialUrl: "https://www.villageofoldwestbury.org/"},
  {jurisdiction: "Plandome", jurisdictionType: "village", officialUrl: "https://www.villageofplandome.org/"},
  {jurisdiction: "Plandome Heights", jurisdictionType: "village", officialUrl: "https://plandomeheights-ny.gov/"},
  {jurisdiction: "Plandome Manor", jurisdictionType: "village", officialUrl: "https://plandomemanor.com/"},
  {jurisdiction: "Port Washington North", jurisdictionType: "village", officialUrl: "https://www.portwashingtonnorth.org/"},
  {jurisdiction: "Roslyn", jurisdictionType: "village", officialUrl: "https://www.roslynny.gov/"},
  {jurisdiction: "Roslyn Estates", jurisdictionType: "village", officialUrl: "https://www.villageofroslynestates.com/"},
  {jurisdiction: "Roslyn Harbor", jurisdictionType: "village", officialUrl: "https://www.roslynharbor.org/"},
  {jurisdiction: "Russell Gardens", jurisdictionType: "village", officialUrl: "https://www.russellgardens.com/"},
  {jurisdiction: "Saddle Rock", jurisdictionType: "village", officialUrl: "https://saddlerockny.gov/"},
  {jurisdiction: "Sands Point", jurisdictionType: "village", officialUrl: "https://www.sandspoint.org/"},
  {jurisdiction: "Thomaston", jurisdictionType: "village", officialUrl: "https://www.villageofthomaston.org/"},
  {jurisdiction: "Westbury", jurisdictionType: "village", officialUrl: "https://www.villageofwestbury.org/"},
  {jurisdiction: "Williston Park", jurisdictionType: "village", officialUrl: "https://www.villageofwillistonpark.org/"},
  {jurisdiction: "Bayville", jurisdictionType: "village", officialUrl: "https://bayvilleny.gov/"},
  {jurisdiction: "Brookville", jurisdictionType: "village", officialUrl: "https://www.villageofbrookville.com/"},
  {jurisdiction: "Centre Island", jurisdictionType: "village", officialUrl: "https://centreisland.org/"},
  {jurisdiction: "Cove Neck", jurisdictionType: "village", officialUrl: "https://www.coveneck.org/"},
  {jurisdiction: "Farmingdale", jurisdictionType: "village", officialUrl: "https://www.farmingdalevillage.com/"},
  {jurisdiction: "Lattingtown", jurisdictionType: "village", officialUrl: "https://villageoflattingtown.org/"},
  {jurisdiction: "Laurel Hollow", jurisdictionType: "village", officialUrl: "https://www.laurelhollow.org/"},
  {jurisdiction: "Massapequa Park", jurisdictionType: "village", officialUrl: "https://www.masspk.com/"},
  {jurisdiction: "Matinecock", jurisdictionType: "village", officialUrl: "https://www.matinecockvillage.org/"},
  {jurisdiction: "Mill Neck", jurisdictionType: "village", officialUrl: "https://millneckvillage.com/"},
  {jurisdiction: "Muttontown", jurisdictionType: "village", officialUrl: "https://www.muttontownny.gov/"},
  {jurisdiction: "Old Brookville", jurisdictionType: "village", officialUrl: "https://www.oldbrookville.net/"},
  {jurisdiction: "Oyster Bay Cove", jurisdictionType: "village", officialUrl: "https://www.oysterbaycove.net/"},
  {jurisdiction: "Sea Cliff", jurisdictionType: "village", officialUrl: "https://www.seacliff-ny.gov/"},
  {jurisdiction: "Upper Brookville", jurisdictionType: "village", officialUrl: "https://www.upperbrookville.org/"},
];

type SourceProfile = Partial<Pick<MunicipalSource,
  "name" | "officialAgency" | "recordFamilies" | "availableFields" | "accessMode" |
  "collectionState" | "manualSteps" | "limits" | "coverage" | "url">>;

const publicMeetings = (name: string, officialAgency: string, url: string, recordFamilies: readonly string[], availableFields: readonly string[], coverage: string): SourceProfile => ({
  name,
  officialAgency,
  recordFamilies,
  availableFields,
  accessMode: "public-online",
  collectionState: "manual",
  manualSteps: "Open the official page and review the linked notice, agenda, application, packet or minutes.",
  limits: "Vision links to this source but does not collect it. Published meeting material may omit permit history and current project status.",
  coverage,
  url,
});

const sourceProfileKey = (jurisdictionType: Exclude<JurisdictionType, "county">, jurisdiction: string) => `${jurisdictionType}:${jurisdiction}`;

const PUBLIC_SOURCE_PROFILES: Record<string, SourceProfile> = {
  [sourceProfileKey("city", "Glen Cove")]: publicMeetings("Glen Cove Planning Board", "City of Glen Cove Planning Board", "https://glencoveny.gov/planning-board", ["Planning applications", "Planning Board meetings"], ["Meeting date", "Agenda", "Applicant", "Application or affidavit link"], "Planning Board agendas, applications and affidavits published by the city."),
  [sourceProfileKey("city", "Long Beach")]: publicMeetings("Long Beach Planning Board", "City of Long Beach Planning Board", "https://www.longbeachny.gov/planning", ["Planning applications", "Site plans", "Subdivisions", "Meeting documents"], ["Meeting date", "Agenda", "Minutes", "Application type", "Published address"], "Planning Board and Architectural Review Board agendas, minutes and linked meeting files."),
  [sourceProfileKey("village", "Floral Park")]: publicMeetings("Floral Park Board of Trustees minutes", "Incorporated Village of Floral Park", "https://floralparkny.gov/board-of-trustees-meeting-minutes/", ["Board of Trustees minutes", "Building Department project updates", "Building permits", "Zoning applications"], ["Meeting date", "Street address", "Project or proposed work", "Published construction status", "Permit or application status", "Board review", "Next step"], "Board minutes with a Building Department report that names properties, construction work, permits, zoning applications and next board steps."),
  [sourceProfileKey("town", "Hempstead")]: publicMeetings("Hempstead Agenda Center", "Town of Hempstead", "https://hempsteadny.gov/AgendaCenter", ["Town Board matters", "Building and zoning matters", "Meeting documents"], ["Meeting date", "Agenda", "Resolution", "Published permit or application number", "Published address"], "Town agendas and packets that may name building permits, zoning matters and site addresses."),
  [sourceProfileKey("village", "Hempstead")]: publicMeetings("Hempstead Village Agenda Center", "Village of Hempstead", "https://www.villageofhempstead.org/AgendaCenter", ["Planning applications", "Zoning appeals", "Public hearings", "Meeting documents"], ["Meeting date", "Agenda", "Minutes", "Published application detail"], "Planning Board, Zoning Board and public hearing agendas and minutes."),
  [sourceProfileKey("town", "Oyster Bay")]: publicMeetings("Oyster Bay boards and calendars", "Town of Oyster Bay Planning and Development", "https://oysterbaytown.com/calendars/", ["Planning applications", "Zoning appeals", "Town Board matters", "Meeting documents"], ["Hearing or meeting date", "Agenda or calendar", "Application or case details", "Draft or adopted resolution", "Minutes or video link"], "Planning Advisory Board, Zoning Board of Appeals and Town Board files published by the town."),
  [sourceProfileKey("village", "Freeport")]: publicMeetings("Freeport Zoning Board files", "Village of Freeport Zoning Board of Appeals", "https://www.freeportny.gov/999/Zoning-Board-AgendasMinutes-2026", ["Zoning appeals", "Meeting documents"], ["Meeting date", "Calendar", "Application", "Transcript", "Minutes"], "Zoning Board calendars, applications, transcripts and minutes."),
  [sourceProfileKey("village", "Garden City")]: publicMeetings("Garden City Agenda Center", "Village of Garden City", "https://www.gardencityny.net/AgendaCenter", ["Planning applications", "Zoning appeals", "Architectural review", "Meeting documents"], ["Meeting date", "Agenda", "Minutes", "Application or site-plan detail"], "Planning Commission, Zoning Board of Appeals and Architectural Design Review Board files."),
  [sourceProfileKey("village", "Great Neck Plaza")]: publicMeetings("Great Neck Plaza board records", "Village of Great Neck Plaza", "https://www.greatneckplaza.net/", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Agenda or notice", "Application detail", "Minutes"], "Planning, zoning and board records published by the village."),
  [sourceProfileKey("village", "Baxter Estates")]: publicMeetings("Baxter Estates public notices", "Village of Baxter Estates", "https://www.baxterestates.org/", ["Planning notices", "Zoning notices", "Public hearings"], ["Notice date", "Hearing date", "Board", "Published matter or address"], "Public notices published by the village."),
  [sourceProfileKey("village", "Bayville")]: publicMeetings("Bayville meeting agendas and minutes", "Village of Bayville", "https://bayvilleny.gov/about-us/meeting-agendas-meeting-minutes", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Agenda", "Minutes", "Case number", "Published address and tax lot"], "Planning Board, Zoning Board and Board of Trustees agendas and minutes."),
  [sourceProfileKey("village", "Sea Cliff")]: publicMeetings("Sea Cliff Agenda Center", "Village of Sea Cliff", "https://www.seacliff-ny.gov/AgendaCenter", ["Planning applications", "Zoning appeals", "Architectural review", "Meeting documents"], ["Meeting date", "Agenda", "Published application or hearing detail", "Minutes"], "Planning Board, Zoning Board of Appeals and architectural review files."),
  [sourceProfileKey("village", "Mill Neck")]: publicMeetings("Mill Neck news and notices", "Village of Mill Neck", "https://millneckvillage.com/news-and-notices/", ["Planning notices", "Zoning notices", "Public hearings", "Board records"], ["Notice date", "Hearing or meeting date", "Board", "Published application detail"], "Planning Board and Zoning Board notices plus linked village records."),
  [sourceProfileKey("village", "Muttontown")]: publicMeetings("Muttontown board files", "Village of Muttontown", "https://www.muttontownny.gov/", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Agenda or notice", "Application detail", "Minutes or decision"], "Planning, zoning and board files published by the village."),
  [sourceProfileKey("village", "Farmingdale")]: publicMeetings("Farmingdale board packages", "Village of Farmingdale", "https://www.farmingdalevillage.com/", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Agenda or packet", "Application detail", "Published address"], "Planning and zoning board packages published by the village."),
  [sourceProfileKey("village", "East Rockaway")]: publicMeetings("East Rockaway agendas", "Village of East Rockaway", "https://www.villageofeastrockaway.org/", ["Planning and zoning matters", "Meeting documents"], ["Meeting date", "Agenda", "Published matter", "Minutes"], "Village agendas that may list planning and zoning matters."),
  [sourceProfileKey("village", "Cedarhurst")]: publicMeetings("Cedarhurst public notices", "Village of Cedarhurst", "https://www.cedarhurst.gov/", ["Planning notices", "Zoning notices", "Public hearings"], ["Notice date", "Hearing date", "Board", "Published matter or address"], "Planning, zoning and hearing notices published by the village."),
  [sourceProfileKey("village", "Rockville Centre")]: publicMeetings("Rockville Centre board agendas", "Village of Rockville Centre", "https://www.rvcny.us/", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Agenda", "Published application detail", "Minutes"], "Planning and zoning board agendas published by the village."),
  [sourceProfileKey("village", "Mineola")]: publicMeetings("Mineola Agenda Center", "Village of Mineola", "https://www.mineola-ny.gov/AgendaCenter", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Agenda", "Minutes", "Published application detail"], "Planning Board and Zoning Board agendas and minutes."),
  [sourceProfileKey("village", "Flower Hill")]: publicMeetings("Flower Hill agendas", "Village of Flower Hill", "https://villageflowerhill.org/", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Agenda or notice", "Published application detail", "Minutes"], "Planning and zoning agendas published by the village."),
  [sourceProfileKey("village", "Laurel Hollow")]: publicMeetings("Laurel Hollow agendas", "Village of Laurel Hollow", "https://www.laurelhollow.org/", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Agenda or notice", "Published application detail", "Minutes"], "Planning and zoning agendas published by the village."),
  [sourceProfileKey("village", "Old Brookville")]: publicMeetings("Old Brookville board links", "Village of Old Brookville", "https://www.oldbrookville.net/", ["Planning applications", "Zoning appeals", "Meeting documents"], ["Meeting date", "Board link", "Agenda or notice", "Published application detail"], "Planning and zoning board links published by the village."),
  [sourceProfileKey("village", "Hewlett Neck")]: publicMeetings("Hewlett Neck public notices", "Village of Hewlett Neck", "https://hewlettneck.org/", ["Planning notices", "Zoning notices", "Public hearings"], ["Notice date", "Hearing date", "Board", "Published matter or address"], "Planning, zoning and hearing notices published by the village."),
};

const REQUEST_OR_CONTACT_JURISDICTIONS = new Set([
  "North Hempstead", "Bellerose", "Lynbrook", "New Hyde Park", "South Floral Park",
  "Hewlett Bay Park", "East Hills", "Great Neck", "Kensington", "Centre Island", "Brookville",
  "Oyster Bay Cove", "Upper Brookville",
]);

const REQUEST_SOURCE_URLS: Record<string, string> = {
  Bellerose: "https://www.bellerosevillage.org/building-department.html",
  "East Hills": "https://villageofeasthills.org/information/permits-and-requests/",
  Lynbrook: "https://lynbrookvillage.net/forms-documents/",
  "New Hyde Park": "https://vnhp.org/fees/",
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function requestSource(item: NassauJurisdiction): MunicipalSource {
  return {
    id: `nassau-${item.jurisdictionType}-${slug(item.jurisdiction)}-records`,
    name: `${item.jurisdiction} building and land-use records`,
    jurisdiction: item.jurisdiction,
    jurisdictionType: item.jurisdictionType,
    county: "Nassau",
    officialAgency: item.jurisdictionType === "town" ? `Town of ${item.jurisdiction}` : `Village of ${item.jurisdiction}`,
    recordFamilies: ["Building permits", "Planning records", "Zoning records"],
    availableFields: ["Record details supplied after account access or a records request"],
    accessMode: "request-or-contact",
    collectionState: "restricted",
    manualSteps: "Use the official department page to sign in, file a records request or contact the clerk or building department.",
    limits: "No open, townwide or village-wide project feed was verified. Account access or staff help may be required, and Vision does not collect this source.",
    coverage: "Building, planning or zoning records available through the official department, account portal or records request process.",
    url: REQUEST_SOURCE_URLS[item.jurisdiction] ?? item.officialUrl,
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  };
}

function noPublicFeedSource(item: NassauJurisdiction): MunicipalSource {
  const agencyType = item.jurisdictionType === "city" ? "City" : item.jurisdictionType === "town" ? "Town" : "Village";
  return {
    id: `nassau-${item.jurisdictionType}-${slug(item.jurisdiction)}-records`,
    name: `${item.jurisdiction} official records contact`,
    jurisdiction: item.jurisdiction,
    jurisdictionType: item.jurisdictionType,
    county: "Nassau",
    officialAgency: `${agencyType} of ${item.jurisdiction}`,
    recordFamilies: ["Building, planning and zoning records"],
    availableFields: ["Official department or records contact information"],
    accessMode: "no-public-feed",
    collectionState: "no-public-feed",
    manualSteps: "Open the official site and contact the clerk or building department about the record needed.",
    limits: "No public project-level building, planning, zoning, permit or meeting feed was verified in this check. Vision does not collect this source.",
    coverage: "No public project feed was found. The link is the jurisdiction's official site for department or records contact details.",
    url: item.officialUrl,
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  };
}

const JURISDICTION_SOURCES: MunicipalSource[] = NASSAU_AUTHORITATIVE_JURISDICTIONS.map(item => {
  const profile = PUBLIC_SOURCE_PROFILES[sourceProfileKey(item.jurisdictionType, item.jurisdiction)];
  if (profile) {
    return {
      id: `nassau-${item.jurisdictionType}-${slug(item.jurisdiction)}-records`,
      jurisdiction: item.jurisdiction,
      jurisdictionType: item.jurisdictionType,
      county: "Nassau",
      checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
      ...profile,
    } as MunicipalSource;
  }
  if (REQUEST_OR_CONTACT_JURISDICTIONS.has(item.jurisdiction)) return requestSource(item);
  return noPublicFeedSource(item);
});

const ACCOUNT_PORTAL_SOURCES: MunicipalSource[] = [
  {
    id: "hempstead-online-permit-center",
    name: "Hempstead Online Permit Center",
    jurisdiction: "Hempstead",
    jurisdictionType: "town",
    county: "Nassau",
    officialAgency: "Town of Hempstead Building Department",
    recordFamilies: ["Building permits", "Building licenses", "Property inspections"],
    availableFields: ["Permit application status", "Previous permits tied to the signed-in account", "Inspection requests", "Messages with town staff", "Permit document"],
    accessMode: "request-or-contact",
    collectionState: "restricted",
    manualSteps: "Create or use a resident account to submit a permit, review account records, request an inspection or contact town staff.",
    limits: "The portal shows records tied to the signed-in user. It is not a public townwide permit or project search, and Vision does not collect it.",
    coverage: "The town portal supports permit and license transactions, application monitoring, prior account permits, inspection requests and permit printing.",
    url: "https://hempsteadny.gov/622/Online-Permit-Center",
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  },
  {
    id: "oyster-bay-building-portal",
    name: "Oyster Bay Building Division Online Portal",
    jurisdiction: "Oyster Bay",
    jurisdictionType: "town",
    county: "Nassau",
    officialAgency: "Town of Oyster Bay Building Division",
    recordFamilies: ["Building permits", "Permit fees", "Building inspections"],
    availableFields: ["Eligible permit type", "Permit application status", "Fee or payment status", "Inspection request", "Inspection result"],
    accessMode: "request-or-contact",
    collectionState: "restricted",
    manualSteps: "Create or use a public registrant or contractor account to submit an eligible permit, monitor it, pay a fee or manage an inspection.",
    limits: "The portal requires an account and covers listed online permit types. It is not a public townwide permit or project search, and Vision does not collect it.",
    coverage: "The town portal supports listed building permit applications, fee payment, permit monitoring, inspection scheduling and inspection result monitoring.",
    url: "https://oysterbaytown.com/departments/planning-and-development/building-portal/",
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  },
];

export const NASSAU_MUNICIPAL_SOURCES: MunicipalSource[] = [...JURISDICTION_SOURCES, ...ACCOUNT_PORTAL_SOURCES];
