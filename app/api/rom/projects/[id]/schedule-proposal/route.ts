import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { rateClient } from "@/lib/rom/rate-suggestion";
import { proposeForProject } from "@/lib/rom/schedule-proposal";
import { isUuid } from "@/lib/uuid";

// LA-1399. POST proposes the project's precon, construction and close-out
// weeks from Kulka's completed jobs and saves the proposal on the project.
// A proposal already made from the project's current facts and jobs comes back
// without asking again. It changes no plan: the page applies the proposal to
// the phases the estimator has not typed, and the next run records the weeks.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const result = await proposeForProject(getDb(), rateClient(), id);
  if (!result) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.notSetUp ? 503 : 502 });
  return NextResponse.json({ proposal: result.proposal });
}
