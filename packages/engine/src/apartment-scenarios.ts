import {
  computePropertyReturns,
  type PropertyReturnsInputs,
  type PropertyReturnsResult,
  type PropertyReturnsRun,
} from "./property-returns";

export const APARTMENT_SCENARIO_INPUT_VERSION = "apartment_scenario_delta.v1" as const;
export const APARTMENT_SCENARIO_FORMULA_VERSION = "underwriting.apartment_scenarios.v1" as const;
export const APARTMENT_SCENARIO_CHANGE_KEYS = [
  "vacancyPercent",
  "annualIncomeGrowthPercent",
  "terminalCapRatePercent",
  "growthStartMonthShiftMonths",
] as const;
export const MAX_SCENARIO_TIMING_SHIFT_MONTHS = 24;

export type ApartmentScenarioRole = "downside" | "upside";
export type ApartmentScenarioChangeKey = typeof APARTMENT_SCENARIO_CHANGE_KEYS[number];
export type ApartmentScenarioDelta = Partial<{
  vacancyPercent: number;
  annualIncomeGrowthPercent: number;
  terminalCapRatePercent: number;
  growthStartMonthShiftMonths: number;
}>;
export type ApartmentScenarioEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: "working" | "done";
};
export type ApartmentScenarioDefinition = {
  id: string;
  role: ApartmentScenarioRole;
  name: string;
  inputVersion: typeof APARTMENT_SCENARIO_INPUT_VERSION;
  delta: ApartmentScenarioDelta;
  evidence: Partial<Record<ApartmentScenarioChangeKey, ApartmentScenarioEvidence>>;
};

export type ApartmentScenarioIssueCode =
  | "unsupported_input_version"
  | "invalid_id"
  | "duplicate_id"
  | "invalid_name"
  | "invalid_role"
  | "missing_role"
  | "missing_delta"
  | "unsupported_delta"
  | "invalid_percent"
  | "invalid_timing_shift"
  | "missing_evidence"
  | "invalid_source_date"
  | "invalid_review_state"
  | "scenario_calculation";

export type ApartmentScenarioIssue = {
  path: string;
  code: ApartmentScenarioIssueCode;
  message: string;
};

export type ScenarioChangedInput = {
  key: ApartmentScenarioChangeKey;
  label: string;
  unit: "percent" | "month";
  baseValue: number | string;
  scenarioValue: number | string;
};

export type ApartmentScenarioMetrics = {
  forwardNetOperatingIncome: number;
  grossSaleValue: number;
  unleveredXirr: number;
  leveredXirr: number;
  unleveredEquityMultiple: number;
  leveredEquityMultiple: number;
  yieldOnCost: number;
  developmentSpreadBasisPoints: number;
};

export type ApartmentScenarioResult = {
  id: string;
  role: ApartmentScenarioRole;
  name: string;
  delta: ApartmentScenarioDelta;
  changedInputs: ScenarioChangedInput[];
  inputSnapshot: PropertyReturnsInputs;
  propertyResult: PropertyReturnsResult;
  metrics: ApartmentScenarioMetrics;
  reconciliationStatus: "pass" | "fail";
};

export type ApartmentScenarioComparisonResult = {
  base: {
    name: "Current Reviewed Inputs";
    propertyResult: PropertyReturnsResult;
    metrics: ApartmentScenarioMetrics;
    reconciliationStatus: "pass" | "fail";
  };
  scenarios: ApartmentScenarioResult[];
};

export type ApartmentScenarioComparisonRun = {
  formulaVersion: typeof APARTMENT_SCENARIO_FORMULA_VERSION;
  inputSnapshot: { base: PropertyReturnsInputs; scenarios: ApartmentScenarioDefinition[] };
  status: "complete" | "failed";
  issues: Array<ApartmentScenarioIssue | PropertyReturnsRun["issues"][number]>;
  result: ApartmentScenarioComparisonResult | null;
  reconciliations: PropertyReturnsResult["propertyReturns"]["reconciliations"];
};

