import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase, TEST_PROJECT_ID } from "./database";

// LA-1212: 20260927230000_project_elevator_count.sql adds
// projects.elevator_count, nullable, checked at zero or above. Unlike
// stories_above_grade (checked above zero), zero is itself a legal Elevator
// Count -- no elevator -- so this column has to accept it. Nothing else in
// the schema changes.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("projects.elevator_count (LA-1212)", () => {
  it("is nullable, so a project that predates the column still opens", async () => {
    const { rows } = await db.query<{ elevator_count: number | null }>(
      `select elevator_count from projects where id = $1`,
      [TEST_PROJECT_ID],
    );
    expect(rows[0].elevator_count).toBeNull();
  });

  it("accepts zero", async () => {
    await db.query(`update projects set elevator_count = 0 where id = $1`, [TEST_PROJECT_ID]);
    const { rows } = await db.query<{ elevator_count: number }>(
      `select elevator_count from projects where id = $1`,
      [TEST_PROJECT_ID],
    );
    expect(rows[0].elevator_count).toBe(0);
  });

  it("accepts a whole number above zero", async () => {
    await db.query(`update projects set elevator_count = 2 where id = $1`, [TEST_PROJECT_ID]);
    const { rows } = await db.query<{ elevator_count: number }>(
      `select elevator_count from projects where id = $1`,
      [TEST_PROJECT_ID],
    );
    expect(rows[0].elevator_count).toBe(2);
  });

  it("refuses a negative number", async () => {
    await expect(
      db.query(`update projects set elevator_count = -1 where id = $1`, [TEST_PROJECT_ID]),
    ).rejects.toThrow();
  });
});
