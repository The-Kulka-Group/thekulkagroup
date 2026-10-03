import { NextResponse } from "next/server";

import type { Db } from "@/lib/db";
import { isUuid } from "@/lib/uuid";

import { BudgetCommentError, type CommentErrorCode, type StaffAuthor } from "./budget-comments";

// LA-1490. What the internal comment routes share: read the JSON body, take the
// "Reply As" name, and turn a BudgetCommentError into a status. A route checks
// sign-in first and passes the account in, so this file never reads a session.

export const MAX_REPLY_AS = 80;

const STATUS: Record<CommentErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  invalid: 400,
  version_not_open: 409,
  thread_closed: 409,
  not_releasable: 409,
};

export function commentErrorResponse(cause: unknown): NextResponse | null {
  if (!(cause instanceof BudgetCommentError)) return null;
  const message = cause.code === "not_found" ? "Not found." : cause.message;
  return NextResponse.json({ error: message }, { status: STATUS[cause.code] });
}

export type StaffRequest = {
  db: Db;
  id: string;
  staff: StaffAuthor;
  body: Record<string, unknown>;
};

/**
 * Runs one staff action on a thread or message. The id must be a uuid, the
 * body a JSON object, and `replyAs` a name of 1 to 80 characters: it is the
 * name the client reads, and sign-in alone would read open-access.
 */
export async function runStaffAction(
  db: Db,
  request: Request,
  account: string,
  id: string,
  act: (input: StaffRequest) => Promise<Record<string, unknown>>,
): Promise<NextResponse> {
  if (!isUuid(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const body: unknown = await request.json().catch(() => undefined);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Send a JSON object." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const name = typeof record.replyAs === "string" ? record.replyAs.trim() : "";
  if (name === "" || Array.from(name).length > MAX_REPLY_AS) {
    return NextResponse.json({ error: `Reply As needs a name of up to ${MAX_REPLY_AS} characters.` }, { status: 400 });
  }
  try {
    return NextResponse.json(await act({ db, id, staff: { name, account }, body: record }));
  } catch (cause) {
    const response = commentErrorResponse(cause);
    if (response) return response;
    throw cause;
  }
}

/** A string field of a body, or undefined when it is absent or not text. */
export function textField(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" ? value : undefined;
}
