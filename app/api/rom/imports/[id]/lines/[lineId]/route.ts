import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  CanonicalWorkItemNotFound,
  CostImportAlreadyApproved,
  CostImportLineNotFound,
  CostImportNotFound,
  remapCostImportLine,
} from "@/lib/rom/ingest";
import { isUuid } from "@/lib/uuid";

// LA-978: lets a reviewer fix one line's match, or take it out of the
// promotion entirely, while its import is still 'staged'. See
// lib/rom/ingest.ts's remapCostImportLine for what each body shape does and
// why there is no third "put it back to unmapped" action.
//
// No agent or heuristic calls this route -- every match it can ever record
// is one a signed-in person picked, carried in `auth.user.email` as
// `mapped_by`.

type Context = { params: Promise<{ id: string; lineId: string }> };
const missing = () => NextResponse.json({ error: "Cost import line not found." }, { status: 404 });

export async function PATCH(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id, lineId } = await context.params;
  if (!isUuid(id) || !isUuid(lineId)) return missing();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const { canonicalItemId, exclude } = (body ?? {}) as Record<string, unknown>;

  if (exclude === true) {
    return remap(id, lineId, { exclude: true }, auth.user.email);
  }
  if (typeof canonicalItemId === "string" && canonicalItemId.length > 0) {
    if (!isUuid(canonicalItemId)) {
      return NextResponse.json({ error: "Canonical work item not found." }, { status: 404 });
    }
    return remap(id, lineId, { canonicalItemId }, auth.user.email);
  }

  return NextResponse.json(
    { error: 'Send either { "canonicalItemId": "<uuid>" } or { "exclude": true }.' },
    { status: 400 },
  );
}

async function remap(
  costImportId: string,
  lineId: string,
  params: { canonicalItemId: string } | { exclude: true },
  mappedBy: string,
) {
  try {
    const line = await remapCostImportLine(getDb(), costImportId, lineId, params, mappedBy);
    return NextResponse.json({ line });
  } catch (cause) {
    if (cause instanceof CostImportNotFound) return missing();
    if (cause instanceof CostImportLineNotFound) return missing();
    if (cause instanceof CanonicalWorkItemNotFound) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    if (cause instanceof CostImportAlreadyApproved) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}
