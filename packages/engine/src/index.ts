// Public API of the ROM engine: the deterministic layer described in
// `docs/precon/rom-spec.md` and defined under Engine in `CONTEXT.md`.

export {
  computeRom,
  type Answers,
  type Benchmark,
  type ConfidenceFlag,
  type ConstructionKind,
  type DataSnapshot,
  type ProjectType,
  type Provenance,
  type ProvenanceKind,
  type Rom,
  type RomLine,
} from "./rom";

export {
  computePreliminaryUnderwriting,
  UNDERWRITING_FORMULA_VERSION,
  type PreliminaryUnderwritingInputs,
  type PreliminaryUnderwritingRun,
  type UnderwritingInputKey,
  type UnderwritingIssue,
  type UnderwritingResult,
  type UnderwritingResultKey,
} from "./underwriting";

export {
  computeMonthlyCostSchedule,
  MONTHLY_COST_FORMULA_VERSION,
  S_CURVE_DISTRIBUTION_VERSION,
  STRAIGHT_LINE_DISTRIBUTION_VERSION,
  type CostCategory,
  type CostDistributionMethod,
  type CostDistributionVersion,
  type CostLineSchedule,
  type MonthlyCostIssue,
  type MonthlyCostIssueCode,
  type MonthlyCostLine,
  type MonthlyCostScheduleInputs,
  type MonthlyCostScheduleResult,
  type MonthlyCostScheduleRun,
  type MonthlyUses,
  type ReconciliationCheck,
} from "./monthly-cost-schedule";
