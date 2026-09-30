import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { loadPublishedBudget } from "@/lib/rom/published-budgets";

import { PublishedBudgetSheet } from "./PublishedBudgetSheet";

export const dynamic = "force-dynamic";

// LA-1417. A published budget at its link. It sits outside the (app) group,
// so no app shell and no sign-in: anyone with the link can open it (Matt,
// 2026-09-29), and proxy.ts lets /b/ through before any auth handling.
//
// Loading and rendering stay apart on purpose. This file only reads the
// published row; PublishedBudgetSheet renders from what it hands over. The
// real page markup (LA-1416, LA-1418) replaces the sheet, not the loading.

export const metadata: Metadata = {
  title: "The Kulka Group",
  robots: { index: false, follow: false },
  // The token is the only key to the page, so it must not leave in a Referer.
  referrer: "no-referrer",
};

export default async function PublishedBudgetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await loadPublishedBudget(getDb(), token);
  if (!view) notFound();
  return <PublishedBudgetSheet view={view} />;
}
