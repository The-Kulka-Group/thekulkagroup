import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getUnderwritingCase } from "@/lib/underwriting/cases";
import { getUnderwritingRun } from "@/lib/underwriting/runs";
import { underwritingWorkbookLayout, WorkbookFormulaTooLongError } from "@/lib/underwriting/workbook/layout";
import { workbookFileName, workbookSourceFor } from "@/lib/underwriting/workbook/source";
import { writeUnderwritingWorkbook } from "@/lib/underwriting/workbook/write";
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string; runId: string }> };

// LA-1947. Downloads a saved run as an Excel workbook.
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
    return NextResponse.json({ error: "Only a completed run with returns can be exported to Excel." }, { status: 409 });
  }

  let layout;
  try {
    layout = underwritingWorkbookLayout(source);
  } catch (error) {
    if (error instanceof WorkbookFormulaTooLongError) {
      return NextResponse.json({ error: "This case has more lines than one Excel formula can add up. Split the unit types or lines and run it again." }, { status: 409 });
    }
    // The workbook rebuilds the cost schedule from the saved inputs. A run saved by an older model can fail that.
    return NextResponse.json({ error: "This run's inputs no longer calculate. Run the case again to export it." }, { status: 409 });
  }
  const xlsx = await writeUnderwritingWorkbook(layout);
  const fileName = workbookFileName(source);
  return new Response(new Uint8Array(xlsx), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
