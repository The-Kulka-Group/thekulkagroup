import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { CostFileParseError } from "./cost-file-parse";
import {
  CostImportAlreadyApproved,
  CostImportNotFound,
  approveCostImport,
  getCostImport,
  listUnmappedLines,
  stageCostImport,
} from "./ingest";
import { ProjectNotFound, runRom } from "./run";

// LA-15's ingestion gate: stage, approve, queryable. Tested against a real
// Postgres built from this repo's migrations, same pattern as
// lib/rom/issue.test.ts.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

// "Foundations, footings, and slab-on-grade" is canonical item 2's name
// verbatim (20260920140000_rom_spec_decisions_catchup.sql), so the token
// overlap heuristic scores it 1 -- deterministically above MATCH_THRESHOLD.
// "Totally unrelated widget nonsense" shares no tokens with any of the 54
// canonical items, so it deterministically scores 0.
const CSV_TEXT = [
  "description,division,value",
  '"Foundations, footings, and slab-on-grade",03,42.50',
  "Totally unrelated widget nonsense,99,10.00",
].join("\n");

async function stagedImport(db: Db) {
  return stageCostImport(db, {
    sourceProjectId: TEST_PROJECT_ID,
    exportLabel: "Autodesk Cost export (example)",
    provenanceKind: "actuals",
    uploadedBy: "reviewer@kulka.com",
    fileText: CSV_TEXT,
  });
}

function benchmarks(db: Db) {
  return db.query<{ cost_code: string }>(`select cost_code from benchmarks`).then((r) => r.rows);
}

describe("stageCostImport", () => {
  it("matches a confident line and leaves an unrelated one unmapped (AC1, AC4)", async () => {
    const costImport = await stagedImport(db as Db);

    expect(costImport.status).toBe("staged");
    expect(costImport.lines).toHaveLength(2);

    const [mapped, unmapped] = costImport.lines;
    expect(mapped.status).toBe("staged");
    expect(mapped.candidateCanonicalItem.itemNumber).toBe("2");
    expect(mapped.candidateScore).toBe(1);

    expect(unmapped.status).toBe("unmapped");
    expect(unmapped.candidateScore).toBe(0);
  });

  it("writes no benchmark rows at staging time (AC5: invisible to the engine until approved)", async () => {
    await stagedImport(db as Db);
    // Only the seeded synthetic benchmark from test/database.ts exists.
    expect(await benchmarks(db as Db)).toEqual([{ cost_code: "TEST" }]);
  });

  it("rejects a source project that does not exist", async () => {
    await expect(
      stageCostImport(db as Db, {
        sourceProjectId: "00000000-0000-4000-8000-0000000000ff",
        exportLabel: "Example export",
        provenanceKind: "actuals",
        uploadedBy: "reviewer@kulka.com",
        fileText: CSV_TEXT,
      }),
    ).rejects.toThrow(ProjectNotFound);
  });

  it("rejects a malformed file without staging anything", async () => {
    await expect(
      stageCostImport(db as Db, {
        sourceProjectId: TEST_PROJECT_ID,
        exportLabel: "Example export",
        provenanceKind: "actuals",
        uploadedBy: "reviewer@kulka.com",
        fileText: "not,a,valid,header\n1,2,3,4",
      }),
    ).rejects.toThrow(CostFileParseError);

    const { rows } = await db.query(`select 1 from cost_imports`);
    expect(rows).toEqual([]);
  });
});

describe("getCostImport", () => {
  it("returns the staged import and its lines for review", async () => {
    const staged = await stagedImport(db as Db);
    const found = await getCostImport(db as Db, staged.id);
    expect(found).toEqual(staged);
  });

  it("refuses an import that does not exist", async () => {
    await expect(getCostImport(db as Db, "00000000-0000-4000-8000-0000000000ff")).rejects.toThrow(
      CostImportNotFound,
    );
  });
});

