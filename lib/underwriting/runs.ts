import {
  APARTMENT_SCENARIO_FORMULA_VERSION,
  APARTMENT_OPERATIONS_FORMULA_VERSION,
  APARTMENT_OPERATIONS_V1_FORMULA_VERSION,
  APARTMENT_OPERATIONS_V2_FORMULA_VERSION,
  DEVELOPMENT_CAPITAL_FORMULA_VERSION,
  DEVELOPMENT_CAPITAL_V1_FORMULA_VERSION,
  PROPERTY_RETURNS_FORMULA_VERSION,
  PROPERTY_RETURNS_V1_FORMULA_VERSION,
  PROPERTY_RETURNS_V2_FORMULA_VERSION,
  computeApartmentOperations,
  computeDevelopmentCapital,
  computeMonthlyCostSchedule,
  computePreliminaryUnderwriting,
  computePropertyReturns,
  runApartmentScenarioComparison,
  MONTHLY_COST_FORMULA_VERSION,
  type ApartmentOperationsInputs,
  type ApartmentScenarioComparisonResult,
  type ApartmentScenarioDefinition,
  type ApartmentScenarioIssue,
  type ApartmentOperationsIssue,
  type ApartmentOperationsResult,
  type DevelopmentCapitalInputs,
  type DevelopmentCapitalIssue,
  type DevelopmentCapitalResult,
  type DevelopmentCapitalRun,
  type MonthlyApartmentOperations,
  type MonthlyCostIssue,
  type MonthlyCostScheduleInputs,
  type MonthlyCostScheduleResult,
  type PreliminaryUnderwritingInputs,
  type PropertyReturnsInputs,
  type PropertyReturnsIssue,
  type PropertyReturnsResult,
  type ReconciliationCheck,
  type UnderwritingIssue,
  type UnderwritingResult,
} from "@kulka/engine";

import type { Db } from "@/lib/db";
import { getUnderwritingCase, type UnderwritingCase } from "@/lib/underwriting/cases";

export type UnderwritingEvidenceSnapshot = {
  caseId: string;
  caseRevision: number;
  caseNumber: number;
  sheetNumber: string;
  name: string;
  address: string;
  developmentType: UnderwritingCase["developmentType"];
  status: UnderwritingCase["status"];
  proposedUnits?: number;
  averageUnitSquareFeet?: number;
  grossBuildingSquareFeet?: number;
  factMetadata: UnderwritingCase["factMetadata"];
  createdAt: string;
  updatedAt: string;
  assumptions: UnderwritingCase["assumptions"];
  costSchedule?: UnderwritingCase["costSchedule"];
  apartmentOperations?: UnderwritingCase["apartmentOperations"];
  developmentCapital?: UnderwritingCase["developmentCapital"];
  propertyReturns?: UnderwritingCase["propertyReturns"];
  scenarios?: UnderwritingCase["scenarios"];
};

export type SavedUnderwritingInputSnapshot = Partial<PreliminaryUnderwritingInputs
  & Partial<MonthlyCostScheduleInputs>
  & Partial<ApartmentOperationsInputs>
  & Partial<DevelopmentCapitalInputs>
  & Partial<PropertyReturnsInputs>> & { base?: PropertyReturnsInputs; scenarios?: ApartmentScenarioDefinition[] };

export type SavedUnderwritingRun = {
  id: string;
  caseId: string;
  caseRevision: number;
  formulaVersion: string;
  status: "complete" | "failed";
  inputSnapshot: SavedUnderwritingInputSnapshot;
  evidenceSnapshot: UnderwritingEvidenceSnapshot;
  issues: Array<UnderwritingIssue | MonthlyCostIssue | ApartmentOperationsIssue | DevelopmentCapitalIssue | PropertyReturnsIssue | ApartmentScenarioIssue>;
  results: UnderwritingResult[];
  monthlyCostResult?: MonthlyCostScheduleResult;
  apartmentOperationsResult?: ApartmentOperationsResult;
  developmentCapitalResult?: NonNullable<DevelopmentCapitalRun["result"]>;
  propertyReturnsResult?: PropertyReturnsResult;
  scenarioComparisonResult?: ApartmentScenarioComparisonResult;
  reconciliations: ReconciliationCheck[];
  createdAt: string;
};

