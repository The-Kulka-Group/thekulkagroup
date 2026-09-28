import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// Matt, 2026-09-28: a supporting item with no rate takes one on its card.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/rom/rates", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const plumbing = { projectId: TEST_PROJECT_ID, costCode: "28a", value: 1500 };

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/rates", () => {
  it("refuses a signed-out request", async () => {
    expect((await post(plumbing, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
  });

  it("records a supporting item's rate, named and dated, and a run prices it per structure", async () => {
    expect((await post(plumbing)).status).toBe(201);
    const { rows } = await db.query<{ unit: string; value: string; provenance_kind: string; label: string }>(
      `select unit, value, provenance_kind, label from benchmarks
        where cost_code = '28a' and project_type = 'multifamily' and construction_kind = 'new'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ unit: "usd_each_structure", provenance_kind: "reviewed_judgment" });
    expect(Number(rows[0].value)).toBe(1500);

    // The test database carries no demolition rates. Structure Demolition is
    // the driver that brings the supporting item in, so it needs one.
    await db.query(
      `insert into benchmarks
         (cost_code, label, unit, value, structure_type, project_type, construction_kind, comparable_count,
          scope_side, provenance_kind, provenance_recorded_by, provenance_recorded_at)
       values ('1a', 'Synthetic Structure Demolition', 'usd_per_sf_of_structure', 6.6, 'wood_frame_type_v',
               'multifamily', 'new', 1, 'site', 'reviewed_judgment', 'Test', '2026-09-28')`,
    );
    await db.query(
      `update projects set demolition_gate = 'yes', demolition_structure_count = 2,
              demolition_structure_square_feet = 8000, demolition_structure_type = 'wood_frame_type_v'
        where id = $1`,
      [TEST_PROJECT_ID],
    );
    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    const line = rom.lines.find((one) => one.costCode === "28a");
    expect(line).toBeDefined();
    expect((line!.low + line!.high) / 2).toBe(3000);
    expect(rom.unpricedItems.some((item) => item.costCode === "28a")).toBe(false);
  });

  it("refuses a second rate for the same item, a non-supporting item, and a rate of zero", async () => {
    await post(plumbing);
    expect((await post(plumbing)).status).toBe(400);
    expect((await post({ ...plumbing, costCode: "3" })).status).toBe(400);
    expect((await post({ ...plumbing, costCode: "28b", value: 0 })).status).toBe(400);
    expect((await post({ ...plumbing, projectId: "00000000-0000-4000-8000-00000000abcd" })).status).toBe(404);
  });
});
