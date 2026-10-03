import type { Db } from "@/lib/db";
import { isUuid } from "@/lib/uuid";

import { toIso } from "./date";
import { isToken, newToken, versionState } from "./published-budgets";

// LA-1485, ticket 2 of LA-1480 (spec docs/precon/client-comments-spec.md,
// Decisions 2, 4 and 5). Comments, questions and assumption flags on a
// published budget. Every function takes a `Db`, runs its writes in one
// transaction, and leaves the rules the database can state to the triggers
// in 20261002010000_client_comment_tables.sql. This module adds the rules
// that need a lookup: who may act, which version still takes posts, which
// status a reply sets.
//
// What is not here, because a later ticket owns it: reading the reader cookie
// and the Origin header, checking that an element id exists in a version's
// page model, building the anchor from that model, the daily limits, and the
// carry and orphan rules at publish. The caller passes those results in.

export type CommentKind = "comment" | "question" | "flag";
export type ThreadStatus = "open" | "answered" | "closed";
export type FlagOutcome = "accepted" | "declined" | "withdrawn";
export type MessageAuthor = "reader" | "staff" | "ai";
export type MessageVisibility = "client" | "internal" | "draft";

export const MAX_BODY_CHARACTERS = 4000;

/** Why a call failed. A route answers `not_found` and `forbidden` with a plain 404 or 403 that does not say which check failed. */
export type CommentErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid"
  | "version_not_open"
  | "thread_closed"
  | "not_releasable";

export class BudgetCommentError extends Error {
  constructor(
    readonly code: CommentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "BudgetCommentError";
  }
}

function fail(code: CommentErrorCode, message: string): never {
  throw new BudgetCommentError(code, message);
}

export type BudgetReader = {
  id: string;
  projectId: string;
  readerKey: string;
  name: string;
  email: string;
  company: string | null;
  createdAt: string;
  createdBy: string;
  revokedAt: string | null;
};

/** What the page model said about the element when the thread was opened. */
export type CommentAnchor = {
  section?: string | null;
  label?: string | null;
  text?: string | null;
  figure?: string | null;
};

export type BudgetThread = {
  id: string;
  publishedBudgetId: string;
  projectId: string;
  elementId: string;
  anchor: CommentAnchor;
  kind: CommentKind;
  proposed: string | null;
  proposedRemovedAt: string | null;
  openedBy: string;
  openedAt: string;
  status: ThreadStatus;
  outcome: FlagOutcome | null;
  closedAt: string | null;
  closedByReader: string | null;
  closedByStaff: string | null;
  addressedIn: string | null;
};

export type BudgetMessage = {
  id: string;
  threadId: string;
  authorKind: MessageAuthor;
  readerId: string | null;
  staffName: string | null;
  staffAccount: string | null;
  /** Null once the writer asked for removal. */
  body: string | null;
  visibility: MessageVisibility;
  provenance: Record<string, unknown> | null;
  releasedAt: string | null;
  releasedBy: string | null;
  hiddenAt: string | null;
  hiddenBy: string | null;
  removedAt: string | null;
  removedBy: string | null;
  deviceId: string | null;
  createdAt: string;
};

type Stamp = Date | string;
const stamp = (value: Stamp | null) => (value === null ? null : toIso(value));

type ReaderRow = {
  id: string;
  project_id: string;
  reader_key: string;
  name: string;
  email: string;
  company: string | null;
  created_at: Stamp;
  created_by: string;
  revoked_at: Stamp | null;
};

const READER_COLUMNS = `id, project_id, reader_key, name, email, company, created_at, created_by, revoked_at`;

function readerFromRow(row: ReaderRow): BudgetReader {
  return {
    id: row.id,
    projectId: row.project_id,
    readerKey: row.reader_key,
    name: row.name,
    email: row.email,
    company: row.company,
    createdAt: toIso(row.created_at),
    createdBy: row.created_by,
    revokedAt: stamp(row.revoked_at),
  };
}

type ThreadRow = {
  id: string;
  published_budget_id: string;
  project_id: string;
  element_id: string;
  anchor: CommentAnchor | string;
  kind: CommentKind;
  proposed: string | null;
  proposed_removed_at: Stamp | null;
  opened_by: string;
  opened_at: Stamp;
  status: ThreadStatus;
  outcome: FlagOutcome | null;
  closed_at: Stamp | null;
  closed_by_reader: string | null;
  closed_by_staff: string | null;
  addressed_in: string | null;
};

