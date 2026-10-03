import type { Db } from "@/lib/db";
import { isUuid } from "@/lib/uuid";

import type { CommentAnchor } from "./budget-comments";
import { GENERAL_COMMENT_ID, type AddressableElement } from "./addressable-elements";
import { isToken, versionState, type VersionState } from "./published-budgets";

// LA-1487, ticket 4 of LA-1480 (spec docs/precon/client-comments-spec.md,
// "RLS and the checks on every request"). The lookups behind the reader
// routes under /b/<token>/threads. The routes own the HTTP side (cookies,
// Origin, status codes). This file owns the questions that need the database
// or the page model.

/** The cap on a reader post. It is its own constant, apart from the 1 MB one other routes share. */
export const MAX_READER_POST_BYTES = 8 * 1024;
/** Check 7: what one reader may do in a rolling 24 hours. */
export const MAX_THREADS_PER_DAY = 20;
export const MAX_MESSAGES_PER_DAY = 60;

export type VersionRef = {
  id: string;
  projectId: string;
  state: VersionState;
};

/** The published version a token names, or null for a malformed or unknown token. Check 1 reads its state. */
export async function findVersion(db: Db, token: string): Promise<VersionRef | null> {
  if (!isToken(token)) return null;
  const { rows } = await db.query<{
    id: string;
    project_id: string;
    revoked_at: Date | string | null;
    newer_open: boolean;
  }>(
    `select pb.id, pb.project_id, pb.revoked_at,
            exists (
              select 1 from published_budgets later
              where later.project_id = pb.project_id
                and later.version > pb.version
                and later.revoked_at is null
            ) as newer_open
     from published_budgets pb
     where pb.token = $1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    projectId: row.project_id,
    state: versionState({ revoked: row.revoked_at !== null, newerOpen: row.newer_open }),
  };
}

/**
 * Check 6. True when the thread is on this project and shows on this
 * version's page under the carry rule: every thread a version took shows on
 * its own page, and the newest open version also shows every thread on the
 * project that is not closed.
 */
export async function threadShowsOnVersion(db: Db, threadId: string, version: VersionRef): Promise<boolean> {
  if (!isUuid(threadId)) return false;
  const { rows } = await db.query<{ project_id: string; published_budget_id: string; status: string }>(
    `select project_id, published_budget_id, status from budget_threads where id = $1`,
    [threadId],
  );
  const thread = rows[0];
  if (!thread || thread.project_id !== version.projectId) return false;
  if (thread.published_budget_id === version.id) return true;
  return version.state === "current" && thread.status !== "closed";
}

/** Check 7. The rows a reader has posted in the last 24 hours. */
export async function postsInLastDay(db: Db, readerId: string): Promise<{ threads: number; messages: number }> {
  const { rows } = await db.query<{ threads: number | string; messages: number | string }>(
    `select
       (select count(*) from budget_threads where opened_by = $1 and opened_at > now() - interval '1 day') as threads,
       (select count(*) from budget_messages where reader_id = $1 and created_at > now() - interval '1 day') as messages`,
    [readerId],
  );
  return { threads: Number(rows[0].threads), messages: Number(rows[0].messages) };
}

/** What the page model said about the element, frozen beside the comment. `page:general` carries no section. */
export function anchorFor(element: AddressableElement): CommentAnchor {
  return {
    section: element.id === GENERAL_COMMENT_ID ? null : element.section,
    label: element.label,
    text: element.text,
    figure: element.figure,
  };
}
