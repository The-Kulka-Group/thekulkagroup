import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { stageCostImport } from "@/lib/rom/ingest";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

function approve(id: string, headers: Record<string, string> = {}) {
  return POST(new Request("http://localhost", { method: "POST", headers }), context(id));
}

async function staged() {
  return stageCostImport(db as Db, {
    sourceProjectId: TEST_PROJECT_ID,
    exportLabel: "Autodesk Cost export (example)",
    provenanceKind: "actuals",
    uploadedBy: "reviewer@kulka.com",
    fileText: ["description,value", '"Foundations, footings, and slab-on-grade",42.50'].join("\n"),
  });
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/imports/:id/approve", () => {
  it("rejects a signed-out request without approving anything", async () => {
    const costImport = await staged();
    const response = await approve(costImport.id, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);

    const { rows } = await db.query<{ status: string }>(`select status from cost_imports where id = $1`, [
      costImport.id,
    ]);
    expect(rows[0].status).toBe("staged");
  });

  it("approves a staged import and reports the promotion summary", async () => {
    const costImport = await staged();
    const response = await approve(costImport.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      costImportId: costImport.id,
      approved: 1,
      excluded: 0,
      unmapped: 0,
    });
  });

  it("returns 404 for an import that does not exist", async () => {
    expect((await approve("00000000-0000-4000-8000-0000000000ff")).status).toBe(404);
  });

  it("returns 409 the second time the same import is approved", async () => {
    const costImport = await staged();
    await approve(costImport.id);
    expect((await approve(costImport.id)).status).toBe(409);
  });
});
