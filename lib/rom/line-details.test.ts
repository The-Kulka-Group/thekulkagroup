import type { BlockClassification, DerivedAssumption, Rom, RomLine } from "@kulka/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { presentBudget } from "@/lib/rom/presentation";
import { publishBudget } from "@/lib/rom/published-budgets";
import type { PublishedBudgetSnapshot } from "@/lib/rom/published-snapshot";
import { readClassifications, runRom } from "@/lib/rom/run";
import fixture from "@/test/fixtures/published-budget-mn4.json";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { describeRom, lineDivision, raisedByFor, subItemsOf, type StoredScopeEntry } from "./line-details";

// LA-1502: the drill-down's run-level fields. A line's division, its
// Inclusions and Exclusions, and the owner items that would firm it up.

const MN4 = (fixture as unknown as { snapshot: PublishedBudgetSnapshot }).snapshot;

function classification(costCode: string, over: Partial<BlockClassification> = {}): BlockClassification {
  return {
    costCode,
    detailLevel: 2,
    element: null,
    breakoutOfCostCode: null,
    buyoutPackage: null,
    division: null,
    statedBy: "automated test",
    statedOn: "2026-10-02",
    reason: "synthetic",
    ...over,
  };
}

function romLine(costCode: string, over: Partial<RomLine> = {}): RomLine {
  return {
    costCode,
    label: `Line ${costCode}`,
    low: 90,
    high: 110,
    confidence: "low",
    heldForReview: true,
    comparableCount: 1,
    comparables: [],
    judgmentAdjustments: [],
    scopeSide: "building",
    contractSide: "kulka",
    detailLevel: null,
    element: null,
    breakoutOf: null,
    buyoutPackage: null,
    gateStatus: null,
    inputs: [],
    ...over,
  };
}

function criterion(code: string, costCodes: string[], confidence: "high" | "low"): DerivedAssumption {
  return {
    kind: "derived_assumption",
    code,
    label: `Criterion ${code}`,
    value: { kind: "spec", text: "synthetic" },
    method: "synthetic",
    inputs: [],
    steps: [],
    confidence,
    confidenceReason: "synthetic",
    costCodes,
    correction: null,
  };
}

function entry(costCode: string, side: "include" | "exclude", text: string, over: Partial<StoredScopeEntry> = {}): StoredScopeEntry {
  return {
    id: `${costCode}-${side}-${text}`,
    costCode,
    side,
    position: 0,
    text,
    drafter: "ai",
    draftedBy: "devin@example.com",
    draftedAt: "2026-10-02T12:00:00.000Z",
    approvedBy: "devin@example.com",
    approvedAt: "2026-10-02T13:00:00.000Z",
    ...over,
  };
}

describe("lineDivision", () => {
  const byCode = (rows: BlockClassification[]) => new Map(rows.map((c) => [c.costCode, c]));
  const canonical = new Map([
    ["28", "22"],
    ["31", "26"],
  ]);

  it("files a line under Matt's placement first, then its stated division, then its canonical item", () => {
    const stated = byCode([classification("28a", { division: "22", ledgerDivision: "33" }), classification("26c", { division: "05" })]);
    expect(lineDivision("28a", stated, canonical)).toBe("33");
    expect(lineDivision("26c", stated, canonical)).toBe("05");
    expect(lineDivision("28", stated, canonical)).toBe("22");
  });

  it("reads a benchmark code's own division and leaves an unknown item number without one", () => {
    expect(lineDivision("09-900", new Map(), canonical)).toBe("09");
    expect(lineDivision("99", new Map(), canonical)).toBeNull();
  });

  it("files a breakout with no division of its own under its parent's", () => {
    const stated = byCode([classification("28x", { breakoutOfCostCode: "28" })]);
    expect(lineDivision("28x", stated, canonical)).toBe("22");
  });
});

