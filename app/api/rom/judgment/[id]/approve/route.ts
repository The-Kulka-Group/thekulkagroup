import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  approveJudgmentRule,
  JudgmentRuleNotFound,
  JudgmentRuleNotStaged,
} from "@/lib/rom/judgment";
import { isUuid } from "@/lib/uuid";

// The approval gate for a judgment rule (LA-19 AC1). Once approved, the rule
// adjusts the ROM lines it applies to, flagged as judgment with the person who
// stated it and the date.
//
// Who may approve is Devin and Rob's open decision, and GLOSSARY.md ties it to
// the admin permission, which does not exist in code yet (LA-722). Until it
// lands, approval works like any other gate approval: any signed-in,
// allowlisted user, recorded by email and time.

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await context.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Judgment rule not found." }, { status: 404 });
  }

  try {
    const judgmentRule = await approveJudgmentRule(getDb(), id, auth.user.email);
    return NextResponse.json({ judgmentRule });
  } catch (cause) {
    if (cause instanceof JudgmentRuleNotFound) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    if (cause instanceof JudgmentRuleNotStaged) {
      return NextResponse.json({ error: cause.message }, { status: 409 });
    }
    throw cause;
  }
}
