import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { CostFileParseError } from "./cost-file-parse";
import {
  CanonicalWorkItemNotFound,
  CostImportAlreadyApproved,
  CostImportLineNotFound,
  CostImportNotFound,
  approveCostImport,
  getCostImport,
  listUnmappedLines,
  remapCostImportLine,
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
//
// The header is line 1, so its two data rows are lines 2 and 3 --
// row_number is the row's real physical line in the file (fixed in code
// review 2026-09-20; see lib/rom/cost-file-parse.test.ts for the dedicated
// coverage of that fix).
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

function countBenchmarksFor(db: Db, costCode: string) {
  return db
    .query<{ count: string }>(`select count(*)::text as count from benchmarks where cost_code = $1`, [costCode])
    .then((r) => Number(r.rows[0].count));
}

describe("stageCostImport", () => {
  it("matches a confident line and leaves an unrelated one unmapped (AC1, AC4)", async () => {
    const costImport = await stagedImport(db as Db);

    expect(costImport.status).toBe("staged");
    expect(costImport.lines).toHaveLength(2);
    expect(costImport.skippedRows).toEqual([]);

    const [mapped, unmapped] = costImport.lines;
    expect(mapped.rowNumber).toBe(2);
    expect(mapped.status).toBe("staged");
    expect(mapped.candidateCanonicalItem.itemNumber).toBe("2");
    expect(mapped.candidateScore).toBe(1);

    expect(unmapped.rowNumber).toBe(3);
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

  it("stages every valid row and reports a bad row instead of rejecting the whole file over it (fixed in code review, finding #4)", async () => {
    const csv = [
      "description,division,value",
      '"Foundations, footings, and slab-on-grade",03,42.50',
      "Missing a description,03,",
      "VE credit,03,0",
    ].join("\n");

    const staged = await stageCostImport(db as Db, {
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Example export",
      provenanceKind: "actuals",
      uploadedBy: "reviewer@kulka.com",
      fileText: csv,
    });

    expect(staged.lines).toHaveLength(2);
    expect(staged.lines.map((line) => line.rawDescription)).toEqual([
      "Foundations, footings, and slab-on-grade",
      "VE credit",
    ]);
    expect(staged.skippedRows).toEqual([{ rowNumber: 3, reason: '"value" is required.' }]);
  });

  it("lands a confidently-matched line in the unmapped bucket when its rate is a magnitude outlier against the canonical item's existing benchmark data (fixed in code review, finding #2)", async () => {
    // Simulates prior, normal benchmark data already on record for
    // canonical item 2's cost code ("2") -- real numbers in a plausible
    // range, entered directly the way an earlier approved import would
    // have left them.
    await db.query(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind, comparable_count,
          provenance_kind, provenance_recorded_by, provenance_recorded_at)
       values
         ('2', 'Prior comparable A', 'usd_per_gsf', 20, 'multifamily', 'new', 1, 'reviewed_judgment', 'seed', date '2026-08-01'),
         ('2', 'Prior comparable B', 'usd_per_gsf', 24, 'multifamily', 'new', 1, 'reviewed_judgment', 'seed', date '2026-08-02')`,
    );

    // Same ADR-0003 story this ticket's own docs describe: a confident text
    // match ("Foundations, footings, and slab-on-grade" scores 1) with a
    // rate two orders of magnitude off the item's real existing data.
    const outlierCsv = [
      "description,division,value",
      '"Foundations, footings, and slab-on-grade",03,250.00',
    ].join("\n");

    const staged = await stageCostImport(db as Db, {
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Outlier example",
      provenanceKind: "actuals",
      uploadedBy: "reviewer@kulka.com",
      fileText: outlierCsv,
    });

    expect(staged.lines[0].candidateScore).toBe(1);
    expect(staged.lines[0].status).toBe("unmapped");
  });

  it("does not flag a rate close to a canonical item's existing benchmark data", async () => {
    await db.query(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind, comparable_count,
          provenance_kind, provenance_recorded_by, provenance_recorded_at)
       values
         ('2', 'Prior comparable A', 'usd_per_gsf', 20, 'multifamily', 'new', 1, 'reviewed_judgment', 'seed', date '2026-08-01'),
         ('2', 'Prior comparable B', 'usd_per_gsf', 24, 'multifamily', 'new', 1, 'reviewed_judgment', 'seed', date '2026-08-02')`,
    );

    const staged = await stagedImport(db as Db);
    expect(staged.lines[0].status).toBe("staged");
  });
});

describe("getCostImport", () => {
  it("returns the staged import and its lines for review", async () => {
    const staged = await stagedImport(db as Db);
    const { skippedRows, ...expectedSummary } = staged;
    const found = await getCostImport(db as Db, staged.id);

    expect(skippedRows).toEqual([]);
    expect(found).toEqual(expectedSummary);
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

  it("excludes a staged $0 line instead of promoting it, since benchmarks.value must be positive (fixed in code review, finding #4/#1 boundary)", async () => {
    // The description has to match a canonical item confidently (so the
    // line actually stages instead of landing in the unmapped bucket for an
    // unrelated reason) -- "VE credit" itself would score 0 against every
    // canonical item name.
    const csv = ["description,division,value", '"Foundations, footings, and slab-on-grade",03,0'].join("\n");
    const staged = await stageCostImport(db as Db, {
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "VE credit example",
      provenanceKind: "actuals",
      uploadedBy: "reviewer@kulka.com",
      fileText: csv,
    });
    expect(staged.lines[0].status).toBe("staged");
    expect(staged.lines[0].valueUsdPerGsf).toBe(0);

    const summary = await approveCostImport(db as Db, staged.id, "approver@kulka.com");
    expect(summary.approved).toBe(0);
    expect(summary.excluded).toBe(1);

    const updated = await getCostImport(db as Db, staged.id);
    expect(updated.lines[0].status).toBe("excluded");
    expect(updated.lines[0].benchmarkId).toBeNull();
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

  it("lets only one of two concurrent approve calls for the same import succeed, and the other sees it already approved (fixed in code review, finding #1 -- the reproduced double-approval race)", async () => {
    const staged = await stagedImport(db as Db);

    const results = await Promise.allSettled([
      approveCostImport(db as Db, staged.id, "approver-a@kulka.com"),
      approveCostImport(db as Db, staged.id, "approver-b@kulka.com"),
    ]);

    const fulfilled = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(CostImportAlreadyApproved);

    // The race no longer leaves an orphaned benchmark or a doubled total:
    // exactly one row for the one mapped line.
    expect(await countBenchmarksFor(db as Db, "2")).toBe(1);
  });

  it("treats a re-import of the same cost code from the same source project as a duplicate rather than a second benchmark (fixed in code review, finding #1 -- the legitimate-re-import case)", async () => {
    const first = await stagedImport(db as Db);
    await approveCostImport(db as Db, first.id, "approver@kulka.com");
    expect(await countBenchmarksFor(db as Db, "2")).toBe(1);

    // A corrected re-upload of the same cost line, from a second, separate
    // import against the same source project.
    const correctedCsv = [
      "description,division,value",
      '"Foundations, footings, and slab-on-grade",03,45.00',
    ].join("\n");
    const second = await stageCostImport(db as Db, {
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Corrected re-upload",
      provenanceKind: "actuals",
      uploadedBy: "reviewer@kulka.com",
      fileText: correctedCsv,
    });

    const summary = await approveCostImport(db as Db, second.id, "approver@kulka.com");
    expect(summary).toEqual({ approved: 0, excluded: 1, unmapped: 0 });

    // Still exactly one benchmark for cost code "2" -- the ROM engine would
    // otherwise sum both and silently double the total (this is the bug
    // ADR 0003's ingest-side fix, finding #1, exists to prevent; real
    // blending across imports is LA-14's, not this fix's).
    expect(await countBenchmarksFor(db as Db, "2")).toBe(1);

    const reopened = await getCostImport(db as Db, second.id);
    expect(reopened.lines[0].status).toBe("excluded");
    expect(reopened.lines[0].benchmarkId).toBeNull();
  });

  it("sums two lines inside the same import that map to the same cost code into one benchmark (LA-978)", async () => {
    // A real budget carries several lines against one work item -- Drywall
    // and Metal Framing might both map to the same canonical item -- and
    // excluding the second used to silently drop its cost.
    const csv = [
      "description,division,value",
      '"Foundations, footings, and slab-on-grade",03,42.50',
      '"Foundations, footings, and slab-on-grade",03,43.00',
    ].join("\n");
    const staged = await stageCostImport(db as Db, {
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Two lines, one cost code",
      provenanceKind: "actuals",
      uploadedBy: "reviewer@kulka.com",
      fileText: csv,
    });

    const summary = await approveCostImport(db as Db, staged.id, "approver@kulka.com");
    expect(summary).toEqual({ approved: 2, excluded: 0, unmapped: 0 });
    expect(await countBenchmarksFor(db as Db, "2")).toBe(1);

    const { rows } = await db.query<{ value: string; label: string }>(
      `select value, label from benchmarks where cost_code = '2'`,
    );
    expect(rows[0].value).toBe("85.5");
    expect(rows[0].label).toBe(
      "Foundations, footings, and slab-on-grade + Foundations, footings, and slab-on-grade",
    );

    const updated = await getCostImport(db as Db, staged.id);
    expect(updated.lines.every((line) => line.status === "approved")).toBe(true);
    expect(new Set(updated.lines.map((line) => line.benchmarkId))).toEqual(
      new Set([updated.lines[0].benchmarkId]),
    );
  });

  it("still excludes a duplicate of an earlier import's cost code even when this import also has a same-code line to sum", async () => {
    const first = await stagedImport(db as Db);
    await approveCostImport(db as Db, first.id, "approver@kulka.com");

    const csv = [
      "description,division,value",
      '"Foundations, footings, and slab-on-grade",03,10.00',
    ].join("\n");
    const second = await stageCostImport(db as Db, {
      sourceProjectId: TEST_PROJECT_ID,
      exportLabel: "Re-upload, same code",
      provenanceKind: "actuals",
      uploadedBy: "reviewer@kulka.com",
      fileText: csv,
    });

    const summary = await approveCostImport(db as Db, second.id, "approver@kulka.com");
    expect(summary).toEqual({ approved: 0, excluded: 1, unmapped: 0 });
    expect(await countBenchmarksFor(db as Db, "2")).toBe(1);
  });
});

describe("remapCostImportLine", () => {
  it("sets a line's canonical item, stages it, and records who mapped it and when", async () => {
    const staged = await stagedImport(db as Db);
    const unmappedLine = staged.lines[1];

    // "Foundations, footings, and slab-on-grade" is canonical item 2.
    const { rows: itemRows } = await db.query<{ id: string }>(
      `select id from canonical_work_items where item_number = '2'`,
    );

    const updated = await remapCostImportLine(
      db as Db,
      staged.id,
      unmappedLine.id,
      { canonicalItemId: itemRows[0].id },
      "reviewer@kulka.com",
    );

    expect(updated.status).toBe("staged");
    expect(updated.candidateCanonicalItem.itemNumber).toBe("2");

    const { rows } = await db.query<{ mapped_by: string; mapped_at: string | null }>(
      `select mapped_by, mapped_at from cost_import_lines where id = $1`,
      [unmappedLine.id],
    );
    expect(rows[0].mapped_by).toBe("reviewer@kulka.com");
    expect(rows[0].mapped_at).not.toBeNull();
  });

  it("excludes a line without changing its candidate match", async () => {
    const staged = await stagedImport(db as Db);
    const mappedLine = staged.lines[0];

    const updated = await remapCostImportLine(
      db as Db,
      staged.id,
      mappedLine.id,
      { exclude: true },
      "reviewer@kulka.com",
    );

    expect(updated.status).toBe("excluded");
    expect(updated.candidateCanonicalItem.id).toBe(mappedLine.candidateCanonicalItem.id);
  });

  it("refuses to remap a line once the import is approved", async () => {
    const staged = await stagedImport(db as Db);
    const mappedLine = staged.lines[0];
    await approveCostImport(db as Db, staged.id, "approver@kulka.com");

    await expect(
      remapCostImportLine(
        db as Db,
        staged.id,
        mappedLine.id,
        { exclude: true },
        "reviewer@kulka.com",
      ),
    ).rejects.toThrow(CostImportAlreadyApproved);
  });

  it("refuses a line that belongs to a different import", async () => {
    const first = await stagedImport(db as Db);
    const second = await stagedImport(db as Db);

    await expect(
      remapCostImportLine(
        db as Db,
        first.id,
        second.lines[0].id,
        { exclude: true },
        "reviewer@kulka.com",
      ),
    ).rejects.toThrow(CostImportLineNotFound);
  });

  it("refuses an import that does not exist", async () => {
    const staged = await stagedImport(db as Db);
    await expect(
      remapCostImportLine(
        db as Db,
        "00000000-0000-4000-8000-0000000000ff",
        staged.lines[0].id,
        { exclude: true },
        "reviewer@kulka.com",
      ),
    ).rejects.toThrow(CostImportNotFound);
  });

  it("refuses a canonical item that does not exist", async () => {
    const staged = await stagedImport(db as Db);

    await expect(
      remapCostImportLine(
        db as Db,
        staged.id,
        staged.lines[0].id,
        { canonicalItemId: "00000000-0000-4000-8000-0000000000ff" },
        "reviewer@kulka.com",
      ),
    ).rejects.toThrow(CanonicalWorkItemNotFound);
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
