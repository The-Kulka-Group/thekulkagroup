import { describe, expect, it } from "vitest";

import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { parseGateAnswers, readProjectGateAnswers, saveProjectGateAnswers, SCOPE_QUESTIONS } from "./gates";

// LA-1028: the Scope module's server side. parseGateAnswers checks what a ROM
// request carries; readProjectGateAnswers reads a project's own defaults.

describe("parseGateAnswers", () => {
  it("accepts no gates at all", () => {
    expect(parseGateAnswers(undefined)).toEqual({ ok: true, gates: {} });
    expect(parseGateAnswers(null)).toEqual({ ok: true, gates: {} });
  });

  it("accepts an empty object, meaning every row was left blank", () => {
    expect(parseGateAnswers({})).toEqual({ ok: true, gates: {} });
  });

  it("accepts yes, no, and don't know", () => {
    const parsed = parseGateAnswers({ demolition: "yes", amenity_scope: "no", elevator: "dont_know" });
    expect(parsed).toEqual({
      ok: true,
      gates: { demolition: "yes", amenity_scope: "no", elevator: "dont_know" },
    });
  });

  it("refuses a value that is not yes, no, or don't know", () => {
    const parsed = parseGateAnswers({ demolition: "maybe" });
    expect(parsed.ok).toBe(false);
  });

  it("refuses anything that is not a plain object", () => {
    expect(parseGateAnswers("no").ok).toBe(false);
    expect(parseGateAnswers(["no"]).ok).toBe(false);
    expect(parseGateAnswers(3).ok).toBe(false);
  });
});

describe("readProjectGateAnswers", () => {
  it("returns nothing for a project nobody has asked", async () => {
    const db = await seededDatabase();
    try {
      expect(await readProjectGateAnswers(db, TEST_PROJECT_ID)).toEqual({});
    } finally {
      await db.close();
    }
  });

  it("reads every recorded answer, and only the recorded ones", async () => {
    const db = await seededDatabase();
    try {
      await db.query(
        `update projects
            set demolition_gate = 'no', elevator_gate = 'yes'
          where id = $1`,
        [TEST_PROJECT_ID],
      );

      expect(await readProjectGateAnswers(db, TEST_PROJECT_ID)).toEqual({
        demolition: "no",
        elevator: "yes",
      });
    } finally {
      await db.close();
    }
  });

  it("returns nothing for a project that does not exist", async () => {
    const db = await seededDatabase();
    try {
      expect(await readProjectGateAnswers(db, "00000000-0000-4000-8000-0000000000ff")).toEqual({});
    } finally {
      await db.close();
    }
  });
});

describe("saveProjectGateAnswers", () => {
  it("writes every answered section and clears every section left out", async () => {
    const db = await seededDatabase();
    try {
      await saveProjectGateAnswers(db, TEST_PROJECT_ID, { demolition: "no", elevator: "yes" });
      expect(await readProjectGateAnswers(db, TEST_PROJECT_ID)).toEqual({
        demolition: "no",
        elevator: "yes",
      });

      // A second save with a different set clears what the first one wrote,
      // because the panel always sends the full state of every row.
      await saveProjectGateAnswers(db, TEST_PROJECT_ID, { demolition: "yes" });
      expect(await readProjectGateAnswers(db, TEST_PROJECT_ID)).toEqual({ demolition: "yes" });
    } finally {
      await db.close();
    }
  });

  it("clears every section when the gates object is empty", async () => {
    const db = await seededDatabase();
    try {
      await saveProjectGateAnswers(db, TEST_PROJECT_ID, { demolition: "no" });
      await saveProjectGateAnswers(db, TEST_PROJECT_ID, {});
      expect(await readProjectGateAnswers(db, TEST_PROJECT_ID)).toEqual({});
    } finally {
      await db.close();
    }
  });
});

describe("SCOPE_QUESTIONS", () => {
  it("lists the nine yes/no scope questions LA-1028 asks for, parking excluded", () => {
    expect(SCOPE_QUESTIONS.map((q) => q.section)).toEqual([
      "demolition",
      "levels_below_grade",
      "existing_building_tie_in",
      "site_conditions",
      "amenity_scope",
      "elevator",
      "retail_storefronts",
      "balconies",
      "radio_amplifier",
    ]);
  });
});
