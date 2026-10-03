import type { Db } from "@/lib/db";
import { isUuid } from "@/lib/uuid";

import { GENERAL_COMMENT_ID, addressableElements, type AddressableElement } from "./addressable-elements";
import type { CommentAnchor, CommentKind, FlagOutcome, MessageAuthor, ThreadStatus } from "./budget-comments";
import { toIso } from "./date";
import { presentBudget } from "./presentation";
import { versionState, type VersionState } from "./published-budgets";
import type { PublishedBudgetSnapshot, PublishedStage } from "./published-snapshot";

// LA-1491, ticket 8 of LA-1480 (spec docs/precon/client-comments-spec.md,
// "The version and orphan rule"). Which threads a version's page shows, and
// where. `publishBudget` sets `addressed_in` on accepted flags; this file
// reads the result.
//
//   - A version's page always shows the threads posted on it, in every state.
//   - The newest open version also shows every thread from an earlier version
//     that is not closed, and every accepted flag carried into it. Each sits
//     on the element with the same id and reads "From Version N". When the
//     anchor's words or figure differ from the new page's, it also reads
//     "Changed Since Version N" and keeps both values.
//   - A carried thread whose id the new page does not hold is never moved to
//     a guessed element. It goes to the From Earlier Versions list. A note
//     carries only when the new page shows the anchor's exact words.
//
// `placeThreads` is pure, so the client page and the internal panel follow
// one rule. `listPageThreads` reads it from the database for one version.

export type CarryThread = {
  id: string;
  publishedBudgetId: string;
  /** The version the thread was posted on. */
  version: number;
  elementId: string;
  anchor: CommentAnchor;
  status: ThreadStatus;
  outcome: FlagOutcome | null;
  addressedIn: string | null;
};

export type PageVersion = {
  id: string;
  version: number;
  /** True for the project's newest version that is not withdrawn. Only it takes carried threads. */
  newestOpen: boolean;
  elements: ReadonlyMap<string, AddressableElement>;
};

/** What the anchor said, and what the new page says on the same element. */
export type AnchorChange = {
  was: { text: string | null; figure: string | null };
  now: { text: string | null; figure: string | null };
};

export type Placement<T extends CarryThread = CarryThread> = {
  thread: T;
  /** "From Version N": set on a thread posted on an earlier version. */
  fromVersion: number | null;
  /** "Changed Since Version N": set on a carried thread whose element now reads differently. */
  changed: AnchorChange | null;
  /** "Carried Into Version N": set on an accepted flag this version addressed. */
  carriedInto: number | null;
};

export type PagePlacement<T extends CarryThread = CarryThread> = {
  /** Threads on an element this page holds, keyed by its id. `page:general` included. */
  onElements: Map<string, Placement<T>[]>;
  /** Carried threads whose element this page does not hold, oldest first. */
  fromEarlierVersions: Placement<T>[];
};

const words = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

/**
 * True when `elements` holds the thread's element. A note's id is a hash of
 * the run's words, so it is held only when the page also shows the anchor's
 * exact words; a rewritten note orphans its thread.
 */
export function holdsElement(elements: ReadonlyMap<string, AddressableElement>, elementId: string, anchor: CommentAnchor): boolean {
  if (elementId === GENERAL_COMMENT_ID) return true;
  const element = elements.get(elementId);
  if (!element) return false;
  if (element.kind === "note") return words(element.text) === words(anchor.text);
  return true;
}

function changeOf(element: AddressableElement | undefined, anchor: CommentAnchor): AnchorChange | null {
  if (!element || element.id === GENERAL_COMMENT_ID) return null;
  const was = { text: words(anchor.text), figure: words(anchor.figure) };
  const now = { text: words(element.text), figure: words(element.figure) };
  return was.text === now.text && was.figure === now.figure ? null : { was, now };
}

/** True when the page shows this thread: its own threads, and on the newest open version the carried ones. */
function shows(thread: CarryThread, page: PageVersion): boolean {
  if (thread.publishedBudgetId === page.id) return true;
  if (!page.newestOpen || thread.version >= page.version) return false;
  return thread.status !== "closed" || thread.addressedIn === page.id;
}

