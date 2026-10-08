import {
  APARTMENT_SCENARIO_CHANGE_KEYS,
  APARTMENT_SCENARIO_INPUT_VERSION,
  defaultApartmentScenarioName,
  runApartmentScenarioComparison,
  validateApartmentScenarios,
  type ApartmentScenarioChangeKey,
  type ApartmentScenarioDefinition,
  type ApartmentScenarioIssue,
  type PropertyReturnsInputs,
} from "@kulka/engine";
import { saveMessage } from "./save-message";

export class InvalidApartmentScenarios extends Error {
  constructor(
    public readonly issues: ApartmentScenarioIssue[],
    public readonly fieldErrors: Record<string, string>,
  ) {
    super(saveMessage("Review the scenario inputs and try again.", issues));
  }
}

export function parseApartmentScenarios(body: unknown, base: PropertyReturnsInputs) {
  const record = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  const raw = Array.isArray(record.scenarios) ? record.scenarios : [];
  const candidates = raw.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return value as ApartmentScenarioDefinition;
    const candidate = value as ApartmentScenarioDefinition;
    return {
      ...candidate,
      name: typeof candidate.name === "string" && candidate.name.trim()
        ? candidate.name
        : defaultApartmentScenarioName(candidate.delta),
    };
  });
  const issues = validateApartmentScenarios(candidates);
  if (issues.length) throw invalid(issues);

  const scenarios = candidates.map((candidate): ApartmentScenarioDefinition => {
    const delta = Object.fromEntries(APARTMENT_SCENARIO_CHANGE_KEYS.flatMap((key) =>
      candidate.delta[key] === undefined ? [] : [[key, candidate.delta[key]]],
    ));
    const evidence = Object.fromEntries(Object.keys(delta).map((key) => [
      key,
      candidate.evidence[key as ApartmentScenarioChangeKey],
    ]));
    return {
      id: candidate.id,
      role: candidate.role,
      name: candidate.name.trim(),
      inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
      delta,
      evidence,
    };
  });
  const run = runApartmentScenarioComparison(base, scenarios);
  if (run.status === "failed") throw invalid(run.issues as ApartmentScenarioIssue[]);
  return scenarios;
}

function invalid(issues: ApartmentScenarioIssue[]) {
  return new InvalidApartmentScenarios(
    issues,
    Object.fromEntries(issues.map((issue) => [issue.path, issue.message])),
  );
}
