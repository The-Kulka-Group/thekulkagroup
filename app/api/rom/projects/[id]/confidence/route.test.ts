import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-2967. A past job's estimator confidence score: set with its person and
// date, cleared with null, and refused without its provenance.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { PUT } = await import("./route");

function put(id: string, body: unknown, headers: Record<string, string> = {}) {
  return PUT(
    new Request(`http://localhost/api/rom/projects/${id}/confidence`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function stored() {
  const { rows } = await db.query<{ score: number | null; by: string | null; on: string | null }>(
    `select estimator_confidence as score, estimator_confidence_by as by,
            to_char(estimator_confidence_on, 'YYYY-MM-DD') as on
       from projects where id = $1`,
    [TEST_PROJECT_ID],
  );
  return rows[0];
}

const JESSE = { score: 8, scoredBy: "Jesse Snizek", scoredOn: "2026-10-15" };

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("PUT /api/rom/projects/[id]/confidence", () => {
  it("refuses a signed-out request and writes nothing", async () => {
    const response = await put(TEST_PROJECT_ID, JESSE, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
    expect((await stored()).score).toBeNull();
  });

  it("sets the score with the person and date who gave it", async () => {
    const response = await put(TEST_PROJECT_ID, JESSE);
    expect(response.status).toBe(200);
    expect((await response.json()).confidence).toEqual(JESSE);
    expect(await stored()).toEqual({ score: 8, by: "Jesse Snizek", on: "2026-10-15" });
  });

  it("clears the score with null", async () => {
    await put(TEST_PROJECT_ID, JESSE);
    const response = await put(TEST_PROJECT_ID, { score: null });
    expect(response.status).toBe(200);
    expect((await response.json()).confidence).toBeNull();
    expect(await stored()).toEqual({ score: null, by: null, on: null });
  });

  it.each([
    [{ ...JESSE, score: 0 }, /whole number from 1 to 10/],
    [{ ...JESSE, score: 11 }, /whole number from 1 to 10/],
    [{ ...JESSE, score: 7.5 }, /whole number from 1 to 10/],
    [{ ...JESSE, scoredBy: " " }, /scoredBy/],
    [{ ...JESSE, scoredOn: "Oct 15" }, /scoredOn/],
  ])("refuses %j", async (body, message) => {
    const response = await put(TEST_PROJECT_ID, body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(message);
    expect((await stored()).score).toBeNull();
  });

  it("lets the database refuse a score with no person or date behind it", async () => {
    await expect(
      db.query(`update projects set estimator_confidence = 5 where id = $1`, [TEST_PROJECT_ID]),
    ).rejects.toThrow(/projects_estimator_confidence_provenance_check/);
  });

  it("404s for a job that does not exist", async () => {
    const response = await put("00000000-0000-4000-8000-00000000abcd", JESSE);
    expect(response.status).toBe(404);
  });
});
