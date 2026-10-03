import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { closeThread } from "@/lib/rom/budget-comments";
import { runStaffAction, textField } from "@/lib/rom/comment-http";

// LA-1490. Decline closes a flag as declined. The client-visible `reply` is
// required and is written in the same transaction, so the owner always learns
// why (spec Decision 4).

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  return runStaffAction(getDb(), request, auth.user.email, id, async ({ db, staff, body }) => ({
    thread: await closeThread(db, {
      threadId: id,
      by: { kind: "staff", staff, outcome: "declined", reply: textField(body, "reply") },
    }),
  }));
}