/** Sorts the threads a version's page shows onto its elements and into the From Earlier Versions list. */
export function placeThreads<T extends CarryThread>(page: PageVersion, threads: readonly T[]): PagePlacement<T> {
  const onElements = new Map<string, Placement<T>[]>();
  const fromEarlierVersions: Placement<T>[] = [];

  for (const thread of threads) {
    if (!shows(thread, page)) continue;
    const own = thread.publishedBudgetId === page.id;
    if (own) {
      onElements.set(thread.elementId, [
        ...(onElements.get(thread.elementId) ?? []),
        { thread, fromVersion: null, changed: null, carriedInto: null },
      ]);
      continue;
    }
    const carriedInto = thread.addressedIn === page.id ? page.version : null;
    if (!holdsElement(page.elements, thread.elementId, thread.anchor)) {
      fromEarlierVersions.push({ thread, fromVersion: thread.version, changed: null, carriedInto });
      continue;
    }
    onElements.set(thread.elementId, [
      ...(onElements.get(thread.elementId) ?? []),
      {
        thread,
        fromVersion: thread.version,
        changed: changeOf(page.elements.get(thread.elementId), thread.anchor),
        carriedInto,
      },
    ]);
  }
  return { onElements, fromEarlierVersions };
}

// The database read for one version's page.

type Stamp = Date | string;

type VersionRow = {
  id: string;
  version: number | string;
  stage: PublishedStage;
  issued_at: Stamp;
  revoked_at: Stamp | null;
  snapshot: PublishedBudgetSnapshot;
};

/** A version's page model and its addressable elements, read from `published_budgets`. */
export function elementsOfSnapshot(row: {
  version: number;
  stage: PublishedStage;
  issuedAt: string;
  snapshot: PublishedBudgetSnapshot;
}): ReadonlyMap<string, AddressableElement> {
  const page = presentBudget({ snapshot: row.snapshot, version: row.version, stage: row.stage, issuedAt: row.issuedAt, newer: null });
  return addressableElements(page);
}

/** The project's versions, newest first, and which one is newest among those not withdrawn. */
async function versionsOf(db: Db, projectId: string): Promise<{ rows: VersionRow[]; newestOpenId: string | null }> {
  const { rows } = await db.query<VersionRow>(
    `select id, version, stage, issued_at, revoked_at, snapshot
       from published_budgets where project_id = $1 order by version desc`,
    [projectId],
  );
  return { rows, newestOpenId: rows.find((r) => r.revoked_at === null)?.id ?? null };
}

/** The elements of a project's newest open version, or null when every version is withdrawn. */
export async function newestOpenElements(
  db: Db,
  projectId: string,
): Promise<{ id: string; version: number; elements: ReadonlyMap<string, AddressableElement> } | null> {
  const { rows, newestOpenId } = await versionsOf(db, projectId);
  const row = rows.find((r) => r.id === newestOpenId);
  if (!row) return null;
  const version = Number(row.version);
  return {
    id: row.id,
    version,
    elements: elementsOfSnapshot({ version, stage: row.stage, issuedAt: toIso(row.issued_at), snapshot: row.snapshot }),
  };
}

export type PageMessage = {
  id: string;
  authorKind: MessageAuthor;
  /** A reader's name, or the name a staff member replied as. Never an email. */
  author: string;
  company: string | null;
  /** Null once the writer asked for removal: "Removed at the Writer's Request". */
  body: string | null;
  createdAt: string;
};

export type PageThread = CarryThread & {
  kind: CommentKind;
  proposed: string | null;
  openedAt: string;
  reader: { name: string; company: string | null };
  /** What a client may read: no internal notes, drafts or hidden messages. */
  messages: PageMessage[];
};

export type PageThreads = {
  version: number;
  state: VersionState;
} & PagePlacement<PageThread>;

type ThreadRow = {
  id: string;
  published_budget_id: string;
  version: number | string;
  element_id: string;
  anchor: CommentAnchor | string;
  kind: CommentKind;
  proposed: string | null;
  status: ThreadStatus;
  outcome: FlagOutcome | null;
  addressed_in: string | null;
  opened_at: Stamp;
  reader_name: string;
  reader_company: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  author_kind: MessageAuthor;
  staff_name: string | null;
  reader_name: string | null;
  reader_company: string | null;
  body: string | null;
  created_at: Stamp;
};

