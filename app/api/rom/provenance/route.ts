import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { RunProvenanceNotFound, readRunProvenance } from "@/lib/rom/provenance";
import { isUuid } from "@/lib/uuid";

// The drill-down payload (LA-18): every line of a finished run with the
// comparables behind it, the source kind and date of each, and its weight in
// the blend. Read only. It computes no cost and it adds no figure the run
// record does not already carry.

const missing = () => NextResponse.json({ error: "Run not found." }, { status: 404 });

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const runId = new URL(request.url).searchParams.get("runId") ?? "";
  if (!isUuid(runId)) return missing();

  try {
    return NextResponse.json({ provenance: await readRunProvenance(getDb(), runId) });
  } catch (cause) {
    if (cause instanceof RunProvenanceNotFound) return missing();
    throw cause;
  }
}
