import {
  AFFORDABILITY_TIERS,
  type AffordabilityTier,
  type ApartmentOperationsResult,
  type ResidentialUnitType,
} from "./apartment-operations";

export const AFFORDABILITY_REPORT_VERSION = "affordability_tier_report.v1" as const;

export type TierSummary = {
  tier: AffordabilityTier;
  unitTypeCount: number;
  units: number;
  revenueUnits: number;
  nonRevenueUnits: number;
  rentableSf: number;
  averageAreaSf: number | null;
  /** Rent per revenue unit at the entered rents, before growth and losses. */
  averageMonthlyRent: number | null;
  minAmiPercent: number | null;
  maxAmiPercent: number | null;
};

export type TierNoi = {
  tier: AffordabilityTier;
  effectiveGrossRevenue: number;
  operatingExpenses: number;
  netOperatingIncome: number;
  /** Per unit of the tier, revenue and non-revenue units both. */
  noiPerUnit: number | null;
  /** Per rentable SF of the tier, every unit of the tier counted. */
  noiPerRentableSf: number | null;
};

export type AffordabilityReport = {
  reportVersion: typeof AFFORDABILITY_REPORT_VERSION;
  tiers: TierSummary[];
  total: { units: number; revenueUnits: number; rentableSf: number };
  /** Null until the property stabilizes, because the allocation reads twelve stabilized months. */
  noi: null | {
    firstMonth: string;
    months: number;
    tiers: TierNoi[];
    total: { effectiveGrossRevenue: number; operatingExpenses: number; netOperatingIncome: number };
  };
  allocationRule: string;
  problems: string[];
};

export const AFFORDABILITY_ALLOCATION_RULE =
  "Effective gross revenue splits by each tier's share of potential income, where residential rent follows revenue-unit rent at the entered rents and other income follows revenue units. Operating expenses, including tax, split by each tier's share of total units. Cent remainders go to the largest share.";

export function tierOf(line: Pick<ResidentialUnitType, "affordabilityTier">): AffordabilityTier {
  return line.affordabilityTier ?? "market";
}

export function summarizeAffordabilityTiers(unitTypes: ResidentialUnitType[]): { tiers: TierSummary[]; total: AffordabilityReport["total"] } {
  const tiers = AFFORDABILITY_TIERS.map((tier): TierSummary => {
    const lines = unitTypes.filter((line) => tierOf(line) === tier);
    const units = sum(lines.map((line) => line.units));
    const revenueUnits = sum(lines.map((line) => line.units - line.nonRevenueUnits));
    const rentableSf = sum(lines.map((line) => line.averageAreaSf * line.units));
    const revenueRent = sum(lines.map((line) => line.monthlyMarketRent * (line.units - line.nonRevenueUnits)));
    const amis = lines.map((line) => line.amiPercent).filter((value): value is number => value !== undefined);
    return {
      tier,
      unitTypeCount: lines.length,
      units,
      revenueUnits,
      nonRevenueUnits: units - revenueUnits,
      rentableSf,
      averageAreaSf: units > 0 ? rentableSf / units : null,
      averageMonthlyRent: revenueUnits > 0 ? revenueRent / revenueUnits : null,
      minAmiPercent: amis.length > 0 ? Math.min(...amis) : null,
      maxAmiPercent: amis.length > 0 ? Math.max(...amis) : null,
    };
  });
  return {
    tiers,
    total: {
      units: sum(tiers.map((tier) => tier.units)),
      revenueUnits: sum(tiers.map((tier) => tier.revenueUnits)),
      rentableSf: sum(tiers.map((tier) => tier.rentableSf)),
    },
  };
}

/** Units, rentable SF and rent by tier from the inputs, plus NOI by tier over the first twelve stabilized months of a run. */
export function affordabilityReport(unitTypes: ResidentialUnitType[], result?: ApartmentOperationsResult | null): AffordabilityReport {
  const { tiers, total } = summarizeAffordabilityTiers(unitTypes);
  const problems: string[] = [];
  if (result) {
    if (total.units !== result.unitSummary.totalUnits) problems.push("Tier units do not add up to the run's total units.");
    if (Math.abs(total.rentableSf - result.unitSummary.totalAreaSf) > 0.005) problems.push("Tier rentable SF does not add up to the run's total area.");
  }
  return {
    reportVersion: AFFORDABILITY_REPORT_VERSION,
    tiers,
    total,
    noi: result ? tierNoi(tiers, unitTypes, result, problems) : null,
    allocationRule: AFFORDABILITY_ALLOCATION_RULE,
    problems,
  };
}

function tierNoi(tiers: TierSummary[], unitTypes: ResidentialUnitType[], result: ApartmentOperationsResult, problems: string[]): AffordabilityReport["noi"] {
  const first = result.firstStabilizedMonth;
  if (!first) return null;
  const start = result.months.findIndex((month) => month.month === first);
  const window = result.months.slice(start, start + 12);
  const cents = (value: number) => Math.round(value * 100);
  const windowSum = (pick: (month: (typeof window)[number]) => number) => window.reduce((total, month) => total + cents(pick(month)), 0);
  const egr = windowSum((month) => month.effectiveGrossRevenue);
  const expenses = windowSum((month) => month.operatingExpenses);
  const residentialRent = windowSum((month) => month.totalResidentialRent);
  const otherIncome = windowSum((month) => month.otherIncome);

  const revenueRentCents = tiers.map((tier) => cents(unitTypes
    .filter((line) => tierOf(line) === tier.tier)
    .reduce((total, line) => total + line.monthlyMarketRent * (line.units - line.nonRevenueUnits), 0)));
  const rentByTier = allocate(residentialRent, revenueRentCents.some((value) => value > 0) ? revenueRentCents : tiers.map((tier) => tier.revenueUnits));
  const otherByTier = allocate(otherIncome, tiers.map((tier) => tier.revenueUnits));
  const potentialByTier = rentByTier.map((value, index) => value + otherByTier[index]);
  const egrByTier = allocate(egr, potentialByTier.some((value) => value > 0) ? potentialByTier : tiers.map((tier) => tier.revenueUnits));
  const expenseByTier = allocate(expenses, tiers.map((tier) => tier.units));

  const rows = tiers.map((tier, index): TierNoi => {
    const noi = egrByTier[index] - expenseByTier[index];
    return {
      tier: tier.tier,
      effectiveGrossRevenue: egrByTier[index] / 100,
      operatingExpenses: expenseByTier[index] / 100,
      netOperatingIncome: noi / 100,
      noiPerUnit: tier.units > 0 ? noi / 100 / tier.units : null,
      noiPerRentableSf: tier.rentableSf > 0 ? noi / 100 / tier.rentableSf : null,
    };
  });
  const noiTotal = sum(rows.map((row) => cents(row.netOperatingIncome)));
  if (noiTotal !== windowSum((month) => month.netOperatingIncome)) problems.push("Tier NOI does not add up to the run's NOI for the same months.");
  return {
    firstMonth: first,
    months: window.length,
    tiers: rows,
    total: { effectiveGrossRevenue: egr / 100, operatingExpenses: expenses / 100, netOperatingIncome: noiTotal / 100 },
  };
}

/** Splits whole cents by weight with the largest-remainder method, so the parts add to the total. */
function allocate(totalCents: number, weights: number[]): number[] {
  const weightTotal = sum(weights);
  if (weightTotal <= 0) return weights.map(() => 0);
  const exact = weights.map((weight) => totalCents * weight / weightTotal);
  const parts = exact.map(Math.floor);
  let left = totalCents - sum(parts);
  const order = exact.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    parts[index] += 1;
    left -= 1;
  }
  return parts;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
