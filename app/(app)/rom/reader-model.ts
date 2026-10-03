import type { BudgetReader } from "@/lib/rom/budget-comments";

// LA-1486. What the reader list on the Publish panel shows. Pure, so the list
// and its tests share it. The route builds each link from the site's origin
// (KULKA_SITE_URL, else the request's own), and a revoked reader has none.

/** One reader as the readers route returns it: the record without its key, plus the link to copy. */
export type ListedReader = Omit<BudgetReader, "readerKey"> & { link: string | null };

/** The address a reader opens. It sets their cookie and sends them to the newest version. */
export function readerLinkFor(origin: string, readerKey: string): string {
  return `${origin}/b/r/${readerKey}`;
}

const DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

export type ReaderRow = {
  id: string;
  name: string;
  company: string | null;
  link: string | null;
  /** "Sep 29, 2026", the day the link was revoked, or null while it works. */
  revokedOn: string | null;
};

export function readerRows(readers: readonly ListedReader[]): ReaderRow[] {
  return readers.map((reader) => ({
    id: reader.id,
    name: reader.name,
    company: reader.company,
    link: reader.revokedAt === null ? reader.link : null,
    revokedOn: reader.revokedAt === null ? null : DATE.format(new Date(reader.revokedAt)),
  }));
}
