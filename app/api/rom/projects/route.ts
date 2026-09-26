import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { insertRomProject, parseNewBudget } from "@/lib/rom/projects";
import { RunFailed, runRom } from "@/lib/rom/run";

// New budget (LA-1107): insert the project, then run its first ROM through
// the same run path POST /api/rom uses. The project is kept even when the run
// fails, because the run record that explains the failure points at it.
export async function POST(request: Request) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = parseNewBudget(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getDb();
  const projectId = await insertRomProject(db, parsed.budget);
  try {
    const { runId } = await runRom(db, projectId);
    return NextResponse.json({ projectId, runId }, { status: 201 });
  } catch (cause) {
    if (cause instanceof RunFailed) {
      return NextResponse.json({ projectId, runId: cause.runId, error: cause.message }, { status: 201 });
    }
    throw cause;
  }
}
