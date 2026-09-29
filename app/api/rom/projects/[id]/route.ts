import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { deleteRomProject, ProjectFeedsPricing } from "@/lib/rom/budgets";
import { parseNewBudget, ProjectNotFoundForEdit, readRomProjectDetail, updateRomProject } from "@/lib/rom/projects";
import { isUuid } from "@/lib/uuid";

// LA-1110. Edit project: the header's "Edit project" action opens the same
// black side panel New budget uses, prefilled from GET, and PATCH saves it
// through the same parseNewBudget validation New budget uses. Saved runs are
// untouched -- a run is a fixed record, not a view over the live project row.

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const project = await readRomProjectDetail(getDb(), id);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  return NextResponse.json({ project });
}

export async function PATCH(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const parsed = parseNewBudget(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    await updateRomProject(getDb(), id, parsed.budget);
    return NextResponse.json({ projectId: id });
  } catch (cause) {
    if (cause instanceof ProjectNotFoundForEdit) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    throw cause;
  }
}

// LA-1322: Delete, from the All Budgets menu. It asks first on screen, cannot
// be undone, and refuses a past job other budgets price from (409).
export async function DELETE(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  try {
    await deleteRomProject(getDb(), id);
    return NextResponse.json({ projectId: id });
  } catch (cause) {
    if (cause instanceof ProjectNotFoundForEdit) return NextResponse.json({ error: cause.message }, { status: 404 });
    if (cause instanceof ProjectFeedsPricing) return NextResponse.json({ error: cause.message }, { status: 409 });
    throw cause;
  }
}
