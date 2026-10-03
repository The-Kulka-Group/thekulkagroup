import type { Db } from "@/lib/db";

import { GENERAL_COMMENT_ID, addressableElements } from "./addressable-elements";
import { findActiveReader, isAssumptionElement, type CommentKind, type FlagOutcome, type ThreadStatus } from "./budget-comments";
import type { BudgetPage } from "./presentation";
import { findVersion } from "./reader-posts";
import { READER_COOKIE, readCookie } from "./reader-cookies";
import { listPageThreads, type AnchorChange, type PageThread, type Placement } from "./thread-carry";

// LA-1489, ticket 6 of LA-1480 (spec docs/precon/client-comments-spec.md,
// Decisions 4 and 5). What the comment layer on /b/<token> receives. It is
// built only for a browser whose reader cookie names an active reader of the
// version's project, so the plain link and the print render carry no comment
// data. A reader's email and every reader id stay on the server: the page
// learns only names, companies and whether a thread is the viewer's own.

/** One element a reader can comment on: [id, label, figure, the words it shows, takes a flag]. */
export type LayerElement = [id: string, label: string, figure: string | null, text: string, flag: boolean];

export type LayerMessage = {
  /** The reader's name, or the name Kulka replied as. */
  author: string;
  /** The reader's company, or "The Kulka Group". */
  company: string | null;
  kulka: boolean;
  /** Null once the writer asked for removal. */
  body: string | null;
  at: string;
};

export type LayerThread = {
  id: string;
  /** The element it sits on, or null for one in the From Earlier Versions list. */
  on: string | null;
  kind: CommentKind;
  status: ThreadStatus;
  outcome: FlagOutcome | null;
  proposed: string | null;
  proposedRemoved: boolean;
  /** The viewer opened it, so the viewer may close or withdraw it. */
  mine: boolean;
  /** Who opened it. */
  by: { name: string; company: string | null };
  anchor: { section: string | null; label: string | null; text: string | null; figure: string | null };
  /** The version it was posted on. */
  version: number;
  fromVersion: number | null;
  changed: AnchorChange | null;
  carriedInto: number | null;
  openedAt: string;
  messages: LayerMessage[];
};

export type CommentLayer = {
  version: number;
  /** The version is current, so it takes new threads. A superseded one takes replies only. */
  takesNew: boolean;
  reader: { name: string; company: string | null };
  elements: LayerElement[];
  threads: LayerThread[];
};

const KULKA = "The Kulka Group";

function toLayer(placement: Placement<PageThread>, on: string | null, viewer: string): LayerThread {
  const t = placement.thread;
  return {
    id: t.id,
    on,
    kind: t.kind,
    status: t.status,
    outcome: t.outcome,
    proposed: t.proposed,
    proposedRemoved: t.proposedRemoved,
    mine: t.openedBy === viewer,
    by: t.reader,
    anchor: {
      section: t.anchor.section ?? null,
      label: t.anchor.label ?? null,
      text: t.anchor.text ?? null,
      figure: t.anchor.figure ?? null,
    },
    version: t.version,
    fromVersion: placement.fromVersion,
    changed: placement.changed,
    carriedInto: placement.carriedInto,
    openedAt: t.openedAt,
    messages: t.messages.map((m) => ({
      author: m.author,
      company: m.authorKind === "reader" ? m.company : KULKA,
      kulka: m.authorKind !== "reader",
      body: m.body,
      at: m.createdAt,
    })),
  };
}

/**
 * The comment layer for one version's page, or null when the request carries
 * no reader cookie, the cookie names a revoked reader or a reader of another
 * project, or the version is withdrawn.
 */
export async function commentLayerFor(
  db: Db,
  input: { token: string; cookieHeader: string | null; page: BudgetPage },
): Promise<CommentLayer | null> {
  const key = readCookie(input.cookieHeader, READER_COOKIE);
  if (key === null) return null;
  const version = await findVersion(db, input.token);
  if (!version || version.state === "withdrawn") return null;
  const reader = await findActiveReader(db, key);
  if (!reader || reader.projectId !== version.projectId) return null;

  const placed = await listPageThreads(db, version.id);
  if (!placed) return null;

  const threads: LayerThread[] = [];
  for (const [on, list] of placed.onElements) for (const p of list) threads.push(toLayer(p, on, reader.id));
  for (const p of placed.fromEarlierVersions) threads.push(toLayer(p, null, reader.id));
  threads.sort((a, b) => a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id));

  const elements: LayerElement[] = [];
  for (const e of addressableElements(input.page).values()) {
    if (e.id === GENERAL_COMMENT_ID) continue;
    elements.push([e.id, e.label, e.figure, e.text, isAssumptionElement(e.id)]);
  }

  return {
    version: placed.version,
    takesNew: version.state === "current",
    reader: { name: reader.name, company: reader.company },
    elements,
    threads,
  };
}

/** The layer as a JSON script body: `<` is escaped so no string in it can close the script. */
export function layerJson(layer: CommentLayer): string {
  return JSON.stringify(layer).replace(/</g, "\\u003c");
}