type RunRow = {
  id: string;
  case_id: string;
  case_revision: string | number;
  formula_version: string;
  status: SavedUnderwritingRun["status"];
  input_snapshot: SavedUnderwritingInputSnapshot;
  evidence_snapshot: UnderwritingEvidenceSnapshot;
  result_snapshot: UnderwritingResult[] | MonthlyCostScheduleResult | ApartmentOperationsResult | NonNullable<DevelopmentCapitalRun["result"]> | PropertyReturnsResult | ApartmentScenarioComparisonResult | Record<string, never>;
  issues: Array<UnderwritingIssue | MonthlyCostIssue | ApartmentOperationsIssue | DevelopmentCapitalIssue | PropertyReturnsIssue | ApartmentScenarioIssue>;
  reconciliation_checks: ReconciliationCheck[];
  created_at: Date | string;
};

export class UnderwritingRevisionConflict extends Error {
  constructor() {
    super("The project changed before the calculation ran. Reload it and try again.");
  }
}

export async function runUnderwritingCase(
  db: Db,
  caseId: string,
  expectedRevision: number,
) {
  const savedCase = await getUnderwritingCase(db, caseId);
  if (!savedCase) return null;
  if (savedCase.caseRevision !== expectedRevision) throw new UnderwritingRevisionConflict();

  const calculated = savedCase.costSchedule && savedCase.apartmentOperations && savedCase.developmentCapital && savedCase.propertyReturns && savedCase.scenarios?.length === 2
    ? runApartmentScenarioComparison(propertyReturnsInputsFor(savedCase), savedCase.scenarios.map((scenario) => ({
      id: scenario.id,
      role: scenario.role,
      name: scenario.name,
      inputVersion: scenario.inputVersion,
      delta: structuredClone(scenario.delta),
      evidence: structuredClone(scenario.evidence),
    })))
    : savedCase.costSchedule && savedCase.apartmentOperations && savedCase.developmentCapital && savedCase.propertyReturns
      ? computePropertyReturns(propertyReturnsInputsFor(savedCase))
    : savedCase.costSchedule && savedCase.apartmentOperations && savedCase.developmentCapital
      ? computeDevelopmentCapital(capitalInputsFor(savedCase))
    : savedCase.costSchedule && savedCase.apartmentOperations
      ? computeApartmentOperations(operationsInputsFor(savedCase))
      : savedCase.costSchedule
        ? computeMonthlyCostSchedule(monthlyInputsFor(savedCase.costSchedule))
        : computePreliminaryUnderwriting(inputsFor(savedCase));
  const evidenceSnapshot = evidenceFor(savedCase);
  const resultSnapshot = calculated.formulaVersion === MONTHLY_COST_FORMULA_VERSION
    || calculated.formulaVersion === APARTMENT_OPERATIONS_FORMULA_VERSION
    || calculated.formulaVersion === DEVELOPMENT_CAPITAL_FORMULA_VERSION
    || calculated.formulaVersion === PROPERTY_RETURNS_FORMULA_VERSION
    || calculated.formulaVersion === APARTMENT_SCENARIO_FORMULA_VERSION
    ? calculated.result ?? {}
    : calculated.results;
  const reconciliations = calculated.formulaVersion === MONTHLY_COST_FORMULA_VERSION
    || calculated.formulaVersion === APARTMENT_OPERATIONS_FORMULA_VERSION
    || calculated.formulaVersion === DEVELOPMENT_CAPITAL_FORMULA_VERSION
    || calculated.formulaVersion === PROPERTY_RETURNS_FORMULA_VERSION
    || calculated.formulaVersion === APARTMENT_SCENARIO_FORMULA_VERSION
    ? calculated.reconciliations
    : [];
  const { rows } = await db.query<RunRow>(
    `with matching_case as (
       select case_revision
       from underwriting_cases
       where id = $1 and case_revision = $2
       for key share
     ), new_run as (
       insert into underwriting_calculation_runs
         (case_id, case_revision, formula_version, status, input_snapshot,
          evidence_snapshot, result_snapshot, issues, reconciliation_checks)
       select $1, matching_case.case_revision, $3, $4, $5::jsonb,
              $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb
       from matching_case
       returning *
     )
     select * from new_run`,
    [
      caseId,
      expectedRevision,
      calculated.formulaVersion,
      calculated.status,
      JSON.stringify(calculated.inputSnapshot),
      JSON.stringify(evidenceSnapshot),
      JSON.stringify(resultSnapshot),
      JSON.stringify(calculated.issues),
      JSON.stringify(reconciliations),
    ],
  );
  if (!rows[0]) throw new UnderwritingRevisionConflict();
  return mapRun(rows[0]);
}

