import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { parseGateAnswers, saveProjectGateAnswers } from "@/lib/rom/gates";
import { parseMarkupChoices, saveProjectMarkupChoices } from "@/lib/rom/markup";
import { readRomProjectDetail } from "@/lib/rom/projects";
import { isUuid } from "@/lib/uuid";

// LA-1225. New Budget saves every answer as it is given, instead of holding
// them all until "Add and Run". The facts already save through PATCH
// /api/rom/projects/[id]; this saves the other two things a run used to be
// the only way to write (LA-1109): the scope gate answers and the GRs/GCs
// choices. It opens no run. Only a field the request names is written, the
// same rule POST /api/rom follows, so saving gates never resets markups.

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let gates: unknown;
  let markups: unknown;
  try {
    ({ gates, markups } = await request.json());
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsedGates = parseGateAnswers(gates);
  if (!parsedGates.ok) return NextResponse.json({ error: parsedGates.error }, { status: 400 });
  const parsedMarkups = parseMarkupChoices(markups);
  if (!parsedMarkups.ok) return NextResponse.json({ error: parsedMarkups.error }, { status: 400 });

  const db = getDb();
  if (!(await readRomProjectDetail(db, id))) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  await Promise.all([
    gates === undefined ? null : saveProjectGateAnswers(db, id, parsedGates.gates),
    markups === undefined ? null : saveProjectMarkupChoices(db, id, parsedMarkups.choices),
  ]);
  return NextResponse.json({ projectId: id });
}
