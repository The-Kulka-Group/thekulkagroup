import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/auth/server";
import { getDb } from "@/lib/db";
import { parseFramingSystem, saveProjectFramingSystem } from "@/lib/rom/framing";
import { parseGateAnswers, saveProjectGateAnswers } from "@/lib/rom/gates";
import { readGrRates } from "@/lib/rom/gr-rates";
import { parseMarkupChoices, saveProjectMarkupChoices } from "@/lib/rom/markup";
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

  const db = getDb();

  // GRs/GCs, fee and insurance (LA-1016). Without them the run uses setup
  // "both", method "pct_of_subtotal", and the recorded fee and insurance
  // rates. A bad choice is refused here, before a run opens. The General
  // Requirements rate card is read so a plan cannot price a row it marks not
  // priceable.
  const parsed = parseMarkupChoices(markups, markups === undefined ? [] : await readGrRates(db));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // The Scope module's answers (LA-1028). Without them the run reads the
  // project record's own gate columns, the same as before the module
  // existed; `gates` present, even empty, replaces them for this run.
  const parsedGates = parseGateAnswers(gates);
  if (!parsedGates.ok) return NextResponse.json({ error: parsedGates.error }, { status: 400 });

  // The framing system (LA-1103). Absent reads the project's own column.
  const parsedFraming = parseFramingSystem(framingSystem);
  if (!parsedFraming.ok) return NextResponse.json({ error: parsedFraming.error }, { status: 400 });

  // LA-1109: Run settings save to the project before the run opens, so a
  // failed run still leaves the settings in place and the project's next
  // visit reads what was just tried. Only a field the request actually named
  // is saved; a field the caller sent nothing for (no rate tables to build
  // markups from, no defaults object to build gates from, no recorded
  // framing column) is left untouched rather than overwritten with a
  // fallback default that was never the estimator's own choice.
  await Promise.all([
    markups === undefined ? null : saveProjectMarkupChoices(db, projectId, parsed.choices),
    gates === undefined ? null : saveProjectGateAnswers(db, projectId, parsedGates.gates),
    framingSystem === undefined ? null : saveProjectFramingSystem(db, projectId, parsedFraming.framing ?? null),
  ]);

  try {
    const { runId, rom } = await runRom(
      db,
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
