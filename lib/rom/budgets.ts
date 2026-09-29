import type { Db } from "@/lib/db";

import { ProjectNotFoundForEdit } from "./projects";

// LA-1322: the All Budgets menu. Every ROM budget, active or archived, with
// what the menu needs to show and act on it.
//
// Delete is new. Archive stays the everyday way to put a budget away, because
// `projects` also holds the past jobs the ROM prices from (LA-1110). A project
// that feeds pricing -- a cost import's source, a benchmark's source, or a
// GSF-per-unit source -- never deletes: removing it would pull its costs out
// of every other budget's blend. Matt asked for Delete on 2026-09-28; this is
// the line it keeps.

export type RomBudgetRow = {
  id: string;
  name: string;
  grossSquareFeet: number | null;
  unitCount: number | null;
  runCount: number;
  lastRunAt: string | null;
  archivedAt: string | null;
  /** True when other budgets price from this project's costs; it cannot be deleted. */
  feedsPricing: boolean;
};

/**
 * Every budget: projects flagged rom_budget or with a run, plus any project
 * that feeds pricing so the menu can show why it can't be deleted. Active
 * first, then newest run, newest created, name.
 */
export async function listAllRomBudgets(db: Db): Promise<RomBudgetRow[]> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    gross_square_feet: number | null;
    unit_count: number | null;
    run_count: string;
    last_run_at: string | null;
    archived_at: string | null;
    feeds_pricing: boolean;
  }>(
    `select p.id, p.name, p.gross_square_feet, p.unit_count, p.archived_at,
            count(r.id) as run_count,
            max(r.started_at) as last_run_at,
            (exists (select 1 from cost_imports ci where ci.source_project_id = p.id)
              or exists (select 1 from benchmark_source_projects b where b.project_id = p.id)
              or exists (select 1 from gsf_per_unit_benchmark_source_projects g where g.project_id = p.id)) as feeds_pricing
       from projects p
       left join runs r on r.project_id = p.id
      where p.rom_budget or r.project_id is not null
      group by p.id
      order by (p.archived_at is not null), max(r.started_at) desc nulls last, p.created_at desc, p.name`,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    grossSquareFeet: row.gross_square_feet === null ? null : Number(row.gross_square_feet),
    unitCount: row.unit_count === null ? null : Number(row.unit_count),
    runCount: Number(row.run_count),
    lastRunAt: row.last_run_at === null ? null : new Date(row.last_run_at).toISOString(),
    archivedAt: row.archived_at === null ? null : new Date(row.archived_at).toISOString(),
    feedsPricing: row.feeds_pricing,
  }));
}

export class ProjectFeedsPricing extends Error {
  constructor(readonly projectId: string) {
    super("This project is a past job other budgets price from, so it can't be deleted. Archive it instead.");
  }
}

/**
 * Deletes a budget and everything that belongs only to it. Runs, their lines,
 * derived assumptions and closing comparisons go by cascade; markup history
 * and budget-only rates are removed first because their keys restrict it.
 * Refuses a project that feeds pricing.
 */
export async function deleteRomProject(db: Db, projectId: string): Promise<void> {
  await db.withTransaction(async (tx) => {
    const { rows } = await tx.query<{ feeds_pricing: boolean }>(
      `select (exists (select 1 from cost_imports ci where ci.source_project_id = p.id)
                or exists (select 1 from benchmark_source_projects b where b.project_id = p.id)
                or exists (select 1 from gsf_per_unit_benchmark_source_projects g where g.project_id = p.id)) as feeds_pricing
         from projects p where p.id = $1 for update`,
      [projectId],
    );
    if (rows.length === 0) throw new ProjectNotFoundForEdit(projectId);
    if (rows[0].feeds_pricing) throw new ProjectFeedsPricing(projectId);
    await tx.query(`delete from markup_history where project_id = $1`, [projectId]);
    await tx.query(`delete from project_rates where project_id = $1`, [projectId]);
    await tx.query(`delete from projects where id = $1`, [projectId]);
  });
}
