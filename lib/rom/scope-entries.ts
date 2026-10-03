import type { Db } from "@/lib/db";
import { toIso } from "@/lib/rom/date";
import type { StoredScopeEntry } from "@/lib/rom/line-details";

// LA-1503. Writing a line's Inclusions and Exclusions. An entry is drafted by
// AI (lib/rom/scope-draft.ts) or written by hand, and stays a draft until the
// estimator approves it. Only an approved entry reaches a published snapshot
// (lib/rom/published-snapshot.ts); this file is the only place that approves
// one. Editing an entry's text takes its approval away, so the client never
// sees words nobody approved.

export type ScopeSide = "include" | "exclude";

export class ScopeEntryError extends Error {
  constructor(
    readonly code: "not_found" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

/** The longest entry the panel takes. One line on the client page, not a paragraph. */
export const MAX_ENTRY_LENGTH = 200;

type EntryRow = {
  id: string;
  cost_code: string;
  side: ScopeSide;
  position: number | string;
  body: string;
  drafter: "ai" | "user";
  drafted_by: string;
  drafted_at: Date | string;
  approved_by: string | null;
  approved_at: Date | string | null;
};

const COLUMNS = "id, cost_code, side, position, body, drafter, drafted_by, drafted_at, approved_by, approved_at";

function toEntry(row: EntryRow): StoredScopeEntry {
  return {
    id: row.id,
    costCode: row.cost_code,
    side: row.side,
    position: Number(row.position),
    text: row.body,
    drafter: row.drafter,
    draftedBy: row.drafted_by,
    draftedAt: toIso(row.drafted_at),
    approvedBy: row.approved_by,
    approvedAt: row.approved_at === null ? null : toIso(row.approved_at),
  };
}

/** Trimmed, one line, and not empty or too long. */
export function cleanEntryText(text: unknown): string {
  if (typeof text !== "string") throw new ScopeEntryError("invalid", "Write the entry as text.");
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean === "") throw new ScopeEntryError("invalid", "An entry needs some text.");
  if (clean.length > MAX_ENTRY_LENGTH) {
    throw new ScopeEntryError("invalid", `Keep an entry under ${MAX_ENTRY_LENGTH} characters.`);
  }
  return clean;
}

export function isScopeSide(value: unknown): value is ScopeSide {
  return value === "include" || value === "exclude";
}

/** One line's entries, approved or not, in the estimator's order. */
export async function listLineEntries(db: Db, projectId: string, costCode: string): Promise<StoredScopeEntry[]> {
  const { rows } = await db.query<EntryRow>(
    `select ${COLUMNS} from line_scope_entries
      where project_id = $1 and cost_code = $2
      order by side, position, drafted_at, id`,
    [projectId, costCode],
  );
  return rows.map(toEntry);
}

/**
 * Adds entries to the end of one side of a line, as drafts. `drafter` says
 * whether AI wrote them or the person did; `draftedBy` is who wrote them or
 * asked for the draft. Nothing added here is approved.
 */
export async function addLineEntries(
  db: Db,
  input: { projectId: string; costCode: string; side: ScopeSide; texts: readonly string[]; drafter: "ai" | "user"; draftedBy: string },
): Promise<StoredScopeEntry[]> {
  const costCode = input.costCode.trim();
  if (costCode === "") throw new ScopeEntryError("invalid", "Send the item's costCode.");
  const texts = input.texts.map(cleanEntryText);
  if (texts.length === 0) return [];
  const project = await db.query(`select 1 from projects where id = $1`, [input.projectId]);
  if (project.rows.length === 0) throw new ScopeEntryError("not_found", "Project not found.");

  const next = await db.query<{ next: number | string }>(
    `select coalesce(max(position) + 1, 0) as next from line_scope_entries
      where project_id = $1 and cost_code = $2 and side = $3`,
    [input.projectId, costCode, input.side],
  );
  const start = Number(next.rows[0]?.next ?? 0);
  const added: StoredScopeEntry[] = [];
  for (const [index, text] of texts.entries()) {
    const { rows } = await db.query<EntryRow>(
      `insert into line_scope_entries (project_id, cost_code, side, position, body, drafter, drafted_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning ${COLUMNS}`,
      [input.projectId, costCode, input.side, start + index, text, input.drafter, input.draftedBy],
    );
    added.push(toEntry(rows[0]));
  }
  return added;
}

/**
 * Changes one entry. New text takes the approval away: the estimator approves
 * the words, so changed words need approving again. `approved: true` approves
 * it as `by`, now; `approved: false` takes the approval back.
 */
export async function updateLineEntry(
  db: Db,
  input: { projectId: string; entryId: string; text?: unknown; approved?: boolean; by: string },
): Promise<StoredScopeEntry> {
  if (input.text === undefined && input.approved === undefined) {
    throw new ScopeEntryError("invalid", "Send new text, or approved true or false.");
  }
  const text = input.text === undefined ? null : cleanEntryText(input.text);
  const current = await db.query<EntryRow>(
    `select ${COLUMNS} from line_scope_entries where id = $1 and project_id = $2`,
    [input.entryId, input.projectId],
  );
  const entry = current.rows[0];
  if (!entry) throw new ScopeEntryError("not_found", "That entry is gone.");

  const body = text ?? entry.body;
  const textChanged = body !== entry.body;
  const wasApproved = entry.approved_by !== null;
  // Approving in the same request as an edit approves the new words.
  const approve = input.approved ?? (wasApproved && !textChanged);
  // An approval that stands keeps who gave it and when; a new one is `by`, now.
  const keep = approve && wasApproved && !textChanged;
  const { rows } = await db.query<EntryRow>(
    `update line_scope_entries
        set body = $3,
            approved_by = $4,
            approved_at = case when $4::text is null then null when $5::boolean then approved_at else now() end
      where id = $1 and project_id = $2
      returning ${COLUMNS}`,
    [input.entryId, input.projectId, body, approve ? (keep ? entry.approved_by : input.by) : null, keep],
  );
  return toEntry(rows[0]);
}

/** Rejects an entry: it is deleted, approved or not, and the client never sees it. */
export async function deleteLineEntry(db: Db, input: { projectId: string; entryId: string }): Promise<void> {
  const { rows } = await db.query(`delete from line_scope_entries where id = $1 and project_id = $2 returning id`, [
    input.entryId,
    input.projectId,
  ]);
  if (rows.length === 0) throw new ScopeEntryError("not_found", "That entry is gone.");
}
