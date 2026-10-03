import { isToken, newToken } from "./published-budgets";

// LA-1486, ticket 3 of LA-1480 (spec docs/precon/client-comments-spec.md,
// Decision 1). Two cookies on path /b. The reader cookie holds the reader's
// key, so a revoked reader stops working on the next request, when the
// later routes look the key up again. The device cookie is a random id for
// the browser, which every reader post records. Both are HttpOnly, Secure
// and SameSite=Lax. "Not You?" clears the reader cookie and leaves the
// device cookie, because the browser is the same browser.

export const READER_COOKIE = "kulka-reader";
export const DEVICE_COOKIE = "kulka-device";
export const COOKIE_PATH = "/b";
const ONE_YEAR = 31_536_000;

function cookie(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; Path=${COOKIE_PATH}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

/** One cookie's value from a Cookie header, or null. */
export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

/** The browser's device id from the request, or a new one when it has none or a malformed one. */
export function deviceIdFrom(header: string | null): string {
  const held = readCookie(header, DEVICE_COOKIE);
  return held !== null && isToken(held) ? held : newToken();
}

/** Set-Cookie values that sign a browser in as a reader and keep its device id. */
export function signInCookies(readerKey: string, deviceId: string): string[] {
  return [cookie(READER_COOKIE, readerKey, ONE_YEAR), cookie(DEVICE_COOKIE, deviceId, ONE_YEAR)];
}

/** The Set-Cookie value that ends the reader's session in this browser. */
export function signOutCookie(): string {
  return cookie(READER_COOKIE, "", 0);
}
