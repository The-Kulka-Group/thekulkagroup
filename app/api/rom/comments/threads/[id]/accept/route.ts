import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { closeThread } from "@/lib/rom/budget-comments";
import { runStaffAction, textField } from "@/lib/rom/comment-http";

// LA-1490. Accept for Next Version closes a flag as accepted. It changes
// nothing in the budget: the estimator edits the fact, reruns and publishes,
// and a later version carries the flag (spec Decision 4).

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  return runStaffAction(getDb(), request, auth.user.email, id, async ({ db, staff, body }) => ({
    thread: await closeThread(db, {
      threadId: id,
      by: { kind: "staff", staff, outcome: "accepted", reply: textField(body, "reply") },
    }),
  }));
}
