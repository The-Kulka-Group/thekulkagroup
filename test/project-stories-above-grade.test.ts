import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase, TEST_PROJECT_ID } from "./database";

// LA-1199: 20260927180000_project_stories_above_grade.sql adds
// projects.stories_above_grade, nullable, checked above zero. Nothing else in
// the schema changes.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("projects.stories_above_grade (LA-1199)", () => {
  it("is nullable, so a project that predates the column still opens", async () => {
    const { rows } = await db.query<{ stories_above_grade: number | null }>(
      `select stories_above_grade from projects where id = $1`,
      [TEST_PROJECT_ID],
    );
    expect(rows[0].stories_above_grade).toBeNull();
  });

  it("accepts a whole number above zero", async () => {
    await db.query(`update projects set stories_above_grade = 4 where id = $1`, [TEST_PROJECT_ID]);
    const { rows } = await db.query<{ stories_above_grade: number }>(
      `select stories_above_grade from projects where id = $1`,
      [TEST_PROJECT_ID],
    );
    expect(rows[0].stories_above_grade).toBe(4);
  });

  it("refuses zero and refuses a negative number", async () => {
    await expect(
      db.query(`update projects set stories_above_grade = 0 where id = $1`, [TEST_PROJECT_ID]),
    ).rejects.toThrow();
    await expect(
      db.query(`update projects set stories_above_grade = -1 where id = $1`, [TEST_PROJECT_ID]),
    ).rejects.toThrow();
  });
});
