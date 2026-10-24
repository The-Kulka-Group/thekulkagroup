import { DEPARTMENTS, TOOLS, type Department, type Tool } from "@/lib/tools/catalog";

import { levelFor, OWNER_ROLE, type AccessSetting, type Level } from "./level";

// LA-3046. The Access Map: departments and their tools as rows, roles as
// columns. Pure, so the page and its tests build the same grid.

export interface GridRole {
  key: string;
  name: string;
}

export interface DepartmentCell {
  roleKey: string;
  /** The role's own setting for the whole department, or null for none. */
  set: Level | null;
  /** What the department shows: one level when every tool agrees, else mixed. */
  shown: Level | "mixed";
  locked: boolean;
}

export interface ToolCell {
  roleKey: string;
  /** The role's own setting for this tool, or null when it follows the department. */
  set: Level | null;
  /** The level the role gets on this tool. */
  shown: Level;
  /** True when the tool has its own setting that differs from its department's. */
  differs: boolean;
  locked: boolean;
}

export interface GridDepartment {
  department: Department;
  cells: DepartmentCell[];
  tools: { tool: Tool; cells: ToolCell[] }[];
}

const findSet = (settings: readonly AccessSetting[], kind: "department" | "tool", key: string) =>
  settings.find((s) => s.targetKind === kind && s.targetKey === key)?.level ?? null;

export function accessGrid(
  roles: readonly GridRole[],
  byRole: Record<string, readonly AccessSetting[]>,
  tools: readonly Tool[] = TOOLS,
  departments: readonly Department[] = DEPARTMENTS,
): GridDepartment[] {
  return departments
    .map((department) => {
      const deptTools = tools.filter((t) => t.department === department.key);
      const toolRows = deptTools.map((tool) => ({
        tool,
        cells: roles.map((role): ToolCell => {
          const settings = byRole[role.key] ?? [];
          const locked = role.key === OWNER_ROLE;
          const set = locked ? null : findSet(settings, "tool", tool.key);
          const deptLevel = findSet(settings, "department", department.key) ?? "hidden";
          return {
            roleKey: role.key,
            set,
            shown: levelFor({ roleKey: role.key, roleAccess: settings, exceptions: [] }, tool.key, undefined, tools),
            differs: set !== null && set !== deptLevel,
            locked,
          };
        }),
      }));
      const cells = roles.map((role, i): DepartmentCell => {
        const locked = role.key === OWNER_ROLE;
        const levels = new Set(toolRows.map((row) => row.cells[i].shown));
        return {
          roleKey: role.key,
          set: locked ? null : findSet(byRole[role.key] ?? [], "department", department.key),
          shown: levels.size === 1 ? [...levels][0] : "mixed",
          locked,
        };
      });
      return { department, cells, tools: toolRows };
    })
    .filter((row) => row.tools.length > 0);
}
