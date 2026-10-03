import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { removeMessage } from "@/lib/rom/budget-comments";
import { runStaffAction } from "@/lib/rom/comment-http";

// LA-1490. Remove clears one message's words at the writer's request and keeps
// the row, which then reads "Removed at the Writer's Request" (spec Decision
// 5). Only Kulka can do it, and the words are not recoverable.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  return runStaffAction(getDb(), request, auth.user.email, id, async ({ db, staff }) => ({
    message: await removeMessage(db, { messageId: id, removedBy: `${staff.name} (${staff.account})` }),
  }));
}
