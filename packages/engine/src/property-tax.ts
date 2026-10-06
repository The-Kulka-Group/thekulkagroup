/*
 * LA-1690: property tax as a dated schedule by tax fiscal year. Each fiscal year carries a rate and,
 * under an abatement, an exemption step or a stated PILOT payment. The schedule maps fiscal years onto
 * model months, so every operating month carries the tax the property pays (scheduled) and the tax
 * it would pay with no abatement (full). Each input is held to its own unit band, so one input in the
 * wrong unit cannot hide behind another, as the millage and assessment cap rate did in Benjamin.
 */

export const PROPERTY_TAX_INPUT_VERSION = "property_tax_inputs.v1" as const;
export const MAX_PROPERTY_TAX_FISCAL_YEARS = 60;
export const MAX_PROPERTY_TAX_SOURCE_LABEL_LENGTH = 500;

export const PROPERTY_TAX_ASSUMPTION_KEYS = [
  "firstFiscalYearStartMonth",
  "assessment",
  "fiscalYears",
  "annualRateGrowthPercent",
] as const;

export type PropertyTaxAssumptionKey = typeof PROPERTY_TAX_ASSUMPTION_KEYS[number];
export type PropertyTaxMode = "full_tax" | "abatement";
/** Stated: the assessor's land and improvement values. Income: value from tax-basis NOI over an assessment cap rate. */
export type PropertyTaxAssessmentBasis = "stated_assessed_value" | "income";
/** Percent and dollars per 100 of assessed value hold the same number; both are kept so the input matches its source. */
export type PropertyTaxRateUnit = "percent_of_assessed_value" | "usd_per_100_assessed_value" | "mills";

export const PROPERTY_TAX_UNIT_BANDS = {
  effectiveRateOnMarketValuePercent: { min: 0.2, max: 8 },
  assessmentCapRatePercent: { min: 3, max: 20 },
  assessorExpenseRatioPercent: { min: 0, max: 90 },
  marketValueToCost: { min: 0.25, max: 4 },
  firstYearFullTaxToCostPercent: { min: 0.1, max: 8 },
} as const;

export type PropertyTaxEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: "working" | "done";
};

export type PropertyTaxFiscalYear = {
  rate: number;
  /** Abatement only. The share of the exempt base the abatement removes: improvement value, or the whole value on the income basis. */
  exemptionPercent: number;
  /** Abatement only. A PILOT payment for the fiscal year that replaces the computed abated tax. */
  statedPayment?: number;
};

export type PropertyTaxPlan = {
  taxInputVersion: typeof PROPERTY_TAX_INPUT_VERSION;
  mode: PropertyTaxMode;
  assessmentBasis: PropertyTaxAssessmentBasis;
  /** First month of the first listed tax fiscal year. Each listed year runs twelve months from there. */
  firstFiscalYearStartMonth: string;
  landAssessedValue?: number;
  improvementAssessedValue?: number;
  assessorExpenseRatioPercent?: number;
  assessmentCapRatePercent?: number;
  /**
   * Income basis only. The cap rate for months before the first stabilized month, when an assessor
   * uses a lower rate during lease-up. Absent means one cap rate for the whole hold. It shares the
   * assessment source and review state.
   */
  leaseUpAssessmentCapRatePercent?: number;
  /** Assessed value as a percent of market value. Required on the income basis. */
  assessmentRatioPercent?: number;
  rateUnit: PropertyTaxRateUnit;
  fiscalYears: PropertyTaxFiscalYear[];
  /** Grows the last listed rate for each fiscal year after the list. Those years carry no abatement. */
  annualRateGrowthPercent: number;
  taxEvidence: Record<PropertyTaxAssumptionKey, PropertyTaxEvidence>;
};

export type PropertyTaxIssueCode =
  | "unsupported_input_version"
  | "invalid_tax_option"
  | "invalid_month"
  | "outside_tax_schedule"
  | "invalid_amount"
  | "invalid_percent"
  | "invalid_tax_rate"
  | "invalid_assessment"
  | "implausible_tax_rate"
  | "implausible_assessed_value"
  | "too_many_lines"
  | "missing_lines"
  | "missing_text"
  | "text_too_long"
  | "invalid_source_date"
  | "invalid_review_state";

export type PropertyTaxIssue = { path: string; code: PropertyTaxIssueCode; message: string };

