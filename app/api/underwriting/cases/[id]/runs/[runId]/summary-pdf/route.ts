import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getUnderwritingCase } from "@/lib/underwriting/cases";
import { renderSummaryPdf, SummaryLayoutError } from "@/lib/underwriting/pdf/render";
import { summaryFileName } from "@/lib/underwriting/pdf/summary";
import { getUnderwritingRun } from "@/lib/underwriting/runs";
import { workbookSourceFor } from "@/lib/underwriting/workbook/source";
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string; runId: string }> };

export const maxDuration = 60;

// LA-1948. Downloads a saved run as a branded PDF deal summary.
export async function GET(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  const { id, runId } = await context.params;
  if (!isUuid(id) || !isUuid(runId)) return NextResponse.json({ error: "Calculation run not found." }, { status: 404 });

  const db = getDb();
  const [savedCase, run] = await Promise.all([getUnderwritingCase(db, id), getUnderwritingRun(db, runId)]);
  if (!savedCase || !run || run.caseId !== savedCase.id) {
    return NextResponse.json({ error: "Calculation run not found." }, { status: 404 });
  }
  const source = workbookSourceFor(savedCase, run);
  if (!source) {
    return NextResponse.json({ error: "Only a completed run with returns can be printed." }, { status: 409 });
  }

  try {
    const pdf = await renderSummaryPdf(source);
    const fileName = summaryFileName(source);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof SummaryLayoutError ? error.message : "The deal summary could not be printed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
