import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { ProjectNotFoundForEdit, restoreRomProject } from "@/lib/rom/projects";
import { isUuid } from "@/lib/uuid";

// LA-1110. Restore: clears projects.archived_at. Always allowed, including
// for a project that was never archived (idempotent no-op).

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  try {
    await restoreRomProject(getDb(), id);
    return NextResponse.json({ projectId: id });
  } catch (cause) {
    if (cause instanceof ProjectNotFoundForEdit) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    throw cause;
  }
}
