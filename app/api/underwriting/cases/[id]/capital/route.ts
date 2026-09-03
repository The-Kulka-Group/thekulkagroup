import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import {
  getUnderwritingCase,
  saveDevelopmentCapital,
  UnderwritingCaseRevisionConflict,
} from "@/lib/underwriting/cases";
import {
  InvalidDevelopmentCapital,
  parseDevelopmentCapital,
} from "@/lib/underwriting/capital-input";
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON development capital inputs." }, { status: 400 });
  }
  const expectedRevision = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).expectedRevision
    : undefined;
  if (!Number.isSafeInteger(expectedRevision) || Number(expectedRevision) < 1) {
    return NextResponse.json({ error: "Send a valid expected case revision." }, { status: 400 });
  }

  const savedCase = await getUnderwritingCase(getDb(), id);
  if (!savedCase) return NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
  if (!savedCase.costSchedule || !savedCase.apartmentOperations) {
    return NextResponse.json({ error: "Save the monthly cost schedule and apartment operations before the capital plan." }, { status: 400 });
  }
  const { lastChangedAt: _operationsChangedAt, ...operations } = savedCase.apartmentOperations;
  void _operationsChangedAt;
  const operationsInputs = {
    analysisStartMonth: savedCase.costSchedule.analysisStartMonth,
    saleMonth: savedCase.costSchedule.saleMonth,
    costLines: savedCase.costSchedule.costLines.map(({ lastChangedAt: _changedAt, ...line }) => {
      void _changedAt;
      return line;
    }),
    ...operations,
  };
  try {
    const saved = await saveDevelopmentCapital(
      getDb(),
      id,
      Number(expectedRevision),
      parseDevelopmentCapital(body, operationsInputs),
    );
    return saved
      ? NextResponse.json({ case: saved })
      : NextResponse.json({ error: "Underwriting case not found." }, { status: 404 });
  } catch (cause) {
    if (cause instanceof InvalidDevelopmentCapital) {
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
