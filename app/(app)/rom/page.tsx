import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { readProjectFramingSystem } from "@/lib/rom/framing";
import { readProjectGateAnswers } from "@/lib/rom/gates";
import { readMarkupOptions, readProjectMarkupChoices } from "@/lib/rom/markup";
import { listRomProjects, resolveRomProjectId } from "@/lib/rom/projects";
import { getRun, listRuns } from "@/lib/rom/run-records";
import { readClassifications } from "@/lib/rom/run";

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
//
// LA-1141: `?new=1` opens the guided New budget panel on load -- /rom/intake
// redirects here with it set, since the guided flow now covers what intake
// asked. The Markups step needs the rate tables and history counts
// (LA-1016) regardless of whether a project is even selected yet, so
// readMarkupOptions is read unconditionally rather than only once a project
// resolves.
export default async function RomPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[]; new?: string | string[] }>;
}) {
  const auth = await authorizeRequest();
  if (!auth.ok) return <RomRunner projectId={process.env.ROM_PROJECT_ID} />;

  const db = getDb();
  const { project, new: newParam } = await searchParams;
  const openNewOnLoad = (Array.isArray(newParam) ? newParam[0] : newParam) === "1";
  const { projectId, notFound, archivedAt } = await resolveRomProjectId(db, project, process.env.ROM_PROJECT_ID);
  const [projects, markupOptions] = await Promise.all([listRomProjects(db), readMarkupOptions(db)]);
  if (!projectId) {
    return (
      <RomRunner
        projects={projects}
        projectNotFound={notFound}
        markupOptions={markupOptions}
        openNewOnLoad={openNewOnLoad}
      />
    );
  }

  // LA-1110: an archived project shows only its archived state and a
  // Restore button, not the pricing UI. It stays out of `projects` (the
  // header picker) so this only happens by a direct `?project=<id>` link.
  if (archivedAt) {
    return (
      <RomRunner
        key={`${projectId}-archived`}
        projectId={projectId}
        projects={projects}
        projectArchivedAt={archivedAt}
        isEnvProject={projectId === process.env.ROM_PROJECT_ID}
      />
    );
  }

  const [markupDefault, scopeDefaults, framingDefault, allRuns, classifications] = await Promise.all([
    readProjectMarkupChoices(db, projectId),
    readProjectGateAnswers(db, projectId),
    readProjectFramingSystem(db, projectId),
    listRuns(db),
    readClassifications(db),
  ]);
  const runs = savedRunsFor(allRuns, projectId);
  const initialRun = runs[0] ? loadedRunFrom(await getRun(db, runs[0].id)) : null;

  return (
    <RomRunner
      key={`${projectId}-active`}
      projectId={projectId}
      markupOptions={markupOptions}
      markupDefault={markupDefault}
      scopeDefaults={scopeDefaults}
      framingDefault={framingDefault}
      initialRuns={runs}
      initialRun={initialRun}
      projects={projects}
      isEnvProject={projectId === process.env.ROM_PROJECT_ID}
      openNewOnLoad={openNewOnLoad}
      classifications={classifications}
    />
  );
}
