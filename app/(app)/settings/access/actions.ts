"use server";

import { revalidatePath } from "next/cache";

import type { Level, TargetKind } from "@/lib/access/level";
import { addPerson } from "@/lib/access/read";
import { AccessWriteError, removeException, setException, setRoleAccess } from "@/lib/access/store";
import { authIsOpen, authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { currentViewer } from "@/lib/access/current";
import { viewerLevel } from "@/lib/access/viewer";

// LA-3046. Writes from the People and Access pages. Each one names who made
// it from the signed-in account. While sign-in is off there is no account, so
// the log says Open Access. Who may make these changes comes with
// enforcement (LA-3047): every write here needs Edit on People and Access.

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const LEVELS: readonly Level[] = ["hidden", "view", "edit"];
const KINDS: readonly TargetKind[] = ["department", "tool"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function actor(): Promise<string> {
  const auth = await authorizeRequest();
  if (!auth.ok) throw new AccessWriteError("Sign in to change access.");
  if (viewerLevel(await currentViewer(), "access") !== "edit") {
    throw new AccessWriteError("You can view People and Access, but you cannot change it.");
  }
  return authIsOpen() ? "Open Access" : auth.user.email;
}

async function run(fn: (by: string) => Promise<string | void>): Promise<ActionResult> {
  try {
    const id = await fn(await actor());
    revalidatePath("/settings/access", "layout");
    return id ? { ok: true, id } : { ok: true };
  } catch (cause) {
    if (cause instanceof AccessWriteError) return { ok: false, error: cause.message };
    console.error("Access change failed.", cause);
    return { ok: false, error: "That change did not save. Try again." };
  }
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

export async function setRoleLevel(roleKey: string, targetKind: TargetKind, targetKey: string, level: Level | null): Promise<ActionResult> {
  if (!KINDS.includes(targetKind) || (level !== null && !LEVELS.includes(level))) return { ok: false, error: "That is not a level." };
  return run((by) => setRoleAccess(getDb(), { roleKey, targetKind, targetKey, level, changedBy: by }));
}

export async function addPersonAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  return run(() =>
    addPerson(getDb(), { name: text(form, "name"), email: text(form, "email"), title: text(form, "title"), roleKey: text(form, "role") }),
  );
}

export async function addExceptionAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const [kind, key] = text(form, "target").split(":");
  const level = text(form, "level") as Level;
  const endsOn = text(form, "endsOn");
  if (!KINDS.includes(kind as TargetKind) || !key) return { ok: false, error: "Pick a tool or department." };
  if (!LEVELS.includes(level)) return { ok: false, error: "Pick a level." };
  if (endsOn && !DAY.test(endsOn)) return { ok: false, error: "Pick an end date, or leave it blank." };
  return run((by) =>
    setException(getDb(), {
      personId: text(form, "personId"),
      targetKind: kind as TargetKind,
      targetKey: key,
      level,
      reason: text(form, "reason"),
      endsOn: endsOn || null,
      setBy: by,
    }),
  );
}

export async function removeExceptionAction(personId: string, targetKind: TargetKind, targetKey: string): Promise<ActionResult> {
  if (!KINDS.includes(targetKind)) return { ok: false, error: "That is not a tool or department." };
  return run((by) => removeException(getDb(), { personId, targetKind, targetKey, changedBy: by }));
}
