import type { ConstructionKind, FramingSystem, ParkingType, ProjectType } from "@kulka/engine";

import type { Db } from "@/lib/db";
import { isUuid } from "@/lib/uuid";

// LA-1107. Which project /rom and /rom/intake show, the picker's list, and the
// New budget form's input.
//
// LA-1140: New budget no longer runs a ROM as soon as it inserts the project
// (Matt: "a new budget should start clean and have no saved runs on the
// bottom"), so a project made through New budget can have zero runs. The
// picker lists a project when it is flagged rom_budget (set by
// insertRomProject) OR it has at least one run, so a clean budget still shows
// up and a past job that only feeds benchmarks and was never made through New
// budget still stays out.

export type RomProjectOption = { id: string; name: string };

/**
 * The project the page shows. `project` from the URL wins over
 * ROM_PROJECT_ID. A URL id that is not a uuid or names no project resolves to
 * nothing, rather than quietly showing the env project under a different URL.
 *
 * LA-1110: an archived project still resolves (it is not "not found") so
 * `?project=<archived id>` can show its own archived state and a Restore
 * button, rather than falling through to "project not found".
 */
export async function resolveRomProjectId(
  db: Db,
  fromUrl: string | string[] | undefined,
  fromEnv: string | undefined,
): Promise<{ projectId: string | undefined; notFound: boolean; archivedAt: string | null }> {
  const asked = Array.isArray(fromUrl) ? fromUrl[0] : fromUrl;
  if (asked === undefined || asked === "") {
    if (!fromEnv) return { projectId: undefined, notFound: false, archivedAt: null };
    const { rows } = await db.query<{ archived_at: string | null }>(
      `select archived_at from projects where id = $1`,
      [fromEnv],
    );
    // Matt, 2026-09-27: the environment's project can be archived like any
    // other. Once it is, a bare /rom opens on no project (choose one or start
    // a new budget) rather than on an archived one.
    if (rows[0]?.archived_at) return { projectId: undefined, notFound: false, archivedAt: null };
    return { projectId: fromEnv, notFound: false, archivedAt: null };
  }
  if (!isUuid(asked)) return { projectId: undefined, notFound: true, archivedAt: null };
  const { rows } = await db.query<{ id: string; archived_at: string | null }>(
    `select id, archived_at from projects where id = $1`,
    [asked],
  );
  return rows[0]
    ? { projectId: rows[0].id, notFound: false, archivedAt: rows[0].archived_at }
    : { projectId: undefined, notFound: true, archivedAt: null };
}

/**
 * Not-archived projects flagged rom_budget or with at least one run
 * (LA-1110 excludes archived; LA-1140 adds the rom_budget flag so a clean
 * budget with zero runs still lists). Newest run first, then newest created,
 * then name.
 */
export async function listRomProjects(db: Db): Promise<RomProjectOption[]> {
  const { rows } = await db.query<RomProjectOption>(
    `select p.id, p.name
       from projects p
       left join runs r on r.project_id = p.id
      where p.archived_at is null
        and (p.rom_budget or r.project_id is not null)
      group by p.id, p.name, p.created_at
      order by max(r.started_at) desc nulls last, p.created_at desc, p.name`,
  );
  return rows;
}

