export const PUBLIC_AUTH_ROUTES = [
  "/login",
  "/auth/continue",
] as const;

export const AUTH_ROUTES = PUBLIC_AUTH_ROUTES;

export const AUTH_SECURITY_HEADERS = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
} as const;

export function isPublicAuthRoute(pathname: string) {
  return PUBLIC_AUTH_ROUTES.some((route) => pathname === route);
}

export function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some((route) => pathname === route);
}

// LA-1417. A published budget opens for anyone holding its link, so /b/ sits
// outside sign-in and outside KULKA_AUTH_OPEN's handling. The token is the
// only key: the page is never indexed, never cached, and never sends it on
// in a Referer.
export const PUBLISHED_BUDGET_HEADERS = {
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
} as const;

export function isPublishedBudgetRoute(pathname: string) {
  return pathname.startsWith("/b/");
}

const PUBLISHED_PDF = /^\/b\/([A-Za-z0-9_-]{22})\.pdf$/;

/** `/b/<token>.pdf` is served by the route at `/b/<token>/pdf`; anything else is null. */
export function publishedPdfRoute(pathname: string): string | null {
  const match = PUBLISHED_PDF.exec(pathname);
  return match ? `/b/${match[1]}/pdf` : null;
}
