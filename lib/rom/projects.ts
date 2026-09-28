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
};

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
  } = body as Record<string, unknown>;
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
    },
  };
}

export async function insertRomProject(db: Db, budget: NewBudget): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into projects
       (name, gross_square_feet, project_type, construction_kind, framing_system, parking_type,
        stories_above_grade, unit_count, building_count, zip, elevator_count, rom_budget)
     values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, 1), $10, $11, true)
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
    ],
  );
  return rows[0].id;
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
    `update projects
        set name = $2, gross_square_feet = $3, project_type = $4,
            construction_kind = $5, framing_system = $6,
            stories_above_grade = $7, unit_count = $8, building_count = coalesce($9, building_count), zip = $10,
            elevator_count = $11
      where id = $1
      returning id`,
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
    ],
  );
  if (!rows[0]) throw new ProjectNotFoundForEdit(projectId);
}

/**
 * Archive (LA-1110): sets a timestamp, never deletes the row. Hides the
 * project from listRomProjects (both /rom and /rom/intake pickers) only --
 * every benchmark, run, cost import and classification keeps reading it.
 * `envProjectId` is the project configured for this environment
 * (ROM_PROJECT_ID); it can never be archived, so the tool that always resolves
 * to it never goes dark.
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
    archived_at: string | null;
  }>(
    `select id, name, gross_square_feet, project_type, construction_kind, framing_system,
            stories_above_grade, unit_count, building_count, zip, elevator_count, archived_at
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
    archivedAt: row.archived_at,
  };
}
