import type {MunicipalSource, SourceAccessMode, SourceCollectionState} from "./source-directory";

const CHECKED_AT = "2026-09-09";

export const SUFFOLK_JURISDICTION_DIRECTORY_URL = "https://www.suffolkcountyny.gov/Visiting/Towns-and-Villages";

export const SUFFOLK_TOWN_JURISDICTIONS = [
  "Babylon", "Brookhaven", "East Hampton", "Huntington", "Islip", "Riverhead",
  "Shelter Island", "Smithtown", "Southampton", "Southold",
] as const;

// Suffolk County lists 32 active incorporated villages. Sag Harbor crosses the
// East Hampton and Southampton town lines, but it is one village jurisdiction.
export const SUFFOLK_VILLAGE_JURISDICTIONS = [
  "Amityville", "Asharoken", "Babylon", "Belle Terre", "Bellport", "Brightwaters",
  "Dering Harbor", "East Hampton", "Greenport", "Head of the Harbor", "Huntington Bay",
  "Islandia", "Lake Grove", "Lindenhurst", "Lloyd Harbor", "Nissequogue", "North Haven",
  "Northport", "Ocean Beach", "Old Field", "Patchogue", "Poquott", "Port Jefferson",
  "Quogue", "Sag Harbor", "Sagaponack", "Saltaire", "Shoreham", "Southampton",
  "Village of the Branch", "Westhampton Beach", "West Hampton Dunes",
] as const;

// Mastic Beach dissolved in 2017. It remains source history, but it is not a
// current incorporated village.
export const SUFFOLK_DISSOLVED_JURISDICTIONS = ["Mastic Beach"] as const;

type Entry = {
  id: string;
  name: string;
  jurisdiction: string;
  agency: string;
  families: string;
  fields: string;
  steps: string;
  limits: string;
  coverage: string;
  url: string;
  accessMode?: SourceAccessMode;
  collectionState?: SourceCollectionState;
};

function list(value: string) {
  return value.split("|");
}

function municipalSource(jurisdictionType: "town" | "village", entry: Entry): MunicipalSource {
  return {
    id: entry.id,
    name: entry.name,
    jurisdiction: entry.jurisdiction,
    jurisdictionType,
    county: "Suffolk",
    officialAgency: entry.agency,
    recordFamilies: list(entry.families),
    retrievableFields: list(entry.fields),
    accessMode: entry.accessMode ?? "public-online",
    collectionState: entry.collectionState ?? "manual",
    manualSteps: entry.steps,
    limits: entry.limits,
    coverage: entry.coverage,
    url: entry.url,
    checkedAt: CHECKED_AT,
  };
}

