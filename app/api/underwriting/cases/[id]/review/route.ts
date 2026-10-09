import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { InvalidJsonBody, JsonBodyTooLarge, readJsonBody } from "@/lib/http/json-body";
import {
  getUnderwritingCase,
  saveApartmentOperations,
  saveApartmentScenarios,
  saveDevelopmentCapital,
  savePropertyReturns,
  saveUnderwritingCostSchedule,
  updateUnderwritingCase,
  UnderwritingCaseRevisionConflict,
} from "@/lib/underwriting/cases";
import { isReviewSectionKey, planSectionDone } from "@/lib/underwriting/review-done";
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string }> };

// LA-2054. Mark Section Done: one save sets every review state in one section to Done.
export async function PUT(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await readJsonBody(request);
  } catch (cause) {
    if (cause instanceof JsonBodyTooLarge) {
      return NextResponse.json({ error: "The JSON request body is too large." }, { status: 413 });
    }
    if (!(cause instanceof InvalidJsonBody)) throw cause;
    return NextResponse.json({ error: "Send JSON naming the section." }, { status: 400 });
  }
  const fields = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const expectedRevision = fields.expectedRevision;
  if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) {
    return NextResponse.json({ error: "Send a valid expected project revision." }, { status: 400 });
  }
  if (!isReviewSectionKey(fields.section)) {
    return NextResponse.json({ error: "Send a section to mark done." }, { status: 400 });
  }

  const existing = await getUnderwritingCase(getDb(), id);
  if (!existing) return NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });
  const plan = planSectionDone(existing, fields.section);
  if (!plan) return NextResponse.json({ error: "This section has nothing saved to mark done." }, { status: 400 });

  const revision = Number(expectedRevision);
  try {
    const db = getDb();
    const saved = plan.save === "case" ? await updateUnderwritingCase(db, id, plan.draft, revision)
      : plan.save === "schedule" ? await saveUnderwritingCostSchedule(db, id, revision, plan.schedule)
      : plan.save === "operations" ? await saveApartmentOperations(db, id, revision, plan.operations)
      : plan.save === "capital" ? await saveDevelopmentCapital(db, id, revision, plan.capital)
      : plan.save === "returns" ? await savePropertyReturns(db, id, revision, plan.propertyReturns)
      : await saveApartmentScenarios(db, id, revision, plan.scenarios);
    return saved
      ? NextResponse.json({ case: saved })
      : NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });
  } catch (cause) {
    if (cause instanceof UnderwritingCaseRevisionConflict) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}
