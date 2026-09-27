import { computeRom, type DataSnapshot } from "@kulka/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { knownScopeRom, previewAnswers } from "@/lib/rom/preview";
import { tier1Flow, visibleQuestions, type Responses } from "@/lib/rom/question-flow";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1142's seam: the New budget preview runs the engine in the browser over
// this route's snapshot. The preview is only worth showing if it is the figure
// a run over the same data records, so that is what these tests hold it to.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("../route");
const { GET } = await import("./route");

function get(query: string, headers: HeadersInit = {}) {
  return GET(new Request(`http://localhost/api/rom/snapshot?${query}`, { headers }));
}

async function snapshotFor(query = "projectType=multifamily&constructionKind=new"): Promise<DataSnapshot> {
  const response = await get(query);
  expect(response.status).toBe(200);
  const { snapshot } = await response.json();
  return snapshot as DataSnapshot;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("GET /api/rom/snapshot", () => {
  it("rejects a signed-out request", async () => {
    const response = await get("projectType=multifamily&constructionKind=new", {
      "x-kulka-test-auth": "signed-out",
    });
    expect(response.status).toBe(401);
  });

  it("refuses a project type or construction kind the engine does not know", async () => {
    expect((await get("projectType=office&constructionKind=new")).status).toBe(400);
    expect((await get("projectType=multifamily")).status).toBe(400);
  });

  it("opens no run", async () => {
    await snapshotFor();
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from runs`);
    expect(rows[0].n).toBe(0);
  });

  it("gives the browser the figure a run over the same data records", async () => {
    const responses: Responses = {
      project_type: "multifamily",
      construction_kind: "new",
      gross_square_feet: "42000",
      parking_type: "none",
    };
    // A run refuses a blank scope question, so every gate is answered: the
    // first yes, the rest no, so the comparison covers both.
    visibleQuestions(tier1Flow(), responses)
      .filter((question) => question.kind === "branch_gate")
      .forEach((question, index) => {
        responses[question.id] = index === 0 ? "yes" : "no";
      });
    for (const question of visibleQuestions(tier1Flow(), responses)) {
      if (question.kind === "number" && !responses[question.id]) responses[question.id] = "1";
    }
    const markups = { setup: "both", method: "pct_of_subtotal" } as const;

    const run = await POST(
      new Request("http://localhost/api/rom", {
        method: "POST",
        body: JSON.stringify({ projectId: TEST_PROJECT_ID, responses, markups }),
      }),
    );
    expect(run.status).toBe(200);
    const { rom: recorded } = await run.json();

    const answers = previewAnswers(tier1Flow(), responses, "", markups);
    expect(answers).not.toBeNull();
    const preview = computeRom(answers!, await snapshotFor());

    expect(preview.lines).toEqual(recorded.lines);
    expect(preview.total).toEqual(recorded.total);
    expect(preview.markups).toEqual(recorded.markups);
  });
});

describe("previewAnswers", () => {
  it("waits for a gross area before the engine runs", () => {
    expect(previewAnswers(tier1Flow(), { project_type: "multifamily", construction_kind: "new" }, "", null)).toBeNull();
    expect(
      previewAnswers(tier1Flow(), { project_type: "multifamily", construction_kind: "new", gross_square_feet: "0" }, "", null),
    ).toBeNull();
  });

  it("reads an unanswered scope question as unanswered rather than refusing the flow", () => {
    const answers = previewAnswers(
      tier1Flow(),
      { project_type: "multifamily", construction_kind: "new", gross_square_feet: "42000" },
      "wood",
      null,
    );
    expect(answers?.grossSquareFeet).toBe(42000);
    expect(answers?.branchGates).toEqual({});
    expect(answers?.framingSystem).toBe("wood");
    expect(answers?.markups).toBeUndefined();
  });
});

describe("knownScopeRom", () => {
  // Item 26 (Elevators) is closed by the elevator question in the shipped
  // gate rules (supabase/migrations/20260924140000_branch_gate_items.sql).
  async function withElevatorLine(): Promise<DataSnapshot> {
    await db.query(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, provenance_kind, provenance_export_label,
          provenance_recorded_by, provenance_recorded_at)
       values
         ('26', 'Elevators', 'usd_per_gsf', 3, 'multifamily', 'new', 1,
          'reviewed_judgment', null, 'automated test', date '2026-09-26')`,
    );
    return snapshotFor();
  }

  function answersWithElevator(answer?: string) {
    const question = tier1Flow().questions.find(
      (one) => one.mapsTo.target === "branch_gate" && one.mapsTo.section === "elevator",
    )!;
    return previewAnswers(
      tier1Flow(),
      {
        project_type: "multifamily",
        construction_kind: "new",
        gross_square_feet: "1000",
        ...(answer ? { [question.id]: answer } : {}),
      },
      "",
      null,
    )!;
  }

  it("leaves an unanswered gated line off the screen and out of the total", async () => {
    const { known, full } = knownScopeRom(answersWithElevator(), await withElevatorLine());
    expect(full.lines.map((line) => line.costCode)).toContain("26");
    expect(known.lines.map((line) => line.costCode)).not.toContain("26");
    expect(known.total.high).toBeLessThan(full.total.high);
  });

  it("brings the line in once its question puts it in scope", async () => {
    const { known, full } = knownScopeRom(answersWithElevator("yes"), await withElevatorLine());
    expect(known).toBe(full);
    expect(known.lines.find((line) => line.costCode === "26")?.gateStatus).toBe("priced");
  });

  it("keeps a No in the answered list, so it still shows as not in this job", async () => {
    const { full } = knownScopeRom(answersWithElevator("no"), await withElevatorLine());
    expect(full.notInThisJob.map((item) => item.costCode)).toContain("26");
  });
});
