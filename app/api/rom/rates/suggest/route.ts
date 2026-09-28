import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { readRomProjectDetail } from "@/lib/rom/projects";
import { basisFor, isQuantityRule } from "@/lib/rom/quantity-rules";
import { rateClient, RateSuggestionFailed, suggestRateFromAsks } from "@/lib/rom/rate-suggestion";
import { isUuid } from "@/lib/uuid";

// LA-1245. POST { projectId, costCode } asks Claude for a supporting item's
// rate from the project's location, labor type and facts. It saves nothing:
// the estimator reviews the figure in the rate panel, and saving it is POST
// /api/rom/rates with scope "project".

const LABOR_WORDS: Record<string, string> = {
  union: "union",
  open_shop: "open shop",
  prevailing_wage: "prevailing wage",
};

export async function POST(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const client = rateClient();
  if (!client) {
    return NextResponse.json(
      { error: "Rate suggestions are not set up yet. The site needs an Anthropic API key." },
      { status: 503 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  const { projectId, costCode } = body;
  if (typeof projectId !== "string" || !isUuid(projectId)) {
    return NextResponse.json({ error: "Send the projectId." }, { status: 400 });
  }
  if (typeof costCode !== "string" || costCode === "") {
    return NextResponse.json({ error: "Send the item's costCode." }, { status: 400 });
  }

  const db = getDb();
  const project = await readRomProjectDetail(db, projectId);
  if (!project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const relationship = await db.query<{ driver_cost_code: string; supporting_label: string; quantity_rule: string }>(
    `select driver_cost_code, supporting_label, quantity_rule
       from scope_relationships where supporting_cost_code = $1 limit 1`,
    [costCode],
  );
  const found = relationship.rows[0];
  if (!found || !isQuantityRule(found.quantity_rule)) {
    return NextResponse.json({ error: "Only a supporting item can get a suggested rate here." }, { status: 400 });
  }
  const driver = await db.query<{ label: string }>(`select label from benchmarks where cost_code = $1 limit 1`, [
    found.driver_cost_code,
  ]);
  const driverLabel = driver.rows[0]?.label ?? found.driver_cost_code;

  try {
    // Three asks at once, so the panel can show how far the figure moves.
    const suggestion = await suggestRateFromAsks(client, {
      itemLabel: found.supporting_label,
      quantityBasis: `${driverLabel} brings this in, ${basisFor(found.quantity_rule).count}`,
      unit: basisFor(found.quantity_rule).per === "each" ? "each" : "per stop",
      facts: {
        zip: project.zip ?? null,
        laborType: LABOR_WORDS[project.laborType ?? "open_shop"] ?? project.laborType,
        projectType: project.projectType,
        constructionKind: project.constructionKind,
        grossSquareFeet: project.grossSquareFeet,
        storiesAboveGrade: project.storiesAboveGrade ?? null,
        unitCount: project.unitCount ?? null,
        structuresComingDown: project.demolitionStructureCount ?? null,
        structureSquareFeet: project.demolitionStructureSquareFeet ?? null,
        structureType: project.demolitionStructureType ?? null,
      },
    });
    return NextResponse.json({ suggestion, missing: project.zip ? [] : ["ZIP"] });
  } catch (cause) {
    if (cause instanceof RateSuggestionFailed) return NextResponse.json({ error: cause.message }, { status: 502 });
    return NextResponse.json({ error: "The rate could not be suggested. Try again." }, { status: 502 });
  }
}
