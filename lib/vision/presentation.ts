const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export function visionDate(value: string) { return DATE.format(new Date(value)); }
