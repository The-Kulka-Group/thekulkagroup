import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listAllRomBudgets } from "@/lib/rom/budgets";
import { insertRomProject, parseNewBudget } from "@/lib/rom/projects";
import { linkRomProjectWithin, RomLinkError } from "@/lib/underwriting/rom-link";
import { isUuid } from "@/lib/uuid";

// LA-1322: every budget, active and archived, for the All Budgets menu.
export async function GET(request: Request) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  return NextResponse.json({ budgets: await listAllRomBudgets(getDb()) });
}

// New budget (LA-1140): insert the project only. A new budget must open with
// no saved runs, so this no longer calls runRom -- that used to write a run
// row immediately, which put one entry in the /rom saved-runs strip before
// anyone had asked for a run.
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

  // LA-2417: a budget started from an underwriting case is linked to it as it is made.
  const caseId = (body as Record<string, unknown>).underwritingCaseId;
  if (caseId !== undefined && (typeof caseId !== "string" || !isUuid(caseId))) {
    return NextResponse.json({ error: "Send underwritingCaseId as an underwriting project id." }, { status: 400 });
  }
  const db = getDb();
  try {
    const projectId = await db.withTransaction(async (tx) => {
      const id = await insertRomProject(tx, parsed.budget);
      // The setup name is the one the user last typed, so the case takes it.
      if (caseId) await linkRomProjectWithin(tx, caseId, id, "budget");
      return id;
    });
    return NextResponse.json({ projectId }, { status: 201 });
  } catch (cause) {
    if (cause instanceof RomLinkError) return NextResponse.json({ error: cause.message }, { status: cause.status });
    throw cause;
  }
}
