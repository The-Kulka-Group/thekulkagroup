import type { Benchmark, BenchmarkUnit, ConstructionKind, DataSnapshot, ProjectType } from "@kulka/engine";

import type { Db } from "@/lib/db";

import { basisFor, isQuantityRule } from "./quantity-rules";

// LA-1245. A rate for one project (project_rates), the first rate that is not
// shared by every project of the same type and construction kind. Matt,
// 2026-09-28: a rate the model suggests from the project's location and
// labor type prices that project only. A run on the project prices the cost
// code from this row in place of any shared benchmark for it.

export type ProjectRate = {
  costCode: string;
  label: string;
  unit: BenchmarkUnit;
  value: number;
  scopeSide: "building" | "site";
  contractSide: "kulka" | "owner";
  note: string;
  recordedBy: string;
  recordedAt: string;
};

type Row = {
  cost_code: string;
  label: string;
  unit: BenchmarkUnit;
  value: string;
  scope_side: "building" | "site";
  contract_side: "kulka" | "owner";
  provenance_note: string;
  recorded_by: string;
  recorded_at: string | Date;
};

export async function readProjectRates(db: Db, projectId: string): Promise<ProjectRate[]> {
  const { rows } = await db.query<Row>(
    `select cost_code, label, unit, value, scope_side, contract_side, provenance_note, recorded_by, recorded_at
       from project_rates where project_id = $1 order by cost_code`,
    [projectId],
  );
  return rows.map((row) => ({
    costCode: row.cost_code,
    label: row.label,
    unit: row.unit,
    value: Number(row.value),
    scopeSide: row.scope_side,
    contractSide: row.contract_side,
    note: row.provenance_note,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString().slice(0, 10) : String(row.recorded_at).slice(0, 10),
  }));
}

/** The snapshot with each project rate standing in for every shared benchmark on its cost code. */
export function withProjectRates(
  snapshot: DataSnapshot,
  rates: ProjectRate[],
  projectType: ProjectType,
  constructionKind: ConstructionKind,
): DataSnapshot {
  if (rates.length === 0) return snapshot;
  const replaced = new Set(rates.map((rate) => rate.costCode));
  const own: Benchmark[] = rates.map((rate) => ({
    costCode: rate.costCode,
    label: rate.label,
    unit: rate.unit,
    value: rate.value,
    projectType,
    constructionKind,
    provenance: {
      kind: "reviewed_judgment",
      sourceProjectIds: [],
      exportLabel: `This project only. ${rate.note}`,
      recordedBy: rate.recordedBy,
      recordedAt: rate.recordedAt,
    },
    scopeSide: rate.scopeSide,
    contractSide: rate.contractSide,
  }));
  return {
    ...snapshot,
    benchmarks: [...snapshot.benchmarks.filter((benchmark) => !replaced.has(benchmark.costCode)), ...own],
  };
}

export class ProjectRateRefused extends Error {}

export type NewProjectRate = {
  projectId: string;
  costCode: string;
  value: number;
  recordedBy: string;
  recordedAt: string;
  /** What the model proposed, kept beside the saved figure. */
  modelProposal: { value: number; low: number; high: number; reasoning: string; model: string; asks?: number[] } | null;
};

/**
 * Records a supporting item's rate for one project. Like the shared rate
 * (lib/rom/stated-rates.ts), only a stated supporting item takes one here,
 * priced on its counting rule's unit (lib/rom/quantity-rules.ts). Saving again replaces the
 * project's earlier rate for the item.
 */
export async function saveProjectRate(db: Db, rate: NewProjectRate): Promise<void> {
  if (!Number.isFinite(rate.value) || rate.value <= 0) throw new ProjectRateRefused("Enter a rate above zero.");
  const relationship = await db.query<{ driver_cost_code: string; supporting_label: string; quantity_rule: string }>(
    `select driver_cost_code, supporting_label, quantity_rule
       from scope_relationships where supporting_cost_code = $1 limit 1`,
    [rate.costCode],
  );
  const found = relationship.rows[0];
  if (!found) throw new ProjectRateRefused("Only a supporting item can take a rate here.");
  if (!isQuantityRule(found.quantity_rule)) {
    throw new ProjectRateRefused("This item's quantity rule has no rate unit yet.");
  }
  const basis = basisFor(found.quantity_rule);
  const project = await db.query<{ project_type: string; construction_kind: string }>(
    `select project_type, construction_kind from projects where id = $1`,
    [rate.projectId],
  );
  if (!project.rows[0]) throw new ProjectRateRefused("Project not found.");
  const driver = await db.query<{ scope_side: string; contract_side: string }>(
    `select scope_side, contract_side from benchmarks
      where cost_code = $1 and project_type = $2 and construction_kind = $3 limit 1`,
    [found.driver_cost_code, project.rows[0].project_type, project.rows[0].construction_kind],
  );
  const sides = driver.rows[0] ?? { scope_side: "building", contract_side: "kulka" };
  const note = rate.modelProposal
    ? `Began as ${rate.modelProposal.model}'s suggestion of $${rate.modelProposal.value} ${basis.per} ($${rate.modelProposal.low} to $${rate.modelProposal.high}); saved at $${rate.value} ${basis.per}, ${basis.count}.`
    : `Stated on the item's card, $${rate.value} ${basis.per}, ${basis.count}.`;

  await db.query(
    `insert into project_rates
       (project_id, cost_code, label, unit, value, scope_side, contract_side, provenance_kind,
        provenance_note, recorded_by, recorded_at, model_proposal)
     values ($1, $2, $3, $11, $4, $5, $6, 'reviewed_judgment', $7, $8, $9, $10)
     on conflict (project_id, cost_code) do update
       set value = excluded.value, provenance_note = excluded.provenance_note,
           recorded_by = excluded.recorded_by, recorded_at = excluded.recorded_at,
           model_proposal = excluded.model_proposal`,
    [
      rate.projectId,
      rate.costCode,
      found.supporting_label,
      rate.value,
      sides.scope_side,
      sides.contract_side,
      note,
      rate.recordedBy,
      rate.recordedAt,
      rate.modelProposal ? JSON.stringify(rate.modelProposal) : null,
      basis.unit,
    ],
  );
}
