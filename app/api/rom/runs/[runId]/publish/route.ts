import { NextResponse } from "next/server";

import { linkFor } from "@/app/(app)/rom/publish-model";
import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { RunNotFound, RunNotSucceeded } from "@/lib/rom/issue";
import { parsePublishBody } from "@/lib/rom/publish-request";
import { pdfSeams } from "@/lib/rom/pdf-seams";
import { linkOrigin, publishBudget } from "@/lib/rom/published-budgets";
import { renderPublishedPdf } from "@/lib/rom/published-pdf";
import { isUuid } from "@/lib/uuid";

// LA-1419. Publish a saved run as the project's next version (LA-1309). The
// estimator writes prepared for, prepared by, the cover sentence and how many
// days the figures stay valid; nothing here writes any of them. Each call
// makes a new version with its own link and marks the earlier ones
// superseded (lib/rom/published-budgets.ts). This is an action on a saved
// budget, not a run: it never calls the engine.
//
// LA-1420. After the row is committed the PDF is printed once and stored
// (lib/rom/published-pdf.ts). A failure to print never fails the publish: the
// link works, pdf_path stays null, and the response says so under `pdf`.

// Headless Chromium needs the time. Vercel's default would cut a cold start short.
export const maxDuration = 60;

type Context = { params: Promise<{ runId: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { runId } = await context.params;
  if (!isUuid(runId)) return NextResponse.json({ error: "Run not found." }, { status: 404 });

  const body = await request.json().catch(() => undefined);
  const parsed = parsePublishBody(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const db = getDb();
    const { snapshot, ...published } = await publishBudget(db, { runId, issuedBy: auth.user.email, copy: parsed.copy });
    // The snapshot is in hand, so the PDF prints from it rather than reading the row back.
    const outcome = await renderPublishedPdf(db, published, pdfSeams, {
      snapshot,
      version: published.version,
      stage: published.stage,
      issuedAt: published.issuedAt,
    });
    const link = linkFor(linkOrigin(request.url), published.token);
    return NextResponse.json({
      published: { ...published, pdfPath: outcome.ok ? outcome.path : published.pdfPath, link },
      pdf: outcome.ok
        ? { ok: true }
        : { ok: false, message: "The budget is published and its link works, but its PDF could not be made. The link opens without a PDF." },
    });
  } catch (cause) {
    if (cause instanceof RunNotFound) return NextResponse.json({ error: "Run not found." }, { status: 404 });
    if (cause instanceof RunNotSucceeded) {
      return NextResponse.json({ error: "Only a finished run can be published." }, { status: 409 });
    }
    throw cause;
  }
}
