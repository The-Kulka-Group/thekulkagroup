import type { PublishedBudgetRecord } from "@/lib/rom/published-budgets";

// LA-1419. What the version list on a saved budget shows. Pure, so the list
// and its tests share it. The states follow what the link itself shows
// (loadPublishedBudget): a withdrawn version reads as withdrawn, a version
// with a newer open version reads as superseded, and the newest open one is
// current.

export type VersionState = "current" | "superseded" | "withdrawn";

export type VersionRow = {
  id: string;
  version: number;
  token: string;
  state: VersionState;
  issuedOn: string;
  /** The date a withdrawn version was withdrawn, or null. */
  withdrawnOn: string | null;
};

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

/** "Sep 29, 2026", pinned to Eastern so the server and the browser print the same day. */
export function issuedLabel(iso: string): string {
  return DATE.format(new Date(iso));
}

/** The address a client opens. `origin` is empty before the browser has said what it is. */
export function linkFor(origin: string, token: string): string {
  return `${origin}/b/${token}`;
}

export function versionList(records: readonly PublishedBudgetRecord[]): VersionRow[] {
  const newestFirst = [...records].sort((a, b) => b.version - a.version);
  return newestFirst.map((record) => {
    const newerOpen = newestFirst.some((other) => other.version > record.version && other.revokedAt === null);
    const state: VersionState = record.revokedAt !== null ? "withdrawn" : newerOpen ? "superseded" : "current";
    return {
      id: record.id,
      version: record.version,
      token: record.token,
      state,
      issuedOn: issuedLabel(record.issuedAt),
      withdrawnOn: record.revokedAt === null ? null : issuedLabel(record.revokedAt),
    };
  });
}
