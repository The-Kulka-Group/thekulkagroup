import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1110. Edit project against a seeded Postgres: GET prefills, PATCH saves
// through the same parseNewBudget validation New budget uses.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET, PATCH } = await import("./route");

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patch(id: string, body: unknown, headers: Record<string, string> = {}) {
  return PATCH(
    new Request(`http://localhost/api/rom/projects/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(body),
    }),
    ctx(id),
  );
}

const edit = {
  name: "Maple Court, edited (example)",
  grossSquareFeet: 130000,
  projectType: "self_storage",
  constructionKind: "renovation",
  framingSystem: "metal",
};

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("GET /api/rom/projects/[id]", () => {
  it("refuses a signed-out request", async () => {
    const response = await GET(
      new Request(`http://localhost/api/rom/projects/${TEST_PROJECT_ID}`, {
        headers: { "x-kulka-test-auth": "signed-out" },
      }),
      ctx(TEST_PROJECT_ID),
    );
    expect(response.status).toBe(401);
  });

  it("returns the project's own fields", async () => {
    const response = await GET(new Request(`http://localhost/api/rom/projects/${TEST_PROJECT_ID}`), ctx(TEST_PROJECT_ID));
    expect(response.status).toBe(200);
    const { project } = await response.json();
    expect(project).toMatchObject({ id: TEST_PROJECT_ID, name: "Synthetic test project" });
  });

  it("404s for an id that does not exist", async () => {
    const response = await GET(
      new Request("http://localhost/api/rom/projects/00000000-0000-4000-8000-00000000abcd"),
      ctx("00000000-0000-4000-8000-00000000abcd"),
    );
    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/rom/projects/[id]", () => {
  it("refuses a signed-out request and writes nothing", async () => {
    const response = await patch(TEST_PROJECT_ID, edit, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
    const row = await db.query<{ name: string }>(`select name from projects where id = $1`, [TEST_PROJECT_ID]);
    expect(row.rows[0].name).toBe("Synthetic test project");
  });

  it.each([[{ ...edit, name: " " }], [{ ...edit, grossSquareFeet: 0 }], [{ ...edit, projectType: "office" }]])(
    "refuses a bad form %j and writes nothing",
    async (body) => {
      const response = await patch(TEST_PROJECT_ID, body);
      expect(response.status).toBe(400);
    },
  );

  it("saves the edit and leaves saved runs untouched", async () => {
    const run = await db.query<{ id: string }>(
      `insert into runs (project_id, skill, status) values ($1, 'rom_tier1', 'succeeded') returning id`,
      [TEST_PROJECT_ID],
    );
    const response = await patch(TEST_PROJECT_ID, edit);
    expect(response.status).toBe(200);
    const row = await db.query<Record<string, unknown>>(`select * from projects where id = $1`, [TEST_PROJECT_ID]);
    expect(row.rows[0]).toMatchObject({
      name: edit.name,
      gross_square_feet: edit.grossSquareFeet,
      project_type: edit.projectType,
      construction_kind: edit.constructionKind,
      framing_system: edit.framingSystem,
    });
    const runRow = await db.query<{ project_id: string }>(`select project_id from runs where id = $1`, [run.rows[0].id]);
    expect(runRow.rows[0].project_id).toBe(TEST_PROJECT_ID);
  });

  it("404s for a project that does not exist", async () => {
    const response = await patch("00000000-0000-4000-8000-00000000abcd", edit);
    expect(response.status).toBe(404);
  });

  // LA-1199: Edit project saves and reloads stories above grade, unit count,
  // building count and ZIP through the same PATCH.
  it("saves stories above grade, unit count, building count and zip, and GET reloads them", async () => {
    const response = await patch(TEST_PROJECT_ID, {
      ...edit,
      storiesAboveGrade: 4,
      unitCount: 120,
      buildingCount: 3,
      zip: "212",
    });
    expect(response.status).toBe(200);

    const get = await GET(new Request(`http://localhost/api/rom/projects/${TEST_PROJECT_ID}`), ctx(TEST_PROJECT_ID));
    const { project } = await get.json();
    expect(project).toMatchObject({ storiesAboveGrade: 4, unitCount: 120, buildingCount: 3, zip: "212" });
  });

  // LA-1212: Edit project sets, clears and reloads Elevator Count through the
  // same PATCH/GET pair, the same as the four LA-1199 fields above. Zero is
  // its own case, since it is a legal count (no elevator) rather than a clear.
  it("sets an elevator count and GET reloads it", async () => {
    const response = await patch(TEST_PROJECT_ID, { ...edit, elevatorCount: 2 });
    expect(response.status).toBe(200);
    const get = await GET(new Request(`http://localhost/api/rom/projects/${TEST_PROJECT_ID}`), ctx(TEST_PROJECT_ID));
    const { project } = await get.json();
    expect(project).toMatchObject({ elevatorCount: 2 });
  });

  it("sets an elevator count of zero and GET reloads it, distinct from clearing it", async () => {
    const response = await patch(TEST_PROJECT_ID, { ...edit, elevatorCount: 0 });
    expect(response.status).toBe(200);
    const get = await GET(new Request(`http://localhost/api/rom/projects/${TEST_PROJECT_ID}`), ctx(TEST_PROJECT_ID));
    const { project } = await get.json();
    expect(project).toMatchObject({ elevatorCount: 0 });
  });

  it("clears an elevator count back to null", async () => {
    await patch(TEST_PROJECT_ID, { ...edit, elevatorCount: 2 });
    const response = await patch(TEST_PROJECT_ID, { ...edit, elevatorCount: null });
    expect(response.status).toBe(200);
    const get = await GET(new Request(`http://localhost/api/rom/projects/${TEST_PROJECT_ID}`), ctx(TEST_PROJECT_ID));
    const { project } = await get.json();
    expect(project.elevatorCount).toBeNull();
  });

  it("keeps an older project's saved run and still opens it once these fields are edited in", async () => {
    const run = await db.query<{ id: string }>(
      `insert into runs (project_id, skill, status) values ($1, 'rom_tier1', 'succeeded') returning id`,
      [TEST_PROJECT_ID],
    );
    const response = await patch(TEST_PROJECT_ID, { ...edit, storiesAboveGrade: 4, unitCount: 120 });
    expect(response.status).toBe(200);
    const runRow = await db.query<{ project_id: string }>(`select project_id from runs where id = $1`, [
      run.rows[0].id,
    ]);
    expect(runRow.rows[0].project_id).toBe(TEST_PROJECT_ID);
  });
});
