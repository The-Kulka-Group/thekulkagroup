import { anchorPreview, type Milestone, type MilestoneAnchor, type MilestoneResolution } from "./milestones";
import { STRAIGHT_LINE_DISTRIBUTION_VERSION, type DerivedCostLine } from "./monthly-cost-schedule";

/*
 * LA-1868. Commercial spaces on apartment operations: each space has its own lease start, rent,
 * recoveries and first-generation leasing costs. This file holds the commercial input types, the
 * checks on them and the month arithmetic. It imports nothing at run time from apartment-operations,
 * which calls it, so the two files never form a loop.
 *
 * Conventions this module names, so a test can point at each one:
 * - A space's rent starts at its lease start month and runs to the end of the model. The lease term
 *   sets the leasing commission only. There is no renewal, second-generation leasing or new
 *   tenant improvement after the term (a stated limit).
 * - Free rent forgives base rent only. Recoveries start at the lease start month.
 * - Commercial vacancy and credit loss are percents of commercial income (rent less free rent,
 *   plus recoveries) and never touch residential income.
 * - A commercial space is never a unit and never counts in lease-up or any per-unit figure.
 */

export const MAX_COMMERCIAL_SPACES = 20;
export const MAX_COMMERCIAL_RECOVERIES_PER_SPACE = 10;
export const MAX_COMMERCIAL_LEASE_TERM_MONTHS = 360;
export const MAX_COMMERCIAL_AREA_SF = 10_000_000;

type ReviewState = "working" | "done";

type Evidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

export type CommercialRecoveryBasis =
  | { kind: "expense_lines"; lineIds: string[] }
  | { kind: "property_tax" };

export type CommercialRecovery = {
  /** The expense the tenant reimburses: named operating expense lines or the property tax. */
  basis: CommercialRecoveryBasis;
  /** Share of the basis the space pays. Absent reads as the space's area share of total area. */
  sharePercent?: number;
};

export type CommercialSpace = Evidence & {
  id: string;
  name: string;
  areaSf: number;
  annualRentPerSf: number;
  leaseStartMonth?: string;
  /** Puts the lease start at a milestone plus an offset, in place of the typed month. */
  leaseStartAnchor?: MilestoneAnchor;
  freeRentMonths: number;
  recoveries: CommercialRecovery[];
  /** First-generation costs at lease start. */
  tenantImprovementPerSf: number;
  /** Of base rent over the lease term. */
  leasingCommissionPercent: number;
  leaseTermMonths: number;
};

export type CommercialOperations = Evidence & {
  spaces: CommercialSpace[];
  /** On commercial income only. */
  vacancyPercent: number;
  /** On commercial income only. */
  creditLossPercent: number;
};

export type CommercialIssueCode =
  | "invalid_line"
  | "invalid_amount"
  | "invalid_percent"
  | "invalid_units"
  | "invalid_month"
  | "outside_timeline"
  | "invalid_recovery"
  | "missing_milestone"
  | "invalid_anchor"
  | "anchor_outside_timeline"
  | "unsupported_unit";

export type CommercialIssue = { path: string; code: CommercialIssueCode; message: string };

/** What the commercial check needs to know about the rest of the case. */
export type CommercialContext = {
  analysisStartMonth: string;
  saleMonth: string;
  operationStartMonth: string;
  milestones?: Milestone[];
  expenseLines: Array<{ id: unknown; unit: unknown; appliesTo?: unknown }>;
  hasPropertyTax: boolean;
  residentialAreaSf: number;
};

export type ResolvedCommercialRecovery = {
  recovery: CommercialRecovery;
  /** The share used each month, entered or the area share. */
  sharePercent: number;
  shareSource: "entered" | "area_share";
};

export type ResolvedCommercialSpace = {
  space: CommercialSpace;
  index: number;
  leaseStartIndex: number;
  leaseStartMonth: string;
  /** Entered rent at the lease's rate before growth, in cents a year. */
  annualRentCents: number;
  recoveries: ResolvedCommercialRecovery[];
};

export function commercialAreaSf(commercial: CommercialOperations) {
  return commercial.spaces.reduce((sum, space) => sum + space.areaSf, 0);
}

