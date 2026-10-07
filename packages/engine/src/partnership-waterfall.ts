import type { ReconciliationCheck } from "./monthly-cost-schedule";
import type { PropertyReturnsIssue } from "./property-returns";
import { xirr, xnpv, yearsFrom } from "./xirr";

/*
 * LA-1863: the LP and GP partnership waterfall, run on the property run's reconciled levered cash flow.
 *
 * Each month the levered cash flow splits into partner contributions (the capital plan's equity
 * contribution, plus a cash call for any month that needs more) and distributable cash (what is left).
 * Contributions split by the funding order. Distributable cash runs, in order, through:
 *   1. the preferred return and then return of capital, when the plan carries a preferred return block;
 *   2. each IRR hurdle tier in turn. The LP takes its tier share until its own cash flow reaches the
 *      tier's IRR, and the GP takes the rest of the tier's cash: its base share plus the promote;
 *   3. the final split of whatever is left.
 * Hurdle accounts and the preferred return accrue monthly on the opening balance. Contributions made in
 * a month start to accrue the next month. The audited Benjamin template and the v2.98 sample use the
 * same rule.
 */

export const PARTNERSHIP_INPUT_VERSION = "partnership_inputs.v1" as const;
export const MAX_PARTNERSHIP_TIERS = 6;
export const MAX_PARTNERSHIP_SOURCE_LABEL_LENGTH = 500;
export const PARTNERSHIP_FUNDING_ORDERS = ["pari_passu", "gp_first"] as const;
export const PREFERRED_RETURN_ACCRUALS = ["compound_monthly", "simple_monthly"] as const;
/** Evidence keys. `preferredReturn` is required only when the plan carries a preferred return. */
export const PARTNERSHIP_ASSUMPTION_KEYS = ["funding", "preferredReturn", "promoteTiers"] as const;

export type PartnershipFundingOrder = (typeof PARTNERSHIP_FUNDING_ORDERS)[number];
export type PreferredReturnAccrual = (typeof PREFERRED_RETURN_ACCRUALS)[number];
export type PartnershipAssumptionKey = (typeof PARTNERSHIP_ASSUMPTION_KEYS)[number];

export type PartnershipEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: "working" | "done";
};

/** How a tier's cash splits: the GP promote comes off the top, and the LP base share applies to the rest. */
export type PartnershipSplit = {
  promotePercent: number;
  lpBaseSharePercent: number;
};

export type PartnershipTier = PartnershipSplit & {
  /** The LP IRR the tier runs up to, as an annual effective rate. */
  lpIrrHurdlePercent: number;
};

export type PreferredReturnPlan = {
  /** Annual rate. Zero returns capital first with no preferred return. */
  ratePercent: number;
  /**
   * compound_monthly accrues (1 + rate)^(1/12) - 1 a month on unreturned capital plus unpaid preferred
   * return, so a year compounds to the stated rate. simple_monthly accrues rate / 12 on unreturned
   * capital only.
   */
  accrual: PreferredReturnAccrual;
};

export type PartnershipPlan = {
  partnershipInputVersion: typeof PARTNERSHIP_INPUT_VERSION;
  /** LP share of every equity contribution. The GP funds the rest. */
  lpFundingSharePercent: number;
  /**
   * pari_passu: each contribution splits by funding share. gp_first: the GP funds its whole share of
   * total contributions before the LP funds.
   */
  fundingOrder: PartnershipFundingOrder;
  /**
   * The month the LP closes. The GP funds alone before it, and in this month the LP pays the GP a
   * catch-up that brings both to their funding shares. Absent means the LP is in from the first month.
   */
  lpEntryMonth?: string;
  /** Present: the preferred return, then return of capital, are paid to both partners before any tier. */
  preferredReturn?: PreferredReturnPlan;
  /** IRR hurdle tiers in order, lowest hurdle first. */
  tiers: PartnershipTier[];
  finalSplit: PartnershipSplit;
  partnershipEvidence: Partial<Record<PartnershipAssumptionKey, PartnershipEvidence>>;
};

export type PartnershipCashFlowMonth = {
  month: string;
  date: string;
  leveredCashFlow: number;
  /** The capital plan's equity contribution for the month. */
  equityContribution: number;
};

export type PartnershipLevelSplit = { lp: number; gpBase: number; promote: number; total: number };

