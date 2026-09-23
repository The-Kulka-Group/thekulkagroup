import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { approveCostImport, stageCostImport } from "@/lib/rom/ingest";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { PATCH } = await import("./route");
const context = (id: string, lineId: string) => ({ params: Promise.resolve({ id, lineId }) });

function patch(
  id: string,
  lineId: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return PATCH(
    new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    context(id, lineId),
  );
}

async function staged() {
  return stageCostImport(db as Db, {
    sourceProjectId: TEST_PROJECT_ID,
    exportLabel: "Autodesk Cost export (example)",
    provenanceKind: "actuals",
    uploadedBy: "reviewer@kulka.com",
    fileText: [
      "description,division,value",
      '"Foundations, footings, and slab-on-grade",03,42.50',
      "Totally unrelated widget nonsense,99,10.00",
    ].join("\n"),
  });
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("PATCH /api/rom/imports/:id/lines/:lineId", () => {
  it("rejects a signed-out request without changing the line", async () => {
    const costImport = await staged();
    const line = costImport.lines[1];

    const response = await patch(
      costImport.id,
      line.id,
      { exclude: true },
      { "x-kulka-test-auth": "signed-out" },
    );
    expect(response.status).toBe(401);

    const { rows } = await db.query<{ status: string }>(
      `select status from cost_import_lines where id = $1`,
      [line.id],
    );
    expect(rows[0].status).toBe(line.status);
  });

  it("remaps an unmapped line to a canonical item and stages it", async () => {
    const costImport = await staged();
    const unmappedLine = costImport.lines[1];

    const { rows: itemRows } = await db.query<{ id: string }>(
      `select id from canonical_work_items where item_number = '2'`,
    );

    const response = await patch(costImport.id, unmappedLine.id, {
      canonicalItemId: itemRows[0].id,
    });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.line.status).toBe("staged");
    expect(body.line.candidateCanonicalItem.itemNumber).toBe("2");
  });

  it("excludes a line", async () => {
    const costImport = await staged();
    const mappedLine = costImport.lines[0];

    const response = await patch(costImport.id, mappedLine.id, { exclude: true });
    expect(response.status).toBe(200);
    expect((await response.json()).line.status).toBe("excluded");
  });

  it("returns 404 for an import that does not exist", async () => {
    const costImport = await staged();
    const response = await patch(
      "00000000-0000-4000-8000-0000000000ff",
      costImport.lines[0].id,
      { exclude: true },
    );
    expect(response.status).toBe(404);
  });

  it("returns 404 for a line that belongs to a different import", async () => {
    const first = await staged();
    const second = await staged();

    const response = await patch(first.id, second.lines[0].id, { exclude: true });
    expect(response.status).toBe(404);
  });

  it("returns 404 for a canonical item that does not exist", async () => {
    const costImport = await staged();
    const response = await patch(costImport.id, costImport.lines[0].id, {
      canonicalItemId: "00000000-0000-4000-8000-0000000000ff",
    });
    expect(response.status).toBe(404);
  });

  it("returns 409 once the import is approved", async () => {
    const costImport = await staged();
    await approveCostImport(db as Db, costImport.id, "approver@kulka.com");

    const response = await patch(costImport.id, costImport.lines[0].id, { exclude: true });
    expect(response.status).toBe(409);
  });

  it("returns 400 for a body that names neither action", async () => {
    const costImport = await staged();
    const response = await patch(costImport.id, costImport.lines[0].id, {});
    expect(response.status).toBe(400);
  });
});
