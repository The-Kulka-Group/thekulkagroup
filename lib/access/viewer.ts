import type { Db } from "@/lib/db";
import { TOOLS } from "@/lib/tools/catalog";

import { isoDay, levelFor, OWNER_ROLE, type AccessSetting, type Level, type PersonAccess, type TargetKind } from "./level";
import { readPersonAccess } from "./store";

// LA-3047. Who is looking at Kulka, and what they can open. The real user
// comes from sign-in; an Owner can then View As a person or a role, kept in a
// cookie, and the whole app renders as them. While sign-in is off
// (KULKA_AUTH_OPEN=1) the real user counts as an Owner, so nothing changes
// for today's users until someone picks View As.

export const VIEW_AS_COOKIE = "kulka-view-as";

export type ViewAs = { kind: "person"; id: string } | { kind: "role"; key: string };

export interface Viewer {
  /** What they open. Null means no access anywhere (signed in, but not in People). */
  access: PersonAccess | null;
  /** The real user is an Owner, so they may View As. */
  canViewAs: boolean;
  /** Set while viewing as someone: whose view it is. */
  viewingAs: { kind: ViewAs["kind"]; name: string; roleName: string } | null;
}

const OWNER_ACCESS: PersonAccess = { roleKey: OWNER_ROLE, roleAccess: [], exceptions: [] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseViewAs(value: string | null | undefined): ViewAs | null {
  if (!value) return null;
  const [kind, key] = value.split(":");
  if (kind === "person" && key && UUID.test(key)) return { kind, id: key };
  if (kind === "role" && key && /^[a-z][a-z0-9_]{0,59}$/.test(key)) return { kind, key };
  return null;
}

export function viewAsValue(target: ViewAs): string {
  return target.kind === "person" ? `person:${target.id}` : `role:${target.key}`;
}

/** Reads one cookie out of a raw Cookie header. */
export function cookieFrom(header: string | null | undefined, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return decodeURIComponent(part.slice(at + 1).trim());
  }
  return undefined;
}

async function roleAccessFor(db: Db, roleKey: string): Promise<{ name: string; settings: AccessSetting[] } | null> {
  const { rows: roles } = await db.query<{ name: string }>(`select name from roles where key = $1`, [roleKey]);
  if (!roles[0]) return null;
  const { rows } = await db.query<{ target_kind: TargetKind; target_key: string; level: Level }>(
    `select target_kind, target_key, level from role_access where role_key = $1`,
    [roleKey],
  );
  return { name: roles[0].name, settings: rows.map((r) => ({ targetKind: r.target_kind, targetKey: r.target_key, level: r.level })) };
}

async function personByEmail(db: Db, email: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(`select id from people where email = $1 and active`, [email.trim().toLowerCase()]);
  return rows[0]?.id ?? null;
}

/**
 * The viewer behind a request. `unrestricted` is true while sign-in is off
 * (and for the test user outside production): that user is an Owner. A
 * signed-in email with no row in People opens nothing.
 */
export async function resolveViewer(
  db: Db,
  user: { email: string; unrestricted: boolean },
  viewAs: ViewAs | null,
): Promise<Viewer> {
  let real: PersonAccess | null = OWNER_ACCESS;
  if (!user.unrestricted) {
    const id = await personByEmail(db, user.email);
    real = id ? await readPersonAccess(db, id) : null;
  }
  const canViewAs = real?.roleKey === OWNER_ROLE;
  if (!canViewAs || !viewAs) return { access: real, canViewAs, viewingAs: null };

  if (viewAs.kind === "role") {
    const role = await roleAccessFor(db, viewAs.key);
    if (!role) return { access: real, canViewAs, viewingAs: null };
    return {
      access: { roleKey: viewAs.key, roleAccess: role.settings, exceptions: [] },
      canViewAs,
      viewingAs: { kind: "role", name: role.name, roleName: role.name },
    };
  }
  const { rows } = await db.query<{ name: string; role_name: string }>(
    `select p.name, r.name as role_name from people p join roles r on r.key = p.role_key where p.id = $1 and p.active`,
    [viewAs.id],
  );
  const access = rows[0] ? await readPersonAccess(db, viewAs.id) : null;
  if (!rows[0] || !access) return { access: real, canViewAs, viewingAs: null };
  return { access, canViewAs, viewingAs: { kind: "person", name: rows[0].name, roleName: rows[0].role_name } };
}

export function viewerLevel(viewer: Viewer, toolKey: string, today: string = isoDay()): Level {
  return viewer.access ? levelFor(viewer.access, toolKey, today) : "hidden";
}

/** The tools a viewer can open at all, for the rail. */
export function visibleToolKeys(viewer: Viewer, today: string = isoDay()): string[] {
  return TOOLS.filter((t) => viewerLevel(viewer, t.key, today) !== "hidden").map((t) => t.key);
}

// API areas that are not a tool's own href. Every other API path is matched
// to the tool whose href it starts with after /api.
const API_TOOLS: readonly [string, string][] = [
  ["/api/jobs", "projects"],
  ["/api/autodesk", "projects"],
];

/** The tool an app or API path belongs to, or null for a path no tool owns (Home, sign-in). */
export function toolForPath(path: string): string | null {
  for (const [prefix, key] of API_TOOLS) if (path === prefix || path.startsWith(`${prefix}/`)) return key;
  const appPath = path.startsWith("/api/") ? path.slice(4) : path;
  const matches = TOOLS.filter((t) => appPath === t.href || appPath.startsWith(`${t.href}/`));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.key ?? null;
}

/** Edit for a write, View for a read. */
export function levelNeeded(method: string): Level {
  return ["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase()) ? "view" : "edit";
}

const RANK: Record<Level, number> = { hidden: 0, view: 1, edit: 2 };

export function allows(have: Level, need: Level): boolean {
  return RANK[have] >= RANK[need];
}
