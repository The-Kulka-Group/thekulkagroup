import { type DerivedAssumption, effectiveValue, restsOnAssumedFact } from "@kulka/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  correctDerivedAssumption,
  InvalidDerivedAssumption,
  listDerivedAssumptions,
  restoreCorrection,
  revertDerivedAssumption,
  saveDerivedAssumption,
} from "@/lib/rom/derived-assumptions";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-860: supabase/migrations/20260927170000_derived_assumptions.sql. Derived
// assumptions live in their own table, apart from stated facts and benchmark
// lines, and a correction is recorded by who, when and why. Every figure is
// synthetic.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

function derived(over: Partial<DerivedAssumption> = {}): DerivedAssumption {
  return {
    kind: "derived_assumption",
    code: "T-1",
    label: "Insulation, Walls and Attic",
    value: { kind: "spec", text: "R-20 Walls, R-49 Attic" },
    method: "Synthetic table lookup",
    inputs: [
      { name: "Climate Zone", value: "4A", basis: "assumed" },
      { name: "Construction", value: "Wood Frame", basis: "stated" },
    ],
    steps: [
      { label: "Climate zone", result: "4A" },
      { label: "Wall minimum", result: "R-20" },
    ],
    confidence: "high",
    confidenceReason: "Synthetic: the table is exact.",
    costCodes: ["07-200"],
    correction: null,
    ...over,
  };
}

const jev = { model: "jev-test", confidence: 0.91 };

describe("derived_assumptions", () => {
  it("stores the record whole and reads it back, with the assumed fact still marked", async () => {
    const saved = await saveDerivedAssumption(db, TEST_PROJECT_ID, derived(), jev);
    const [read] = await listDerivedAssumptions(db, TEST_PROJECT_ID);

    expect(read).toEqual(saved);
    expect(read.value).toEqual({ kind: "spec", text: "R-20 Walls, R-49 Attic" });
    expect(read.inputs[0]).toEqual({ name: "Climate Zone", value: "4A", basis: "assumed" });
    expect(read.costCodes).toEqual(["07-200"]);
    expect(restsOnAssumedFact(read)).toBe(true);
  });

  it("keeps derived assumptions out of benchmarks", async () => {
    await saveDerivedAssumption(db, TEST_PROJECT_ID, derived(), jev);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from benchmarks`);
    expect(rows[0].n).toBe(1);
  });

  it("refuses a value that is neither a quantity nor a spec, and a row with no facts", async () => {
    const insert = (value: string, inputs: string) =>
      db.query(
        `insert into derived_assumptions
           (project_id, code, label, value, method, inputs, steps, confidence, confidence_reason, derived_by)
         values ($1, 'X-1', 'Synthetic', $2::jsonb, 'm', $3::jsonb, '[{"label":"a","result":"b"}]', 'high', 'r', 'test')`,
        [TEST_PROJECT_ID, value, inputs],
      );
    await expect(insert(`{"kind":"guess"}`, `[{"name":"a","value":"b","basis":"stated"}]`)).rejects.toThrow();
    await expect(insert(`{"kind":"spec","text":"x"}`, `[]`)).rejects.toThrow();
  });

  it("records a correction with who, when and why, and the correction wins", async () => {
    const saved = await saveDerivedAssumption(db, TEST_PROJECT_ID, derived(), jev);
    const corrected = await correctDerivedAssumption(
      db,
      saved.id,
      { value: { kind: "spec", text: "R-21 Walls, R-49 Attic" }, reason: "Synthetic: owner spec" },
      "estimator@kulka.invalid",
    );

    expect(corrected.correction).toMatchObject({
      value: { kind: "spec", text: "R-21 Walls, R-49 Attic" },
      reason: "Synthetic: owner spec",
      correctedBy: "estimator@kulka.invalid",
    });
    expect(Date.parse(corrected.correction!.correctedAt)).not.toBeNaN();
    expect(corrected.value).toEqual(saved.value);
    expect(effectiveValue(corrected)).toEqual({ kind: "spec", text: "R-21 Walls, R-49 Attic" });
  });

  it("refuses a correction without a reason", async () => {
    const saved = await saveDerivedAssumption(db, TEST_PROJECT_ID, derived(), jev);
    await expect(
      correctDerivedAssumption(db, saved.id, { value: { kind: "spec", text: "R-21" }, reason: " " }, "e@kulka.invalid"),
    ).rejects.toThrow(InvalidDerivedAssumption);
  });

  it("reverts to Jev's value, keeps the history, and Undo restores the correction", async () => {
    const saved = await saveDerivedAssumption(db, TEST_PROJECT_ID, derived(), jev);
    const corrected = await correctDerivedAssumption(
      db,
      saved.id,
      { value: { kind: "spec", text: "R-21" }, reason: "Synthetic" },
      "estimator@kulka.invalid",
    );
    const reverted = await revertDerivedAssumption(db, saved.id, "estimator@kulka.invalid");
    expect(reverted.correction).toBeNull();

    const { rows } = await db.query<{ reverted_by: string }>(
      `select reverted_by from derived_assumption_corrections where derived_assumption_id = $1`,
      [saved.id],
    );
    expect(rows).toEqual([{ reverted_by: "estimator@kulka.invalid" }]);

    const restored = await restoreCorrection(db, saved.id, corrected.correctionId!, "estimator@kulka.invalid");
    expect(restored.correction?.value).toEqual({ kind: "spec", text: "R-21" });
  });

  it("allows only one live correction per criterion", async () => {
    const saved = await saveDerivedAssumption(db, TEST_PROJECT_ID, derived(), jev);
    const insert = () =>
      db.query(
        `insert into derived_assumption_corrections (derived_assumption_id, value, reason, corrected_by)
         values ($1, '{"kind":"spec","text":"x"}', 'r', 'e')`,
        [saved.id],
      );
    await insert();
    await expect(insert()).rejects.toThrow();
  });

  it("keeps the estimator's correction when a fact change derives the criterion again", async () => {
    const saved = await saveDerivedAssumption(db, TEST_PROJECT_ID, derived(), jev);
    await correctDerivedAssumption(
      db,
      saved.id,
      { value: { kind: "spec", text: "R-21" }, reason: "Synthetic" },
      "estimator@kulka.invalid",
    );
    const again = await saveDerivedAssumption(
      db,
      TEST_PROJECT_ID,
      derived({ value: { kind: "spec", text: "R-30 Walls, R-60 Attic" } }),
      jev,
    );

    expect(again.id).toBe(saved.id);
    expect(again.value).toEqual({ kind: "spec", text: "R-30 Walls, R-60 Attic" });
    expect(effectiveValue(again)).toEqual({ kind: "spec", text: "R-21" });
  });
});
