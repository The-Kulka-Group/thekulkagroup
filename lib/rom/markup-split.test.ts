import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeMarkups, type EngineParameter, type MarkupChoices } from "@kulka/engine";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { remapCostImportLine, stageCostImport } from "./ingest";
import { MarkupSplitAcrossImports, readMarkupHistory, routeLineToMarkup } from "./markup";

// LA-1389: a split budget files General Requirements and General Conditions
// as two lines. ADR 0004 charges General Conditions on trade cost including
// General Requirements, so its history rate has to be measured on that same
// base. These tests import a synthetic split budget, price a project from it
// at the same trade cost, and expect both lines back at the imported dollars.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

// The seeded test project is 1,000 GSF.
const GSF = 1000;
// Trade cost without either line, in dollars per GSF.
const TRADE = 42.5;
// General Requirements is 10 percent of trade cost.
const GR = 4.25;
// General Conditions is 20 percent of trade cost plus General Requirements:
// 0.2 × (42.50 + 4.25) = 9.35. Over trade cost alone it would read 22 percent.
const GC = 9.35;

const parameter = (value: number): EngineParameter => ({
  value,
  provenance: {
    kind: "reviewed_judgment",
    recordedBy: "automated test",
    recordedAt: "2026-09-29",
    reason: "synthetic",
  },
});

/** One confidently matched trade line and two lines the matcher cannot place. */
async function splitBudget() {
  const costImport = await stageCostImport(db as Db, {
    sourceProjectId: TEST_PROJECT_ID,
    exportLabel: "Synthetic split budget",
    provenanceKind: "actuals",
    uploadedBy: "reviewer@kulka.com",
    fileText: [
      "description,division,value",
      `"Foundations, footings, and slab-on-grade",03,${TRADE}`,
      `Totally unrelated widget nonsense,99,${GR}`,
      `Totally unrelated widget nonsense,99,${GC}`,
    ].join("\n"),
  });
  const [trade, gr, gc] = costImport.lines;
  expect(trade.status).toBe("staged");
  expect(gr.status).toBe("unmapped");
  expect(gc.status).toBe("unmapped");
  return { costImport, gr, gc };
}

/** Puts a line on a Kulka-side work item, so it sits in the import's trade subtotal until routed. */
async function stageOnKulkaItem(costImportId: string, lineId: string) {
  const { rows } = await db.query<{ id: string }>(
    `select id from canonical_work_items where contract_side = 'kulka' order by sort_order limit 1`,
  );
  await remapCostImportLine(db as Db, costImportId, lineId, { canonicalItemId: rows[0].id }, "r@kulka.com");
}

async function priceSeparate(choices: Partial<MarkupChoices> = {}) {
  return computeMarkups({
    subtotal: { low: TRADE * GSF, high: TRADE * GSF },
    ownerDirect: { low: 0, high: 0 },
    grossSquareFeet: GSF,
    choices: { setup: "separate", method: "pct_of_subtotal", ...choices },
    history: await readMarkupHistory(db as Db),
    staffingRates: [],
    fieldOfficeRates: [],
    feeParameter: parameter(0.0325),
    insuranceParameter: parameter(0.054),
  });
}

async function expectRoundTrip() {
  const markups = await priceSeparate();
  expect(markups.generalRequirements?.tbd).toBe(false);
  expect(markups.generalRequirements?.low).toBe(Math.round(GR * GSF));
  expect(markups.generalConditions.tbd).toBe(false);
  expect(markups.generalConditions.low).toBe(Math.round(GC * GSF));
  expect(markups.generalConditions.high).toBe(Math.round(GC * GSF));
}

async function rate(setup: "gc_only" | "gr_only") {
  const row = (await readMarkupHistory(db as Db)).find((one) => one.setup === setup);
  return row?.pctOfSubtotal;
}