/**
 * The month each space's lease starts: the milestone anchor when it has one, otherwise the typed
 * month. Reading the anchor every time keeps a stale typed month from winning.
 */
export function leaseStartMonthFor(space: CommercialSpace, milestones: Milestone[] | undefined): string | null {
  if (space.leaseStartAnchor !== undefined) return anchorPreview(Array.isArray(milestones) ? milestones : [], space.leaseStartAnchor);
  return typeof space.leaseStartMonth === "string" && monthIndex(space.leaseStartMonth) !== null ? space.leaseStartMonth : null;
}

/** Resolves anchors to months with the milestone each came from. Issues name a missing milestone or a bad anchor. */
export function resolveLeaseStarts(spaces: CommercialSpace[], milestones: Milestone[] | undefined) {
  const issues: CommercialIssue[] = [];
  const resolutions: MilestoneResolution[] = [];
  spaces.forEach((space, index) => {
    if (!space || typeof space !== "object" || space.leaseStartAnchor === undefined) return;
    const path = `commercial.spaces.${index}.leaseStartAnchor`;
    const anchor = space.leaseStartAnchor as unknown;
    if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) {
      issues.push({ path, code: "invalid_anchor", message: `${space.name}: a lease start anchor needs a milestone and an offset in months.` });
      return;
    }
    const { milestoneId, offsetMonths } = anchor as Record<string, unknown>;
    if (typeof milestoneId !== "string" || milestoneId === "") {
      issues.push({ path: `${path}.milestoneId`, code: "invalid_anchor", message: `${space.name}: choose a milestone for the lease start.` });
      return;
    }
    if (typeof offsetMonths !== "number" || !Number.isInteger(offsetMonths) || Math.abs(offsetMonths) > 240) {
      issues.push({ path: `${path}.offsetMonths`, code: "invalid_anchor", message: `${space.name}: the offset must be a whole number of months, no more than 240 either way.` });
      return;
    }
    const milestone = (milestones ?? []).find(({ id }) => id === milestoneId);
    if (!milestone) {
      issues.push({ path: `${path}.milestoneId`, code: "missing_milestone", message: `${space.name}: the milestone the lease start points to is not on this case. Add it or choose another.` });
      return;
    }
    const month = anchorPreview(milestones ?? [], { milestoneId, offsetMonths });
    if (month === null) {
      issues.push({ path, code: "anchor_outside_timeline", message: `${space.name}: ${milestone.name} plus ${offsetMonths} months falls outside the supported years.` });
      return;
    }
    const where = offsetMonths === 0
      ? `at ${milestone.name} (${milestone.month})`
      : `${Math.abs(offsetMonths)} ${Math.abs(offsetMonths) === 1 ? "month" : "months"} ${offsetMonths < 0 ? "before" : "after"} ${milestone.name} (${milestone.month})`;
    resolutions.push({
      path: `commercial.spaces.${index}.leaseStartMonth`,
      label: `${space.name} Lease Start`,
      month,
      milestoneId: milestone.id,
      milestoneName: milestone.name,
      offsetMonths,
      trace: `Lease starts ${where}, which is ${month}.`,
    });
  });
  return { issues, resolutions };
}

/**
 * Checks the commercial block against the case. It reports only what the block itself gets wrong;
 * source labels, dates and review states are checked by the caller with the other blocks.
 */