const THREAD_COLUMNS = `id, published_budget_id, project_id, element_id, anchor, kind, proposed, proposed_removed_at, opened_by, opened_at, status, outcome, closed_at, closed_by_reader, closed_by_staff, addressed_in`;

function threadFromRow(row: ThreadRow): BudgetThread {
  return {
    id: row.id,
    publishedBudgetId: row.published_budget_id,
    projectId: row.project_id,
    elementId: row.element_id,
    anchor: typeof row.anchor === "string" ? (JSON.parse(row.anchor) as CommentAnchor) : row.anchor,
    kind: row.kind,
    proposed: row.proposed,
    proposedRemovedAt: stamp(row.proposed_removed_at),
    openedBy: row.opened_by,
    openedAt: toIso(row.opened_at),
    status: row.status,
    outcome: row.outcome,
    closedAt: stamp(row.closed_at),
    closedByReader: row.closed_by_reader,
    closedByStaff: row.closed_by_staff,
    addressedIn: row.addressed_in,
  };
}

type MessageRow = {
  id: string;
  thread_id: string;
  author_kind: MessageAuthor;
  reader_id: string | null;
  staff_name: string | null;
  staff_account: string | null;
  body: string | null;
  visibility: MessageVisibility;
  provenance: Record<string, unknown> | string | null;
  released_at: Stamp | null;
  released_by: string | null;
  hidden_at: Stamp | null;
  hidden_by: string | null;
  removed_at: Stamp | null;
  removed_by: string | null;
  device_id: string | null;
  created_at: Stamp;
};

const MESSAGE_COLUMNS = `id, thread_id, author_kind, reader_id, staff_name, staff_account, body, visibility, provenance, released_at, released_by, hidden_at, hidden_by, removed_at, removed_by, device_id, created_at`;

function messageFromRow(row: MessageRow): BudgetMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    authorKind: row.author_kind,
    readerId: row.reader_id,
    staffName: row.staff_name,
    staffAccount: row.staff_account,
    body: row.body,
    visibility: row.visibility,
    provenance: typeof row.provenance === "string" ? (JSON.parse(row.provenance) as Record<string, unknown>) : row.provenance,
    releasedAt: stamp(row.released_at),
    releasedBy: row.released_by,
    hiddenAt: stamp(row.hidden_at),
    hiddenBy: row.hidden_by,
    removedAt: stamp(row.removed_at),
    removedBy: row.removed_by,
    deviceId: row.device_id,
    createdAt: toIso(row.created_at),
  };
}

// Shape checks. The database checks the same shapes, so these only give a
// typed error before the insert instead of a constraint name.

const ELEMENT_ID = /^[a-z][a-z-]*:[A-Za-z0-9_.:-]+$/;
const EMAIL = /^[^@\s]+@[^@\s]+$/;
const ASSUMPTION_FAMILIES = new Set([
  "fact",
  "criterion",
  "note",
  "gate",
  "assumption",
  "inclusion",
  "exclusion",
  "raise",
]);

/** True when `value` has the shape of a `data-el` id, or `page:general`. */
export function isElementId(value: string): boolean {
  return ELEMENT_ID.test(value);
}

/**
 * True for the elements a client can correct with a flag: facts, criteria,
 * notes, gates and the drill-down's assumptions, inclusions, exclusions and
 * raises. A figure, total, markup, parameter or record takes comments and
 * questions only (spec Decision 4).
 */
export function isAssumptionElement(elementId: string): boolean {
  if (!isElementId(elementId)) return false;
  return ASSUMPTION_FAMILIES.has(elementId.slice(0, elementId.indexOf(":")));
}

function cleanText(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") fail("invalid", `${what} is required.`);
  return value.trim();
}

function cleanBody(value: unknown, what = "A message"): string {
  const text = cleanText(value, what);
  if (Array.from(text).length > MAX_BODY_CHARACTERS) {
    fail("invalid", `${what} is longer than ${MAX_BODY_CHARACTERS} characters.`);
  }
  return text;
}

function cleanDeviceId(value: string): string {
  if (!isToken(value)) fail("invalid", "The device id has the wrong shape.");
  return value;
}

function cleanId(value: string, what: string): string {
  if (!isUuid(value)) fail("not_found", `No ${what} ${String(value)}.`);
  return value;
}

