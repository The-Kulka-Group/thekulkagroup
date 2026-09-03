import { NextResponse } from "next/server";

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
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });

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
    return NextResponse.json({ error: "Send a valid expected case revision." }, { status: 400 });
  }

  const savedCase = await getUnderwritingCase(getDb(), id);
  if (!savedCase) return NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
  if (!savedCase.costSchedule) {
    return NextResponse.json({ error: "Save the monthly cost schedule before apartment operations." }, { status: 400 });
  }
  const costSchedule = {
    analysisStartMonth: savedCase.costSchedule.analysisStartMonth,
    saleMonth: savedCase.costSchedule.saleMonth,
    costLines: savedCase.costSchedule.costLines.map((line) => ({
      id: line.id,
      name: line.name,
      category: line.category,
      amount: line.amount,
      unit: line.unit,
      startMonth: line.startMonth,
      endMonth: line.endMonth,
      distributionMethod: line.distributionMethod,
      distributionVersion: line.distributionVersion,
      sourceLabel: line.sourceLabel,
      sourceDate: line.sourceDate,
      reviewState: line.reviewState,
    })),
  };
  try {
    const saved = await saveApartmentOperations(
      getDb(),
      id,
      Number(expectedRevision),
      parseApartmentOperations(body, costSchedule),
    );
    return saved
      ? NextResponse.json({ case: saved })
      : NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
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
