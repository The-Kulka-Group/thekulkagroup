import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { deleteLineEntry, ScopeEntryError, updateLineEntry } from "@/lib/rom/scope-entries";
import { isUuid } from "@/lib/uuid";

// LA-1503. One Inclusion or Exclusion. PATCH { text?, approved? } edits or
// approves it; new text takes an approval away unless the same request
// approves again. DELETE rejects it.

type Context = { params: Promise<{ id: string; entryId: string }> };

function failed(cause: unknown) {
  if (cause instanceof ScopeEntryError) {
    return NextResponse.json({ error: cause.message }, { status: cause.code === "not_found" ? 404 : 400 });
  }
  throw cause;
}

export async function PATCH(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, entryId } = await context.params;
  if (!isUuid(id) || !isUuid(entryId)) return NextResponse.json({ error: "That entry is gone." }, { status: 404 });
  const body: unknown = await request.json().catch(() => undefined);
  const { text, approved } = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (approved !== undefined && typeof approved !== "boolean") {
    return NextResponse.json({ error: "Approved is true or false." }, { status: 400 });
  }

  try {
    const entry = await updateLineEntry(getDb(), { projectId: id, entryId, text, approved, by: auth.user.email });
    return NextResponse.json({ entry });
  } catch (cause) {
    return failed(cause);
  }
}

export async function DELETE(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, entryId } = await context.params;
  if (!isUuid(id) || !isUuid(entryId)) return NextResponse.json({ error: "That entry is gone." }, { status: 404 });
  try {
    await deleteLineEntry(getDb(), { projectId: id, entryId });
    return new NextResponse(null, { status: 204 });
  } catch (cause) {
    return failed(cause);
  }
}
