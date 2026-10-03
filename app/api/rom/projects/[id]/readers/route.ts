import { NextResponse } from "next/server";

import { readerLinkFor } from "@/app/(app)/rom/reader-model";
import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { addReader, BudgetCommentError, listReaders, type BudgetReader } from "@/lib/rom/budget-comments";
import { linkOrigin } from "@/lib/rom/published-budgets";
import { isUuid } from "@/lib/uuid";

// LA-1486 (spec Decision 1). The people who may comment on a project, for the
// Publish panel. GET lists them newest first with the link to copy for each
// active one. POST adds one (name, email, company) and returns the new
// reader with their link. A revoked reader has no link. The key is a secret,
// so it leaves the server only here, to a signed-in estimator.

type Context = { params: Promise<{ id: string }> };

function shown(reader: BudgetReader, origin: string) {
  const { readerKey, ...rest } = reader;
  return { ...rest, link: reader.revokedAt === null ? readerLinkFor(origin, readerKey) : null };
}

export async function GET(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const origin = linkOrigin(request.url);
  const readers = await listReaders(getDb(), id);
  return NextResponse.json({ readers: readers.map((reader) => shown(reader, origin)) });
}

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const body: unknown = await request.json().catch(() => undefined);
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Send the reader's name, email and company." }, { status: 400 });
  }
  const { name, email, company } = body as Record<string, unknown>;
  if (typeof name !== "string" || typeof email !== "string" || (company != null && typeof company !== "string")) {
    return NextResponse.json({ error: "Send the reader's name, email and company as text." }, { status: 400 });
  }

  try {
    const reader = await addReader(getDb(), { projectId: id, name, email, company, createdBy: auth.user.email });
    return NextResponse.json({ reader: shown(reader, linkOrigin(request.url)) }, { status: 201 });
  } catch (cause) {
    if (cause instanceof BudgetCommentError) {
      if (cause.code === "not_found") return NextResponse.json({ error: "Project not found." }, { status: 404 });
      if (cause.code === "invalid") return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
}
