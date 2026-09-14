export const PUBLIC_AUTH_ROUTES = [
  "/login",
  "/forgot-password",
  "/auth/continue",
] as const;

export const AUTH_ROUTES = [...PUBLIC_AUTH_ROUTES, "/update-password"] as const;

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
