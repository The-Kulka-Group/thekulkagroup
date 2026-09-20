import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import {
  RunNotFound,
  RunNotLinked,
  RunNotSucceeded,
  issueRom,
  linkRomToProject,
  recordClosingComparison,
} from "./issue";

// The API seam LA-816 adds on top of LA-12's runs table: issuing a ROM,
// linking it to the project it becomes, and scoring a closing comparison.
// Tested against a real Postgres built from this repo's migrations, same
// pattern as app/api/rom/route.test.ts.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

async function succeededRunId(): Promise<string> {
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  return runId;
}

async function newProjectId(name = "Becomes a real job (example)"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into projects (name, project_type, construction_kind)
     values ($1, 'multifamily', 'new')
     returning id`,
    [name],
  );
  return rows[0].id;
}

describe("issueRom", () => {
  it("records a timestamp on a succeeded run", async () => {
    const runId = await succeededRunId();

    const { issuedAt } = await issueRom(db as Db, runId);

    expect(issuedAt).toBeTruthy();
    const { rows } = await db.query<{ issued_at: Date | null }>(
      `select issued_at from runs where id = $1`,
      [runId],
    );
    expect(rows[0].issued_at).not.toBeNull();
  });

  it("keeps the first issuance timestamp on a second call", async () => {
    const runId = await succeededRunId();

    const first = await issueRom(db as Db, runId);
    const second = await issueRom(db as Db, runId);

    expect(second.issuedAt).toBe(first.issuedAt);
  });

  it("refuses to issue a run that has not succeeded", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into projects (name, project_type, construction_kind)
       values ('No GSF (example)', 'multifamily', 'new')
       returning id`,
    );
    await expect(runRom(db as Db, rows[0].id)).rejects.toThrow();

    const { rows: runRows } = await db.query<{ id: string }>(`select id from runs limit 1`);
    await expect(issueRom(db as Db, runRows[0].id)).rejects.toThrow(RunNotSucceeded);
  });

  it("refuses a run that does not exist", async () => {
    await expect(
      issueRom(db as Db, "00000000-0000-4000-8000-0000000000ff"),
    ).rejects.toThrow(RunNotFound);
  });
});

describe("linkRomToProject", () => {
  it("links a run to the project record it becomes", async () => {
    const runId = await succeededRunId();
    const projectId = await newProjectId();

    await linkRomToProject(db as Db, runId, projectId);

    const { rows } = await db.query<{ linked_project_id: string }>(
      `select linked_project_id from runs where id = $1`,
      [runId],
    );
    expect(rows[0].linked_project_id).toBe(projectId);
  });

  it("rejects a project id that does not exist", async () => {
    const runId = await succeededRunId();

    await expect(
      linkRomToProject(db as Db, runId, "00000000-0000-4000-8000-0000000000ff"),
    ).rejects.toThrow();
  });

  it("does not require the run to be issued first (LA-680: not required at issue time)", async () => {
    const runId = await succeededRunId();
    const projectId = await newProjectId();

    await expect(linkRomToProject(db as Db, runId, projectId)).resolves.not.toThrow();
  });
});

describe("recordClosingComparison", () => {
  it("refuses a run with no linked project", async () => {
    const runId = await succeededRunId();

    await expect(recordClosingComparison(db as Db, runId, 1000)).rejects.toThrow(RunNotLinked);
  });

  it("scores predicted trade cost against actual trade cost once linked", async () => {
    const runId = await succeededRunId();
    const projectId = await newProjectId();
    await linkRomToProject(db as Db, runId, projectId);

    const { rows } = await db.query<{ rom: { total: { low: number; high: number } } }>(
      `select rom from runs where id = $1`,
      [runId],
    );
    const midpoint = (rows[0].rom.total.low + rows[0].rom.total.high) / 2;

    const comparison = await recordClosingComparison(db as Db, runId, midpoint);

    expect(comparison.projectId).toBe(projectId);
    expect(comparison.withinTenPercent).toBe(true);
    expect(comparison.percentError).toBeCloseTo(0, 5);
  });

  it("flags a comparison outside ten percent", async () => {
    const runId = await succeededRunId();
    const projectId = await newProjectId();
    await linkRomToProject(db as Db, runId, projectId);

    const comparison = await recordClosingComparison(db as Db, runId, 1);

    expect(comparison.withinTenPercent).toBe(false);
  });

  it("writes a row future comparisons can be read back from", async () => {
    const runId = await succeededRunId();
    const projectId = await newProjectId();
    await linkRomToProject(db as Db, runId, projectId);
    await recordClosingComparison(db as Db, runId, 1000, 42);

    const { rows } = await db.query<{ percent_complete: string }>(
      `select percent_complete from closing_comparisons where run_id = $1`,
      [runId],
    );
    expect(Number(rows[0].percent_complete)).toBe(42);
  });
});