export type PropertyTaxFiscalYearRow = {
  fiscalYear: number;
  startMonth: string;
  endMonth: string;
  /** False for years after the listed schedule, which take the grown rate and no abatement. */
  listed: boolean;
  rate: number;
  ratePerDollarOfAssessedValue: number;
  exemptionPercent: number;
  statedPayment: number | null;
  /** Whole-year liability. Null on the income basis, where tax follows each month's revenue. */
  annualFullTax: number | null;
  annualScheduledTax: number | null;
  chargedMonths: number;
  chargedFullTax: number;
  chargedScheduledTax: number;
};

export type PropertyTaxResult = {
  mode: PropertyTaxMode;
  assessmentBasis: PropertyTaxAssessmentBasis;
  rateUnit: PropertyTaxRateUnit;
  scheduleEndMonth: string;
  fiscalYears: PropertyTaxFiscalYearRow[];
  /** Sum of the listed years' whole-year scheduled tax, when every one is known. */
  listedScheduledTaxTotal: number | null;
  effectiveRateOnMarketValue: number | null;
  impliedMarketValue: number | null;
  /**
   * Income basis with a lease-up cap rate: the rate for each stage and the month the stabilized
   * rate starts, null when the property never stabilizes in the run. Null with one cap rate, and
   * absent on runs saved before the lease-up cap rate.
   */
  capRates?: { leaseUpPercent: number; stabilizedPercent: number; stabilizedFromMonth: string | null } | null;
};

type TaxMonth = { month: string; propertyTax: number; fullPropertyTax: number };

const RATE_UNIT_DIVISORS: Record<PropertyTaxRateUnit, number> = {
  percent_of_assessed_value: 100,
  usd_per_100_assessed_value: 100,
  mills: 1000,
};

const RATE_UNIT_LABELS: Record<PropertyTaxRateUnit, string> = {
  percent_of_assessed_value: "percent of assessed value",
  usd_per_100_assessed_value: "dollars per 100 of assessed value",
  mills: "mills (dollars per 1,000 of assessed value)",
};

