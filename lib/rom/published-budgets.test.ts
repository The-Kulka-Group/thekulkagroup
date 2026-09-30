import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { publishBudget } from "./published-budgets";

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
