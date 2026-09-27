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
});
