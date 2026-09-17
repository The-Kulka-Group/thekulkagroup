"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { allowedEmailsFrom, safeAuthEmail, safeReturnPath, siteUrlFrom } from "@/lib/auth/policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type LoginState = { error: string | null; message: string | null };

const SENT_MESSAGE = "If that address has access, a sign-in link is on the way.";

export async function signIn(_state: LoginState, formData: FormData): Promise<LoginState> {
  const email = safeAuthEmail(String(formData.get("email") ?? ""));
  const next = safeReturnPath(String(formData.get("next") ?? "/"));

  if (process.env.NODE_ENV !== "production" && process.env.KULKA_BROWSER_TEST === "1") {
    if (email === "browser-test@kulka.invalid") {
      (await cookies()).set("kulka-test-auth", "allowed", { httpOnly: true, sameSite: "lax" });
      redirect(next);
    }
    return { error: null, message: SENT_MESSAGE };
  }

  const allowedEmails = allowedEmailsFrom(process.env.KULKA_AUTH_ALLOWED_EMAILS);
  const siteUrl = siteUrlFrom(process.env.KULKA_SITE_URL);
  if (!allowedEmails || !siteUrl) {
    return { error: "Sign-in is not configured.", message: null };
  }
  if (!email || !allowedEmails.has(email)) return { error: null, message: SENT_MESSAGE };

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/continue?next=${encodeURIComponent(next)}` },
    });
  } catch {
    // The response stays the same so callers cannot infer account membership.
  }

  return { error: null, message: SENT_MESSAGE };
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
