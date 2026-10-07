/*
 * LA-1813: grants, soft loans and credited land as funding sources next to equity and the senior
 * construction loan. A source brings cash on its own draw months, and the funding schedule applies
 * that cash to project uses before equity and debt. Soft loans accrue interest on the opening
 * balance and repay principal plus interest in one stated month. Credited land is a value kept apart
 * from cash land cost: it never counts as cash spent, and it counts as sponsor equity only when the
 * deal says so.
 */

export const MAX_OTHER_SOURCES = 20;
export const MAX_OTHER_SOURCE_DRAWS = 120;
export const MAX_OTHER_SOURCE_TEXT_LENGTH = 500;

export type OtherSourceKind = "grant" | "soft_loan";

export type OtherSourceDraw = {
  month: string;
  amount: number;
};

export type OtherFundingSource = {
  id: string;
  name: string;
  kind: OtherSourceKind;
  /** One draw is a single draw month. Several draws are a schedule. */
  draws: OtherSourceDraw[];
  /** Soft loans only. Interest accrues monthly on the opening balance and is paid at repayment. */
  annualInterestRatePercent?: number;
  /** Soft loans only. Principal and accrued interest are repaid in this month. */
  repaymentMonth?: string;
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: "working" | "done";
};

export type CreditedLandPlan = {
  /** The land value the deal credits, in place of the cash cost. Never below cash land cost. */
  creditedValue: number;
  /** True only where the deal counts the credit as sponsor equity. */
  countsAsSponsorEquity: boolean;
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: "working" | "done";
};

export type OtherSourceIssueCode =
  | "invalid_other_source"
  | "invalid_credited_land"
  | "credited_land_below_cash_cost"
  | "invalid_amount"
  | "invalid_month"
  | "outside_timeline"
  | "repayment_before_draw"
  | "invalid_percent"
  | "invalid_source_label"
  | "invalid_source_date"
  | "invalid_review_state"
  | "text_too_long";

export type OtherSourceIssue = {
  path: string;
  code: OtherSourceIssueCode;
  message: string;
};

export type OtherSourceMonthCents = {
  drawCents: number;
  interestCents: number;
  repaymentCents: number;
  closingBalanceCents: number;
};

export type OtherSourceScheduleCents = {
  source: OtherFundingSource;
  months: OtherSourceMonthCents[];
};

export function validateOtherFunding(
  sources: unknown,
  creditedLand: unknown,
  firstMonth: string,
  lastMonth: string,
): OtherSourceIssue[] {
  const issues: OtherSourceIssue[] = [];
  const first = monthIndex(firstMonth);
  const last = monthIndex(lastMonth);
  if (sources !== undefined) validateSources(issues, sources, first, last);
  if (creditedLand !== undefined) validateCreditedLand(issues, creditedLand);
  return issues;
}

function validateSources(issues: OtherSourceIssue[], sources: unknown, first: number | null, last: number | null) {
  if (!Array.isArray(sources)) {
    add(issues, "otherSources", "invalid_other_source", "Other sources must be a list of grants and soft loans.");
    return;
  }
  if (sources.length > MAX_OTHER_SOURCES) {
    add(issues, "otherSources", "invalid_other_source", `Add no more than ${MAX_OTHER_SOURCES} other sources.`);
    return;
  }
  const seen = new Set<string>();
  sources.forEach((source, index) => {
    const path = `otherSources.${index}`;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      add(issues, path, "invalid_other_source", "Each other source must be an object.");
      return;
    }
    const candidate = source as OtherFundingSource;
    if (typeof candidate.id !== "string" || candidate.id.trim() === "") add(issues, `${path}.id`, "invalid_other_source", "Give the source an id.");
    else if (seen.has(candidate.id)) add(issues, `${path}.id`, "invalid_other_source", "Source ids must be unique.");
    else seen.add(candidate.id);
    if (typeof candidate.name !== "string" || candidate.name.trim() === "") add(issues, `${path}.name`, "invalid_other_source", "Give the source a name.");
    else if (candidate.name.length > MAX_OTHER_SOURCE_TEXT_LENGTH) add(issues, `${path}.name`, "text_too_long", `Name cannot exceed ${MAX_OTHER_SOURCE_TEXT_LENGTH} characters.`);
    if (candidate.kind !== "grant" && candidate.kind !== "soft_loan") {
      add(issues, `${path}.kind`, "invalid_other_source", "Kind must be Grant or Soft Loan.");
    }
    validateEvidence(issues, path, candidate);

    let lastDraw: number | null = null;
    if (!Array.isArray(candidate.draws) || candidate.draws.length === 0) {
      add(issues, `${path}.draws`, "invalid_other_source", "Add at least one draw with a month and an amount.");
    } else if (candidate.draws.length > MAX_OTHER_SOURCE_DRAWS) {
      add(issues, `${path}.draws`, "invalid_other_source", `Add no more than ${MAX_OTHER_SOURCE_DRAWS} draws to one source.`);
    } else {
      const months = new Set<string>();
      candidate.draws.forEach((draw, drawIndex) => {
        const drawPath = `${path}.draws.${drawIndex}`;
        const drawMonth = monthIndex(draw?.month);
        if (drawMonth === null) add(issues, `${drawPath}.month`, "invalid_month", "Draw month must use YYYY-MM.");
        else {
          if (first !== null && last !== null && (drawMonth < first || drawMonth > last)) {
            add(issues, `${drawPath}.month`, "outside_timeline", "Draw month must stay within the model timeline.");
          }
          if (months.has(draw.month)) add(issues, `${drawPath}.month`, "invalid_other_source", "Each draw month can appear once. Combine draws in the same month.");
          months.add(draw.month);
          if (lastDraw === null || drawMonth > lastDraw) lastDraw = drawMonth;
        }
        if (!validPositiveUsd(draw?.amount)) {
          add(issues, `${drawPath}.amount`, "invalid_amount", "Draw amount must be a positive USD amount with no more than two decimal places.");
        }
      });
    }

    if (candidate.kind === "soft_loan") {
      const rate = candidate.annualInterestRatePercent;
      if (typeof rate !== "number" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
        add(issues, `${path}.annualInterestRatePercent`, "invalid_percent", "A soft loan needs an interest rate from 0 to 100 percent.");
      }
      const repayment = monthIndex(candidate.repaymentMonth);
      if (repayment === null) add(issues, `${path}.repaymentMonth`, "invalid_month", "A soft loan needs a repayment month in YYYY-MM.");
      else {
        if (first !== null && last !== null && (repayment < first || repayment > last)) {
          add(issues, `${path}.repaymentMonth`, "outside_timeline", "Repayment month must stay within the model timeline.");
        }
        if (lastDraw !== null && repayment <= lastDraw) {
          add(issues, `${path}.repaymentMonth`, "repayment_before_draw", "Repayment must come after the last draw.");
        }
      }
    } else if (candidate.kind === "grant") {
      if (candidate.annualInterestRatePercent !== undefined || candidate.repaymentMonth !== undefined) {
        add(issues, path, "invalid_other_source", "A grant has no interest rate or repayment month. Use a soft loan for repayable money.");
      }
    }
  });
}

