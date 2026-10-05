// Scope relationships (LA-1154, ADR 0006): "Answers bring in drivers;
// relationships bring in supporting items" and "Supporting items add to the
// total". GLOSSARY.md defines Driver, Supporting Item and Relationship.
//
// An answer brings in a driver. A relationship, stated by Matt and stored as a
// row in scope_relationships, then makes that driver bring in a supporting
// item, whichever question brought the driver in. This file applies those rows
// to the lines computeRom has already priced and gated.
//
// A supporting item follows its driver:
//   - priced when the driver is priced (or has no gate rule, or is in scope
//     with no rate of its own);
//   - TBD when the driver is TBD;
//   - absent when the driver is not in the job, is unanswered, or has no line
//     in the ROM at all.
// When it is in, it adds to the total in its own right and is never a
// breakout. With a benchmark it prices the ordinary way; without one it
// arrives as unpriced, carrying its driver so the screen can name it.
//
// Pure functions only, same rule as rom.ts and rom-gates.ts.

import type { GateItemSummary, RomLine, UnpricedItem } from "./rom";
import type { GateLineStatus, GateResolution } from "./rom-gates";

/**
 * How many of a supporting item one driver brings in. The demolition pilot
 * has one per structure coming down; the Elevator element (LA-1257) adds one
 * per elevator and one per elevator stop. The rule names how the item is
 * counted; the benchmark unit that matches it is what prices it.
 */
export type QuantityRule = "one_per_structure" | "one_per_elevator" | "one_per_stop" | "one_per_machine_room";

/**
 * LA-1257: a fact that must hold for the driver to bring the item in, the
 * same shape a judgment rule's condition takes, such as Elevator Pit
 * Waterproofing only when the building goes below grade. Null always holds.
 */
export type RelationshipCondition = { fact: string; equals: string } | null;

/** One stated rule that a driver brings in a supporting item (GLOSSARY.md: Relationship). */
export type ScopeRelationship = {
  driverCostCode: string;
  supportingCostCode: string;
  /**
   * The supporting item's name. Carried on the row because a supporting item
   * may have no benchmark to read a label from, and canonical_work_items does
   * not list the pilot's disconnects yet.
   */
  supportingLabel: string;
  quantityRule: QuantityRule;
  condition?: RelationshipCondition;
  statedBy: string;
  statedOn: string;
  reason: string;
};

export type SupportingItems = {
  /** Every line, with supporting lines marked or removed by their driver's status. */
  lines: RomLine[];
  /** In-scope items with no rate: the derived ones plus the caller's own, each cost code once. */
  unpricedItems: UnpricedItem[];
  /** Supporting items TBD because their driver is, rated or not. */
  tbdItems: GateItemSummary[];
  assumptions: string[];
};

/** What a driver's presence means for the items it brings in, or null when it is absent. */
type DriverState = { costCode: string; label: string; gateStatus: GateLineStatus | null };

/**
 * Applies the relationships to lines already priced and gated. With no
 * relationships the lines and the caller's unpriced items come back as they
 * were, so a ROM computed without any reads exactly as before LA-1154.
 */
