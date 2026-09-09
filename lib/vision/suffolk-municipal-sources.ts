import {MUNICIPAL_SOURCE_CHECKED_AT, type MunicipalSource, type SourceAccessMode, type SourceCollectionState} from "./source-directory";

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

type SuffolkMunicipalSourceEntry = {
  id: string;
  name: string;
  jurisdiction: string;
  agency: string;
  families: readonly string[];
  fields: readonly string[];
  steps: string;
  limits: string;
  coverage: string;
  url: string;
  accessMode?: SourceAccessMode;
  collectionState?: SourceCollectionState;
};

function municipalSource(jurisdictionType: "town" | "village", entry: SuffolkMunicipalSourceEntry): MunicipalSource {
  return {
    id: entry.id,
    name: entry.name,
    jurisdiction: entry.jurisdiction,
    jurisdictionType,
    county: "Suffolk",
    officialAgency: entry.agency,
    recordFamilies: entry.families,
    availableFields: entry.fields,
    accessMode: entry.accessMode ?? "public-online",
    collectionState: entry.collectionState ?? "manual",
    manualSteps: entry.steps,
    limits: entry.limits,
    coverage: entry.coverage,
    url: entry.url,
    checkedAt: MUNICIPAL_SOURCE_CHECKED_AT,
  };
}

