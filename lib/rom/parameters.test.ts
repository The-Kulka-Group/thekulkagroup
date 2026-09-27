import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { OPEN_ACCESS_USER } from "@/lib/auth/server";
import { seededDatabase, TEST_PROJECT_ID } from "@/test/database";

import {
  ParameterChangeRefused,
  readImpactData,
  readParameterHistory,
  recordedByFor,
  saveParameterChange,
  todayInNewYork,
} from "./parameters";
import { runRom } from "./run";

// LA-866: the save path behind the Engine Parameters screen. Every value here
// is a synthetic test figure.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

const WHO = "tester@kulka.invalid";
const TODAY = "2026-09-27";

async function rowCount(): Promise<number> {
  const { rows } = await db.query<{ n: string }>(`select count(*) as n from engine_parameters`);
  return Number(rows[0].n);
}

async function snapshotTable() {
  const { rows } = await db.query(`select * from engine_parameters order by id`);
  return rows;
}

describe("saveParameterChange", () => {
  it("writes one reviewed_judgment row per changed name, with the same reason, person and date", async () => {
    const before = await snapshotTable();
    const { saved } = await saveParameterChange(db, {
      values: { "weight.llm_proposal": 0.25, "spread.high": 0.12 },
      reason: "  Synthetic reason for a test.  ",
      recordedBy: WHO,
      recordedAt: TODAY,
    });

    expect(saved.map((s) => [s.name, s.value])).toEqual([
      ["weight.llm_proposal", 0.25],
      ["spread.high", 0.12],
    ]);
    for (const entry of saved) {
      expect(entry.provenance).toEqual({
        kind: "reviewed_judgment",
        recordedBy: WHO,
        recordedAt: TODAY,
        reason: "Synthetic reason for a test.",
      });
    }
    expect(await rowCount()).toBe(before.length + 2);

    // Nothing that was there is touched.
    const after = await snapshotTable();
    for (const row of before) expect(after).toContainEqual(row);
  });

  it("makes the saved value current and keeps the old one readable", async () => {
    await saveParameterChange(db, {
      values: { "spread.high": 0.12 },
      reason: "Synthetic.",
      recordedBy: WHO,
      recordedAt: TODAY,
    });
    const history = (await readParameterHistory(db)).filter((h) => h.name === "spread.high");
    expect(history.map((h) => h.value)).toEqual([0.12, 0.1]);
    expect(history[1].provenance.recordedBy).toBe("Matt Nicosia");
  });

  it("refuses a change with no reason, writing nothing", async () => {
    const count = await rowCount();
    for (const reason of ["", "   "]) {
      await expect(
        saveParameterChange(db, { values: { "spread.high": 0.12 }, reason, recordedBy: WHO, recordedAt: TODAY }),
      ).rejects.toThrow(ParameterChangeRefused);
    }
    expect(await rowCount()).toBe(count);
  });

  it("refuses a set the engine would refuse, naming each problem, and writes nothing", async () => {
    const count = await rowCount();
    const refused = [
      { values: { "flag.high_min_comparables": 1 }, name: "flag.high_min_comparables" },
      { values: { "spread.medium": 0.05 }, name: "spread.medium" },
      { values: { "spread.low": 1.2 }, name: "spread.low" },
      { values: { "weight.actuals": 0 }, name: "weight.actuals" },
      { values: { "weight.proest_budget": -1 }, name: "weight.proest_budget" },
      { values: { "fee.rate": 1 }, name: "fee.rate" },
    ] as const;
    for (const { values, name } of refused) {
      const error = await saveParameterChange(db, { values, reason: "Synthetic.", recordedBy: WHO, recordedAt: TODAY }).catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ParameterChangeRefused);
      expect((error as ParameterChangeRefused).problems.map((p) => p.name)).toContain(name);
    }
    expect(await rowCount()).toBe(count);
  });

  it("checks the whole set, so two values valid alone but not together are refused", async () => {
    await expect(
      saveParameterChange(db, {
        values: { "spread.high": 0.25 },
        reason: "Synthetic.",
        recordedBy: WHO,
        recordedAt: TODAY,
      }),
    ).rejects.toThrow(ParameterChangeRefused);
    const { saved } = await saveParameterChange(db, {
      values: { "spread.high": 0.25, "spread.medium": 0.3 },
      reason: "Synthetic.",
      recordedBy: WHO,
      recordedAt: TODAY,
    });
    expect(saved).toHaveLength(2);
  });

  it("refuses a name the engine does not read and a change that changes nothing", async () => {
    await expect(
      saveParameterChange(db, {
        values: { "weight.nothing": 1 } as never,
        reason: "Synthetic.",
        recordedBy: WHO,
        recordedAt: TODAY,
      }),
    ).rejects.toThrow(/no parameter named weight\.nothing/);
    await expect(
      saveParameterChange(db, { values: { "spread.high": 0.1 }, reason: "Synthetic.", recordedBy: WHO, recordedAt: TODAY }),
    ).rejects.toThrow(/Nothing changed/);
  });

  it("writes only the names whose value moved", async () => {
    const { saved } = await saveParameterChange(db, {
      values: { "spread.high": 0.1, "spread.medium": 0.22 },
      reason: "Synthetic.",
      recordedBy: WHO,
      recordedAt: TODAY,
    });
    expect(saved.map((s) => s.name)).toEqual(["spread.medium"]);
  });
});

