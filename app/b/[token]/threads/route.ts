import { getDb } from "@/lib/db";
import { openThread, isAssumptionElement, type CommentKind } from "@/lib/rom/budget-comments";
import { commentLayerFor } from "@/lib/rom/comment-layer";
import { addressableElements } from "@/lib/rom/addressable-elements";
import { presentBudget } from "@/lib/rom/presentation";
import { loadPublishedBudget } from "@/lib/rom/published-budgets";
import {
  MAX_MESSAGES_PER_DAY,
  MAX_THREADS_PER_DAY,
  anchorFor,
  postsInLastDay,
} from "@/lib/rom/reader-posts";

import { alertKulka, answerError, forbidden, guard, json, messageView, notFound, optionalText, threadView, tooManyPosts } from "./guard";

export const dynamic = "force-dynamic";

// LA-1487 (spec docs/precon/client-comments-spec.md, "RLS and the checks on
// every request"). POST /b/<token>/threads opens a thread with its first
// message. The body is JSON: { kind, element_id, body?, proposed? }. `guard`
// runs checks 1 to 3. This route runs 4, 5 and 7. The anchor comes from the
// page model, never from the body.

const KINDS = new Set<string>(["comment", "question", "flag"]);

/**
 * LA-1489. GET /b/<token>/threads is the page's comment layer again, read
 * after a post so the page can redraw. It answers only a browser whose reader
 * cookie names an active reader of the version's project, with the same plain
 * 403 for every other case.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const db = getDb();
  const view = await loadPublishedBudget(db, token);
  if (!view || view.state === "withdrawn") return notFound();
  const page = presentBudget({ snapshot: view.snapshot, version: view.version, stage: view.stage, issuedAt: view.issuedAt, newer: view.newer });
  const layer = await commentLayerFor(db, { token, cookieHeader: request.headers.get("cookie"), page });
  return layer ? json(200, layer) : forbidden();
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const guarded = await guard(request, token, { newThread: true });
  if (guarded instanceof Response) return guarded;
  const { db, version, reader, deviceId, body, cookies } = guarded;

  const kind = body.kind;
  const text = optionalText(body.body);
  const proposed = optionalText(body.proposed);
  if (typeof kind !== "string" || !KINDS.has(kind) || text === undefined || proposed === undefined) {
    return json(400, { error: "A post needs a kind, an element and text." });
  }

  // 4. The element is one of the page model's data-el ids, or page:general.
  const view = await loadPublishedBudget(db, token);
  if (!view || view.state === "withdrawn") return notFound();
  const page = presentBudget({
    snapshot: view.snapshot,
    version: view.version,
    stage: view.stage,
    issuedAt: view.issuedAt,
    newer: view.newer,
  });
  const element = typeof body.element_id === "string" ? addressableElements(page).get(body.element_id) : undefined;
  if (!element) return notFound();

  // 5. A flag goes only on an assumption element.
  if (kind === "flag" && !isAssumptionElement(element.id)) return forbidden();

  // 7. 20 threads and 60 messages in a day. A flag with no "Why" posts no message.
  const used = await postsInLastDay(db, reader.id);
  const adds = text !== null && text.trim() !== "" ? 1 : 0;
  if (used.threads >= MAX_THREADS_PER_DAY || used.messages + adds > MAX_MESSAGES_PER_DAY) return tooManyPosts();

  try {
    const opened = await openThread(db, {
      publishedBudgetId: version.id,
      readerId: reader.id,
      deviceId,
      elementId: element.id,
      anchor: anchorFor(element),
      kind: kind as CommentKind,
      body: text,
      proposed,
    });
    await alertKulka(db, opened.thread.id, request);
    return json(201, { thread: threadView(opened.thread), message: opened.message ? messageView(opened.message) : null }, cookies);
  } catch (cause) {
    return answerError(cause);
  }
}
