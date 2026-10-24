import { TOOLS, type Tool } from "@/lib/tools/catalog";

// LA-3045: one answer to "what can this person do with this tool". Pure, so
// the page guard, the menu and View As (LA-3047) all get the same answer from
// the same rows. The order is Matt's (LA-3043): the person's exception, then
// the role's setting for the tool, then the role's setting for the tool's
// department, then Hidden. A tool exception beats a department exception.

export type Level = "hidden" | "view" | "edit";

export type TargetKind = "department" | "tool";

export const OWNER_ROLE = "owner";

export interface AccessSetting {
  targetKind: TargetKind;
  targetKey: string;
  level: Level;
}

export interface AccessException extends AccessSetting {
  /** The last day it applies, as YYYY-MM-DD. Null for no end. */
  endsOn: string | null;
}

export interface PersonAccess {
  roleKey: string;
  roleAccess: readonly AccessSetting[];
  exceptions: readonly AccessException[];
}

/**
 * Today's date as YYYY-MM-DD on Kulka's clock (New York), the form `endsOn`
 * is stored in, so an exception ending Friday lasts until Friday night there.
 */
export function isoDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

function find<T extends AccessSetting>(settings: readonly T[], kind: TargetKind, key: string): T | undefined {
  return settings.find((s) => s.targetKind === kind && s.targetKey === key);
}

/**
 * The person's level for `toolKey` on `today` (YYYY-MM-DD). An exception
 * applies through its `endsOn` day. A tool the catalog does not know is
 * Hidden, even to the Owner, so a typo can never open a page.
 */
export function levelFor(
  access: PersonAccess,
  toolKey: string,
  today: string = isoDay(),
  tools: readonly Tool[] = TOOLS,
): Level {
  const tool = tools.find((t) => t.key === toolKey);
  if (!tool) return "hidden";
  if (access.roleKey === OWNER_ROLE) return "edit";

  const live = access.exceptions.filter((e) => e.endsOn === null || e.endsOn >= today);
  return (
    find(live, "tool", tool.key)?.level ??
    find(live, "department", tool.department)?.level ??
    find(access.roleAccess, "tool", tool.key)?.level ??
    find(access.roleAccess, "department", tool.department)?.level ??
    "hidden"
  );
}