export type NewBudget = {
  name: string;
  grossSquareFeet: number;
  projectType: ProjectType;
  constructionKind: ConstructionKind;
  framingSystem: FramingSystem | null;
  /**
   * LA-1141: the guided New budget flow asks parking type on its Facts step
   * (config/rom/tier1-flow.json), the same required gate a run reads off
   * `projects.parking_type` when a caller sends it no `responses`
   * (lib/rom/run.ts's `answersFromProject`). Recording it at creation means a
   * later run from Run settings already has it, with no Run settings field of
   * its own needed. Optional and defaulted to null so updateRomProject (Edit
   * project, which never asks this question) can keep passing a `NewBudget`
   * without disturbing what New budget recorded.
   */
  parkingType?: ParkingType | null;
  /**
   * LA-1199: the same four facts the tier-1 flow's Facts step now asks after
   * Gross Area, so New budget's initial project insert and Edit project can
   * carry them the way New budget already carries framing and parking.
   * Optional and defaulted to null/undefined so a caller (including a run
   * from Run settings, which never asks these) can keep sending a
   * `NewBudget` with none of them.
   */
  storiesAboveGrade?: number | null;
  unitCount?: number | null;
  buildingCount?: number | null;
  /** Five digits (LA-1224). */
  zip?: string | null;
  /**
   * LA-1212: the guided New budget flow's Scope step asks Elevator Count once
   * the elevator gate answers yes (config/rom/tier1-flow.json's
   * "elevator_count"), and the answer had nowhere to land on the project
   * until now. Zero is a legal answer (no elevator), so this is checked
   * `>= 0` rather than `> 0` the way the other four counts above are.
   */
  elevatorCount?: number | null;
  /**
   * LA-1239: demolition's three building answers. Saved on the project so a
   * later run still has them; until they are answered, a run leaves the
   * Demolition element out (lib/rom/demolition-hold.ts). Zero structures is
   * a real answer (site work only).
   */
  demolitionStructureCount?: number | null;
  demolitionStructureSquareFeet?: number | null;
  demolitionStructureType?: string | null;
  /**
   * LA-2274: the balcony answers, saved on the project the way demolition's
   * are (LA-1239), so a later run keeps them and Edit Project can change them.
   */
  balconyType?: BalconyType | null;
  balconyCount?: number | null;
  balconyDeckSquareFeet?: number | null;
  balconyRailLinearFeet?: number | null;
  julietCount?: number | null;
  julietRailLinearFeet?: number | null;
  /** LA-1245: Union, Open Shop or Prevailing Wage. A suggested rate reads it. */
  laborType?: string | null;
};

export const LABOR_TYPES: ReadonlySet<string> = new Set(["union", "open_shop", "prevailing_wage"]);

/** The demolition structure types config/rom/tier1-flow.json offers, matching the column's check. */
export const DEMOLITION_STRUCTURE_TYPES: ReadonlySet<string> = new Set([
  "wood_frame_type_v",
  "masonry_bearing_wall_type_iii",
  "pre_engineered_metal_or_light_steel",
  "steel_frame_concrete_metal_deck_type_ii",
  "cast_in_place_concrete_frame_type_i",
  "dont_know",
]);

export type BalconyType = "full" | "juliet";
const BALCONY_TYPES: ReadonlySet<string> = new Set(["full", "juliet"]);
/** LA-2274: the balcony numbers, each a positive number or null. */
const BALCONY_NUMBERS = [
  "balconyCount",
  "balconyDeckSquareFeet",
  "balconyRailLinearFeet",
  "julietCount",
  "julietRailLinearFeet",
] as const;

const PROJECT_TYPES: ReadonlySet<string> = new Set(["multifamily", "self_storage"]);
const CONSTRUCTION_KINDS: ReadonlySet<string> = new Set(["new", "renovation"]);
const FRAMING: ReadonlySet<string> = new Set(["wood", "metal"]);
const PARKING_TYPES: ReadonlySet<string> = new Set(["none", "surface", "structured", "underground", "dont_know"]);
const ZIP_PATTERN = /^[0-9]{5}$/;

/**
 * The fields the projects table requires plus the area the engine prices on,
 * framing, and parking type. Everything else on the project stays null or its
 * column default.
 */
