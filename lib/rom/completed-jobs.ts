import { SCHEDULE_PHASES, type CompletedJob, type CompletedJobPhase, type SchedulePhase } from "@kulka/engine";

import type { Db } from "@/lib/db";

import { toDateOnly } from "./date";

// LA-1399: Kulka's completed jobs (completed_jobs), read for the schedule
// proposal. A phase recorded by dates becomes the weeks between them; one
// recorded as weeks is read as is. Either way it keeps its source.

type Row = {
  job_number: string;
  name: string;
  building_type: string;
  construction_kind: "new" | "renovation";
  gross_square_feet: string | number;
  stories_above_grade: number | null;
} & Record<`${SchedulePhase}_${"start" | "end"}`, Date | string | null> &
  Record<`${SchedulePhase}_weeks`, string | number | null> &
  Record<`${SchedulePhase}_source`, string | null>;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two dates, as weeks to one decimal. */
function weeksBetween(start: Date | string, end: Date | string): number {
  const days = Math.round((Date.parse(toDateOnly(end)) - Date.parse(toDateOnly(start))) / DAY_MS);
  return Math.round((days / 7) * 10) / 10;
}

function phaseOf(row: Row, phase: SchedulePhase): CompletedJobPhase | null {
  const source = row[`${phase}_source`];
  if (source === null) return null;
  const start = row[`${phase}_start`];
  const end = row[`${phase}_end`];
  if (start !== null && end !== null) return { weeks: weeksBetween(start, end), source };
  const weeks = row[`${phase}_weeks`];
  return weeks === null ? null : { weeks: Number(weeks), source };
}

export async function readCompletedJobs(db: Db): Promise<CompletedJob[]> {
  const { rows } = await db.query<Row>(`select * from completed_jobs order by job_number`);
  return rows.map((row) => {
    const phases = {} as CompletedJob["phases"];
    for (const phase of SCHEDULE_PHASES) phases[phase] = phaseOf(row, phase);
    return {
      jobNumber: row.job_number,
      name: row.name,
      buildingType: row.building_type,
      constructionKind: row.construction_kind,
      grossSquareFeet: Number(row.gross_square_feet),
      storiesAboveGrade: row.stories_above_grade,
      phases,
    };
  });
}
