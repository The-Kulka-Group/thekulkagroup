// LA-1840: the roadmap Matt and Kulka read together. Built items come from
// merged commits on main; planned and waiting items from the Kulka project in
// Linear and recorded decisions. Bid tasks and meeting action items stay off
// it. Anyone with the site URL can read this page while sign-in is off, so
// notes are written for Kulka's readers, not as internal chase notes.

export type RoadmapStatus = "built" | "planning" | "waiting" | "dropped";

export type RoadmapItem = {
  /** ISO date the item merged or was decided; null when it has no date yet. */
  date: string | null;
  /** Linear identifier, shown as plain text because Kulka cannot open Linear. */
  ticket?: string;
  title: string;
  status: RoadmapStatus;
  note?: string;
};

export type Workstream = {
  key: string;
  name: string;
  summary: string;
  items: RoadmapItem[];
};

export const ROADMAP_AS_OF = "2026-10-07";

export const STATUS_LABEL: Record<RoadmapStatus, string> = {
  built: "Built",
  planning: "In Planning",
  waiting: "Discussed, Waiting",
  dropped: "Dropped",
};

export const STATUS_DETAIL: Record<RoadmapStatus, string> = {
  built: "Live in Kulka AI",
  planning: "Scoped, not started",
  waiting: "Waiting on an answer or deferred",
  dropped: "Decided against",
};

const b = (date: string, ticket: string | undefined, title: string): RoadmapItem => ({ date, ticket, title, status: "built" });

