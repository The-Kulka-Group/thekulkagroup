import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { closeThread } from "@/lib/rom/budget-comments";
import { runStaffAction, textField } from "@/lib/rom/comment-http";

// LA-1490. Kulka closes a comment or question. A flag closes through Accept
// for Next Version or Decline instead, because it needs an outcome. An
// optional `reply` is written to the client in the same action.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  return runStaffAction(getDb(), request, auth.user.email, id, async ({ db, staff, body }) => ({
    thread: await closeThread(db, { threadId: id, by: { kind: "staff", staff, reply: textField(body, "reply") } }),
  }));
}
