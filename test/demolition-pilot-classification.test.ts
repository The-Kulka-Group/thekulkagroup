import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "./database";

// LA-1157 (ADR 0006): the six demolition-pilot canonical items get an
// element, a buyout package, and a division, stated by Matt on 2026-09-26 in
// supabase/migrations/20260927160000_demolition_pilot_classification.sql.
// This reads them back the way By Scope, By Package and the Element parent
// box will, and holds the one-driver-per-element rule the migration adds.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

interface ClassificationRow {
  cost_code: string;
  element: string | null;
  buyout_package: string | null;
  division: string | null;
  is_element_driver: boolean;
}

async function classificationFor(costCode: string): Promise<ClassificationRow> {
  const { rows } = await db.query<ClassificationRow>(
    `select cost_code, element, buyout_package, division, is_element_driver
       from block_classification
      where cost_code = $1`,
    [costCode],
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

describe("demolition pilot classification (LA-1157)", () => {
  it("reads back the element, buyout package and division stated for each of the six items", async () => {
    const expected: Record<string, { element: string; buyoutPackage: string; division: string }> = {
      "1": { element: "Demolition", buyoutPackage: "Demolition", division: "02" },
      "1a": { element: "Demolition", buyoutPackage: "Demolition", division: "02" },
      "28a": { element: "Demolition", buyoutPackage: "Plumbing", division: "22" },
      "28b": { element: "Demolition", buyoutPackage: "Plumbing", division: "22" },
      "31f": { element: "Demolition", buyoutPackage: "Electrical", division: "26" },
      "36a": { element: "Demolition", buyoutPackage: "Site Work", division: "33" },
    };

    for (const [costCode, want] of Object.entries(expected)) {
      const row = await classificationFor(costCode);
      expect(row.element).toBe(want.element);
      expect(row.buyout_package).toBe(want.buyoutPackage);
      expect(row.division).toBe(want.division);
    }
  });

  it("marks Structure Demolition (1a) as the Demolition element's driver, and no other item", async () => {
    const drivers = await db.query<{ cost_code: string }>(
      `select cost_code from block_classification where element = 'Demolition' and is_element_driver`,
    );
    expect(drivers.rows).toEqual([{ cost_code: "1a" }]);

    const nonDrivers = ["1", "28a", "28b", "31f", "36a"];
    for (const costCode of nonDrivers) {
      const row = await classificationFor(costCode);
      expect(row.is_element_driver).toBe(false);
    }
  });

  it("refuses a second driver for an element that already has one", async () => {
    // A cost code '1a' does not already hold, so this fails only on the
    // one-driver-per-element index, not on cost_code's own uniqueness.
    await expect(
      db.query(
        `insert into block_classification
           (cost_code, detail_level, element, buyout_package, division, is_element_driver,
            stated_by, stated_on, reason)
         values
           ('TEST-SECOND-DEMOLITION-DRIVER', 1, 'Demolition', 'Demolition', '02', true,
            'automated test', date '2026-09-27', 'synthetic: a second Demolition driver should be refused')`,
      ),
    ).rejects.toThrow();
  });

  it("refuses a driver with no element", async () => {
    await expect(
      db.query(
        `insert into block_classification
           (cost_code, detail_level, element, buyout_package, division, is_element_driver,
            stated_by, stated_on, reason)
         values
           ('TEST-DRIVER-NO-ELEMENT', 1, null, 'Demolition', '02', true,
            'automated test', date '2026-09-27', 'synthetic: a driver with no element should be refused')`,
      ),
    ).rejects.toThrow();
  });
});
