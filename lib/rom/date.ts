// A Postgres timestamp column comes back from `pg`/PGlite as either a `Date`
// (the common case) or, in some drivers/paths, the raw string it parsed
// from -- these two idioms normalize either shape into what the API layer
// actually returns. Extracted in code review (2026-09-20): `toIso` was
// defined identically in both lib/rom/ingest.ts and lib/rom/issue.ts; this
// is the one copy both import from now.

export function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function toDateOnly(value: Date | string): string {
  return toIso(value).slice(0, 10);
}