export function validateCommercialOperations(commercial: CommercialOperations, context: CommercialContext): CommercialIssue[] {
  const issues: CommercialIssue[] = [];
  const add = (path: string, code: CommercialIssueCode, message: string) => issues.push({ path, code, message });
  if (!commercial || typeof commercial !== "object" || Array.isArray(commercial)) {
    add("commercial", "invalid_line", "Commercial must be an object.");
    return issues;
  }
  for (const key of ["vacancyPercent", "creditLossPercent"] as const) {
    const value = commercial[key];
    if (!(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100)) {
      add(`commercial.${key}`, "invalid_percent", `Commercial ${key === "vacancyPercent" ? "vacancy" : "credit loss"} must be from 0 to 100 percent.`);
    }
  }
  if (!Array.isArray(commercial.spaces) || commercial.spaces.length === 0) {
    add("commercial.spaces", "invalid_line", "Add at least one commercial space, or leave the commercial block off.");
    return issues;
  }
  if (commercial.spaces.length > MAX_COMMERCIAL_SPACES) {
    add("commercial.spaces", "invalid_line", `A case cannot hold more than ${MAX_COMMERCIAL_SPACES} commercial spaces.`);
    return issues;
  }
  const analysis = monthIndex(context.analysisStartMonth);
  const sale = monthIndex(context.saleMonth);
  const operation = monthIndex(context.operationStartMonth);
  const expenseById = new Map(context.expenseLines
    .filter((line) => line && typeof line.id === "string")
    .map((line) => [line.id as string, line]));
  const anchored = resolveLeaseStarts(commercial.spaces, context.milestones);
  issues.push(...anchored.issues);
  const totalAreaSf = context.residentialAreaSf + commercial.spaces.reduce((sum, space) => (
    space && typeof space.areaSf === "number" && Number.isFinite(space.areaSf) ? sum + space.areaSf : sum
  ), 0);
  /* Tenants together cannot pay more than all of an expense. */
  const sharesByBasis = new Map<string, number>();

  commercial.spaces.forEach((space, index) => {
    const path = `commercial.spaces.${index}`;
    if (!space || typeof space !== "object" || Array.isArray(space)) return;
    if (!(typeof space.areaSf === "number" && Number.isFinite(space.areaSf) && space.areaSf > 0 && space.areaSf <= MAX_COMMERCIAL_AREA_SF && hasAtMostDecimals(space.areaSf, 2))) {
      add(`${path}.areaSf`, "invalid_units", `Area must be above zero and no more than ${MAX_COMMERCIAL_AREA_SF.toLocaleString("en-US")} square feet, with no more than two decimal places.`);
    }
    for (const [key, label] of [["annualRentPerSf", "Annual rent per square foot"], ["tenantImprovementPerSf", "Tenant improvement per square foot"]] as const) {
      const value = space[key];
      if (!(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100_000 && hasAtMostDecimals(value, 4))) {
        add(`${path}.${key}`, "invalid_amount", `${label} must be zero or more, up to 100,000, with no more than four decimal places.`);
      }
    }
    if (!(typeof space.leasingCommissionPercent === "number" && Number.isFinite(space.leasingCommissionPercent) && space.leasingCommissionPercent >= 0 && space.leasingCommissionPercent <= 100 && hasAtMostDecimals(space.leasingCommissionPercent, 4))) {
      add(`${path}.leasingCommissionPercent`, "invalid_percent", "Leasing commission must be from 0 to 100 percent with no more than four decimal places.");
    }
    if (!Number.isSafeInteger(space.leaseTermMonths) || space.leaseTermMonths < 1 || space.leaseTermMonths > MAX_COMMERCIAL_LEASE_TERM_MONTHS) {
      add(`${path}.leaseTermMonths`, "invalid_units", `Lease term must be a whole number of months from 1 to ${MAX_COMMERCIAL_LEASE_TERM_MONTHS}.`);
    }
    if (!Number.isSafeInteger(space.freeRentMonths) || space.freeRentMonths < 0) {
      add(`${path}.freeRentMonths`, "invalid_units", "Free rent months must be zero or a positive whole number.");
    } else if (Number.isSafeInteger(space.leaseTermMonths) && space.freeRentMonths > space.leaseTermMonths) {
      add(`${path}.freeRentMonths`, "invalid_units", "Free rent cannot run longer than the lease term.");
    }

    const resolvedMonth = anchored.issues.some((issue) => issue.path.startsWith(`${path}.`)) ? null : leaseStartMonthFor(space, context.milestones);
    if (space.leaseStartAnchor === undefined && (typeof space.leaseStartMonth !== "string" || monthIndex(space.leaseStartMonth) === null)) {
      add(`${path}.leaseStartMonth`, "invalid_month", `${labelOf(space, index)} needs a lease start month in YYYY-MM form, or a milestone anchor.`);
    }
    const start = resolvedMonth === null ? null : monthIndex(resolvedMonth);
    if (start !== null) {
      if (analysis !== null && sale !== null && (start < analysis || start > sale)) {
        add(`${path}.leaseStartMonth`, "outside_timeline", `${labelOf(space, index)} lease start must fall within the analysis timeline.`);
      } else if (operation !== null && start < operation) {
        add(`${path}.leaseStartMonth`, "outside_timeline", `${labelOf(space, index)} lease start cannot be before operation start. This formula version runs commercial income from operation start.`);
      }
    }

    if (!Array.isArray(space.recoveries)) {
      add(`${path}.recoveries`, "invalid_recovery", "Recoveries must be a list, empty when the tenant reimburses nothing.");
      return;
    }
    if (space.recoveries.length > MAX_COMMERCIAL_RECOVERIES_PER_SPACE) {
      add(`${path}.recoveries`, "invalid_recovery", `A space cannot carry more than ${MAX_COMMERCIAL_RECOVERIES_PER_SPACE} recoveries.`);
    }
    space.recoveries.forEach((recovery, position) => {
      const recoveryPath = `${path}.recoveries.${position}`;
      if (!recovery || typeof recovery !== "object" || Array.isArray(recovery) || !recovery.basis || typeof recovery.basis !== "object") {
        add(recoveryPath, "invalid_recovery", "A recovery needs a basis: operating expense lines or the property tax.");
        return;
      }
      const share = recovery.sharePercent;
      if (share !== undefined && !(typeof share === "number" && Number.isFinite(share) && share > 0 && share <= 100 && hasAtMostDecimals(share, 6))) {
        add(`${recoveryPath}.sharePercent`, "invalid_percent", "Share must be above 0 and at most 100 percent with no more than six decimal places.");
      }
      const effectiveShare = typeof share === "number" && Number.isFinite(share)
        ? share
        : totalAreaSf > 0 && Number.isFinite(space.areaSf) ? space.areaSf / totalAreaSf * 100 : 0;
      const keys: string[] = [];
      if (recovery.basis.kind === "property_tax") {
        if (!context.hasPropertyTax) {
          add(`${recoveryPath}.basis`, "invalid_recovery", "A property tax recovery needs a property tax schedule on the case, because it reimburses the tax the property pays.");
        }
        keys.push("property_tax");
      } else if (recovery.basis.kind === "expense_lines") {
        const { lineIds } = recovery.basis;
        if (!Array.isArray(lineIds) || lineIds.length === 0) {
          add(`${recoveryPath}.basis.lineIds`, "invalid_recovery", "Choose at least one operating expense line to recover.");
        } else {
          const seen = new Set<string>();
          lineIds.forEach((lineId, lineIndex) => {
            const line = typeof lineId === "string" ? expenseById.get(lineId) : undefined;
            if (!line) {
              add(`${recoveryPath}.basis.lineIds.${lineIndex}`, "invalid_recovery", "That operating expense line is not on this case.");
            } else if (line.unit === "percent_effective_gross_revenue") {
              add(`${recoveryPath}.basis.lineIds.${lineIndex}`, "invalid_recovery", "A percent-of-revenue line cannot be recovered, because the recovery is itself revenue.");
            } else if (seen.has(lineId)) {
              add(`${recoveryPath}.basis.lineIds.${lineIndex}`, "invalid_recovery", "List each operating expense line once.");
            } else {
              seen.add(lineId);
              keys.push(`line:${lineId}`);
            }
          });
        }
      } else {
        add(`${recoveryPath}.basis.kind`, "invalid_recovery", "A recovery basis is operating expense lines or the property tax.");
      }
      for (const key of keys) sharesByBasis.set(key, (sharesByBasis.get(key) ?? 0) + effectiveShare);
    });
  });
  for (const [key, total] of sharesByBasis) {
    if (total > 100 + 1e-6) {
      add("commercial.spaces", "invalid_recovery", `Tenants together pay ${roundTo(total, 4)} percent of ${key === "property_tax" ? "the property tax" : "an operating expense line"}. The shares cannot add to more than 100 percent.`);
    }
  }

  /* A commercial expense line starts before the first lease at most by its lead months, and never before operation start. */
  const firstLease = firstLeaseStartIndex(commercial.spaces, context.milestones);
  if (firstLease !== null && operation !== null) {
    context.expenseLines.forEach((line, index) => {
      const leadMonths = (line as { leadMonths?: unknown }).leadMonths;
      if (line?.appliesTo !== "commercial" || typeof leadMonths !== "number" || !Number.isSafeInteger(leadMonths) || leadMonths < 0) return;
      if (firstLease - leadMonths < operation) {
        add(`operatingExpenseLines.${index}.leadMonths`, "outside_timeline", "A commercial expense line cannot start before operation start. Lower its lead months or move the first lease later.");
      }
    });
  }
  return issues;
}