export type PartnershipMonth = {
  month: string;
  date: string;
  leveredCashFlow: number;
  equityContribution: number;
  /** Cash the partners put in beyond the capital plan's equity contribution, when levered cash flow needs it. */
  cashCall: number;
  /** Levered cash flow plus the month's partner contributions. */
  distributable: number;
  lpContribution: number;
  /** Negative in the LP entry month, when the GP receives the LP catch-up. */
  gpContribution: number;
  /** Paid by the LP to the GP in its entry month, inside lpContribution. */
  lpCatchUp: number;
  lpPreferredReturnAccrued: number;
  gpPreferredReturnAccrued: number;
  lpPreferredReturnPaid: number;
  gpPreferredReturnPaid: number;
  lpCapitalReturned: number;
  gpCapitalReturned: number;
  tiers: PartnershipLevelSplit[];
  finalSplit: PartnershipLevelSplit;
  lpDistribution: number;
  gpDistribution: number;
  lpNetCashFlow: number;
  gpNetCashFlow: number;
};

export type PartnerReturns = {
  contributions: number;
  distributions: number;
  netProfit: number;
  xirr: number | null;
  equityMultiple: number | null;
  peakEquity: number;
  peakEquityMonth: string | null;
  preferredReturnAccrued: number;
  preferredReturnPaid: number;
  capitalReturned: number;
};

export type PartnershipTierResult = PartnershipLevelSplit & PartnershipTier & {
  /** LP hurdle account at the end of the run: what the LP still needs to reach the hurdle. Negative means past it. */
  closingHurdleBalance: number;
};

export type PartnershipMetricKey =
  | "lpContributions" | "gpContributions" | "lpDistributions" | "gpDistributions"
  | "lpNetProfit" | "gpNetProfit" | "lpXirr" | "gpXirr" | "lpEquityMultiple" | "gpEquityMultiple"
  | "lpPeakEquity" | "gpPeakEquity" | "lpPreferredReturnAccrued" | "gpPreferredReturnAccrued"
  | "promoteTotal" | "cashCalls";

export type PartnershipMetric = {
  key: PartnershipMetricKey;
  label: string;
  value: number | null;
  unit: "usd" | "ratio" | "multiple";
  formula: string;
  inputPaths: string[];
};

export type PartnershipIssue = {
  path: string;
  code: "lp_xirr_unavailable" | "gp_xirr_unavailable" | "gp_no_contributions";
  message: string;
};

export type PartnershipResult = {
  lpFundingSharePercent: number;
  fundingOrder: PartnershipFundingOrder;
  lpEntryMonth: string | null;
  preferredReturn: PreferredReturnPlan | null;
  lp: PartnerReturns;
  gp: PartnerReturns;
  tiers: PartnershipTierResult[];
  finalSplit: PartnershipLevelSplit & PartnershipSplit;
  promoteTotal: number;
  cashCalls: number;
  months: PartnershipMonth[];
  metrics: PartnershipMetric[];
  issues: PartnershipIssue[];
};

export type PartnershipRun = {
  status: "complete" | "failed";
  issues: PropertyReturnsIssue[];
  result: PartnershipResult | null;
  reconciliations: ReconciliationCheck[];
};

export type PeakEquity = { amount: number; month: string | null };

/** The largest cumulative net equity out: the running sum of negative levered cash flow less positive. */
export function peakEquityOf(months: Array<{ month: string; leveredCashFlow: number }>): PeakEquity {
  let runningCents = 0;
  let peakCents = 0;
  let peakMonth: string | null = null;
  for (const month of months) {
    runningCents -= cents(month.leveredCashFlow);
    if (runningCents > peakCents) {
      peakCents = runningCents;
      peakMonth = month.month;
    }
  }
  return { amount: dollars(peakCents), month: peakMonth };
}

