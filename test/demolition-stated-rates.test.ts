import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runRom } from "@/lib/rom/run";

import { seededDatabase, TEST_PROJECT_ID } from "./database";

// LA-1156: 20260927150000_demolition_stated_rates.sql records Matt's five
// Structure Demolition rates and Jefferson's Ferry's Site Demolition lump sum.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase({ statedRates: true });
});

afterEach(async () => {
  await db.close();
});

describe("demolition stated rates (LA-1156)", () => {
  it("records the five Structure Demolition rates for multifamily new and renovation", async () => {
    const { rows } = await db.query<{
      structure_type: string;
      value: string;
      construction_kind: string;
      unit: string;
      provenance_kind: string;
      provenance_recorded_by: string;
    }>(
      `select structure_type, value::text, construction_kind, unit, provenance_kind,
              provenance_recorded_by
         from benchmarks
        where cost_code = '1a'
        order by construction_kind, benchmarks.value`,
    );
    const rates = (kind: string) =>
      rows
        .filter((r) => r.construction_kind === kind)
        .map((r) => [r.structure_type, Number(r.value)]);
    const expected = [
      ["pre_engineered_metal_or_light_steel", 5.5],
      ["wood_frame_type_v", 6.6],
      ["masonry_bearing_wall_type_iii", 9.9],
      ["steel_frame_concrete_metal_deck_type_ii", 13.2],
      ["cast_in_place_concrete_frame_type_i", 19.8],
    ];
    expect(rates("new")).toEqual(expected);
    expect(rates("renovation")).toEqual(expected);
    for (const row of rows) {
      expect(row.unit).toBe("usd_per_sf_of_structure");
      expect(row.provenance_kind).toBe("reviewed_judgment");
      expect(row.provenance_recorded_by).toBe("Matt Nicosia");
    }
  });

  it("records Site Demolition as a $25,000 lump sum from Jefferson's Ferry", async () => {
    const { rows } = await db.query<{
      value: string;
      unit: string;
      provenance_kind: string;
      provenance_export_label: string;
    }>(
      `select value::text, unit, provenance_kind, provenance_export_label
         from benchmarks
        where cost_code = '1'
        order by construction_kind`,
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Number(row.value)).toBe(25000);
      expect(row.unit).toBe("usd_lump_sum");
      expect(row.provenance_kind).toBe("actuals");
      expect(row.provenance_export_label).toContain("C00456");
    }
  });

  it("seeds no demolition rate for self-storage", async () => {
    const { rows } = await db.query(
      `select 1 from benchmarks
        where cost_code in ('1', '1a') and project_type = 'self_storage'`,
    );
    expect(rows).toHaveLength(0);
  });

  it("prices Site Demolition once, whatever the project's size, when a run leaves demolition unanswered", async () => {
    // CONTEXT.md and ADR 0006: a run prices silence as assumed present. The
    // guided New Budget flow requires the question, so its runs never do.
    const { rom } = await runRom(db, TEST_PROJECT_ID);
    const site = rom.lines.find((line) => line.costCode === "1")!;
    expect((site.low + site.high) / 2).toBe(25000);
    expect(rom.lines.some((line) => line.costCode === "1a")).toBe(false);
  });

  it("prices nothing for demolition when demolition is answered no", async () => {
    const { rom } = await runRom(db, TEST_PROJECT_ID, undefined, undefined, { demolition: "no" });
    const site = rom.lines.find((line) => line.costCode === "1")!;
    expect([site.low, site.high]).toEqual([0, 0]);
    expect(rom.lines.some((line) => line.costCode === "1a")).toBe(false);
  });
});
