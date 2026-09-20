import type { Db } from "@/lib/db";

import { bestCanonicalMatch, MATCH_THRESHOLD, type CanonicalItemCandidate } from "./canonical-item-match";
import { CostFileParseError, parseCostFile } from "./cost-file-parse";
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
export type ProvenanceKind = "actuals" | "proest_budget";
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
  provenanceKind: ProvenanceKind;
  uploadedBy: string;
  uploadedAt: string;
  status: "staged" | "approved";
  approvedBy: string | null;
  approvedAt: string | null;
};

export type CostImportDetail = CostImportSummary & { lines: StagedLine[] };

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

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateOnly(value: Date | string): string {
  return toIso(value).slice(0, 10);
}

type CostImportRow = {
  id: string;
  source_project_id: string;
  export_label: string;
  provenance_kind: ProvenanceKind;
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
 * Stages an uploaded cost file (LA-15 AC1): every row is matched against the
 * canonical work items and inserted into `cost_import_lines`, visible for
 * review. Nothing here touches `benchmarks` -- that only happens once the
 * whole import is approved (AC2, AC5).
 */
export async function stageCostImport(
  db: Db,
  params: {
    sourceProjectId: string;
    exportLabel: string;
    provenanceKind: ProvenanceKind;
    uploadedBy: string;
    fileText: string;
  },
): Promise<CostImportDetail> {
  const { rows: projectRows } = await db.query<{ id: string }>(
    `select id from projects where id = $1`,
    [params.sourceProjectId],
  );
  if (!projectRows[0]) throw new ProjectNotFound(params.sourceProjectId);

  // Parse before writing anything, so a malformed file leaves no half-staged
  // import behind.
  const parsedRows = parseCostFile(params.fileText);
  const canonicalItems = await readCanonicalItems(db);

  const { rows: importRows } = await db.query<{ id: string; uploaded_at: Date | string }>(
    `insert into cost_imports (source_project_id, export_label, provenance_kind, uploaded_by)
     values ($1, $2, $3, $4)
     returning id, uploaded_at`,
    [params.sourceProjectId, params.exportLabel, params.provenanceKind, params.uploadedBy],
  );
  const costImportId = importRows[0].id;
  const uploadedAt = importRows[0].uploaded_at;

  const lines: StagedLine[] = [];
  for (const parsed of parsedRows) {
    // canonicalItems always has the 54 frozen rows (LA-816's seed data), so
    // a match is never null in practice.
    const match = bestCanonicalMatch(parsed.description, parsed.division, canonicalItems)!;
    const status: LineStatus = match.score >= MATCH_THRESHOLD ? "staged" : "unmapped";

    const { rows } = await db.query<{ id: string }>(
      `insert into cost_import_lines
         (cost_import_id, row_number, raw_description, raw_division, value_usd_per_gsf,
          candidate_canonical_item_id, candidate_score, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       returning id`,
      [
        costImportId,
        parsed.rowNumber,
        parsed.description,
        parsed.division,
        parsed.value,
        match.item.id,
        match.score,
        status,
      ],
    );

    lines.push({
      id: rows[0].id,
      rowNumber: parsed.rowNumber,
      rawDescription: parsed.description,
      rawDivision: parsed.division,
      valueUsdPerGsf: parsed.value,
      lineRole: "scope",
      candidateCanonicalItem: { id: match.item.id, itemNumber: match.item.itemNumber, name: match.item.name },
      candidateScore: match.score,
      status,
      benchmarkId: null,
    });
  }

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

/**
 * Approves a staged import (LA-15 AC2, AC3, AC5): every line still in
 * 'staged' status (matched with confidence, not yet resolved) either
 * promotes into a real `benchmarks` row -- carrying the import's own
 * provenance -- or, if its line role is one ADR 0003 never lets feed a
 * benchmark, moves to 'excluded' without ever touching `benchmarks`. Lines
 * already 'unmapped' are left alone; this ticket does not build a
 * remap-and-approve flow for a single unmapped line (see the PR
 * description).
 *
 * Not wrapped in a database transaction, matching this file's siblings
 * (lib/rom/run.ts, lib/rom/issue.ts already make multiple non-transactional
 * writes -- issue.ts's own comment on `issueRom` names the same gap and
 * accepts it). A failure partway leaves some lines approved and others
 * still staged rather than the whole import rolling back; a second call is
 * safe to make once whatever failed is fixed, since only 'staged' rows are
 * touched.
 */
export async function approveCostImport(
  db: Db,
  costImportId: string,
  approvedBy: string,
): Promise<ApproveSummary> {
  const importRow = await readCostImport(db, costImportId);
  if (importRow.status === "approved") throw new CostImportAlreadyApproved(costImportId);

  const { rows: projectRows } = await db.query<{ project_type: string; construction_kind: string }>(
    `select project_type, construction_kind from projects where id = $1`,
    [importRow.source_project_id],
  );
  // The source project was already confirmed to exist at staging time, and
  // `cost_imports.source_project_id` references it `on delete restrict`, so
  // it cannot have disappeared since.
  const project = projectRows[0];

  const { rows: lineRows } = await db.query<{
    id: string;
    raw_description: string;
    value_usd_per_gsf: string;
    line_role: LineRole;
    candidate_item_number: string;
    candidate_scope_side: "building" | "site";
    candidate_contract_side: "kulka" | "owner";
  }>(
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
  let approved = 0;
  let excluded = 0;

  for (const line of lineRows) {
    if (!BENCHMARK_ELIGIBLE_ROLES.includes(line.line_role)) {
      await db.query(`update cost_import_lines set status = 'excluded' where id = $1`, [line.id]);
      excluded++;
      continue;
    }

    const { rows: benchmarkRows } = await db.query<{ id: string }>(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind, comparable_count,
          provenance_kind, provenance_export_label, provenance_recorded_by, provenance_recorded_at,
          scope_side, contract_side)
       values ($1, $2, 'usd_per_gsf', $3, $4, $5, 1, $6, $7, $8, $9, $10, $11)
       returning id`,
      [
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
      ],
    );
    const benchmarkId = benchmarkRows[0].id;

    await db.query(
      `insert into benchmark_source_projects (benchmark_id, project_id) values ($1, $2)`,
      [benchmarkId, importRow.source_project_id],
    );
    await db.query(
      `update cost_import_lines set status = 'approved', benchmark_id = $2 where id = $1`,
      [line.id, benchmarkId],
    );
    approved++;
  }

  await db.query(
    `update cost_imports set status = 'approved', approved_by = $2, approved_at = now() where id = $1`,
    [costImportId, approvedBy],
  );

  const { rows: unmappedRows } = await db.query<{ count: string }>(
    `select count(*)::text as count from cost_import_lines
      where cost_import_id = $1 and status = 'unmapped'`,
    [costImportId],
  );

  return { approved, excluded, unmapped: Number(unmappedRows[0].count) };
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
