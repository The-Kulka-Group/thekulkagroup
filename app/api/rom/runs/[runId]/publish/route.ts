import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { RunNotFound, RunNotSucceeded } from "@/lib/rom/issue";
import { parsePublishBody } from "@/lib/rom/publish-request";
import { publishBudget } from "@/lib/rom/published-budgets";
import { isUuid } from "@/lib/uuid";

// LA-1419. Publish a saved run as the project's next version (LA-1309). The
// estimator writes prepared for, prepared by, the cover sentence and how many
// days the figures stay valid; nothing here writes any of them. Each call
// makes a new version with its own link and marks the earlier ones
// superseded (lib/rom/published-budgets.ts). This is an action on a saved
// budget, not a run: it never calls the engine.

type Context = { params: Promise<{ runId: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { runId } = await context.params;
  if (!isUuid(runId)) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = await request.json().catch(() => undefined);
  const parsed = parsePublishBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const published = await publishBudget(getDb(), { runId, issuedBy: auth.user.email, copy: parsed.copy });
    return NextResponse.json({ published });
  } catch (cause) {
    if (cause instanceof RunNotFound) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    if (cause instanceof RunNotSucceeded) {
      return NextResponse.json({ error: "Only a finished run can be published." }, { status: 409 });
    }
    throw cause;
  }
}