export function bringInSupportingItems(
  gatedLines: RomLine[],
  relationships: readonly ScopeRelationship[],
  callerUnpriced: readonly UnpricedItem[],
  gateResolutions: ReadonlyMap<string, GateResolution>,
  /** The project's answers as text, for a relationship's condition (LA-1257). */
  facts: Readonly<Record<string, string>> = {},
): SupportingItems {
  const lineByCode = new Map(gatedLines.map((l) => [l.costCode, l]));
  const callerUnpricedCodes = new Map(callerUnpriced.map((i) => [i.costCode, i]));

  const driverState = (costCode: string): DriverState | null => {
    const line = lineByCode.get(costCode);
    if (line) {
      if (line.gateStatus === "not_in_job" || line.gateStatus === "assumed_present") return null;
      return { costCode, label: line.label, gateStatus: line.gateStatus };
    }
    // A driver the caller put in scope with no rate of its own is still in.
    const unpriced = callerUnpricedCodes.get(costCode);
    return unpriced ? { costCode, label: unpriced.label, gateStatus: null } : null;
  };

  // Sorted so the same rows in any order give the same ROM. When two drivers
  // bring in one item, the first in scope and priced wins over a TBD one; the
  // item is still counted once.
  const sorted = [...relationships].sort(
    (a, b) =>
      a.supportingCostCode.localeCompare(b.supportingCostCode) ||
      a.driverCostCode.localeCompare(b.driverCostCode),
  );
  const supportingCodes = new Set(sorted.map((r) => r.supportingCostCode));
  const chosen = new Map<string, { relationship: ScopeRelationship; driver: DriverState }>();
  for (const relationship of sorted) {
    const condition = relationship.condition ?? null;
    if (condition && facts[condition.fact] !== condition.equals) continue;
    const driver = driverState(relationship.driverCostCode);
    if (!driver) continue;
    const held = chosen.get(relationship.supportingCostCode);
    if (!held || (held.driver.gateStatus === "tbd" && driver.gateStatus !== "tbd")) {
      chosen.set(relationship.supportingCostCode, { relationship, driver });
    }
  }

  const questionFor = (driver: DriverState) =>
    (gateResolutions.get(driver.costCode)?.sections ?? []).join(" and ").replace(/_/g, " ");

  const lines: RomLine[] = [];
  for (const line of gatedLines) {
    if (!supportingCodes.has(line.costCode)) {
      lines.push(line);
      continue;
    }
    const pick = chosen.get(line.costCode);
    if (!pick) continue; // Its driver is absent, so it is too.
    const tbd = pick.driver.gateStatus === "tbd";
    lines.push({
      ...line,
      ...(tbd ? { low: 0, high: 0 } : {}),
      gateStatus: pick.driver.gateStatus,
      breakoutOf: null,
      driverCostCode: pick.driver.costCode,
    });
  }

  const tbdItems: GateItemSummary[] = [];
  const derivedUnpriced: UnpricedItem[] = [];
  for (const [costCode, { relationship, driver }] of chosen) {
    const label = lineByCode.get(costCode)?.label ?? relationship.supportingLabel;
    if (driver.gateStatus === "tbd") {
      tbdItems.push({ costCode, label, question: questionFor(driver), driverCostCode: driver.costCode });
    } else if (!lineByCode.has(costCode)) {
      derivedUnpriced.push({ costCode, label, driverCostCode: driver.costCode });
    }
  }

  // Each cost code once. A derived entry wins over the caller's copy because
  // it names the driver. A cost code with a line, or TBD, is never unpriced.
  const shown = new Set([...lines.map((l) => l.costCode), ...tbdItems.map((i) => i.costCode)]);
  const unpricedItems: UnpricedItem[] = [];
  const seen = new Set<string>();
  for (const item of [...derivedUnpriced, ...callerUnpriced]) {
    if (shown.has(item.costCode) || seen.has(item.costCode)) continue;
    seen.add(item.costCode);
    unpricedItems.push(item);
  }
  if (derivedUnpriced.length > 0) {
    unpricedItems.sort((a, b) => a.costCode.localeCompare(b.costCode));
  }

  return { lines, unpricedItems, tbdItems, assumptions: assumptionsFor(chosen, lineByCode) };
}

function assumptionsFor(
  chosen: ReadonlyMap<string, { relationship: ScopeRelationship; driver: DriverState }>,
  lineByCode: ReadonlyMap<string, RomLine>,
): string[] {
  const byDriver = new Map<string, { driver: DriverState; labels: string[] }>();
  for (const [costCode, { relationship, driver }] of chosen) {
    const group = byDriver.get(driver.costCode) ?? { driver, labels: [] };
    group.labels.push(lineByCode.get(costCode)?.label ?? relationship.supportingLabel);
    byDriver.set(driver.costCode, group);
  }
  return [...byDriver.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((code) => {
      const { driver, labels } = byDriver.get(code)!;
      const tbd = driver.gateStatus === "tbd" ? ", all TBD because it is" : "";
      return `${driver.label} brings in ${labels.join(", ")}${tbd}. Each adds to the total on its own once it has a rate.`;
    });
}
