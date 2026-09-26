import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { readProjectFramingSystem } from "@/lib/rom/framing";
import { readProjectGateAnswers } from "@/lib/rom/gates";
import { readMarkupOptions } from "@/lib/rom/markup";
import { getRun, listRuns } from "@/lib/rom/run-records";

import { RomRunner } from "./RomRunner";
import { loadedRunFrom, savedRunsFor } from "./saved-runs";

export const dynamic = "force-dynamic";

// The page only runs against a project that Kulka has approved and configured.
// Production starts empty, so there is no invented fallback project or value.
//
// LA-1016: the GRs/GCs module needs the staffing and field-office rate
// tables, the fee and insurance parameters, and how many jobs stand behind
// each setup. They are read here for a signed-in user, the same way the
// import review page reads the canonical items.
//
// LA-1028: the Scope module needs the project's own recorded answers to the
// nine yes/no scope questions, read the same way and on the same signed-in
// gate.
//
// LA-1101: the saved-runs strip lists this project's finished runs, and the
// newest one opens on the first screen so the page leads with an answer. A
// project with no finished run opens empty and says so.
export default async function RomPage() {
  const projectId = process.env.ROM_PROJECT_ID;
  const auth = projectId ? await authorizeRequest() : null;
  if (!projectId || !auth?.ok) return <RomRunner projectId={projectId} />;

  const db = getDb();
  const [markupOptions, scopeDefaults, framingDefault, allRuns] = await Promise.all([
    readMarkupOptions(db),
    readProjectGateAnswers(db, projectId),
    readProjectFramingSystem(db, projectId),
    listRuns(db),
  ]);
  const runs = savedRunsFor(allRuns, projectId);
  const initialRun = runs[0] ? loadedRunFrom(await getRun(db, runs[0].id)) : null;

  return (
    <RomRunner
      projectId={projectId}
      markupOptions={markupOptions}
      scopeDefaults={scopeDefaults}
      framingDefault={framingDefault}
      initialRuns={runs}
      initialRun={initialRun}
    />
  );
}
