import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1110. Restore project: clears archived_at.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(id: string, headers: Record<string, string> = {}) {
  return POST(new Request(`http://localhost/api/rom/projects/${id}/restore`, { method: "POST", headers }), ctx(id));
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/projects/[id]/restore", () => {
  it("refuses a signed-out request", async () => {
    const response = await post(TEST_PROJECT_ID, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
  });

  it("clears archived_at", async () => {
    await db.query(`update projects set archived_at = now() where id = $1`, [TEST_PROJECT_ID]);
    const response = await post(TEST_PROJECT_ID);
    expect(response.status).toBe(200);
    const row = await db.query<{ archived_at: string | null }>(`select archived_at from projects where id = $1`, [
      TEST_PROJECT_ID,
    ]);
    expect(row.rows[0].archived_at).toBeNull();
  });

  it("404s for a project that does not exist", async () => {
    const response = await post("00000000-0000-4000-8000-00000000abcd");
    expect(response.status).toBe(404);
  });
});
