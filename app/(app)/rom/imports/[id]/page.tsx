import Link from "next/link";
import { notFound } from "next/navigation";

import { Sheet, Sep } from "@/components/Sheet";
import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { CostImportNotFound, getCostImport, listCanonicalItems } from "@/lib/rom/ingest";
import { readJob } from "@/lib/rom/job-confidence";
import { isUuid } from "@/lib/uuid";

import { ImportReview } from "./ImportReview";
import { JobConfidence } from "./JobConfidence";

export const dynamic = "force-dynamic";

// LA-978's review page: every line an upload staged, a way to fix a line's
// match or exclude it, running totals, and an approve button -- see
// ./ImportReview.tsx for the interactive part. This file only reads.
export default async function CostImportReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();

  let costImport;
  try {
    costImport = await getCostImport(getDb(), id);
  } catch (cause) {
    if (cause instanceof CostImportNotFound) notFound();
    throw cause;
  }

  const auth = await authorizeRequest();
  const canonicalItems = auth.ok ? await listCanonicalItems(getDb()) : [];
  // LA-2967: the source job's estimator confidence score. Only a ProEst
  // budget reads it, so an actuals import does not show it.
  const job =
    auth.ok && costImport.provenanceKind === "proest_budget"
      ? await readJob(getDb(), costImport.sourceProjectId)
      : null;

  return (
    <Sheet
      number="R-116"
      title={costImport.exportLabel}
      actions={
        <Link className="btn btn--secondary" href="/rom/imports">
          All imports
        </Link>
      }
      meta={
        <>
          <span>{costImport.status === "approved" ? "Approved" : "Staged"}</span>
          <Sep />
          <span>{costImport.lines.length === 1 ? "1 line" : `${costImport.lines.length} lines`}</span>
          <Sep />
          <span>{costImport.provenanceKind === "actuals" ? "Actuals" : "ProEst budget"}</span>
        </>
      }
    >
      {auth.ok ? (
        <>
          {job ? (
            <JobConfidence projectId={costImport.sourceProjectId} projectName={job.name} initial={job.confidence} />
          ) : null}
          <ImportReview costImport={costImport} canonicalItems={canonicalItems} />
        </>
      ) : (
        <p className="empty">Sign in with an authorized account to review this import.</p>
      )}
    </Sheet>
  );
}
