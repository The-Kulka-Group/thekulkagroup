import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { DEPARTMENTS, DIVISIONS, TOOLS, railGroups, toolByKey } from "./catalog";

// LA-3044: the one list of tools the rail and permissions both read.

function pageFor(href: string): string {
  return `app/(app)${href}/page.tsx`;
}

describe("tool catalog", () => {
  it("gives every tool, department and division a unique key", () => {
    for (const keys of [TOOLS.map((t) => t.key), DEPARTMENTS.map((d) => d.key), DIVISIONS.map((d) => d.key)]) {
      expect(new Set(keys).size).toBe(keys.length);
    }
    expect(new Set(TOOLS.map((t) => t.href)).size).toBe(TOOLS.length);
  });

  it("places every tool in a known department and every department in a known division", () => {
    const departments = new Set(DEPARTMENTS.map((d) => d.key));
    const divisions = new Set(DIVISIONS.map((d) => d.key));
    for (const tool of TOOLS) expect(departments).toContain(tool.department);
    for (const department of DEPARTMENTS) expect(divisions).toContain(department.division);
  });

  it("points every live tool at a page that exists", () => {
    for (const tool of TOOLS.filter((t) => t.live)) {
      expect(existsSync(pageFor(tool.href)), `${tool.key} -> ${pageFor(tool.href)}`).toBe(true);
    }
  });

  it("keeps the rail's sections and items in today's order", () => {
    expect(railGroups().map((g) => [g.department.label, g.tools.map((t) => t.label)])).toEqual([
      ["Sales and Marketing", ["Clients"]],
      ["Business Development", ["Vision"]],
      ["Projects", ["Projects", "Meetings"]],
      ["Pre-Construction", ["Conceptual Budget", "Estimating"]],
      ["Development", ["Underwriting"]],
      ["Kulka AI", ["Roadmap"]],
      ["Settings", ["People and Access"]],
    ]);
  });

  it("puts People and Access on the rail under Settings (LA-3046), and holds Data Sources until its page exists", () => {
    expect(toolByKey("access")).toMatchObject({ department: "settings", live: true, href: "/settings/access" });
    expect(toolByKey("sources")).toMatchObject({ department: "settings", live: false });
  });
});