describe("approveCostImport", () => {
  it("promotes a mapped line into a queryable benchmark carrying full provenance (AC2)", async () => {
    const staged = await stagedImport(db as Db);
    const mappedLineId = staged.lines[0].id;

    const summary = await approveCostImport(db as Db, staged.id, "approver@kulka.com");
    expect(summary).toEqual({ approved: 1, excluded: 0, unmapped: 1 });

    const { rows } = await db.query<{
      id: string;
      cost_code: string;
      label: string;
      unit: string;
      value: string;
      project_type: string;
      construction_kind: string;
      comparable_count: number;
      provenance_kind: string;
      provenance_export_label: string | null;
      provenance_recorded_by: string;
      scope_side: string;
      contract_side: string;
    }>(`select * from benchmarks where cost_code = '2'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      cost_code: "2",
      label: "Foundations, footings, and slab-on-grade",
      unit: "usd_per_gsf",
      value: "42.5",
      project_type: "multifamily",
      construction_kind: "new",
      comparable_count: 1,
      provenance_kind: "actuals",
      provenance_export_label: "Autodesk Cost export (example)",
      provenance_recorded_by: "reviewer@kulka.com",
      scope_side: "building",
      contract_side: "kulka",
    });

    const { rows: benchmarkIdRows } = await db.query<{ id: string }>(
      `select id from benchmarks where cost_code = '2'`,
    );
    const { rows: sourceRows } = await db.query<{ project_id: string }>(
      `select project_id from benchmark_source_projects where benchmark_id = $1`,
      [benchmarkIdRows[0].id],
    );
    expect(sourceRows[0].project_id).toBe(TEST_PROJECT_ID);

    const updated = await getCostImport(db as Db, staged.id);
    const mappedLine = updated.lines.find((line) => line.id === mappedLineId)!;
    expect(mappedLine.status).toBe("approved");
    expect(mappedLine.benchmarkId).toBe(rows[0].id);
  });

  it("leaves the unmapped line unmapped and out of benchmarks after approval (AC4)", async () => {
    const staged = await stagedImport(db as Db);
    await approveCostImport(db as Db, staged.id, "approver@kulka.com");

    const updated = await getCostImport(db as Db, staged.id);
    const unmappedLine = updated.lines.find((line) => line.status === "unmapped")!;
    expect(unmappedLine.benchmarkId).toBeNull();
    expect(await benchmarks(db as Db)).not.toContainEqual(
      expect.objectContaining({ cost_code: unmappedLine.candidateCanonicalItem.itemNumber }),
    );
  });

  it("makes the approved row selectable by the engine's own run (AC5: nothing reaches the engine without passing the gate)", async () => {
    const staged = await stagedImport(db as Db);
    await approveCostImport(db as Db, staged.id, "approver@kulka.com");

    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    const costCodes = rom.lines.map((line) => line.costCode);
    expect(costCodes).toContain("2");
    // The unmapped row's candidate item never became a benchmark, so it is
    // not in the run's line list either.
    expect(costCodes).not.toContain(staged.lines[1].candidateCanonicalItem.itemNumber);
  });

  it("excludes a line whose role ADR 0003 never lets feed a benchmark, even when it matched confidently", async () => {
    const staged = await stagedImport(db as Db);
    const mappedLineId = staged.lines[0].id;
    // No API sets line_role yet (disclosed in the migration and the PR
    // description); this simulates a future reviewer override directly.
    await db.query(`update cost_import_lines set line_role = 'takeoff_helper' where id = $1`, [
      mappedLineId,
    ]);

    const summary = await approveCostImport(db as Db, staged.id, "approver@kulka.com");
    expect(summary).toEqual({ approved: 0, excluded: 1, unmapped: 1 });

    const updated = await getCostImport(db as Db, staged.id);
    const excludedLine = updated.lines.find((line) => line.id === mappedLineId)!;
    expect(excludedLine.status).toBe("excluded");
    expect(excludedLine.benchmarkId).toBeNull();
    expect(await benchmarks(db as Db)).toEqual([{ cost_code: "TEST" }]);
  });

  it("refuses to approve an import twice", async () => {
    const staged = await stagedImport(db as Db);
    await approveCostImport(db as Db, staged.id, "approver@kulka.com");

    await expect(approveCostImport(db as Db, staged.id, "approver@kulka.com")).rejects.toThrow(
      CostImportAlreadyApproved,
    );
  });

  it("refuses an import that does not exist", async () => {
    await expect(
      approveCostImport(db as Db, "00000000-0000-4000-8000-0000000000ff", "approver@kulka.com"),
    ).rejects.toThrow(CostImportNotFound);
  });
});

describe("listUnmappedLines", () => {
  it("lists an unmapped line across imports, with its import's context, before approval", async () => {
    const staged = await stagedImport(db as Db);

    const unmapped = await listUnmappedLines(db as Db);
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0]).toMatchObject({
      costImportId: staged.id,
      exportLabel: "Autodesk Cost export (example)",
      sourceProjectId: TEST_PROJECT_ID,
      rawDescription: "Totally unrelated widget nonsense",
    });
  });

  it("keeps listing an unmapped line after its import is approved", async () => {
    const staged = await stagedImport(db as Db);
    await approveCostImport(db as Db, staged.id, "approver@kulka.com");

    expect(await listUnmappedLines(db as Db)).toHaveLength(1);
  });
});
