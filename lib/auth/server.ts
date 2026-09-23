import { NextResponse, connection } from "next/server";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

import { allowedEmailsFrom, authConfiguration, verifiedAllowedEmail } from "./policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// This checks who is signed in, not what they're allowed to touch. There is
// no project-membership or ownership concept anywhere in this codebase: any
// allowlisted user can act on any project id. Deliberate (Matt, 2026-09-20,
// during LA-15's code review): the allowlist is small and internal at this
// stage, so per-project scoping isn't worth the complexity yet. If the user
// base grows past a small internal allowlist, this is the place a real
// project-membership check belongs.
export type AuthorizedUser = { id: string; email: string };
export type Authorization =
  | { ok: true; user: AuthorizedUser }
  | { ok: false; status: 401 | 403 | 503; error: string };

type VerifiedEmailUser = Pick<User, "id" | "email" | "email_confirmed_at">;
type VerifyUser = () => Promise<VerifiedEmailUser | null>;

export async function authorizeVerifiedUser(
  verifyUser: VerifyUser,
  allowlistValue: string | undefined,
): Promise<Authorization> {
  const allowlist = allowedEmailsFrom(allowlistValue);
  if (!allowlist) {
    return { ok: false, status: 503, error: "Sign-in is not configured." };
  }
  try {
    const user = await verifyUser();
    if (!user) return { ok: false, status: 401, error: "Sign in to continue." };
    const email = verifiedAllowedEmail(user, allowlist);
    if (!email) {
      return { ok: false, status: 403, error: "This account does not have access." };
    }
    return { ok: true, user: { id: user.id, email } };
  } catch {
    return { ok: false, status: 503, error: "Sign-in could not be verified." };
  }
}

async function testAuthorization(request?: Request): Promise<Authorization | null> {
  if (process.env.NODE_ENV === "production") return null;
  let mode = request?.headers.get("x-kulka-test-auth");
  if (!mode && process.env.KULKA_BROWSER_TEST === "1" && !request) {
    mode = (await cookies()).get("kulka-test-auth")?.value ?? null;
  }
  if (mode === "signed-out") return { ok: false, status: 401, error: "Sign in to continue." };
  if (mode === "forbidden") {
    return { ok: false, status: 403, error: "This account does not have access." };
  }
  if (process.env.NODE_ENV === "test" || process.env.KULKA_BROWSER_TEST === "1") {
    return { ok: true, user: { id: "test-user", email: "browser-test@kulka.invalid" } };
  }
  return null;
}

export const OPEN_ACCESS_USER: AuthorizedUser = {
  id: "open-access",
  email: "open-access@kulka.invalid",
};

export function authIsOpen() {
  return process.env.KULKA_AUTH_OPEN === "1";
}

export async function authorizeRequest(request?: Request): Promise<Authorization> {
  if (authIsOpen()) {
    await connection();
    return { ok: true, user: OPEN_ACCESS_USER };
  }
  const testResult = await testAuthorization(request);
  if (testResult) return testResult;
  if (!authConfiguration(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.KULKA_AUTH_ALLOWED_EMAILS,
  )) {
    return { ok: false, status: 503, error: "Sign-in is not configured." };
  }
  const supabase = await createSupabaseServerClient();
  return authorizeVerifiedUser(async () => {
    const { data, error } = await supabase.auth.getUser();
    if (!data.user) return null;
    if (error) throw error;
    return data.user;
  }, process.env.KULKA_AUTH_ALLOWED_EMAILS);
}

export async function requireApiUser(request: Request) {
  const auth = await authorizeRequest(request);
  return auth.ok
    ? null
    : NextResponse.json({ error: auth.error }, { status: auth.status });
}
