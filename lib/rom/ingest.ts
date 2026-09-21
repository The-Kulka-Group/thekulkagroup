import type { Db } from "@/lib/db";

import {
  bestCanonicalMatch,
  isRateOutlier,
  MATCH_THRESHOLD,
  tokenizeCanonicalItems,
  type BenchmarkRateStats,
  type CanonicalItemCandidate,
  type TokenizedCanonicalItem,
} from "./canonical-item-match";
import { CostFileParseError, parseCostFile, type SkippedCostFileRow } from "./cost-file-parse";
import { toDateOnly, toIso } from "./date";
import { ProjectNotFound } from "./run";

// The ingestion gate (LA-15): a signed-in user stages a cost file, its lines
// sit in `cost_import_lines` for review, and only approving the whole import
// promotes eligible, confidently-mapped lines into real `benchmarks` rows.
// This is the same shape as lib/rom/run.ts and lib/rom/issue.ts: the pure
// matching heuristic lives in canonical-item-match.ts, the pure file parsing
// in cost-file-parse.ts, and this file owns every database side effect.
//
// Re-exported so a caller only needs one import for the errors this module
// and its collaborators can throw.
export { ProjectNotFound, CostFileParseError };

export class CostImportNotFound extends Error {
  constructor(readonly costImportId: string) {
    super(`No cost import ${costImportId}.`);
    this.name = "CostImportNotFound";
  }
}

export class CostImportAlreadyApproved extends Error {
  constructor(readonly costImportId: string) {
    super(`Cost import ${costImportId} is already approved.`);
    this.name = "CostImportAlreadyApproved";
  }
}

export type LineRole = "scope" | "lump" | "allowance" | "takeoff_helper" | "duplicate";
export type ProvenanceKind = "actuals" | "proest_budget" | "reviewed_judgment";
/**
 * What a cost *file* may claim (LA-19). An imported file is an export, and
 * `reviewed_judgment` names a number with no export behind it, so an import
 * can never claim it. A judgment rule is entered through its own gate instead:
 * see lib/rom/judgment.ts.
 */
export type CostImportProvenanceKind = Exclude<ProvenanceKind, "reviewed_judgment">;
export type LineStatus = "staged" | "unmapped" | "approved" | "excluded";

/** ADR 0003: "Only scope, lump and allowance lines may feed a benchmark, and a takeoff helper never can." Duplicate lines are excluded the same way. */
const BENCHMARK_ELIGIBLE_ROLES: readonly LineRole[] = ["scope", "lump", "allowance"];

export type StagedLine = {
  id: string;
  rowNumber: number;
  rawDescription: string;
  rawDivision: string | null;
  valueUsdPerGsf: number;
  lineRole: LineRole;
  candidateCanonicalItem: { id: string; itemNumber: string; name: string };
  candidateScore: number;
  status: LineStatus;
  benchmarkId: string | null;
};

export type CostImportSummary = {
  id: string;
  sourceProjectId: string;
  exportLabel: string;
  provenanceKind: CostImportProvenanceKind;
  uploadedBy: string;
  uploadedAt: string;
  status: "staged" | "approved";
  approvedBy: string | null;
  approvedAt: string | null;
};

export type CostImportDetail = CostImportSummary & { lines: StagedLine[] };

/** stageCostImport's own return shape: the staged import plus every row the parser could not use, so a caller can report both instead of the whole file failing over one bad line (fixed in code review 2026-09-20). Not part of CostImportDetail/getCostImport's shape, since skipped rows are never written anywhere and so cannot be re-fetched later. */
export type StageCostImportResult = CostImportDetail & { skippedRows: SkippedCostFileRow[] };

export type ApproveSummary = { approved: number; excluded: number; unmapped: number };

export type UnmappedLine = {
  id: string;
  costImportId: string;
  exportLabel: string;
  sourceProjectId: string;
  rowNumber: number;
  rawDescription: string;
  rawDivision: string | null;
  valueUsdPerGsf: number;
  candidateCanonicalItem: { id: string; itemNumber: string; name: string };
  candidateScore: number;
};

