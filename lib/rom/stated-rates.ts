import type { Db } from "@/lib/db";

import { basisFor, isQuantityRule } from "./quantity-rules";

// Matt, 2026-09-28: a supporting item that shows "No Rate Yet" (Plumbing
// Disconnect and Cap, the gas and electrical disconnects, the site utility
// cut and cap) should take a rate right on its card. This records that rate
// as a benchmark, the same footing the demolition rates were stated on
// (20260927150000_demolition_stated_rates.sql): a reviewed judgment, named
// and dated. A benchmark is shared by every budget of the same project type
// and construction kind, so the rate prices those too.
//
// Only a stated supporting item takes one, and only while it has no rate.
// How it is counted (scope_relationships.quantity_rule) sets the unit: one
// per structure coming down, or, for the Elevator element (LA-1257), one per
// elevator or one per stop (lib/rom/quantity-rules.ts).

export class RateRefused extends Error {}

export type SupportingItemRate = {
  costCode: string;
  /** Dollars per unit of the item's counting rule. */
  value: number;
  projectType: "multifamily" | "self_storage";
  constructionKind: "new" | "renovation";
  recordedBy: string;
  /** ISO date. */
  recordedAt: string;
};

export async function addSupportingItemRate(db: Db, rate: SupportingItemRate): Promise<void> {
  if (!Number.isFinite(rate.value) || rate.value <= 0) throw new RateRefused("Enter a rate above zero.");

  const relationship = await db.query<{ driver_cost_code: string; supporting_label: string; quantity_rule: string }>(
    `select driver_cost_code, supporting_label, quantity_rule
       from scope_relationships where supporting_cost_code = $1 limit 1`,
    [rate.costCode],
  );
  const found = relationship.rows[0];
  if (!found) throw new RateRefused("Only a supporting item can take a rate here.");
  if (!isQuantityRule(found.quantity_rule)) throw new RateRefused("This item's quantity rule has no rate unit yet.");
  const basis = basisFor(found.quantity_rule);

  const existing = await db.query(
    `select 1 from benchmarks where cost_code = $1 and project_type = $2 and construction_kind = $3 limit 1`,
    [rate.costCode, rate.projectType, rate.constructionKind],
  );
  if (existing.rows.length > 0) throw new RateRefused("This item already has a rate.");

  // The supporting item sits on the same side of the job as the driver that
  // brought it in (site work for demolition).
  const driver = await db.query<{ scope_side: string; contract_side: string }>(
    `select scope_side, contract_side from benchmarks
      where cost_code = $1 and project_type = $2 and construction_kind = $3 limit 1`,
    [found.driver_cost_code, rate.projectType, rate.constructionKind],
  );
  const sides = driver.rows[0] ?? { scope_side: "building", contract_side: "kulka" };

  await db.query(
    `insert into benchmarks
       (cost_code, label, unit, value, project_type, construction_kind, comparable_count,
        scope_side, contract_side, provenance_kind, provenance_export_label,
        provenance_recorded_by, provenance_recorded_at)
     values ($1, $2, $11, $3, $4, $5, 1, $6, $7, 'reviewed_judgment', $8, $9, $10)`,
    [
      rate.costCode,
      found.supporting_label,
      rate.value,
      rate.projectType,
      rate.constructionKind,
      sides.scope_side,
      sides.contract_side,
      `Stated on the item's card in Kulka AI, $${rate.value} ${basis.per}, ${basis.count}.`,
      rate.recordedBy,
      rate.recordedAt,
      basis.unit,
    ],
  );
}

/**
 * Changes a shared supporting-item rate stated earlier on a card (Matt,
 * 2026-09-28: a saved rate can be edited). Only a card-stated rate on a
 * supporting item's unit is changed here; a rate from job data is not.
 */
export async function updateSupportingItemRate(db: Db, rate: SupportingItemRate): Promise<void> {
  if (!Number.isFinite(rate.value) || rate.value <= 0) throw new RateRefused("Enter a rate above zero.");
  const { rows: changed } = await db.query(
    `update benchmarks
        set value = $1, provenance_export_label = $2, provenance_recorded_by = $3, provenance_recorded_at = $4
      where cost_code = $5 and project_type = $6 and construction_kind = $7
        and unit in ('usd_each_structure', 'usd_each_elevator', 'usd_per_stop')
        and provenance_kind = 'reviewed_judgment'
      returning 1`,
    [
      rate.value,
      `Stated on the item's card in Kulka AI, changed to $${rate.value}.`,
      rate.recordedBy,
      rate.recordedAt,
      rate.costCode,
      rate.projectType,
      rate.constructionKind,
    ],
  );
  if (changed.length === 0) throw new RateRefused("This item has no card-stated rate to change.");
}

export type SavedSupportingRate = {
  /** The rate that prices this project only, if it has one (LA-1245). */
  projectRate: { value: number; suggested: boolean } | null;
  /** The shared card-stated rate for this project's type and construction kind. */
  sharedRate: { value: number } | null;
  /** How the item is counted, for the panel's wording (LA-1257), or null when it is no supporting item. */
  basis: { fieldLabel: string; count: string; per: string } | null;
};

/** The rates a supporting item has for one project, for the rate panel to edit. */
export async function readSupportingItemRates(db: Db, projectId: string, costCode: string): Promise<SavedSupportingRate | null> {
  const project = await db.query<{ project_type: string; construction_kind: string }>(
    `select project_type, construction_kind from projects where id = $1`,
    [projectId],
  );
  const found = project.rows[0];
  if (!found) return null;
  const own = await db.query<{ value: string; model_proposal: unknown }>(
    `select value, model_proposal from project_rates where project_id = $1 and cost_code = $2`,
    [projectId, costCode],
  );
  const shared = await db.query<{ value: string }>(
    `select value from benchmarks
      where cost_code = $1 and project_type = $2 and construction_kind = $3
        and unit in ('usd_each_structure', 'usd_each_elevator', 'usd_per_stop')
        and provenance_kind = 'reviewed_judgment' limit 1`,
    [costCode, found.project_type, found.construction_kind],
  );
  const rule = await db.query<{ quantity_rule: string }>(
    `select quantity_rule from scope_relationships where supporting_cost_code = $1 limit 1`,
    [costCode],
  );
  const quantityRule = rule.rows[0]?.quantity_rule;
  const basis = quantityRule && isQuantityRule(quantityRule) ? basisFor(quantityRule) : null;
  return {
    projectRate: own.rows[0] ? { value: Number(own.rows[0].value), suggested: own.rows[0].model_proposal != null } : null,
    sharedRate: shared.rows[0] ? { value: Number(shared.rows[0].value) } : null,
    basis: basis ? { fieldLabel: basis.fieldLabel, count: basis.count, per: basis.per } : null,
  };
}
