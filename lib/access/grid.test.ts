import { describe, expect, it } from "vitest";

import { accessGrid } from "./grid";

// LA-3046: the Access Map's rows and cells.

const ROLES = [
  { key: "owner", name: "Owner" },
  { key: "estimator", name: "Estimator" },
];

function preCon(byRole: Parameters<typeof accessGrid>[1]) {
  return accessGrid(ROLES, byRole).find((d) => d.department.key === "pre-construction")!;
}

describe("accessGrid", () => {
  it("groups every catalog tool under its department, in catalog order", () => {
    const grid = accessGrid(ROLES, {});
    expect(grid.map((d) => d.department.label)).toEqual([
      "Sales and Marketing", "Business Development", "Projects", "Pre-Construction", "Development", "Kulka AI", "Settings",
    ]);
    expect(preCon({}).tools.map((t) => t.tool.label)).toEqual(["Conceptual Budget", "Estimating"]);
  });

  it("locks the Owner column at Edit", () => {
    const row = preCon({ owner: [{ targetKind: "tool", targetKey: "rom", level: "hidden" }] });
    expect(row.cells[0]).toMatchObject({ locked: true, shown: "edit", set: null });
    expect(row.tools[0].cells[0]).toMatchObject({ locked: true, shown: "edit", set: null, differs: false });
  });

  it("shows a department setting on the department and on every tool that follows it", () => {
    const row = preCon({ estimator: [{ targetKind: "department", targetKey: "pre-construction", level: "view" }] });
    expect(row.cells[1]).toMatchObject({ set: "view", shown: "view" });
    expect(row.tools.map((t) => t.cells[1])).toEqual([
      { roleKey: "estimator", set: null, shown: "view", differs: false, locked: false },
      { roleKey: "estimator", set: null, shown: "view", differs: false, locked: false },
    ]);
  });

  it("marks a tool that differs from its department, and shows the department as mixed", () => {
    const row = preCon({
      estimator: [
        { targetKind: "department", targetKey: "pre-construction", level: "view" },
        { targetKind: "tool", targetKey: "rom", level: "edit" },
      ],
    });
    expect(row.cells[1]).toMatchObject({ set: "view", shown: "mixed" });
    expect(row.tools[0].cells[1]).toMatchObject({ set: "edit", shown: "edit", differs: true });
    expect(row.tools[1].cells[1]).toMatchObject({ set: null, shown: "view", differs: false });
  });

  it("does not mark a tool setting that matches its department", () => {
    const row = preCon({
      estimator: [
        { targetKind: "department", targetKey: "pre-construction", level: "edit" },
        { targetKind: "tool", targetKey: "rom", level: "edit" },
      ],
    });
    expect(row.tools[0].cells[1].differs).toBe(false);
    expect(row.cells[1].shown).toBe("edit");
  });

  it("treats a tool setting with no department setting as differing from Hidden", () => {
    const row = preCon({ estimator: [{ targetKind: "tool", targetKey: "estimating", level: "view" }] });
    expect(row.tools[1].cells[1]).toMatchObject({ shown: "view", differs: true });
    expect(row.cells[1]).toMatchObject({ set: null, shown: "mixed" });
  });
});
