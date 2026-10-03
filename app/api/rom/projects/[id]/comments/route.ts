import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listProjectComments } from "@/lib/rom/budget-comment-inbox";
import { isUuid } from "@/lib/uuid";

// LA-1490. Every client comment thread on a project, grouped by version, for
// the saved budget's Client Comments panel. It includes Internal Notes and the
// markers the panel shows, so it is for signed-in staff only. A reader's email
// is never in it.

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ comments: await listProjectComments(getDb(), id) });
}
