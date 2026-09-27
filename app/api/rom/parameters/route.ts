import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  ParameterChangeRefused,
  readParameterHistory,
  recordedByFor,
  saveParameterChange,
  todayInNewYork,
} from "@/lib/rom/parameters";

// Engine parameters (LA-866). GET lists every recorded value, newest first
// within each name. POST appends one history row per changed name with the
// same stated reason; lib/rom/parameters.ts checks the whole set with the
// engine's own rules and refuses it, writing nothing, if a run would.
//
// While sign-in is off (KULKA_AUTH_OPEN=1) anyone who can open the app may
// save, recorded as open-access (Matt, 2026-09-27). The admin-only rule in
// LA-866 applies once sign-in returns and LA-722's admin permission exists.

export async function GET(request: Request) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ history: await readParameterHistory(getDb()) });
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
  const { values, reason } = (body ?? {}) as Record<string, unknown>;
  if (!values || typeof values !== "object" || Array.isArray(values)) {
    return NextResponse.json({ error: "Send the changed values by name." }, { status: 400 });
  }

  try {
    const result = await saveParameterChange(getDb(), {
      values: values as Record<string, number>,
      reason: typeof reason === "string" ? reason : "",
      recordedBy: recordedByFor(auth.user),
      recordedAt: todayInNewYork(),
    });
    return NextResponse.json(result, { status: 201 });
  } catch (cause) {
    if (cause instanceof ParameterChangeRefused) {
      return NextResponse.json({ error: cause.message, problems: cause.problems }, { status: 400 });
    }
    throw cause;
  }
}
