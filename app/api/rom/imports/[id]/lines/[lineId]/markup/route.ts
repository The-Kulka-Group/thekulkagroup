import { NextResponse } from "next/server";

import type { MarkupHistorySetup } from "@kulka/engine";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  CostImportAlreadyApproved,
  CostImportLineNotFound,
  CostImportNotFound,
} from "@/lib/rom/ingest";
import {
  LineNotRoutable,
  MARKUP_HISTORY_SETUPS,
  MarkupHistoryExists,
  MarkupSubtotalMissing,
  routeLineToMarkup,
} from "@/lib/rom/markup";
import { isUuid } from "@/lib/uuid";

// LA-1016: a reviewer sends one imported line to the 90 series as a real
// GRs/GCs figure, instead of mapping it to a work item. See
// lib/rom/markup.ts's routeLineToMarkup for when this is allowed and how the
// percent of subtotal is computed. The person who sent it is recorded from
// `auth.user.email`.

type Context = { params: Promise<{ id: string; lineId: string }> };
const missing = () => NextResponse.json({ error: "Cost import line not found." }, { status: 404 });

export async function POST(request: Request, context: Context) {
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

  const { setup } = (body ?? {}) as Record<string, unknown>;
  if (!MARKUP_HISTORY_SETUPS.includes(setup as MarkupHistorySetup)) {
    return NextResponse.json(
      { error: 'Send { "setup": "both" }, { "setup": "gc_only" }, or { "setup": "gr_only" }.' },
      { status: 400 },
    );
  }

  try {
    const result = await routeLineToMarkup(getDb(), id, lineId, setup as MarkupHistorySetup, auth.user.email);
    return NextResponse.json(result);
  } catch (cause) {
    if (cause instanceof CostImportNotFound) return missing();
    if (cause instanceof CostImportLineNotFound) return missing();
    if (
      cause instanceof CostImportAlreadyApproved ||
      cause instanceof LineNotRoutable ||
      cause instanceof MarkupHistoryExists ||
      cause instanceof MarkupSubtotalMissing
    ) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}
