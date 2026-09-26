import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { archiveRomProject, CannotArchiveEnvProject, ProjectNotFoundForEdit } from "@/lib/rom/projects";
import { isUuid } from "@/lib/uuid";

// LA-1110. Archive means archive, never a row delete (Matt, 2026-09-26):
// `projects` also holds past jobs the ROM prices benchmarks from, and a
// delete would strip their data out of every other project's blend. This
// only sets projects.archived_at, which listRomProjects filters on.
//
// The project configured for this environment (ROM_PROJECT_ID) can never be
// archived -- the tool that always resolves to it would go dark -- so the
// route refuses it the same way the Archive button in the panel disables
// itself for that project.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  try {
    await archiveRomProject(getDb(), id, process.env.ROM_PROJECT_ID);
    return NextResponse.json({ projectId: id });
  } catch (cause) {
    if (cause instanceof CannotArchiveEnvProject) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    if (cause instanceof ProjectNotFoundForEdit) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    throw cause;
  }
}
