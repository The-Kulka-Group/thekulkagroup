import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readMarkupOptions } from "@/lib/rom/markup";
import { readParameterData } from "@/lib/rom/run";

import { seededDatabase } from "./database";

// LA-866: 20260927190000_engine_parameter_history.sql turns engine_parameters
// into a history. Every existing row stays as it was, a name can hold more
// than one row, and every reader takes the newest row per name.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

type Row = { name: string; value: string; provenance_recorded_by: string; reason: string };

async function append(name: string, value: number, createdAt: string, reason = "Synthetic test change.") {
  await db.query(
    `insert into engine_parameters
       (name, value, provenance_kind, provenance_recorded_by, provenance_recorded_at, reason, created_at)
     values ($1, $2, 'reviewed_judgment', 'automated test', date '2026-09-27', $3, $4::timestamptz)`,
    [name, value, reason, createdAt],
  );
}

describe("engine_parameters as a history (LA-866)", () => {
  it("keeps every existing row, unchanged, as the first entry of its name", async () => {
    const { rows } = await db.query<Row>(
      `select name, value, provenance_recorded_by, reason from engine_parameters order by name`,
    );
    expect(rows.map((r) => [r.name, Number(r.value)])).toEqual([
      ["confidence.exclude_at_or_below", 1],
      ["fee.rate", 0.0325],
      ["flag.high_min_comparables", 5],
      ["flag.medium_min_comparables", 2],
      ["insurance.rate", 0.054],
      ["spread.high", 0.1],
      ["spread.low", 0.35],
      ["spread.medium", 0.2],
      ["weight.actuals", 5],
      ["weight.llm_proposal", 0.5],
      ["weight.proest_budget", 1],
      ["weight.reviewed_judgment", 2],
    ]);
    const { rows: current } = await db.query<Row>(
      `select name, value from engine_parameters_current order by name`,
    );
    expect(current.map((r) => [r.name, Number(r.value)])).toEqual(rows.map((r) => [r.name, Number(r.value)]));
  });

  it("lets a name hold a second row, and reads the newest as current", async () => {
    await append("spread.high", 0.12, "2099-01-01T00:00:00Z");

    const { rows: all } = await db.query<Row>(`select value from engine_parameters where name = 'spread.high'`);
    expect(all.map((r) => Number(r.value)).sort()).toEqual([0.1, 0.12]);

    const { rows } = await db.query<Row>(`select value from engine_parameters_current where name = 'spread.high'`);
    expect(rows.map((r) => Number(r.value))).toEqual([0.12]);
  });

  it("does not let an older row become current by arriving later", async () => {
    await append("spread.high", 0.12, "2099-01-01T00:00:00Z");
    await append("spread.high", 0.15, "2000-01-01T00:00:00Z");

    const { rows } = await db.query<Row>(`select value from engine_parameters_current where name = 'spread.high'`);
    expect(Number(rows[0].value)).toBe(0.12);
  });

  it("still refuses a row with no reason", async () => {
    await expect(append("spread.high", 0.12, "2099-01-01T00:00:00Z", "  ")).rejects.toThrow();
  });

  it("feeds a run the newest value of each name, with that row's provenance", async () => {
    await append("weight.actuals", 6, "2099-01-01T00:00:00Z", "Newer synthetic value.");

    const { parameters } = await readParameterData(db);
    expect(parameters["weight.actuals"]?.value).toBe(6);
    expect(parameters["weight.actuals"]?.provenance.reason).toBe("Newer synthetic value.");
    expect(parameters["weight.proest_budget"]?.value).toBe(1);
    expect(Object.keys(parameters)).toHaveLength(12);
  });

  it("feeds the Markups defaults the newest fee and insurance", async () => {
    await append("fee.rate", 0.04, "2099-01-01T00:00:00Z");

    const options = await readMarkupOptions(db);
    expect(options.feeRate?.value).toBe(0.04);
    expect(options.insuranceRate?.value).toBe(0.054);
  });
});
