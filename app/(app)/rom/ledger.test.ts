import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { computeMarkups, type BlockClassification, type Rom, type RomLine, type UnpricedItem } from "@kulka/engine";

import { addsToTotal } from "./block-layout";
import { barModel, buildField, orderField, type RomOrder } from "./field-order";
import { LedgerView } from "./LedgerView";
import { buildLedger, divisionTitle, markupRows, sourceOf, type LedgerGrouping, type LedgerRow } from "./ledger";

// LA-1254. The schedule-of-values ledger, on the same synthetic pilot the
// card field is tested on (field-order.test.ts): demolition with its
// disconnects, and benchmark lines for Finishes, Plumbing and Electrical.

function line(patch: Partial<RomLine> & Pick<RomLine, "costCode" | "low" | "high">): RomLine {
  return {
    label: `Synthetic ${patch.costCode}`,
    confidence: "high",
    heldForReview: false,
    comparableCount: 2,
    comparables: [],
    judgmentAdjustments: [],
    scopeSide: "building",
    contractSide: "kulka",
    detailLevel: null,
    element: null,
    breakoutOf: null,
    buyoutPackage: null,
    gateStatus: null,
    ...patch,
  };
}

function classification(
  over: Partial<BlockClassification> & Pick<BlockClassification, "costCode">,
): BlockClassification {
  return {
    detailLevel: 1,
    element: null,
    breakoutOfCostCode: null,
    buyoutPackage: null,
    statedBy: "automated test",
    statedOn: "2026-09-27",
    reason: "synthetic",
    ...over,
  };
}

function rom(lines: RomLine[], unpricedItems: UnpricedItem[] = []): Rom {
  const adds = lines.filter(addsToTotal);
  const sum = (only: RomLine[]) => ({
    low: only.reduce((s, l) => s + l.low, 0),
    high: only.reduce((s, l) => s + l.high, 0),
  });
  return {
    lines,
    total: sum(adds),
    kulkaContractTotal: sum(adds.filter((l) => l.contractSide !== "owner")),
    carvedOut: { low: 0, high: 0 },
    notInThisJob: [],
    tbdGateItems: [],
    assumedPresentItems: [],
    unpricedItems,
    assumptions: [],
    parameters: {} as Rom["parameters"],
  };
}

/**
 * The browser check's own shape: demolition in scope, its disconnects spread
 * across Plumbing and Electrical, Site Work carrying only an unpriced item,
 * and Drywall and Finishes, Plumbing and Electrical carrying a benchmark line
 * each.
 */
function pilot() {
  const lines = [
    line({ costCode: "1a", label: "Structure Demolition", low: 60_000, high: 80_000, element: "Demolition", buyoutPackage: "Demolition" }),
    line({ costCode: "1", label: "Site Demolition", low: 4_000, high: 5_000, element: "Demolition", buyoutPackage: "Demolition" }),
    line({ costCode: "28a", label: "Plumbing Disconnect and Cap", low: 1_200, high: 1_500, element: "Demolition", driverCostCode: "1a", buyoutPackage: "Plumbing" }),
    line({ costCode: "28b", label: "Gas Meter and Service Disconnect", low: 800, high: 1_000, element: "Demolition", driverCostCode: "1a", buyoutPackage: "Plumbing" }),
    line({ costCode: "31f", label: "Electrical Service Disconnect", low: 600, high: 800, element: "Demolition", driverCostCode: "1a", buyoutPackage: "Electrical" }),
    line({ costCode: "09-900", label: "Finishes", low: 1_100_000, high: 1_300_000, buyoutPackage: "Drywall and Finishes" }),
    line({ costCode: "22-100", label: "Plumbing Rough-In", low: 700_000, high: 900_000, buyoutPackage: "Plumbing" }),
    line({ costCode: "26-100", label: "Electrical", low: 2_000_000, high: 2_400_000, buyoutPackage: "Electrical" }),
  ];
  const unpriced: UnpricedItem[] = [
    { costCode: "36a", label: "Site Utility Cut and Cap at the Main", driverCostCode: "1a" },
  ];
  const classifications = [
    classification({ costCode: "1a", element: "Demolition", isElementDriver: true, buyoutPackage: "Demolition", division: "02" }),
    classification({ costCode: "1", element: "Demolition", buyoutPackage: "Demolition", division: "02" }),
    classification({ costCode: "28a", element: "Demolition", buyoutPackage: "Plumbing", division: "22" }),
    classification({ costCode: "28b", element: "Demolition", buyoutPackage: "Plumbing", division: "22" }),
    classification({ costCode: "31f", element: "Demolition", buyoutPackage: "Electrical", division: "26" }),
    classification({ costCode: "36a", element: "Demolition", buyoutPackage: "Site Work", division: "33" }),
    // A benchmark code with no stated division: its cost code names it.
    classification({ costCode: "09-900", buyoutPackage: "Drywall and Finishes" }),
  ];
  return { r: rom(lines, unpriced), classifications };
}