describe("the next ROM run", () => {
  it("reads the changed value and carries it on its run record", async () => {
    await saveParameterChange(db, {
      values: { "weight.reviewed_judgment": 3 },
      reason: "Synthetic change for a run test.",
      recordedBy: WHO,
      recordedAt: TODAY,
    });

    const { runId, rom } = await runRom(db, TEST_PROJECT_ID);
    expect(rom.parameters["weight.reviewed_judgment"]).toEqual({
      value: 3,
      provenance: {
        kind: "reviewed_judgment",
        recordedBy: WHO,
        recordedAt: TODAY,
        reason: "Synthetic change for a run test.",
      },
    });
    expect(rom.lines[0].comparables[0].weight).toBe(3);

    const { rows } = await db.query<{ rom: { parameters: Record<string, { value: number }> } }>(
      `select rom from runs where id = $1`,
      [runId],
    );
    expect(rows[0].rom.parameters["weight.reviewed_judgment"].value).toBe(3);
  });

  it("leaves a run saved before the change reading the value it used", async () => {
    const { runId } = await runRom(db, TEST_PROJECT_ID);
    await saveParameterChange(db, {
      values: { "weight.reviewed_judgment": 3 },
      reason: "Synthetic.",
      recordedBy: WHO,
      recordedAt: TODAY,
    });
    const { rows } = await db.query<{ rom: { parameters: Record<string, { value: number }> } }>(
      `select rom from runs where id = $1`,
      [runId],
    );
    expect(rows[0].rom.parameters["weight.reviewed_judgment"].value).toBe(2);
  });
});

describe("readImpactData", () => {
  it("returns nothing when no run has finished", async () => {
    expect(await readImpactData(db)).toEqual({ runs: [], snapshots: {} });
  });

  it("returns the newest finished run's answers and today's data without parameters", async () => {
    await runRom(db, TEST_PROJECT_ID);
    const { runId: newest } = await runRom(db, TEST_PROJECT_ID);

    const impact = await readImpactData(db);
    expect(impact.runs).toHaveLength(1);
    expect(impact.runs[0]).toMatchObject({
      runId: newest,
      projectName: "Synthetic test project",
      grossSquareFeet: 1000,
      snapshotKey: "multifamily/new/trade",
    });
    const snapshot = impact.snapshots["multifamily/new/trade"];
    expect(snapshot.benchmarks.map((b) => b.costCode)).toEqual(["TEST"]);
    expect("parameters" in snapshot).toBe(false);
  });
});

describe("who and when", () => {
  it("records open-access while sign-in is off, and the email otherwise", () => {
    expect(recordedByFor(OPEN_ACCESS_USER)).toBe("open-access");
    expect(recordedByFor({ id: "u1", email: "estimator@kulka.invalid" })).toBe("estimator@kulka.invalid");
  });

  it("dates a change in New York, not UTC", () => {
    expect(todayInNewYork(new Date("2026-09-28T02:00:00Z"))).toBe("2026-09-27");
    expect(todayInNewYork(new Date("2026-09-28T12:00:00Z"))).toBe("2026-09-28");
  });
});
