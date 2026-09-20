import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { CostFileParseError, ProjectNotFound, stageCostImport } from "@/lib/rom/ingest";

// Stages an uploaded cost file (LA-15 AC1): every row lands in
// cost_import_lines, matched against the canonical work items, visible for
// review before anything reaches a benchmark. See lib/rom/ingest.ts for the
// gate itself and lib/rom/canonical-item-match.ts for the disclosed matching
// heuristic behind "mapped with confidence."
//
// Judgment call: the body carries the file's already-read text (`fileText`),
// not a multipart upload. This route is the ingestion gate's API layer, and
// every other route in this repo (see app/api/rom/route.ts) is JSON-only; a
// browser upload UI can read the file client-side and post this same shape
// without this route changing. Building that UI is not part of LA-15.
export async function POST(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const { sourceProjectId, exportLabel, provenanceKind, fileText } = (body ?? {}) as Record<
    string,
    unknown
  >;

  if (typeof sourceProjectId !== "string" || sourceProjectId.length === 0) {
    return NextResponse.json({ error: "Send a sourceProjectId." }, { status: 400 });
  }
  if (typeof exportLabel !== "string" || exportLabel.trim().length === 0) {
    return NextResponse.json({ error: "Send an exportLabel." }, { status: 400 });
  }
  if (provenanceKind !== "actuals" && provenanceKind !== "proest_budget") {
    return NextResponse.json(
      { error: 'Send a provenanceKind of "actuals" or "proest_budget".' },
      { status: 400 },
    );
  }
  if (typeof fileText !== "string" || fileText.length === 0) {
    return NextResponse.json({ error: "Send the file's fileText." }, { status: 400 });
  }

  try {
    const costImport = await stageCostImport(getDb(), {
      sourceProjectId,
      exportLabel: exportLabel.trim(),
      provenanceKind,
      uploadedBy: auth.user.email,
      fileText,
    });
    return NextResponse.json({ costImport }, { status: 201 });
  } catch (cause) {
    if (cause instanceof ProjectNotFound) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    if (cause instanceof CostFileParseError) {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
}
