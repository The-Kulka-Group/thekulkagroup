import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { readMarkupOptions } from "@/lib/rom/markup";

import { RomRunner } from "./RomRunner";

export const dynamic = "force-dynamic";

// The page only runs against a project that Kulka has approved and configured.
// Production starts empty, so there is no invented fallback project or value.
//
// LA-1016: the GRs/GCs module needs the staffing and field-office rate
// tables, the fee and insurance parameters, and how many jobs stand behind
// each setup. They are read here for a signed-in user, the same way the
// import review page reads the canonical items.
export default async function RomPage() {
  const projectId = process.env.ROM_PROJECT_ID;
  const auth = projectId ? await authorizeRequest() : null;
  const markupOptions = auth?.ok ? await readMarkupOptions(getDb()) : undefined;
  return <RomRunner projectId={projectId} markupOptions={markupOptions} />;
}