type CostImportRow = {
  id: string;
  source_project_id: string;
  export_label: string;
  provenance_kind: CostImportProvenanceKind;
  uploaded_by: string;
  uploaded_at: Date | string;
  status: "staged" | "approved";
  approved_by: string | null;
  approved_at: Date | string | null;
};

function toSummary(row: CostImportRow): CostImportSummary {
  return {
    id: row.id,
    sourceProjectId: row.source_project_id,
    exportLabel: row.export_label,
    provenanceKind: row.provenance_kind,
    uploadedBy: row.uploaded_by,
    uploadedAt: toIso(row.uploaded_at),
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? toIso(row.approved_at) : null,
  };
}

async function readCostImport(db: Db, costImportId: string): Promise<CostImportRow> {
  const { rows } = await db.query<CostImportRow>(
    `select id, source_project_id, export_label, provenance_kind, uploaded_by, uploaded_at,
            status, approved_by, approved_at
       from cost_imports where id = $1`,
    [costImportId],
  );
  const found = rows[0];
  if (!found) throw new CostImportNotFound(costImportId);
  return found;
}

async function readCanonicalItems(db: Db): Promise<CanonicalItemCandidate[]> {
  const { rows } = await db.query<CanonicalItemCandidate>(
    `select id, item_number as "itemNumber", name, masterformat_division as "masterformatDivision"
       from canonical_work_items
      order by sort_order`,
  );
  return rows;
}

/**
 * The median existing rate for every canonical item that already has at
 * least one benchmark, keyed by cost code (== the canonical item's own
 * item number, same join key `approveCostImport` already uses). Read once
 * before the per-row loop below, not per row -- see canonical-item-match.ts's
 * `isRateOutlier` for what this feeds and why the check is median-based.
 */
async function readBenchmarkRateStatsByCostCode(db: Db): Promise<Map<string, BenchmarkRateStats>> {
  const { rows } = await db.query<{ cost_code: string; median: string; count: string }>(
    `select cost_code,
            percentile_cont(0.5) within group (order by value)::text as median,
            count(*)::text as count
       from benchmarks
      group by cost_code`,
  );
  return new Map(rows.map((row) => [row.cost_code, { median: Number(row.median), count: Number(row.count) }]));
}

/**
 * Stages an uploaded cost file (LA-15 AC1): every usable row is matched
 * against the canonical work items and inserted into `cost_import_lines` in
 * one batched round trip, visible for review. Nothing here touches
 * `benchmarks` -- that only happens once the whole import is approved (AC2,
 * AC5).
 *
 * A row the parser could not use (a blank description, a missing or
 * negative value) does not abort the file -- `parseCostFile` collects it
 * into `skipped` instead of throwing, and every other valid row still
 * stages (fixed in code review 2026-09-20; see cost-file-parse.ts).
 */
