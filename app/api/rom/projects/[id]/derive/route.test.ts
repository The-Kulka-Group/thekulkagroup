import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1265. New Budget works the elevator criteria out mid-flow: V-1 from the
// building's height, then V-2 from V-1's type. No Jev client is configured in
// tests, so V-1 in the either band proposes Hydraulic without calling Jev.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function derive(responses: Record<string, string>, id = TEST_PROJECT_ID) {
  return POST(
    new Request(`http://localhost/api/rom/projects/${id}/derive`, {
      method: "POST",
      body: JSON.stringify({ responses }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

const FIVE_STORIES = {
  project_type: "multifamily",
  construction_kind: "new",
  gross_square_feet: "50000",
  stories_above_grade: "5",
  elevator: "yes",
  elevator_count: "2",
  levels_below_grade: "no",
  site_conditions: "no",
};

beforeEach(async () => {
  db = await seededDatabase();
  await db.query(`update projects set framing_system = 'wood' where id = $1`, [TEST_PROJECT_ID]);
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/projects/[id]/derive", () => {
  it("works out V-1 and then V-2, and returns the facts they set", async () => {
    const response = await derive(FIVE_STORIES);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body.criteria.map((one: { code: string }) => one.code).sort()).toEqual(["V-1", "V-2"]);
    // Five stories at 10'-0" is 40 ft: hydraulic, and in-ground on dry ground.
    expect(body.facts).toEqual({ elevatorType: "hydraulic", hydraulicJackType: "in_ground" });
    const v2 = body.criteria.find((one: { code: string }) => one.code === "V-2");
    expect(v2.costCodes).toEqual(["26", "26i"]);
  });

  it("goes holeless on wet ground", async () => {
    const body = await (await derive({ ...FIVE_STORIES, site_conditions: "yes" })).json();
    expect(body.facts.hydraulicJackType).toBe("holeless");
  });

  it("removes V-2 once V-1 is corrected to traction", async () => {
    const first = await (await derive(FIVE_STORIES)).json();
    const v1 = first.criteria.find((one: { code: string }) => one.code === "V-1");
    await db.query(
      `insert into derived_assumption_corrections (derived_assumption_id, value, reason, corrected_by)
       values ($1, '{"kind":"spec","text":"Traction"}'::jsonb, 'test', 'automated test')`,
      [v1.id],
    );

    const body = await (await derive(FIVE_STORIES)).json();
    expect(body.criteria.map((one: { code: string }) => one.code)).toEqual(["V-1"]);
    expect(body.facts).toEqual({ elevatorType: "traction" });
  });

  it("works nothing out without an elevator", async () => {
    const body = await (await derive({ ...FIVE_STORIES, elevator: "no" })).json();
    expect(body.criteria).toEqual([]);
    expect(body.facts).toEqual({});
  });
});
