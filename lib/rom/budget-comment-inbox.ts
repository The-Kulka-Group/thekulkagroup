import type { Db } from "@/lib/db";
import { isUuid } from "@/lib/uuid";

import type { CommentAnchor, CommentKind, FlagOutcome, MessageAuthor, MessageVisibility, ThreadStatus } from "./budget-comments";
import { toIso } from "./date";
import { versionState, type VersionState } from "./published-budgets";
import { holdsElement, newestOpenElements } from "./thread-carry";

// LA-1490, ticket 7 of LA-1480 (spec docs/precon/client-comments-spec.md,
// Decisions 3 and 4). The reads behind Kulka's side of client comments: the
// threads that need Kulka (Home and the Rail count) and every thread on a
// project grouped by version (the Client Comments panel). The writes are in
// budget-comments.ts. Nothing here changes a row.
//
// A thread needs Kulka when it is open and the last message a client can see
// came from a reader. A flag opened with only a correction has no message
// yet, so it needs Kulka too. Internal notes and hidden messages do not count
// as a reply: an internal note tells the client nothing.

type Stamp = Date | string;

const NEEDS_KULKA = `
  t.status = 'open'
  and (last.author_kind is null or last.author_kind = 'reader')`;

// The last message the client can see, or none.
const LAST_VISIBLE = `
  left join lateral (
    select m.author_kind, m.reader_id, m.body, m.removed_at, m.created_at
      from budget_messages m
     where m.thread_id = t.id and m.visibility = 'client' and m.hidden_at is null
     order by m.created_at desc, m.id desc
     limit 1
  ) last on true`;

/** How many threads need Kulka, for the Rail. */
export async function countThreadsNeedingKulka(db: Db): Promise<number> {
  const { rows } = await db.query<{ n: number | string }>(
    `select count(*) as n from budget_threads t ${LAST_VISIBLE} where ${NEEDS_KULKA}`,
  );
  return Number(rows[0]?.n ?? 0);
}

export type NeedsKulka = {
  threadId: string;
  projectId: string;
  projectName: string;
  version: number;
  /** The version's Prepared By, the default for Reply As. */
  preparedBy: string | null;
  kind: CommentKind;
  /** The one sentence Home shows. */
  sentence: string;
  /** When the client last wrote, ISO. */
  at: string;
  /** What the client last said, or null when the writer asked for removal or the thread has no message yet. */
  said: string | null;
  /** A flag's correction, as "What It Should Be". */
  proposed: string | null;
  /** What the page showed on the element: the "Budget Says" side of a flag. */
  budgetSays: string | null;
};

type NeedsRow = {
  id: string;
  project_id: string;
  project_name: string;
  version: number | string;
  prepared_by: string | null;
  kind: CommentKind;
  element_id: string;
  anchor: CommentAnchor | string;
  proposed: string | null;
  opened_at: Stamp;
  opener_name: string;
  opener_company: string | null;
  last_name: string | null;
  last_company: string | null;
  last_body: string | null;
  last_at: Stamp | null;
  visible_count: number | string;
};

const parseAnchor = (value: CommentAnchor | string): CommentAnchor =>
  typeof value === "string" ? (JSON.parse(value) as CommentAnchor) : value;

/** "Dan Reyes at Fieldstone", or just the name when the reader has no company. */
export function whoWords(name: string, company: string | null): string {
  return company ? `${name} at ${company}` : name;
}

/** What the reader's words were about, in a sentence: the element's label, or the whole page. */
export function aboutWords(elementId: string, anchor: CommentAnchor): string {
  if (elementId === "page:general") return "the budget as a whole";
  const label = anchor.label?.trim();
  return label ? label : "an item";
}

/**
 * The sentence Home shows: "Dan Reyes at Fieldstone asked about Structure
 * Demolition on Version 2." A reply to Kulka's own message reads "replied
 * about", whatever the thread's kind.
 */
export function needsKulkaSentence(input: {
  who: string;
  kind: CommentKind;
  about: string;
  version: number;
  followUp: boolean;
}): string {
  const verb = input.followUp
    ? "replied about"
    : input.kind === "question"
      ? "asked about"
      : input.kind === "flag"
        ? "flagged"
        : "commented on";
  return `${input.who} ${verb} ${input.about} on Version ${input.version}.`;
}

/**
 * Every thread that needs Kulka, newest first. With `threadId`, only that
 * thread, and none when it does not need Kulka.
 */
