import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { listRomProjects, resolveRomProjectId } from "./projects";

// LA-1107. Which project /rom and /rom/intake open on, and who the picker lists.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

const ENV_ID = "00000000-0000-4000-8000-0000000000ee";

describe("resolveRomProjectId", () => {
  it("falls back to ROM_PROJECT_ID when the URL names no project", async () => {
    expect(await resolveRomProjectId(db, undefined, ENV_ID)).toEqual({ projectId: ENV_ID, notFound: false });
    expect(await resolveRomProjectId(db, "", ENV_ID)).toEqual({ projectId: ENV_ID, notFound: false });
    expect(await resolveRomProjectId(db, undefined, undefined)).toEqual({ projectId: undefined, notFound: false });
  });

  it("uses a URL project that exists, over the env", async () => {
    expect(await resolveRomProjectId(db, TEST_PROJECT_ID, ENV_ID)).toEqual({
      projectId: TEST_PROJECT_ID,
      notFound: false,
    });
    expect(await resolveRomProjectId(db, [TEST_PROJECT_ID, ENV_ID], ENV_ID)).toEqual({
      projectId: TEST_PROJECT_ID,
      notFound: false,
    });
  });

  it("resolves to nothing for a malformed or unknown id, without falling back", async () => {
    expect(await resolveRomProjectId(db, "not-a-uuid'; drop", ENV_ID)).toEqual({
      projectId: undefined,
      notFound: true,
    });
    expect(await resolveRomProjectId(db, "00000000-0000-4000-8000-00000000abcd", ENV_ID)).toEqual({
      projectId: undefined,
      notFound: true,
    });
  });
});

describe("listRomProjects", () => {
  it("lists only projects that have a run, newest run first", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into projects (name, project_type, construction_kind)
       values ('No runs (example)', 'multifamily', 'new') returning id`,
    );
    const before = await listRomProjects(db);
    expect(before.map((p) => p.id)).not.toContain(rows[0].id);

    await db.query(`insert into runs (project_id, skill, status) values ($1, 'rom_tier1', 'failed')`, [rows[0].id]);
    const after = await listRomProjects(db);
    expect(after[0]).toEqual({ id: rows[0].id, name: "No runs (example)" });
  });
});