/** The earliest lease start among the spaces that have one, as a month index. Null with none. */
export function firstLeaseStartIndex(spaces: CommercialSpace[], milestones: Milestone[] | undefined) {
  let first: number | null = null;
  for (const space of spaces) {
    if (!space || typeof space !== "object") continue;
    const month = leaseStartMonthFor(space, milestones);
    const index = month === null ? null : monthIndex(month);
    if (index !== null && (first === null || index < first)) first = index;
  }
  return first;
}

/** Spaces with their lease start and recovery shares worked out. Call only on a block that passed validation. */
export function resolveSpaces(commercial: CommercialOperations, milestones: Milestone[] | undefined, residentialAreaSf: number): ResolvedCommercialSpace[] {
  const totalAreaSf = residentialAreaSf + commercialAreaSf(commercial);
  return commercial.spaces.flatMap((space, index): ResolvedCommercialSpace[] => {
    const month = leaseStartMonthFor(space, milestones);
    // A space whose lease start cannot be read never starts. Validation reports it before any run reaches here.
    if (month === null) return [];
    return [{
      space,
      index,
      leaseStartIndex: monthIndex(month)!,
      leaseStartMonth: month,
      annualRentCents: Math.round(space.areaSf * space.annualRentPerSf * 100),
      recoveries: space.recoveries.map((recovery) => ({
        recovery,
        sharePercent: recovery.sharePercent ?? space.areaSf / totalAreaSf * 100,
        shareSource: recovery.sharePercent === undefined ? "area_share" as const : "entered" as const,
      })),
    }];
  });
}