describe("a split budget's General Conditions history (LA-1389)", () => {
  it("prices General Conditions back to the imported dollars when General Requirements is routed first", async () => {
    const { costImport, gr, gc } = await splitBudget();
    await routeLineToMarkup(db as Db, costImport.id, gr.id, "gr_only", "r@kulka.com");
    const routed = await routeLineToMarkup(db as Db, costImport.id, gc.id, "gc_only", "r@kulka.com");

    expect(routed.history.pctOfSubtotal).toBeCloseTo(GC / (TRADE + GR), 10);
    expect(await rate("gr_only")).toBeCloseTo(GR / TRADE, 10);
    await expectRoundTrip();
  });

  it("re-measures General Conditions when General Requirements is routed after it", async () => {
    const { costImport, gr, gc } = await splitBudget();
    const first = await routeLineToMarkup(db as Db, costImport.id, gc.id, "gc_only", "r@kulka.com");
    // Alone, it is General Conditions over trade cost, the way The Vue records it.
    expect(first.history.pctOfSubtotal).toBeCloseTo(GC / TRADE, 10);
    expect(first.partner).toBeNull();

    const second = await routeLineToMarkup(db as Db, costImport.id, gr.id, "gr_only", "r@kulka.com");
    expect(second.history.pctOfSubtotal).toBeCloseTo(GR / TRADE, 10);
    expect(second.partner?.setup).toBe("gc_only");
    expect(second.partner?.pctOfSubtotal).toBeCloseTo(GC / (TRADE + GR), 10);
    expect(await rate("gc_only")).toBeCloseTo(GC / (TRADE + GR), 10);
    await expectRoundTrip();
  });

  it("does not count General Requirements twice when it sat in the trade subtotal as General Conditions was routed", async () => {
    const { costImport, gr, gc } = await splitBudget();
    await stageOnKulkaItem(costImport.id, gr.id);
    await routeLineToMarkup(db as Db, costImport.id, gc.id, "gc_only", "r@kulka.com");
    await routeLineToMarkup(db as Db, costImport.id, gr.id, "gr_only", "r@kulka.com");

    expect(await rate("gc_only")).toBeCloseTo(GC / (TRADE + GR), 10);
    expect(await rate("gr_only")).toBeCloseTo(GR / TRADE, 10);
    await expectRoundTrip();
  });

  it("keeps General Conditions out of General Requirements' base when it sat in the trade subtotal as General Requirements was routed", async () => {
    const { costImport, gr, gc } = await splitBudget();
    await stageOnKulkaItem(costImport.id, gc.id);
    await routeLineToMarkup(db as Db, costImport.id, gr.id, "gr_only", "r@kulka.com");
    await routeLineToMarkup(db as Db, costImport.id, gc.id, "gc_only", "r@kulka.com");

    expect(await rate("gr_only")).toBeCloseTo(GR / TRADE, 10);
    expect(await rate("gc_only")).toBeCloseTo(GC / (TRADE + GR), 10);
    await expectRoundTrip();
  });

  it("keeps General Conditions over trade cost when General Requirements is priced as trade work", async () => {
    const { costImport, gr, gc } = await splitBudget();
    // General Requirements mapped to a Division 01 work item stays inside
    // trade cost, so General Conditions over that trade cost is already the
    // charged base.
    await stageOnKulkaItem(costImport.id, gr.id);
    const routed = await routeLineToMarkup(db as Db, costImport.id, gc.id, "gc_only", "r@kulka.com");
    expect(routed.history.pctOfSubtotal).toBeCloseTo(GC / (TRADE + GR), 10);
  });

  it("leaves a combined line measured over trade cost", async () => {
    const { costImport, gc } = await splitBudget();
    const routed = await routeLineToMarkup(db as Db, costImport.id, gc.id, "both", "r@kulka.com");
    expect(routed.history.pctOfSubtotal).toBeCloseTo(GC / TRADE, 10);
    expect(routed.partner).toBeNull();
  });

  it("refuses to pair the two lines across two imports of the same project", async () => {
    const first = await splitBudget();
    const second = await splitBudget();
    await routeLineToMarkup(db as Db, first.costImport.id, first.gc.id, "gc_only", "r@kulka.com");

    await expect(
      routeLineToMarkup(db as Db, second.costImport.id, second.gr.id, "gr_only", "r@kulka.com"),
    ).rejects.toBeInstanceOf(MarkupSplitAcrossImports);
    const history = await readMarkupHistory(db as Db);
    expect(history.map((row) => row.setup)).toEqual(["gc_only"]);
    expect(history[0].pctOfSubtotal).toBeCloseTo(GC / TRADE, 10);
  });
});