function validateCreditedLand(issues: OtherSourceIssue[], value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    add(issues, "creditedLand", "invalid_credited_land", "Credited land must be an object with a value and an equity choice.");
    return;
  }
  const land = value as CreditedLandPlan;
  if (!validUsd(land.creditedValue)) {
    add(issues, "creditedLand.creditedValue", "invalid_amount", "Credited land value must be zero or a positive USD amount with no more than two decimal places.");
  }
  if (typeof land.countsAsSponsorEquity !== "boolean") {
    add(issues, "creditedLand.countsAsSponsorEquity", "invalid_credited_land", "Say whether the deal counts the credited land as sponsor equity.");
  }
  validateEvidence(issues, "creditedLand", land);
}

function validateEvidence(
  issues: OtherSourceIssue[],
  path: string,
  item: { sourceLabel?: unknown; sourceDate?: unknown; reviewState?: unknown },
) {
  if (item.sourceLabel !== undefined && typeof item.sourceLabel !== "string") {
    add(issues, `${path}.sourceLabel`, "invalid_source_label", "Source label must be text.");
  } else if (typeof item.sourceLabel === "string" && item.sourceLabel.length > MAX_OTHER_SOURCE_TEXT_LENGTH) {
    add(issues, `${path}.sourceLabel`, "text_too_long", `Source label cannot exceed ${MAX_OTHER_SOURCE_TEXT_LENGTH} characters.`);
  }
  if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) {
    add(issues, `${path}.sourceDate`, "invalid_source_date", "Source date must be a valid YYYY-MM-DD date.");
  }
  if (item.reviewState !== "working" && item.reviewState !== "done") {
    add(issues, `${path}.reviewState`, "invalid_review_state", "Review state must be Working on It or Done.");
  }
}

/** Month by month draws, soft loan interest and repayment, and closing balance, in cents. */
export function scheduleOtherSources(sources: OtherFundingSource[], monthKeys: string[]): OtherSourceScheduleCents[] {
  return sources.map((source) => {
    const drawsByMonth = new Map(source.draws.map(({ month, amount }) => [month, cents(amount)]));
    const isLoan = source.kind === "soft_loan";
    const monthlyRate = (source.annualInterestRatePercent ?? 0) / 12;
    let balanceCents = 0;
    const months = monthKeys.map((month): OtherSourceMonthCents => {
      const drawCents = drawsByMonth.get(month) ?? 0;
      const interestCents = isLoan ? Math.round(balanceCents * monthlyRate / 100) : 0;
      const beforeRepaymentCents = balanceCents + drawCents + interestCents;
      const repaymentCents = isLoan && month === source.repaymentMonth ? beforeRepaymentCents : 0;
      balanceCents = isLoan ? beforeRepaymentCents - repaymentCents : 0;
      return { drawCents, interestCents, repaymentCents, closingBalanceCents: balanceCents };
    });
    return { source, months };
  });
}

function add(issues: OtherSourceIssue[], path: string, code: OtherSourceIssueCode, message: string) {
  issues.push({ path, code, message });
}

function validUsd(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
  const valueCents = Math.round(value * 100);
  return Number.isSafeInteger(valueCents) && Math.abs(value - valueCents / 100) <= 1e-9;
}

function validPositiveUsd(value: unknown) {
  return validUsd(value) && (value as number) > 0;
}

function monthIndex(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function cents(value: number) {
  return Math.round(value * 100);
}
