import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { publishBudget, revokePublishedBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1419. The version list: every published version of a project, newest first.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET } = await import("./route");

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function get(id: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/rom/projects/${id}/published`, { headers }), ctx(id));
}

const COPY = { preparedFor: "A", preparedBy: "B", validityDays: 90, coverSentence: null };

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("GET /api/rom/projects/[id]/published", () => {
  it("refuses a signed-out request", async () => {
    expect((await get(TEST_PROJECT_ID, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
  });

  it("lists nothing for a project that was never published", async () => {
    const response = await get(TEST_PROJECT_ID);
    expect(response.status).toBe(200);
    expect((await response.json()).published).toEqual([]);
  });

  it("lists every version newest first, a withdrawn one included", async () => {
    const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
    const first = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    const second = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
    await revokePublishedBudget(db as Db, first.id);

    const { published } = await (await get(TEST_PROJECT_ID)).json();
    expect(published.map((one: { version: number }) => one.version)).toEqual([2, 1]);
    expect(published[0].token).toBe(second.token);
    expect(published[1].revokedAt).not.toBeNull();
    expect(published[1].supersededBy).toBe(second.id);
  });

  it("answers 404 for an id that is not a project", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
  });
});