const TOWN_SOURCES = [
  municipalSource("town", {
    id: "babylon-planning-agendas", name: "Babylon planning agendas and notices", jurisdiction: "Babylon", agency: "Town of Babylon Planning and Development",
    families: "Site plans|Subdivisions|Zoning|Meeting documents", fields: "Applicant or project name|Address|Application type|Hearing date|Board action",
    steps: "Search the Agenda Center, then open the agenda, minutes, or public notice for the named matter.",
    limits: "Vision does not collect this source. OpenGov account records are not a public townwide project feed.", coverage: "Planning Board, Zoning Board, business and industrial site-plan, subdivision, and hearing records.",
    url: "https://www.townofbabylonny.gov/AgendaCenter/",
  }),
  municipalSource("town", {
    id: "brookhaven-planning-hearings", name: "Brookhaven planning applications and hearings", jurisdiction: "Brookhaven", agency: "Town of Brookhaven Planning and Environment",
    families: "Site plans|Subdivisions|Land divisions|Public hearings|Zoning", fields: "Applicant or project name|Address|Requested approval|Hearing date|Application document",
    steps: "Open the planning page and linked hearing material. Request building records when the public files do not answer the question.",
    limits: "Vision does not collect this source. The intake portal is not a public project search, and some building records need a document request.", coverage: "Published planning applications, permit guidance, and land-use hearing records.",
    url: "https://www.brookhavenny.gov/278/Planning-Environmental",
  }),
  municipalSource("town", {
    id: "east-hampton-planning-agendas", name: "East Hampton Planning Board records", jurisdiction: "East Hampton", agency: "Town of East Hampton Planning Board",
    families: "Commercial development plans|Site plans|Subdivisions|Meeting documents", fields: "Applicant or project name|Agenda item|Meeting date|Packet|Minutes|Version|Video link",
    steps: "Search the Planning Board category, then open the HTML agenda, packet, minutes, or prior version.",
    limits: "Vision does not collect this source. OpenGov account records are not a public townwide project feed.", coverage: "Planning Board agendas, packets, minutes, versions, and videos for published matters.",
    url: "https://www.ehamptonny.gov/AgendaCenter",
  }),
  municipalSource("town", {
    id: "huntington-meetings", name: "Huntington meetings and agendas", jurisdiction: "Huntington", agency: "Town of Huntington Planning and Environment",
    families: "Planning applications|Meeting documents|Zoning", fields: "Meeting date|Agenda|Voting history|Resolution|Recording link",
    steps: "Open the meeting page and review the board record. Pending application status may require a call or email.",
    limits: "Vision does not collect this source. Meeting material may omit pending application status.", coverage: "Planning Board, Zoning Board, and Town Board meeting records.",
    url: "https://huntingtonny.gov/meetings",
  }),
  municipalSource("town", {
    id: "islip-planning-documents", name: "Islip Planning Board documents", jurisdiction: "Islip", agency: "Town of Islip Planning and Development",
    families: "Site plans|Change of zone|Public hearings|Meeting documents", fields: "Applicant or project name|Docket or case number|Address|Proposal|Hearing date|Site-plan file",
    steps: "Search the Planning Board document folder and open the notice, agenda, or linked site-plan file.",
    limits: "Vision does not collect this source. The application portal requires a login and is not a public project feed.", coverage: "Planning Board agendas, notices, change-of-zone records, and selected site-plan files.",
    url: "https://islipny.gov/community-and-services/documents/meeting-documents-agendas-notices-resolutions/planning-board-meetings",
  }),
  municipalSource("town", {
    id: "riverhead-planning", name: "Riverhead planning and environmental review", jurisdiction: "Riverhead", agency: "Town of Riverhead Planning Department",
    families: "Site plans|Subdivisions|Zoning|Environmental review|Meeting documents", fields: "Project name|Application type|Meeting date|Agenda|Minutes|Environmental review document",
    steps: "Open the planning page, then review the current-project file or the linked board agenda and minutes.",
    limits: "Vision does not collect this source. Building records require a records request.", coverage: "Planning applications, board records, zoning material, and environmental review files that the town publishes.",
    url: "https://www.townofriverheadny.gov/192/Planning",
  }),
  municipalSource("town", {
    id: "shelter-island-planning-agendas", name: "Shelter Island planning records", jurisdiction: "Shelter Island", agency: "Town of Shelter Island Planning Board",
    families: "Site plans|Wetlands|Zoning|Meeting documents", fields: "Applicant or project name|Agenda item|Meeting date|Agenda|Prior version",
    steps: "Search the Planning Board category and open the agenda or prior version for the meeting.",
    limits: "Vision does not collect this source. Online property history is recent and does not show every older record.", coverage: "Planning Board agendas and published site-plan, wetlands, planning, and zoning matters.",
    url: "https://www.shelterislandtown.gov/AgendaCenter/Planning-Board-3",
  }),
  municipalSource("town", {
    id: "smithtown-meetings", name: "Smithtown public meetings", jurisdiction: "Smithtown", agency: "Town of Smithtown Planning and Community Development",
    families: "Site plan review|Meeting documents|Zoning", fields: "Meeting date|Agenda|Packet|Minutes|Video link",
    steps: "Open CivicClerk and review the meeting packet or minutes for the published matter.",
    limits: "Vision does not collect this source. Commercial permit coverage is not confirmed, and meeting records do not cover every permit.", coverage: "Planning, site-plan, zoning, and board meeting material published through CivicClerk.",
    url: "https://smithtownny.portal.civicclerk.com/",
  }),
  municipalSource("town", {
    id: "southampton-current-planning", name: "Southampton current planning applications", jurisdiction: "Southampton", agency: "Town of Southampton Planning Department",
    families: "Site plans|Subdivisions|Lot-line changes|Special exceptions|Wetlands permits|Environmental review", fields: "Project or applicant name|Hamlet|Address|Application type|Public hearing date|Recommendation|Decision|Document link",
    steps: "Choose the hamlet, open its current application page, and review the linked application or decision file.",
    limits: "Vision does not collect this source. Current application pages show the last six months, and older or missing records require FOIL.", coverage: "Current planning applications grouped by hamlet, including published site, subdivision, wetlands, and environmental records.",
    url: "https://southamptontownny.gov/1236/Current-Planning-Applications",
  }),
  municipalSource("town", {
    id: "southold-planning-agendas", name: "Southold Planning Board records", jurisdiction: "Southold", agency: "Town of Southold Planning Board",
    families: "Site plans|Subdivisions|Lot-line changes|Wireless permits|Meeting documents", fields: "Applicant or project name|Address or location|Application type|Meeting date|Agenda|Minutes|Prior version",
    steps: "Search the Planning Board category and open the agenda, minutes, or prior version.",
    limits: "Vision does not collect this source. Building history may require Laserfiche or a records request.", coverage: "Planning Board agendas and minutes for published site-plan, subdivision, lot-line, and wireless matters.",
    url: "https://www.southoldtownny.gov/AgendaCenter",
  }),
];