export function validatePropertyTaxPlan(
  value: unknown,
  context: { operationStartMonth: string; costBeforeFinancing: number },
): PropertyTaxIssue[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ path: "propertyTax", code: "invalid_tax_option", message: "Property tax must be an object." }];
  }
  const plan = value as PropertyTaxPlan;
  const issues: PropertyTaxIssue[] = [];
  const add = (path: string, code: PropertyTaxIssueCode, message: string) => issues.push({ path: `propertyTax.${path}`, code, message });

  if (plan.taxInputVersion !== PROPERTY_TAX_INPUT_VERSION) add("taxInputVersion", "unsupported_input_version", `Use ${PROPERTY_TAX_INPUT_VERSION}.`);
  if (plan.mode !== "full_tax" && plan.mode !== "abatement") add("mode", "invalid_tax_option", "Tax mode must be Full Tax or Abatement.");
  if (plan.assessmentBasis !== "stated_assessed_value" && plan.assessmentBasis !== "income") add("assessmentBasis", "invalid_tax_option", "Assessment basis must be Stated Assessed Value or Income.");
  if (!(plan.rateUnit in RATE_UNIT_DIVISORS)) add("rateUnit", "invalid_tax_option", "Rate unit must be percent, dollars per 100, or mills of assessed value.");

  const firstFiscalYear = monthIndex(plan.firstFiscalYearStartMonth);
  const operationStart = monthIndex(context.operationStartMonth);
  if (firstFiscalYear === null) {
    add("firstFiscalYearStartMonth", "invalid_month", "First fiscal year start must use YYYY-MM.");
  } else if (operationStart !== null && firstFiscalYear > operationStart) {
    add("firstFiscalYearStartMonth", "outside_tax_schedule", "The first tax fiscal year must start on or before the operation start month, so every operating month has a tax year.");
  }

  const ratio = plan.assessmentRatioPercent;
  if (ratio !== undefined && !(isFiniteNumber(ratio) && ratio > 0 && ratio <= 100)) {
    add("assessmentRatioPercent", "invalid_percent", "Assessment ratio must be greater than zero and no more than 100 percent of market value.");
  }
  if (plan.assessmentBasis === "stated_assessed_value") {
    for (const key of ["assessorExpenseRatioPercent", "assessmentCapRatePercent", "leaseUpAssessmentCapRatePercent"] as const) {
      if (plan[key] !== undefined) add(key, "invalid_assessment", "This input belongs to the income basis. Remove it or switch the basis.");
    }
    if (!validUsd(plan.landAssessedValue)) add("landAssessedValue", "invalid_amount", "Land assessed value must be zero or a positive amount with no more than two decimal places.");
    if (!validUsd(plan.improvementAssessedValue)) add("improvementAssessedValue", "invalid_amount", "Improvement assessed value must be zero or a positive amount with no more than two decimal places.");
    if (validUsd(plan.landAssessedValue) && validUsd(plan.improvementAssessedValue) && plan.landAssessedValue! + plan.improvementAssessedValue! <= 0) {
      add("improvementAssessedValue", "invalid_amount", "Land and improvement assessed value cannot both be zero.");
    }
  } else if (plan.assessmentBasis === "income") {
    for (const key of ["landAssessedValue", "improvementAssessedValue"] as const) {
      if (plan[key] !== undefined) add(key, "invalid_assessment", "Stated assessed values belong to the stated basis. Remove them or switch the basis.");
    }
    if (ratio === undefined) add("assessmentRatioPercent", "invalid_percent", "The income basis needs the assessment ratio, as a percent of market value.");
    const band = PROPERTY_TAX_UNIT_BANDS.assessmentCapRatePercent;
    const capRate = plan.assessmentCapRatePercent;
    if (!(isFiniteNumber(capRate) && capRate >= band.min && capRate <= band.max)) {
      add("assessmentCapRatePercent", "implausible_tax_rate", `Assessment cap rate must be from ${band.min} to ${band.max} percent. A rate below that usually means a decimal was entered where a percent belongs.`);
    }
    const leaseUpCapRate = plan.leaseUpAssessmentCapRatePercent;
    if (leaseUpCapRate !== undefined && !(isFiniteNumber(leaseUpCapRate) && leaseUpCapRate >= band.min && leaseUpCapRate <= band.max)) {
      add("leaseUpAssessmentCapRatePercent", "implausible_tax_rate", `Lease-up assessment cap rate must be from ${band.min} to ${band.max} percent. A rate below that usually means a decimal was entered where a percent belongs.`);
    }
    const expenseBand = PROPERTY_TAX_UNIT_BANDS.assessorExpenseRatioPercent;
    const expenseRatio = plan.assessorExpenseRatioPercent;
    if (!(isFiniteNumber(expenseRatio) && expenseRatio >= expenseBand.min && expenseRatio <= expenseBand.max)) {
      add("assessorExpenseRatioPercent", "invalid_percent", `Assessor expense ratio must be from ${expenseBand.min} to ${expenseBand.max} percent of revenue.`);
    }
  }

  if (!Array.isArray(plan.fiscalYears) || plan.fiscalYears.length === 0) {
    add("fiscalYears", "missing_lines", "Add at least one tax fiscal year.");
  } else if (plan.fiscalYears.length > MAX_PROPERTY_TAX_FISCAL_YEARS) {
    add("fiscalYears", "too_many_lines", `A tax schedule cannot list more than ${MAX_PROPERTY_TAX_FISCAL_YEARS} fiscal years.`);
  } else {
    plan.fiscalYears.forEach((year, index) => {
      const path = `fiscalYears.${index}`;
      if (!year || typeof year !== "object" || Array.isArray(year)) {
        add(path, "invalid_tax_option", "Fiscal year must be an object.");
        return;
      }
      if (!(isFiniteNumber(year.rate) && year.rate > 0)) add(`${path}.rate`, "invalid_tax_rate", "Tax rate must be greater than zero.");
      if (!(isFiniteNumber(year.exemptionPercent) && year.exemptionPercent >= 0 && year.exemptionPercent <= 100)) {
        add(`${path}.exemptionPercent`, "invalid_percent", "Exemption must be from 0 to 100 percent.");
      }
      if (year.statedPayment !== undefined && !validUsd(year.statedPayment)) {
        add(`${path}.statedPayment`, "invalid_amount", "PILOT payment must be zero or a positive amount with no more than two decimal places.");
      }
      if (plan.mode === "full_tax" && (year.exemptionPercent !== 0 || year.statedPayment !== undefined)) {
        add(path, "invalid_tax_option", "Full tax mode takes no exemption or PILOT payment. Switch to Abatement to enter them.");
      }
    });
  }

  const growth = plan.annualRateGrowthPercent;
  if (!(isFiniteNumber(growth) && growth >= 0 && growth <= 100)) add("annualRateGrowthPercent", "invalid_percent", "Annual rate growth must be from 0 to 100 percent.");
  validateEvidence(issues, plan.taxEvidence);

  if (issues.length === 0) issues.push(...unitChecks(plan, context.costBeforeFinancing));
  return issues;
}

