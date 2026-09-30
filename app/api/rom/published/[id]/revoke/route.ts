import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { PublishedBudgetNotFound, revokePublishedBudget } from "@/lib/rom/published-budgets";
import { isUuid } from "@/lib/uuid";

// LA-1419. Withdraw a published version. Its link then opens the withdrawn
// sheet (LA-1417) and shows no figures. A second call keeps the first
// withdrawal time. The row is never deleted.

type Context = { params: Promise<{ id: string }> };
const missing = () => NextResponse.json({ error: "Published budget not found." }, { status: 404 });

export async function POST(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return missing();

  try {
    return NextResponse.json({ published: await revokePublishedBudget(getDb(), id) });
  } catch (cause) {
    if (cause instanceof PublishedBudgetNotFound) return missing();
    throw cause;
  }
}