// Readers

export type NewReader = {
  projectId: string;
  name: string;
  email: string;
  company?: string | null;
  /** Who added the reader: the signed-in email, or open-access@kulka.invalid. */
  createdBy: string;
};

/** Adds a person who may comment on a project, with a new unguessable reader key. */
export async function addReader(db: Db, input: NewReader): Promise<BudgetReader> {
  const name = cleanText(input.name, "A reader name");
  const email = cleanText(input.email, "A reader email");
  if (!EMAIL.test(email)) fail("invalid", "A reader email needs an @.");
  const createdBy = cleanText(input.createdBy, "createdBy");
  const company = input.company == null || input.company.trim() === "" ? null : input.company.trim();
  const projectId = cleanId(input.projectId, "project");

  const { rows: project } = await db.query<{ id: string }>(`select id from projects where id = $1`, [projectId]);
  if (project.length === 0) fail("not_found", `No project ${projectId}.`);

  const { rows } = await db.query<ReaderRow>(
    `insert into budget_readers (project_id, reader_key, name, email, company, created_by)
     values ($1, $2, $3, $4, $5, $6)
     returning ${READER_COLUMNS}`,
    [projectId, newToken(), name, email, company, createdBy],
  );
  return readerFromRow(rows[0]);
}

/** Revokes a reader link. The first revoke time stays if it is revoked again. Earlier posts stay under the reader's name. */
export async function revokeReader(db: Db, readerId: string): Promise<BudgetReader> {
  cleanId(readerId, "reader");
  const { rows } = await db.query<ReaderRow>(
    `update budget_readers set revoked_at = coalesce(revoked_at, now()) where id = $1 returning ${READER_COLUMNS}`,
    [readerId],
  );
  if (rows.length === 0) fail("not_found", `No reader ${readerId}.`);
  return readerFromRow(rows[0]);
}

/** The reader a key names, or null when the key is malformed, unknown or revoked. */
export async function findActiveReader(db: Db, readerKey: string): Promise<BudgetReader | null> {
  if (!isToken(readerKey)) return null;
  const { rows } = await db.query<ReaderRow>(
    `select ${READER_COLUMNS} from budget_readers where reader_key = $1 and revoked_at is null`,
    [readerKey],
  );
  return rows.length === 0 ? null : readerFromRow(rows[0]);
}

async function activeReaderOf(tx: Db, readerId: string, projectId: string): Promise<BudgetReader> {
  if (!isUuid(readerId)) fail("forbidden", "No such reader.");
  const { rows } = await tx.query<ReaderRow>(`select ${READER_COLUMNS} from budget_readers where id = $1`, [readerId]);
  const reader = rows[0];
  if (!reader || reader.revoked_at !== null || reader.project_id !== projectId) {
    fail("forbidden", "That reader cannot post here.");
  }
  return readerFromRow(reader);
}

// Threads

export type NewThread = {
  publishedBudgetId: string;
  readerId: string;
  /** The reader's device cookie, recorded on the opening post. */
  deviceId: string;
  /** A data-el id the caller found in the version's page model, or page:general. */
  elementId: string;
  /** Built by the caller from the page model, never from the request body. */
  anchor: CommentAnchor;
  kind: CommentKind;
  /** The opening post. Required for a comment or question, optional ("Why") for a flag. */
  body?: string | null;
  /** A flag's "What It Should Be". Required for a flag, not allowed otherwise. */
  proposed?: string | null;
};

/**
 * Opens a thread with its first message. The version must still take new
 * threads (not withdrawn, no newer open version), the reader must be active
 * and belong to the version's project, and a flag must sit on an assumption
 * element and carry a correction.
 */
