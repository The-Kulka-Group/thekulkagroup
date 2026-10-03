import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { addReader, findActiveReader } from "@/lib/rom/budget-comments";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1486. Revoke a reader link: the key stops working and the row keeps its
// first revoke time.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function post(id: string, headers: Record<string, string> = {}) {
  return POST(new Request(`http://localhost/api/rom/readers/${id}/revoke`, { method: "POST", headers }), ctx(id));
}

const reader = () =>
  addReader(db as Db, { projectId: TEST_PROJECT_ID, name: "Dan Reyes", email: "dan@example.com", createdBy: "devin@example.com" });

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/readers/[id]/revoke", () => {
  it("refuses a signed-out request and leaves the link working", async () => {
    const dan = await reader();
    expect((await post(dan.id, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
    expect(await findActiveReader(db as Db, dan.readerKey)).not.toBeNull();
  });

  it("revokes the link, so the key no longer finds a reader", async () => {
    const dan = await reader();
    const response = await post(dan.id);

    expect(response.status).toBe(200);
    const { reader: record } = await response.json();
    expect(record.id).toBe(dan.id);
    expect(record.revokedAt).not.toBeNull();
    expect(record).not.toHaveProperty("readerKey");
    expect(await findActiveReader(db as Db, dan.readerKey)).toBeNull();
  });

  it("keeps the first revoke time on a second call", async () => {
    const dan = await reader();
    const first = (await (await post(dan.id)).json()).reader;
    const second = (await (await post(dan.id)).json()).reader;
    expect(second.revokedAt).toBe(first.revokedAt);
  });

  it("answers 404 for an id that is not a reader", async () => {
    expect((await post("not-a-uuid")).status).toBe(404);
    expect((await post("00000000-0000-4000-8000-000000000000")).status).toBe(404);
  });
});
