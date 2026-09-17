import type { User } from "@supabase/supabase-js";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_TOKEN_HASH = /^[A-Za-z0-9_-]{16,512}$/;

export type AuthEmailType = "invite" | "magiclink";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function safeAuthEmail(value: string | null | undefined) {
  const email = normalizeEmail(value ?? "");
  return email.length <= 254 && EMAIL.test(email) ? email : null;
}

export function allowedEmailsFrom(value: string | undefined): ReadonlySet<string> | null {
  if (!value) return null;
  const emails = value.split(",").map(normalizeEmail);
  const unique = new Set(emails);
  if (emails.length !== 5 || unique.size !== 5 || emails.some((email) => !EMAIL.test(email))) {
    return null;
  }
  return unique;
}

export function verifiedAllowedEmail(
  user: Pick<User, "email" | "email_confirmed_at">,
  allowedEmails: ReadonlySet<string>,
) {
  if (!user.email_confirmed_at) return null;
  const email = normalizeEmail(user.email ?? "");
  return allowedEmails.has(email) ? email : null;
}

export function authConfiguration(
  urlValue: string | undefined,
  keyValue: string | undefined,
  allowlistValue: string | undefined,
) {
  const allowedEmails = allowedEmailsFrom(allowlistValue);
  let url: URL | null = null;
  try {
    url = new URL(urlValue ?? "");
  } catch {
    return null;
  }
  if (!allowedEmails || !["http:", "https:"].includes(url.protocol)) return null;
  const publishableKey = keyValue?.trim();
  if (!publishableKey) return null;
  return { url: url.toString().replace(/\/$/, ""), publishableKey, allowedEmails };
}

export function safeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/")) return "/";
  const base = new URL("https://kulka.invalid");
  let target: URL;
  try {
    target = new URL(value, base);
  } catch {
    return "/";
  }
  if (target.origin !== base.origin) return "/";
  try {
    if (value.includes("\\") || decodeURIComponent(target.pathname).includes("\\")) return "/";
  } catch {
    return "/";
  }
  const firstSegment = target.pathname.split("/")[1];
  if (["login", "auth"].includes(firstSegment)) return "/";
  return `${target.pathname}${target.search}${target.hash}`;
}

export function safeAuthEmailType(value: string | null | undefined): AuthEmailType | null {
  return value === "invite" || value === "magiclink" ? value : null;
}

export function safeAuthTokenHash(value: string | null | undefined) {
  return value && AUTH_TOKEN_HASH.test(value) ? value : null;
}

export function siteUrlFrom(value: string | undefined) {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    return null;
  }
  return url.origin;
}
