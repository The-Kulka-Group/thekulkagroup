import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { InvalidJsonBody, JsonBodyTooLarge, readJsonBody } from "@/lib/http/json-body";
import {
  getUnderwritingCase,
  saveUnderwritingCostSchedule,
  UnderwritingCaseRevisionConflict,
} from "@/lib/underwriting/cases";
import { InvalidCostSchedule, parseCostSchedule } from "@/lib/underwriting/schedule-input";
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string }> };

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
    return NextResponse.json({ error: "Send a JSON cost schedule." }, { status: 400 });
  }
  const expectedRevision = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).expectedRevision
    : undefined;
  if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) {
    return NextResponse.json({ error: "Send a valid expected project revision." }, { status: 400 });
  }

  const existing = await getUnderwritingCase(getDb(), id);
  if (!existing) return NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });
  try {
    const savedCase = await saveUnderwritingCostSchedule(
      getDb(),
      id,
      Number(expectedRevision),
      parseCostSchedule(body, {
        ...(existing.grossBuildingSquareFeet !== undefined ? { grossSquareFeet: existing.grossBuildingSquareFeet } : {}),
        ...(existing.proposedUnits !== undefined ? { units: existing.proposedUnits } : {}),
      }),
    );
    return savedCase
      ? NextResponse.json({ case: savedCase })
      : NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });
  } catch (cause) {
    if (cause instanceof InvalidCostSchedule) {
      return NextResponse.json({
        error: cause.message,
        fieldErrors: cause.fieldErrors,
        issues: cause.issues,
      }, { status: 400 });
    }
    if (cause instanceof UnderwritingCaseRevisionConflict) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}
