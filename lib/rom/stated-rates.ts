import type { Db } from "@/lib/db";

// Matt, 2026-09-28: a supporting item that shows "No Rate Yet" (Plumbing
// Disconnect and Cap, the gas and electrical disconnects, the site utility
// cut and cap) should take a rate right on its card. This records that rate
// as a benchmark, the same footing the demolition rates were stated on
// (20260927150000_demolition_stated_rates.sql): a reviewed judgment, named
// and dated. A benchmark is shared by every budget of the same project type
// and construction kind, so the rate prices those too.
//
// Only a stated supporting item takes one, and only while it has no rate:
// every supporting item today comes in one per structure coming down
// (scope_relationships.quantity_rule), so its rate is dollars each.

export class RateRefused extends Error {}

export type SupportingItemRate = {
  costCode: string;
  /** Dollars each, one per structure coming down. */
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
  if (found.quantity_rule !== "one_per_structure") throw new RateRefused("This item's quantity rule has no rate unit yet.");

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
     values ($1, $2, 'usd_each_structure', $3, $4, $5, 1, $6, $7, 'reviewed_judgment', $8, $9, $10)`,
    [
      rate.costCode,
      found.supporting_label,
      rate.value,
      rate.projectType,
      rate.constructionKind,
      sides.scope_side,
      sides.contract_side,
      `Stated on the item's card in Kulka AI, $${rate.value} each, one per structure coming down.`,
      rate.recordedBy,
      rate.recordedAt,
    ],
  );
}
