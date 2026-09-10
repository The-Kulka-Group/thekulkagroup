import type {DiscoveryRunOutcome} from "./discovery";

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  dateStyle: "short",
  timeStyle: "medium",
  timeZone: "America/New_York",
});
export function visionDate(value: string) { return DATE.format(new Date(value)); }

export const SOURCE_RUN_OUTCOME_LABELS: Readonly<Record<DiscoveryRunOutcome, string>> = {
  completed: "Completed",
  completed_empty: "Completed with no records",
  skipped: "Skipped",
  blocked: "Blocked",
  failed: "Failed",
};

export function visionDateTime(value: string | null | undefined) {
  return value ? DATE_TIME.format(new Date(value)) : "Not checked yet";
}

export const WORKFLOW_LABELS = {undecided:"Needs a decision",watching:"Watching",pursuing:"Pursuing",passed:"Passed",won:"Won",lost:"Lost"} as const;
export function visionToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const part = (type:string) => parts.find(item=>item.type===type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
