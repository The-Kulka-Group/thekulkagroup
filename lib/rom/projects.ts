import type { ConstructionKind, FramingSystem, ProjectType } from "@kulka/engine";

import type { Db } from "@/lib/db";
import { isUuid } from "@/lib/uuid";

// LA-1107. Which project /rom and /rom/intake show, the picker's list, and the
// New budget form's input. The schema has no "ROM project" flag, so a ROM
// project is one with at least one run. New budget runs the first ROM as soon
// as it inserts the project, and a failed run still writes a run row, so every
// project made through New budget lands in the list too.

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
    return rows[0]
      ? { projectId: fromEnv, notFound: false, archivedAt: rows[0].archived_at }
      : { projectId: fromEnv, notFound: false, archivedAt: null };
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

/** Projects with at least one run and not archived, newest run first (LA-1110 excludes archived). */
export async function listRomProjects(db: Db): Promise<RomProjectOption[]> {
  const { rows } = await db.query<RomProjectOption>(
    `select p.id, p.name
       from projects p
       join runs r on r.project_id = p.id
      where p.archived_at is null
      group by p.id, p.name
      order by max(r.started_at) desc, p.name`,
  );
  return rows;
}

export type NewBudget = {
  name: string;
  grossSquareFeet: number;
  projectType: ProjectType;
  constructionKind: ConstructionKind;
  framingSystem: FramingSystem | null;
};

const PROJECT_TYPES: ReadonlySet<string> = new Set(["multifamily", "self_storage"]);
const CONSTRUCTION_KINDS: ReadonlySet<string> = new Set(["new", "renovation"]);
const FRAMING: ReadonlySet<string> = new Set(["wood", "metal"]);

/**
 * The fields the projects table requires plus the area the engine prices on,
 * and framing. Everything else on the project stays null or its column default.
 */
export function parseNewBudget(body: unknown): { ok: true; budget: NewBudget } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Send a JSON object." };
  }
  const { name, grossSquareFeet, projectType, constructionKind, framingSystem } = body as Record<string, unknown>;
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
  return {
    ok: true,
    budget: {
      name: name.trim(),
      grossSquareFeet,
      projectType: projectType as ProjectType,
      constructionKind: constructionKind as ConstructionKind,
      framingSystem: (framingSystem ?? null) as FramingSystem | null,
    },
  };
}

export async function insertRomProject(db: Db, budget: NewBudget): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into projects (name, gross_square_feet, project_type, construction_kind, framing_system)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [budget.name, budget.grossSquareFeet, budget.projectType, budget.constructionKind, budget.framingSystem],
  );
  return rows[0].id;
}

export class ProjectNotFoundForEdit extends Error {
  constructor(readonly projectId: string) {
    super("That project could not be found.");
  }
}

export class CannotArchiveEnvProject extends Error {
  constructor() {
    super("The project configured for this environment cannot be archived.");
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
            construction_kind = $5, framing_system = $6
      where id = $1
      returning id`,
    [projectId, budget.name, budget.grossSquareFeet, budget.projectType, budget.constructionKind, budget.framingSystem],
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
export async function archiveRomProject(db: Db, projectId: string, envProjectId: string | undefined): Promise<void> {
  if (envProjectId && projectId === envProjectId) throw new CannotArchiveEnvProject();
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
    archived_at: string | null;
  }>(
    `select id, name, gross_square_feet, project_type, construction_kind, framing_system, archived_at
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
    archivedAt: row.archived_at,
  };
}
