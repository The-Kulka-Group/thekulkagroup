import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { resolveRomProjectId } from "@/lib/rom/projects";
import { tier1Flow } from "@/lib/rom/question-flow";

import { IntakeFlow } from "./IntakeFlow";

export const dynamic = "force-dynamic";

// The questions are not in this file and not in the component. They are read
// from `config/rom/tier1-flow.json` on the server and handed down, so editing
// that file changes what the page asks.
//
// LA-1107: the project comes from `?project=<id>`, checked against the
// projects table, and falls back to ROM_PROJECT_ID.
export default async function RomIntakePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { project } = await searchParams;
  let projectId = process.env.ROM_PROJECT_ID;
  if (project !== undefined) {
    const auth = await authorizeRequest();
    projectId = auth.ok
      ? (await resolveRomProjectId(getDb(), project, process.env.ROM_PROJECT_ID)).projectId
      : undefined;
  }
  return <IntakeFlow definition={tier1Flow()} projectId={projectId} />;
}
