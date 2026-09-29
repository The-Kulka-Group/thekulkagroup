import type { Db } from "@/lib/db";

// LA-1396. The General Requirements tab of estimate C-00379, as a rate card.
// Every row comes from one 120,000 SF warehouse, so the rows carry that fact
// and the page shows it wherever it shows a rate.

/** How a rate is counted: per week or month of a schedule phase, per unit, or once. */
export type GrRateBasis = "phase_weeks" | "phase_months" | "unit" | "lump_sum" | "not_stated";

/** One gr_rates row. */
export type GrRate = {
  id: string;
  section: string;
  item: string;
  unit: string | null;
  basis: GrRateBasis;
  /** The schedule phase whose duration the source priced against, when it says. */
  phase: "construction" | null;
  /** Null where the source line carries no rate. */
  rate: number | null;
  /** The quantity the source used on this one job. */
  jobQuantity: number | null;
  note: string | null;
  flaggedFor: "Owner" | "Trades" | null;
  priceable: boolean;
  notPriceableReason: string | null;
  sourceEstimate: string;
  sourceJob: string;
  singleJobWarehouse: boolean;
};

export async function readGrRates(db: Db): Promise<GrRate[]> {
  const { rows } = await db.query<{
    id: string;
    section: string;
    item: string;
    unit: string | null;
    basis: GrRateBasis;
    phase: "construction" | null;
    rate: string | null;
    job_quantity: string | null;
    note: string | null;
    flagged_for: "Owner" | "Trades" | null;
    priceable: boolean;
    not_priceable_reason: string | null;
    source_estimate: string;
    source_job: string;
    single_job_warehouse: boolean;
  }>(
    `select id, section, item, unit, basis, phase, rate, job_quantity, note, flagged_for,
            priceable, not_priceable_reason, source_estimate, source_job, single_job_warehouse
       from gr_rates
      order by source_row`,
  );
  return rows.map((row) => ({
    id: row.id,
    section: row.section,
    item: row.item,
    unit: row.unit,
    basis: row.basis,
    phase: row.phase,
    rate: row.rate === null ? null : Number(row.rate),
    jobQuantity: row.job_quantity === null ? null : Number(row.job_quantity),
    note: row.note,
    flaggedFor: row.flagged_for,
    priceable: row.priceable,
    notPriceableReason: row.not_priceable_reason,
    sourceEstimate: row.source_estimate,
    sourceJob: row.source_job,
    singleJobWarehouse: row.single_job_warehouse,
  }));
}
