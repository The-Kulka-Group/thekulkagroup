import { NextResponse } from "next/server";
import type { Answers } from "@kulka/engine";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { readApprovedJudgmentRules } from "@/lib/rom/judgment";
import { assembleSnapshot, readBenchmarkData, readParameterData } from "@/lib/rom/run";

// LA-1142: the data snapshot a run reads, for the New budget flow's live
// preview. Read only. It opens no run, writes no record, and computes nothing;
// the browser runs the same engine over it. The snapshot is assembled the way
// runRom assembles a run's with markups, so the preview can price GRs/GCs,
// fee and insurance once the Markups step is reached.

const PROJECT_TYPES: ReadonlySet<string> = new Set(["multifamily", "self_storage"]);
const CONSTRUCTION_KINDS: ReadonlySet<string> = new Set(["new", "renovation"]);

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const params = new URL(request.url).searchParams;
  const projectType = params.get("projectType") ?? "";
  const constructionKind = params.get("constructionKind") ?? "";
  if (!PROJECT_TYPES.has(projectType) || !CONSTRUCTION_KINDS.has(constructionKind)) {
    return NextResponse.json({ error: "Send a projectType and a constructionKind." }, { status: 400 });
  }

  const db = getDb();
  const type = projectType as Answers["projectType"];
  const kind = constructionKind as Answers["constructionKind"];
  const [data, rated, judgmentRules] = await Promise.all([
    readBenchmarkData(db, type, kind),
    readParameterData(db),
    readApprovedJudgmentRules(db, { projectType: type, constructionKind: kind }),
  ]);
  return NextResponse.json({ snapshot: assembleSnapshot(data, rated, judgmentRules, true) });
}
