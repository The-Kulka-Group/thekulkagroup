import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { readProjectFramingSystem } from "@/lib/rom/framing";
import { readProjectGateAnswers } from "@/lib/rom/gates";
import { readMarkupOptions, readProjectMarkupChoices } from "@/lib/rom/markup";
import { listRomProjects, resolveRomProjectId } from "@/lib/rom/projects";
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
//
// LA-1107: the project comes from `?project=<id>` and falls back to
// ROM_PROJECT_ID. The id is checked against the projects table before
// anything reads by it. The header's picker lists every project with a run.
export default async function RomPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const auth = await authorizeRequest();
  if (!auth.ok) return <RomRunner projectId={process.env.ROM_PROJECT_ID} />;

  const db = getDb();
  const { project } = await searchParams;
  const { projectId, notFound } = await resolveRomProjectId(db, project, process.env.ROM_PROJECT_ID);
  const projects = await listRomProjects(db);
  if (!projectId) return <RomRunner projects={projects} projectNotFound={notFound} />;

  const [markupOptions, markupDefault, scopeDefaults, framingDefault, allRuns] = await Promise.all([
    readMarkupOptions(db),
    readProjectMarkupChoices(db, projectId),
    readProjectGateAnswers(db, projectId),
    readProjectFramingSystem(db, projectId),
    listRuns(db),
  ]);
  const runs = savedRunsFor(allRuns, projectId);
  const initialRun = runs[0] ? loadedRunFrom(await getRun(db, runs[0].id)) : null;

  return (
    <RomRunner
      key={projectId}
      projectId={projectId}
      markupOptions={markupOptions}
      markupDefault={markupDefault}
      scopeDefaults={scopeDefaults}
      framingDefault={framingDefault}
      initialRuns={runs}
      initialRun={initialRun}
      projects={projects}
    />
  );
}
