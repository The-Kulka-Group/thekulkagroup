import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listPublishedBudgets } from "@/lib/rom/published-budgets";
import { isUuid } from "@/lib/uuid";

// LA-1419. Every version published for a project, newest first, for the
// saved budget's version list. It returns links' tokens and dates, never a
// snapshot.

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  return NextResponse.json({ published: await listPublishedBudgets(getDb(), id) });
}
