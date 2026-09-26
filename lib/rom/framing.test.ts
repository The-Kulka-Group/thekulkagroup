import { describe, expect, it } from "vitest";

import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { parseFramingSystem, readProjectFramingSystem, saveProjectFramingSystem } from "./framing";

// LA-1103 checks the framing choice a ROM request carries; LA-1109 adds
// writing the Run settings choice back onto the project.

describe("parseFramingSystem", () => {
  it("undefined reads the project's own column, null clears it for this run", () => {
    expect(parseFramingSystem(undefined)).toEqual({ ok: true, framing: undefined });
    expect(parseFramingSystem(null)).toEqual({ ok: true, framing: null });
  });

  it("accepts wood and metal", () => {
    expect(parseFramingSystem("wood")).toEqual({ ok: true, framing: "wood" });
    expect(parseFramingSystem("metal")).toEqual({ ok: true, framing: "metal" });
  });

  it("refuses anything else", () => {
    expect(parseFramingSystem("concrete").ok).toBe(false);
  });
});

describe("saveProjectFramingSystem", () => {
  it("writes the choice, and null clears a previously recorded one", async () => {
    const db = await seededDatabase();
    try {
      await saveProjectFramingSystem(db, TEST_PROJECT_ID, "metal");
      expect(await readProjectFramingSystem(db, TEST_PROJECT_ID)).toBe("metal");

      await saveProjectFramingSystem(db, TEST_PROJECT_ID, null);
      expect(await readProjectFramingSystem(db, TEST_PROJECT_ID)).toBeNull();
    } finally {
      await db.close();
    }
  });
});
