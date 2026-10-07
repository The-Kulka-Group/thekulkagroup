import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { InvalidJsonBody, JsonBodyTooLarge, readJsonBody } from "@/lib/http/json-body";
import {
  getUnderwritingCase,
  saveApartmentOperations,
  UnderwritingCaseRevisionConflict,
} from "@/lib/underwriting/cases";
import {
  InvalidApartmentOperations,
  parseApartmentOperations,
} from "@/lib/underwriting/operations-input";
import { monthlyInputsFor } from "@/lib/underwriting/runs";
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
    return NextResponse.json({ error: "Send JSON apartment operations inputs." }, { status: 400 });
  }
  const expectedRevision = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).expectedRevision
    : undefined;
  if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) {
    return NextResponse.json({ error: "Send a valid expected project revision." }, { status: 400 });
  }

  const savedCase = await getUnderwritingCase(getDb(), id);
  if (!savedCase) return NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });
  if (!savedCase.costSchedule) {
    return NextResponse.json({ error: "Save the monthly cost schedule before apartment operations." }, { status: 400 });
  }
  const costSchedule = monthlyInputsFor(savedCase.costSchedule);
  try {
    const saved = await saveApartmentOperations(
      getDb(),
      id,
      Number(expectedRevision),
      parseApartmentOperations(body, costSchedule),
    );
    return saved
      ? NextResponse.json({ case: saved })
      : NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });
  } catch (cause) {
    if (cause instanceof InvalidApartmentOperations) {
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
