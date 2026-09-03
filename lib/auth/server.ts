import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { allowedEmailsFrom, authConfiguration, normalizeEmail, temporaryAuthBypass } from "./policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthorizedUser = { id: string; email: string; temporary?: true };
export type Authorization =
  | { ok: true; user: AuthorizedUser }
  | { ok: false; status: 401 | 403 | 503; error: string };

type VerifyUser = () => Promise<{ id: string; email?: string } | null>;

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
    const email = normalizeEmail(user.email ?? "");
    if (!allowlist.has(email)) {
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

export async function authorizeRequest(request?: Request): Promise<Authorization> {
  // LA-173: remove KULKA_AUTH_BYPASS from Vercel and redeploy to restore LA-13.
  if (temporaryAuthBypass(process.env.KULKA_AUTH_BYPASS)) {
    return {
      ok: true,
      user: { id: "temporary-workspace", email: "Temporary Access", temporary: true },
    };
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
    return { id: data.user.id, email: data.user.email };
  }, process.env.KULKA_AUTH_ALLOWED_EMAILS);
}

export async function requireApiUser(request: Request) {
  const auth = await authorizeRequest(request);
  return auth.ok
    ? null
    : NextResponse.json({ error: auth.error }, { status: auth.status });
}
