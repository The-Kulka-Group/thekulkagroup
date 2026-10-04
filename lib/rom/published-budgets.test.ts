import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import type { DurationFacts } from "./duration-estimate";
import { RunNotSucceeded } from "./issue";
import {
  isToken,
  listPublishedBudgets,
  loadPublishedBudget,
  newToken,
  publishBudget,
  revokePublishedBudget,
  versionState,
} from "./published-budgets";

// LA-1417. A run becomes a published budget: a frozen snapshot under an
// unguessable link, one version per issue. Tested against a real Postgres
// built from this repo's migrations, same as lib/rom/issue.test.ts.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

const COPY = {
  preparedFor: "Harbor Point Partners (example)",
  preparedBy: "Devin (example)",
  validityDays: null,
  coverSentence: null,
};

async function succeededRunId(): Promise<string> {
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  return runId;
}

async function storedSnapshot(id: string): Promise<string> {
  const { rows } = await db.query<{ snapshot: string }>(
    `select snapshot::text as snapshot from published_budgets where id = $1`,
    [id],
  );
  return rows[0].snapshot;
}

describe("publishBudget", () => {
  it("makes a new row, token and version each time the same run is published", async () => {
    const runId = await succeededRunId();

    const first = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const second = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(second.id).not.toBe(first.id);
    expect(second.token).not.toBe(first.token);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from published_budgets`);
    expect(rows[0].n).toBe(2);
  });

  it("keeps the first snapshot byte-identical after a second publish, a new run and a benchmark change", async () => {
    const runId = await succeededRunId();
    const first = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const before = await storedSnapshot(first.id);

    await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    expect(await storedSnapshot(first.id)).toBe(before);

    await db.query(`update benchmarks set value = value * 3 where cost_code = 'TEST'`);
    const laterRunId = await succeededRunId();
    const third = await publishBudget(db as Db, { runId: laterRunId, issuedBy: "rob@example.com", copy: COPY });

    expect(await storedSnapshot(first.id)).toBe(before);
    // The benchmark change did reach the newer version, so the check above
    // is not passing because nothing moved.
    expect(await storedSnapshot(third.id)).not.toBe(before);
    expect(third.version).toBe(3);
  });
});

describe("the snapshot", () => {
  it("holds the run's ROM, answers, criteria, copy and engine hash", async () => {
    const runId = await succeededRunId();

    const published = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const view = await loadPublishedBudget(db as Db, published.token);

    if (view?.state !== "current") throw new Error("expected a current budget");
    const { snapshot } = view;
    expect(snapshot.run.id).toBe(runId);
    expect(snapshot.project).toEqual({ id: TEST_PROJECT_ID, name: "Synthetic test project" });
    expect(snapshot.rom.lines.length).toBeGreaterThan(0);
    expect(snapshot.answers.grossSquareFeet).toBe(1000);
    // The run derives the project's criteria; the snapshot holds the ones
    // on the project when it was published.
    const { rows: onProject } = await db.query<{ code: string }>(
      `select code from derived_assumptions where project_id = $1 order by code`,
      [TEST_PROJECT_ID],
    );
    expect(onProject.length).toBeGreaterThan(0);
    expect(snapshot.criteria.map((one) => one.code)).toEqual(onProject.map((row) => row.code));
    expect(snapshot.criteria[0]).not.toHaveProperty("id");
    expect(snapshot.copy).toEqual(COPY);
    expect(snapshot.engineSnapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot).not.toHaveProperty("allocatedResources");
    expect(snapshot).not.toHaveProperty("durationEstimate");
  });

  it("freezes the name of every job its comparables cite", async () => {
    // The synthetic TEST benchmark cites the test project as its source job.
    const runId = await succeededRunId();

    const published = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const view = await loadPublishedBudget(db as Db, published.token);

    if (view?.state !== "current") throw new Error("expected a current budget");
    expect(view.snapshot.sourceJobNames).toEqual({ [TEST_PROJECT_ID]: "Synthetic test project" });

    // A later rename does not reach the frozen name.
    await db.query(`update projects set name = 'Renamed' where id = $1`, [TEST_PROJECT_ID]);
    const again = await loadPublishedBudget(db as Db, published.token);
    if (again?.state !== "current") throw new Error("expected a current budget");
    expect(again.snapshot.sourceJobNames).toEqual({ [TEST_PROJECT_ID]: "Synthetic test project" });
  });

  it("refuses a run that did not succeed, and publishes nothing", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into runs (project_id, skill, status) values ($1, 'rom_tier1', 'failed') returning id`,
      [TEST_PROJECT_ID],
    );

    await expect(
      publishBudget(db as Db, { runId: rows[0].id, issuedBy: "devin@example.com", copy: COPY }),
    ).rejects.toThrow(RunNotSucceeded);
    const { rows: count } = await db.query<{ n: number }>(`select count(*)::int as n from published_budgets`);
    expect(count[0].n).toBe(0);
  });

  it("issues the run it publishes", async () => {
    const runId = await succeededRunId();

    await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

    const { rows } = await db.query<{ issued_at: Date | null }>(`select issued_at from runs where id = $1`, [runId]);
    expect(rows[0].issued_at).not.toBeNull();
  });
});