export async function openThread(
  db: Db,
  input: NewThread,
): Promise<{ thread: BudgetThread; message: BudgetMessage | null }> {
  if (input.kind !== "comment" && input.kind !== "question" && input.kind !== "flag") {
    fail("invalid", "A thread is a comment, a question or a flag.");
  }
  if (!isElementId(input.elementId)) fail("invalid", "The element id has the wrong shape.");
  const anchor = input.anchor;
  if (typeof anchor !== "object" || anchor === null || Array.isArray(anchor)) {
    fail("invalid", "The anchor must be an object.");
  }
  const deviceId = cleanDeviceId(input.deviceId);

  let body: string | null = null;
  let proposed: string | null = null;
  if (input.kind === "flag") {
    if (!isAssumptionElement(input.elementId)) fail("invalid", "A flag goes on an assumption.");
    proposed = cleanText(input.proposed, "What It Should Be");
    if (input.body != null && input.body.trim() !== "") body = cleanBody(input.body);
  } else {
    if (input.proposed != null) fail("invalid", "Only a flag carries a correction.");
    body = cleanBody(input.body, "A comment or question");
  }
  const publishedBudgetId = cleanId(input.publishedBudgetId, "published budget");

  return db.withTransaction(async (tx) => {
    const { rows } = await tx.query<{ project_id: string; revoked_at: Stamp | null; newer_open: boolean }>(
      `select pb.project_id, pb.revoked_at,
              exists (
                select 1 from published_budgets later
                where later.project_id = pb.project_id
                  and later.version > pb.version
                  and later.revoked_at is null
              ) as newer_open
       from published_budgets pb
       where pb.id = $1`,
      [publishedBudgetId],
    );
    const version = rows[0];
    if (!version) fail("not_found", `No published budget ${publishedBudgetId}.`);
    if (versionState({ revoked: version.revoked_at !== null, newerOpen: version.newer_open }) !== "current") {
      fail("version_not_open", "This version no longer takes new threads.");
    }
    const reader = await activeReaderOf(tx, input.readerId, version.project_id);

    const { rows: opened } = await tx.query<ThreadRow>(
      `insert into budget_threads (published_budget_id, project_id, element_id, anchor, kind, proposed, opened_by)
       values ($1, $2, $3, $4::jsonb, $5, $6, $7)
       returning ${THREAD_COLUMNS}`,
      [publishedBudgetId, version.project_id, input.elementId, JSON.stringify(anchor), input.kind, proposed, reader.id],
    );
    const thread = threadFromRow(opened[0]);
    const message = body === null ? null : await insertReaderMessage(tx, thread.id, reader.id, deviceId, body);
    return { thread, message };
  });
}

async function insertReaderMessage(
  tx: Db,
  threadId: string,
  readerId: string,
  deviceId: string,
  body: string,
): Promise<BudgetMessage> {
  const { rows } = await tx.query<MessageRow>(
    `insert into budget_messages (thread_id, author_kind, reader_id, device_id, body, visibility)
     values ($1, 'reader', $2, $3, $4, 'client')
     returning ${MESSAGE_COLUMNS}`,
    [threadId, readerId, deviceId, body],
  );
  return messageFromRow(rows[0]);
}

export type StaffAuthor = {
  /** The name the client reads ("Reply As"). */
  name: string;
  /** The account that wrote it, open-access@kulka.invalid while sign-in is off. */
  account: string;
};

async function insertStaffMessage(
  tx: Db,
  threadId: string,
  staff: StaffAuthor,
  body: string,
  visibility: "client" | "internal",
): Promise<BudgetMessage> {
  const { rows } = await tx.query<MessageRow>(
    `insert into budget_messages (thread_id, author_kind, staff_name, staff_account, body, visibility)
     values ($1, 'staff', $2, $3, $4, $5)
     returning ${MESSAGE_COLUMNS}`,
    [threadId, cleanText(staff.name, "A staff name"), cleanText(staff.account, "A staff account"), body, visibility],
  );
  return messageFromRow(rows[0]);
}

async function lockThread(tx: Db, threadId: string): Promise<BudgetThread> {
  cleanId(threadId, "thread");
  const { rows } = await tx.query<ThreadRow>(`select ${THREAD_COLUMNS} from budget_threads where id = $1 for update`, [
    threadId,
  ]);
  if (rows.length === 0) fail("not_found", `No thread ${threadId}.`);
  return threadFromRow(rows[0]);
}

async function setStatus(tx: Db, threadId: string, status: ThreadStatus): Promise<BudgetThread> {
  const { rows } = await tx.query<ThreadRow>(
    `update budget_threads set status = $2 where id = $1 returning ${THREAD_COLUMNS}`,
    [threadId, status],
  );
  return threadFromRow(rows[0]);
}

export type Reply =
  | { threadId: string; author: "reader"; readerId: string; deviceId: string; body: string }
  | { threadId: string; author: "staff"; staff: StaffAuthor; body: string; internal?: boolean };

