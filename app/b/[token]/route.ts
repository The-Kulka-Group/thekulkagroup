import { PUBLISHED_BUDGET_HEADERS } from "@/lib/auth/routes";
import { getDb } from "@/lib/db";
import { loadPublishedBudget } from "@/lib/rom/published-budgets";
import { presentBudget } from "@/lib/rom/presentation";

import { renderBudgetPage, renderWithdrawnPage } from "./render";

export const dynamic = "force-dynamic";

// LA-1417, LA-1418. A published budget at its link. It sits outside the (app)
// group, so no app shell and no sign-in: anyone with the link can open it
// (Matt, 2026-09-29), and proxy.ts lets /b/ through before any auth handling.
//
// The page is the LA-1416 reference markup, a whole document with its own
// <html data-tier>, so it is served by a route handler rather than a page
// under the root layout. Loading, the model and the markup stay apart: this
// file reads the published row, lib/rom/presentation.ts turns its snapshot
// into the page model, and render.ts prints the reference markup from it.

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { ...PUBLISHED_BUDGET_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const view = await loadPublishedBudget(getDb(), token);
  // An unknown or malformed token gets a plain 404 with no hint either way.
  if (!view) return new Response("Not Found", { status: 404, headers: { ...PUBLISHED_BUDGET_HEADERS, "Content-Type": "text/plain; charset=utf-8" } });
  if (view.state === "withdrawn") return html(renderWithdrawnPage(view.version, view.preparedBy));
  const page = presentBudget({
    snapshot: view.snapshot,
    version: view.version,
    stage: view.stage,
    issuedAt: view.issuedAt,
    newer: view.newer,
  });
  return html(renderBudgetPage(page));
}
