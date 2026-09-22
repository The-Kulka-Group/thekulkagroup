import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { getJudgmentRule, JudgmentRuleNotFound } from "@/lib/rom/judgment";
import { isUuid } from "@/lib/uuid";

// One judgment rule, for review before approval (LA-19 AC1).

type Context = { params: Promise<{ id: string }> };
const missing = () => NextResponse.json({ error: "Judgment rule not found." }, { status: 404 });

export async function GET(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) return missing();

  try {
    return NextResponse.json({ judgmentRule: await getJudgmentRule(getDb(), id) });
  } catch (cause) {
    if (cause instanceof JudgmentRuleNotFound) return missing();
    throw cause;
  }
}
