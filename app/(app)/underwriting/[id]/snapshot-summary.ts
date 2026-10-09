import type { SavedUnderwritingInputSnapshot } from "@/lib/underwriting/runs";

const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * One line for the Calculation History table. A scenario run keeps its inputs under `base`, next to the
 * scenario list, so the line reads the base and adds the scenario count.
 */
export function snapshotSummary(snapshot: SavedUnderwritingInputSnapshot) {
  const inputs = snapshot.base ?? snapshot;
  const scenarios = snapshot.scenarios?.length;
  if (inputs.analysisStartMonth && inputs.saleMonth) {
    const span = `${inputs.costLines?.length ?? 0} cost lines · ${inputs.analysisStartMonth} to ${inputs.saleMonth}`;
    return scenarios ? `${scenarios} ${scenarios === 1 ? "scenario" : "scenarios"} · ${span}` : span;
  }
  const parts = [
    snapshot.grossBuildingSquareFeet === undefined ? null : `${NUMBER.format(snapshot.grossBuildingSquareFeet)} GSF`,
    snapshot.proposedUnits === undefined ? null : `${NUMBER.format(snapshot.proposedUnits)} units`,
    snapshot.purchasePrice === undefined ? null : `${MONEY.format(snapshot.purchasePrice)} purchase`,
    snapshot.monthlyRent === undefined ? null : `${MONEY.format(snapshot.monthlyRent)}/month rent`,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "No calculation inputs were supplied.";
}