export async function listThreadsNeedingKulka(db: Db, threadId?: string): Promise<NeedsKulka[]> {
  if (threadId !== undefined && !isUuid(threadId)) return [];
  const { rows } = await db.query<NeedsRow>(
    `select t.id, t.project_id, p.name as project_name, pb.version,
            pb.snapshot->'copy'->>'preparedBy' as prepared_by,
            t.kind, t.element_id, t.anchor, t.proposed, t.opened_at,
            opener.name as opener_name, opener.company as opener_company,
            lr.name as last_name, lr.company as last_company,
            last.body as last_body, last.created_at as last_at,
            (select count(*) from budget_messages c
              where c.thread_id = t.id and c.visibility = 'client' and c.hidden_at is null) as visible_count
       from budget_threads t
       join projects p on p.id = t.project_id
       join published_budgets pb on pb.id = t.published_budget_id
       join budget_readers opener on opener.id = t.opened_by
       ${LAST_VISIBLE}
       left join budget_readers lr on lr.id = last.reader_id
      where ${NEEDS_KULKA}${threadId === undefined ? "" : " and t.id = $1"}
      order by coalesce(last.created_at, t.opened_at) desc, t.id`,
    threadId === undefined ? [] : [threadId],
  );
  return rows.map((row) => {
    const anchor = parseAnchor(row.anchor);
    const version = Number(row.version);
    const followUp = Number(row.visible_count) > 1;
    return {
      threadId: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      version,
      preparedBy: row.prepared_by,
      kind: row.kind,
      sentence: needsKulkaSentence({
        who: whoWords(row.last_name ?? row.opener_name, row.last_name ? row.last_company : row.opener_company),
        kind: row.kind,
        about: aboutWords(row.element_id, anchor),
        version,
        followUp,
      }),
      at: toIso(row.last_at ?? row.opened_at),
      said: row.last_body,
      proposed: row.proposed,
      budgetSays: anchorSays(anchor),
    };
  });
}

/** The words or figure the page showed on the element. */
function anchorSays(anchor: CommentAnchor): string | null {
  const text = anchor.text?.trim() || anchor.figure?.trim() || "";
  return text === "" ? null : text;
}

// The panel's read: every thread on a project, grouped by version.

export type PanelMessage = {
  id: string;
  authorKind: MessageAuthor;
  /** A reader's name, or the name a staff member replied as. */
  author: string;
  company: string | null;
  visibility: MessageVisibility;
  /** Null once the writer asked for removal. */
  body: string | null;
  createdAt: string;
  hidden: boolean;
  removed: boolean;
};

export type PanelThread = {
  id: string;
  kind: CommentKind;
  status: ThreadStatus;
  outcome: FlagOutcome | null;
  elementId: string;
  /** The element's label as the page showed it. */
  label: string;
  /** The words or figure the page showed, the "Budget Says" side of a flag. */
  budgetSays: string | null;
  proposed: string | null;
  proposedRemoved: boolean;
  openedAt: string;
  reader: { name: string; company: string | null };
  /** Open, and the last client-visible message came from a reader. */
  needsKulka: boolean;
  /** The reader's latest post came from a device that reader had not used before. */
  newDevice: boolean;
  /** The newest open version, when it no longer holds this thread's element and the thread is not closed. */
  elementMissingIn: number | null;
  messages: PanelMessage[];
};

export type PanelVersion = {
  id: string;
  version: number;
  state: VersionState;
  preparedBy: string | null;
  threads: PanelThread[];
};

export type ProjectComments = {
  /** The newest open version's Prepared By, the default for Reply As. */
  defaultReplyAs: string | null;
  needsKulka: number;
  versions: PanelVersion[];
};

type VersionRow = {
  id: string;
  version: number | string;
  revoked_at: Stamp | null;
  issued_at: Stamp;
  prepared_by: string | null;
};

type ThreadRow = {
  id: string;
  published_budget_id: string;
  kind: CommentKind;
  status: ThreadStatus;
  outcome: FlagOutcome | null;
  element_id: string;
  anchor: CommentAnchor | string;
  proposed: string | null;
  proposed_removed_at: Stamp | null;
  opened_at: Stamp;
  reader_name: string;
  reader_company: string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  author_kind: MessageAuthor;
  reader_id: string | null;
  device_id: string | null;
  staff_name: string | null;
  reader_name: string | null;
  reader_company: string | null;
  body: string | null;
  visibility: MessageVisibility;
  created_at: Stamp;
  hidden_at: Stamp | null;
  removed_at: Stamp | null;
};

/**
 * Every thread on a project, grouped by version (newest first), each with the
 * markers the panel shows. Internal notes are included, since this is Kulka's
 * view. Returns an empty list for a project with no comments.
 */
