import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { BudgetCommentError, replyToThread } from "@/lib/rom/budget-comments";
import { runStaffAction, textField } from "@/lib/rom/comment-http";

// LA-1490. Kulka writes in a thread. A client-visible reply is signed with the
// Reply As name and answers an open question. With `internal: true` it is an
// Internal Note: Kulka sees it and no page or reader ever does.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  return runStaffAction(getDb(), request, auth.user.email, id, async ({ db, staff, body }) => {
    if (body.internal !== undefined && typeof body.internal !== "boolean") {
      throw new BudgetCommentError("invalid", "internal must be true or false.");
    }
    const internal = body.internal === true;
    const result = await replyToThread(db, { threadId: id, author: "staff", staff, body: textField(body, "body") ?? "", internal });
    return { thread: result.thread, message: result.message };
  });
}