const TOWN_SOURCES = [
  municipalSource("town", {
    id: "babylon-planning-agendas", name: "Babylon planning agendas and notices", jurisdiction: "Babylon", agency: "Town of Babylon Planning and Development",
    families: ["Site plans", "Subdivisions", "Zoning", "Meeting documents"], fields: ["Applicant or project name", "Address", "Application type", "Hearing date", "Board action"],
    steps: "Search the Agenda Center, then open the agenda, minutes, or public notice for the named matter.",
    limits: "Vision does not collect this source. OpenGov account records are not a public townwide project feed.", coverage: "Planning Board, Zoning Board, business and industrial site-plan, subdivision, and hearing records.",
    url: "https://www.townofbabylonny.gov/AgendaCenter/",
  }),
  municipalSource("town", {
    id: "brookhaven-planning-hearings", name: "Brookhaven planning applications and hearings", jurisdiction: "Brookhaven", agency: "Town of Brookhaven Planning and Environment",
    families: ["Site plans", "Subdivisions", "Land divisions", "Public hearings", "Zoning"], fields: ["Applicant or project name", "Address", "Requested approval", "Hearing date", "Application document"],
    steps: "Open the planning page and linked hearing material. Request building records when the public files do not answer the question.",
    limits: "Vision does not collect this source. The intake portal is not a public project search, and some building records need a document request.", coverage: "Published planning applications, permit guidance, and land-use hearing records.",
    url: "https://www.brookhavenny.gov/278/Planning-Environmental",
  }),
  municipalSource("town", {
    id: "east-hampton-planning-agendas", name: "East Hampton Planning Board records", jurisdiction: "East Hampton", agency: "Town of East Hampton Planning Board",
    families: ["Commercial development plans", "Site plans", "Subdivisions", "Meeting documents"], fields: ["Applicant or project name", "Agenda item", "Meeting date", "Packet", "Minutes", "Version", "Video link"],
    steps: "Search the Planning Board category, then open the HTML agenda, packet, minutes, or prior version.",
    limits: "Vision does not collect this source. OpenGov account records are not a public townwide project feed.", coverage: "Planning Board agendas, packets, minutes, versions, and videos for published matters.",
    url: "https://www.ehamptonny.gov/AgendaCenter",
  }),
  municipalSource("town", {
    id: "huntington-meetings", name: "Huntington meetings and agendas", jurisdiction: "Huntington", agency: "Town of Huntington Planning and Environment",
    families: ["Planning applications", "Meeting documents", "Zoning"], fields: ["Meeting date", "Agenda", "Voting history", "Resolution", "Recording link"],
    steps: "Open the meeting page and review the board record. Pending application status may require a call or email.",
    limits: "Vision does not collect this source. Meeting material may omit pending application status.", coverage: "Planning Board, Zoning Board, and Town Board meeting records.",
    url: "https://huntingtonny.gov/meetings",
  }),
  municipalSource("town", {
    id: "islip-planning-documents", name: "Islip Planning Board documents", jurisdiction: "Islip", agency: "Town of Islip Planning and Development",
    families: ["Site plans", "Change of zone", "Public hearings", "Meeting documents"], fields: ["Applicant or project name", "Docket or case number", "Address", "Proposal", "Hearing date", "Site-plan file"],
    steps: "Search the Planning Board document folder and open the notice, agenda, or linked site-plan file.",
    limits: "Vision does not collect this source. The application portal requires a login and is not a public project feed.", coverage: "Planning Board agendas, notices, change-of-zone records, and selected site-plan files.",
    url: "https://islipny.gov/community-and-services/documents/meeting-documents-agendas-notices-resolutions/planning-board-meetings",
  }),
  municipalSource("town", {
    id: "riverhead-planning", name: "Riverhead planning and environmental review", jurisdiction: "Riverhead", agency: "Town of Riverhead Planning Department",
    families: ["Site plans", "Subdivisions", "Zoning", "Environmental review", "Meeting documents"], fields: ["Project name", "Application type", "Meeting date", "Agenda", "Minutes", "Environmental review document"],
    steps: "Open the planning page, then review the current-project file or the linked board agenda and minutes.",
    limits: "Vision does not collect this source. Building records require a records request.", coverage: "Planning applications, board records, zoning material, and environmental review files that the town publishes.",
    url: "https://www.townofriverheadny.gov/192/Planning",
  }),
  municipalSource("town", {
    id: "shelter-island-planning-agendas", name: "Shelter Island planning records", jurisdiction: "Shelter Island", agency: "Town of Shelter Island Planning Board",
    families: ["Site plans", "Wetlands", "Zoning", "Meeting documents"], fields: ["Applicant or project name", "Agenda item", "Meeting date", "Agenda", "Prior version"],
    steps: "Search the Planning Board category and open the agenda or prior version for the meeting.",
    limits: "Vision does not collect this source. Online property history is recent and does not show every older record.", coverage: "Planning Board agendas and published site-plan, wetlands, planning, and zoning matters.",
    url: "https://www.shelterislandtown.gov/AgendaCenter/Planning-Board-3",
  }),
  municipalSource("town", {
    id: "smithtown-meetings", name: "Smithtown public meetings", jurisdiction: "Smithtown", agency: "Town of Smithtown Planning and Community Development",
    families: ["Site plan review", "Meeting documents", "Zoning"], fields: ["Meeting date", "Agenda", "Packet", "Minutes", "Video link"],
    steps: "Open CivicClerk and review the meeting packet or minutes for the published matter.",
    limits: "Vision does not collect this source. Commercial permit coverage is not confirmed, and meeting records do not cover every permit.", coverage: "Planning, site-plan, zoning, and board meeting material published through CivicClerk.",
    url: "https://smithtownny.portal.civicclerk.com/",
  }),
  municipalSource("town", {
    id: "southampton-current-planning", name: "Southampton current planning applications", jurisdiction: "Southampton", agency: "Town of Southampton Planning Department",
    families: ["Site plans", "Subdivisions", "Lot-line changes", "Special exceptions", "Wetlands permits", "Environmental review"], fields: ["Project or applicant name", "Hamlet", "Address", "Application type", "Public hearing date", "Recommendation", "Decision", "Document link"],
    steps: "Choose the hamlet, open its current application page, and review the linked application or decision file.",
    limits: "Vision does not collect this source. Current application pages show the last six months, and older or missing records require FOIL.", coverage: "Current planning applications grouped by hamlet, including published site, subdivision, wetlands, and environmental records.",
    url: "https://southamptontownny.gov/1236/Current-Planning-Applications",
  }),
  municipalSource("town", {
    id: "southold-planning-agendas", name: "Southold Planning Board records", jurisdiction: "Southold", agency: "Town of Southold Planning Board",
    families: ["Site plans", "Subdivisions", "Lot-line changes", "Wireless permits", "Meeting documents"], fields: ["Applicant or project name", "Address or location", "Application type", "Meeting date", "Agenda", "Minutes", "Prior version"],
    steps: "Search the Planning Board category and open the agenda, minutes, or prior version.",
    limits: "Vision does not collect this source. Building history may require Laserfiche or a records request.", coverage: "Planning Board agendas and minutes for published site-plan, subdivision, lot-line, and wireless matters.",
    url: "https://www.southoldtownny.gov/AgendaCenter",
  }),
];

const PUBLIC_PROPERTY_SOURCES = [
  municipalSource("town", {
    id: "huntington-site-history",
    name: "Huntington Site History Summary",
    jurisdiction: "Huntington",
    agency: "Town of Huntington Building & Housing / Engineering Services",
    families: ["Building permits", "Certificates of occupancy", "Building inspections", "Zoning Board decisions"],
    fields: ["Address", "SCTM", "Application number", "Permit number", "Certificate number", "Record type", "Purpose", "Application, permit and certificate dates", "Estimated cost and fee when published", "Inspection result"],
    steps: "Search the public page by address or Suffolk County Tax Map number, then review the site history summary for the property.",
    limits: "The site history is for general information and is not an official town record. It is a property search, not a townwide project feed, and Vision does not collect it.",
    coverage: "Current building and certificate applications plus available older permits, certificates, inspections and Zoning Board decisions for a searched property.",
    url: "https://huntingtonny.gov/site-history",
  }),
];