export function runApartmentScenarioComparison(
  submittedBase: PropertyReturnsInputs,
  submittedScenarios: ApartmentScenarioDefinition[],
): ApartmentScenarioComparisonRun {
  const base = structuredClone(submittedBase);
  const scenarios = structuredClone(submittedScenarios);
  const inputSnapshot = { base, scenarios };
  const issues = validateScenarios(scenarios);
  if (issues.length > 0) return failed(inputSnapshot, issues);

  const baseRun = computePropertyReturns(base);
  if (baseRun.status === "failed" || !baseRun.result) {
    return failed(inputSnapshot, baseRun.issues);
  }

  const scenarioResults: ApartmentScenarioResult[] = [];
  for (const scenario of scenarios) {
    const input = applyDelta(base, scenario.delta);
    const run = computePropertyReturns(input);
    if (run.status === "failed" || !run.result) {
    return failed(inputSnapshot, run.issues.map((issue) => ({
      ...issue,
      path: `scenarios.${scenario.id}.${issue.path}`,
    })) as ApartmentScenarioComparisonRun["issues"]);
    }
    scenarioResults.push({
      id: scenario.id,
      role: scenario.role,
      name: scenario.name.trim(),
      delta: structuredClone(scenario.delta),
      changedInputs: changedInputs(base, input, scenario.delta),
      inputSnapshot: input,
      propertyResult: run.result,
      metrics: metricsFor(run.result),
      reconciliationStatus: statusFor(run.reconciliations),
    });
  }

  const result: ApartmentScenarioComparisonResult = {
    base: {
      name: "Current Reviewed Inputs",
      propertyResult: baseRun.result,
      metrics: metricsFor(baseRun.result),
      reconciliationStatus: statusFor(baseRun.reconciliations),
    },
    scenarios: scenarioResults,
  };
  return {
    formulaVersion: APARTMENT_SCENARIO_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    result,
    reconciliations: baseRun.reconciliations,
  };
}

export function validateApartmentScenarios(scenarios: ApartmentScenarioDefinition[]): ApartmentScenarioIssue[] {
  return validateScenarios(structuredClone(scenarios));
}

function validateScenarios(scenarios: ApartmentScenarioDefinition[]) {
  const issues: ApartmentScenarioIssue[] = [];
  if (!Array.isArray(scenarios) || scenarios.length !== 2) {
    return [{ path: "scenarios", code: "missing_role" as const, message: "Add one downside scenario and one upside scenario." }];
  }
  const ids = new Set<string>();
  const roles = new Set<ApartmentScenarioRole>();
  scenarios.forEach((scenario, index) => {
    const path = `scenarios.${index}`;
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
      issues.push({ path, code: "missing_role", message: "Send a scenario definition with a role, name, delta, and evidence." });
      return;
    }
    if (typeof scenario.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(scenario.id)) {
      issues.push({ path: `${path}.id`, code: "invalid_id", message: "Scenario ID must use lowercase letters, numbers, and hyphens." });
    } else if (ids.has(scenario.id)) {
      issues.push({ path: `${path}.id`, code: "duplicate_id", message: "Scenario IDs must be unique." });
    }
    ids.add(scenario.id);
    if (scenario.role !== "downside" && scenario.role !== "upside") {
      issues.push({ path: `${path}.role`, code: "invalid_role", message: "Scenario role must be downside or upside." });
    } else {
      roles.add(scenario.role);
    }
    const name = typeof scenario.name === "string" ? scenario.name.trim() : "";
    if (!name || name.length > 80 || ["base", "downside", "upside"].includes(name.toLowerCase())) {
      issues.push({ path: `${path}.name`, code: "invalid_name", message: "Name the changed assumption, such as Higher Vacancy or Lower Terminal Cap." });
    }
    if (scenario.inputVersion !== APARTMENT_SCENARIO_INPUT_VERSION) {
      issues.push({ path: `${path}.inputVersion`, code: "unsupported_input_version", message: `Use ${APARTMENT_SCENARIO_INPUT_VERSION}.` });
    }
    validateDelta(issues, scenario, path);
  });
  for (const role of ["downside", "upside"] as const) {
    if (!roles.has(role)) issues.push({ path: "scenarios", code: "missing_role", message: `Add one ${role} scenario.` });
  }
  return issues;
}

