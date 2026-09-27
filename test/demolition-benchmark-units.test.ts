import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "./database";

// LA-1156, ADR 0006: 20260927140000_demolition_benchmark_units.sql widens
// benchmarks.unit past the original usd_per_gsf and adds structure_type for
// item 1a's five per-structure-type rates. These tests exercise the column
// and its constraints directly. The seeded rates are read back in
// demolition-stated-rates.test.ts.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

async function insertBenchmark(
  overrides: Partial<{
    unit: string;
    structureType: string | null;
    provenanceKind: string;
    exportLabel: string | null;
  }> = {},
) {
  const {
    unit = "usd_per_gsf",
    structureType = null,
    provenanceKind = "reviewed_judgment",
    exportLabel = null,
  } = overrides;
  return db.query(
    `insert into benchmarks
       (cost_code, label, unit, value, project_type, construction_kind, comparable_count,
        structure_type, provenance_kind, provenance_export_label, provenance_recorded_by,
        provenance_recorded_at)
     values
       ('DEMO-TEST', 'Synthetic demolition line', $1, 1, 'multifamily', 'new', 0,
        $2, $3, $4, 'automated test', date '2026-09-27')`,
    [unit, structureType, provenanceKind, exportLabel],
  );
}

describe("benchmarks.unit (LA-1156)", () => {
  it("still accepts the original usd_per_gsf unit", async () => {
    await expect(insertBenchmark({ unit: "usd_per_gsf" })).resolves.toBeDefined();
  });

  it("accepts a lump sum, for Site Demolition", async () => {
    await expect(insertBenchmark({ unit: "usd_lump_sum" })).resolves.toBeDefined();
  });

  it("accepts a rate per square foot of structure, for Structure Demolition", async () => {
    await expect(
      insertBenchmark({ unit: "usd_per_sf_of_structure", structureType: "wood_frame_type_v" }),
    ).resolves.toBeDefined();
  });

  it("accepts a rate for each structure coming down, for the disconnects", async () => {
    await expect(insertBenchmark({ unit: "usd_each_structure" })).resolves.toBeDefined();
  });

  it("refuses a unit this ticket did not add", async () => {
    await expect(insertBenchmark({ unit: "usd_per_door" })).rejects.toThrow();
  });
});

describe("benchmarks.structure_type (LA-1156)", () => {
  it("accepts every one of the six structure types item 1a prices by", async () => {
    const types = [
      "wood_frame_type_v",
      "masonry_bearing_wall_type_iii",
      "pre_engineered_metal_or_light_steel",
      "steel_frame_concrete_metal_deck_type_ii",
      "cast_in_place_concrete_frame_type_i",
      "dont_know",
    ];
    for (const structureType of types) {
      await expect(
        insertBenchmark({ unit: "usd_per_sf_of_structure", structureType }),
      ).resolves.toBeDefined();
    }
  });

  it("refuses a structure type this ticket did not name", async () => {
    await expect(
      insertBenchmark({ unit: "usd_per_sf_of_structure", structureType: "log_cabin" }),
    ).rejects.toThrow();
  });

  it("stays null on an ordinary usd_per_gsf benchmark", async () => {
    // test/database.ts's own seeded "TEST" benchmark, unit usd_per_gsf,
    // predates this column and never sets it.
    const { rows } = await db.query<{ structure_type: string | null }>(
      `select structure_type from benchmarks where cost_code = 'TEST'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].structure_type).toBeNull();
  });

  it("refuses a structure type on a benchmark priced on any other unit", async () => {
    await expect(
      insertBenchmark({ unit: "usd_per_gsf", structureType: "wood_frame_type_v" }),
    ).rejects.toThrow();
    await expect(
      insertBenchmark({ unit: "usd_lump_sum", structureType: "wood_frame_type_v" }),
    ).rejects.toThrow();
    await expect(
      insertBenchmark({ unit: "usd_each_structure", structureType: "wood_frame_type_v" }),
    ).rejects.toThrow();
  });
});