export function validatePartnershipPlan(value: unknown): PropertyReturnsIssue[] {
  const root = "partnership";
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ path: root, code: "invalid_partnership", message: "The partnership waterfall must be an object." }];
  }
  const plan = value as PartnershipPlan;
  const issues: PropertyReturnsIssue[] = [];
  const bad = (path: string, message: string) => issues.push({ path: `${root}.${path}`, code: "invalid_partnership", message });
  if (plan.partnershipInputVersion !== PARTNERSHIP_INPUT_VERSION) {
    issues.push({ path: `${root}.partnershipInputVersion`, code: "unsupported_input_version", message: `Use ${PARTNERSHIP_INPUT_VERSION}.` });
  }
  if (!percentIn(plan.lpFundingSharePercent, false, true)) bad("lpFundingSharePercent", "LP funding share must be above zero and no more than 100 percent.");
  if (!PARTNERSHIP_FUNDING_ORDERS.includes(plan.fundingOrder)) bad("fundingOrder", "Funding order must be Pari Passu or GP First.");
  if (plan.lpEntryMonth !== undefined && monthIndex(plan.lpEntryMonth) === null) bad("lpEntryMonth", "LP entry month must use YYYY-MM.");
  if (plan.preferredReturn !== undefined) {
    const pref = plan.preferredReturn;
    if (!pref || typeof pref !== "object" || Array.isArray(pref)) {
      bad("preferredReturn", "The preferred return must be an object.");
    } else {
      if (!percentIn(pref.ratePercent, true, true)) bad("preferredReturn.ratePercent", "Preferred return must be from 0 to 100 percent.");
      if (!PREFERRED_RETURN_ACCRUALS.includes(pref.accrual)) bad("preferredReturn.accrual", "Preferred return accrual must be Compound Monthly or Simple Monthly.");
    }
  }
  if (!Array.isArray(plan.tiers)) {
    bad("tiers", "Tiers must be a list.");
  } else {
    if (plan.tiers.length > MAX_PARTNERSHIP_TIERS) bad("tiers", `Use no more than ${MAX_PARTNERSHIP_TIERS} hurdle tiers.`);
    let prior = 0;
    plan.tiers.forEach((tier, index) => {
      if (!tier || typeof tier !== "object") {
        bad(`tiers.${index}`, "Each tier must be an object.");
        return;
      }
      const hurdle = tier.lpIrrHurdlePercent;
      if (!percentIn(hurdle, false, true)) bad(`tiers.${index}.lpIrrHurdlePercent`, "LP IRR hurdle must be above zero and no more than 100 percent.");
      else if (hurdle < prior) bad(`tiers.${index}.lpIrrHurdlePercent`, "List tiers from the lowest LP IRR hurdle to the highest.");
      else prior = hurdle;
      issues.push(...splitIssues(tier, `tiers.${index}`));
    });
  }
  if (!plan.finalSplit || typeof plan.finalSplit !== "object") bad("finalSplit", "Add the final split.");
  else issues.push(...splitIssues(plan.finalSplit, "finalSplit"));
  const evidence = plan.partnershipEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    issues.push({ path: `${root}.partnershipEvidence`, code: "missing_evidence", message: "Add source and review details for the partnership terms." });
    return issues;
  }
  for (const key of PARTNERSHIP_ASSUMPTION_KEYS) {
    const path = `${root}.partnershipEvidence.${key}`;
    const item = evidence[key];
    if (key === "preferredReturn" && plan.preferredReturn === undefined) {
      if (item !== undefined) issues.push({ path, code: "invalid_partnership", message: "Preferred return sources apply only when the waterfall has a preferred return." });
      continue;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ path, code: "missing_evidence", message: "Add source and review details." });
      continue;
    }
    if (item.sourceLabel !== undefined && (typeof item.sourceLabel !== "string" || item.sourceLabel.length > MAX_PARTNERSHIP_SOURCE_LABEL_LENGTH)) {
      issues.push({ path: `${path}.sourceLabel`, code: "invalid_source_label", message: `Source label must be text of no more than ${MAX_PARTNERSHIP_SOURCE_LABEL_LENGTH} characters.` });
    }
    if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) {
      issues.push({ path: `${path}.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
    }
    if (item.reviewState !== "working" && item.reviewState !== "done") {
      issues.push({ path: `${path}.reviewState`, code: "invalid_review_state", message: "Review state must be Working on It or Done." });
    }
  }
  return issues;
}

function splitIssues(split: PartnershipSplit, path: string): PropertyReturnsIssue[] {
  const issues: PropertyReturnsIssue[] = [];
  if (!(typeof split.promotePercent === "number" && Number.isFinite(split.promotePercent) && split.promotePercent >= 0 && split.promotePercent < 100)) {
    issues.push({ path: `partnership.${path}.promotePercent`, code: "invalid_partnership", message: "Promote must be from 0 to less than 100 percent." });
  }
  if (!percentIn(split.lpBaseSharePercent, false, true)) {
    issues.push({ path: `partnership.${path}.lpBaseSharePercent`, code: "invalid_partnership", message: "LP base share must be above zero and no more than 100 percent." });
  }
  return issues;
}

type PartnerState = { capitalCents: number; prefCents: number };

/**
 * Runs the waterfall on dated monthly levered cash flow. `leveredInputPaths` are the input paths behind
 * levered cash flow, so each partnership trace lists them with the partnership terms.
 */
export function runPartnershipWaterfall(
  submittedMonths: PartnershipCashFlowMonth[],
  submittedPlan: PartnershipPlan,
  leveredInputPaths: string[] = [],
): PartnershipRun {
  const months = structuredClone(submittedMonths);
  const plan = structuredClone(submittedPlan);
  const planIssues = validatePartnershipPlan(plan);
  if (planIssues.length > 0) return failed(planIssues);
  if (months.length === 0) return failed([{ path: "partnership", code: "invalid_partnership", message: "The waterfall needs at least one month of levered cash flow." }]);
  const entryIndex = plan.lpEntryMonth === undefined ? 0 : months.findIndex(({ month }) => month === plan.lpEntryMonth);
  if (entryIndex < 0) {
    return failed([{ path: "partnership.lpEntryMonth", code: "partnership_outside_timeline", message: `LP entry month must fall from ${months[0].month} to ${months.at(-1)!.month}.` }]);
  }

  const share = plan.lpFundingSharePercent / 100;
  const leveredCents = months.map(({ leveredCashFlow }) => cents(leveredCashFlow));
  const equityCents = months.map(({ equityContribution }) => cents(equityContribution));
  const cashCallCents = months.map((_, index) => Math.max(-(leveredCents[index] + equityCents[index]), 0));
  const contributionCents = months.map((_, index) => equityCents[index] + cashCallCents[index]);
  const distributableCents = months.map((_, index) => leveredCents[index] + contributionCents[index]);
  const totalContributionCents = sum(contributionCents);
  const gpTargetCents = totalContributionCents - Math.round(totalContributionCents * share);

  const pref = plan.preferredReturn;
  const prefRate = pref ? (pref.accrual === "compound_monthly" ? monthlyRate(pref.ratePercent) : pref.ratePercent / 100 / 12) : 0;
  const tierRates = plan.tiers.map(({ lpIrrHurdlePercent }) => monthlyRate(lpIrrHurdlePercent));
  const tierLpShares = plan.tiers.map(lpShareOf);
  const finalLpShare = lpShareOf(plan.finalSplit);
  const lp: PartnerState = { capitalCents: 0, prefCents: 0 };
  const gp: PartnerState = { capitalCents: 0, prefCents: 0 };
  const hurdleCents = plan.tiers.map(() => 0);
  let gpFundedCents = 0;
  let fundedCents = 0;

  const rows: PartnershipMonth[] = months.map((month, index) => {
    // Funding.
    const contribution = contributionCents[index];
    let lpContribution = 0;
    let gpContribution = contribution;
    let lpCatchUp = 0;
    if (index >= entryIndex) {
      if (index === entryIndex && entryIndex > 0) {
        lpCatchUp = plan.fundingOrder === "pari_passu"
          ? Math.round(fundedCents * share)
          : Math.max(gpFundedCents - gpTargetCents, 0);
      }
      const gpNetBefore = gpFundedCents - lpCatchUp;
      const gpRegular = plan.fundingOrder === "pari_passu"
        ? contribution - Math.round(contribution * share)
        : Math.min(Math.max(gpTargetCents - gpNetBefore, 0), contribution);
      lpContribution = contribution - gpRegular + lpCatchUp;
      gpContribution = gpRegular - lpCatchUp;
    }
    gpFundedCents += gpContribution;
    fundedCents += contribution;

    // Preferred return accrues on opening balances, before this month's contributions.
    const lpAccrued = pref ? Math.round((lp.capitalCents + (pref.accrual === "compound_monthly" ? lp.prefCents : 0)) * prefRate) : 0;
    const gpAccrued = pref ? Math.round((gp.capitalCents + (pref.accrual === "compound_monthly" ? gp.prefCents : 0)) * prefRate) : 0;
    lp.prefCents += lpAccrued;
    gp.prefCents += gpAccrued;
    lp.capitalCents += lpContribution;
    gp.capitalCents += gpContribution;

    let cash = distributableCents[index];
    const [lpPrefPaid, gpPrefPaid] = pref ? payProRata(cash, lp.prefCents, gp.prefCents) : [0, 0];
    lp.prefCents -= lpPrefPaid;
    gp.prefCents -= gpPrefPaid;
    cash -= lpPrefPaid + gpPrefPaid;
    const [lpCapital, gpCapital] = pref ? payProRata(cash, lp.capitalCents, gp.capitalCents) : [0, 0];
    lp.capitalCents -= lpCapital;
    gp.capitalCents -= gpCapital;
    cash -= lpCapital + gpCapital;

    // Hurdle accounts accrue on opening balances and take this month's LP contribution.
    plan.tiers.forEach((_, tierIndex) => {
      hurdleCents[tierIndex] += Math.round(hurdleCents[tierIndex] * tierRates[tierIndex]) + lpContribution;
    });
    let lpPaid = lpPrefPaid + lpCapital;
    const tiers = plan.tiers.map((tier, tierIndex): PartnershipLevelSplit => {
      const lpShare = tierLpShares[tierIndex];
      const lpShareCash = Math.round(cash * lpShare);
      const needed = Math.max(hurdleCents[tierIndex] - lpPaid, 0);
      const lpTier = Math.min(lpShareCash, needed);
      const total = lpTier === lpShareCash ? cash : Math.min(cash, Math.round(lpTier / lpShare));
      const promote = Math.min(Math.round(total * tier.promotePercent / 100), total - lpTier);
      cash -= total;
      lpPaid += lpTier;
      return { lp: dollars(lpTier), gpBase: dollars(total - lpTier - promote), promote: dollars(promote), total: dollars(total) };
    });
    const lpFinal = Math.round(cash * finalLpShare);
    const finalPromote = Math.min(Math.round(cash * plan.finalSplit.promotePercent / 100), cash - lpFinal);
    const finalSplit = { lp: dollars(lpFinal), gpBase: dollars(cash - lpFinal - finalPromote), promote: dollars(finalPromote), total: dollars(cash) };
    lpPaid += lpFinal;
    // The LP IRR lookback: every LP distribution this month reduces every hurdle account.
    plan.tiers.forEach((_, tierIndex) => { hurdleCents[tierIndex] -= lpPaid; });

    const lpDistribution = lpPaid;
    const gpDistribution = distributableCents[index] - lpDistribution;
    return {
      month: month.month,
      date: month.date,
      leveredCashFlow: dollars(leveredCents[index]),
      equityContribution: dollars(equityCents[index]),
      cashCall: dollars(cashCallCents[index]),
      distributable: dollars(distributableCents[index]),
      lpContribution: dollars(lpContribution),
      gpContribution: dollars(gpContribution),
      lpCatchUp: dollars(lpCatchUp),
      lpPreferredReturnAccrued: dollars(lpAccrued),
      gpPreferredReturnAccrued: dollars(gpAccrued),
      lpPreferredReturnPaid: dollars(lpPrefPaid),
      gpPreferredReturnPaid: dollars(gpPrefPaid),
      lpCapitalReturned: dollars(lpCapital),
      gpCapitalReturned: dollars(gpCapital),
      tiers,
      finalSplit,
      lpDistribution: dollars(lpDistribution),
      gpDistribution: dollars(gpDistribution),
      lpNetCashFlow: dollars(lpDistribution - lpContribution),
      gpNetCashFlow: dollars(gpDistribution - gpContribution),
    };
  });

  const issues: PartnershipIssue[] = [];
  const lpReturns = partnerReturns(rows, "lp", issues);
  const gpReturns = partnerReturns(rows, "gp", issues);
  const tierResults = plan.tiers.map((tier, tierIndex): PartnershipTierResult => ({
    ...tier,
    ...levelTotals(rows.map((row) => row.tiers[tierIndex])),
    closingHurdleBalance: dollars(hurdleCents[tierIndex]),
  }));
  const finalTotals = { ...plan.finalSplit, ...levelTotals(rows.map((row) => row.finalSplit)) };
  const promoteTotal = dollars(tierResults.reduce((total, tier) => total + cents(tier.promote), cents(finalTotals.promote)));
  const cashCalls = dollars(sum(cashCallCents));
  const reconciliations = reconcile(rows, lpReturns, gpReturns, months);
  const result: PartnershipResult = {
    lpFundingSharePercent: plan.lpFundingSharePercent,
    fundingOrder: plan.fundingOrder,
    lpEntryMonth: plan.lpEntryMonth ?? null,
    preferredReturn: plan.preferredReturn ?? null,
    lp: lpReturns.returns,
    gp: gpReturns.returns,
    tiers: tierResults,
    finalSplit: finalTotals,
    promoteTotal,
    cashCalls,
    months: rows,
    metrics: metricsFor(plan, lpReturns.returns, gpReturns.returns, promoteTotal, cashCalls, rootPaths(leveredInputPaths, ["partnership"])),
    issues,
  };
  if (reconciliations.some(({ status }) => status === "fail")) {
    return {
      status: "failed",
      issues: [{ path: "partnership", code: "derived_results", message: "The partnership waterfall did not reconcile to levered cash flow within one cent." }],
      result: null,
      reconciliations,
    };
  }
  return { status: "complete", issues: [], result, reconciliations };
}

type PartnerReturnsWithXirr = {
  returns: PartnerReturns;
  xirr: Extract<ReturnType<typeof xirr>, { status: "ok" }> | null;
  netCents: number[];
};

function partnerReturns(rows: PartnershipMonth[], partner: "lp" | "gp", issues: PartnershipIssue[]): PartnerReturnsWithXirr {
  const contributionKey = partner === "lp" ? "lpContribution" : "gpContribution";
  const distributionKey = partner === "lp" ? "lpDistribution" : "gpDistribution";
  const contributions = sum(rows.map((row) => cents(row[contributionKey])));
  const distributions = sum(rows.map((row) => cents(row[distributionKey])));
  const netCents = rows.map((row) => cents(row[distributionKey]) - cents(row[contributionKey]));
  const rate = xirr(rows.map((row, index) => ({ date: row.date, amountCents: netCents[index] })));
  const label = partner === "lp" ? "LP" : "GP";
  if (rate.status !== "ok") {
    issues.push({
      path: `partnership.${partner}`,
      code: partner === "lp" ? "lp_xirr_unavailable" : "gp_xirr_unavailable",
      message: rate.status === "no_root"
        ? `${label} XIRR needs at least one dated contribution and one dated distribution.`
        : `${label} XIRR could not meet the scale-aware XNPV residual tolerance.`,
    });
  }
  if (partner === "gp" && contributions <= 0) {
    issues.push({ path: "partnership.gp", code: "gp_no_contributions", message: "The GP puts in no net equity, so it has no equity multiple." });
  }
  let running = 0;
  let peak = 0;
  let peakMonth: string | null = null;
  rows.forEach((row, index) => {
    running -= netCents[index];
    if (running > peak) {
      peak = running;
      peakMonth = row.month;
    }
  });
  const field = (key: keyof PartnershipMonth) => dollars(sum(rows.map((row) => cents(row[key] as number))));
  return {
    returns: {
      contributions: dollars(contributions),
      distributions: dollars(distributions),
      netProfit: dollars(distributions - contributions),
      xirr: rate.status === "ok" ? rate.rate : null,
      equityMultiple: contributions > 0 ? distributions / contributions : null,
      peakEquity: dollars(peak),
      peakEquityMonth: peakMonth,
      preferredReturnAccrued: field(partner === "lp" ? "lpPreferredReturnAccrued" : "gpPreferredReturnAccrued"),
      preferredReturnPaid: field(partner === "lp" ? "lpPreferredReturnPaid" : "gpPreferredReturnPaid"),
      capitalReturned: field(partner === "lp" ? "lpCapitalReturned" : "gpCapitalReturned"),
    },
    xirr: rate.status === "ok" ? rate : null,
    netCents,
  };
}

function reconcile(
  rows: PartnershipMonth[],
  lp: PartnerReturnsWithXirr,
  gp: PartnerReturnsWithXirr,
  months: PartnershipCashFlowMonth[],
): ReconciliationCheck[] {
  const checks: ReconciliationCheck[] = rows.flatMap((row) => [
    checkUsd(
      `partnership-distributions:${row.month}`,
      `${row.month} LP plus GP distributions less LP plus GP contributions equal levered cash flow`,
      row.leveredCashFlow,
      dollars(cents(row.lpDistribution) + cents(row.gpDistribution) - cents(row.lpContribution) - cents(row.gpContribution)),
    ),
    checkUsd(
      `partnership-contributions:${row.month}`,
      `${row.month} LP plus GP contributions equal the capital plan's equity contribution plus any cash call`,
      dollars(cents(row.equityContribution) + cents(row.cashCall)),
      dollars(cents(row.lpContribution) + cents(row.gpContribution)),
    ),
  ]);
  const equityCents = sum(months.map(({ equityContribution }) => cents(equityContribution)));
  const cashCallCents = sum(rows.map(({ cashCall }) => cents(cashCall)));
  const leveredCents = sum(months.map(({ leveredCashFlow }) => cents(leveredCashFlow)));
  checks.push(
    checkUsd("partnership-contributions", "LP plus GP contributions equal equity contributions from the capital plan plus cash calls", dollars(equityCents + cashCallCents), dollars(cents(lp.returns.contributions) + cents(gp.returns.contributions))),
    checkUsd("partnership-net-profit", "LP plus GP net profit equals levered net profit", dollars(leveredCents), dollars(cents(lp.returns.netProfit) + cents(gp.returns.netProfit))),
  );
  for (const [partner, stream] of [["lp", lp], ["gp", gp]] as const) {
    if (!stream.xirr) continue;
    const dated = rows.map((row, index) => ({ amountCents: stream.netCents[index], years: yearsFrom(rows[0].date, row.date) }));
    checks.push({
      id: `${partner}-xirr-residual`,
      label: `${partner.toUpperCase()} XIRR has a scale-aware XNPV residual`,
      expected: 0,
      actual: dollars(xnpv(dated, stream.xirr.rate)),
      difference: dollars(xnpv(dated, stream.xirr.rate)),
      tolerance: dollars(stream.xirr.toleranceCents),
      status: Math.abs(xnpv(dated, stream.xirr.rate)) <= stream.xirr.toleranceCents ? "pass" : "fail",
      unit: "usd",
    });
  }
  return checks;
}

