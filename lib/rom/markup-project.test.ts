import { describe, expect, it } from "vitest";

import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { readProjectMarkupChoices, saveProjectMarkupChoices } from "./markup";

// LA-1109: the project's own saved Run settings markup choice, read back to
// prefill the panel. parseMarkupChoices (the wire-side check) has its own
// coverage in app/api/rom/route.test.ts.

describe("readProjectMarkupChoices / saveProjectMarkupChoices", () => {
  it("reads nothing for a project that has never saved a choice", async () => {
    const db = await seededDatabase();
    try {
      expect(await readProjectMarkupChoices(db, TEST_PROJECT_ID)).toBeNull();
    } finally {
      await db.close();
    }
  });

  it("round-trips a saved choice, staffing picks and all", async () => {
    const db = await seededDatabase();
    try {
      const choices = {
        setup: "gc_only" as const,
        method: "staffing_duration" as const,
        durationWeeks: 12,
        staff: [{ rateId: "00000000-0000-4000-8000-000000000099", weeks: 6 }],
        fieldOffice: [],
        feeRate: 0.04,
      };
      await saveProjectMarkupChoices(db, TEST_PROJECT_ID, choices);
      expect(await readProjectMarkupChoices(db, TEST_PROJECT_ID)).toEqual(choices);
    } finally {
      await db.close();
    }
  });

  it("overwrites a previously saved choice rather than merging with it", async () => {
    const db = await seededDatabase();
    try {
      await saveProjectMarkupChoices(db, TEST_PROJECT_ID, { setup: "both", method: "pct_of_subtotal", feeRate: 0.05 });
      await saveProjectMarkupChoices(db, TEST_PROJECT_ID, { setup: "gr_only", method: "usd_per_gsf" });
      expect(await readProjectMarkupChoices(db, TEST_PROJECT_ID)).toEqual({
        setup: "gr_only",
        method: "usd_per_gsf",
      });
    } finally {
      await db.close();
    }
  });
});
