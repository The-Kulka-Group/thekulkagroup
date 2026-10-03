import { PUBLISHED_BUDGET_HEADERS } from "@/lib/auth/routes";
import { linkOrigin } from "@/lib/rom/published-budgets";
import { signOutCookie } from "@/lib/rom/reader-cookies";

export const dynamic = "force-dynamic";

// LA-1486 (spec Decision 1, "Not You?"). POST /b/r/clear ends the reader's
// session in this browser: it expires the reader cookie and answers 204. The
// device cookie stays. The visible control belongs to the comment-layer
// ticket. Like every post under /b, it needs an Origin header equal to the
// site's own origin, so another site cannot sign a reader out. The path is
// not a reader key (a key has 22 characters), so it cannot collide with
// /b/r/<readerKey>, and it never reaches the database.

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("origin") !== linkOrigin(request.url)) {
    return new Response("Forbidden", {
      status: 403,
      headers: { ...PUBLISHED_BUDGET_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const headers = new Headers(PUBLISHED_BUDGET_HEADERS);
  headers.append("Set-Cookie", signOutCookie());
  return new Response(null, { status: 204, headers });
}