describe("raisedByFor", () => {
  const criteria = [criterion("S-1", ["2", "34a"], "low"), criterion("A-1", ["2"], "high")];

  it("lists a question the line prices on that is unanswered or Don't Know, then each planning assumption naming it", () => {
    const line = romLine("34a", { inputs: ["grossSquareFeet", "site_conditions", "storiesAboveGrade"] });
    const answers = { grossSquareFeet: 64000, facts: { site_conditions: "dont_know" } };
    expect(raisedByFor(line, answers, criteria)).toEqual([
      { kind: "question", key: "site_conditions" },
      { kind: "question", key: "storiesAboveGrade" },
      { kind: "criterion", code: "S-1" },
    ]);
  });

  it("leaves out a settled criterion, an answered question, and a fact a criterion sets", () => {
    const line = romLine("2", { inputs: ["elevatorType", "grossSquareFeet"] });
    expect(raisedByFor(line, { grossSquareFeet: 64000, facts: {} }, criteria)).toEqual([{ kind: "criterion", code: "S-1" }]);
  });

  it("lists nothing for a line at High or a line out of the job", () => {
    expect(raisedByFor(romLine("2", { confidence: "high" }), {}, criteria)).toEqual([]);
    expect(raisedByFor(romLine("2", { gateStatus: "not_in_job" }), {}, criteria)).toEqual([]);
  });

  it("carries no count, job name or target mark, only what the item is", () => {
    const line = romLine("34a", { inputs: ["site_conditions"] });
    for (const item of raisedByFor(line, { facts: { site_conditions: "dont_know" } }, criteria)) {
      expect(Object.keys(item).sort()).toEqual(item.kind === "question" ? ["key", "kind"] : ["code", "kind"]);
    }
  });

  it("names on MN Test #4 the criteria the frames tie to Conveying Equipment and Earthwork", () => {
    const answers = MN4.answers;
    const at = (costCode: string, inputs: string[]) => {
      const line = MN4.rom.lines.find((l) => l.costCode === costCode)!;
      return raisedByFor({ ...line, inputs }, answers, MN4.criteria);
    };
    expect(at("26", ["elevatorCount", "elevatorType", "levels_below_grade", "storiesAboveGrade"])).toEqual([
      { kind: "criterion", code: "V-1" },
      { kind: "criterion", code: "V-2" },
    ]);
    expect(at("34a", ["grossSquareFeet", "site_conditions"])).toEqual([
      { kind: "question", key: "site_conditions" },
      { kind: "criterion", code: "S-1" },
    ]);
    // M-1 is settled, so only M-0 is left on HVAC. Elevator Bulkhead is High.
    expect(at("30", ["grossSquareFeet"])).toEqual([{ kind: "criterion", code: "M-0" }]);
    expect(at("26a", ["elevatorCount"])).toEqual([]);
  });
});

describe("describeRom", () => {
  const rom: Rom = {
    ...MN4.rom,
    lines: [romLine("28"), romLine("28x", { breakoutOf: "28" })],
    unpricedItems: [{ costCode: "28a", label: "Plumbing Disconnect and Cap", driverCostCode: "1a" }],
  };
  const context = {
    classifications: [classification("28a", { division: "22", ledgerDivision: "33", element: "Demolition" }), classification("28x", { breakoutOfCostCode: "28" })],
    canonicalDivisions: new Map([["28", "22"]]),
    answers: {},
    criteria: [],
    scopeEntries: [
      entry("28", "include", "Second", { position: 1 }),
      entry("28", "include", "First", { position: 0, approvedBy: null, approvedAt: null }),
      entry("28", "exclude", "Gas Piping", { drafter: "user" }),
      entry("28a", "include", "Cap at the Main"),
    ],
  };

  it("sets each line's division and its entries in order, approved or not, with drafter and approver", () => {
    const described = describeRom(rom, context);
    const plumbing = described.lines[0];
    expect(plumbing.division).toBe("22");
    expect(plumbing.includes?.map((e) => [e.text, e.approvedBy])).toEqual([
      ["First", null],
      ["Second", "devin@example.com"],
    ]);
    expect(plumbing.excludes).toEqual([
      {
        text: "Gas Piping",
        drafter: "user",
        draftedBy: "devin@example.com",
        draftedAt: "2026-10-02T12:00:00.000Z",
        approvedBy: "devin@example.com",
        approvedAt: "2026-10-02T13:00:00.000Z",
      },
    ]);
    expect(described.lines[1].division).toBe("22");
    expect(described.unpricedItems[0]).toMatchObject({ division: "33", includes: [{ text: "Cap at the Main" }], excludes: [] });
  });

  it("finds a line's breakouts as its sub-items", () => {
    expect(subItemsOf(describeRom(rom, context), "28").map((l) => l.costCode)).toEqual(["28x"]);
    expect(subItemsOf(rom, "28x")).toEqual([]);
  });
});