function unitChecks(plan: PropertyTaxPlan, costBeforeFinancing: number): PropertyTaxIssue[] {
  const issues: PropertyTaxIssue[] = [];
  const unit = RATE_UNIT_LABELS[plan.rateUnit];
  const ratio = plan.assessmentRatioPercent;
  if (ratio !== undefined) {
    const band = PROPERTY_TAX_UNIT_BANDS.effectiveRateOnMarketValuePercent;
    plan.fiscalYears.forEach((year, index) => {
      const effective = ratePerDollar(plan, year.rate) * ratio;
      if (effective < band.min || effective > band.max) {
        issues.push({
          path: `propertyTax.fiscalYears.${index}.rate`,
          code: "implausible_tax_rate",
          message: `A rate of ${year.rate} in ${unit} at an assessment ratio of ${ratio} percent taxes ${round(effective, 3)} percent of market value, outside ${band.min} to ${band.max} percent. Check the rate unit and the ratio.`,
        });
      }
    });
  }
  if (plan.assessmentBasis === "stated_assessed_value" && costBeforeFinancing > 0) {
    const assessed = plan.landAssessedValue! + plan.improvementAssessedValue!;
    if (ratio !== undefined) {
      const band = PROPERTY_TAX_UNIT_BANDS.marketValueToCost;
      const multiple = assessed / (ratio / 100) / costBeforeFinancing;
      if (multiple < band.min || multiple > band.max) {
        issues.push({
          path: "propertyTax.assessmentRatioPercent",
          code: "implausible_assessed_value",
          message: `Assessed value over the assessment ratio gives a market value ${round(multiple, 2)} times the cost before financing, outside ${band.min} to ${band.max} times. Check the assessed values and the ratio.`,
        });
      }
    }
    const band = PROPERTY_TAX_UNIT_BANDS.firstYearFullTaxToCostPercent;
    const share = assessed * ratePerDollar(plan, plan.fiscalYears[0].rate) / costBeforeFinancing * 100;
    if (share < band.min || share > band.max) {
      issues.push({
        path: "propertyTax.fiscalYears.0.rate",
        code: "implausible_tax_rate",
        message: `First-year full tax comes to ${round(share, 3)} percent of the cost before financing, outside ${band.min} to ${band.max} percent. Check the rate unit and the assessed values.`,
      });
    }
  }
  return issues;
}

/**
 * Scheduled and full tax for one model month, in cents. `effectiveGrossRevenueCents` drives the income
 * basis only. `stabilized` picks the cap rate on the income basis: before stabilization a plan with a
 * lease-up cap rate uses it, and every other month uses the plan's cap rate.
 */
export function propertyTaxForMonth(plan: PropertyTaxPlan, month: number, effectiveGrossRevenueCents: number, stabilized = true) {
  const start = monthIndex(plan.firstFiscalYearStartMonth)!;
  const fiscalYear = Math.floor((month - start) / 12);
  const position = (month - start) % 12;
  const terms = fiscalYearTerms(plan, fiscalYear);
  const payment = terms.statedPayment === null ? null : annualAllocation(cents(terms.statedPayment), position);
  if (plan.assessmentBasis === "stated_assessed_value") {
    const annual = annualTax(plan, terms);
    const full = annualAllocation(annual.full, position);
    return { full, scheduled: plan.mode === "full_tax" ? full : payment ?? annualAllocation(annual.scheduled, position) };
  }
  const assessedCents = Math.max(effectiveGrossRevenueCents, 0)
    * (1 - plan.assessorExpenseRatioPercent! / 100)
    / (capRatePercent(plan, stabilized) / 100)
    * (plan.assessmentRatioPercent! / 100);
  const full = Math.round(assessedCents * terms.ratePerDollar);
  if (plan.mode === "full_tax") return { full, scheduled: full };
  return { full, scheduled: payment ?? Math.round(full * (1 - terms.exemptionPercent / 100)) };
}

