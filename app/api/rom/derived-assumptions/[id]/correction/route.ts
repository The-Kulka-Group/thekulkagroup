import type { DerivedValue } from "@kulka/engine";
import { NextResponse } from "next/server";

import { authorizeRequest } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import {
  correctDerivedAssumption,
  DerivedAssumptionNotFound,
  InvalidDerivedAssumption,
  restoreCorrection,
  revertDerivedAssumption,
} from "@/lib/rom/derived-assumptions";
import { isUuid } from "@/lib/uuid";

// LA-860. The estimator's correction to a derived assumption, recorded by the
// signed-in user's email and the time, the way a judgment rule's approval is.
//   POST   { value, reason }     saves a correction (both required)
//   POST   { restore: <id> }     Undo after a revert: that correction is live again
//   DELETE                       goes back to Jev's value

type Context = { params: Promise<{ id: string }> };

const missing = () => NextResponse.json({ error: "Derived assumption not found." }, { status: 404 });

async function handle(request: Request, context: Context, act: (id: string, email: string) => Promise<unknown>) {
  const auth = await authorizeRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await context.params;
  if (!isUuid(id)) return missing();
  try {
    return NextResponse.json({ derivedAssumption: await act(id, auth.user.email) });
  } catch (cause) {
    if (cause instanceof DerivedAssumptionNotFound) return missing();
    if (cause instanceof InvalidDerivedAssumption) {
      return NextResponse.json({ error: cause.message }, { status: 400 });
    }
    throw cause;
  }
}

function isValue(value: unknown): value is DerivedValue {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.kind === "quantity" && typeof v.amount === "number" && typeof v.unit === "string") ||
    (v.kind === "spec" && typeof v.text === "string")
  );
}

export async function POST(request: Request, context: Context) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }
  if (typeof body.restore === "string") {
    const correctionId = body.restore;
    if (!isUuid(correctionId)) return NextResponse.json({ error: "Send the correction's id." }, { status: 400 });
    return handle(request, context, (id, email) => restoreCorrection(getDb(), id, correctionId, email));
  }
  if (!isValue(body.value) || typeof body.reason !== "string") {
    return NextResponse.json({ error: "Send a value and a reason." }, { status: 400 });
  }
  const entry = { value: body.value, reason: body.reason };
  return handle(request, context, (id, email) => correctDerivedAssumption(getDb(), id, entry, email));
}

export async function DELETE(request: Request, context: Context) {
  return handle(request, context, (id, email) => revertDerivedAssumption(getDb(), id, email));
}
