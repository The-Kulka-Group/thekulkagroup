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
 */
export async function resolveRomProjectId(
  db: Db,
  fromUrl: string | string[] | undefined,
  fromEnv: string | undefined,
): Promise<{ projectId: string | undefined; notFound: boolean }> {
  const asked = Array.isArray(fromUrl) ? fromUrl[0] : fromUrl;
  if (asked === undefined || asked === "") return { projectId: fromEnv || undefined, notFound: false };
  if (!isUuid(asked)) return { projectId: undefined, notFound: true };
  const { rows } = await db.query<{ id: string }>(`select id from projects where id = $1`, [asked]);
  return rows[0] ? { projectId: rows[0].id, notFound: false } : { projectId: undefined, notFound: true };
}

/** Projects with at least one run, newest run first. */
export async function listRomProjects(db: Db): Promise<RomProjectOption[]> {
  const { rows } = await db.query<RomProjectOption>(
    `select p.id, p.name
       from projects p
       join runs r on r.project_id = p.id
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
