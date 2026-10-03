import type { Db } from "@/lib/db";

import { listThreadsNeedingKulka } from "./budget-comment-inbox";

// LA-1492, ticket 9 of LA-1480 (spec docs/precon/client-comments-spec.md,
// Decision 3). An optional push to a chat channel Kulka owns when a reader
// opens a thread that needs Kulka. It stays off until KULKA_COMMENT_WEBHOOK_URL
// is set. It sends the one sentence Home shows and a link to the thread in the
// internal app. It never sends the message body or the reader's email, and it
// never sends anything to the client.
//
// A failed send never fails the reader's post: this function catches every
// error and logs it. The URL is a secret, so the log never prints it.

export const COMMENT_WEBHOOK_TIMEOUT_MS = 3000;

/** What the webhook receives. `text` is the field chat tools read; the others hold the same words apart. */
export type CommentWebhookPayload = {
  text: string;
  sentence: string;
  link: string;
};

/** The webhook address, or null when the push is off. */
export function commentWebhookUrl(): string | null {
  const url = process.env.KULKA_COMMENT_WEBHOOK_URL?.trim();
  return url ? url : null;
}

/** Where the thread sits in the internal app: the project's saved budget, with the thread named. */
export function threadLink(origin: string, projectId: string, threadId: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/rom?project=${encodeURIComponent(projectId)}&thread=${encodeURIComponent(threadId)}`;
}

/**
 * Tells Kulka's channel about a new thread, when the push is on and the thread
 * needs Kulka. `origin` is the internal app's address, as `linkOrigin` gives
 * it. Never throws. Returns true only when the endpoint accepted the post.
 */
export async function notifyNewThread(db: Db, threadId: string, origin: string): Promise<boolean> {
  const url = commentWebhookUrl();
  if (url === null) return false;
  try {
    const [thread] = await listThreadsNeedingKulka(db, threadId);
    if (!thread) return false;
    const link = threadLink(origin, thread.projectId, thread.threadId);
    const payload: CommentWebhookPayload = { text: `${thread.sentence} ${link}`, sentence: thread.sentence, link };
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(COMMENT_WEBHOOK_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`Client comment webhook for thread ${threadId} answered ${response.status}.`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Client comment webhook for thread ${threadId} failed: ${error instanceof Error ? error.name : "unknown error"}.`);
    return false;
  }
}