function validateDelta(issues: ApartmentScenarioIssue[], scenario: ApartmentScenarioDefinition, path: string) {
  if (!scenario.delta || typeof scenario.delta !== "object" || Array.isArray(scenario.delta)) {
    issues.push({ path: `${path}.delta`, code: "missing_delta", message: "Add at least one changed scenario input." });
    return;
  }
  const keys = Object.keys(scenario.delta);
  if (keys.length === 0) issues.push({ path: `${path}.delta`, code: "missing_delta", message: "Add at least one changed scenario input." });
  for (const key of keys) {
    if (!APARTMENT_SCENARIO_CHANGE_KEYS.includes(key as ApartmentScenarioChangeKey)) {
      issues.push({ path: `${path}.delta.${key}`, code: "unsupported_delta", message: `${key} is not supported by this scenario formula version.` });
      continue;
    }
    const typedKey = key as ApartmentScenarioChangeKey;
    const value = scenario.delta[typedKey];
    if (typedKey === "growthStartMonthShiftMonths") {
      if (!Number.isSafeInteger(value) || value === 0 || Math.abs(Number(value)) > MAX_SCENARIO_TIMING_SHIFT_MONTHS) {
        issues.push({ path: `${path}.delta.${key}`, code: "invalid_timing_shift", message: `Growth start shift must be a nonzero whole number from -${MAX_SCENARIO_TIMING_SHIFT_MONTHS} to ${MAX_SCENARIO_TIMING_SHIFT_MONTHS} months.` });
      }
    } else if (!Number.isFinite(value) || Number(value) < 0 || Number(value) > 100 || (typedKey === "terminalCapRatePercent" && Number(value) === 0)) {
      issues.push({ path: `${path}.delta.${key}`, code: "invalid_percent", message: `${labelFor(typedKey)} must be ${typedKey === "terminalCapRatePercent" ? "greater than zero and " : ""}no more than 100 percent.` });
    }
    const evidence = scenario.evidence?.[typedKey];
    const evidencePath = `${path}.evidence.${key}`;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
      issues.push({ path: evidencePath, code: "missing_evidence", message: `${labelFor(typedKey)} needs source and review details.` });
    } else {
      if (evidence.sourceDate !== undefined && !validDate(evidence.sourceDate)) issues.push({ path: `${evidencePath}.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
      if (evidence.reviewState !== "working" && evidence.reviewState !== "done") issues.push({ path: `${evidencePath}.reviewState`, code: "invalid_review_state", message: "Review state must be Working on it or Done." });
    }
  }
}

function applyDelta(base: PropertyReturnsInputs, delta: ApartmentScenarioDelta) {
  const input = structuredClone(base);
  if (delta.vacancyPercent !== undefined) input.vacancyPercent = delta.vacancyPercent;
  if (delta.annualIncomeGrowthPercent !== undefined) input.annualIncomeGrowthPercent = delta.annualIncomeGrowthPercent;
  if (delta.terminalCapRatePercent !== undefined) input.terminalCapRatePercent = delta.terminalCapRatePercent;
  if (delta.growthStartMonthShiftMonths !== undefined) input.growthStartMonth = addMonths(base.growthStartMonth, delta.growthStartMonthShiftMonths);
  return input;
}

function changedInputs(base: PropertyReturnsInputs, input: PropertyReturnsInputs, delta: ApartmentScenarioDelta) {
  return APARTMENT_SCENARIO_CHANGE_KEYS.flatMap((key): ScenarioChangedInput[] => {
    if (delta[key] === undefined) return [];
    if (key === "growthStartMonthShiftMonths") return [{ key, label: "Growth Start Month", unit: "month", baseValue: base.growthStartMonth, scenarioValue: input.growthStartMonth }];
    return [{ key, label: labelFor(key), unit: "percent", baseValue: base[key], scenarioValue: input[key] }];
  });
}

function metricsFor(result: PropertyReturnsResult): ApartmentScenarioMetrics {
  return {
    forwardNetOperatingIncome: result.propertyReturns.sale.forwardNetOperatingIncome,
    grossSaleValue: result.propertyReturns.sale.grossSaleValue,
    unleveredXirr: result.propertyReturns.returns.unlevered.xirr,
    leveredXirr: result.propertyReturns.returns.levered.xirr,
    unleveredEquityMultiple: result.propertyReturns.returns.unlevered.equityMultiple,
    leveredEquityMultiple: result.propertyReturns.returns.levered.equityMultiple,
    yieldOnCost: result.propertyReturns.yieldOnCost,
    developmentSpreadBasisPoints: result.propertyReturns.developmentSpreadBasisPoints,
  };
}

function statusFor(reconciliations: Array<{ status: "pass" | "fail" }>) {
  return reconciliations.every(({ status }) => status === "pass") ? "pass" as const : "fail" as const;
}

function addMonths(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  const index = year * 12 + month - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function labelFor(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function failed(
  inputSnapshot: ApartmentScenarioComparisonRun["inputSnapshot"],
  issues: ApartmentScenarioComparisonRun["issues"],
): ApartmentScenarioComparisonRun {
  return { formulaVersion: APARTMENT_SCENARIO_FORMULA_VERSION, inputSnapshot, status: "failed", issues, result: null, reconciliations: [] };
}
