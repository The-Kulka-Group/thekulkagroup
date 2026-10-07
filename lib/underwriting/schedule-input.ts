import {
  computeMonthlyCostSchedule,
  type CostQuantities,
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

/** A form sends null for an anchor the user cleared. The engine reads an absent anchor as a typed month. */
function withoutNullAnchors(line: unknown) {
  if (!line || typeof line !== "object" || Array.isArray(line)) return line;
  const { startAnchor, endAnchor, ...rest } = line as Record<string, unknown>;
  return {
    ...rest,
    ...(startAnchor === null || startAnchor === undefined ? {} : { startAnchor }),
    ...(endAnchor === null || endAnchor === undefined ? {} : { endAnchor }),
  };
}

/** Quantities come from the saved case facts. Anything the request body says about them is ignored. */
export function parseCostSchedule(body: unknown, quantities: CostQuantities = {}): MonthlyCostScheduleInputs {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidCostSchedule("Send a cost schedule object.", [], {});
  }
  const candidate = body as Record<string, unknown>;
  const schedule = {
    analysisStartMonth: candidate.analysisStartMonth,
    saleMonth: candidate.saleMonth,
    ...(candidate.saleAnchor === null || candidate.saleAnchor === undefined ? {} : { saleAnchor: candidate.saleAnchor }),
    ...(candidate.milestones === null || candidate.milestones === undefined ? {} : { milestones: candidate.milestones }),
    costLines: Array.isArray(candidate.costLines) ? candidate.costLines.map(withoutNullAnchors) : candidate.costLines,
    quantities,
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
