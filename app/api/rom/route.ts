import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { ProjectNotFound, RunFailed, runRom } from "@/lib/rom/run";
import type { Responses } from "@/lib/rom/question-flow";

function isResponses(value: unknown): value is Responses {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((one) => typeof one === "string")
  );
}

// The one API the surfaces call. The site is the first; the Claude wrapper and
// ChatGPT reach the same route later, which is what keeps the math out of a
// prompt and the outputs the same for everyone (CONTEXT.md, controlled goalposts).
//
export async function POST(request: Request) {
  const denied = await requireApiUser(request);
  if (denied) return denied;

  let projectId: unknown;
  let responses: unknown;
  try {
    ({ projectId, responses } = await request.json());
  } catch {
    return NextResponse.json({ error: "Send a JSON body." }, { status: 400 });
  }

  if (typeof projectId !== "string" || projectId.length === 0) {
    return NextResponse.json({ error: "Send a projectId." }, { status: 400 });
  }

  // Answers to the tier-1 questions (LA-20). Without them the run reads what
  // the project record already holds.
  if (responses !== undefined && !isResponses(responses)) {
    return NextResponse.json(
      { error: "Send responses as text keyed by question id." },
      { status: 400 },
    );
  }

  try {
    const { runId, rom } = await runRom(getDb(), projectId, responses);
    return NextResponse.json({ runId, rom });
  } catch (cause) {
    if (cause instanceof ProjectNotFound) {
      return NextResponse.json({ error: cause.message }, { status: 404 });
    }
    if (cause instanceof RunFailed) {
      // The run record already holds the failure; hand back its id so the
      // caller can go and read it.
      return NextResponse.json({ error: cause.message, runId: cause.runId }, { status: 422 });
    }
    throw cause;
  }
}
