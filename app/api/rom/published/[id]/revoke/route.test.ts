import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { publishBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1419. Revoke a published version: the link stops opening and the row
// keeps its first withdrawal time.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(id: string, headers: Record<string, string> = {}) {
  return POST(new Request(`http://localhost/api/rom/published/${id}/revoke`, { method: "POST", headers }), ctx(id));
}

const COPY = { preparedFor: "A", preparedBy: "B", validityDays: 90, coverSentence: null };

async function published() {
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  return publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/published/[id]/revoke", () => {
  it("refuses a signed-out request and leaves the link open", async () => {
    const version = await published();
    expect((await post(version.id, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
    const { rows } = await db.query<{ revoked_at: string | null }>(
      `select revoked_at from published_budgets where id = $1`,
      [version.id],
    );
    expect(rows[0].revoked_at).toBeNull();
  });

  it("sets revoked_at and returns the record", async () => {
    const version = await published();
    const response = await post(version.id);
    expect(response.status).toBe(200);
    const { published: record } = await response.json();
    expect(record.id).toBe(version.id);
    expect(record.revokedAt).not.toBeNull();
  });

  it("keeps the first withdrawal time on a second call", async () => {
    const version = await published();
    const first = (await (await post(version.id)).json()).published;
    const second = (await (await post(version.id)).json()).published;
    expect(second.revokedAt).toBe(first.revokedAt);
  });

  it("answers 404 for an id that is not a published budget", async () => {
    expect((await post("not-a-uuid")).status).toBe(404);
    expect((await post("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
