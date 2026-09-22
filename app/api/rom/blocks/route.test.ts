import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardLevel, RunBoard } from "@/lib/rom/board";
import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-884's API seam: the block board payload for a finished run, read against a
// real Postgres built from this repo's migrations. Every figure below is
// synthetic and stays inside the test process.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("../route");
const { GET } = await import("./route");

async function runRom(): Promise<string> {
  const response = await POST(
    new Request("http://localhost/api/rom", {
      method: "POST",
      body: JSON.stringify({ projectId: TEST_PROJECT_ID }),
    }),
  );
  const { runId } = await response.json();
  return runId;
}

function get(runId: string, headers: HeadersInit = {}) {
  return GET(new Request(`http://localhost/api/rom/blocks?runId=${runId}`, { headers }));
}

/** A second benchmark plus the classification that files both blocks. */
async function classifyTwoBlocks() {
  await db.query(
    `insert into benchmarks
       (cost_code, label, unit, value, project_type, construction_kind,
        comparable_count, provenance_kind, provenance_export_label,
        provenance_recorded_by, provenance_recorded_at)
     values
       ('26-200', 'Synthetic test wiring line', 'usd_per_gsf', 1,
        'multifamily', 'new', 1, 'actuals', 'synthetic export',
        'automated test', date '2026-09-22')`,
  );
  await db.query(
    `insert into block_classification
       (cost_code, detail_level, element, breakout_of_cost_code, buyout_package,
        stated_by, stated_on, reason)
     values
       ('TEST', 1, null, null, 'Electrical',
        'automated test', date '2026-09-22', 'synthetic'),
       ('26-200', 2, 'Elevator', 'TEST', 'Electrical',
        'automated test', date '2026-09-22', 'synthetic')`,
  );
}

function levelOf(board: RunBoard, level: number | null): BoardLevel {
  return board.levels.find((one) => one.level === level)!;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("GET /api/rom/blocks", () => {
  it("rejects a signed-out request", async () => {
    const response = await get(await runRom(), { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
  });

  it("gives back a run that does not exist as not found", async () => {
    const response = await get("00000000-0000-4000-8000-0000000000ff");
    expect(response.status).toBe(404);
  });

  it("gives back a cost code in place of a run id as not found", async () => {
    const response = await get("TEST");
    expect(response.status).toBe(404);
  });

  it("files an unclassified block under no level and says so", async () => {
    const response = await get(await runRom());
    expect(response.status).toBe(200);

    const { board } = await response.json();
    expect(levelOf(board, null).blocks).toHaveLength(1);
    expect(levelOf(board, null).blocks[0].costCode).toBe("TEST");
    expect(levelOf(board, null).blocks[0].level).toBeNull();
    expect(levelOf(board, 1).blocks).toHaveLength(0);
    expect(board.elements).toEqual([]);
  });

  it("puts every block in the row of the level it was stated at", async () => {
    await classifyTwoBlocks();
    const { board } = await (await get(await runRom())).json();

    expect(levelOf(board, 1).blocks.map((b) => b.costCode)).toEqual(["TEST"]);
    expect(levelOf(board, 2).blocks.map((b) => b.costCode)).toEqual(["26-200"]);
    expect(levelOf(board, null).blocks).toHaveLength(0);
  });

  it("carries the division, the buyout package and the element on every block", async () => {
    await classifyTwoBlocks();
    const { board } = await (await get(await runRom())).json();

    const [wiring] = levelOf(board, 2).blocks;
    expect(wiring.division).toBe("26");
    expect(wiring.buyoutPackage).toBe("Electrical");
    expect(wiring.element).toBe("Elevator");

    // 'TEST' names no division, so the payload says so rather than inventing one.
    expect(levelOf(board, 1).blocks[0].division).toBeNull();
  });

  it("separates what a level adds from what it carves out", async () => {
    await classifyTwoBlocks();
    const { board } = await (await get(await runRom())).json();

    const carved = levelOf(board, 2).blocks[0];
    expect(carved.breakoutOf).toBe("TEST");
    expect(carved.addsToTotal).toBe(false);
    expect(levelOf(board, 2).adds).toEqual({ low: 0, high: 0 });
    expect(levelOf(board, 2).carvedOut).toEqual({ low: carved.low, high: carved.high });

    const parent = levelOf(board, 1).blocks[0];
    expect(levelOf(board, 1).adds).toEqual({ low: parent.low, high: parent.high });
    expect(board.total).toEqual({ low: parent.low, high: parent.high });
    expect(board.carvedOut).toEqual({ low: carved.low, high: carved.high });
  });

  it("rolls up an element across the divisions one fact pays for", async () => {
    await classifyTwoBlocks();
    const { board } = await (await get(await runRom())).json();

    expect(board.elements).toHaveLength(1);
    const [element] = board.elements;
    expect(element.element).toBe("Elevator");
    expect(element.blockCount).toBe(1);
    expect(element.divisions).toEqual(["26"]);
    expect(element.levels).toEqual([2]);
    expect(element.adds).toEqual({ low: 0, high: 0 });
    expect(element.carvedOut.high).toBeGreaterThan(0);
  });

  it("names the project and the area the run was computed on", async () => {
    const { board } = await (await get(await runRom())).json();

    expect(board.projectName).toBe("Synthetic test project");
    expect(board.grossSquareFeet).toBe(1000);
  });
});
