import type { Db } from "@/lib/db";

import type { StageFacts } from "./stage-model";

// LA-1317: the project facts the Design and Engineering stage draws from,
// read on the server alongside the rest of the /rom page's data.
export async function readStageFacts(db: Db, projectId: string): Promise<StageFacts | null> {
  const { rows } = await db.query<{
    gross_square_feet: number | null;
    stories_above_grade: number | null;
    unit_count: number | null;
    building_count: number | null;
    parking_type: string | null;
    elevator_count: number | null;
    levels_below_grade_gate: string | null;
    balconies_gate: string | null;
    retail_storefronts_gate: string | null;
    site_conditions_gate: string | null;
  }>(
    `select gross_square_feet, stories_above_grade, unit_count, building_count, parking_type,
            elevator_count, levels_below_grade_gate, balconies_gate, retail_storefronts_gate,
            site_conditions_gate
       from projects where id = $1`,
    [projectId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    grossSquareFeet: r.gross_square_feet === null ? null : Number(r.gross_square_feet),
    stories: r.stories_above_grade,
    unitCount: r.unit_count,
    buildingCount: r.building_count ?? 1,
    parkingType: r.parking_type,
    elevatorCount: r.elevator_count,
    belowGrade: r.levels_below_grade_gate === "yes",
    balconies: r.balconies_gate === "yes",
    retail: r.retail_storefronts_gate === "yes",
    poorSoil: r.site_conditions_gate === "yes",
  };
}
