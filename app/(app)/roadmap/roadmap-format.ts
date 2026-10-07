// Formats in UTC so the server render and the browser agree on the day.
export function formatRoadmapDate(iso: string, withYear = false): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}
