import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { parseFramingSystem } from "@/lib/rom/framing";
import { parseGateAnswers } from "@/lib/rom/gates";
import { parseMarkupChoices } from "@/lib/rom/markup";
import { ProjectNotFound, RunFailed, runRom } from "@/lib/rom/run";
import type { Responses } from "@/lib/rom/question-flow";

// An empty object is refused rather than treated as answers. It can only fail
// once the run opens, and a run that never had a chance is noise in the audit
// trail.
function isResponses(value: unknown): value is Responses {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 0 &&
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
  let markups: unknown;
  let gates: unknown;
  let framingSystem: unknown;
  try {
    ({ projectId, responses, markups, gates, framingSystem } = await request.json());
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

  // GRs/GCs, fee and insurance (LA-1016). Without them the run uses setup
  // "both", method "pct_of_subtotal", and the recorded fee and insurance
  // rates. A bad choice is refused here, before a run opens.
  const parsed = parseMarkupChoices(markups);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // The Scope module's answers (LA-1028). Without them the run reads the
  // project record's own gate columns, the same as before the module
  // existed; `gates` present, even empty, replaces them for this run.
  const parsedGates = parseGateAnswers(gates);
  if (!parsedGates.ok) return NextResponse.json({ error: parsedGates.error }, { status: 400 });

  // The framing system (LA-1103). Absent reads the project's own column.
  const parsedFraming = parseFramingSystem(framingSystem);
  if (!parsedFraming.ok) return NextResponse.json({ error: parsedFraming.error }, { status: 400 });

  try {
    const { runId, rom } = await runRom(
      getDb(),
      projectId,
      responses,
      parsed.choices,
      gates === undefined ? undefined : parsedGates.gates,
      parsedFraming.framing,
    );
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
