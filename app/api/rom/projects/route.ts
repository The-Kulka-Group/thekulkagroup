import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { insertRomProject, parseNewBudget } from "@/lib/rom/projects";

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

  const db = getDb();
  const projectId = await insertRomProject(db, parsed.budget);
  return NextResponse.json({ projectId }, { status: 201 });
}
