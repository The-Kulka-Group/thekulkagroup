"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { authorizeVerifiedUser } from "@/lib/auth/server";
import { authConfiguration, safeReturnPath } from "@/lib/auth/policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null };

export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const next = safeReturnPath(String(formData.get("next") ?? "/"));
  if (!email || !password) return { error: "Enter your email and password." };

  if (process.env.NODE_ENV !== "production" && process.env.KULKA_BROWSER_TEST === "1") {
    if (email !== "browser-test@kulka.invalid" || password !== "local-browser-test-password") {
      return { error: "The email or password is incorrect." };
    }
    (await cookies()).set("kulka-test-auth", "allowed", { httpOnly: true, sameSite: "lax" });
    redirect(next);
  }

  if (!authConfiguration(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    process.env.KULKA_AUTH_ALLOWED_EMAILS,
  )) return { error: "Sign-in is not configured." };

  const supabase = await createSupabaseServerClient();
  const result = await supabase.auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user) return { error: "The email or password is incorrect." };

  const authorization = await authorizeVerifiedUser(
    async () => result.data.user,
    process.env.KULKA_AUTH_ALLOWED_EMAILS,
  );
  if (!authorization.ok) {
    await supabase.auth.signOut();
    return {
      error: authorization.status === 503
        ? authorization.error
        : "The email or password is incorrect.",
    };
  }
  redirect(next);
}

export async function signOut() {
  if (process.env.NODE_ENV !== "production" && process.env.KULKA_BROWSER_TEST === "1") {
    (await cookies()).set("kulka-test-auth", "signed-out", { httpOnly: true, sameSite: "lax" });
    redirect("/login");
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
