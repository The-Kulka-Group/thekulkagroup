const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export function visionDate(value: string) { return DATE.format(new Date(value)); }

export const WORKFLOW_LABELS = {undecided:"Needs a decision",watching:"Watching",pursuing:"Pursuing",passed:"Passed",won:"Won",lost:"Lost"} as const;
export function visionToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(now);
  const part = (type:string) => parts.find(item=>item.type===type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
