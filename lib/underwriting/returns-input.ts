import {
  LENDER_TEST_ASSUMPTION_KEYS,
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
    lenderTestEvidence: evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? Object.fromEntries(LENDER_TEST_ASSUMPTION_KEYS.map((key) => {
        const item = (evidence as Record<string, unknown>)[key];
        if (!item || typeof item !== "object" || Array.isArray(item)) return [key, item];
        const { sourceLabel, sourceDate, reviewState } = item as Record<string, unknown>;
        return [key, { sourceLabel, sourceDate, reviewState }];
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
    sellingCostPercent: candidate.sellingCostPercent,
    forwardNoiConvention: candidate.forwardNoiConvention,
    cashFlowDateConvention: candidate.cashFlowDateConvention,
    xirrConvention: candidate.xirrConvention,
    saleAssumptionEvidence: candidate.saleAssumptionEvidence,
    ...(candidate.lenderTests === undefined ? {} : { lenderTests: knownLenderTestFields(candidate.lenderTests) }),
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
