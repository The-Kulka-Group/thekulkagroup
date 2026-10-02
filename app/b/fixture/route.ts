import { PUBLISHED_BUDGET_HEADERS } from "@/lib/auth/routes";
import { presentBudget } from "@/lib/rom/presentation";

import { renderBudgetPage } from "../[token]/render";

export const dynamic = "force-dynamic";

// LA-1459. DEV ONLY. /b/fixture renders the reference run frozen in
// test/fixtures/published-budget-mn4.json through the same renderer as
// /b/<token>, so the page can be served locally with no database and shot by
// the scrollcraft harness. In production it is a plain 404 and the fixture is
// never loaded: the import below runs only outside production.
export async function GET(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not Found", { status: 404, headers: { ...PUBLISHED_BUDGET_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  }
  const { referencePublication } = await import("@/test/fixtures/published-budget");
  const print = new URL(request.url).searchParams.get("print") === "1";
  const html = renderBudgetPage(presentBudget(referencePublication()), { print });
  return new Response(html, { status: 200, headers: { ...PUBLISHED_BUDGET_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
}
