"use server";

import { redirect } from "next/navigation";

import { passwordValidationError, safeReturnPath } from "@/lib/auth/policy";
import { authorizeRequest } from "@/lib/auth/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type PasswordState = { error: string | null };

export async function updatePassword(
  _state: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const next = safeReturnPath(String(formData.get("next") ?? "/"));
  const validationError = passwordValidationError(password, confirmation);
  if (validationError) return { error: validationError };

  const authorization = await authorizeRequest();
  if (!authorization.ok) return { error: "This password link is invalid or has expired." };

  if (process.env.NODE_ENV !== "production" && process.env.KULKA_BROWSER_TEST === "1") {
    redirect(next);
  }

  const supabase = await createSupabaseServerClient();
  const result = await supabase.auth.updateUser({ password });
  if (result.error) return { error: "The password could not be saved. Request a new link and try again." };
  redirect(next);
}
