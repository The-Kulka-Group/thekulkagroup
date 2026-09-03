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

export {
  APARTMENT_OPERATIONS_FORMULA_VERSION,
  APARTMENT_OPERATIONS_INPUT_VERSION,
  APARTMENT_OPERATIONS_ASSUMPTION_KEYS,
  computeApartmentOperations,
  type ApartmentOperationsInputs,
  type ApartmentOperationsAssumptionEvidence,
  type ApartmentOperationsAssumptionKey,
  type ApartmentOperationsIssue,
  type ApartmentOperationsIssueCode,
  type ApartmentOperationsResult,
  type ApartmentOperationsRun,
  type ApartmentOperationsTotals,
  type CapitalExpenditureLine,
  type MonthlyApartmentOperations,
  type OperatingExpenseLine,
  type OperationsFormulaTrace,
  type OtherIncomeLine,
  type ResidentialUnitType,
} from "./apartment-operations";