describe("tokens", () => {
  it("carries 16 random bytes in 22 URL-safe characters", () => {
    const tokens = Array.from({ length: 2000 }, () => newToken());

    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(Buffer.from(token, "base64url")).toHaveLength(16);
      expect(isToken(token)).toBe(true);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
    // Every one of the 64 characters turns up across 2,000 tokens, so the
    // alphabet is not quietly narrowed (44,000 draws; a missing character
    // would be a one in 10^300 event if the draw were uniform).
    expect(new Set(tokens.join("")).size).toBe(64);
  });

  it("rejects anything without a token's shape", () => {
    expect(isToken("short")).toBe(false);
    expect(isToken("A".repeat(23))).toBe(false);
    expect(isToken("AAAAAAAAAAAAAAAAAAAA+/")).toBe(false);
    expect(isToken("AAAAAAAAAAAAAAAAAAAA.p")).toBe(false);
  });
});

describe("a published row is frozen", () => {
  it("refuses a change to its snapshot, version or token, and refuses a delete", async () => {
    const runId = await succeededRunId();
    const { id } = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

    await expect(db.query(`update published_budgets set snapshot = '{}' where id = $1`, [id])).rejects.toThrow(/frozen/);
    await expect(db.query(`update published_budgets set version = 9 where id = $1`, [id])).rejects.toThrow(/frozen/);
    await expect(db.query(`update published_budgets set token = $2 where id = $1`, [id, newToken()])).rejects.toThrow(/frozen/);
    await expect(db.query(`delete from published_budgets where id = $1`, [id])).rejects.toThrow(/never deleted/);
  });

  it("sets the stored PDF's path once", async () => {
    const runId = await succeededRunId();
    const { id } = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

    await db.query(`update published_budgets set pdf_path = 'budgets/one.pdf' where id = $1`, [id]);
    await expect(
      db.query(`update published_budgets set pdf_path = 'budgets/two.pdf' where id = $1`, [id]),
    ).rejects.toThrow(/frozen/);
  });

  it("keeps the project and run it was published from", async () => {
    const runId = await succeededRunId();
    await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

    await expect(db.query(`delete from projects where id = $1`, [TEST_PROJECT_ID])).rejects.toThrow();
  });
});

describe("loadPublishedBudget", () => {
  it("reads a single published version as current", async () => {
    const runId = await succeededRunId();
    const published = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

    const view = await loadPublishedBudget(db as Db, published.token);

    expect(view).toMatchObject({ state: "current", version: 1, stage: "conceptual", newer: null });
  });

  it("reads an older version as superseded and names the newer one", async () => {
    const runId = await succeededRunId();
    const first = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const second = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

    const view = await loadPublishedBudget(db as Db, first.token);

    expect(view).toMatchObject({ state: "superseded", version: 1, newer: { version: 2, token: second.token } });
    const { rows } = await db.query<{ superseded_by: string }>(
      `select superseded_by from published_budgets where id = $1`,
      [first.id],
    );
    expect(rows[0].superseded_by).toBe(second.id);
  });

  it("sends a superseded reader past a withdrawn version to the newest open one", async () => {
    const runId = await succeededRunId();
    const first = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const second = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const third = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    await revokePublishedBudget(db as Db, third.id);

    const view = await loadPublishedBudget(db as Db, first.token);

    expect(view).toMatchObject({ state: "superseded", newer: { version: 2, token: second.token } });
  });

  it("reads a revoked version as withdrawn, with no figures, and keeps the first withdrawal time", async () => {
    const runId = await succeededRunId();
    const published = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

    const once = await revokePublishedBudget(db as Db, published.id);
    const twice = await revokePublishedBudget(db as Db, published.id);
    const view = await loadPublishedBudget(db as Db, published.token);

    expect(twice.revokedAt).toBe(once.revokedAt);
    expect(view).toEqual({ state: "withdrawn", version: 1, preparedBy: "Devin (example)" });
  });

  it("reads an unknown or malformed token as nothing", async () => {
    expect(await loadPublishedBudget(db as Db, newToken())).toBeNull();
    expect(await loadPublishedBudget(db as Db, "not-a-token")).toBeNull();
  });
});

