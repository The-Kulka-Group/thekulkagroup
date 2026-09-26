import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { readBenchmarkData } from "./run";

import {
  archiveRomProject,
  CannotArchiveEnvProject,
  listRomProjects,
  ProjectNotFoundForEdit,
  readRomProjectDetail,
  resolveRomProjectId,
  restoreRomProject,
  updateRomProject,
} from "./projects";

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
    expect(await resolveRomProjectId(db, undefined, ENV_ID)).toEqual({
      projectId: ENV_ID,
      notFound: false,
      archivedAt: null,
    });
    expect(await resolveRomProjectId(db, "", ENV_ID)).toEqual({
      projectId: ENV_ID,
      notFound: false,
      archivedAt: null,
    });
    expect(await resolveRomProjectId(db, undefined, undefined)).toEqual({
      projectId: undefined,
      notFound: false,
      archivedAt: null,
    });
  });

  it("uses a URL project that exists, over the env", async () => {
    expect(await resolveRomProjectId(db, TEST_PROJECT_ID, ENV_ID)).toEqual({
      projectId: TEST_PROJECT_ID,
      notFound: false,
      archivedAt: null,
    });
    expect(await resolveRomProjectId(db, [TEST_PROJECT_ID, ENV_ID], ENV_ID)).toEqual({
      projectId: TEST_PROJECT_ID,
      notFound: false,
      archivedAt: null,
    });
  });

  it("resolves to nothing for a malformed or unknown id, without falling back", async () => {
    expect(await resolveRomProjectId(db, "not-a-uuid'; drop", ENV_ID)).toEqual({
      projectId: undefined,
      notFound: true,
      archivedAt: null,
    });
    expect(await resolveRomProjectId(db, "00000000-0000-4000-8000-00000000abcd", ENV_ID)).toEqual({
      projectId: undefined,
      notFound: true,
      archivedAt: null,
    });
  });

  it("still resolves an archived project (not 'not found'), with its archived_at (LA-1110)", async () => {
    await db.query(`update projects set archived_at = now() where id = $1`, [TEST_PROJECT_ID]);
    const resolved = await resolveRomProjectId(db, TEST_PROJECT_ID, ENV_ID);
    expect(resolved.projectId).toBe(TEST_PROJECT_ID);
    expect(resolved.notFound).toBe(false);
    expect(resolved.archivedAt).not.toBeNull();
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

  it("excludes an archived project even when it has a run (LA-1110)", async () => {
    await db.query(`insert into runs (project_id, skill, status) values ($1, 'rom_tier1', 'succeeded')`, [
      TEST_PROJECT_ID,
    ]);
    const before = await listRomProjects(db);
    expect(before.map((p) => p.id)).toContain(TEST_PROJECT_ID);

    await db.query(`update projects set archived_at = now() where id = $1`, [TEST_PROJECT_ID]);
    const after = await listRomProjects(db);
    expect(after.map((p) => p.id)).not.toContain(TEST_PROJECT_ID);
  });
});

const editBudget = {
  name: "Maple Court, edited (example)",
  grossSquareFeet: 130000,
  projectType: "self_storage" as const,
  constructionKind: "renovation" as const,
  framingSystem: "metal" as const,
};

describe("updateRomProject", () => {
  it("updates the project's fields", async () => {
    await updateRomProject(db, TEST_PROJECT_ID, editBudget);
    const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
    expect(detail).toMatchObject(editBudget);
  });

  it("leaves saved runs untouched", async () => {
    const { rows } = await db.query<{ id: string }>(`insert into runs (project_id, skill, status) values ($1, 'rom_tier1', 'succeeded') returning id`, [
      TEST_PROJECT_ID,
    ]);
    await updateRomProject(db, TEST_PROJECT_ID, editBudget);
    const run = await db.query<{ project_id: string }>(`select project_id from runs where id = $1`, [rows[0].id]);
    expect(run.rows[0].project_id).toBe(TEST_PROJECT_ID);
  });

  it("throws for a project that does not exist", async () => {
    await expect(
      updateRomProject(db, "00000000-0000-4000-8000-00000000abcd", editBudget),
    ).rejects.toBeInstanceOf(ProjectNotFoundForEdit);
  });
});

describe("archiveRomProject / restoreRomProject", () => {
  it("sets and clears archived_at, without deleting the row", async () => {
    await archiveRomProject(db, TEST_PROJECT_ID, undefined);
    let row = await db.query<{ archived_at: string | null }>(`select archived_at from projects where id = $1`, [
      TEST_PROJECT_ID,
    ]);
    expect(row.rows[0].archived_at).not.toBeNull();

    await restoreRomProject(db, TEST_PROJECT_ID);
    row = await db.query(`select archived_at from projects where id = $1`, [TEST_PROJECT_ID]);
    expect(row.rows[0].archived_at).toBeNull();
  });

  it("refuses to archive the project configured for this environment", async () => {
    await expect(archiveRomProject(db, TEST_PROJECT_ID, TEST_PROJECT_ID)).rejects.toBeInstanceOf(
      CannotArchiveEnvProject,
    );
    const row = await db.query<{ archived_at: string | null }>(`select archived_at from projects where id = $1`, [
      TEST_PROJECT_ID,
    ]);
    expect(row.rows[0].archived_at).toBeNull();
  });

  it("throws archiving or restoring a project that does not exist", async () => {
    await expect(
      archiveRomProject(db, "00000000-0000-4000-8000-00000000abcd", undefined),
    ).rejects.toBeInstanceOf(ProjectNotFoundForEdit);
    await expect(
      restoreRomProject(db, "00000000-0000-4000-8000-00000000abcd"),
    ).rejects.toBeInstanceOf(ProjectNotFoundForEdit);
  });
});

// LA-1110: archiving hides a project from the pickers only. It must never
// remove that project's data from benchmark blends for other projects -- the
// projects table also holds past jobs (Jefferson's Ferry, Fieldstone) the ROM
// prices from. This proves an archived past job still feeds another
// project's blend, reading the same query lib/rom/run.ts's readBenchmarkData
// uses for provenance source projects.
describe("archived project still feeds benchmark blends", () => {
  it("keeps showing up in benchmark_source_projects after being archived", async () => {
    const benchmark = await db.query<{ id: string }>(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, provenance_kind, provenance_recorded_by, provenance_recorded_at)
       values ('TEST2', 'Second synthetic line', 'usd_per_gsf', 2, 'multifamily', 'new', 1,
               'reviewed_judgment', 'automated test', date '2026-08-27')
       returning id`,
    );
    await db.query(`insert into benchmark_source_projects (benchmark_id, project_id) values ($1, $2)`, [
      benchmark.rows[0].id,
      TEST_PROJECT_ID,
    ]);

    await archiveRomProject(db, TEST_PROJECT_ID, undefined);

    const { rows } = await db.query<{ project_id: string }>(
      `select bsp.project_id
         from benchmark_source_projects bsp
        where bsp.benchmark_id = $1`,
      [benchmark.rows[0].id],
    );
    expect(rows.map((r) => r.project_id)).toContain(TEST_PROJECT_ID);
  });

  it("still appears in readBenchmarkData's provenance for the benchmark it built (LA-1110)", async () => {
    await archiveRomProject(db, TEST_PROJECT_ID, undefined);
    const data = await readBenchmarkData(db, "multifamily", "new");
    const testLine = data.benchmarks.find((b) => b.costCode === "TEST");
    expect(testLine?.provenance.sourceProjectIds).toContain(TEST_PROJECT_ID);
  });
});