const NO_PERMIT_REGISTER = "Vision does not collect this source. No public searchable permit register was found.";
const PUBLIC_STEPS = "Open the official page and review the linked notice, agenda, minutes, or project file.";

const VILLAGE_SOURCES = [
  municipalSource("village", {id: "amityville-agendas", name: "Amityville planning and zoning records", jurisdiction: "Amityville", agency: "Village of Amityville", families: "Planning|Zoning|Meeting documents", fields: "Applicant|Address|SCTM|District|Proposed work|Requested relief|Hearing date|Outcome", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Minutes may lag the meeting.`, coverage: "Planning Board and Zoning Board agendas and minutes.", url: "https://www.amityville.gov/AgendaCenter"}),
  municipalSource("village", {id: "asharoken-boards", name: "Asharoken board records", jurisdiction: "Asharoken", agency: "Village of Asharoken", families: "Planning|Zoning|Public notices|Meeting documents", fields: "Applicant|Address|Application type|Variance or special use|Meeting date|Board action", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The archive is irregular.`, coverage: "Published Planning Board and Zoning Board notices and minutes.", url: "https://asharoken.com/boardscommittees.htm"}),
  municipalSource("village", {id: "babylon-village-notices", name: "Babylon village land-use notices", jurisdiction: "Babylon", agency: "Village of Babylon", families: "Planning|Zoning|Architectural review|Public notices", fields: "Applicant or business|Address|Use|Site-plan facts|Conditions|Board action", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Some older notices are available only at Village Hall.`, coverage: "Published planning, zoning, architectural review, and trustee land-use matters.", url: "https://www.villageofbabylonny.gov/legal-notices.html"}),
  municipalSource("village", {id: "belle-terre-minutes", name: "Belle Terre trustee records", jurisdiction: "Belle Terre", agency: "Village of Belle Terre", families: "Trustee minutes|Building and permit references", fields: "Meeting date|Permit or planning matter|Board action", accessMode: "request-or-contact", collectionState: "restricted", steps: "Review the trustee minutes, then contact the village or file a records request for the full record.", limits: "Trustee minutes name some matters, but there is no public project or submitted-permit register.", coverage: "Limited trustee references to permit and planning matters.", url: "https://belleterre.us/minutes-of-board-meetings/"}),
  municipalSource("village", {id: "bellport-planning", name: "Bellport Planning Board records", jurisdiction: "Bellport", agency: "Village of Bellport", families: "Planning|Site plans|Subdivisions|Public notices|Meeting documents", fields: "Owner or applicant|Address|Application type|Meeting date|Status or result|Project document", steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning Board notices, agendas, minutes, and selected project documents.", url: "https://www.bellportvillageny.gov/category/planning-board-meetings/"}),
  municipalSource("village", {id: "brightwaters-agendas", name: "Brightwaters planning and zoning records", jurisdiction: "Brightwaters", agency: "Village of Brightwaters", families: "Planning|Zoning|Meeting documents", fields: "Applicant|Address|SCTM|Proposal|Requested relief|Meeting date|Decision", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Account-based application intake is not a public record search.`, coverage: "Planning Board, Zoning Board, and trustee agendas and minutes.", url: "https://www.villageofbrightwaters.com/AgendaCenter"}),
  municipalSource("village", {id: "dering-harbor-notices", name: "Dering Harbor land-use notices", jurisdiction: "Dering Harbor", agency: "Village of Dering Harbor", families: "Planning|Architectural review|Zoning|Public notices|Meeting documents", fields: "Applicant or owner|Address|SCTM|Proposal|Meeting date|Continuation", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The village publishes a small number of records.`, coverage: "Planning, Architectural Review Board, and Zoning Board notices and agendas.", url: "https://deringharborvillage.org/category/notices"}),
  municipalSource("village", {id: "east-hampton-village-meetings", name: "East Hampton village board meetings", jurisdiction: "East Hampton", agency: "Village of East Hampton", families: "Planning|Zoning|Design review|Historic preservation|Meeting documents", fields: "Applicant|Parcel or address|Proposal|Board|Meeting date|Plan|Decision", steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning, zoning, design, and historic board meeting records and linked files.", url: "https://easthamptonvillage.gov/departments/public-board-meetings/"}),
  municipalSource("village", {id: "greenport-planning", name: "Greenport Planning Board records", jurisdiction: "Greenport", agency: "Village of Greenport", families: "Planning|Zoning|Site plans|Building plans|Meeting documents", fields: "Applicant|Address|Proposed work|Requested relief|Meeting date|Decision|Plan or survey", steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning Board and Zoning Board records with selected application and plan files.", url: "https://villageofgreenport.gov/village-boards/planning-board/"}),
  municipalSource("village", {id: "head-of-harbor-planning", name: "Head of the Harbor Planning Board minutes", jurisdiction: "Head of the Harbor", agency: "Village of Head of the Harbor", families: "Planning|Architectural review|Zoning|Meeting documents", fields: "Applicant|Address|Application type|Site plan or subdivision|Exhibit|Action or condition", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The village does not accept electronic applications.`, coverage: "Planning, architectural review, and zoning minutes and forms.", url: "https://headoftheharborny.gov/planning-board-minutes/"}),
  municipalSource("village", {id: "huntington-bay-zoning", name: "Huntington Bay Zoning Board records", jurisdiction: "Huntington Bay", agency: "Village of Huntington Bay", families: "Zoning|Public notices|Meeting documents", fields: "Applicant|Address|Variance|Continuation|Decision|Meeting date", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The current page may replace a prior agenda.`, coverage: "Current Zoning Board agendas, notices, decisions, and minutes.", url: "https://www.huntingtonbay.org/zoning-board-agenda"}),
  municipalSource("village", {id: "islandia-hearings", name: "Islandia public hearings", jurisdiction: "Islandia", agency: "Village of Islandia", families: "Zoning|Public hearings|Public notices", fields: "Address|Proposed use|Hearing date|Board action", steps: "Search the village posts for a public hearing or zoning matter and open the dated post.", limits: `${NO_PERMIT_REGISTER} The site has no stable project archive.`, coverage: "Public-hearing posts and occasional zoning matters.", url: "https://www.newvillageofislandia.com/"}),
  municipalSource("village", {id: "lake-grove-notices", name: "Lake Grove planning and zoning notices", jurisdiction: "Lake Grove", agency: "Village of Lake Grove", families: "Planning|Zoning|Public notices", fields: "Applicant or owner|Address|SCTM|Zone|Proposal|Variance|Meeting date", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Minutes and decisions are published less often than notices.`, coverage: "Published Planning Board and Zoning Board notices.", url: "https://lakegroveny.gov/government/village-notices/"}),
  municipalSource("village", {id: "lindenhurst-meetings", name: "Lindenhurst public meetings", jurisdiction: "Lindenhurst", agency: "Village of Lindenhurst", families: "Planning|Zoning|Public notices|Meeting documents", fields: "Applicant|Address|SCTM|Zone|Proposal|Dimensions or relief|Meeting date", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Records are spread across event posts and uploads.`, coverage: "Planning and zoning notices, agendas, and published rules.", url: "https://villageoflindenhurstny.gov/calendar/public-meetings/"}),
  municipalSource("village", {id: "lloyd-harbor-agendas", name: "Lloyd Harbor board agendas", jurisdiction: "Lloyd Harbor", agency: "Village of Lloyd Harbor", families: "Planning|Zoning|Permit review|Meeting documents", fields: "Address|Application type|Board|Meeting date|Decision in minutes", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Published records use applicant names inconsistently.`, coverage: "Permit review, Planning Board, Zoning Board, and trustee agendas and minutes.", url: "https://www.lloydharbor.org/publications-agendas/"}),
  municipalSource("village", {id: "nissequogue-notices", name: "Nissequogue land-use notices", jurisdiction: "Nissequogue", agency: "Village of Nissequogue", families: "Planning|Zoning|Architectural review|Coastal review|Public notices|Meeting documents", fields: "Applicant or project|Address|Permit type|Meeting date|Adjournment|Decision", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The archive uses older HTML pages.`, coverage: "Planning, zoning, architectural, and coastal notices and minutes.", url: "https://nissequogueny.gov/index.php?b=pubnote"}),
  municipalSource("village", {id: "north-haven-planning", name: "North Haven Planning Board records", jurisdiction: "North Haven", agency: "Village of North Haven", families: "Planning|Shoreline review|Meeting documents|Applications", fields: "Owner or agent|Address|SCTM|Project scope|Plan|Requested relief|Decision", steps: "Use a browser to open the board page and review its agenda, resolution, minutes, transcript, application, or shoreline case.", limits: `${NO_PERMIT_REGISTER} Direct automated requests returned 403 during review.`, coverage: "Planning Board records, applications, decisions, and shoreline cases.", url: "https://www.northhavenny.gov/planning-board"}),
  municipalSource("village", {id: "northport-documents", name: "Northport land-use documents", jurisdiction: "Northport", agency: "Village of Northport", families: "Planning|Zoning|Architectural review|Historic preservation|Meeting documents", fields: "Applicant|Address|Application type|Project facts|Board discussion|Outcome", steps: "Use a browser to search the document indexes, then open the PDF or ZIP file for the board record.", limits: `${NO_PERMIT_REGISTER} Direct automated requests returned 403 during review.`, coverage: "Planning, zoning, architectural, historic, and trustee minutes in document indexes.", url: "https://northportny.gov/documents/"}),
  municipalSource("village", {id: "ocean-beach-notices", name: "Ocean Beach land-use notices", jurisdiction: "Ocean Beach", agency: "Village of Ocean Beach", families: "Planning|Architectural review|Zoning|Public notices|Meeting documents", fields: "Address|Proposal|Meeting date|Video link|Minutes when published", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Many entries show only a meeting date.`, coverage: "Planning, architectural, and zoning notices with some minutes and video links.", url: "https://villageofoceanbeach.org/public-notices"}),
  municipalSource("village", {id: "old-field-minutes", name: "Old Field trustee minutes", jurisdiction: "Old Field", agency: "Village of Old Field", families: "Building permits|Trustee minutes", fields: "Address|Proposed work|Permit action|Condition|Decision|Meeting date", steps: "Open the trustee minutes and review the building-permit section for the named property.", limits: `${NO_PERMIT_REGISTER} Applications are not always online before the meeting.`, coverage: "Trustee minutes that discuss building permit applications and actions.", url: "https://oldfieldny.org/government/board-meeting-minutes/"}),
  municipalSource("village", {id: "patchogue-planning-agendas", name: "Patchogue Planning Board records", jurisdiction: "Patchogue", agency: "Village of Patchogue", families: "Planning|Zoning|Public notices|Meeting documents", fields: "Case number|Applicant|Address|Zone|Use|Proposed work|Stage|Plan|Decision or condition", steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning and zoning agendas, minutes, notices, and packets.", url: "https://www.patchoguevillage.gov/AgendaCenter/Planning-Board-2"}),
  municipalSource("village", {id: "poquott-agenda", name: "Poquott board agenda", jurisdiction: "Poquott", agency: "Village of Poquott", families: "Planning|Building permits|Dock permits|Meeting documents", fields: "Address|Permit matter|Resolution|Board action|Meeting date", steps: "Open the current agenda PDF, then check published minutes for the resolution or action.", limits: `${NO_PERMIT_REGISTER} The agenda URL is mutable and does not provide a stable archive.`, coverage: "Current agenda and minutes that may name planning, demolition, or dock permit matters.", url: "https://www.villageofpoquott.com/agenda.pdf"}),
  municipalSource("village", {id: "port-jefferson-planning", name: "Port Jefferson Planning Board records", jurisdiction: "Port Jefferson", agency: "Village of Port Jefferson", families: "Planning|Zoning|Meeting documents", fields: "Address|Application type|Use|Project scope|Stage|Decision|Meeting date", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Some entries contain only a notice.`, coverage: "Planning Board and Zoning Board agendas and minutes.", url: "https://www.portjeffny.gov/AgendaCenter/Planning-Board-4"}),
  municipalSource("village", {id: "quogue-planning", name: "Quogue Planning Board records", jurisdiction: "Quogue", agency: "Village of Quogue", families: "Planning|Meeting documents", fields: "Applicant|Address|SCTM|Proposal|Outside approval|Issue|Board action", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Agendas are not posted with each meeting, and the page timed out during one check.`, coverage: "Planning Board minutes and recordings.", url: "https://villageofquogueny.gov/government/planning-board/"}),
  municipalSource("village", {id: "sag-harbor-materials", name: "Sag Harbor meeting materials", jurisdiction: "Sag Harbor", agency: "Village of Sag Harbor", families: "Planning|Zoning|Environmental review|Site plans|Meeting documents", fields: "Applicant|Address|Proposal|Environmental review document|Plan|Approval|Hearing status|Decision", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Some meeting packets are large.`, coverage: "Meeting records and linked application, site-plan, environmental, and decision files.", url: "https://www.sagharborny.gov/215/Meeting-Materials"}),
  municipalSource("village", {id: "sagaponack-agendas", name: "Sagaponack land-use records", jurisdiction: "Sagaponack", agency: "Village of Sagaponack", families: "Planning|Zoning|Architectural review|Historic preservation|Meeting documents", fields: "Owner|Address|SCTM|Zone|Project scope|Plan|Application history|Condition", steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning, zoning, architectural, historic, and trustee records.", url: "https://ny-sagaponack.civicplus.com/AgendaCenter"}),
  municipalSource("village", {id: "saltaire-minutes", name: "Saltaire trustee records", jurisdiction: "Saltaire", agency: "Village of Saltaire", families: "Trustee minutes|Permit and variance references", fields: "Meeting date|Permit or variance matter|Land or capital work|Board action", accessMode: "request-or-contact", collectionState: "restricted", steps: "Review the trustee minutes, then contact the village office or file a records request for the current project file.", limits: "Minutes sometimes name permit, variance, land, or capital work, but there is no current public project or permit archive.", coverage: "Limited trustee references to permits, variances, land, and capital work.", url: "https://www.saltaire.org/minutes.htm"}),
  municipalSource("village", {id: "shoreham-agendas", name: "Shoreham trustee records", jurisdiction: "Shoreham", agency: "Village of Shoreham", families: "Trustee minutes|Permit rules and forms", fields: "Meeting date|Land-use matter when discussed|Permit form or rule|Board action", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The village has no separate public planning or zoning feed.`, coverage: "Trustee agendas and minutes plus permit rules and forms.", url: "https://www.shorehamvillage.org/AgendaCenter"}),
  municipalSource("village", {id: "southampton-village-planning", name: "Southampton village Planning Board records", jurisdiction: "Southampton", agency: "Village of Southampton", families: "Planning|Zoning|Meeting documents", fields: "Case number|Applicant|Address|SCTM|Proposal|Status|Decision|Attachment", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Some files are available only from the Building Department.`, coverage: "Planning Board and Zoning Board agendas, packets, minutes, and linked files.", url: "https://www.southamptonvillage.gov/AgendaCenter/Planning-Board-3"}),
  municipalSource("village", {id: "village-of-the-branch-contact", name: "Village of the Branch records contact", jurisdiction: "Village of the Branch", agency: "Village of the Branch", families: "Planning and building records by contact", fields: "Department contact|Phone|Email or mailing details", accessMode: "no-public-feed", collectionState: "no-public-feed", steps: "Contact the village and ask which office holds the planning, building, zoning, or permit record.", limits: "No public agendas, minutes, project notices, application list, or permit register was found.", coverage: "The official contact page provides the route for a records question.", url: "https://villageofthebranch.net/contact/"}),
  municipalSource("village", {id: "westhampton-beach-planning", name: "Westhampton Beach planning records", jurisdiction: "Westhampton Beach", agency: "Village of Westhampton Beach", families: "Planning|Zoning|Applications|Meeting documents", fields: "Applicant|Address|SCTM|Proposal|Plan|Stage|Recommendation|Decision", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Records are spread across several site collections.`, coverage: "Planning and zoning records, applications, reports, decisions, and forms.", url: "https://www.westhamptonbeach.gov/planning-board-meetings/"}),
  municipalSource("village", {id: "west-hampton-dunes-meetings", name: "West Hampton Dunes public meetings", jurisdiction: "West Hampton Dunes", agency: "Village of West Hampton Dunes", families: "Planning|Zoning|Building|Coastal review|Public notices|Meeting documents", fields: "Applicant|Address|Project scope|Coastal or zoning review|Meeting date|Decision", steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The village publishes a small number of records.`, coverage: "Planning, zoning, trustee, and building notices, agendas, minutes, and applications.", url: "https://whdunes.gov/departments/public-meetings/"}),
];

export const SUFFOLK_MUNICIPAL_SOURCES: MunicipalSource[] = [...TOWN_SOURCES, ...VILLAGE_SOURCES];