describe("versionState", () => {
  it("is the one rule for a version's state: withdrawn once revoked, superseded while a later one is open, current otherwise", () => {
    expect(versionState({ revoked: true, newerOpen: true })).toBe("withdrawn");
    expect(versionState({ revoked: true, newerOpen: false })).toBe("withdrawn");
    expect(versionState({ revoked: false, newerOpen: true })).toBe("superseded");
    expect(versionState({ revoked: false, newerOpen: false })).toBe("current");
  });
});

describe("listPublishedBudgets", () => {
  it("gives each version the state its own link shows", async () => {
    const runId = await succeededRunId();
    const first = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const second = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const third = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    await revokePublishedBudget(db as Db, third.id);

    const listed = await listPublishedBudgets(db as Db, TEST_PROJECT_ID);

    expect(listed.map((v) => [v.version, v.state])).toEqual([
      [3, "withdrawn"],
      [2, "current"],
      [1, "superseded"],
    ]);
    for (const version of [first, second]) {
      const view = await loadPublishedBudget(db as Db, version.token);
      expect(listed.find((v) => v.id === version.id)!.state).toBe(view!.state);
    }
  });
});

// LA-1566. The estimator is a fake: these never reach the network.
describe("the duration estimate", () => {
  async function storedEstimate(id: string): Promise<unknown> {
    const { rows } = await db.query<{ estimate: unknown }>(`select snapshot->'durationEstimate' as estimate from published_budgets where id = $1`, [id]);
    return rows[0].estimate;
  }

  it("is made once at publishing and frozen, when the budget has no schedule", async () => {
    const runId = await succeededRunId();
    const asked: DurationFacts[] = [];

    const published = await publishBudget(
      db as Db,
      { runId, issuedBy: "devin@example.com", copy: COPY },
      { estimateDuration: async (facts) => (asked.push(facts), 16) },
    );

    expect(asked).toHaveLength(1);
    expect(asked[0].grossSquareFeet).toBe(1000);
    expect(asked[0].scope.length).toBeGreaterThan(0);
    expect(published.snapshot.durationEstimate).toEqual({ months: 16 });
    expect(await storedEstimate(published.id)).toEqual({ months: 16 });
  });

  it("is never asked for when the budget has a schedule", async () => {
    const runId = await succeededRunId();
    await db.query(`update runs set answers = answers || '{"allocatedResources": {"weeks": {"construction": 61}}}'::jsonb where id = $1`, [runId]);
    let asked = 0;

    const published = await publishBudget(
      db as Db,
      { runId, issuedBy: "devin@example.com", copy: COPY },
      { estimateDuration: async () => (asked++, 16) },
    );

    expect(asked).toBe(0);
    expect(published.snapshot.allocatedResources).toEqual({ weeks: { construction: 61 } });
    expect(published.snapshot).not.toHaveProperty("durationEstimate");
  });

  it("leaves publishing to succeed without one when the model fails", async () => {
    const runId = await succeededRunId();

    const published = await publishBudget(
      db as Db,
      { runId, issuedBy: "devin@example.com", copy: COPY },
      {
        estimateDuration: async () => {
          throw new Error("The model's duration was not whole months from 1 to 120.");
        },
      },
    );

    expect(published.version).toBe(1);
    expect(published.snapshot).not.toHaveProperty("durationEstimate");
    expect(await storedEstimate(published.id)).toBeNull();
  });
});
