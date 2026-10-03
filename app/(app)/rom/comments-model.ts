import type { PanelThread } from "@/lib/rom/budget-comment-inbox";
import type { CommentKind } from "@/lib/rom/budget-comments";

// LA-1490. The words the Client Comments panel and Home use for a thread, in
// one place so a test can pin them. Every label is Title Case. Pinned to
// Eastern so the server and the browser print the same time (LA-1102).

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});

export function whenWords(iso: string): string {
  return WHEN.format(new Date(iso));
}

export const KIND_WORDS: Record<CommentKind, string> = {
  comment: "Comment",
  question: "Question",
  flag: "Flag",
};

/** The thread's state as Kulka reads it. A flag closes as Accepted, Declined or Withdrawn. */
export function stateWords(thread: Pick<PanelThread, "kind" | "status" | "outcome">): string {
  if (thread.status === "closed") {
    if (thread.outcome === "accepted") return "Accepted for Next Version";
    if (thread.outcome === "declined") return "Declined";
    if (thread.outcome === "withdrawn") return "Withdrawn";
    return "Closed";
  }
  return thread.status === "answered" ? "Answered" : "Open";
}

/** The dot beside a state: Done green for a closed thread, orange while Kulka owes a reply, grey otherwise. */
export function stateDot(thread: Pick<PanelThread, "status" | "needsKulka">): "rb-dot--high" | "rb-dot--working" | "rb-dot--neutral" {
  if (thread.status === "closed") return "rb-dot--high";
  return thread.needsKulka ? "rb-dot--working" : "rb-dot--neutral";
}

/** The marks a thread carries when they apply. */
export function markersOf(thread: Pick<PanelThread, "newDevice" | "elementMissingIn">): string[] {
  const marks: string[] = [];
  if (thread.newDevice) marks.push("New Device for This Reader");
  if (thread.elementMissingIn !== null) marks.push(`Element Not in Version ${thread.elementMissingIn}`);
  return marks;
}

/** "Dan Reyes, Fieldstone", or just the name when the reader gave no company. */
export function readerWords(reader: { name: string; company: string | null }): string {
  return reader.company ? `${reader.name}, ${reader.company}` : reader.name;
}

/** What a thread offers Kulka. A flag closes through Accept or Decline, so it has no plain Close. */
export function offersOf(thread: Pick<PanelThread, "kind" | "status" | "proposed">) {
  const open = thread.status !== "closed";
  return {
    reply: open,
    internalNote: open,
    close: open && thread.kind !== "flag",
    accept: open && thread.kind === "flag",
    decline: open && thread.kind === "flag",
    removeCorrection: thread.proposed !== null,
  };
}
