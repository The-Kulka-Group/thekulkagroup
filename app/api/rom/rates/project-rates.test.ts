import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { setRateClientForTests } from "@/lib/rom/rate-suggestion";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1245. A suggested rate, saved for one project, prices that project only.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST: saveRate } = await import("./route");
const { POST: suggest } = await import("./suggest/route");

function post(handler: (request: Request) => Promise<Response>, body: unknown) {
  return handler(
    new Request("http://localhost/api/rom/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function demolitionProject() {
  await db.query(
    `insert into benchmarks
       (cost_code, label, unit, value, structure_type, project_type, construction_kind, comparable_count,
        scope_side, provenance_kind, provenance_recorded_by, provenance_recorded_at)
     values ('1a', 'Synthetic Structure Demolition', 'usd_per_sf_of_structure', 6.6, 'wood_frame_type_v',
             'multifamily', 'new', 1, 'site', 'reviewed_judgment', 'Test', '2026-09-28')`,
  );
  await db.query(
    `update projects set demolition_gate = 'yes', demolition_structure_count = 2,
            demolition_structure_square_feet = 8000, demolition_structure_type = 'wood_frame_type_v',
            zip = '10956', labor_type = 'union'
      where id = $1`,
    [TEST_PROJECT_ID],
  );
}

beforeEach(async () => {
  db = await seededDatabase();
  delete process.env.ANTHROPIC_API_KEY;
  setRateClientForTests(null);
});

afterEach(async () => {
  setRateClientForTests(null);
  await db.close();
});

describe("suggested, project-only rates (LA-1245)", () => {
  it("says suggestions are not set up without an API key", async () => {
    const response = await post(suggest, { projectId: TEST_PROJECT_ID, costCode: "28a" });
    expect(response.status).toBe(503);
  });

  it("suggests a rate from the project's ZIP and labor type", async () => {
    await demolitionProject();
    let sent = "";
    setRateClientForTests({
      beta: {
        messages: {
          create: async (params) => {
            sent = String(params.messages[0].content);
            return {
              model: "claude-opus-5",
              stop_reason: "end_turn",
              content: [{ type: "text", text: JSON.stringify({ rate: 1800, low: 1400, high: 2400, reasoning: "Union, Rockland." }) }],
            } as unknown as Anthropic.Beta.Messages.BetaMessage;
          },
        },
      },
    });
    const response = await post(suggest, { projectId: TEST_PROJECT_ID, costCode: "28a" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.suggestion).toMatchObject({ value: 1800, low: 1400, high: 2400 });
    expect(body.missing).toEqual([]);
    expect(JSON.parse(sent).project).toMatchObject({ zip: "10956", laborType: "union", structuresComingDown: 2 });
  });

  it("saves the rate for this project only, keeps the model's proposal, and prices over a shared rate", async () => {
    await demolitionProject();
    // A shared rate exists; the project's own rate stands in for it.
    await db.query(
      `insert into benchmarks (cost_code, label, unit, value, project_type, construction_kind, comparable_count,
         provenance_kind, provenance_recorded_by, provenance_recorded_at)
       values ('28a', 'Plumbing Disconnect and Cap', 'usd_each_structure', 1500, 'multifamily', 'new', 1,
               'reviewed_judgment', 'Test', '2026-09-28')`,
    );
    const proposal = { value: 1800, low: 1400, high: 2400, reasoning: "Union, Rockland.", model: "claude-opus-5" };
    const response = await post(saveRate, {
      projectId: TEST_PROJECT_ID,
      costCode: "28a",
      value: 2000,
      scope: "project",
      proposal,
    });
    expect(response.status).toBe(201);

    const { rows } = await db.query<{ value: string; model_proposal: unknown; provenance_note: string }>(
      `select value, model_proposal, provenance_note from project_rates where project_id = $1 and cost_code = '28a'`,
      [TEST_PROJECT_ID],
    );
    expect(Number(rows[0].value)).toBe(2000);
    expect(rows[0].model_proposal).toMatchObject({ value: 1800, model: "claude-opus-5" });
    expect(rows[0].provenance_note).toContain("Began as claude-opus-5's suggestion");

    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    const line = rom.lines.find((one) => one.costCode === "28a")!;
    expect((line.low + line.high) / 2).toBe(4000);

    // The shared benchmark is untouched for every other project.
    const shared = await db.query(`select value from benchmarks where cost_code = '28a'`);
    expect(Number((shared.rows[0] as { value: string }).value)).toBe(1500);
  });
});