export function parseNewBudget(body: unknown): { ok: true; budget: NewBudget } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object." };
  }
  const {
    name,
    grossSquareFeet,
    projectType,
    constructionKind,
    framingSystem,
    parkingType,
    storiesAboveGrade,
    unitCount,
    buildingCount,
    zip,
    elevatorCount,
    demolitionStructureCount,
    demolitionStructureSquareFeet,
    demolitionStructureType,
    balconyType,
    laborType,
  } = body as Record<string, unknown>;
  const fields = body as Record<string, unknown>;
  if (typeof name !== "string" || name.trim() === "") return { ok: false, error: "Send a project name." };
  if (name.trim().length > 200) return { ok: false, error: "Keep the project name under 200 characters." };
  if (typeof grossSquareFeet !== "number" || !Number.isInteger(grossSquareFeet) || grossSquareFeet <= 0) {
    return { ok: false, error: "Send gross square feet as a whole number above zero." };
  }
  if (typeof projectType !== "string" || !PROJECT_TYPES.has(projectType)) {
    return { ok: false, error: 'Send projectType as "multifamily" or "self_storage".' };
  }
  if (typeof constructionKind !== "string" || !CONSTRUCTION_KINDS.has(constructionKind)) {
    return { ok: false, error: 'Send constructionKind as "new" or "renovation".' };
  }
  if (framingSystem !== undefined && framingSystem !== null && (typeof framingSystem !== "string" || !FRAMING.has(framingSystem))) {
    return { ok: false, error: 'Send framingSystem as "wood", "metal", or null.' };
  }
  if (parkingType !== undefined && parkingType !== null && (typeof parkingType !== "string" || !PARKING_TYPES.has(parkingType))) {
    return {
      ok: false,
      error: 'Send parkingType as "none", "surface", "structured", "underground", "dont_know", or null.',
    };
  }
  // Neither storiesAboveGrade nor unitCount is enforced as required here.
  // parseNewBudget backs both New budget's insert and Edit project's PATCH
  // (LA-1110's "same parseNewBudget validation"), and an older multifamily
  // project saved before LA-1199 has neither -- Edit project has to keep
  // saving it (ticket: "Older projects... must still open and run"). The
  // Facts-step gate that requires both for a new multifamily budget is
  // enforced client-side, in GuidedNewBudget.tsx, through the same tier-1
  // flow (question-flow.ts's requiredWhen) that config/rom/tier1-flow.json
  // declares them against.
  if (
    storiesAboveGrade !== undefined &&
    storiesAboveGrade !== null &&
    (typeof storiesAboveGrade !== "number" || !Number.isInteger(storiesAboveGrade) || storiesAboveGrade <= 0)
  ) {
    return { ok: false, error: "Send storiesAboveGrade as a whole number above zero, or null." };
  }
  if (unitCount !== undefined && unitCount !== null && (typeof unitCount !== "number" || !Number.isInteger(unitCount) || unitCount <= 0)) {
    return { ok: false, error: "Send unitCount as a whole number above zero, or null." };
  }
  if (
    buildingCount !== undefined &&
    buildingCount !== null &&
    (typeof buildingCount !== "number" || !Number.isInteger(buildingCount) || buildingCount <= 0)
  ) {
    return { ok: false, error: "Send buildingCount as a whole number above zero, or null." };
  }
  if (zip !== undefined && zip !== null && (typeof zip !== "string" || !ZIP_PATTERN.test(zip))) {
    return { ok: false, error: "Send zip as five digits, or null." };
  }
  // LA-1212: unlike storiesAboveGrade and unitCount above, zero is a legal
  // Elevator Count (no elevator), so this only refuses a negative or
  // non-integer value, never zero.
  if (
    elevatorCount !== undefined &&
    elevatorCount !== null &&
    (typeof elevatorCount !== "number" || !Number.isInteger(elevatorCount) || elevatorCount < 0)
  ) {
    return { ok: false, error: "Send elevatorCount as a whole number of zero or more, or null." };
  }
  if (
    demolitionStructureCount !== undefined &&
    demolitionStructureCount !== null &&
    (typeof demolitionStructureCount !== "number" ||
      !Number.isInteger(demolitionStructureCount) ||
      demolitionStructureCount < 0)
  ) {
    return { ok: false, error: "Send demolitionStructureCount as a whole number of zero or more, or null." };
  }
  if (
    demolitionStructureSquareFeet !== undefined &&
    demolitionStructureSquareFeet !== null &&
    (typeof demolitionStructureSquareFeet !== "number" ||
      !Number.isInteger(demolitionStructureSquareFeet) ||
      demolitionStructureSquareFeet <= 0)
  ) {
    return { ok: false, error: "Send demolitionStructureSquareFeet as a whole number above zero, or null." };
  }
  if (
    demolitionStructureType !== undefined &&
    demolitionStructureType !== null &&
    (typeof demolitionStructureType !== "string" || !DEMOLITION_STRUCTURE_TYPES.has(demolitionStructureType))
  ) {
    return { ok: false, error: "Send demolitionStructureType as one of the flow's structure types, or null." };
  }
  if (balconyType !== undefined && balconyType !== null && (typeof balconyType !== "string" || !BALCONY_TYPES.has(balconyType))) {
    return { ok: false, error: 'Send balconyType as "full", "juliet", or null.' };
  }
  for (const key of BALCONY_NUMBERS) {
    const value = fields[key];
    if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
      return { ok: false, error: `Send ${key} as a number above zero, or null.` };
    }
  }
  if (laborType !== undefined && laborType !== null && (typeof laborType !== "string" || !LABOR_TYPES.has(laborType))) {
    return { ok: false, error: 'Send laborType as "union", "open_shop", "prevailing_wage", or null.' };
  }
  return {
    ok: true,
    budget: {
      name: name.trim(),
      grossSquareFeet,
      projectType: projectType as ProjectType,
      constructionKind: constructionKind as ConstructionKind,
      framingSystem: (framingSystem ?? null) as FramingSystem | null,
      parkingType: (parkingType ?? null) as ParkingType | null,
      storiesAboveGrade: (storiesAboveGrade ?? null) as number | null,
      unitCount: (unitCount ?? null) as number | null,
      buildingCount: (buildingCount ?? null) as number | null,
      zip: (zip ?? null) as string | null,
      elevatorCount: (elevatorCount ?? null) as number | null,
      demolitionStructureCount: (demolitionStructureCount ?? null) as number | null,
      demolitionStructureSquareFeet: (demolitionStructureSquareFeet ?? null) as number | null,
      demolitionStructureType: (demolitionStructureType ?? null) as string | null,
      balconyType: (balconyType ?? null) as BalconyType | null,
      balconyCount: (fields.balconyCount ?? null) as number | null,
      balconyDeckSquareFeet: (fields.balconyDeckSquareFeet ?? null) as number | null,
      balconyRailLinearFeet: (fields.balconyRailLinearFeet ?? null) as number | null,
      julietCount: (fields.julietCount ?? null) as number | null,
      julietRailLinearFeet: (fields.julietRailLinearFeet ?? null) as number | null,
      // Matt, 2026-09-28: Kulka's work is nearly always open shop, so a
      // project without a stated labor type is open shop.
      laborType: (laborType ?? "open_shop") as string,
    },
  };
}

