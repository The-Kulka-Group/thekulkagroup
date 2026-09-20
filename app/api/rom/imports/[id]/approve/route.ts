import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { approveCostImport, CostImportAlreadyApproved, CostImportNotFound } from "@/lib/rom/ingest";
import { isUuid } from "@/lib/uuid";

// The approval gate itself (LA-15 AC2, AC3, AC5): promotes every staged,
// confidently-mapped, role-eligible line into a queryable benchmark row.
// See lib/rom/ingest.ts's approveCostImport for what "eligible" means and
// why (ADR 0003).

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Cost import not found." }, { status: 404 });

  try {
    const summary = await approveCostImport(getDb(), id, auth.user.email);
    return NextResponse.json({ costImportId: id, ...summary });
  } catch (cause) {
    if (cause instanceof CostImportNotFound) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    if (cause instanceof CostImportAlreadyApproved) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}
