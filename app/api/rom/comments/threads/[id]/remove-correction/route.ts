import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { removeProposed } from "@/lib/rom/budget-comments";
import { runStaffAction } from "@/lib/rom/comment-http";

// LA-1490. Remove clears a flag's "What It Should Be" at the writer's request
// and keeps the row (spec Decision 5). The words are not recoverable.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  return runStaffAction(getDb(), request, auth.user.email, id, async ({ db }) => ({
    thread: await removeProposed(db, { threadId: id }),
  }));
}
