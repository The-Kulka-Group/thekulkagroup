import type { ListedPublishedBudget, VersionState } from "@/lib/rom/published-budgets";

// LA-1419. What the version list on a saved budget shows. Pure, so the list
// and its tests share it. Each version's state and full link come from the
// server (GET /api/rom/projects/[id]/published): the state by the rule the
// link itself follows (versionState in lib/rom/published-budgets.ts), the
// link from KULKA_SITE_URL.

export type { VersionState };

/** One version as the list route returns it. */
export type ListedVersion = ListedPublishedBudget & { link: string };

export type VersionRow = {
  id: string;
  version: number;
  token: string;
  state: VersionState;
  /** The full address a client opens, built on the server. */
  link: string;
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

/** The address a client opens, from the site's origin. The list and publish routes build it. */
export function linkFor(origin: string, token: string): string {
  return `${origin}/b/${token}`;
}

export function versionList(records: readonly ListedVersion[]): VersionRow[] {
  const newestFirst = [...records].sort((a, b) => b.version - a.version);
  return newestFirst.map((record) => {
    return {
      id: record.id,
      version: record.version,
      token: record.token,
      state: record.state,
      link: record.link,
      issuedOn: issuedLabel(record.issuedAt),
      withdrawnOn: record.revokedAt === null ? null : issuedLabel(record.revokedAt),
    };
  });
}
