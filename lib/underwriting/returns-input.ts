import {
  LENDER_TEST_ASSUMPTION_KEYS,
  LENDER_TEST_COMMERCIAL_CAP_KEY,
  PARTNERSHIP_ASSUMPTION_KEYS,
  SALE_TAX_ASSUMPTION_KEYS,
  validatePropertyReturnsPlan,
  type PropertyReturnsIssue,
  type PropertyReturnsPlan,
} from "@kulka/engine";

export type PropertyReturnsDraft = PropertyReturnsPlan;

export class InvalidPropertyReturns extends Error {
  constructor(
    message: string,
    readonly issues: PropertyReturnsIssue[],
    readonly fieldErrors: Record<string, string>,
  ) {
    super(message);
  }
}

function knownLenderTestFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const plan = value as Record<string, unknown>;
  const evidence = plan.lenderTestEvidence;
  return {
    lenderTestInputVersion: plan.lenderTestInputVersion,
    valuationMonth: plan.valuationMonth,
    asStabilizedCapRatePercent: plan.asStabilizedCapRatePercent,
    annualDebtService: plan.annualDebtService,
    noiBasis: plan.noiBasis,
    ...(plan.commercialCapRatePercent === undefined || plan.commercialCapRatePercent === null ? {} : { commercialCapRatePercent: plan.commercialCapRatePercent }),
    ...(plan.debtServiceBasis === undefined || plan.debtServiceBasis === null ? {} : { debtServiceBasis: plan.debtServiceBasis }),
    lenderTestEvidence: evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? Object.fromEntries([...LENDER_TEST_ASSUMPTION_KEYS, LENDER_TEST_COMMERCIAL_CAP_KEY].flatMap((key) => {
        const item = (evidence as Record<string, unknown>)[key];
        // The commercial cap carries evidence only when the plan states a cap.
        if (item === undefined && key === LENDER_TEST_COMMERCIAL_CAP_KEY) return [];
        if (!item || typeof item !== "object" || Array.isArray(item)) return [[key, item]];
        const { sourceLabel, sourceDate, reviewState } = item as Record<string, unknown>;
        return [[key, { sourceLabel, sourceDate, reviewState }]];
      }))
      : evidence,
    ...(plan.loanSizing === undefined ? {} : { loanSizing: knownLoanSizingFields(plan.loanSizing) }),
  };
}

function knownLoanSizingFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const sizing = value as Record<string, unknown>;
  const evidence = sizing.evidence;
  const optional = (key: string) => sizing[key] === undefined || sizing[key] === null ? {} : { [key]: sizing[key] };
  return {
    noiTaxBasis: sizing.noiTaxBasis,
    ...optional("maxLoanToValuePercent"),
    ...optional("minDebtYieldPercent"),
    ...optional("minDebtServiceCoverage"),
    ...optional("dscrRatePercent"),
    ...optional("dscrAmortizationYears"),
    evidence: evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? (({ sourceLabel, sourceDate, reviewState }: Record<string, unknown>) => ({ sourceLabel, sourceDate, reviewState }))(evidence as Record<string, unknown>)
      : evidence,
  };
}

function knownSaleTaxFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const plan = value as Record<string, unknown>;
  const evidence = plan.saleTaxEvidence;
  return {
    saleTaxInputVersion: plan.saleTaxInputVersion,
    valueBasis: plan.valueBasis,
    ...(plan.abatementDiscountRatePercent === undefined ? {} : { abatementDiscountRatePercent: plan.abatementDiscountRatePercent }),
    saleTaxEvidence: evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? Object.fromEntries(SALE_TAX_ASSUMPTION_KEYS.flatMap((key) => {
        const item = (evidence as Record<string, unknown>)[key];
        if (item === undefined) return [];
        if (!item || typeof item !== "object" || Array.isArray(item)) return [[key, item]];
        const { sourceLabel, sourceDate, reviewState } = item as Record<string, unknown>;
        return [[key, { sourceLabel, sourceDate, reviewState }]];
      }))
      : evidence,
  };
}

function knownPartnershipFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const plan = value as Record<string, unknown>;
  const split = (item: unknown) => item && typeof item === "object" && !Array.isArray(item)
    ? (({ promotePercent, lpBaseSharePercent }: Record<string, unknown>) => ({ promotePercent, lpBaseSharePercent }))(item as Record<string, unknown>)
    : item;
  const preferredReturn = plan.preferredReturn;
  const evidence = plan.partnershipEvidence;
  return {
    partnershipInputVersion: plan.partnershipInputVersion,
    lpFundingSharePercent: plan.lpFundingSharePercent,
    fundingOrder: plan.fundingOrder,
    ...(plan.lpEntryMonth === undefined || plan.lpEntryMonth === null ? {} : { lpEntryMonth: plan.lpEntryMonth }),
    ...(preferredReturn === undefined || preferredReturn === null ? {} : {
      preferredReturn: preferredReturn && typeof preferredReturn === "object" && !Array.isArray(preferredReturn)
        ? (({ ratePercent, accrual }: Record<string, unknown>) => ({ ratePercent, accrual }))(preferredReturn as Record<string, unknown>)
        : preferredReturn,
    }),
    tiers: Array.isArray(plan.tiers)
      ? plan.tiers.map((tier) => tier && typeof tier === "object" && !Array.isArray(tier)
        ? { lpIrrHurdlePercent: (tier as Record<string, unknown>).lpIrrHurdlePercent, ...split(tier) as object }
        : tier)
      : plan.tiers,
    finalSplit: split(plan.finalSplit),
    partnershipEvidence: evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? Object.fromEntries(PARTNERSHIP_ASSUMPTION_KEYS.flatMap((key) => {
        const item = (evidence as Record<string, unknown>)[key];
        if (item === undefined) return [];
        if (!item || typeof item !== "object" || Array.isArray(item)) return [[key, item]];
        const { sourceLabel, sourceDate, reviewState } = item as Record<string, unknown>;
        return [[key, {
          ...(sourceLabel === undefined ? {} : { sourceLabel }),
          ...(sourceDate === undefined ? {} : { sourceDate }),
          reviewState,
        }]];
      }))
      : evidence,
  };
}

export function parsePropertyReturns(body: unknown): PropertyReturnsDraft {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidPropertyReturns("Send a property sale and returns object.", [], {});
  }
  const candidate = body as Record<string, unknown>;
  const draft = {
    saleInputVersion: candidate.saleInputVersion,
    terminalCapRatePercent: candidate.terminalCapRatePercent,
    ...(candidate.commercialTerminalCapRatePercent === undefined || candidate.commercialTerminalCapRatePercent === null ? {} : { commercialTerminalCapRatePercent: candidate.commercialTerminalCapRatePercent }),
    sellingCostPercent: candidate.sellingCostPercent,
    forwardNoiConvention: candidate.forwardNoiConvention,
    cashFlowDateConvention: candidate.cashFlowDateConvention,
    xirrConvention: candidate.xirrConvention,
    saleAssumptionEvidence: candidate.saleAssumptionEvidence,
    ...(candidate.lenderTests === undefined ? {} : { lenderTests: knownLenderTestFields(candidate.lenderTests) }),
    ...(candidate.saleTax === undefined ? {} : { saleTax: knownSaleTaxFields(candidate.saleTax) }),
    ...(candidate.partnership === undefined || candidate.partnership === null ? {} : { partnership: knownPartnershipFields(candidate.partnership) }),
  } as PropertyReturnsPlan;
  const issues = validatePropertyReturnsPlan(draft);
  if (issues.length > 0) {
    throw new InvalidPropertyReturns(
      "Review the property sale and returns fields.",
      issues,
      Object.fromEntries(issues.map((issue) => [issue.path, issue.message])),
    );
  }
  return structuredClone(draft);
}