/** The assessment cap rate in force for a month, on the income basis. */
export function capRatePercent(plan: PropertyTaxPlan, stabilized: boolean) {
  return !stabilized && plan.leaseUpAssessmentCapRatePercent !== undefined
    ? plan.leaseUpAssessmentCapRatePercent
    : plan.assessmentCapRatePercent!;
}

export function propertyTaxResult(
  plan: PropertyTaxPlan,
  months: TaxMonth[],
  operationStartMonth: string,
  firstStabilizedMonth?: string,
): PropertyTaxResult {
  const start = monthIndex(plan.firstFiscalYearStartMonth)!;
  const operationStart = monthIndex(operationStartMonth)!;
  const charged = new Map<number, { count: number; full: number; scheduled: number }>();
  for (const month of months) {
    const index = monthIndex(month.month)!;
    if (index < Math.max(start, operationStart)) continue;
    const fiscalYear = Math.floor((index - start) / 12);
    const prior = charged.get(fiscalYear) ?? { count: 0, full: 0, scheduled: 0 };
    charged.set(fiscalYear, { count: prior.count + 1, full: prior.full + cents(month.fullPropertyTax), scheduled: prior.scheduled + cents(month.propertyTax) });
  }
  const lastFiscalYear = Math.max(plan.fiscalYears.length - 1, ...charged.keys());
  const fiscalYears = Array.from({ length: lastFiscalYear + 1 }, (_, fiscalYear): PropertyTaxFiscalYearRow => {
    const terms = fiscalYearTerms(plan, fiscalYear);
    const annual = plan.assessmentBasis === "stated_assessed_value" ? annualTax(plan, terms) : null;
    const total = charged.get(fiscalYear) ?? { count: 0, full: 0, scheduled: 0 };
    const scheduled = plan.mode === "full_tax" ? annual?.full ?? null : terms.statedPayment !== null ? cents(terms.statedPayment) : annual?.scheduled ?? null;
    return {
      fiscalYear: fiscalYear + 1,
      startMonth: monthLabel(start + fiscalYear * 12),
      endMonth: monthLabel(start + fiscalYear * 12 + 11),
      listed: fiscalYear < plan.fiscalYears.length,
      rate: terms.rate,
      ratePerDollarOfAssessedValue: terms.ratePerDollar,
      exemptionPercent: terms.exemptionPercent,
      statedPayment: terms.statedPayment,
      annualFullTax: annual === null ? null : dollars(annual.full),
      annualScheduledTax: scheduled === null ? null : dollars(scheduled),
      chargedMonths: total.count,
      chargedFullTax: dollars(total.full),
      chargedScheduledTax: dollars(total.scheduled),
    };
  });
  const listed = fiscalYears.filter(({ listed }) => listed);
  const ratio = plan.assessmentRatioPercent;
  return {
    mode: plan.mode,
    assessmentBasis: plan.assessmentBasis,
    rateUnit: plan.rateUnit,
    scheduleEndMonth: propertyTaxScheduleEndMonth(plan),
    fiscalYears,
    listedScheduledTaxTotal: listed.every(({ annualScheduledTax }) => annualScheduledTax !== null)
      ? dollars(listed.reduce((sum, row) => sum + cents(row.annualScheduledTax!), 0))
      : null,
    effectiveRateOnMarketValue: ratio === undefined ? null : ratePerDollar(plan, plan.fiscalYears[0].rate) * ratio / 100,
    impliedMarketValue: ratio === undefined || plan.assessmentBasis !== "stated_assessed_value"
      ? null
      : dollars(Math.round(cents(plan.landAssessedValue! + plan.improvementAssessedValue!) / (ratio / 100))),
    capRates: plan.assessmentBasis === "income" && plan.leaseUpAssessmentCapRatePercent !== undefined
      ? {
        leaseUpPercent: plan.leaseUpAssessmentCapRatePercent,
        stabilizedPercent: plan.assessmentCapRatePercent!,
        stabilizedFromMonth: firstStabilizedMonth ?? null,
      }
      : null,
  };
}

