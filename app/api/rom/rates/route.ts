import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { recordedByFor, todayInNewYork } from "@/lib/rom/parameters";
import { readRomProjectDetail } from "@/lib/rom/projects";
import { ProjectRateRefused, saveProjectRate } from "@/lib/rom/project-rates";
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
  const { projectId, costCode, value, scope, proposal } = body;
  if (typeof projectId !== "string" || !isUuid(projectId)) {
    return NextResponse.json({ error: "Send the projectId." }, { status: 400 });
  }
  if (typeof costCode !== "string" || costCode === "") {
    return NextResponse.json({ error: "Send the item's costCode." }, { status: 400 });
  }
  if (typeof value !== "number") return NextResponse.json({ error: "Send value as a number." }, { status: 400 });

  const db = getDb();

  // LA-1245: a rate for this project only, such as one that began as the
  // model's suggestion. `proposal` is what the model said, kept beside it.
  if (scope === "project") {
    const modelProposal = readProposal(proposal);
    if (proposal !== undefined && proposal !== null && !modelProposal) {
      return NextResponse.json({ error: "Send proposal as the suggestion the model returned." }, { status: 400 });
    }
    try {
      await saveProjectRate(db, {
        projectId,
        costCode,
        value,
        recordedBy: recordedByFor(auth.user),
        recordedAt: todayInNewYork(),
        modelProposal,
      });
      return NextResponse.json({ ok: true }, { status: 201 });
    } catch (cause) {
      if (cause instanceof ProjectRateRefused) return NextResponse.json({ error: cause.message }, { status: 400 });
      throw cause;
    }
  }

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

function readProposal(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const { value: rate, low, high, reasoning, model } = value as Record<string, unknown>;
  if (
    typeof rate !== "number" ||
    typeof low !== "number" ||
    typeof high !== "number" ||
    typeof reasoning !== "string" ||
    typeof model !== "string"
  ) {
    return null;
  }
  return { value: rate, low, high, reasoning, model };
}
