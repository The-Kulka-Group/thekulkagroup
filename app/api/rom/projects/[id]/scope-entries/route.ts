import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { addLineEntries, isScopeSide, listLineEntries, ScopeEntryError } from "@/lib/rom/scope-entries";
import { isUuid } from "@/lib/uuid";

// LA-1503. One line's Inclusions and Exclusions, for the block panel. GET
// ?costCode= lists them, approved or not. POST { costCode, side, text } adds
// one written by hand, as a draft. Approving is PATCH on the entry; asking AI
// for a draft is POST ./draft.

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const costCode = new URL(request.url).searchParams.get("costCode")?.trim();
  if (!costCode) return NextResponse.json({ error: "Send the item's costCode." }, { status: 400 });

  return NextResponse.json({ entries: await listLineEntries(getDb(), id, costCode) });
}

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const body: unknown = await request.json().catch(() => undefined);
  const { costCode, side, text } = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof costCode !== "string" || !isScopeSide(side)) {
    return NextResponse.json({ error: "Send the costCode, the side (include or exclude) and the text." }, { status: 400 });
  }

  try {
    const [entry] = await addLineEntries(getDb(), {
      projectId: id,
      costCode,
      side,
      texts: [text as string],
      drafter: "user",
      draftedBy: auth.user.email,
    });
    return NextResponse.json({ entry }, { status: 201 });
  } catch (cause) {
    if (cause instanceof ScopeEntryError) {
      return NextResponse.json({ error: cause.message }, { status: cause.code === "not_found" ? 404 : 400 });
    }
    throw cause;
  }
}