/**
 * Adds a message to an open or answered thread. A reader reply on an answered
 * thread opens it again. A client-visible Kulka reply on an open question
 * answers it. An internal note changes nothing. The thread can be on any
 * version: a carried thread takes replies on the original thread, and the
 * caller checks that the page the reader is on shows it.
 */
export async function replyToThread(
  db: Db,
  input: Reply,
): Promise<{ thread: BudgetThread; message: BudgetMessage }> {
  const body = cleanBody(input.body);
  const deviceId = input.author === "reader" ? cleanDeviceId(input.deviceId) : null;

  return db.withTransaction(async (tx) => {
    let thread = await lockThread(tx, input.threadId);
    if (thread.status === "closed") fail("thread_closed", "A closed thread takes no more messages.");

    if (input.author === "reader") {
      const reader = await activeReaderOf(tx, input.readerId, thread.projectId);
      const message = await insertReaderMessage(tx, thread.id, reader.id, deviceId as string, body);
      if (thread.status === "answered") thread = await setStatus(tx, thread.id, "open");
      return { thread, message };
    }

    const internal = input.internal === true;
    const message = await insertStaffMessage(tx, thread.id, input.staff, body, internal ? "internal" : "client");
    if (!internal && thread.kind === "question" && thread.status === "open") {
      thread = await setStatus(tx, thread.id, "answered");
    }
    return { thread, message };
  });
}

export type Closer =
  | { kind: "reader"; readerId: string }
  | { kind: "staff"; staff: StaffAuthor; outcome?: "accepted" | "declined"; reply?: string | null };

/**
 * Closes a thread. The reader who opened it may close a comment or question,
 * or withdraw their flag. Kulka may close any thread, and must give a flag an
 * outcome of accepted or declined. Declining needs a client-visible reply,
 * written in the same transaction so the owner always learns why. Closing
 * changes nothing in the budget (accepting a flag only records the answer).
 */
export async function closeThread(db: Db, input: { threadId: string; by: Closer }): Promise<BudgetThread> {
  const by = input.by;
  const reply = by.kind === "staff" && by.reply != null && by.reply.trim() !== "" ? cleanBody(by.reply, "A reply") : null;

  return db.withTransaction(async (tx) => {
    const thread = await lockThread(tx, input.threadId);
    if (thread.status === "closed") fail("thread_closed", "This thread is already closed.");

    if (by.kind === "reader") {
      const reader = await activeReaderOf(tx, by.readerId, thread.projectId);
      if (reader.id !== thread.openedBy) fail("forbidden", "Only the reader who opened a thread can close it.");
      return finishClose(tx, thread.id, {
        outcome: thread.kind === "flag" ? "withdrawn" : null,
        reader: reader.id,
        staff: null,
      });
    }

    if (thread.kind === "flag") {
      if (by.outcome !== "accepted" && by.outcome !== "declined") {
        fail("invalid", "Kulka closes a flag as accepted or declined.");
      }
      if (by.outcome === "declined" && reply === null) {
        fail("invalid", "Declining a flag needs a reply that tells the owner why.");
      }
    } else if (by.outcome !== undefined) {
      fail("invalid", "Only a flag has an outcome.");
    }
    const name = cleanText(by.staff.name, "A staff name");
    if (reply !== null) await insertStaffMessage(tx, thread.id, by.staff, reply, "client");
    return finishClose(tx, thread.id, {
      outcome: thread.kind === "flag" ? (by.outcome as "accepted" | "declined") : null,
      reader: null,
      staff: name,
    });
  });
}

async function finishClose(
  tx: Db,
  threadId: string,
  close: { outcome: FlagOutcome | null; reader: string | null; staff: string | null },
): Promise<BudgetThread> {
  const { rows } = await tx.query<ThreadRow>(
    `update budget_threads
     set status = 'closed', outcome = $2, closed_at = now(), closed_by_reader = $3, closed_by_staff = $4
     where id = $1
     returning ${THREAD_COLUMNS}`,
    [threadId, close.outcome, close.reader, close.staff],
  );
  return threadFromRow(rows[0]);
}

/**
 * Clears a flag's "What It Should Be" at the writer's request and keeps the
 * row. It works on a closed thread too. Removing twice, or on a thread that
 * never had a correction, fails.
 */