function metricsFor(
  plan: PartnershipPlan,
  lp: PartnerReturns,
  gp: PartnerReturns,
  promoteTotal: number,
  cashCalls: number,
  inputPaths: string[],
): PartnershipMetric[] {
  const funding = plan.fundingOrder === "pari_passu"
    ? `each month's equity contribution and cash call split ${number(plan.lpFundingSharePercent)} percent LP`
    : `the GP funds ${number(100 - plan.lpFundingSharePercent)} percent of total contributions first, then the LP funds the rest`;
  const entry = plan.lpEntryMonth ? `; the GP funds alone before ${plan.lpEntryMonth}, when the LP pays the GP a catch-up to its funding share` : "";
  const pref = plan.preferredReturn
    ? `a ${number(plan.preferredReturn.ratePercent)} percent preferred return accrued ${plan.preferredReturn.accrual === "compound_monthly" ? "monthly, compounding to the annual rate on unreturned capital plus unpaid preferred return" : "at one twelfth of the rate a month on unreturned capital"}, paid pro rata to what each partner is owed, then return of capital pro rata, then `
    : "";
  const tiers = plan.tiers.length > 0
    ? `${plan.tiers.map((tier) => `to a ${number(tier.lpIrrHurdlePercent)} percent LP IRR with a ${number(tier.promotePercent)} percent promote`).join(", ")}, then `
    : "";
  const waterfall = `distributable cash runs through ${pref}${tiers}a final split with a ${number(plan.finalSplit.promotePercent)} percent promote`;
  const usd = (key: PartnershipMetricKey, label: string, value: number, formula: string): PartnershipMetric => ({ key, label, value, unit: "usd", formula, inputPaths });
  const metrics: PartnershipMetric[] = [
    usd("lpContributions", "LP Contributions", lp.contributions, `LP share of partner contributions: ${funding}${entry}`),
    usd("gpContributions", "GP Contributions", gp.contributions, `GP share of partner contributions, net of any LP catch-up received: ${funding}${entry}`),
    usd("lpDistributions", "LP Distributions", lp.distributions, `LP cash from the waterfall each month: ${waterfall}`),
    usd("gpDistributions", "GP Distributions", gp.distributions, `GP cash from the waterfall each month, base share and promote: ${waterfall}`),
    usd("lpNetProfit", "LP Net Profit", lp.netProfit, "LP distributions less LP contributions"),
    usd("gpNetProfit", "GP Net Profit", gp.netProfit, "GP distributions less GP contributions"),
    { key: "lpXirr", label: "LP XIRR", value: lp.xirr, unit: "ratio", formula: "actual-day XIRR of dated monthly LP distributions less contributions", inputPaths },
    { key: "gpXirr", label: "GP XIRR", value: gp.xirr, unit: "ratio", formula: "actual-day XIRR of dated monthly GP distributions less contributions", inputPaths },
    { key: "lpEquityMultiple", label: "LP Equity Multiple", value: lp.equityMultiple, unit: "multiple", formula: "LP distributions divided by LP contributions", inputPaths },
    { key: "gpEquityMultiple", label: "GP Equity Multiple", value: gp.equityMultiple, unit: "multiple", formula: "GP distributions divided by GP contributions net of any catch-up received", inputPaths },
    usd("lpPeakEquity", "LP Peak Equity", lp.peakEquity, `largest cumulative LP contributions less distributions${lp.peakEquityMonth ? `, reached ${lp.peakEquityMonth}` : ""}`),
    usd("gpPeakEquity", "GP Peak Equity", gp.peakEquity, `largest cumulative GP contributions less distributions${gp.peakEquityMonth ? `, reached ${gp.peakEquityMonth}` : ""}`),
  ];
  if (plan.preferredReturn) {
    metrics.push(
      usd("lpPreferredReturnAccrued", "LP Preferred Return Accrued", lp.preferredReturnAccrued, "sum of the LP's monthly preferred return accrual on opening balances"),
      usd("gpPreferredReturnAccrued", "GP Preferred Return Accrued", gp.preferredReturnAccrued, "sum of the GP's monthly preferred return accrual on opening balances"),
    );
  }
  metrics.push(
    usd("promoteTotal", "GP Promote", promoteTotal, "the promote share of each tier's cash and of the final split, summed over the run"),
    usd("cashCalls", "Cash Calls", cashCalls, "levered cash flow below zero in a month beyond the capital plan's equity contribution, funded by the partners under the funding order"),
  );
  return metrics;
}