export type SpaceRentMonth = {
  /** Scheduled base rent for the month, in cents. Zero before the lease starts. */
  baseRent: number;
  /** Base rent forgiven, in cents and negative. Zero after the free-rent months. */
  freeRent: number;
};

/**
 * One month of a space's rent. The year's grown rent splits into twelve months by operating month,
 * the way every annual line does, so twelve months add to the year's rent to the cent.
 */
export function spaceRentForMonth(space: ResolvedCommercialSpace, month: number, operationOffset: number, rentFactor: number): SpaceRentMonth {
  if (month < space.leaseStartIndex) return { baseRent: 0, freeRent: 0 };
  const baseRent = annualAllocation(Math.round(space.annualRentCents * rentFactor), operationOffset);
  const free = month - space.leaseStartIndex < space.space.freeRentMonths;
  return { baseRent, freeRent: free ? 0 - baseRent : 0 };
}

/** Base rent over the lease term in cents, before free rent: each term month's scheduled rent, grown as the run grows it. */
export function scheduledRentOverTerm(space: ResolvedCommercialSpace, operationStart: number, rentFactorFor: (month: number) => number) {
  let total = 0;
  for (let step = 0; step < space.space.leaseTermMonths; step += 1) {
    const month = space.leaseStartIndex + step;
    total += spaceRentForMonth(space, month, month - operationStart, rentFactorFor(month)).baseRent;
  }
  return total;
}

export function tenantImprovementCents(space: CommercialSpace) {
  return Math.round(space.areaSf * space.tenantImprovementPerSf * 100);
}

export function leasingCommissionCents(space: CommercialSpace, termRentCents: number) {
  return Math.round(termRentCents * space.leasingCommissionPercent / 100);
}

