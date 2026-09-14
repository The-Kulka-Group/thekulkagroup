"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  type AuthEmailType,
  authConfiguration,
  safeAuthEmailType,
  safeAuthTokenHash,
  safeReturnPath,
} from "@/lib/auth/policy";
import { authorizeVerifiedUser } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function invalidLink(type: AuthEmailType | null) {
  return type
    ? `/auth/continue?error=invalid&type=${type}`
    : "/auth/continue?error=invalid";
}

function passwordPage(next: string, type: "invite" | "recovery") {
  return `/update-password?next=${encodeURIComponent(next)}&flow=${type}`;
}

export async function confirmAuthLink(formData: FormData) {
  const tokenHash = safeAuthTokenHash(String(formData.get("token_hash") ?? ""));
  const type = safeAuthEmailType(String(formData.get("type") ?? ""));
  const next = safeReturnPath(String(formData.get("next") ?? "/"));

  if (!tokenHash || !type) redirect(invalidLink(type));

  if (process.env.NODE_ENV !== "production" && process.env.KULKA_BROWSER_TEST === "1") {
    if (tokenHash !== "browser-test-token") redirect(invalidLink(type));
    (await cookies()).set("kulka-test-auth", "allowed", { httpOnly: true, sameSite: "lax" });
    redirect(passwordPage(next, type));
  }

  const configured = authConfiguration(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.KULKA_AUTH_ALLOWED_EMAILS,
  );
  if (!configured) redirect(invalidLink(type));

  const supabase = await createSupabaseServerClient();
  const result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (result.error || !result.data.user) redirect(invalidLink(type));

  const authorization = await authorizeVerifiedUser(
    async () => result.data.user,
    process.env.KULKA_AUTH_ALLOWED_EMAILS,
  );
  if (!authorization.ok) {
    await supabase.auth.signOut();
    redirect(invalidLink(type));
  }

  redirect(passwordPage(next, type));
}