export const WORKSTREAMS: Workstream[] = [
  {
    key: "foundation",
    name: "Foundation and Design",
    summary: "The Daylight design language, the app shell, sign-in and naming rules.",
    items: [
      b("2026-08-26", undefined, "Daylight design system: tokens, shells and decision log"),
      b("2026-08-26", undefined, "Upgrade to Next 16 and React 19.2"),
      b("2026-09-02", undefined, "Group the sidebar by Kulka business function"),
      b("2026-09-03", undefined, "Remove made-up sample data and use project language"),
      b("2026-09-17", "LA-716", "Swap password sign-in for a magic link"),
      b("2026-09-22", undefined, "Open the app without sign-in while the team tries it"),
      b("2026-09-27", "LA-1148", "Put every label in Kulka AI in title case"),
      b("2026-09-29", "LA-1330", "Bring the collapsed sidebar up to a scored bar"),
      b("2026-10-07", "LA-1840", "This roadmap, inside Kulka AI"),
      { date: null, ticket: "LA-608", title: "Invite-only password login", status: "dropped", note: "Replaced by the magic link, then by open access." },
      { date: null, title: "Sign-in comes back", status: "waiting", note: "Deferred until the team is ready for accounts." },
      { date: null, title: "kulka.ai domain and outgoing email", status: "waiting", note: "Waiting on DNS and mail setup on Kulka's side." },
      { date: null, title: "Account roles and an admin permission", status: "waiting", note: "Controls who can set standard rates, accept client corrections and edit the CRM. Follows sign-in." },
    ],
  },
  {
    key: "crm",
    name: "CRM",
    summary: "Pursuits, companies, contacts and briefs. The empty Pursuits and Briefs screens came off the live site on 2026-10-07; the working CRM comes next.",
    items: [
      b("2026-08-26", undefined, "Home, Pursuits, Clients and Briefs screens laid out in Daylight"),
      b("2026-08-26", undefined, "Make the app usable below 860px"),
      b("2026-09-03", undefined, "Move Home above the sidebar groups"),
      b("2026-09-12", "LA-226", "Plan the shared CRM and Long Island source expansion"),
      b("2026-09-12", "LA-230", "Save the approved single-screen opportunity workflow"),
      { date: null, title: "Scopes, contracts and estimating modules", status: "waiting", note: "Deferred until the CRM and budgeting settle." },
      // LA-1841: the build order in docs/crm/plan.md.
      { date: null, title: "Pursuits board and a Home work queue", status: "planning", note: "Active pursuits by stage, plus missing next actions, assignments and overdue work." },
      { date: null, title: "Companies and contacts pages", status: "planning", note: "Replaces the empty Clients page with every business relationship and its people." },
      { date: null, title: "A production pilot with two people using the CRM", status: "planning", note: "Tests the move to the live system, rollback, access and a full work cycle." },
      { date: null, title: "Meeting briefs, contact import and pipeline reports", status: "waiting", note: "Each is added only when it replaces a real manual step." },
    ],
  },
  {
    key: "vision",
    name: "Kulka Vision",
    summary: "Finds development opportunities in public records and shows them on a map.",
    items: [
      b("2026-09-06", "LA-205", "Bring Vision into Kulka AI with saved opportunity records and a map"),
      b("2026-09-06", undefined, "Address lookup and map pin confirmation"),
      b("2026-09-06", undefined, "Connect IDA project sources with official source logos"),
      b("2026-09-08", "LA-218", "Discover public development records into a review inbox"),
      b("2026-09-09", undefined, "Scale automated sources across Long Island"),
      b("2026-09-10", "LA-220", "Filter discoveries by application type, location and date"),
      b("2026-09-10", "LA-436", "Keep one SmartGov detail error from dropping every permit"),
      b("2026-09-10", "LA-221", "Make Vision map-first with a compact source picker"),
      b("2026-09-13", "LA-224", "Filter on the map, with pill controls for map layers"),
      // LA-1841: docs/vision/discovery.md and docs/crm/long-island-sources.md.
      { date: null, title: "Check public sources daily, and add more towns", status: "planning", note: "Daily checks are set up but off. Islip comes next, then Brookhaven, Huntington, Smithtown and the East End towns." },
    ],
  },
  {
    key: "underwriting",
    name: "Development Underwriting",
    summary: "The apartment development model: monthly costs, financing, lease-up, returns, and a lender's view.",
    items: [
      b("2026-09-02", undefined, "First development underwriting workflow"),
      b("2026-09-03", "LA-165", "Core apartment model: timeline, funding, lease-up, sale and returns"),
      b("2026-09-03", "LA-170", "Check apartment scenarios against the workbook golden case"),
      b("2026-10-05", "LA-1685", "Audit three more development models against the engine"),
      b("2026-10-05", "LA-1687", "Score the engine against the four audited models"),
      b("2026-10-05", "LA-1689", "Report lender tests on every run"),
      b("2026-10-05", "LA-1690", "Property tax as a dated schedule that can follow a PILOT"),
      b("2026-10-05", "LA-1691", "Construction loan on a dated rate path"),
      b("2026-10-05", "LA-1692", "Affordability tiers and AMI levels on unit types"),
      b("2026-10-06", "LA-1704", "Realistic lease-up: expense ramp, free rent, seasonal absorption"),
      b("2026-10-06", "LA-1779", "Second cap rate for lease-up property tax"),
      b("2026-10-06", "LA-1784", "Lease turnover during lease-up"),
      b("2026-10-06", "LA-1701", "Lender tests per scenario"),
      b("2026-10-06", "LA-1813", "Grants, soft loans and credited land as sources"),
      b("2026-10-06", "LA-1819", "Cost lines priced per GSF, per unit or percent of another line"),
      b("2026-10-06", "LA-1822", "Solve percent-of-total cost lines"),
      b("2026-10-06", "LA-1823", "Size the loan as the lesser of LTC, LTV, debt yield and DSCR"),
      b("2026-10-07", "LA-1838", "Grow market rent, affordable rent, other income and expenses separately"),
      b("2026-10-07", "LA-1839", "Anchor cost lines and project dates to named milestones"),
      // LA-1841: steps 10 and 11 of docs/underwriting-model-audit/build-order.md and the spec's later modules.
      { date: null, title: "Report peak equity and split cash flow between LP and GP partners", status: "planning", note: "Next step. Adds the preferred return, IRR hurdle tiers and promotes, and shows when the most equity is out." },
      { date: null, title: "Commercial tenants, permanent debt with a refinance, and an annual view", status: "planning", note: "Scoped after the partnership split. Covers ground-floor retail, the long-term loan and a year-by-year summary." },
      { date: null, title: "Soft loans that a buyer assumes at sale or that repay after the sale", status: "waiting", note: "Today a soft loan repays in one month within the model's timeline." },
      { date: null, title: "Work out residual land value", status: "waiting", note: "Shows what a site is worth given the planned building and target returns." },
      { date: null, title: "Let capital plan dates, source draws and tax years follow named milestones", status: "waiting", note: "Cost lines already move with milestones. These dates are still typed in." },
    ],
  },
  {
    key: "budget-data",
    name: "Conceptual Budget: Spec and Data",
    summary: "How a budget is priced: the work item list, Kulka's cost history, blending and backtesting.",
    items: [
      b("2026-09-12", "LA-675", "Map the way to a buildable conceptual budgeting spec"),
      b("2026-09-17", undefined, "Bring in ProEst unit-cost exports"),
      b("2026-09-18", undefined, "Freeze the canonical work item list"),
      b("2026-09-20", undefined, "Check every trade's scope list against trade standards"),
      b("2026-09-20", "LA-15", "Ingestion gate: stage, approve, then query"),
      b("2026-09-21", "LA-14", "Blend every cost row behind a cost code into one ranged line"),
      b("2026-09-21", "LA-18", "Show where each line's number came from"),
      b("2026-09-21", "LA-884", "Block board: every line by level, with element tracing"),
      b("2026-09-23", "LA-978", "Let a reviewer fix a cost line's match before approving"),
      b("2026-09-24", "LA-23", "Leave-one-out backtest against each job's own budget"),
      b("2026-09-24", "LA-1028", "Yes/no scope questions switch work items on and off"),
      b("2026-09-24", "LA-1016", "GRs/GCs, fee and insurance below the subtotal"),
      b("2026-09-27", "LA-866", "Engine parameters screen, no migration needed"),
      b("2026-09-28", "LA-1214", "MasterFormat divisions on every work item"),
      { date: null, ticket: "LA-21", title: "Autodesk actuals ingestion in version 1", status: "dropped", note: "Actuals arrive by export instead." },
      { date: null, ticket: "LA-111", title: "SharePoint project-metadata pilot", status: "dropped" },
      { date: null, ticket: "LA-36", title: "Multifamily Autodesk Cost actuals export", status: "waiting", note: "Kept for Phase 2." },
      { date: null, title: "Separate building, parking and site sections", status: "waiting", note: "One $/SF basis on total gross area for now." },
      // LA-1841: planned in the repo docs, mostly without a ticket yet.
      { date: null, title: "Score each issued budget against the job's actual costs", status: "waiting", note: "Runs when actuals are imported, so every finished job checks how close the budget was." },
      { date: null, title: "Price HVAC separately by system type", status: "waiting", note: "PTAC, ducted split and central plant share one blended rate until enough closed jobs record their system." },
      { date: null, title: "Self-storage budgets", status: "waiting", note: "The second product type after multifamily. There is no cost history for it yet." },
      { date: null, title: "Shorter and longer question paths", status: "waiting", note: "Comes back only if testing shows the two paths differ in accuracy." },
      { date: null, title: "Land, financing and other soft costs as an add-on section", status: "waiting", note: "Kept out of construction totals for now." },
    ],
  },
  {
    key: "budget-app",
    name: "Conceptual Budget: The App",
    summary: "New Budget questions, the live budget, rates, views and the saved budget screen.",
    items: [
      b("2026-09-25", "LA-1101", "Live budget in the Round 14 block layout"),
      b("2026-09-25", "LA-1107", "New Budget button and project picker"),
      b("2026-09-26", "LA-1110", "Edit and archive projects"),
      b("2026-09-26", "LA-1141", "Guided New Budget: facts, scope, markups"),
      b("2026-09-26", "LA-1152", "Demolition pilot: scope arrives from answers and relationships"),
      b("2026-09-27", "LA-1199", "Ask stories, unit count, building count and ZIP"),
      b("2026-09-27", "LA-1225", "Setup card, then one question at a time, saving as you answer"),
      b("2026-09-27", "LA-1227", "Save a new run when an answer changes"),
      b("2026-09-27", "LA-1212", "Price elevators per stop"),
      b("2026-09-28", "LA-1245", "Suggest a rate from the project's location and labor type"),
      b("2026-09-28", "LA-1252", "Suggest a rate from three asks and show all three"),
      b("2026-09-28", "LA-1256", "Last question requires a GRs/GCs rate"),
      b("2026-09-28", "LA-1254", "Ledger view: the budget as a schedule of values"),
      b("2026-09-28", "LA-1322", "All Budgets menu: Open, Edit, Archive, Restore, Delete"),
      b("2026-09-28", "LA-1323", "Price unit-driven trades per dwelling unit"),
      b("2026-09-29", "LA-1331", "A total and wording a client can read"),
      b("2026-09-29", "LA-1384", "Ledger and Rail layout for the saved budget"),
      // LA-1841: planned in the repo docs, mostly without a ticket yet.
      { date: null, title: "Work on a budget from a Claude chat", status: "planning", note: "Read a budget, propose lines and answer questions. Internal only; chat can draft but never issue a budget." },
      { date: null, title: "Compare two versions of a budget side by side", status: "waiting", note: "Answers what-if questions, such as going to five stories." },
      { date: null, title: "A review view sorted by confidence and dollar impact", status: "waiting", note: "Lets the estimator fix the few lines that matter most first." },
      { date: null, title: "A version that works during a live call", status: "waiting", note: "Today the budget is built after the call." },
    ],
  },
  {
    key: "design-engineering",
    name: "Design and Engineering",
    summary: "Works out building design facts from code and the answers, and shows the building in 3D.",
    items: [
      b("2026-09-27", "LA-860", "Shared mechanism for an AI-derived assumption"),
      b("2026-09-27", "LA-784", "Elevator type from building height"),
      b("2026-09-28", "LA-1262", "Rename Design Criteria to Design and Engineering"),
      b("2026-09-28", "LA-1269", "Count elevator machine rooms and price their HVAC per room"),
      b("2026-09-28", "LA-1281", "Electrical service size by the NEC multifamily method"),
      b("2026-09-28", "LA-1282", "Window area and HVAC tonnage from DOE code-minimum models"),
      b("2026-09-28", "LA-1298", "Construction type, podium and sprinkler standard"),
      b("2026-09-28", "LA-1300", "Foundation system and lowest slab"),
      b("2026-09-28", "LA-1317", "3D model of the building across the top of the budget"),
      b("2026-09-28", "LA-1318", "Play each answer as a scene on the 3D stage"),
      b("2026-09-28", "LA-1325", "Building Form card and the Building View with section cuts"),
      // LA-1841: planned in the repo docs, mostly without a ticket yet.
      { date: null, title: "Look up local code requirements from the project address", status: "waiting", note: "Emergency radio coverage and fire alarm type are asked directly until the lookup exists." },
      { date: null, ticket: "LA-1319", title: "Click part of the model to see and correct its decision", status: "dropped" },
      { date: null, ticket: "LA-1308", title: "Standalone Design and Engineering prototype", status: "dropped", note: "Built straight into the app instead." },
    ],
  },
  {
    key: "general-conditions",
    name: "General Conditions and Requirements",
    summary: "Prices GCs and GRs by the people and resources a job needs, filled in from the project.",
    items: [
      b("2026-09-29", "LA-1389", "Measure GC history on the base it is charged on"),
      b("2026-09-29", "LA-1396", "Load the GR rate card from C-00379"),
      b("2026-09-29", "LA-1397", "Price General Conditions by allocated resources"),
      b("2026-09-29", "LA-1398", "Price General Requirements, with a method per line"),
      b("2026-09-29", "LA-1399", "Propose the job's schedule from the project"),
      b("2026-09-29", "LA-1401", "Fill GR quantities from the project's facts"),
      b("2026-09-29", "LA-1402", "Switch resource lines on and off from the answers"),
      b("2026-09-29", "LA-1403", "Fix mislabeled field-office rate rows"),
      { date: null, ticket: "LA-1400", title: "Start General Conditions with a staff plan sized to the job", status: "planning", note: "Open decision on the staff plan." },
      { date: null, title: "Completed jobs history", status: "waiting", note: "The table exists and stays empty until past jobs are loaded." },
    ],
  },
  {
    key: "client-page",
    name: "Client Budget Page",
    summary: "A published budget the client opens by link: Kulka on black, three numbers, the schedule of values and comments.",
    items: [
      b("2026-09-29", "LA-1417", "Publish a run as a frozen budget with a link and a version"),
      b("2026-09-29", "LA-1419", "Publish controls: four fields, versions, Copy Link, Revoke"),
      b("2026-09-30", "LA-1418", "Render every published budget from one presentation model"),
      b("2026-09-30", "LA-1420", "Print the published budget to a stored PDF"),
      b("2026-09-30", "LA-1437", "Ask each fact's question in words"),
      b("2026-10-01", "LA-1459", "Build the page on the approved frames: The Ledger, Opened"),
      b("2026-10-02", "LA-1467", "Open on the Kulka wordmark, then a letter"),
      b("2026-10-02", "LA-1478", "One line on where the figures come from"),
      b("2026-10-02", "LA-1483", "Take past jobs off the page"),
      b("2026-10-02", "LA-1480", "Spec: comments, questions and assumption flags"),
      b("2026-10-02", "LA-1486", "Reader links, the /b/r route and Not You?"),
      b("2026-10-02", "LA-1490", "Client Comments in the internal app"),
      b("2026-10-02", "LA-1492", "Alert Kulka's channel when a reader comments"),
      b("2026-10-03", "LA-1489", "Comment layer on the client page"),
      b("2026-10-03", "LA-1504", "Budget drill-down by division and element"),
      b("2026-10-03", "LA-1503", "AI drafts Inclusions and Exclusions; the estimator approves"),
      b("2026-10-03", "LA-1534", "Write the page in Kulka's voice"),
      b("2026-10-03", "LA-1535", "Each item's Basis shows rate, unit, quantity and source"),
      b("2026-10-04", "LA-1558", "Approved opening and schedule-of-values drop-down"),
      b("2026-10-04", "LA-1566", "Estimate the duration when a budget has no schedule"),
      b("2026-10-04", "LA-1575", "All three numbers in a larger header"),
      b("2026-10-05", "LA-1662", "Design and Engineering in layers, opening in place (Rob's pick)"),
      b("2026-10-05", "LA-1671", "Tighter leader lines for criterion notes"),
      { date: null, ticket: "LA-1481", title: "Assumption deltas and a VE control per division", status: "waiting", note: "Waiting on Kulka's alternate prices and VE options." },
      { date: null, title: "Past jobs back on the client page", status: "waiting", note: "Returns when marketing adds them." },
      // LA-1841: planned in the repo docs, mostly without a ticket yet.
      { date: null, title: "Turn on comment alerts to Kulka's channel", status: "waiting", note: "Built and switched off until Kulka names who receives them." },
      { date: null, title: "Suggested replies to client questions that a person reviews and releases", status: "waiting", note: "The data structure is ready. It gets its own spec later." },
      { date: null, title: "Private questions that only Kulka and the asker can see", status: "waiting", note: "Every reader on a project sees every thread for now." },
      { date: null, title: "A web-based living proposal to follow the PDF", status: "waiting", note: "A later client document, separate from version 1." },
    ],
  },
];