describe("the drill-down fields through a run and a publish", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;

  beforeEach(async () => {
    db = await seededDatabase();
  });

  afterEach(async () => {
    await db.close();
  });

  async function addEntry(side: "include" | "exclude", body: string, approved: boolean, position = 0) {
    await db.query(
      `insert into line_scope_entries
         (project_id, cost_code, side, position, body, drafter, drafted_by, approved_by, approved_at)
       values ($1, 'TEST', $2, $3, $4, 'ai', 'devin@example.com', $5, $6)`,
      [TEST_PROJECT_ID, side, position, body, approved ? "devin@example.com" : null, approved ? "2026-10-02T13:00:00Z" : null],
    );
  }

  it("files the disconnects under 33 and every elevator item under 14, keeping their trade divisions", async () => {
    const byCode = new Map((await readClassifications(db as Db)).map((c) => [c.costCode, c]));
    for (const code of ["28a", "28b", "31f"]) expect(byCode.get(code)?.ledgerDivision).toBe("33");
    expect(byCode.get("28a")?.division).toBe("22");
    expect(byCode.get("31f")?.division).toBe("26");
    expect(byCode.get("36a")).toMatchObject({ division: "33" });
    expect(byCode.get("36a")?.ledgerDivision).toBeUndefined();
    for (const code of ["26a", "26c", "26d", "26e", "26f", "26g", "26h", "26i"]) expect(byCode.get(code)?.ledgerDivision).toBe("14");
    expect(byCode.get("26b")).toMatchObject({ division: "14" });
    expect(byCode.get("26")?.ledgerDivision).toBeUndefined();
  });

  it("records every entry on the run, and freezes only approved ones into the snapshot", async () => {
    await addEntry("include", "Approved Scope", true);
    await addEntry("include", "Draft Scope", false, 1);
    await addEntry("exclude", "Approved Exclusion", true);

    const { runId, rom } = await runRom(db as Db, TEST_PROJECT_ID);
    const line = rom.lines.find((l) => l.costCode === "TEST")!;
    expect(line.includes?.map((e) => e.text)).toEqual(["Approved Scope", "Draft Scope"]);
    expect(line.quantity).toEqual({ amount: 1000, unit: "usd_per_gsf" });
    expect(line.inputs).toEqual(["grossSquareFeet"]);
    expect(line.raisedBy).toEqual([]);

    // An entry approved after the run still reaches the snapshot, and a draft never does.
    await addEntry("exclude", "Approved Later", true, 1);
    const published = await publishBudget(db as Db, {
      runId,
      issuedBy: "devin@example.com",
      copy: { preparedFor: null, preparedBy: null, validityDays: null, coverSentence: null },
    });
    const frozen = published.snapshot.rom.lines.find((l) => l.costCode === "TEST")!;
    expect(frozen.includes?.map((e) => e.text)).toEqual(["Approved Scope"]);
    expect(frozen.excludes?.map((e) => e.text)).toEqual(["Approved Exclusion", "Approved Later"]);
    expect(JSON.stringify(published.snapshot)).not.toContain("Draft Scope");
  });

  it("refuses an approval without its date", async () => {
    await expect(
      db.query(
        `insert into line_scope_entries (project_id, cost_code, side, body, drafter, drafted_by, approved_by)
         values ($1, 'TEST', 'include', 'Half Approved', 'user', 'devin@example.com', 'devin@example.com')`,
        [TEST_PROJECT_ID],
      ),
    ).rejects.toThrow();
  });
});

describe("a snapshot published before LA-1502", () => {
  it("still renders, with none of the new fields", () => {
    expect(MN4.rom.lines.some((l) => "inputs" in l || "division" in l || "raisedBy" in l)).toBe(false);
    const page = presentBudget({ snapshot: MN4, version: 1, stage: "conceptual", issuedAt: MN4.run.issuedAt, newer: null });
    expect(page.ledger.length).toBeGreaterThan(0);
  });
});
