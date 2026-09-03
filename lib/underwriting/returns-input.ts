import {
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