export async function getLatestUnderwritingRun(db: Db, caseId: string) {
  const { rows } = await db.query<RunRow>(
    `select * from underwriting_calculation_runs
     where case_id = $1
     order by created_at desc, id desc
     limit 1`,
    [caseId],
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

export async function listUnderwritingRuns(db: Db, caseId: string, limit = 20, offset = 0) {
  const boundedLimit = Math.max(1, Math.min(limit, 100));
  const boundedOffset = Math.max(0, offset);
  const { rows } = await db.query<RunRow>(
    `select * from underwriting_calculation_runs
     where case_id = $1
     order by created_at desc, id desc
     limit $2 offset $3`,
    [caseId, boundedLimit, boundedOffset],
  );
  return rows.map(mapRun);
}

export async function countUnderwritingRuns(db: Db, caseId: string) {
  const { rows } = await db.query<{ count: string | number }>(
    `select count(*) as count from underwriting_calculation_runs where case_id = $1`,
    [caseId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getUnderwritingRun(db: Db, runId: string) {
  const { rows } = await db.query<RunRow>(
    `select * from underwriting_calculation_runs where id = $1`,
    [runId],
  );
  return rows[0] ? mapRun(rows[0]) : null;
}

function mapRun(row: RunRow): SavedUnderwritingRun {
  const monthly = row.formula_version === MONTHLY_COST_FORMULA_VERSION
    && !Array.isArray(row.result_snapshot)
    && "months" in row.result_snapshot
    ? row.result_snapshot as MonthlyCostScheduleResult
    : undefined;
  const apartmentOperations = (row.formula_version === APARTMENT_OPERATIONS_FORMULA_VERSION
      || row.formula_version === APARTMENT_OPERATIONS_V2_FORMULA_VERSION
      || row.formula_version === APARTMENT_OPERATIONS_V1_FORMULA_VERSION)
    && !Array.isArray(row.result_snapshot)
    && "months" in row.result_snapshot
    && "totals" in row.result_snapshot
    ? withEarlierOperationsLines(row.result_snapshot as ApartmentOperationsResult)
    : undefined;
  const developmentCapital = (row.formula_version === DEVELOPMENT_CAPITAL_FORMULA_VERSION
      || row.formula_version === DEVELOPMENT_CAPITAL_V1_FORMULA_VERSION)
    && !Array.isArray(row.result_snapshot)
    && "apartmentOperations" in row.result_snapshot
    && "capital" in row.result_snapshot
    ? withCapitalRateColumns(row.result_snapshot as NonNullable<DevelopmentCapitalRun["result"]>, row.input_snapshot)
    : undefined;
  const propertyReturns = (row.formula_version === PROPERTY_RETURNS_FORMULA_VERSION
      || row.formula_version === PROPERTY_RETURNS_V2_FORMULA_VERSION
      || row.formula_version === PROPERTY_RETURNS_V1_FORMULA_VERSION)
    && !Array.isArray(row.result_snapshot)
    && "developmentCapital" in row.result_snapshot
    && "forwardOperations" in row.result_snapshot
    && "propertyReturns" in row.result_snapshot
    ? withLenderTests(row.result_snapshot as PropertyReturnsResult, row.input_snapshot)
    : undefined;
  const scenarios = row.formula_version === APARTMENT_SCENARIO_FORMULA_VERSION
    && !Array.isArray(row.result_snapshot)
    && "base" in row.result_snapshot
    && "scenarios" in row.result_snapshot
    ? row.result_snapshot as ApartmentScenarioComparisonResult
    : undefined;
  return {
    id: row.id,
    caseId: row.case_id,
    caseRevision: Number(row.case_revision),
    formulaVersion: row.formula_version,
    status: row.status,
    inputSnapshot: row.input_snapshot,
    evidenceSnapshot: row.evidence_snapshot,
    issues: row.issues,
    results: Array.isArray(row.result_snapshot) ? row.result_snapshot : [],
    ...(monthly ? { monthlyCostResult: monthly } : {}),
    ...(apartmentOperations ? { apartmentOperationsResult: apartmentOperations } : {}),
    ...(developmentCapital ? { developmentCapitalResult: developmentCapital } : {}),
    ...(propertyReturns ? { propertyReturnsResult: propertyReturns } : {}),
    ...(scenarios ? { scenarioComparisonResult: scenarios } : {}),
    reconciliations: row.reconciliation_checks ?? [],
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function evidenceFor(savedCase: UnderwritingCase): UnderwritingEvidenceSnapshot {
  return {
    caseId: savedCase.id,
    caseRevision: savedCase.caseRevision,
    caseNumber: savedCase.caseNumber,
    sheetNumber: savedCase.sheetNumber,
    name: savedCase.name,
    address: savedCase.address,
    developmentType: savedCase.developmentType,
    status: savedCase.status,
    proposedUnits: savedCase.proposedUnits,
    averageUnitSquareFeet: savedCase.averageUnitSquareFeet,
    grossBuildingSquareFeet: savedCase.grossBuildingSquareFeet,
    factMetadata: structuredClone(savedCase.factMetadata),
    createdAt: savedCase.createdAt,
    updatedAt: savedCase.updatedAt,
    assumptions: savedCase.assumptions.map((assumption) => ({ ...assumption })),
    ...(savedCase.costSchedule ? { costSchedule: structuredClone(savedCase.costSchedule) } : {}),
    ...(savedCase.apartmentOperations ? { apartmentOperations: structuredClone(savedCase.apartmentOperations) } : {}),
    ...(savedCase.developmentCapital ? { developmentCapital: structuredClone(savedCase.developmentCapital) } : {}),
    ...(savedCase.propertyReturns ? { propertyReturns: structuredClone(savedCase.propertyReturns) } : {}),
    ...(savedCase.scenarios?.length ? { scenarios: structuredClone(savedCase.scenarios) } : {}),
  };
}

function operationsInputsFor(savedCase: UnderwritingCase): ApartmentOperationsInputs {
  const operations = savedCase.apartmentOperations!;
  const { lastChangedAt, ...savedOperations } = operations;
  void lastChangedAt;
  return {
    ...monthlyInputsFor(savedCase.costSchedule!),
    ...savedOperations,
  };
}

function capitalInputsFor(savedCase: UnderwritingCase): DevelopmentCapitalInputs {
  const capital = savedCase.developmentCapital!;
  const { lastChangedAt, ...savedCapital } = capital;
  void lastChangedAt;
  return {
    ...operationsInputsFor(savedCase),
    ...savedCapital,
  };
}

/**
 * v1 property runs predate lender tests, and v1 and v2 runs predate the tax schedule (LA-1690).
 * Read them as having no lender tests, no full-tax tests and no sale tax basis.
 */
function withLenderTests(result: PropertyReturnsResult, inputSnapshot: unknown): PropertyReturnsResult {
  return {
    ...result,
    developmentCapital: result.developmentCapital ? withRateColumns(result.developmentCapital, inputSnapshot) : result.developmentCapital,
    lenderTests: result.lenderTests ? { ...result.lenderTests, fullTax: result.lenderTests.fullTax ?? null } : null,
    saleTax: result.saleTax ?? null,
    propertyTax: result.propertyTax ?? null,
  };
}

/**
 * v1 capital runs predate the rate path (LA-1691). Read each of their months as charging the
 * fixed annual rate saved in the run's input snapshot.
 */
function withCapitalRateColumns(
  result: NonNullable<DevelopmentCapitalRun["result"]>,
  inputSnapshot: unknown,
): NonNullable<DevelopmentCapitalRun["result"]> {
  return { ...result, capital: withRateColumns(result.capital, inputSnapshot) };
}

function withRateColumns(capital: DevelopmentCapitalResult, inputSnapshot: unknown): DevelopmentCapitalResult {
  const fixedRate = (inputSnapshot as { annualInterestRatePercent?: number } | null)?.annualInterestRatePercent ?? 0;
  return {
    ...capital,
    rateSchedule: capital.rateSchedule ?? null,
    months: capital.months.map((month) => ({
      ...month,
      annualRatePercent: month.annualRatePercent ?? fixedRate,
      baseRatePercent: month.baseRatePercent ?? null,
      rateSource: month.rateSource ?? "fixed",
    })),
  };
}

/**
 * v1 operations runs predate the tax schedule, v1 and v2 runs predate lease-up concessions
 * (LA-1704), and runs saved before lease turnover (LA-1784) predate turned units. Read their months
 * as charging no tax and no concession and turning no units.
 */
function withEarlierOperationsLines(result: ApartmentOperationsResult): ApartmentOperationsResult {
  const month = (item: MonthlyApartmentOperations) => ({
    ...item,
    propertyTax: item.propertyTax ?? 0,
    fullPropertyTax: item.fullPropertyTax ?? 0,
    leaseUpConcessionLoss: item.leaseUpConcessionLoss ?? 0,
    turnedUnits: item.turnedUnits ?? 0,
  });
  return {
    ...result,
    months: result.months.map(month),
    totals: {
      ...result.totals,
      propertyTax: result.totals.propertyTax ?? 0,
      fullPropertyTax: result.totals.fullPropertyTax ?? 0,
      leaseUpConcessionLoss: result.totals.leaseUpConcessionLoss ?? 0,
    },
    propertyTax: result.propertyTax ?? null,
  };
}

export function propertyReturnsInputsFor(savedCase: UnderwritingCase): PropertyReturnsInputs {
  const propertyReturns = savedCase.propertyReturns!;
  const { lastChangedAt, ...savedPropertyReturns } = propertyReturns;
  void lastChangedAt;
  return {
    ...capitalInputsFor(savedCase),
    ...savedPropertyReturns,
  };
}

function monthlyInputsFor(schedule: NonNullable<UnderwritingCase["costSchedule"]>): MonthlyCostScheduleInputs {
  return {
    analysisStartMonth: schedule.analysisStartMonth,
    saleMonth: schedule.saleMonth,
    costLines: schedule.costLines.map((savedLine) => {
      const { lastChangedAt, ...line } = savedLine;
      void lastChangedAt;
      return line;
    }),
  };
}

function inputsFor(savedCase: UnderwritingCase): PreliminaryUnderwritingInputs {
  const assumptions = Object.fromEntries(
    savedCase.assumptions.map((assumption) => [assumption.name, assumption.value]),
  );
  return {
    grossBuildingSquareFeet: savedCase.grossBuildingSquareFeet,
    proposedUnits: savedCase.proposedUnits,
    purchasePrice: assumptions.purchasePrice,
    monthlyRent: assumptions.monthlyRent,
    hardCostPerGrossSquareFoot: assumptions.hardCostPerGrossSquareFoot,
    softCostPercent: assumptions.softCostPercent,
    contingencyPercent: assumptions.contingencyPercent,
    vacancyPercent: assumptions.vacancyPercent,
    operatingExpensePercent: assumptions.operatingExpensePercent,
    debtPercent: assumptions.debtPercent,
    interestRatePercent: assumptions.interestRatePercent,
    exitCapRatePercent: assumptions.exitCapRatePercent,
  };
}
