import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TEST_PROJECT_ID, seededDatabase } from "./database";

// Db.withTransaction (added in code review 2026-09-20 for lib/rom/ingest.ts's
// approveCostImport -- see lib/db.ts's own doc comment on the method) is
// shared infrastructure every seededDatabase()-backed test relies on. This
// exercises its own commit/rollback contract directly, independent of any
// one caller's business logic.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("Db.withTransaction", () => {
  it("commits every write once the callback resolves", async () => {
    await db.withTransaction(async (tx) => {
      await tx.query(`insert into projects (id, name, project_type, construction_kind) values ($1, $2, $3, $4)`, [
        "00000000-0000-4000-8000-0000000000aa",
        "Committed project",
        "multifamily",
        "new",
      ]);
    });

    const { rows } = await db.query(`select 1 from projects where id = $1`, [
      "00000000-0000-4000-8000-0000000000aa",
    ]);
    expect(rows).toHaveLength(1);
  });

  it("rolls back every write when the callback throws, and rethrows the same error", async () => {
    class SyntheticFailure extends Error {}

    await expect(
      db.withTransaction(async (tx) => {
        await tx.query(`insert into projects (id, name, project_type, construction_kind) values ($1, $2, $3, $4)`, [
          "00000000-0000-4000-8000-0000000000bb",
          "Rolled back project",
          "multifamily",
          "new",
        ]);
        throw new SyntheticFailure("simulated failure after a real write");
      }),
    ).rejects.toThrow(SyntheticFailure);

    const { rows } = await db.query(`select 1 from projects where id = $1`, [
      "00000000-0000-4000-8000-0000000000bb",
    ]);
    expect(rows).toEqual([]);
  });

  it("returns the callback's own result", async () => {
    const result = await db.withTransaction(async () => "callback result");
    expect(result).toBe("callback result");
  });

  it("sees writes made by an outer, still-open call to db.query the same way any other connection would", async () => {
    // The seeded project from test/database.ts itself should already be
    // visible inside a fresh transaction.
    const { rows } = await db.withTransaction(async (tx) =>
      tx.query<{ id: string }>(`select id from projects where id = $1`, [TEST_PROJECT_ID]),
    );
    expect(rows).toEqual([{ id: TEST_PROJECT_ID }]);
  });
});