export async function insertRomProject(db: Db, budget: NewBudget): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into projects
       (name, gross_square_feet, project_type, construction_kind, framing_system, parking_type,
        stories_above_grade, unit_count, building_count, zip, elevator_count,
        demolition_structure_count, demolition_structure_square_feet, demolition_structure_type, labor_type,
        balcony_type, balcony_count, balcony_deck_square_feet, balcony_rail_linear_feet,
        juliet_count, juliet_rail_linear_feet, rom_budget)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 1), $10, $11, $12, $13, $14, $15,
             $16, $17, $18, $19, $20, $21, true)
     returning id`,
    [
      budget.name,
      budget.grossSquareFeet,
      budget.projectType,
      budget.constructionKind,
      budget.framingSystem,
      budget.parkingType ?? null,
      budget.storiesAboveGrade ?? null,
      budget.unitCount ?? null,
      budget.buildingCount ?? null,
      budget.zip ?? null,
      budget.elevatorCount ?? null,
      budget.demolitionStructureCount ?? null,
      budget.demolitionStructureSquareFeet ?? null,
      budget.demolitionStructureType ?? null,
      budget.laborType ?? "open_shop",
      ...balconyValues(budget),
    ],
  );
  return rows[0].id;
}

function balconyValues(budget: NewBudget) {
  return [
    budget.balconyType ?? null,
    budget.balconyCount ?? null,
    budget.balconyDeckSquareFeet ?? null,
    budget.balconyRailLinearFeet ?? null,
    budget.julietCount ?? null,
    budget.julietRailLinearFeet ?? null,
  ];
}

export class ProjectNotFoundForEdit extends Error {
  constructor(readonly projectId: string) {
    super("That project could not be found.");
  }
}


/**
 * Edit (LA-1110): updates the same fields New budget writes. Saved runs are
 * untouched -- a run is a fixed record of what was priced at the time, not a
 * view over the live project row.
 */
export async function updateRomProject(db: Db, projectId: string, budget: NewBudget): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `with updated as (
       update projects
          set name = $2, gross_square_feet = $3, project_type = $4,
              construction_kind = $5, framing_system = $6,
              stories_above_grade = $7, unit_count = $8, building_count = coalesce($9, building_count), zip = $10,
              elevator_count = $11, demolition_structure_count = $12,
              demolition_structure_square_feet = $13, demolition_structure_type = $14, labor_type = $15,
              parking_type = $16, balcony_type = $17, balcony_count = $18, balcony_deck_square_feet = $19,
              balcony_rail_linear_feet = $20, juliet_count = $21, juliet_rail_linear_feet = $22
        where id = $1
        returning id, name
     ), renamed_case as (
       -- LA-2417: a budget linked to an underwriting case shares the case's name.
       update underwriting_cases
          set name = updated.name, case_revision = case_revision + 1, updated_at = now()
         from updated
        where underwriting_cases.rom_project_id = updated.id
          and underwriting_cases.name is distinct from updated.name
     )
     select id from updated`,
    [
      projectId,
      budget.name,
      budget.grossSquareFeet,
      budget.projectType,
      budget.constructionKind,
      budget.framingSystem,
      budget.storiesAboveGrade ?? null,
      budget.unitCount ?? null,
      budget.buildingCount ?? null,
      budget.zip ?? null,
      budget.elevatorCount ?? null,
      budget.demolitionStructureCount ?? null,
      budget.demolitionStructureSquareFeet ?? null,
      budget.demolitionStructureType ?? null,
      budget.laborType ?? "open_shop",
      budget.parkingType ?? null,
      ...balconyValues(budget),
    ],
  );
  if (!rows[0]) throw new ProjectNotFoundForEdit(projectId);
}

/**
 * Archive (LA-1110): sets a timestamp, never deletes the row. Hides the
 * project from listRomProjects (both /rom and /rom/intake pickers) only --
 * every benchmark, run, cost import and classification keeps reading it.
 * The environment's own project (ROM_PROJECT_ID) archives like any other
 * (LA-1236); a bare /rom then opens on no project.
 */
export async function archiveRomProject(db: Db, projectId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `update projects set archived_at = now() where id = $1 returning id`,
    [projectId],
  );
  if (!rows[0]) throw new ProjectNotFoundForEdit(projectId);
}

/** Restore (LA-1110): clears the archive timestamp. Always allowed. */
export async function restoreRomProject(db: Db, projectId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `update projects set archived_at = null where id = $1 returning id`,
    [projectId],
  );
  if (!rows[0]) throw new ProjectNotFoundForEdit(projectId);
}

/** The New budget fields as they read back off a project row, for the Edit panel's prefill. */
export type RomProjectDetail = NewBudget & { id: string; archivedAt: string | null };

export async function readRomProjectDetail(db: Db, projectId: string): Promise<RomProjectDetail | null> {
  const { rows } = await db.query<{
    id: string;
    name: string;
    gross_square_feet: number | null;
    project_type: ProjectType;
    construction_kind: ConstructionKind;
    framing_system: FramingSystem | null;
    stories_above_grade: number | null;
    unit_count: number | null;
    building_count: number;
    zip: string | null;
    elevator_count: number | null;
    demolition_structure_count: number | null;
    demolition_structure_square_feet: number | null;
    demolition_structure_type: string | null;
    labor_type: string | null;
    parking_type: ParkingType | null;
    balcony_type: BalconyType | null;
    balcony_count: string | null;
    balcony_deck_square_feet: string | null;
    balcony_rail_linear_feet: string | null;
    juliet_count: string | null;
    juliet_rail_linear_feet: string | null;
    archived_at: string | null;
  }>(
    `select id, name, gross_square_feet, project_type, construction_kind, framing_system,
            stories_above_grade, unit_count, building_count, zip, elevator_count,
            demolition_structure_count, demolition_structure_square_feet, demolition_structure_type, labor_type,
            parking_type, balcony_type, balcony_count, balcony_deck_square_feet, balcony_rail_linear_feet,
            juliet_count, juliet_rail_linear_feet, archived_at
       from projects where id = $1`,
    [projectId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    grossSquareFeet: row.gross_square_feet ?? 0,
    projectType: row.project_type,
    constructionKind: row.construction_kind,
    framingSystem: row.framing_system,
    storiesAboveGrade: row.stories_above_grade,
    unitCount: row.unit_count,
    buildingCount: row.building_count,
    zip: row.zip,
    elevatorCount: row.elevator_count,
    demolitionStructureCount: row.demolition_structure_count,
    demolitionStructureSquareFeet: row.demolition_structure_square_feet,
    demolitionStructureType: row.demolition_structure_type,
    laborType: row.labor_type,
    parkingType: row.parking_type,
    balconyType: row.balcony_type,
    balconyCount: numberOrNull(row.balcony_count),
    balconyDeckSquareFeet: numberOrNull(row.balcony_deck_square_feet),
    balconyRailLinearFeet: numberOrNull(row.balcony_rail_linear_feet),
    julietCount: numberOrNull(row.juliet_count),
    julietRailLinearFeet: numberOrNull(row.juliet_rail_linear_feet),
    archivedAt: row.archived_at,
  };
}

/** Postgres returns a numeric column as text. */
export function numberOrNull(value: string | number | null): number | null {
  return value === null ? null : Number(value);
}