const BUILDING_DEPARTMENT_SOURCES = [
  municipalSource("town", {
    id: "babylon-online-permit-center", name: "Babylon Online Permit Center", jurisdiction: "Babylon", agency: "Town of Babylon Planning and Development",
    families: ["Building permits", "Planning applications", "Zoning applications", "Application tracking"], fields: ["Application address", "Application type", "Application status", "Submitted documents", "Applicant account records"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Create or use an OpenGov account, then open an application tied to that account or ask town staff to add an existing application.",
    limits: "The portal shows applications available to the signed-in account. It is not a public townwide project search, and Vision does not collect it.", coverage: "Building, planning, rental, accessory apartment and zoning applications submitted or linked to the account.",
    url: "https://www.townofbabylonny.gov/759/Online-Services",
  }),
  municipalSource("town", {
    id: "brookhaven-public-records", name: "Brookhaven public records search", jurisdiction: "Brookhaven", agency: "Town of Brookhaven Building Division",
    families: ["Building permits", "Certificates", "Registrations", "Licenses"], fields: ["Search filters", "Record type", "Record details returned by the public search"],
    steps: "Search the public records page by one or more available filters, then open the matching record.", limits: "Vision links to this public search but does not collect it. The service may be unavailable, and property research or older documents may require a separate request.",
    coverage: "Public permits, certificates, registrations, licenses and related records returned by the town search.", url: "https://digitalservices.brookhavenny.gov/lookup-record",
  }),
  municipalSource("town", {
    id: "east-hampton-opengov-permits", name: "East Hampton OpenGov permit portal", jurisdiction: "East Hampton", agency: "Town of East Hampton Building Department",
    families: ["Building permits", "Planning applications", "Zoning applications", "Application tracking"], fields: ["Property", "Application type", "Application status", "Submitted documents", "Account payments"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Create or use an OpenGov account to submit an application and review records available to that account.",
    limits: "The portal requires an account and does not provide a public townwide project list. Vision does not collect it.", coverage: "Building, planning, architectural review and zoning applications submitted through the town portal.",
    url: "https://www.ehamptonny.gov/279/Building-Department",
  }),
  municipalSource("town", {
    id: "huntington-permit-portal", name: "Huntington Permit Portal", jurisdiction: "Huntington", agency: "Town of Huntington Building and Housing",
    families: ["Building permits", "Plumbing permits", "Application tracking"], fields: ["Property information", "Permit type", "Permit progress and status", "Account payments"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Create or use a Citizen Service account to submit an application and track a permit tied to the account.",
    limits: "The portal is password protected and does not provide a public townwide project list. Vision does not collect it.", coverage: "Residential, commercial, plumbing and related permit applications submitted through the town portal.",
    url: "https://www.huntingtonny.gov/content/13749/13847/16804/404641/default.aspx",
  }),
  municipalSource("town", {
    id: "islip-application-portal", name: "Islip Planning and Development portal", jurisdiction: "Islip", agency: "Town of Islip Planning and Development",
    families: ["Building permits", "Planning applications", "Engineering applications", "Application tracking"], fields: ["Record number", "Application status", "Permit ID", "Submitted documents", "Permit type"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Create or use an account to file an application, then open its status or permit ID to review records tied to the account.",
    limits: "The application manager requires an account and is not a public townwide permit search. Vision does not collect it.", coverage: "Building, planning and engineering applications filed and tracked through the town portal.",
    url: "https://planning.islipny.gov/?page=home",
  }),
  municipalSource("town", {
    id: "islip-building-records-request", name: "Islip building records request", jurisdiction: "Islip", agency: "Town of Islip Records Access Office",
    families: ["Building permits", "Certificates of occupancy", "Surveys", "Plans and blueprints", "Inspection reports"], fields: ["Records supplied in response to the request", "Permit or certificate", "Survey", "Plan or blueprint", "Inspection report"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "File a town records request that identifies the property and building file needed, then review the records the town supplies.",
    limits: "The route requires a records request. Response time and available documents vary, and Vision does not collect this source.", coverage: "Building Department files that the town supplies through its records request process.",
    url: "https://islipny.gov/foil",
  }),
  municipalSource("town", {
    id: "riverhead-building-portal", name: "Riverhead Building Department portal", jurisdiction: "Riverhead", agency: "Town of Riverhead Building Department",
    families: ["Building permits", "Parcel applications", "Application tracking"], fields: ["Parcel", "Application record number", "Opened date", "Permit type", "Description", "Valuation", "Submitted attachments"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Create or use an account, find the parcel, and open an application available to that account.",
    limits: "The submission portal requires an account and is not a public townwide project list. Vision does not collect it.", coverage: "Building applications submitted against a selected parcel and made available to the signed-in account.",
    url: "https://www.townofriverheadny.gov/DocumentCenter/View/367/Building-Department-Application-Portal-Instructions-PDF",
  }),
  municipalSource("town", {
    id: "riverhead-building-records-request", name: "Riverhead building records request", jurisdiction: "Riverhead", agency: "Town of Riverhead Building Department",
    families: ["Building permits", "Certificates of occupancy", "Surveys", "Inspection records"], fields: ["Permit supplied by the town", "Certificate of occupancy supplied by the town", "Survey supplied by the town", "Construction or inspection detail when supplied"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Open the Building Department page and file a records request for the property and document needed.",
    limits: "Copies of permits, certificates and surveys require a records request. Vision does not collect this source.", coverage: "Building records supplied by the town after a request.",
    url: "https://www.townofriverheadny.gov/203/Building",
  }),
  municipalSource("town", {
    id: "shelter-island-property-records", name: "Shelter Island public property records", jurisdiction: "Shelter Island", agency: "Town of Shelter Island Building Department",
    families: ["Property information", "Recent permit history"], fields: ["Public property information", "Recent property and permit history shown for the parcel"],
    steps: "Open the public GIS property view and search for the parcel without registering.", limits: "The town states that not all history is online. Older or missing records need an office visit or records request, and Vision does not collect this source.",
    coverage: "Public property information and recent online history for a searched parcel.", url: "https://www.axisgis.com/shelter_islandny/",
  }),
  municipalSource("town", {
    id: "shelter-island-citysquared", name: "Shelter Island CitySquared permit portal", jurisdiction: "Shelter Island", agency: "Town of Shelter Island Building Department",
    families: ["Building permit applications", "Application tracking", "Permit payments"], fields: ["Permit application tied to the account", "Review step or status", "Submitted account records", "Payment status"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Register with CitySquared to submit or review a permit tied to the account.", limits: "The portal requires registration and does not provide a public townwide project list. Older records may require a records request, and Vision does not collect it.",
    coverage: "Building permit submission, review and payment records available to the signed-in account.", url: "https://www.shelterislandtown.gov/182/Building-Department",
  }),
  municipalSource("town", {
    id: "smithtown-building-portal", name: "Smithtown online building permits", jurisdiction: "Smithtown", agency: "Town of Smithtown Building Department",
    families: ["Residential building permits", "Certificates", "Inspections", "Property information"], fields: ["Application status", "Property details", "Certificates", "GIS information", "Inspection schedule", "Permit fees"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Register with CitySquared, then open a permit or property record available to the account.", limits: "The portal requires registration and does not yet accept every residential or commercial application type. Vision does not collect it.",
    coverage: "Supported residential permit applications and the status, property, certificate, GIS, inspection and fee details available to the account.", url: "https://www.smithtownny.gov/726/ONLINE-RESIDENTIAL-BUILDING-PERMITS",
  }),
  municipalSource("town", {
    id: "southampton-permit-lookup", name: "Southampton property and permit search", jurisdiction: "Southampton", agency: "Town of Southampton Land Management",
    families: ["Building permits", "Property records", "Contractor records", "Permit status"], fields: ["Permit number", "Address", "Permit status", "Property search result", "Licensed contractor result"],
    steps: "Choose permit status, property or contractor search and enter the permit number, address or other requested search value.", limits: "Vision links to this public lookup but does not collect it. The town says users must verify online information with the responsible department.",
    coverage: "Public permit status, property and licensed contractor search results.", url: "https://gis.southamptontownny.gov/epermitlookup/ehubsearch.html",
  }),
  municipalSource("town", {
    id: "southampton-building-epermits", name: "Southampton Building ePermits", jurisdiction: "Southampton", agency: "Town of Southampton Building Department",
    families: ["Building permit applications", "Application documents", "Application tracking"], fields: ["Account permit applications", "Application documents", "Permit correspondence", "Application status"],
    accessMode: "request-or-contact", collectionState: "restricted", steps: "Create or use an ePermits account to submit or review building permit records tied to that account.", limits: "The portal requires an account and does not provide a public townwide project list. Vision does not collect it.",
    coverage: "Building permit applications and related records made available to the signed-in account.", url: "https://epermits.southamptontownny.gov/ebuilding/",
  }),
  municipalSource("town", {
    id: "southold-laserfiche-records", name: "Southold digital records search", jurisdiction: "Southold", agency: "Town of Southold Building Department and Town Clerk",
    families: ["Building permits", "Planning records", "Zoning records", "Scanned public records"], fields: ["Permit number", "Name", "Tax map number", "Document folder", "Scanned record file"],
    steps: "Open Weblink or Laserfiche from the Building Department page and search one field at a time by permit number, name or tax map number.", limits: "Vision links to the public record system but does not collect it. Some files lack a tax map number, and a missing result may require a records request.",
    coverage: "Digital records indexed by permit number, name, tax map number and department folder, including available building, planning and zoning files.", url: "https://www.southoldtownny.gov/98/Building-Department",
  }),
];

const NO_PERMIT_REGISTER = "Vision does not collect this source. No public searchable permit register was found.";
const PUBLIC_STEPS = "Open the official page and review the linked notice, agenda, minutes, or project file.";

const VILLAGE_SOURCES = [
  municipalSource("village", {id: "amityville-agendas", name: "Amityville planning and zoning records", jurisdiction: "Amityville", agency: "Village of Amityville", families: ["Planning", "Zoning", "Meeting documents"], fields: ["Applicant", "Address", "SCTM", "District", "Proposed work", "Requested relief", "Hearing date", "Outcome"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Minutes may lag the meeting.`, coverage: "Planning Board and Zoning Board agendas and minutes.", url: "https://www.amityville.gov/AgendaCenter"}),
  municipalSource("village", {id: "asharoken-boards", name: "Asharoken board records", jurisdiction: "Asharoken", agency: "Village of Asharoken", families: ["Planning", "Zoning", "Public notices", "Meeting documents"], fields: ["Applicant", "Address", "Application type", "Variance or special use", "Meeting date", "Board action"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The archive is irregular.`, coverage: "Published Planning Board and Zoning Board notices and minutes.", url: "https://asharoken.com/boardscommittees.htm"}),
  municipalSource("village", {id: "babylon-village-notices", name: "Babylon village land-use notices", jurisdiction: "Babylon", agency: "Village of Babylon", families: ["Planning", "Zoning", "Architectural review", "Public notices"], fields: ["Applicant or business", "Address", "Use", "Site-plan facts", "Conditions", "Board action"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Some older notices are available only at Village Hall.`, coverage: "Published planning, zoning, architectural review, and trustee land-use matters.", url: "https://www.villageofbabylonny.gov/legal-notices.html"}),
  municipalSource("village", {id: "belle-terre-minutes", name: "Belle Terre trustee records", jurisdiction: "Belle Terre", agency: "Village of Belle Terre", families: ["Trustee minutes", "Building and permit references"], fields: ["Meeting date", "Permit or planning matter", "Board action"], steps: "Review the public trustee minutes, then contact the village or file a records request for the full permit file when needed.", limits: "Vision links to the public minutes but does not collect them. The archive is not a public permit register, and full files require a request.", coverage: "Public trustee minutes with permit and planning references.", url: "https://belleterre.us/minutes-of-board-meetings/"}),
  municipalSource("village", {id: "bellport-planning", name: "Bellport Planning Board records", jurisdiction: "Bellport", agency: "Village of Bellport", families: ["Planning", "Site plans", "Subdivisions", "Public notices", "Meeting documents"], fields: ["Owner or applicant", "Address", "Application type", "Meeting date", "Status or result", "Project document"], steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning Board notices, agendas, minutes, and selected project documents.", url: "https://www.bellportvillageny.gov/category/planning-board-meetings/"}),
  municipalSource("village", {id: "brightwaters-agendas", name: "Brightwaters planning and zoning records", jurisdiction: "Brightwaters", agency: "Village of Brightwaters", families: ["Planning", "Zoning", "Meeting documents"], fields: ["Applicant", "Address", "SCTM", "Proposal", "Requested relief", "Meeting date", "Decision"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Account-based application intake is not a public record search.`, coverage: "Planning Board, Zoning Board, and trustee agendas and minutes.", url: "https://www.villageofbrightwaters.com/AgendaCenter"}),
  municipalSource("village", {id: "dering-harbor-notices", name: "Dering Harbor land-use notices", jurisdiction: "Dering Harbor", agency: "Village of Dering Harbor", families: ["Planning", "Architectural review", "Zoning", "Public notices", "Meeting documents"], fields: ["Applicant or owner", "Address", "SCTM", "Proposal", "Meeting date", "Continuation"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The village publishes a small number of records.`, coverage: "Planning, Architectural Review Board, and Zoning Board notices and agendas.", url: "https://deringharborvillage.org/category/notices"}),
  municipalSource("village", {id: "east-hampton-village-meetings", name: "East Hampton village board meetings", jurisdiction: "East Hampton", agency: "Village of East Hampton", families: ["Planning", "Zoning", "Design review", "Historic preservation", "Meeting documents"], fields: ["Applicant", "Parcel or address", "Proposal", "Board", "Meeting date", "Plan", "Decision"], steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning, zoning, design, and historic board meeting records and linked files.", url: "https://easthamptonvillage.gov/departments/public-board-meetings/"}),
  municipalSource("village", {id: "greenport-planning", name: "Greenport Planning Board records", jurisdiction: "Greenport", agency: "Village of Greenport", families: ["Planning", "Zoning", "Site plans", "Building plans", "Meeting documents"], fields: ["Applicant", "Address", "Proposed work", "Requested relief", "Meeting date", "Decision", "Plan or survey"], steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning Board and Zoning Board records with selected application and plan files.", url: "https://villageofgreenport.gov/village-boards/planning-board/"}),
  municipalSource("village", {id: "head-of-harbor-planning", name: "Head of the Harbor Planning Board minutes", jurisdiction: "Head of the Harbor", agency: "Village of Head of the Harbor", families: ["Planning", "Architectural review", "Zoning", "Meeting documents"], fields: ["Applicant", "Address", "Application type", "Site plan or subdivision", "Exhibit", "Action or condition"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The village does not accept electronic applications.`, coverage: "Planning, architectural review, and zoning minutes and forms.", url: "https://headoftheharborny.gov/planning-board-minutes/"}),
  municipalSource("village", {id: "huntington-bay-zoning", name: "Huntington Bay Zoning Board records", jurisdiction: "Huntington Bay", agency: "Village of Huntington Bay", families: ["Zoning", "Public notices", "Meeting documents"], fields: ["Applicant", "Address", "Variance", "Continuation", "Decision", "Meeting date"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The current page may replace a prior agenda.`, coverage: "Current Zoning Board agendas, notices, decisions, and minutes.", url: "https://www.huntingtonbay.org/zoning-board-agenda"}),
  municipalSource("village", {id: "islandia-hearings", name: "Islandia public hearings", jurisdiction: "Islandia", agency: "Village of Islandia", families: ["Zoning", "Public hearings", "Public notices"], fields: ["Address", "Proposed use", "Hearing date", "Board action"], steps: "Search the village posts for a public hearing or zoning matter and open the dated post.", limits: `${NO_PERMIT_REGISTER} The site has no stable project archive.`, coverage: "Public-hearing posts and occasional zoning matters.", url: "https://www.newvillageofislandia.com/"}),
  municipalSource("village", {id: "lake-grove-notices", name: "Lake Grove planning and zoning notices", jurisdiction: "Lake Grove", agency: "Village of Lake Grove", families: ["Planning", "Zoning", "Public notices"], fields: ["Applicant or owner", "Address", "SCTM", "Zone", "Proposal", "Variance", "Meeting date"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Minutes and decisions are published less often than notices.`, coverage: "Published Planning Board and Zoning Board notices.", url: "https://lakegroveny.gov/government/village-notices/"}),
  municipalSource("village", {id: "lindenhurst-meetings", name: "Lindenhurst public meetings", jurisdiction: "Lindenhurst", agency: "Village of Lindenhurst", families: ["Planning", "Zoning", "Public notices", "Meeting documents"], fields: ["Applicant", "Address", "SCTM", "Zone", "Proposal", "Dimensions or relief", "Meeting date"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Records are spread across event posts and uploads.`, coverage: "Planning and zoning notices, agendas, and published rules.", url: "https://villageoflindenhurstny.gov/calendar/public-meetings/"}),
  municipalSource("village", {id: "lloyd-harbor-agendas", name: "Lloyd Harbor board agendas", jurisdiction: "Lloyd Harbor", agency: "Village of Lloyd Harbor", families: ["Planning", "Zoning", "Permit review", "Meeting documents"], fields: ["Address", "Application type", "Board", "Meeting date", "Decision in minutes"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Published records use applicant names inconsistently.`, coverage: "Permit review, Planning Board, Zoning Board, and trustee agendas and minutes.", url: "https://www.lloydharbor.org/publications-agendas/"}),
  municipalSource("village", {id: "nissequogue-notices", name: "Nissequogue land-use notices", jurisdiction: "Nissequogue", agency: "Village of Nissequogue", families: ["Planning", "Zoning", "Architectural review", "Coastal review", "Public notices", "Meeting documents"], fields: ["Applicant or project", "Address", "Permit type", "Meeting date", "Adjournment", "Decision"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The archive uses older HTML pages.`, coverage: "Planning, zoning, architectural, and coastal notices and minutes.", url: "https://nissequogueny.gov/index.php?b=pubnote"}),
  municipalSource("village", {id: "north-haven-planning", name: "North Haven Planning Board records", jurisdiction: "North Haven", agency: "Village of North Haven", families: ["Planning", "Shoreline review", "Meeting documents", "Applications"], fields: ["Owner or agent", "Address", "SCTM", "Project scope", "Plan", "Requested relief", "Decision"], steps: "Use a browser to open the board page and review its agenda, resolution, minutes, transcript, application, or shoreline case.", limits: `${NO_PERMIT_REGISTER} Direct automated requests returned 403 during review.`, coverage: "Planning Board records, applications, decisions, and shoreline cases.", url: "https://www.northhavenny.gov/planning-board"}),
  municipalSource("village", {id: "northport-documents", name: "Northport land-use documents", jurisdiction: "Northport", agency: "Village of Northport", families: ["Planning", "Zoning", "Architectural review", "Historic preservation", "Meeting documents"], fields: ["Applicant", "Address", "Application type", "Project facts", "Board discussion", "Outcome"], steps: "Use a browser to search the document indexes, then open the PDF or ZIP file for the board record.", limits: `${NO_PERMIT_REGISTER} Direct automated requests returned 403 during review.`, coverage: "Planning, zoning, architectural, historic, and trustee minutes in document indexes.", url: "https://northportny.gov/documents/"}),
  municipalSource("village", {id: "ocean-beach-notices", name: "Ocean Beach land-use notices", jurisdiction: "Ocean Beach", agency: "Village of Ocean Beach", families: ["Planning", "Architectural review", "Zoning", "Public notices", "Meeting documents"], fields: ["Address", "Proposal", "Meeting date", "Video link", "Minutes when published"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Many entries show only a meeting date.`, coverage: "Planning, architectural, and zoning notices with some minutes and video links.", url: "https://villageofoceanbeach.org/public-notices"}),
  municipalSource("village", {id: "old-field-minutes", name: "Old Field trustee minutes", jurisdiction: "Old Field", agency: "Village of Old Field", families: ["Building permits", "Trustee minutes"], fields: ["Address", "Proposed work", "Permit action", "Condition", "Decision", "Meeting date"], steps: "Open the trustee minutes and review the building-permit section for the named property.", limits: `${NO_PERMIT_REGISTER} Applications are not always online before the meeting.`, coverage: "Trustee minutes that discuss building permit applications and actions.", url: "https://oldfieldny.org/government/board-meeting-minutes/"}),
  municipalSource("village", {id: "patchogue-planning-agendas", name: "Patchogue Planning Board records", jurisdiction: "Patchogue", agency: "Village of Patchogue", families: ["Planning", "Zoning", "Public notices", "Meeting documents"], fields: ["Case number", "Applicant", "Address", "Zone", "Use", "Proposed work", "Stage", "Plan", "Decision or condition"], steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning and zoning agendas, minutes, notices, and packets.", url: "https://www.patchoguevillage.gov/AgendaCenter/Planning-Board-2"}),
  municipalSource("village", {id: "poquott-records-contact", name: "Poquott planning and permit records contact", jurisdiction: "Poquott", agency: "Village of Poquott", families: ["Planning records", "Building permits", "Dock permits", "Meeting records"], fields: ["Record details supplied by the village after contact or a records request"], accessMode: "request-or-contact", collectionState: "restricted", steps: "Contact the village or file a records request for the current planning, permit or meeting record.", limits: "The site does not provide a stable current agenda or project archive. The former agenda link still serves a January 2024 file, and Vision does not collect this source.", coverage: "Current planning, building, dock and meeting records available from the village after contact or request.", url: "https://www.villageofpoquott.com/"}),
  municipalSource("village", {id: "port-jefferson-planning", name: "Port Jefferson Planning Board records", jurisdiction: "Port Jefferson", agency: "Village of Port Jefferson", families: ["Planning", "Zoning", "Meeting documents"], fields: ["Address", "Application type", "Use", "Project scope", "Stage", "Decision", "Meeting date"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Some entries contain only a notice.`, coverage: "Planning Board and Zoning Board agendas and minutes.", url: "https://www.portjeffny.gov/AgendaCenter/Planning-Board-4"}),
  municipalSource("village", {id: "quogue-planning", name: "Quogue Planning Board records", jurisdiction: "Quogue", agency: "Village of Quogue", families: ["Planning", "Meeting documents"], fields: ["Applicant", "Address", "SCTM", "Proposal", "Outside approval", "Issue", "Board action"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Agendas are not posted with each meeting, and the page timed out during one check.`, coverage: "Planning Board minutes and recordings.", url: "https://villageofquogueny.gov/government/planning-board/"}),
  municipalSource("village", {id: "sag-harbor-materials", name: "Sag Harbor meeting materials", jurisdiction: "Sag Harbor", agency: "Village of Sag Harbor", families: ["Planning", "Zoning", "Environmental review", "Site plans", "Meeting documents"], fields: ["Applicant", "Address", "Proposal", "Environmental review document", "Plan", "Approval", "Hearing status", "Decision"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Some meeting packets are large.`, coverage: "Meeting records and linked application, site-plan, environmental, and decision files.", url: "https://www.sagharborny.gov/215/Meeting-Materials"}),
  municipalSource("village", {id: "sagaponack-agendas", name: "Sagaponack land-use records", jurisdiction: "Sagaponack", agency: "Village of Sagaponack", families: ["Planning", "Zoning", "Architectural review", "Historic preservation", "Meeting documents"], fields: ["Owner", "Address", "SCTM", "Zone", "Project scope", "Plan", "Application history", "Condition"], steps: PUBLIC_STEPS, limits: NO_PERMIT_REGISTER, coverage: "Planning, zoning, architectural, historic, and trustee records.", url: "https://ny-sagaponack.civicplus.com/AgendaCenter"}),
  municipalSource("village", {id: "saltaire-minutes", name: "Saltaire trustee records", jurisdiction: "Saltaire", agency: "Village of Saltaire", families: ["Trustee minutes", "Permit and variance references"], fields: ["Meeting date", "Permit or variance matter", "Land or capital work", "Board action"], steps: "Review the public trustee minutes, then contact the village office or file a records request for the full project file when needed.", limits: "Vision links to the public minutes but does not collect them. The archive is not a permit register, and full files require a request.", coverage: "Public trustee minutes with references to permits, variances, land and capital work.", url: "https://www.saltaire.org/minutes.htm"}),
  municipalSource("village", {id: "shoreham-agendas", name: "Shoreham trustee records", jurisdiction: "Shoreham", agency: "Village of Shoreham", families: ["Trustee minutes", "Permit rules and forms"], fields: ["Meeting date", "Land-use matter when discussed", "Permit form or rule", "Board action"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The village has no separate public planning or zoning feed.`, coverage: "Trustee agendas and minutes plus permit rules and forms.", url: "https://www.shorehamvillage.org/AgendaCenter"}),
  municipalSource("village", {id: "southampton-village-planning", name: "Southampton village Planning Board records", jurisdiction: "Southampton", agency: "Village of Southampton", families: ["Planning", "Zoning", "Meeting documents"], fields: ["Case number", "Applicant", "Address", "SCTM", "Proposal", "Status", "Decision", "Attachment"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Some files are available only from the Building Department.`, coverage: "Planning Board and Zoning Board agendas, packets, minutes, and linked files.", url: "https://www.southamptonvillage.gov/AgendaCenter/Planning-Board-3"}),
  municipalSource("village", {id: "village-of-the-branch-forms", name: "Village of the Branch forms and permits", jurisdiction: "Village of the Branch", agency: "Village of the Branch", families: ["Building permits", "Planning", "Zoning", "Forms and fees"], fields: ["Application type", "Required form", "Permit fee", "Filing instructions", "Board review requirement"], steps: "Open the public forms page and review the building, planning or zoning form for the proposed work.", limits: "Vision links to the public forms but does not collect them. The site does not provide a stable permit register or meeting archive, and project files may require a records request.", coverage: "Building, planning and zoning forms, permit instructions and published fees.", url: "https://www.villageofthebranchny.gov/formsandpermits"}),
  municipalSource("village", {id: "westhampton-beach-planning", name: "Westhampton Beach planning records", jurisdiction: "Westhampton Beach", agency: "Village of Westhampton Beach", families: ["Planning", "Zoning", "Applications", "Meeting documents"], fields: ["Applicant", "Address", "SCTM", "Proposal", "Plan", "Stage", "Recommendation", "Decision"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} Records are spread across several site collections.`, coverage: "Planning and zoning records, applications, reports, decisions, and forms.", url: "https://www.westhamptonbeach.gov/planning-board-meetings/"}),
  municipalSource("village", {id: "west-hampton-dunes-meetings", name: "West Hampton Dunes public meetings", jurisdiction: "West Hampton Dunes", agency: "Village of West Hampton Dunes", families: ["Planning", "Zoning", "Building", "Coastal review", "Public notices", "Meeting documents"], fields: ["Applicant", "Address", "Project scope", "Coastal or zoning review", "Meeting date", "Decision"], steps: PUBLIC_STEPS, limits: `${NO_PERMIT_REGISTER} The village publishes a small number of records.`, coverage: "Planning, zoning, trustee, and building notices, agendas, minutes, and applications.", url: "https://whdunes.gov/departments/public-meetings/"}),
];

export const SUFFOLK_MUNICIPAL_SOURCES: MunicipalSource[] = [...TOWN_SOURCES, ...PUBLIC_PROPERTY_SOURCES, ...BUILDING_DEPARTMENT_SOURCES, ...VILLAGE_SOURCES];
