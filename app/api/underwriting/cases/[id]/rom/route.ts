import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  applyLatestRomRun,
  linkRomProject,
  listRomBudgetOptions,
  readRomLink,
  RomLinkError,
} from "@/lib/underwriting/rom-link";
import { isUuid } from "@/lib/uuid";

type Context = { params: Promise<{ id: string }> };

// LA-2417. The case's linked ROM budget and the budgets it could link.
export async function GET(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });
  const db = getDb();
  const [link, budgets] = await Promise.all([readRomLink(db, id), listRomBudgetOptions(db, id)]);
  return NextResponse.json({ link, budgets });
}

// `{ projectId }` links that budget and fills hard cost from its newest run.
// `{}` fills hard cost again from the linked budget's newest run.
export async function POST(request: Request, context: Context) {
  const denied = await requireApiUser(request);
  if (denied) return denied;
  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Underwriting project not found." }, { status: 404 });

  let body: unknown = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const projectId = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).projectId
    : undefined;
  if (projectId !== undefined && (typeof projectId !== "string" || !isUuid(projectId))) {
    return NextResponse.json({ error: "Send projectId as a ROM budget id." }, { status: 400 });
  }

  const db = getDb();
  try {
    if (projectId) await linkRomProject(db, id, projectId);
    const applied = await applyLatestRomRun(db, id);
    return NextResponse.json({ applied, link: await readRomLink(db, id) });
  } catch (cause) {
    if (cause instanceof RomLinkError) return NextResponse.json({ error: cause.message }, { status: cause.status });
    throw cause;
  }
}