export async function stageCostImport(
  db: Db,
  params: {
    sourceProjectId: string;
    exportLabel: string;
    provenanceKind: CostImportProvenanceKind;
    uploadedBy: string;
    fileText: string;
  },
): Promise<StageCostImportResult> {
  const { rows: projectRows } = await db.query<{ id: string }>(
    `select id from projects where id = $1`,
    [params.sourceProjectId],
  );
  if (!projectRows[0]) throw new ProjectNotFound(params.sourceProjectId);

  // Parse before writing anything, so a malformed file leaves no half-staged
  // import behind. (A malformed *file* -- missing columns, no rows at all --
  // still throws here; only row-level problems are collected into `skipped`.)
  const { rows: parsedRows, skipped } = parseCostFile(params.fileText);

  // Both read once, up front, and reused for every row instead of once per
  // row -- see tokenizeCanonicalItems's and readBenchmarkRateStatsByCostCode's
  // own doc comments for why (fixed in code review 2026-09-20).
  const canonicalItems = await readCanonicalItems(db);
  const tokenizedCanonicalItems: TokenizedCanonicalItem[] = tokenizeCanonicalItems(canonicalItems);
  const benchmarkStats = await readBenchmarkRateStatsByCostCode(db);

  const { rows: importRows } = await db.query<{ id: string; uploaded_at: Date | string }>(
    `insert into cost_imports (source_project_id, export_label, provenance_kind, uploaded_by)
     values ($1, $2, $3, $4)
     returning id, uploaded_at`,
    [params.sourceProjectId, params.exportLabel, params.provenanceKind, params.uploadedBy],
  );
  const costImportId = importRows[0].id;
  const uploadedAt = importRows[0].uploaded_at;

  type Matched = {
    rowNumber: number;
    description: string;
    division: string | null;
    value: number;
    item: CanonicalItemCandidate;
    score: number;
    status: LineStatus;
  };

  const matched: Matched[] = parsedRows.map((parsed) => {
    // canonicalItems always has the 54 frozen rows (LA-816's seed data), so
    // a match is never null in practice.
    const match = bestCanonicalMatch(parsed.description, parsed.division, tokenizedCanonicalItems)!;
    const stats = benchmarkStats.get(match.item.itemNumber);
    // Fixed in code review (2026-09-20): a confident text match with a
    // wildly-off rate is exactly the failure ADR 0003 exists to prevent,
    // just triggered by a bad number instead of a bad line role -- see
    // canonical-item-match.ts's isRateOutlier. An outlier lands in the same
    // unmapped/review bucket a low-confidence match does, rather than being
    // silently promotable at approval.
    const outlier = isRateOutlier(parsed.value, stats);
    const status: LineStatus = match.score >= MATCH_THRESHOLD && !outlier ? "staged" : "unmapped";
    return { ...parsed, item: match.item, score: match.score, status };
  });

  let idByRowNumber = new Map<number, string>();
  if (matched.length > 0) {
    // Fixed in code review (2026-09-20): one batched multi-row INSERT
    // instead of one awaited INSERT per row. `row_number` is unique per
    // import (cost_import_lines' own unique constraint, and guaranteed by
    // the parser -- every row starts on a distinct physical line), so it is
    // returned alongside `id` and used to correlate each inserted row back
    // to the `Matched` it came from, rather than relying on RETURNING
    // preserving VALUES-list order.
    const values: string[] = [];
    const insertParams: unknown[] = [];
    matched.forEach((row, i) => {
      const base = i * 8;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`,
      );
      insertParams.push(
        costImportId,
        row.rowNumber,
        row.description,
        row.division,
        row.value,
        row.item.id,
        row.score,
        row.status,
      );
    });

    const { rows: insertedRows } = await db.query<{ id: string; row_number: number }>(
      `insert into cost_import_lines
         (cost_import_id, row_number, raw_description, raw_division, value_usd_per_gsf,
          candidate_canonical_item_id, candidate_score, status)
       values ${values.join(", ")}
       returning id, row_number`,
      insertParams,
    );
    idByRowNumber = new Map(insertedRows.map((row) => [row.row_number, row.id]));
  }

  const lines: StagedLine[] = matched.map((row) => ({
    id: idByRowNumber.get(row.rowNumber)!,
    rowNumber: row.rowNumber,
    rawDescription: row.description,
    rawDivision: row.division,
    valueUsdPerGsf: row.value,
    lineRole: "scope",
    candidateCanonicalItem: { id: row.item.id, itemNumber: row.item.itemNumber, name: row.item.name },
    candidateScore: row.score,
    status: row.status,
    benchmarkId: null,
  }));

  return {
    id: costImportId,
    sourceProjectId: params.sourceProjectId,
    exportLabel: params.exportLabel,
    provenanceKind: params.provenanceKind,
    uploadedBy: params.uploadedBy,
    uploadedAt: toIso(uploadedAt),
    status: "staged",
    approvedBy: null,
    approvedAt: null,
    lines,
    skippedRows: skipped,
  };
}

type LineRow = {
  id: string;
  row_number: number;
  raw_description: string;
  raw_division: string | null;
  value_usd_per_gsf: string;
  line_role: LineRole;
  status: LineStatus;
  benchmark_id: string | null;
  candidate_score: string;
  candidate_id: string;
  candidate_item_number: string;
  candidate_name: string;
};

function toStagedLine(row: LineRow): StagedLine {
  return {
    id: row.id,
    rowNumber: row.row_number,
    rawDescription: row.raw_description,
    rawDivision: row.raw_division,
    valueUsdPerGsf: Number(row.value_usd_per_gsf),
    lineRole: row.line_role,
    candidateCanonicalItem: {
      id: row.candidate_id,
      itemNumber: row.candidate_item_number,
      name: row.candidate_name,
    },
    candidateScore: Number(row.candidate_score),
    status: row.status,
    benchmarkId: row.benchmark_id,
  };
}

/** The staged import and its lines, for review before approval. */
export async function getCostImport(db: Db, costImportId: string): Promise<CostImportDetail> {
  const importRow = await readCostImport(db, costImportId);

  const { rows: lineRows } = await db.query<LineRow>(
    `select l.id, l.row_number, l.raw_description, l.raw_division, l.value_usd_per_gsf,
            l.line_role, l.status, l.benchmark_id, l.candidate_score,
            c.id as candidate_id, c.item_number as candidate_item_number, c.name as candidate_name
       from cost_import_lines l
       join canonical_work_items c on c.id = l.candidate_canonical_item_id
      where l.cost_import_id = $1
      order by l.row_number`,
    [costImportId],
  );

  return { ...toSummary(importRow), lines: lineRows.map(toStagedLine) };
}

type EligibleLineRow = {
  id: string;
  raw_description: string;
  value_usd_per_gsf: string;
  line_role: LineRole;
  candidate_item_number: string;
  candidate_scope_side: "building" | "site";
  candidate_contract_side: "kulka" | "owner";
};

/**
 * Approves a staged import (LA-15 AC2, AC3, AC5): every line still in
 * 'staged' status (matched with confidence, not yet resolved) either
 * promotes into a real `benchmarks` row -- carrying the import's own
 * provenance -- or, if it cannot or should not feed a benchmark, moves to
 * 'excluded' without ever touching `benchmarks`. Lines already 'unmapped'
 * are left alone; this ticket does not build a remap-and-approve flow for a
 * single unmapped line (see the PR description).
 *
 * Fixed in code review (2026-09-20), replacing the un-transactioned version
 * this file originally shipped with. Two bugs, both from the same root
 * cause (no transaction, no conflict handling), were reproduced:
 *
 * 1. Concurrent approval race: two simultaneous `/approve` calls for the
 *    same import both passed a separate "is this already approved" check
 *    before either wrote, both processed the same staged lines, and the
 *    second write silently overwrote the first's `cost_import_lines.
 *    benchmark_id`, orphaning the first INSERT into `benchmarks` (a real
 *    row nothing pointed to any more).
 * 2. Legitimate re-import: staging and approving the same cost line from
 *    two separate imports (a corrected re-upload, say) produced two
 *    separate `benchmarks` rows for the same cost code, and the ROM engine
 *    (lib/rom/run.ts) sums every benchmark row it selects, silently
 *    doubling the total.
 *
 * Fix for (1): the whole function runs inside one database transaction
 * (`db.withTransaction`), and the very first write is an atomic
 * status-transition guard -- `update cost_imports set status = 'approved'
 * ... where status = 'staged'` -- checked by whether it returned a row,
 * before any line is read or any benchmark is written. Only one concurrent
 * caller's UPDATE can affect a row; the other affects zero rows and this
 * function throws (CostImportNotFound or CostImportAlreadyApproved,
 * whichever is true) instead of ever reading a staged line.
 *
 * Fix for (2), a judgment call (the brief names this one of the two real
 * open design questions in this fix pass): a line whose matched canonical
 * item already has a benchmark sourced from this same project -- same
 * `source_project_id`, same `cost_code` (== the canonical item's item
 * number) -- is treated as a re-statement of a fact already on record, not
 * a second data point. Real blending of duplicate benchmarks is LA-14's,
 * not this fix's (this migration's own comments already defer it); until
 * LA-14 exists, the safest move is to skip creating the duplicate row
 * rather than overwrite the existing one (silent data loss) or guess at how
 * to merge two numbers. The line is marked 'excluded' -- this schema's own
 * status already means "mapped confidently, but not promoted to a
 * benchmark, on purpose" (see the migration's comment on 'excluded'), which
 * fits a duplicate exactly, so this reuses that status rather than adding a
 * new one. A second line inside the *same* import that maps to a cost code
 * a line earlier in the same import already promoted is caught the same
 * way (both accumulate into the same "already have this cost code" set as
 * the loop runs), not just the cross-import case the brief calls out by
 * name.
 *
 * A third case excluded here that is not one of the two bugs above: a line
 * whose value is exactly $0 (a legitimate staged row -- see
 * cost-file-parse.ts and this migration's comment on `value_usd_per_gsf`)
 * can never become a `benchmarks` row, because `benchmarks.value` has its
 * own `check (value > 0)` from an already-applied migration this fix must
 * not touch. A $0 line is real data worth staging and seeing, but it is not
 * a rate this system can promote, so it is excluded here rather than
 * failing the whole approval on a database constraint violation.
 */
export async function approveCostImport(
  db: Db,
  costImportId: string,
  approvedBy: string,
): Promise<ApproveSummary> {
  return db.withTransaction(async (tx) => {
    const { rows: transitioned } = await tx.query<CostImportRow>(
      `update cost_imports
          set status = 'approved', approved_by = $2, approved_at = now()
        where id = $1 and status = 'staged'
        returning id, source_project_id, export_label, provenance_kind, uploaded_by, uploaded_at,
                  status, approved_by, approved_at`,
      [costImportId, approvedBy],
    );

    const importRow = transitioned[0];
    if (!importRow) {
      // The UPDATE's WHERE clause can't tell us *why* it matched no row --
      // ask directly so the right typed error reaches the caller.
      const { rows: existing } = await tx.query<{ id: string }>(
        `select id from cost_imports where id = $1`,
        [costImportId],
      );
      if (!existing[0]) throw new CostImportNotFound(costImportId);
      throw new CostImportAlreadyApproved(costImportId);
    }

    const { rows: projectRows } = await tx.query<{ project_type: string; construction_kind: string }>(
      `select project_type, construction_kind from projects where id = $1`,
      [importRow.source_project_id],
    );
    // The source project was already confirmed to exist at staging time, and
    // `cost_imports.source_project_id` references it `on delete restrict`, so
    // it cannot have disappeared since.
    const project = projectRows[0];

    const { rows: lineRows } = await tx.query<EligibleLineRow>(
      `select l.id, l.raw_description, l.value_usd_per_gsf, l.line_role,
              c.item_number as candidate_item_number,
              c.scope_side as candidate_scope_side, c.contract_side as candidate_contract_side
         from cost_import_lines l
         join canonical_work_items c on c.id = l.candidate_canonical_item_id
        where l.cost_import_id = $1 and l.status = 'staged'
        order by l.row_number`,
      [costImportId],
    );

    const recordedAt = toDateOnly(importRow.uploaded_at);

    const { rows: existingBenchmarkRows } = await tx.query<{ cost_code: string }>(
      `select distinct b.cost_code
         from benchmarks b
         join benchmark_source_projects bsp on bsp.benchmark_id = b.id
        where bsp.project_id = $1`,
      [importRow.source_project_id],
    );
    // Seeded with every cost code this project already has a benchmark for,
    // then grown as this loop promotes lines -- see the "Fix for (2)"
    // section of this function's own doc comment.
    const costCodesAlreadyBenchmarked = new Set(existingBenchmarkRows.map((row) => row.cost_code));

    const toPromote: EligibleLineRow[] = [];
    const excludedIds: string[] = [];

    for (const line of lineRows) {
      if (!BENCHMARK_ELIGIBLE_ROLES.includes(line.line_role)) {
        excludedIds.push(line.id);
        continue;
      }
      if (Number(line.value_usd_per_gsf) <= 0) {
        excludedIds.push(line.id);
        continue;
      }
      if (costCodesAlreadyBenchmarked.has(line.candidate_item_number)) {
        excludedIds.push(line.id);
        continue;
      }
      costCodesAlreadyBenchmarked.add(line.candidate_item_number);
      toPromote.push(line);
    }

    let approved = 0;
    if (toPromote.length > 0) {
      // Fixed in code review (2026-09-20): one batched multi-row INSERT for
      // every promoted line's benchmark, instead of one INSERT per line.
      const values: string[] = [];
      const insertParams: unknown[] = [];
      toPromote.forEach((line, i) => {
        const base = i * 11;
        values.push(
          `($${base + 1}, $${base + 2}, 'usd_per_gsf', $${base + 3}, $${base + 4}, $${base + 5}, 1, ` +
            `$${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`,
        );
        insertParams.push(
          line.candidate_item_number,
          line.raw_description,
          line.value_usd_per_gsf,
          project.project_type,
          project.construction_kind,
          importRow.provenance_kind,
          importRow.export_label,
          importRow.uploaded_by,
          recordedAt,
          line.candidate_scope_side,
          line.candidate_contract_side,
        );
      });

      const { rows: benchmarkRows } = await tx.query<{ id: string }>(
        `insert into benchmarks
           (cost_code, label, unit, value, project_type, construction_kind, comparable_count,
            provenance_kind, provenance_export_label, provenance_recorded_by, provenance_recorded_at,
            scope_side, contract_side)
         values ${values.join(", ")}
         returning id`,
        insertParams,
      );

      // Fixed in code review (2026-09-20): the source-project link and each
      // line's own status update are independent once the new benchmark
      // row's id is known, so they run concurrently instead of one after
      // another. `benchmarkRows` preserves VALUES-list order for a single
      // multi-row INSERT ... RETURNING, so `benchmarkRows[i]` is `toPromote[i]`'s
      // own new row.
      await Promise.all([
        tx.query(
          `insert into benchmark_source_projects (benchmark_id, project_id)
           select id, $2::uuid from unnest($1::uuid[]) as t(id)`,
          [benchmarkRows.map((row) => row.id), importRow.source_project_id],
        ),
        tx.query(
          `update cost_import_lines as l
              set status = 'approved', benchmark_id = data.benchmark_id
             from unnest($1::uuid[], $2::uuid[]) as data(line_id, benchmark_id)
            where l.id = data.line_id`,
          [toPromote.map((line) => line.id), benchmarkRows.map((row) => row.id)],
        ),
      ]);

      approved = toPromote.length;
    }

    if (excludedIds.length > 0) {
      await tx.query(`update cost_import_lines set status = 'excluded' where id = any($1::uuid[])`, [
        excludedIds,
      ]);
    }

    const { rows: unmappedRows } = await tx.query<{ count: string }>(
      `select count(*)::text as count from cost_import_lines
        where cost_import_id = $1 and status = 'unmapped'`,
      [costImportId],
    );

    return { approved, excluded: excludedIds.length, unmapped: Number(unmappedRows[0].count) };
  });
}

type UnmappedLineRow = {
  id: string;
  cost_import_id: string;
  export_label: string;
  source_project_id: string;
  row_number: number;
  raw_description: string;
  raw_division: string | null;
  value_usd_per_gsf: string;
  candidate_score: string;
  candidate_id: string;
  candidate_item_number: string;
  candidate_name: string;
};

/** The cross-import review list AC4 and AC5 name: every line still unmapped, across every import, newest first. */
export async function listUnmappedLines(db: Db): Promise<UnmappedLine[]> {
  const { rows } = await db.query<UnmappedLineRow>(
    `select l.id, l.cost_import_id, i.export_label, i.source_project_id,
            l.row_number, l.raw_description, l.raw_division, l.value_usd_per_gsf,
            l.candidate_score,
            c.id as candidate_id, c.item_number as candidate_item_number, c.name as candidate_name
       from cost_import_lines l
       join cost_imports i on i.id = l.cost_import_id
       join canonical_work_items c on c.id = l.candidate_canonical_item_id
      where l.status = 'unmapped'
      order by i.uploaded_at desc, l.row_number`,
  );

  return rows.map((row) => ({
    id: row.id,
    costImportId: row.cost_import_id,
    exportLabel: row.export_label,
    sourceProjectId: row.source_project_id,
    rowNumber: row.row_number,
    rawDescription: row.raw_description,
    rawDivision: row.raw_division,
    valueUsdPerGsf: Number(row.value_usd_per_gsf),
    candidateCanonicalItem: {
      id: row.candidate_id,
      itemNumber: row.candidate_item_number,
      name: row.candidate_name,
    },
    candidateScore: Number(row.candidate_score),
  }));
}
