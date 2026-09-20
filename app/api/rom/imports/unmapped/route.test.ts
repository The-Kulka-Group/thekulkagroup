import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { stageCostImport } from "@/lib/rom/ingest";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET } = await import("./route");

function get(headers: Record<string, string> = {}) {
  return GET(new Request("http://localhost", { headers }));
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("GET /api/rom/imports/unmapped", () => {
  it("rejects a signed-out request", async () => {
    expect((await get({ "x-kulka-test-auth": "signed-out" })).status).toBe(401);
  });

  it("lists a line that could not be mapped with confidence (AC4)", async () => {
    await stageCostImport(db as Db, {
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Example export",
      provenanceKind: "actuals",
      uploadedBy: "reviewer@kulka.com",
      fileText: "description,value\nTotally unrelated widget nonsense,10",
    });

    const response = await get();
    expect(response.status).toBe(200);
    const { lines } = await response.json();
    expect(lines).toHaveLength(1);
    expect(lines[0].rawDescription).toBe("Totally unrelated widget nonsense");
  });

  it("returns an empty list when nothing is unmapped", async () => {
    const response = await get();
    expect((await response.json()).lines).toEqual([]);
  });
});
