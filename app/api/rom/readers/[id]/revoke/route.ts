import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { BudgetCommentError, revokeReader } from "@/lib/rom/budget-comments";
import { isUuid } from "@/lib/uuid";

// LA-1486 (spec Decision 1). Revoke a reader link. The key then answers the
// same plain 404 as an unknown one, and the reader's cookie stops working on
// the next request. A second call keeps the first revoke time. The row stays,
// and so do the reader's earlier posts.

type Context = { params: Promise<{ id: string }> };
const missing = () => NextResponse.json({ error: "Reader not found." }, { status: 404 });

export async function POST(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return missing();

  try {
    const reader = await revokeReader(getDb(), id);
    return NextResponse.json({ reader: { id: reader.id, revokedAt: reader.revokedAt } });
  } catch (cause) {
    if (cause instanceof BudgetCommentError && cause.code === "not_found") return missing();
    throw cause;
  }
}
