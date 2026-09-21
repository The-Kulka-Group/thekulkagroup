import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  InvalidJudgmentRule,
  listJudgmentRules,
  stageJudgmentRule,
  type JudgmentRuleStatus,
} from "@/lib/rom/judgment";

// Entering a judgment rule and listing what has been entered (LA-19 AC1). A
// posted rule is staged and adjusts nothing until it is approved through
// app/api/rom/judgment/[id]/approve. The gate itself lives in
// lib/rom/judgment.ts.

const STATUSES: readonly JudgmentRuleStatus[] = ["staged", "approved", "retired"];

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const status = new URL(request.url).searchParams.get("status");
  if (status !== null && !STATUSES.includes(status as JudgmentRuleStatus)) {
    return NextResponse.json(
      { error: `Status must be one of: ${STATUSES.join(", ")}.` },
      { status: 400 },
    );
  }

  const judgmentRules = await listJudgmentRules(getDb(), {
    status: (status as JudgmentRuleStatus) ?? undefined,
  });
  return NextResponse.json({ judgmentRules });
}

export async function POST(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  const {
    costCode,
    label,
    projectType,
    constructionKind,
    condition,
    adjustmentUsdPerGsf,
    statedBy,
    statedOn,
    reason,
  } = (body ?? {}) as Record<string, unknown>;

  // The body's shape is checked here; what makes a rule valid is checked once,
  // in lib/rom/judgment.ts, so the gate and this route cannot drift apart.
  if (condition !== undefined && condition !== null && typeof condition !== "object") {
    return NextResponse.json(
      { error: "A condition is an object with a fact and the value it has to hold." },
      { status: 400 },
    );
  }
  const parsedCondition = condition
    ? {
        fact: String((condition as Record<string, unknown>).fact ?? ""),
        equals: String((condition as Record<string, unknown>).equals ?? ""),
      }
    : null;

  try {
    const judgmentRule = await stageJudgmentRule(getDb(), {
      costCode: String(costCode ?? ""),
      label: String(label ?? ""),
      projectType: projectType as never,
      constructionKind: constructionKind as never,
      condition: parsedCondition,
      adjustmentUsdPerGsf: typeof adjustmentUsdPerGsf === "number" ? adjustmentUsdPerGsf : NaN,
      statedBy: String(statedBy ?? ""),
      statedOn: String(statedOn ?? ""),
      reason: String(reason ?? ""),
    });
    return NextResponse.json({ judgmentRule }, { status: 201 });
  } catch (cause) {
    if (cause instanceof InvalidJudgmentRule) {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
}