/** Last month of the last listed fiscal year. No abatement applies after it. */
export function propertyTaxScheduleEndMonth(plan: PropertyTaxPlan) {
  return monthLabel(monthIndex(plan.firstFiscalYearStartMonth)! + plan.fiscalYears.length * 12 - 1);
}

/**
 * Present value at the sale month of the tax the abatement saves from the sale month on: each month's
 * full less scheduled tax, discounted at one stated annual rate from the end of that month.
 * `months` must reach the end of the listed schedule.
 */
export function abatementValueAtSale(months: TaxMonth[], saleMonth: string, discountRatePercent: number) {
  const sale = monthIndex(saleMonth)!;
  const value = months.reduce((total, month) => {
    const offset = monthIndex(month.month)! - sale;
    if (offset < 0) return total;
    const savingCents = cents(month.fullPropertyTax) - cents(month.propertyTax);
    return total + savingCents / (1 + discountRatePercent / 100) ** ((offset + 1) / 12);
  }, 0);
  return dollars(Math.round(value));
}

function fiscalYearTerms(plan: PropertyTaxPlan, fiscalYear: number) {
  const listed = plan.fiscalYears[fiscalYear];
  if (listed) {
    return {
      rate: listed.rate,
      ratePerDollar: ratePerDollar(plan, listed.rate),
      exemptionPercent: plan.mode === "abatement" ? listed.exemptionPercent : 0,
      statedPayment: plan.mode === "abatement" && listed.statedPayment !== undefined ? listed.statedPayment : null,
    };
  }
  const last = plan.fiscalYears.at(-1)!;
  const rate = last.rate * (1 + plan.annualRateGrowthPercent / 100) ** (fiscalYear - plan.fiscalYears.length + 1);
  return { rate, ratePerDollar: ratePerDollar(plan, rate), exemptionPercent: 0, statedPayment: null };
}

function annualTax(plan: PropertyTaxPlan, terms: ReturnType<typeof fiscalYearTerms>) {
  const land = cents(plan.landAssessedValue!);
  const improvement = cents(plan.improvementAssessedValue!);
  return {
    full: Math.round((land + improvement) * terms.ratePerDollar),
    scheduled: Math.round((land + improvement * (1 - terms.exemptionPercent / 100)) * terms.ratePerDollar),
  };
}

function ratePerDollar(plan: PropertyTaxPlan, rate: number) {
  return rate / RATE_UNIT_DIVISORS[plan.rateUnit];
}

function annualAllocation(annualCents: number, position: number) {
  const prior = Math.round(annualCents * position / 12);
  const next = position === 11 ? annualCents : Math.round(annualCents * (position + 1) / 12);
  return next - prior;
}

function validateEvidence(issues: PropertyTaxIssue[], evidence: unknown) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    issues.push({ path: "propertyTax.taxEvidence", code: "missing_lines", message: "Add source and review details for the property tax schedule." });
    return;
  }
  for (const key of PROPERTY_TAX_ASSUMPTION_KEYS) {
    const item = (evidence as Record<string, PropertyTaxEvidence | undefined>)[key];
    const path = `propertyTax.taxEvidence.${key}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ path, code: "missing_lines", message: "Add source and review details." });
      continue;
    }
    if (item.sourceLabel !== undefined && typeof item.sourceLabel !== "string") issues.push({ path: `${path}.sourceLabel`, code: "missing_text", message: "Source label must be text." });
    else if (typeof item.sourceLabel === "string" && item.sourceLabel.length > MAX_PROPERTY_TAX_SOURCE_LABEL_LENGTH) issues.push({ path: `${path}.sourceLabel`, code: "text_too_long", message: `Source label cannot exceed ${MAX_PROPERTY_TAX_SOURCE_LABEL_LENGTH} characters.` });
    if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) issues.push({ path: `${path}.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
    if (item.reviewState !== "working" && item.reviewState !== "done") issues.push({ path: `${path}.reviewState`, code: "invalid_review_state", message: "Review state must be Working on It or Done." });
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validUsd(value: unknown) {
  if (!isFiniteNumber(value) || value < 0) return false;
  const valueCents = Math.round(value * 100);
  return Number.isSafeInteger(valueCents) && Math.abs(value - valueCents / 100) <= 1e-9;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function monthIndex(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function monthLabel(index: number) {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function round(value: number, places: number) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function dollars(valueCents: number) {
  return valueCents / 100;
}
