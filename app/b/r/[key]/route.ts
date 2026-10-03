import { PUBLISHED_BUDGET_HEADERS } from "@/lib/auth/routes";
import { getDb } from "@/lib/db";
import { findActiveReader, newestOpenToken } from "@/lib/rom/budget-comments";
import { linkOrigin } from "@/lib/rom/published-budgets";
import { deviceIdFrom, signInCookies } from "@/lib/rom/reader-cookies";

export const dynamic = "force-dynamic";

// LA-1486 (spec Decision 1). A reader link, /b/r/<readerKey>. It sets the
// reader cookie and the device cookie, then sends the browser with a 303 to
// the project's newest open version at /b/<token>, so the key leaves the
// address bar. A malformed, unknown or revoked key, or a project with no open
// version, gets the same plain 404 as an unknown budget token. The proxy
// already lets /b/ through before sign-in and adds the no-store, noindex and
// no-referrer headers, which matter here because the key is in the address.

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { ...PUBLISHED_BUDGET_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }): Promise<Response> {
  const { key } = await params;
  const db = getDb();
  const reader = await findActiveReader(db, key);
  if (!reader) return notFound();
  const token = await newestOpenToken(db, reader.projectId);
  if (token === null) return notFound();

  const headers = new Headers(PUBLISHED_BUDGET_HEADERS);
  headers.set("Location", `${linkOrigin(request.url)}/b/${token}`);
  const deviceId = deviceIdFrom(request.headers.get("cookie"));
  for (const value of signInCookies(reader.readerKey, deviceId)) headers.append("Set-Cookie", value);
  return new Response(null, { status: 303, headers });
}
