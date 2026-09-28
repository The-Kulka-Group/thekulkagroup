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

  // LA-1140: rom_budget lets a clean New budget with zero runs list, while a
  // past job with neither a run nor the flag (never made through New budget)
  // stays out, and the 20260926140000 backfill (rom_budget = true wherever a
  // run exists) keeps today's picker contents unchanged.
  describe("rom_budget flag (LA-1140)", () => {
    it("lists a budget flagged rom_budget even with no run", async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into projects (name, project_type, construction_kind, rom_budget)
         values ('Clean budget (example)', 'multifamily', 'new', true) returning id`,
      );
      const after = await listRomProjects(db);
      expect(after.map((p) => p.id)).toContain(rows[0].id);
    });

    it("excludes a past job with neither a run nor the rom_budget flag", async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into projects (name, project_type, construction_kind)
         values ('Benchmark-only job (example)', 'multifamily', 'new') returning id`,
      );
      const after = await listRomProjects(db);
      expect(after.map((p) => p.id)).not.toContain(rows[0].id);
    });

    it("excludes an archived project even when flagged rom_budget", async () => {
      const { rows } = await db.query<{ id: string }>(
        `insert into projects (name, project_type, construction_kind, rom_budget, archived_at)
         values ('Archived budget (example)', 'multifamily', 'new', true, now()) returning id`,
      );
      const after = await listRomProjects(db);
      expect(after.map((p) => p.id)).not.toContain(rows[0].id);
    });

    it("backfill: flags rom_budget = true for a project that already has a run, and leaves one without a run false", async () => {
      const withRun = await db.query<{ id: string }>(
        `insert into projects (name, project_type, construction_kind)
         values ('Had a run before backfill (example)', 'multifamily', 'new') returning id`,
      );
      await db.query(`insert into runs (project_id, skill, status) values ($1, 'rom_tier1', 'succeeded')`, [
        withRun.rows[0].id,
      ]);
      const withoutRun = await db.query<{ id: string }>(
        `insert into projects (name, project_type, construction_kind)
         values ('Never had a run (example)', 'multifamily', 'new') returning id`,
      );

      // The same backfill statement the 20260926140000 migration runs, applied
      // again here to prove it flags every project with a run and nothing
      // else -- exactly what "today's picker contents are unchanged" means.
      await db.query(`update projects set rom_budget = true where id in (select distinct project_id from runs)`);

      const after = await db.query<{ id: string; rom_budget: boolean }>(
        `select id, rom_budget from projects where id in ($1, $2)`,
        [withRun.rows[0].id, withoutRun.rows[0].id],
      );
      const byId = Object.fromEntries(after.rows.map((r) => [r.id, r.rom_budget]));
      expect(byId[withRun.rows[0].id]).toBe(true);
      expect(byId[withoutRun.rows[0].id]).toBe(false);
    });
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

  // LA-1199: Stories Above Grade, Unit Count, Building Count and ZIP save
  // through the same PATCH path New budget's own insert uses, and read back
  // on the next GET the way Edit project prefills from it.
  describe("stories above grade, unit count, building count, zip (LA-1199)", () => {
    it("saves and reloads all four", async () => {
      await updateRomProject(db, TEST_PROJECT_ID, {
        ...editBudget,
        storiesAboveGrade: 4,
        unitCount: 120,
        buildingCount: 3,
        zip: "10956",
      });
      const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
      expect(detail).toMatchObject({
        storiesAboveGrade: 4,
        unitCount: 120,
        buildingCount: 3,
        zip: "10956",
      });
    });

    it("leaves building count at its existing value when the edit sends none", async () => {
      await updateRomProject(db, TEST_PROJECT_ID, { ...editBudget, buildingCount: 5 });
      await updateRomProject(db, TEST_PROJECT_ID, editBudget);
      const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
      expect(detail?.buildingCount).toBe(5);
    });

    it("reads back null for a project that predates these fields (LA-1199: older projects still open)", async () => {
      const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
      expect(detail?.storiesAboveGrade).toBeNull();
      expect(detail?.unitCount).toBeNull();
      expect(detail?.zip).toBeNull();
      // The column itself is NOT NULL DEFAULT 1 from an earlier migration.
      expect(detail?.buildingCount).toBe(1);
    });

    it("clears stories above grade, unit count and zip back to null", async () => {
      await updateRomProject(db, TEST_PROJECT_ID, {
        ...editBudget,
        storiesAboveGrade: 4,
        unitCount: 120,
        zip: "10956",
      });
      await updateRomProject(db, TEST_PROJECT_ID, editBudget);
      const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
      expect(detail?.storiesAboveGrade).toBeNull();
      expect(detail?.unitCount).toBeNull();
      expect(detail?.zip).toBeNull();
    });
  });

  // LA-1212: Elevator Count saves and reloads through the same PATCH path,
  // and clears back to null the same way the four fields above do. It gets
  // its own block because zero is a legal, distinct value from null (no
  // elevator, vs. never answered), unlike any of the four above.
  describe("elevator count (LA-1212)", () => {
    it("saves and reloads a count", async () => {
      await updateRomProject(db, TEST_PROJECT_ID, { ...editBudget, elevatorCount: 2 });
      const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
      expect(detail?.elevatorCount).toBe(2);
    });

    it("saves and reloads zero, distinct from null", async () => {
      await updateRomProject(db, TEST_PROJECT_ID, { ...editBudget, elevatorCount: 0 });
      const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
      expect(detail?.elevatorCount).toBe(0);
    });

    it("reads back null for a project that never answered the elevator question", async () => {
      const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
      expect(detail?.elevatorCount).toBeNull();
    });

    it("clears an elevator count back to null", async () => {
      await updateRomProject(db, TEST_PROJECT_ID, { ...editBudget, elevatorCount: 2 });
      await updateRomProject(db, TEST_PROJECT_ID, editBudget);
      const detail = await readRomProjectDetail(db, TEST_PROJECT_ID);
      expect(detail?.elevatorCount).toBeNull();
    });
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
