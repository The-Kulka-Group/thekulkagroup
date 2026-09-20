import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { stageCostImport } from "@/lib/rom/ingest";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function get(id: string, headers: Record<string, string> = {}) {
  return GET(new Request("http://localhost", { headers }), context(id));
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("GET /api/rom/imports/:id", () => {
  it("rejects a signed-out request", async () => {
    const response = await get("00000000-0000-4000-8000-0000000000ff", { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
  });

  it("returns a staged import for review", async () => {
    const staged = await stageCostImport(db as Db, {
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Example export",
      provenanceKind: "actuals",
      uploadedBy: "reviewer@kulka.com",
      fileText: "description,value\nRoofing,10",
    });

    const response = await get(staged.id);
    expect(response.status).toBe(200);
    expect((await response.json()).costImport.id).toBe(staged.id);
  });

  it("returns 404 for a malformed or missing id", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
    expect((await get("00000000-0000-4000-8000-0000000000ff")).status).toBe(404);
  });
});