function levelTotals(levels: PartnershipLevelSplit[]): PartnershipLevelSplit {
  const total = (key: keyof PartnershipLevelSplit) => dollars(sum(levels.map((level) => cents(level[key]))));
  return { lp: total("lp"), gpBase: total("gpBase"), promote: total("promote"), total: total("total") };
}

/** Splits up to `available` between two balances in proportion to them, never paying either past its balance. */
function payProRata(available: number, lpOwed: number, gpOwed: number): [number, number] {
  const owed = lpOwed + gpOwed;
  if (owed <= 0 || available <= 0) return [0, 0];
  const paid = Math.min(available, owed);
  const lpPaid = Math.min(Math.round(paid * lpOwed / owed), lpOwed);
  return [lpPaid, Math.min(paid - lpPaid, gpOwed)];
}

function lpShareOf(split: PartnershipSplit) {
  return split.lpBaseSharePercent / 100 * (1 - split.promotePercent / 100);
}

function monthlyRate(annualPercent: number) {
  return (1 + annualPercent / 100) ** (1 / 12) - 1;
}

function percentIn(value: unknown, allowZero: boolean, allowHundred: boolean) {
  return typeof value === "number" && Number.isFinite(value)
    && (allowZero ? value >= 0 : value > 0)
    && (allowHundred ? value <= 100 : value < 100);
}

function checkUsd(id: string, label: string, expected: number, actual: number): ReconciliationCheck {
  const difference = dollars(cents(actual) - cents(expected));
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit: "usd" };
}

function failed(issues: PropertyReturnsIssue[]): PartnershipRun {
  return { status: "failed", issues, result: null, reconciliations: [] };
}

function rootPaths(...groups: string[][]) {
  return [...new Set(groups.flat())];
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function number(value: number) {
  return String(Math.round(value * 1_000_000) / 1_000_000);
}

function cents(value: number) {
  return Math.round(value * 100);
}

function dollars(valueCents: number) {
  return valueCents / 100;
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
