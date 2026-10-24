"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { parseViewAs, resolveViewer, VIEW_AS_COOKIE, viewAsValue } from "@/lib/access/viewer";
import { authorizeRequest, isUnrestrictedUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";

// LA-3047. View As: an Owner sees the whole app as one person or one role
// until they switch back. Kept in a cookie, so it works with sign-in off.

const COOKIE = { path: "/", httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8 };

export async function startViewAs(value: string): Promise<{ ok: boolean; error?: string }> {
  const target = parseViewAs(value);
  if (!target) return { ok: false, error: "Pick a person or a role." };
  // Judge the real user, not whoever they may already be viewing as.
  const auth = await authorizeRequest();
  if (!auth.ok) return { ok: false, error: auth.error };
  const real = await resolveViewer(getDb(), { email: auth.user.email, unrestricted: isUnrestrictedUser(auth.user) }, null);
  if (!real.canViewAs) return { ok: false, error: "Only an Owner can View As." };
  (await cookies()).set(VIEW_AS_COOKIE, viewAsValue(target), COOKIE);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function stopViewAs(): Promise<void> {
  (await cookies()).delete(VIEW_AS_COOKIE);
  revalidatePath("/", "layout");
}
