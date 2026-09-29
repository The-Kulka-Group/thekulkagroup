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

  it("round-trips a saved choice, resource plan and all", async () => {
    const db = await seededDatabase();
    try {
      const choices = {
        setup: "gc_only" as const,
        method: "allocated_resources" as const,
        resourcePlan: {
          schedule: {
            precon: { value: 4, origin: "estimator" as const },
            construction: { value: 60, origin: "estimator" as const },
            closeout: { value: 4, origin: "estimator" as const },
          },
          confidence: "high" as const,
          lines: [
            {
              id: "line-1",
              label: "Permits",
              group: "General Expenses",
              basis: "lump_sum" as const,
              quantity: { value: 1, origin: "estimator" as const },
              rate: { value: 5000, origin: "estimator" as const },
            },
          ],
        },
        feeRate: 0.04,
      };
      await saveProjectMarkupChoices(db, TEST_PROJECT_ID, choices);
      expect(await readProjectMarkupChoices(db, TEST_PROJECT_ID)).toEqual(choices);
    } finally {
      await db.close();
    }
  });

  it("opens a choice saved under Staffing and Duration as the equivalent plan, without rewriting the row", async () => {
    const db = await seededDatabase();
    try {
      const { rows } = await db.query<{ id: string }>(
        `select id from gc_staffing_rates where role = 'Project Manager' and days_per_week = 5`,
      );
      const saved = {
        setup: "both",
        method: "staffing_duration",
        durationWeeks: 12,
        staff: [{ rateId: rows[0].id }],
        fieldOffice: [],
        feeRate: 0.04,
      };
      await db.query(`update projects set markup_choices = $2 where id = $1`, [TEST_PROJECT_ID, JSON.stringify(saved)]);

      const opened = await readProjectMarkupChoices(db, TEST_PROJECT_ID);
      expect(opened).toMatchObject({ setup: "both", method: "allocated_resources", feeRate: 0.04 });
      expect(opened?.resourcePlan?.schedule.construction.value).toBe(12);
      expect(opened?.resourcePlan?.lines).toEqual([
        {
          id: rows[0].id,
          label: "Project Manager",
          group: "Staff",
          basis: "time",
          per: "day",
          daysPerWeek: { value: 5, origin: "rate_card", ref: rows[0].id, source: "C-00379" },
          phases: ["construction"],
          quantity: { value: 1, origin: "estimator" },
          rate: { value: 1040, origin: "rate_card", ref: rows[0].id, source: "C-00379" },
        },
      ]);

      const { rows: stored } = await db.query<{ markup_choices: unknown }>(
        `select markup_choices from projects where id = $1`,
        [TEST_PROJECT_ID],
      );
      expect(stored[0].markup_choices).toEqual(saved);
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
