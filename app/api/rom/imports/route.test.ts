import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// The staging API surface (LA-15 AC1), tested the way app/api/rom/route.test.ts
// tests the run route: a real Postgres built from this repo's migrations,
// with auth mocked through the same x-kulka-test-auth header.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

const CSV_TEXT = [
  "description,division,value",
  '"Foundations, footings, and slab-on-grade",03,42.50',
  "Totally unrelated widget nonsense,99,10.00",
].join("\n");

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/rom/imports", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/imports", () => {
  it("rejects a signed-out request before staging anything", async () => {
    const response = await post(
      { sourceProjectId: TEST_PROJECT_ID, exportLabel: "Example", provenanceKind: "actuals", fileText: CSV_TEXT },
      { "x-kulka-test-auth": "signed-out" },
    );
    expect(response.status).toBe(401);
    expect((await db.query(`select 1 from cost_imports`)).rows).toEqual([]);
  });

  it("stages a mapped line and an unmapped line for review", async () => {
    const response = await post({
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Autodesk Cost export (example)",
      provenanceKind: "actuals",
      fileText: CSV_TEXT,
    });
    expect(response.status).toBe(201);

    const { costImport } = await response.json();
    expect(costImport.status).toBe("staged");
    expect(costImport.lines).toHaveLength(2);
    expect(costImport.lines[0].status).toBe("staged");
    expect(costImport.lines[1].status).toBe("unmapped");
  });

  it("rejects a body missing required fields without opening an import", async () => {
    const response = await post({ sourceProjectId: TEST_PROJECT_ID });
    expect(response.status).toBe(400);
    expect((await db.query(`select 1 from cost_imports`)).rows).toEqual([]);
  });

  it("returns 404 for a source project that does not exist", async () => {
    const response = await post({
      sourceProjectId: "00000000-0000-4000-8000-0000000000ff",
      exportLabel: "Example",
      provenanceKind: "actuals",
      fileText: CSV_TEXT,
    });
    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed file", async () => {
    const response = await post({
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Example",
      provenanceKind: "actuals",
      fileText: "not,a,valid,header\n1,2,3,4",
    });
    expect(response.status).toBe(400);
  });

  it("stages every valid row and reports a bad row instead of failing the whole file (fixed in code review, finding #4)", async () => {
    const response = await post({
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Example",
      provenanceKind: "actuals",
      fileText: ["description,value", '"Foundations, footings, and slab-on-grade",42.50', "Missing a value,"].join(
        "\n",
      ),
    });
    expect(response.status).toBe(201);

    const { costImport } = await response.json();
    expect(costImport.lines).toHaveLength(1);
    expect(costImport.skippedRows).toEqual([{ rowNumber: 3, reason: '"value" is required.' }]);
  });
});
