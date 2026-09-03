const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function allowedEmailsFrom(value: string | undefined): ReadonlySet<string> | null {
  if (!value) return null;
  const emails = value.split(",").map(normalizeEmail);
  const unique = new Set(emails);
  if (emails.length !== 3 || unique.size !== 3 || emails.some((email) => !EMAIL.test(email))) {
    return null;
  }
  return unique;
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
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";
  const pathname = value.split("?", 1)[0];
  if (pathname === "/login" || pathname.startsWith("/login/")) return "/";
  return value;
}
