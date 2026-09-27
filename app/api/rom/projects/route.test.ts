import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

// LA-1107. New budget against a seeded Postgres built from this repo's
// migrations: the project row it writes and the first run it opens.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/rom/projects", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

const valid = {
  name: "Maple Court (example)",
  grossSquareFeet: 120000,
  projectType: "multifamily",
  constructionKind: "new",
  framingSystem: "wood",
};

const projectCount = () =>
  db.query<{ n: number }>(`select count(*)::int as n from projects`).then((r) => r.rows[0].n);

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/projects", () => {
  it("refuses a signed-out request and writes nothing", async () => {
    const before = await projectCount();
    const response = await post(valid, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
    expect(await projectCount()).toBe(before);
  });

  it.each([
    [{ ...valid, name: " " }],
    [{ ...valid, grossSquareFeet: 0 }],
    [{ ...valid, grossSquareFeet: 10.5 }],
    [{ ...valid, projectType: "office" }],
    [{ ...valid, constructionKind: "gut" }],
    [{ ...valid, framingSystem: "steel" }],
  ])("refuses a bad form %j and writes nothing", async (body) => {
    const before = await projectCount();
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await projectCount()).toBe(before);
  });

  it("inserts the project with only the entered facts and writes no run", async () => {
    const response = await post(valid);
    expect(response.status).toBe(201);
    const body = await response.json();
    const { projectId } = body;
    expect(body.runId).toBeUndefined();

    const { rows } = await db.query<Record<string, unknown>>(`select * from projects where id = $1`, [projectId]);
    expect(rows[0]).toMatchObject({
      name: "Maple Court (example)",
      gross_square_feet: 120000,
      project_type: "multifamily",
      construction_kind: "new",
      framing_system: "wood",
      percent_complete: null,
      unit_count: null,
      parking_type: null,
      demolition_gate: null,
    });

    const runs = await db.query<{ n: number }>(`select count(*)::int as n from runs where project_id = $1`, [
      projectId,
    ]);
    expect(runs.rows[0].n).toBe(0);
  });

  it("stores framing as null when not set", async () => {
    const response = await post({ ...valid, framingSystem: null });
    const { projectId } = await response.json();
    const { rows } = await db.query<{ framing_system: string | null }>(
      `select framing_system from projects where id = $1`,
      [projectId],
    );
    expect(rows[0].framing_system).toBeNull();
  });

  // LA-1141: the guided New budget flow's Facts step asks parking type, so a
  // later run (Run settings, no responses) already has it off the project row
  // (lib/rom/run.ts's answersFromProject) with no extra field to fill in.
  it("stores the parking type the guided flow's Facts step sends", async () => {
    const response = await post({ ...valid, parkingType: "structured" });
    const { projectId } = await response.json();
    const { rows } = await db.query<{ parking_type: string | null }>(
      `select parking_type from projects where id = $1`,
      [projectId],
    );
    expect(rows[0].parking_type).toBe("structured");
  });

  it("refuses a parking type it does not know, and writes nothing", async () => {
    const before = await projectCount();
    const response = await post({ ...valid, parkingType: "valet" });
    expect(response.status).toBe(400);
    expect(await projectCount()).toBe(before);
  });

  // LA-1141, "Add without running": the project is inserted with no run row,
  // whether or not the guided flow ever gets to a run.
  it("writes no run row when the project is added without a parking type either", async () => {
    const response = await post(valid);
    const { projectId } = await response.json();
    const runs = await db.query<{ n: number }>(`select count(*)::int as n from runs where project_id = $1`, [
      projectId,
    ]);
    expect(runs.rows[0].n).toBe(0);
  });

  // LA-1199: the guided New budget flow's Facts step also asks stories above
  // grade, unit count, building count and ZIP, so New budget's insert carries
  // them the same way it already carries framing and parking.
  describe("stories above grade, unit count, building count, zip (LA-1199)", () => {
    it("stores all four when the Facts step sends them", async () => {
      const response = await post({ ...valid, storiesAboveGrade: 4, unitCount: 120, buildingCount: 3, zip: "212" });
      const { projectId } = await response.json();
      const { rows } = await db.query<{
        stories_above_grade: number | null;
        unit_count: number | null;
        building_count: number;
        zip: string | null;
      }>(`select stories_above_grade, unit_count, building_count, zip from projects where id = $1`, [projectId]);
      expect(rows[0]).toEqual({ stories_above_grade: 4, unit_count: 120, building_count: 3, zip: "212" });
    });

    it("defaults building count to 1 when the Facts step sends none", async () => {
      const response = await post(valid);
      const { projectId } = await response.json();
      const { rows } = await db.query<{ building_count: number }>(
        `select building_count from projects where id = $1`,
        [projectId],
      );
      expect(rows[0].building_count).toBe(1);
    });

    it("refuses a ZIP that is not three digits, and writes nothing", async () => {
      const before = await projectCount();
      const response = await post({ ...valid, zip: "1" });
      expect(response.status).toBe(400);
      expect(await projectCount()).toBe(before);
    });

    it("refuses a stories above grade or unit count of zero, and writes nothing", async () => {
      const before = await projectCount();
      const stories = await post({ ...valid, storiesAboveGrade: 0 });
      expect(stories.status).toBe(400);
      const units = await post({ ...valid, unitCount: 0 });
      expect(units.status).toBe(400);
      expect(await projectCount()).toBe(before);
    });
  });
});
