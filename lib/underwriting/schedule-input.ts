import {
  computeMonthlyCostSchedule,
  type MonthlyCostIssue,
  type MonthlyCostScheduleInputs,
} from "@kulka/engine";

export class InvalidCostSchedule extends Error {
  constructor(
    message: string,
    readonly issues: MonthlyCostIssue[],
    readonly fieldErrors: Record<string, string>,
  ) {
    super(message);
  }
}

export function parseCostSchedule(body: unknown): MonthlyCostScheduleInputs {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidCostSchedule("Send a cost schedule object.", [], {});
  }
  const candidate = body as Record<string, unknown>;
  const schedule = {
    analysisStartMonth: candidate.analysisStartMonth,
    saleMonth: candidate.saleMonth,
    costLines: candidate.costLines,
  } as MonthlyCostScheduleInputs;
  const checked = computeMonthlyCostSchedule(schedule);
  if (checked.status === "failed") {
    throw new InvalidCostSchedule(
      "Review the cost schedule fields.",
      checked.issues,
      checked.issues.reduce<Record<string, string>>((errors, item) => {
        errors[item.path] = errors[item.path]
          ? `${errors[item.path]} ${item.message}`
          : item.message;
        return errors;
      }, {}),
    );
  }
  return checked.inputSnapshot;
}