export async function removeProposed(db: Db, input: { threadId: string }): Promise<BudgetThread> {
  return db.withTransaction(async (tx) => {
    const thread = await lockThread(tx, input.threadId);
    if (thread.proposed === null) fail("invalid", "This thread has no correction to remove.");
    const { rows } = await tx.query<ThreadRow>(
      `update budget_threads set proposed = null, proposed_removed_at = now() where id = $1 returning ${THREAD_COLUMNS}`,
      [thread.id],
    );
    return threadFromRow(rows[0]);
  });
}

// Messages

async function lockMessage(tx: Db, messageId: string): Promise<BudgetMessage> {
  cleanId(messageId, "message");
  const { rows } = await tx.query<MessageRow>(
    `select ${MESSAGE_COLUMNS} from budget_messages where id = $1 for update`,
    [messageId],
  );
  if (rows.length === 0) fail("not_found", `No message ${messageId}.`);
  return messageFromRow(rows[0]);
}

async function updateMessage(tx: Db, sql: string, params: unknown[]): Promise<BudgetMessage> {
  const { rows } = await tx.query<MessageRow>(sql, params);
  return messageFromRow(rows[0]);
}

/**
 * Releases an AI draft to the client, signed by the person who released it.
 * It is a client-visible Kulka reply, so it answers an open question, the
 * same as a staff reply does.
 */
export async function releaseMessage(
  db: Db,
  input: { messageId: string; releasedBy: string },
): Promise<{ message: BudgetMessage; thread: BudgetThread }> {
  const releasedBy = cleanText(input.releasedBy, "releasedBy");
  return db.withTransaction(async (tx) => {
    const message = await lockMessage(tx, input.messageId);
    if (message.authorKind !== "ai" || message.visibility !== "draft" || message.removedAt !== null) {
      fail("not_releasable", "Only an unreleased AI draft can be released.");
    }
    let thread = await lockThread(tx, message.threadId);
    if (thread.status === "closed") fail("thread_closed", "A closed thread takes no more messages.");
    const released = await updateMessage(
      tx,
      `update budget_messages set visibility = 'client', released_at = now(), released_by = $2
       where id = $1 returning ${MESSAGE_COLUMNS}`,
      [message.id, releasedBy],
    );
    if (thread.kind === "question" && thread.status === "open") thread = await setStatus(tx, thread.id, "answered");
    return { message: released, thread };
  });
}

/** Takes a message off the client's page. The words stay in the database. Hiding twice fails. */
export async function hideMessage(db: Db, input: { messageId: string; hiddenBy: string }): Promise<BudgetMessage> {
  const hiddenBy = cleanText(input.hiddenBy, "hiddenBy");
  return db.withTransaction(async (tx) => {
    const message = await lockMessage(tx, input.messageId);
    if (message.hiddenAt !== null) fail("invalid", "This message is already hidden.");
    return updateMessage(
      tx,
      `update budget_messages set hidden_at = now(), hidden_by = $2 where id = $1 returning ${MESSAGE_COLUMNS}`,
      [message.id, hiddenBy],
    );
  });
}

/**
 * Removes a message's words at the writer's request. The row stays and reads
 * "Removed at the Writer's Request". Removing twice fails.
 */
export async function removeMessage(db: Db, input: { messageId: string; removedBy: string }): Promise<BudgetMessage> {
  const removedBy = cleanText(input.removedBy, "removedBy");
  return db.withTransaction(async (tx) => {
    const message = await lockMessage(tx, input.messageId);
    if (message.removedAt !== null) fail("invalid", "This message was already removed.");
    return updateMessage(
      tx,
      `update budget_messages set body = null, removed_at = now(), removed_by = $2
       where id = $1 returning ${MESSAGE_COLUMNS}`,
      [message.id, removedBy],
    );
  });
}

/** A thread and its messages, oldest first, or null. Every message is returned, internal and hidden ones included: the caller filters for the page. */
export async function loadThread(
  db: Db,
  threadId: string,
): Promise<{ thread: BudgetThread; messages: BudgetMessage[] } | null> {
  if (!isUuid(threadId)) return null;
  const { rows } = await db.query<ThreadRow>(`select ${THREAD_COLUMNS} from budget_threads where id = $1`, [threadId]);
  if (rows.length === 0) return null;
  const { rows: messages } = await db.query<MessageRow>(
    `select ${MESSAGE_COLUMNS} from budget_messages where thread_id = $1 order by created_at, id`,
    [threadId],
  );
  return { thread: threadFromRow(rows[0]), messages: messages.map(messageFromRow) };
}
