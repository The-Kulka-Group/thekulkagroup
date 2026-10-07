import {
  computeDevelopmentCapital,
  type ApartmentOperationsInputs,
  type DevelopmentCapitalInputs,
  type DevelopmentCapitalIssue,
  type DevelopmentCapitalPlan,
} from "@kulka/engine";

export type DevelopmentCapitalDraft = DevelopmentCapitalPlan;

export class InvalidDevelopmentCapital extends Error {
  constructor(
    message: string,
    readonly issues: DevelopmentCapitalIssue[],
    readonly fieldErrors: Record<string, string>,
  ) {
    super(message);
  }
}

export function parseDevelopmentCapital(
  body: unknown,
  operationsInputs: ApartmentOperationsInputs,
): DevelopmentCapitalDraft {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidDevelopmentCapital("Send a development capital object.", [], {});
  }
  const candidate = body as Record<string, unknown>;
  const checked = computeDevelopmentCapital({
    ...operationsInputs,
    capitalInputVersion: candidate.capitalInputVersion,
    targetDebtSharePercent: candidate.targetDebtSharePercent,
    annualInterestRatePercent: candidate.annualInterestRatePercent,
    loanFeePercent: candidate.loanFeePercent,
    fundingOrder: candidate.fundingOrder,
    interestTreatment: candidate.interestTreatment,
    interestConvention: candidate.interestConvention,
    feeMonth: candidate.feeMonth,
    payoffMonth: candidate.payoffMonth,
    ...(candidate.ratePath !== undefined && candidate.ratePath !== null ? { ratePath: candidate.ratePath } : {}),
    ...(candidate.otherSources !== undefined && candidate.otherSources !== null ? { otherSources: candidate.otherSources } : {}),
    ...(candidate.creditedLand !== undefined && candidate.creditedLand !== null ? { creditedLand: candidate.creditedLand } : {}),
    capitalAssumptionEvidence: candidate.capitalAssumptionEvidence,
  } as DevelopmentCapitalInputs);
  if (checked.status === "failed") {
    const issues = checked.issues.filter((issue): issue is DevelopmentCapitalIssue =>
      "path" in issue && !isOperationsPath(issue.path),
    );
    throw new InvalidDevelopmentCapital(
      "Review the development capital fields.",
      issues,
      Object.fromEntries(issues.map((issue) => [issue.path, issue.message])),
    );
  }
  return {
    capitalInputVersion: checked.inputSnapshot.capitalInputVersion,
    targetDebtSharePercent: checked.inputSnapshot.targetDebtSharePercent,
    annualInterestRatePercent: checked.inputSnapshot.annualInterestRatePercent,
    loanFeePercent: checked.inputSnapshot.loanFeePercent,
    fundingOrder: checked.inputSnapshot.fundingOrder,
    interestTreatment: checked.inputSnapshot.interestTreatment,
    interestConvention: checked.inputSnapshot.interestConvention,
    feeMonth: checked.inputSnapshot.feeMonth,
    payoffMonth: checked.inputSnapshot.payoffMonth,
    ...(checked.inputSnapshot.ratePath !== undefined ? { ratePath: checked.inputSnapshot.ratePath } : {}),
    ...(checked.inputSnapshot.otherSources !== undefined ? { otherSources: checked.inputSnapshot.otherSources } : {}),
    ...(checked.inputSnapshot.creditedLand !== undefined ? { creditedLand: checked.inputSnapshot.creditedLand } : {}),
    capitalAssumptionEvidence: checked.inputSnapshot.capitalAssumptionEvidence,
  };
}

function isOperationsPath(path: string) {
  return path === "inputVersion"
    || path === "analysisStartMonth"
    || path === "saleMonth"
    || path.startsWith("costLines")
    || path.startsWith("operation")
    || path.startsWith("growth")
    || path.startsWith("preleased")
    || path.startsWith("leaseUp")
    || path.startsWith("annualIncome")
    || path.startsWith("annualExpense")
    || path.startsWith("rentAdjustment")
    || path.startsWith("freeRent")
    || path.startsWith("vacancy")
    || path.startsWith("creditLoss")
    || path.startsWith("assumptionEvidence")
    || path.startsWith("residentialUnitTypes")
    || path.startsWith("otherIncomeLines")
    || path.startsWith("operatingExpenseLines")
    || path.startsWith("capitalExpenditureLines");
}
