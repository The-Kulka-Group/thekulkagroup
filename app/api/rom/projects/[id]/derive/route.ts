import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { A1_CODE, applyConstructionTypeCriterion } from "@/lib/rom/construction-type-criterion";
import { listDerivedAssumptions } from "@/lib/rom/derived-assumptions";
import { applyElectricalCriterion, E1_CODE } from "@/lib/rom/electrical-criterion";
import { applyElevatorCriterion, V1_CODE } from "@/lib/rom/elevator-criterion";
import { applyFoundationCriterion, S1_CODE } from "@/lib/rom/foundation-criterion";
import { applyHvacCriteria, M0_CODE, M1_CODE } from "@/lib/rom/hvac-criterion";
import { applyJackCriterion, V2_CODE } from "@/lib/rom/jack-criterion";
import { applyMachineRoomCriterion, V3_CODE } from "@/lib/rom/machine-room-criterion";
import { previewAnswers } from "@/lib/rom/preview";
import { readRomProjectDetail } from "@/lib/rom/projects";
import { tier1Flow, type Responses } from "@/lib/rom/question-flow";
import { isUuid } from "@/lib/uuid";

// LA-1265. Design and Engineering in the New Budget flow: POST the answers as
// they stand, and the criteria are worked out now, mid-flow, the
// same way a run works them out (V-1, then V-2 from V-1's type). Each is
// saved on the project, so the run at the end and the saved budget show the
// same cards, corrections included. It opens no run. The facts the criteria
// set come back too, so the live budget can price by them.

type Context = { params: Promise<{ id: string }> };

const CODES = new Set([V1_CODE, V2_CODE, V3_CODE, A1_CODE, S1_CODE, E1_CODE, M0_CODE, M1_CODE]);

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
  const withV2 = await applyJackCriterion(db, id, withV1, project.framingSystem ?? null);
  const withV3 = await applyMachineRoomCriterion(db, id, withV2);
  // LA-1281, LA-1282: E-1, then M-0 and M-1 (M-1 reads M-0's band).
  const withA1 = await applyConstructionTypeCriterion(db, id, withV3, project.framingSystem ?? null);
  const withS1 = await applyFoundationCriterion(db, id, withA1, project.framingSystem ?? null);
  const withE1 = await applyElectricalCriterion(db, id, withS1);
  const derived = await applyHvacCriteria(db, id, withE1);

  const facts: Record<string, string> = {};
  for (const name of ["elevatorType", "hydraulicJackType", "elevatorMachineRooms", "elevatorMachineRoomHvac"]) {
    const value = derived.facts?.[name];
    if (typeof value === "string" || typeof value === "number") facts[name] = String(value);
  }
  const criteria = (await listDerivedAssumptions(db, id)).filter((one) => CODES.has(one.code));
  return NextResponse.json({ criteria, facts });
}