export async function listProjectComments(db: Db, projectId: string): Promise<ProjectComments> {
  if (!isUuid(projectId)) return { defaultReplyAs: null, needsKulka: 0, versions: [] };

  const { rows: versionRows } = await db.query<VersionRow>(
    `select id, version, revoked_at, issued_at, snapshot->'copy'->>'preparedBy' as prepared_by
       from published_budgets where project_id = $1 order by version desc`,
    [projectId],
  );
  const versions = versionRows.map((row) => ({
    id: row.id,
    version: Number(row.version),
    revoked: row.revoked_at !== null,
    issuedAt: toIso(row.issued_at),
    preparedBy: row.prepared_by,
  }));
  const newestOpen = versions.find((v) => !v.revoked) ?? null;

  const { rows: threadRows } = await db.query<ThreadRow>(
    `select t.id, t.published_budget_id, t.kind, t.status, t.outcome, t.element_id, t.anchor,
            t.proposed, t.proposed_removed_at, t.opened_at,
            r.name as reader_name, r.company as reader_company
       from budget_threads t
       join budget_readers r on r.id = t.opened_by
      where t.project_id = $1
      order by t.opened_at, t.id`,
    [projectId],
  );
  const { rows: messageRows } = await db.query<MessageRow>(
    `select m.id, m.thread_id, m.author_kind, m.reader_id, m.device_id, m.staff_name,
            r.name as reader_name, r.company as reader_company,
            m.body, m.visibility, m.created_at, m.hidden_at, m.removed_at
       from budget_messages m
       join budget_threads t on t.id = m.thread_id
       left join budget_readers r on r.id = m.reader_id
      where t.project_id = $1
      order by m.created_at, m.id`,
    [projectId],
  );

  // The first message each reader posts from a device marks it as that
  // reader's. A later first sighting of another device is the new one.
  const devicesSeen = new Map<string, Set<string>>();
  const newDeviceMessage = new Set<string>();
  for (const m of messageRows) {
    if (m.author_kind !== "reader" || !m.reader_id || !m.device_id) continue;
    const seen = devicesSeen.get(m.reader_id) ?? new Set<string>();
    if (seen.size > 0 && !seen.has(m.device_id)) newDeviceMessage.add(m.id);
    seen.add(m.device_id);
    devicesSeen.set(m.reader_id, seen);
  }

  const messagesByThread = new Map<string, MessageRow[]>();
  for (const m of messageRows) messagesByThread.set(m.thread_id, [...(messagesByThread.get(m.thread_id) ?? []), m]);

  // Which elements the newest open version still holds, read only when an
  // older version has a thread still waiting on Kulka.
  const needsElements = newestOpen
    ? threadRows.some(
        (t) => t.status !== "closed" && t.published_budget_id !== newestOpen.id && t.element_id !== "page:general",
      )
    : false;
  const newestElements = needsElements ? ((await newestOpenElements(db, projectId))?.elements ?? null) : null;

  const threadsByVersion = new Map<string, PanelThread[]>();
  for (const row of threadRows) {
    const anchor = parseAnchor(row.anchor);
    const messages = messagesByThread.get(row.id) ?? [];
    const lastVisible = [...messages].reverse().find((m) => m.visibility === "client" && m.hidden_at === null);
    const lastReader = [...messages].reverse().find((m) => m.author_kind === "reader");
    const missing =
      row.status !== "closed" &&
      newestOpen !== null &&
      row.published_budget_id !== newestOpen.id &&
      newestElements !== null &&
      !holdsElement(newestElements, row.element_id, anchor);
    const thread: PanelThread = {
      id: row.id,
      kind: row.kind,
      status: row.status,
      outcome: row.outcome,
      elementId: row.element_id,
      label: row.element_id === "page:general" ? "The Budget as a Whole" : anchor.label?.trim() || "An Item",
      budgetSays: anchorSays(anchor),
      proposed: row.proposed,
      proposedRemoved: row.proposed_removed_at !== null,
      openedAt: toIso(row.opened_at),
      reader: { name: row.reader_name, company: row.reader_company },
      needsKulka: row.status === "open" && (!lastVisible || lastVisible.author_kind === "reader"),
      newDevice: lastReader !== undefined && newDeviceMessage.has(lastReader.id),
      elementMissingIn: missing && newestOpen ? newestOpen.version : null,
      messages: messages.map((m) => ({
        id: m.id,
        authorKind: m.author_kind,
        author: m.author_kind === "reader" ? (m.reader_name ?? "A Reader") : (m.staff_name ?? "Kulka"),
        company: m.author_kind === "reader" ? m.reader_company : null,
        visibility: m.visibility,
        body: m.body,
        createdAt: toIso(m.created_at),
        hidden: m.hidden_at !== null,
        removed: m.removed_at !== null,
      })),
    };
    threadsByVersion.set(row.published_budget_id, [...(threadsByVersion.get(row.published_budget_id) ?? []), thread]);
  }

  const panelVersions: PanelVersion[] = versions
    .map((v) => ({
      id: v.id,
      version: v.version,
      state: versionState({
        revoked: v.revoked,
        newerOpen: versions.some((other) => other.version > v.version && !other.revoked),
      }),
      preparedBy: v.preparedBy,
      // Newest thread first, so what just arrived leads.
      threads: (threadsByVersion.get(v.id) ?? []).sort((a, b) => b.openedAt.localeCompare(a.openedAt)),
    }))
    .filter((v) => v.threads.length > 0);

  return {
    defaultReplyAs: newestOpen?.preparedBy ?? versions[0]?.preparedBy ?? null,
    needsKulka: panelVersions.reduce((n, v) => n + v.threads.filter((t) => t.needsKulka).length, 0),
    versions: panelVersions,
  };
}
