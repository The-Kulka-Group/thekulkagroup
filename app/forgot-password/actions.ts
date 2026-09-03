"use server";

import { allowedEmailsFrom, safeAuthEmail, safeReturnPath, siteUrlFrom } from "@/lib/auth/policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type RecoveryState = { error: string | null; message: string | null };

const SENT_MESSAGE = "If the address has access, a password reset email is on the way.";

export async function requestPasswordReset(
  _state: RecoveryState,
  formData: FormData,
): Promise<RecoveryState> {
  const email = safeAuthEmail(String(formData.get("email") ?? ""));
  const next = safeReturnPath(String(formData.get("next") ?? "/"));

  if (process.env.NODE_ENV !== "production" && process.env.KULKA_BROWSER_TEST === "1") {
    return { error: null, message: SENT_MESSAGE };
  }

  const allowedEmails = allowedEmailsFrom(process.env.KULKA_AUTH_ALLOWED_EMAILS);
  const siteUrl = siteUrlFrom(process.env.KULKA_SITE_URL);
  if (!allowedEmails || !siteUrl) {
    return { error: "Password reset is unavailable.", message: null };
  }
  if (!email) return { error: null, message: SENT_MESSAGE };

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/continue?next=${encodeURIComponent(next)}`,
    });
  } catch {
    // The response stays the same so callers cannot infer account membership.
  }

  return { error: null, message: SENT_MESSAGE };
}
