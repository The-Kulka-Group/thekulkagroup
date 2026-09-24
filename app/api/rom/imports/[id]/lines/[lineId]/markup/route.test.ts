import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { approveCostImport, remapCostImportLine, stageCostImport } from "@/lib/rom/ingest";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");
const context = (id: string, lineId: string) => ({ params: Promise.resolve({ id, lineId }) });

function post(id: string, lineId: string, body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    context(id, lineId),
  );
}

// Two confidently matched trade lines and one line the matcher cannot place,
// which stands in for a combined GRs/GCs line on a real budget.
async function staged() {
  const costImport = await stageCostImport(db as Db, {
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
  const [trade, unmapped] = costImport.lines;
  expect(trade.status).toBe("staged");
  expect(unmapped.status).toBe("unmapped");
  return { costImport, trade, unmapped };
}

const historyRows = () =>
  db
    .query<{ setup: string; usd_per_gsf: string; pct_of_subtotal: string; recorded_by: string; export_label: string }>(
      `select setup, usd_per_gsf, pct_of_subtotal, recorded_by, export_label from markup_history`,
    )
    .then((r) => r.rows);

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/imports/:id/lines/:lineId/markup", () => {
  it("rejects a signed-out request without recording anything", async () => {
    const { costImport, unmapped } = await staged();
    const response = await post(
      costImport.id,
      unmapped.id,
      { setup: "both" },
      { "x-kulka-test-auth": "signed-out" },
    );
    expect(response.status).toBe(401);
    expect(await historyRows()).toEqual([]);
  });

  it("routes an unmapped line on an approved import, against the approved subtotal", async () => {
    const { costImport, unmapped } = await staged();
    await approveCostImport(db as Db, costImport.id, "approver@kulka.com");

    const response = await post(costImport.id, unmapped.id, { setup: "both" });
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.line.status).toBe("markup");
    expect(body.history.setup).toBe("both");
    expect(body.history.usdPerGsf).toBe(10);
    expect(body.history.pctOfSubtotal).toBeCloseTo(10 / 42.5, 10);

    const [row] = await historyRows();
    expect(Number(row.pct_of_subtotal)).toBeCloseTo(10 / 42.5, 10);
    expect(row.export_label).toBe("Autodesk Cost export (example)");
    expect(row.recorded_by).toBeTruthy();

    const { rows } = await db.query<{ status: string; mapped_by: string | null }>(
      `select status, mapped_by from cost_import_lines where id = $1`,
      [unmapped.id],
    );
    expect(rows[0].status).toBe("markup");
    expect(rows[0].mapped_by).toBe(row.recorded_by);
  });

  it("routes a staged line on a staged import, against the other staged lines", async () => {
    const { costImport, trade } = await staged();
    // A second staged trade line so the routed line has a subtotal to divide by.
    const { rows: items } = await db.query<{ id: string }>(
      `select id from canonical_work_items where contract_side = 'kulka' order by sort_order limit 1`,
    );
    const second = costImport.lines[1];
    await remapCostImportLine(db as Db, costImport.id, second.id, { canonicalItemId: items[0].id }, "r@kulka.com");

    const response = await post(costImport.id, trade.id, { setup: "gc_only" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.history.pctOfSubtotal).toBeCloseTo(42.5 / 10, 10);
    expect(body.line.status).toBe("markup");
  });

  it("leaves owner-direct lines out of the subtotal", async () => {
    const { costImport, trade, unmapped } = await staged();
    const { rows: owner } = await db.query<{ id: string }>(
      `select id from canonical_work_items where contract_side = 'owner' limit 1`,
    );
    expect(owner[0]).toBeDefined();
    await db.query(
      `insert into cost_import_lines
         (cost_import_id, row_number, raw_description, value_usd_per_gsf,
          candidate_canonical_item_id, candidate_score, status)
       values ($1, 99, 'Appliances', 7, $2, 1, 'staged')`,
      [costImport.id, owner[0].id],
    );

    const response = await post(costImport.id, unmapped.id, { setup: "both" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.history.pctOfSubtotal).toBeCloseTo(10 / 42.5, 10);
    expect(trade.valueUsdPerGsf).toBe(42.5);
  });

  it("returns 409 for a line already routed", async () => {
    const { costImport, unmapped } = await staged();
    expect((await post(costImport.id, unmapped.id, { setup: "both" })).status).toBe(200);

    const again = await post(costImport.id, unmapped.id, { setup: "gc_only" });
    expect(again.status).toBe(409);
  });

  it("returns 409 for an excluded line and for an approved line", async () => {
    const { costImport, trade, unmapped } = await staged();
    await remapCostImportLine(db as Db, costImport.id, unmapped.id, { exclude: true }, "r@kulka.com");
    expect((await post(costImport.id, unmapped.id, { setup: "both" })).status).toBe(409);

    await approveCostImport(db as Db, costImport.id, "approver@kulka.com");
    expect((await post(costImport.id, trade.id, { setup: "both" })).status).toBe(409);
  });

  it("returns 409 when the project already has a figure for this setup", async () => {
    const first = await staged();
    expect((await post(first.costImport.id, first.unmapped.id, { setup: "both" })).status).toBe(200);

    const second = await staged();
    const response = await post(second.costImport.id, second.unmapped.id, { setup: "both" });
    expect(response.status).toBe(409);
    expect(await historyRows()).toHaveLength(1);
  });

  it("returns 409 when the import has no other trade line to divide by", async () => {
    const { costImport, trade, unmapped } = await staged();
    await remapCostImportLine(db as Db, costImport.id, trade.id, { exclude: true }, "r@kulka.com");

    const response = await post(costImport.id, unmapped.id, { setup: "both" });
    expect(response.status).toBe(409);
    expect(await historyRows()).toEqual([]);
  });

  it("returns 400 for a setup it does not know", async () => {
    const { costImport, unmapped } = await staged();
    expect((await post(costImport.id, unmapped.id, { setup: "everything" })).status).toBe(400);
    expect((await post(costImport.id, unmapped.id, {})).status).toBe(400);
  });

  it("returns 404 for a line in a different import", async () => {
    const first = await staged();
    const second = await staged();
    expect((await post(first.costImport.id, second.unmapped.id, { setup: "both" })).status).toBe(404);
  });
});
