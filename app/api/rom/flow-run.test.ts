import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import {
  FLOW_FILE,
  parseFlowDefinition,
  visibleQuestions,
  type FlowDefinition,
  type Responses,
} from "@/lib/rom/question-flow";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// The full walk LA-20 asks for: the definition file, the questions it declares,
// the API, and a ROM with its run record, against a database built from this
// repo's migrations.
//
// The answers below are derived from the file rather than typed out, so a test
// passing here is a test of the file that ships, not of a copy of it.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/rom", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

function definitionFromFile(): FlowDefinition {
  return parseFlowDefinition(JSON.parse(readFileSync(join(process.cwd(), FLOW_FILE), "utf8")));
}

/** The seeded project is multifamily and new, and the one benchmark matches it. */
const ENGINE_ANSWER: Record<string, string> = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: "42000",
};

/**
 * Answer every question the definition asks, whatever it asks. Gates close,
 * which keeps the walk to the questions the file puts in front of everyone.
 */
function answerEveryQuestion(definition: FlowDefinition): Responses {
  const responses: Responses = {};
  for (const question of visibleQuestions(definition, responses)) {
    if (question.kind === "branch_gate") {
      responses[question.id] = "no";
    } else if (question.mapsTo.target === "engine_input") {
      responses[question.id] = ENGINE_ANSWER[question.mapsTo.name];
    } else if (question.kind === "number") {
      responses[question.id] = "1";
    } else if (question.kind === "text") {
      // LA-1199: ZIP is the file's one text question and is optional on every
      // project type, so this walk leaves it unanswered rather than guessing
      // a value that would have to satisfy a pattern it does not know.
      continue;
    } else {
      responses[question.id] = question.choices![0].value;
    }
  }
  return responses;
}

type RunRow = {
  id: string;
  status: string;
  skill: string;
  rom: { lines: unknown[]; total: { low: number; high: number } } | null;
  answers: {
    grossSquareFeet?: number;
    projectType?: string;
    facts?: Record<string, unknown>;
    flow?: {
      skill: string;
      version: number;
      responses: Responses;
      branchGates: Record<string, string>;
      tbdSections: string[];
      tbdCount?: number;
    };
  };
  error: string | null;
  snapshot_hash: string | null;
};

const runs = () =>
  db.query<RunRow>(`select * from runs order by started_at`).then((r) => r.rows);
const steps = () =>
  db
    .query<{ name: string; status: string; seq: number }>(
      `select name, status, seq from run_steps order by seq`,
    )
    .then((r) => r.rows);

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("the tier-1 question flow, definition to ROM", () => {
  it("computes a ROM from the answers the definition collected", async () => {
    const responses = answerEveryQuestion(definitionFromFile());
    const response = await post({ projectId: TEST_PROJECT_ID, responses });

    expect(response.status).toBe(200);
    const { rom, runId } = await response.json();
    expect(runId).toBeTruthy();
    expect(rom.lines).toHaveLength(1);
    expect(rom.total.low).toBeLessThan(rom.total.high);
  });

  it("budgets the area the questions gave, not the one on the project record", async () => {
    const responses = answerEveryQuestion(definitionFromFile());
    await post({ projectId: TEST_PROJECT_ID, responses });

    const [run] = await runs();
    // The seeded project record says 1,000 gross square feet.
    expect(run.answers.grossSquareFeet).toBe(42000);
  });

  it("writes a full run record: every step, the answers, the ROM, the hash", async () => {
    const responses = answerEveryQuestion(definitionFromFile());
    await post({ projectId: TEST_PROJECT_ID, responses });

    const [run] = await runs();
    expect(run).toMatchObject({ status: "succeeded", skill: "rom_tier1", error: null });
    expect(run.rom?.lines).toHaveLength(1);
    expect(run.snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await steps()).toEqual([
      { seq: 1, name: "read_answers", status: "succeeded" },
      { seq: 2, name: "read_benchmarks", status: "succeeded" },
      { seq: 3, name: "read_parameters", status: "succeeded" },
      { seq: 4, name: "read_judgment_rules", status: "succeeded" },
      { seq: 5, name: "compute_rom", status: "succeeded" },
    ]);
  });

  it("records the flow that produced the answers beside them", async () => {
    const definition = definitionFromFile();
    const responses = answerEveryQuestion(definition);
    await post({ projectId: TEST_PROJECT_ID, responses });

    const [run] = await runs();
    const flow = run.answers.flow;
    expect(flow?.skill).toBe(definition.skill);
    expect(flow?.version).toBe(definition.version);
    expect(flow?.responses).toEqual(responses);
  });

  it("keeps a don't know out of the total and counts it as TBD", async () => {
    const definition = definitionFromFile();
    const gate = definition.questions.find((question) => question.kind === "branch_gate");
    if (!gate) throw new Error("The definition declares no branch gate.");

    const responses = { ...answerEveryQuestion(definition), [gate.id]: "dont_know" };
    const response = await post({ projectId: TEST_PROJECT_ID, responses });
    expect(response.status).toBe(200);

    const [run] = await runs();
    expect(run.answers.flow?.tbdSections).toHaveLength(1);
    expect(run.answers.flow?.tbdCount).toBe(1);
  });

  it("leaves a failed run record when a question the engine needs went unanswered", async () => {
    const definition = definitionFromFile();
    const needed = definition.questions.find(
      (question) => question.mapsTo.target === "engine_input",
    );
    if (!needed) throw new Error("The definition feeds the engine nothing.");

    const responses = answerEveryQuestion(definition);
    delete responses[needed.id];

    const response = await post({ projectId: TEST_PROJECT_ID, responses });
    expect(response.status).toBe(422);

    const [run] = await runs();
    expect(run.status).toBe("failed");
    expect(await steps()).toEqual([{ seq: 1, name: "read_answers", status: "failed" }]);
  });

  // LA-1199: stories above grade, unit count, building count and ZIP land in
  // the run's recorded facts under the same intake-field names the flow file
  // gives them, so a derived assumption can read them as stated facts.
  it("carries stories above grade, unit count, building count and zip in the run's facts", async () => {
    const definition = definitionFromFile();
    const responses = {
      ...answerEveryQuestion(definition),
      stories_above_grade: "4",
      unit_count: "120",
      building_count: "3",
      zip: "10956",
    };
    await post({ projectId: TEST_PROJECT_ID, responses });

    const [run] = await runs();
    expect(run.answers.facts).toMatchObject({
      storiesAboveGrade: 4,
      unitCount: 120,
      buildingCount: 3,
      zip: "10956",
    });
  });

  it("refuses responses that are not text keyed by question id", async () => {
    const response = await post({ projectId: TEST_PROJECT_ID, responses: { demolition: 3 } });

    expect(response.status).toBe(400);
    expect(await runs()).toEqual([]);
  });
});
