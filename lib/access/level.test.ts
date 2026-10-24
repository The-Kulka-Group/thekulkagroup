import { describe, expect, it } from "vitest";

import { isoDay, levelFor, type PersonAccess } from "./level";

// LA-3045: the check order, an expired exception, an unknown tool, and the
// Owner floor. "rom" is Conceptual Budget in the Pre-Construction department.

const TODAY = "2026-10-24";

function access(over: Partial<PersonAccess> = {}): PersonAccess {
  return { roleKey: "estimator", roleAccess: [], exceptions: [], ...over };
}

describe("levelFor", () => {
  it("is Hidden when nothing says otherwise", () => {
    expect(levelFor(access(), "rom", TODAY)).toBe("hidden");
  });

  it("uses the role's department setting when the role has no tool setting", () => {
    const a = access({ roleAccess: [{ targetKind: "department", targetKey: "pre-construction", level: "view" }] });
    expect(levelFor(a, "rom", TODAY)).toBe("view");
    expect(levelFor(a, "estimating", TODAY)).toBe("view");
    expect(levelFor(a, "clients", TODAY)).toBe("hidden");
  });

  it("lets the role's tool setting beat its department setting", () => {
    const a = access({
      roleAccess: [
        { targetKind: "department", targetKey: "pre-construction", level: "view" },
        { targetKind: "tool", targetKey: "rom", level: "edit" },
      ],
    });
    expect(levelFor(a, "rom", TODAY)).toBe("edit");
    expect(levelFor(a, "estimating", TODAY)).toBe("view");
  });

  it("lets a person's department exception beat the role's tool setting", () => {
    const a = access({
      roleAccess: [{ targetKind: "tool", targetKey: "rom", level: "edit" }],
      exceptions: [{ targetKind: "department", targetKey: "pre-construction", level: "view", endsOn: null }],
    });
    expect(levelFor(a, "rom", TODAY)).toBe("view");
  });

  it("lets a person's tool exception beat everything else", () => {
    const a = access({
      roleAccess: [{ targetKind: "tool", targetKey: "projects", level: "view" }],
      exceptions: [
        { targetKind: "department", targetKey: "projects", level: "hidden", endsOn: null },
        { targetKind: "tool", targetKey: "projects", level: "edit", endsOn: null },
      ],
    });
    expect(levelFor(a, "projects", TODAY)).toBe("edit");
    expect(levelFor(a, "meetings", TODAY)).toBe("hidden");
  });

  it("applies an exception through its end day and drops it the day after", () => {
    const a = (endsOn: string) =>
      access({
        roleAccess: [{ targetKind: "tool", targetKey: "projects", level: "view" }],
        exceptions: [{ targetKind: "tool", targetKey: "projects", level: "edit", endsOn }],
      });
    expect(levelFor(a("2026-10-24"), "projects", TODAY)).toBe("edit");
    expect(levelFor(a("2026-10-23"), "projects", TODAY)).toBe("view");
  });

  it("hides a tool the catalog does not know, even from the Owner", () => {
    expect(levelFor(access({ roleAccess: [{ targetKind: "tool", targetKey: "nope", level: "edit" }] }), "nope", TODAY)).toBe("hidden");
    expect(levelFor(access({ roleKey: "owner" }), "nope", TODAY)).toBe("hidden");
  });

  it("gives the Owner Edit everywhere, whatever its rows or exceptions say", () => {
    const owner = access({
      roleKey: "owner",
      roleAccess: [{ targetKind: "tool", targetKey: "rom", level: "hidden" }],
      exceptions: [{ targetKind: "tool", targetKey: "rom", level: "view", endsOn: null }],
    });
    expect(levelFor(owner, "rom", TODAY)).toBe("edit");
    expect(levelFor(owner, "access", TODAY)).toBe("edit");
  });

  it("dates days on New York time", () => {
    expect(isoDay(new Date("2026-10-25T02:30:00Z"))).toBe("2026-10-24");
    expect(isoDay(new Date("2026-10-25T05:00:00Z"))).toBe("2026-10-25");
  });
});
