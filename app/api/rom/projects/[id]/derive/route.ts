import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { listDerivedAssumptions } from "@/lib/rom/derived-assumptions";
import { applyElevatorCriterion, V1_CODE } from "@/lib/rom/elevator-criterion";
import { applyJackCriterion, V2_CODE } from "@/lib/rom/jack-criterion";
import { previewAnswers } from "@/lib/rom/preview";
import { readRomProjectDetail } from "@/lib/rom/projects";
import { tier1Flow, type Responses } from "@/lib/rom/question-flow";
import { isUuid } from "@/lib/uuid";

// LA-1265. Design and Engineering in the New Budget flow: POST the answers as
// they stand, and the elevator criteria are worked out now, mid-flow, the
// same way a run works them out (V-1, then V-2 from V-1's type). Each is
// saved on the project, so the run at the end and the saved budget show the
// same cards, corrections included. It opens no run. The facts the criteria
// set come back too, so the live budget can price by them.

type Context = { params: Promise<{ id: string }> };

const CODES = new Set([V1_CODE, V2_CODE]);

export async function POST(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let responses: unknown;
  try {
    ({ responses } = await request.json());
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  if (!responses || typeof responses !== "object" || Array.isArray(responses)) {
    return NextResponse.json({ error: "Send the answers as responses." }, { status: 400 });
  }

  const db = getDb();
  const project = await readRomProjectDetail(db, id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const answers = previewAnswers(tier1Flow(), responses as Responses, project.framingSystem ?? "", null);
  if (!answers) return NextResponse.json({ criteria: [], facts: {} });

  const withV1 = await applyElevatorCriterion(db, id, answers, project.framingSystem ?? null);
  const derived = await applyJackCriterion(db, id, withV1, project.framingSystem ?? null);

  const facts: Record<string, string> = {};
  for (const name of ["elevatorType", "hydraulicJackType"]) {
    const value = derived.facts?.[name];
    if (typeof value === "string") facts[name] = value;
  }
  const criteria = (await listDerivedAssumptions(db, id)).filter((one) => CODES.has(one.code));
  return NextResponse.json({ criteria, facts });
}