/**
 * The threads one version's page shows, placed by the carry rule, with only
 * what a client may read. Null for an unknown version. A withdrawn version
 * shows its own threads only, as does a superseded one.
 */
export async function listPageThreads(db: Db, publishedBudgetId: string): Promise<PageThreads | null> {
  if (!isUuid(publishedBudgetId)) return null;
  const { rows: found } = await db.query<{ project_id: string }>(`select project_id from published_budgets where id = $1`, [
    publishedBudgetId,
  ]);
  if (!found[0]) return null;
  const projectId = found[0].project_id;

  const { rows: versions, newestOpenId } = await versionsOf(db, projectId);
  const row = versions.find((v) => v.id === publishedBudgetId) as VersionRow;
  const version = Number(row.version);
  const state = versionState({
    revoked: row.revoked_at !== null,
    newerOpen: versions.some((v) => Number(v.version) > version && v.revoked_at === null),
  });
  const newestOpen = newestOpenId === publishedBudgetId;

  const { rows: threadRows } = await db.query<ThreadRow>(
    `select t.id, t.published_budget_id, pb.version, t.element_id, t.anchor, t.kind, t.proposed,
            t.status, t.outcome, t.addressed_in, t.opened_at,
            r.name as reader_name, r.company as reader_company
       from budget_threads t
       join published_budgets pb on pb.id = t.published_budget_id
       join budget_readers r on r.id = t.opened_by
      where t.project_id = $1
        and (t.published_budget_id = $2
             or ($3::boolean and pb.version < $4 and (t.status <> 'closed' or t.addressed_in = $2)))
      order by t.opened_at, t.id`,
    [projectId, publishedBudgetId, newestOpen, version],
  );
  const ids = threadRows.map((t) => t.id);
  const { rows: messageRows } =
    ids.length === 0
      ? { rows: [] as MessageRow[] }
      : await db.query<MessageRow>(
          `select m.id, m.thread_id, m.author_kind, m.staff_name,
                  r.name as reader_name, r.company as reader_company, m.body, m.created_at
             from budget_messages m
             left join budget_readers r on r.id = m.reader_id
            where m.thread_id = any($1::uuid[]) and m.visibility = 'client' and m.hidden_at is null
            order by m.created_at, m.id`,
          [ids],
        );
  const messages = new Map<string, PageMessage[]>();
  for (const m of messageRows) {
    messages.set(m.thread_id, [
      ...(messages.get(m.thread_id) ?? []),
      {
        id: m.id,
        authorKind: m.author_kind,
        author: m.author_kind === "reader" ? (m.reader_name ?? "A Reader") : (m.staff_name ?? "Kulka"),
        company: m.author_kind === "reader" ? m.reader_company : null,
        body: m.body,
        createdAt: toIso(m.created_at),
      },
    ]);
  }

  const threads: PageThread[] = threadRows.map((t) => ({
    id: t.id,
    publishedBudgetId: t.published_budget_id,
    version: Number(t.version),
    elementId: t.element_id,
    anchor: typeof t.anchor === "string" ? (JSON.parse(t.anchor) as CommentAnchor) : t.anchor,
    kind: t.kind,
    proposed: t.proposed,
    status: t.status,
    outcome: t.outcome,
    addressedIn: t.addressed_in,
    openedAt: toIso(t.opened_at),
    reader: { name: t.reader_name, company: t.reader_company },
    messages: messages.get(t.id) ?? [],
  }));

  // Only a page that takes carried threads needs its elements read.
  const carries = threads.some((t) => t.publishedBudgetId !== publishedBudgetId);
  const elements = carries
    ? elementsOfSnapshot({ version, stage: row.stage, issuedAt: toIso(row.issued_at), snapshot: row.snapshot })
    : new Map<string, AddressableElement>();
  return { version, state, ...placeThreads({ id: publishedBudgetId, version, newestOpen, elements }, threads) };
}
