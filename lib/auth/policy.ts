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
  if (target.pathname === "/login" || target.pathname.startsWith("/login/")) return "/";
  return `${target.pathname}${target.search}${target.hash}`;
}