function ledgerOf(grouping: LedgerGrouping, order: RomOrder) {
  const { r, classifications } = pilot();
  const entries = orderField(buildField("scope", r, classifications), order);
  return buildLedger(r, entries, grouping, order, classifications, new Map());
}

function shape(rows: LedgerRow[]): string[] {
  return rows.flatMap((row) =>
    row.kind === "item" ? [row.label] : [`[${row.label}]`, ...row.items.map((item) => `  ${item.label}`)],
  );
}

describe("buildLedger (LA-1254)", () => {
  it("By Element folds demolition's items under it, driver first, in MasterFormat order", () => {
    expect(shape(ledgerOf("element", "masterformat").trade)).toEqual([
      "[Demolition]",
      "  Structure Demolition",
      "  Site Demolition",
      "  Plumbing Disconnect and Cap",
      "  Gas Meter and Service Disconnect",
      "  Electrical Service Disconnect",
      "  Site Utility Cut and Cap at the Main",
      "Finishes",
      "Plumbing Rough-In",
      "Electrical",
    ]);
  });

  it("By Division puts each disconnect under its own division, not Demolition", () => {
    expect(shape(ledgerOf("division", "masterformat").trade)).toEqual([
      "[02 Existing Conditions]",
      "  Structure Demolition",
      "  Site Demolition",
      "[09 Finishes]",
      "  Finishes",
      "[22 Plumbing]",
      "  Plumbing Rough-In",
      "  Plumbing Disconnect and Cap",
      "  Gas Meter and Service Disconnect",
      "[26 Electrical]",
      "  Electrical",
      "  Electrical Service Disconnect",
      "[33 Utilities]",
      "  Site Utility Cut and Cap at the Main",
    ]);
  });

  it("Largest First sorts divisions by their total, and an unpriced one last", () => {
    const groups = ledgerOf("division", "largest").trade.map((row) => row.label);
    expect(groups).toEqual(["26 Electrical", "09 Finishes", "22 Plumbing", "02 Existing Conditions", "33 Utilities"]);
  });

  it("sums a group and counts its unpriced items", () => {
    const demolition = ledgerOf("element", "masterformat").trade[0];
    expect(demolition.kind).toBe("group");
    if (demolition.kind !== "group") return;
    expect(demolition.amount).toBe(70_000 + 4_500 + 1_350 + 900 + 700);
    expect(demolition.unpricedCount).toBe(1);
  });
});

describe("sourceOf", () => {
  const comparable = (kind: "actuals" | "reviewed_judgment" | "llm_proposal", exportLabel: string | null = null) => ({
    kind,
    rate: 1,
    weight: 1,
    sourceProjectIds: [],
    exportLabel,
    recordedBy: "test",
    recordedAt: "2026-09-28",
  });

  it("names Kulka jobs behind a measured figure", () => {
    expect(sourceOf(line({ costCode: "x", low: 1, high: 2, comparableCount: 3, comparables: [comparable("actuals")] })).text).toBe("3 Kulka Jobs");
  });

  it("calls a figure with no job count a stated rate", () => {
    expect(sourceOf(line({ costCode: "x", low: 1, high: 2, comparableCount: 0, comparables: [comparable("reviewed_judgment")] })).text).toBe("Stated Rate");
  });

  it("marks a budget-only rate that began as a suggestion", () => {
    const own = comparable("reviewed_judgment", "This project only. Began as claude-opus-5's suggestion of $4200 each.");
    expect(sourceOf(line({ costCode: "x", low: 1, high: 2, comparableCount: 0, comparables: [own] })).text).toBe("AI, This Budget Only");
  });

  it("titles a division, or says it has none", () => {
    expect(divisionTitle("26")).toBe("26 Electrical");
    expect(divisionTitle(null)).toBe("No Division");
  });
});

