import { NextResponse } from "next/server";

import type { Rom } from "@kulka/engine";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { rateClient } from "@/lib/rom/rate-suggestion";
import { draftScope, readItemDefinition, ScopeDraftFailed } from "@/lib/rom/scope-draft";
import { addLineEntries, listLineEntries } from "@/lib/rom/scope-entries";
import { isUuid } from "@/lib/uuid";

// LA-1503. POST { costCode, runId } asks AI for one item's Inclusions and
// Exclusions from Kulka's definition of the item and the answers that run
// priced, and saves them straight away as drafts (Kulka rule: no Generate
// step, the answer applies as given). None is approved. An entry the line
// already has is not added twice.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Project not found." }, { status: 404 });
  const client = rateClient();
  if (!client) {
    return NextResponse.json({ error: "Drafts are not set up yet. The site needs an Anthropic API key." }, { status: 503 });
  }

  const body: unknown = await request.json().catch(() => undefined);
  const { costCode, runId } = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  if (typeof costCode !== "string" || costCode.trim() === "" || typeof runId !== "string" || !isUuid(runId)) {
    return NextResponse.json({ error: "Send the item's costCode and the runId." }, { status: 400 });
  }

  const db = getDb();
  const run = await db.query<{ rom: Rom | null; answers: Record<string, unknown> | null }>(
    `select rom, answers from runs where id = $1 and project_id = $2`,
    [runId, id],
  );
  const rom = run.rows[0]?.rom;
  if (!rom) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const item = [...rom.lines, ...rom.unpricedItems].find((line) => line.costCode === costCode);
  if (!item) return NextResponse.json({ error: "That item is not in this budget." }, { status: 404 });

  const definition = await readItemDefinition(db, costCode);
  if (!definition) {
    return NextResponse.json(
      { error: "Kulka has no written definition of this item to draft from. Write its entries by hand." },
      { status: 422 },
    );
  }

  const { facts, branchGates, ...rest } = (run.rows[0].answers ?? {}) as Record<string, unknown>;
  const answers = { ...rest, ...(branchGates as object | undefined), ...(facts as object | undefined) };

  try {
    const draft = await draftScope(client, { itemLabel: item.label, definition, answers });
    const existing = new Set((await listLineEntries(db, id, costCode)).map((e) => `${e.side}:${e.text.toLowerCase()}`));
    const fresh = (side: "include" | "exclude", texts: string[]) => texts.filter((t) => !existing.has(`${side}:${t.toLowerCase()}`));
    const base = { projectId: id, costCode, drafter: "ai" as const, draftedBy: auth.user.email };
    await addLineEntries(db, { ...base, side: "include", texts: fresh("include", draft.includes) });
    await addLineEntries(db, { ...base, side: "exclude", texts: fresh("exclude", draft.excludes) });
    return NextResponse.json({ entries: await listLineEntries(db, id, costCode) }, { status: 201 });
  } catch (cause) {
    if (cause instanceof ScopeDraftFailed) return NextResponse.json({ error: cause.message }, { status: 502 });
    return NextResponse.json({ error: "The draft could not be made. Try again." }, { status: 502 });
  }
}
