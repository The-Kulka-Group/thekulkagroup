import { PUBLISHED_BUDGET_HEADERS } from "@/lib/auth/routes";
import { getDb, type Db } from "@/lib/db";
import { InvalidJsonBody, JsonBodyTooLarge, readJsonBody } from "@/lib/http/json-body";
import {
  BudgetCommentError,
  findActiveReader,
  type BudgetMessage,
  type BudgetReader,
  type BudgetThread,
} from "@/lib/rom/budget-comments";
import { notifyNewThread } from "@/lib/rom/comment-webhook";
import { linkOrigin } from "@/lib/rom/published-budgets";
import { esc } from "../render";
import { MAX_READER_POST_BYTES, findVersion, type VersionRef } from "@/lib/rom/reader-posts";
import { DEVICE_COOKIE, READER_COOKIE, deviceIdFrom, readCookie, signInCookies } from "@/lib/rom/reader-cookies";

// LA-1487. The first three of the seven checks every reader post runs, in
// order, shared by the three routes under /b/<token>/threads:
//
//   1. The token names a version that takes this post.
//   2. The reader cookie names an unrevoked reader on that version's project.
//   3. The Origin header is the site's own, and the body is JSON under 8 KB.
//
// A failure answers a plain 404 or 403 that does not say which check failed.
// The routes run checks 4 to 7 themselves, since those depend on the post.

export type Guarded = {
  db: Db;
  version: VersionRef;
  reader: BudgetReader;
  deviceId: string;
  /** Set-Cookie values to send back when this browser had no device cookie. */
  cookies: string[];
  body: Record<string, unknown>;
};

const JSON_HEADERS = {
  ...PUBLISHED_BUDGET_HEADERS,
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

function plain(status: number, text: string): Response {
  return new Response(text, {
    status,
    headers: { ...PUBLISHED_BUDGET_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const notFound = () => plain(404, "Not Found");
export const forbidden = () => plain(403, "Forbidden");
export const tooManyPosts = () => plain(429, "Too Many Requests");

/** A JSON answer, with the cookies the guard asked for. */
export function json(status: number, payload: unknown, cookies: string[] = []): Response {
  const headers = new Headers(JSON_HEADERS);
  for (const value of cookies) headers.append("Set-Cookie", value);
  return new Response(JSON.stringify(payload), { status, headers });
}

/** Maps what the comment module throws to a plain status. It never says which check failed. */
export function answerError(cause: unknown): Response {
  if (cause instanceof BudgetCommentError) {
    switch (cause.code) {
      case "not_found":
      case "version_not_open":
        return notFound();
      case "forbidden":
        return forbidden();
      case "thread_closed":
        return plain(409, "Conflict");
      case "invalid":
        return json(400, { error: cause.message });
      default:
        return plain(400, "Bad Request");
    }
  }
  throw cause;
}

/**
 * Runs checks 1 to 3. `newThread` marks a post that opens a thread, which a
 * superseded version no longer takes. A reply or close still lands on a
 * superseded version's own threads.
 */
export async function guard(
  request: Request,
  token: string,
  options: { newThread: boolean },
): Promise<Guarded | Response> {
  const db = getDb();

  // 1. The token names a row. A withdrawn version takes no posts, and a
  // superseded one takes no new threads.
  const version = await findVersion(db, token);
  if (!version || version.state === "withdrawn") return notFound();
  if (options.newThread && version.state === "superseded") return notFound();

  // 2. The reader cookie names an unrevoked reader on the same project. The
  // key is looked up again on every post, so a revoked reader stops at once.
  const header = request.headers.get("cookie");
  const key = readCookie(header, READER_COOKIE);
  const reader = key === null ? null : await findActiveReader(db, key);
  if (!reader || reader.projectId !== version.projectId) return forbidden();

  // 3. Same origin, JSON, under 8 KB. The cookie rides on every same-site
  // request, so the Origin header is the cross-site request forgery check.
  if (request.headers.get("origin") !== linkOrigin(request.url)) return forbidden();
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/json\s*(;|$)/i.test(type)) return forbidden();
  let body: unknown;
  try {
    body = await readJsonBody(request, MAX_READER_POST_BYTES);
  } catch (cause) {
    if (cause instanceof JsonBodyTooLarge || cause instanceof InvalidJsonBody) return forbidden();
    throw cause;
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) return json(400, { error: "The post must be a JSON object." });

  const deviceId = deviceIdFrom(header);
  const hadDevice = readCookie(header, DEVICE_COOKIE) === deviceId;
  return {
    db,
    version,
    reader,
    deviceId,
    cookies: hadDevice ? [] : [signInCookies(reader.readerKey, deviceId)[1]],
    body: body as Record<string, unknown>,
  };
}

/** What a reader gets back about a thread. It leaves out the other readers' ids and every staff field. */
/**
 * LA-1492. Tells Kulka's channel that a thread needs them, after a post has
 * saved. `notifyNewThread` caps its send at 3 seconds and catches its own
 * errors. This catch is for anything outside it, so the reader's post never
 * fails here.
 */
export async function alertKulka(db: Db, threadId: string, request: Request): Promise<void> {
  try {
    await notifyNewThread(db, threadId, linkOrigin(request.url));
  } catch (cause) {
    console.error(`Client comment alert for thread ${threadId} failed: ${cause instanceof Error ? cause.name : "unknown error"}.`);
  }
}

export function threadView(thread: BudgetThread) {
  return {
    id: thread.id,
    kind: thread.kind,
    element_id: thread.elementId,
    status: thread.status,
    outcome: thread.outcome,
    proposed: thread.proposed,
  };
}

/** What a reader gets back about their own message. `bodyHtml` is the body through `esc`, ready to print as text. */
export function messageView(message: BudgetMessage) {
  const body = message.body ?? "";
  return { id: message.id, body, bodyHtml: esc(body), createdAt: message.createdAt };
}

/** A post field that must be a string when it is there. */
export function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : undefined;
}
