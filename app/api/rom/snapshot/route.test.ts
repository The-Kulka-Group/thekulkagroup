import { computeRom, type DataSnapshot, type Rom } from "@kulka/engine";
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
    const { preview, recorded } = await previewAndRun();

    expect(preview.lines).toEqual(recorded.lines);
    expect(preview.total).toEqual(recorded.total);
    expect(preview.markups).toEqual(recorded.markups);
  });

  // LA-1154: the seeded scope_relationships rows bring the four disconnects
  // in behind Structure Demolition. With a driver line and one rated
  // disconnect in the data, the preview still has to match the run.
  it("gives the browser the figure a run records with relationships present", async () => {
    await db.query(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, provenance_kind, provenance_export_label,
          provenance_recorded_by, provenance_recorded_at)
       values
         ('1a', 'Structure Demolition', 'usd_per_gsf', 2, 'multifamily', 'new', 1,
          'reviewed_judgment', null, 'automated test', date '2026-09-27'),
         ('31f', 'Electrical Service Disconnect', 'usd_per_gsf', 0.5, 'multifamily', 'new', 1,
          'reviewed_judgment', null, 'automated test', date '2026-09-27')`,
    );
    await db.query(
      `insert into branch_gate_items
         (section, cost_code, closes_on, stated_by, stated_on, reason)
       values ('demolition', '1a', array['no'], 'automated test', date '2026-09-27',
               'A synthetic fixture so demolition brings in item 1a. Not a Kulka rule.')`,
    );

    const snapshot = await snapshotFor();
    expect(
      snapshot.scopeRelationships?.filter((r) => r.driverCostCode === "1a").map((r) => r.supportingCostCode),
    ).toEqual([
      "28a",
      "28b",
      "31f",
      "36a",
    ]);

    const { preview, recorded } = await previewAndRun();

    expect(recorded.lines.find((line) => line.costCode === "31f")?.driverCostCode).toBe("1a");
    expect(recorded.unpricedItems.map((item) => item.costCode)).toEqual(["28a", "28b", "36a"]);
    expect(preview.lines).toEqual(recorded.lines);
    expect(preview.total).toEqual(recorded.total);
    expect(preview.markups).toEqual(recorded.markups);
    expect(preview.unpricedItems).toEqual(recorded.unpricedItems);
  });
});

/**
 * Answers every question the flow shows, records a run over it through
 * POST /api/rom, and computes the same answers over this route's snapshot.
 */
async function previewAndRun(): Promise<{ preview: Rom; recorded: Rom }> {
  const responses: Responses = {
    project_type: "multifamily",
    construction_kind: "new",
    gross_square_feet: "42000",
    parking_type: "none",
  };
  // A run refuses a blank scope question, so every gate and follow-up gets
  // an answer: the first gate yes, the rest no, so the comparison covers
  // both. Opening one follow-up can open another (demolition's structure
  // count opens its own square-feet and structure-type questions), so this
  // fills in a whole pass and re-reads what is visible until nothing new
  // opens, rather than assuming one pass reaches every question.
  let sawFirstGate = false;
  let unanswered = visibleQuestions(tier1Flow(), responses).filter(
    (question) => responses[question.id] === undefined,
  );
  while (unanswered.length > 0) {
    for (const question of unanswered) {
      if (question.kind === "branch_gate") {
        responses[question.id] = sawFirstGate ? "no" : "yes";
        sawFirstGate = true;
      } else if (question.kind === "number") {
        responses[question.id] = "1";
      } else if (question.kind === "choice") {
        responses[question.id] = question.choices![0].value;
      } else if (question.kind === "text") {
        // LA-1199: ZIP is the flow's one text question, validated as five
        // digits. Leaving this branch out kept it forever unanswered, which
        // kept it forever in `unanswered` too -- an infinite loop, not just a
        // missed answer.
        responses[question.id] = "10956";
      }
    }
    unanswered = visibleQuestions(tier1Flow(), responses).filter(
      (question) => responses[question.id] === undefined,
    );
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
  return { preview, recorded: recorded as Rom };
}

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
