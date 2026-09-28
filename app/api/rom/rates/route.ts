import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { recordedByFor, todayInNewYork } from "@/lib/rom/parameters";
import { readRomProjectDetail } from "@/lib/rom/projects";
import { addSupportingItemRate, RateRefused } from "@/lib/rom/stated-rates";
import { isUuid } from "@/lib/uuid";

// POST a rate for a supporting item that has none yet (lib/rom/stated-rates.ts).
// The page records a new run afterward so the budget shows it priced.

export async function POST(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const { projectId, costCode, value } = body;
  if (typeof projectId !== "string" || !isUuid(projectId)) {
    return NextResponse.json({ error: "Send the projectId." }, { status: 400 });
  }
  if (typeof costCode !== "string" || costCode === "") {
    return NextResponse.json({ error: "Send the item's costCode." }, { status: 400 });
  }
  if (typeof value !== "number") return NextResponse.json({ error: "Send value as a number." }, { status: 400 });

  const db = getDb();
  // The rate joins the benchmarks for this project's type and construction
  // kind, so every budget of that kind prices the item from here on.
  const project = await readRomProjectDetail(db, projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  try {
    await addSupportingItemRate(db, {
      costCode,
      value,
      projectType: project.projectType,
      constructionKind: project.constructionKind,
      recordedBy: recordedByFor(auth.user),
      recordedAt: todayInNewYork(),
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (cause) {
    if (cause instanceof RateRefused) return NextResponse.json({ error: cause.message }, { status: 400 });
    throw cause;
  }
}