/**
 * First-generation costs as cost lines in the lease start month. The cost schedule funds them as
 * project costs, so they count in total cost and in loan to cost. Tenant improvements are hard cost
 * and leasing commissions are soft cost, as the audited Benjamin budget carries them. They are
 * derived on every run from the spaces and never saved as cost lines.
 */
export function commercialCostLines(
  spaces: ResolvedCommercialSpace[],
  operationStart: number,
  rentFactorFor: (month: number) => number,
): DerivedCostLine[] {
  const lines: DerivedCostLine[] = [];
  for (const resolved of spaces) {
    const { space, index } = resolved;
    const common = {
      unit: "usd" as const,
      startMonth: resolved.leaseStartMonth,
      endMonth: resolved.leaseStartMonth,
      distributionMethod: "straight_line" as const,
      distributionVersion: STRAIGHT_LINE_DISTRIBUTION_VERSION,
      sourceLabel: `Commercial space ${space.name}`,
      reviewState: space.reviewState,
    };
    const improvement = tenantImprovementCents(space);
    if (improvement > 0) {
      lines.push({
        ...common,
        id: tenantImprovementLineId(space.id),
        name: `Tenant Improvements (${space.name})`,
        category: "hard_cost",
        amount: improvement / 100,
        derivation: {
          trace: `Derived from commercial space ${space.name}: ${space.areaSf} square feet times a tenant improvement of ${space.tenantImprovementPerSf} per square foot, paid in the lease start month, ${resolved.leaseStartMonth}.`,
          inputPaths: [`commercial.spaces.${index}.areaSf`, `commercial.spaces.${index}.tenantImprovementPerSf`, `commercial.spaces.${index}.leaseStartMonth`],
        },
      });
    }
    const commission = leasingCommissionCents(space, scheduledRentOverTerm(resolved, operationStart, rentFactorFor));
    if (commission > 0) {
      lines.push({
        ...common,
        id: leasingCommissionLineId(space.id),
        name: `Leasing Commission (${space.name})`,
        category: "soft_cost",
        amount: commission / 100,
        derivation: {
          trace: `Derived from commercial space ${space.name}: ${space.leasingCommissionPercent} percent of the base rent the lease schedules over its ${space.leaseTermMonths} month term from ${resolved.leaseStartMonth}, before free rent and grown at the commercial rent rates, paid in the lease start month.`,
          inputPaths: [
            `commercial.spaces.${index}.areaSf`,
            `commercial.spaces.${index}.annualRentPerSf`,
            `commercial.spaces.${index}.leasingCommissionPercent`,
            `commercial.spaces.${index}.leaseTermMonths`,
            `commercial.spaces.${index}.leaseStartMonth`,
            "growthStartMonth",
            "annualIncomeGrowthPercent",
            "categoryGrowth",
          ],
        },
      });
    }
  }
  return lines;
}

export function tenantImprovementLineId(spaceId: string) {
  return `commercial-ti:${spaceId}`;
}

export function leasingCommissionLineId(spaceId: string) {
  return `commercial-commission:${spaceId}`;
}

export function recoveryBasisLabel(recovery: CommercialRecovery, expenseNames: Map<string, string>) {
  if (recovery.basis.kind === "property_tax") return "Property Tax";
  return recovery.basis.lineIds.map((id) => expenseNames.get(id) ?? id).join(", ");
}

function labelOf(space: CommercialSpace, index: number) {
  return typeof space.name === "string" && space.name.trim() !== "" ? space.name : `Commercial space ${index + 1}`;
}

function annualAllocation(annualCents: number, operationOffset: number) {
  const position = ((operationOffset % 12) + 12) % 12;
  const prior = Math.round(annualCents * position / 12);
  const next = position === 11 ? annualCents : Math.round(annualCents * (position + 1) / 12);
  return next - prior;
}

function hasAtMostDecimals(value: number, places: number) {
  const scale = 10 ** places;
  return Math.abs(value * scale - Math.round(value * scale)) < 1e-6;
}

function roundTo(value: number, places: number) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function monthIndex(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}