// LA-1384: the Ledger as the saved budget shows it.
describe("the Ledger view", () => {
  function render(bySpread: boolean) {
    const { r, classifications } = pilot();
    const entries = orderField(buildField("scope", r, classifications), "masterformat");
    const ledger = buildLedger(r, entries, "element", "masterformat", classifications, new Map());
    return renderToStaticMarkup(
      createElement(LedgerView, {
        rom: r,
        ledger,
        bar: barModel(r, entries),
        grossSquareFeet: 100_000,
        selected: null,
        onOpen: () => {},
        bySpread,
      }),
    );
  }
  const names = (html: string) => [...html.matchAll(/class="lg-name">(?:<svg[^]*?<\/svg>)?([^<]+)/g)].map((m) => m[1]);

  it("starts a group under 5% of the total folded, so its items are not drawn", () => {
    const html = render(false);
    expect(html).toMatch(/aria-expanded="false"[^>]*>(?:(?!<\/button>)[^])*Demolition/);
    expect(html).not.toContain("Plumbing Disconnect and Cap");
  });

  it("gives every trade row a range mark on the shared scale", () => {
    const html = render(false);
    const rows = html.match(/class="lg-row lg-(?:item|head)/g) ?? [];
    const marks = html.match(/class="lg-rb"/g) ?? [];
    expect(rows.length).toBeGreaterThan(0);
    expect(marks.length).toBe(rows.length);
  });

  it("puts the widest range first when asked, and MasterFormat order otherwise", () => {
    // Electrical spreads $400k; Finishes and Plumbing Rough-In $200k each and
    // keep their MasterFormat order; Demolition's $22k comes last.
    expect(names(render(true)).slice(1, 5)).toEqual(["Electrical", "Finishes", "Plumbing Rough-in", "Demolition"]);
    expect(names(render(false)).slice(1, 5)).toEqual(["Demolition", "Finishes", "Plumbing Rough-in", "Electrical"]);
  });

  it("rounds its figures to the budget's confidence", () => {
    const html = render(false);
    expect(html).toContain("$2.2M");
    expect(html).not.toMatch(/\$\d+\.\d\d\b/);
  });
});

// LA-1398: the Ledger lists an Allocated Resources plan's lines under the
// markup row it priced, General Requirements' and General Conditions' alike.
describe("the Ledger's markup rows", () => {
  const typed = (value: number) => ({ value, origin: "estimator" as const });
  const parameter = (value: number) => ({
    value,
    provenance: { kind: "reviewed_judgment" as const, recordedBy: "automated test", recordedAt: "2026-09-29", reason: "synthetic" },
  });
  function withPlans(): Rom {
    const { r } = pilot();
    const markups = computeMarkups({
      subtotal: r.kulkaContractTotal,
      ownerDirect: { low: 0, high: 0 },
      grossSquareFeet: 100_000,
      choices: {
        setup: "separate",
        method: "pct_of_subtotal",
        overrideRate: 0.05,
        grMethod: "allocated_resources",
        grResourcePlan: {
          schedule: { precon: typed(0), construction: typed(40), closeout: typed(0) },
          confidence: "high",
          lines: [
            { id: "clean", label: "final cleaning", group: "Construction Labor & Clean-up", basis: "unit", unit: "SF", quantity: typed(100_000), rate: typed(0.55) },
            { id: "john", label: "Port-a-John", group: "Temporary Utilities", basis: "time", per: "week", phases: ["construction"], quantity: typed(2), rate: typed(100) },
          ],
        },
      },
      history: [],
      staffingRates: [],
      fieldOfficeRates: [],
      feeParameter: parameter(0.0325),
      insuranceParameter: parameter(0.054),
      spreadParameters: { high: parameter(0), medium: parameter(0.2), low: parameter(0.35) },
    });
    return { ...r, markups };
  }

  it("carries each plan line, by name and amount, under the line its plan priced", () => {
    const rows = markupRows(withPlans());
    expect(rows.map((row) => row.label)).toEqual(["General Requirements", "General Conditions", "Fee", "Insurance"]);
    expect(rows[0].lines).toEqual([
      { key: "gr:clean", label: "final cleaning", amount: 55_000 },
      { key: "gr:john", label: "Port-a-John", amount: 8_000 },
    ]);
    expect(rows[1].lines).toBeUndefined();
  });

  it("draws them in the Ledger view", () => {
    const { r, classifications } = pilot();
    const rom = { ...withPlans(), lines: r.lines };
    const entries = orderField(buildField("scope", rom, classifications), "masterformat");
    const html = renderToStaticMarkup(
      createElement(LedgerView, {
        rom,
        ledger: buildLedger(rom, entries, "element", "masterformat", classifications, new Map()),
        bar: barModel(rom, entries),
        grossSquareFeet: 100_000,
        selected: null,
        onOpen: () => {},
        bySpread: false,
      }),
    );
    expect(html).toContain("Final Cleaning");
    expect(html).toContain("Port-a-John");
  });
});
