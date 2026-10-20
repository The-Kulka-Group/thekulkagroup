import { NextResponse } from "next/server";

import { authIsOpen } from "@/lib/auth/server";

// LA-2894. The Autodesk sign-in reads cost data, so its routes need more than
// KULKA_AUTH_OPEN's "let everyone in". With app sign-in off they answer only
// on a *.vercel.app address, which Vercel Authentication covers ("all except
// custom domains", checked 2026-10-20), or on localhost in development. On a
// custom domain such as kulka.ai they refuse until app sign-in is back on.
// With app sign-in on, the allowlisted user check is the gate.

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostname(host: string) {
  return host.startsWith("[") ? host.slice(0, host.indexOf("]") + 1) : host.split(":")[0];
}

export function protectedHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const name = hostname(host.trim().toLowerCase());
  if (name.endsWith(".vercel.app")) return true;
  return process.env.NODE_ENV !== "production" && LOCAL.has(name);
}

/** True when this request may use the Autodesk sign-in at all, once the user check has passed. */
export function autodeskAllowed(host: string | null | undefined) {
  return !authIsOpen() || protectedHost(host);
}

function hostOf(request: Request) {
  return request.headers.get("host") ?? new URL(request.url).host;
}

/**
 * A 403 when the host is not covered, or when a browser sent a change from
 * another site. Null when the request may go on. Call after authorizeRequest.
 */
export function blockedRequest(request: Request): NextResponse | null {
  if (!autodeskAllowed(hostOf(request))) {
    return NextResponse.json(
      { error: "Autodesk sign-in works only on an address behind Vercel sign-in while app sign-in is off." },
      { status: 403, headers: NO_STORE },
    );
  }
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "This change must come from Kulka AI itself." }, { status: 403, headers: NO_STORE });
  }
  return null;
}
