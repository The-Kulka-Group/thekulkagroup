// Example data. Every name, date, and figure here is invented; DESIGN.md bans
// fabricated dollar figures and real client names in fixtures.

export type Status = "working" | "stuck" | "done" | "open";

export const STATUS_LABEL: Record<Status, string> = {
  working: "Working on it",
  stuck: "Stuck",
  done: "Done",
  open: "Not started",
};

export type Pursuit = {
  n: string;
  name: string;
  client: string;
  source: string;
  owner: string;
  due: string;
  late?: boolean;
  status: Status;
  stage: string;
};

export const STAGES = ["Qualifying", "Proposal out", "Award pending"] as const;

export const PURSUITS: Pursuit[] = [
  { n: "01", name: "Riverside Fit-Out, Level 3", client: "Hartwell Partners", source: "Architect referral", owner: "DM", due: "Sep 04", status: "working", stage: "Qualifying" },
  { n: "02", name: "Kearny Warehouse Shell", client: "Meridian Industrial", source: "Repeat client", owner: "DM", due: "Sep 18", status: "open", stage: "Qualifying" },
  { n: "03", name: "Tremont Avenue Facade", client: "Bergen Holdings", source: "Broker intro", owner: "AL", due: "Sep 25", status: "open", stage: "Qualifying" },
  { n: "04", name: "Ridgewood Medical Suite", client: "Calder Health", source: "Architect referral", owner: "JP", due: "Sep 11", status: "working", stage: "Qualifying" },
  { n: "05", name: "Ninth Avenue Core & Shell", client: "Ardmore Development", source: "Owner rep referral", owner: "AL", due: "Oct 02", status: "working", stage: "Proposal out" },
  { n: "06", name: "Palisades Retail Build-Out", client: "Foxglove Group", source: "Repeat client", owner: "JP", due: "Aug 19", late: true, status: "stuck", stage: "Proposal out" },
  { n: "07", name: "Harrison Street Interiors", client: "Calder Health", source: "Architect referral", owner: "AL", due: "Sep 29", status: "working", stage: "Proposal out" },
  { n: "08", name: "Fulton Street Lobby", client: "Bergen Holdings", source: "Broker intro", owner: "AL", due: "Aug 22", late: true, status: "stuck", stage: "Award pending" },
  { n: "09", name: "Grand Concourse Roof Replacement", client: "Ardmore Development", source: "Owner rep referral", owner: "JP", due: "Aug 21", late: true, status: "stuck", stage: "Award pending" },
];

export type Attention = {
  severity: "blown" | "waiting";
  sentence: string;
  key?: string;
  tail?: string;
  source: string;
  action: string;
};

export const ATTENTION: Attention[] = [
  { severity: "blown", sentence: "Foxglove Group proposal follow-up is ", key: "5 days past due", tail: ".", source: "P-101", action: "Open" },
  { severity: "blown", sentence: "No contact with Bergen Holdings in ", key: "60 days", tail: ", past the 45-day mark.", source: "C-042", action: "Open" },
  { severity: "waiting", sentence: "The brief for Thursday's Calder Health meeting is drafted and waiting for your review.", source: "B-217", action: "Review" },
  { severity: "waiting", sentence: "Kearny Warehouse Shell has no next step set.", source: "P-101", action: "Set one" },
];

export const THIS_WEEK = [
  { date: "Thu Aug 27", what: "Calder Health, quarterly check-in. The brief is drafted and waiting.", sheet: "B-217" },
  { date: "Fri Aug 28", what: "Fulton Street Lobby, award decision expected from Bergen Holdings.", sheet: "P-101" },
];

// One bright color per person, stable for life. In the real app this is a hash
// of the user id; here the example people are pinned so screenshots are stable.
export const OWNER_COLOR: Record<string, number> = { DM: 1, AL: 2, JP: 3, RK: 4 };
