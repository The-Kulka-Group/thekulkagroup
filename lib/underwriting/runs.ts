import {
  APARTMENT_OPERATIONS_FORMULA_VERSION,
  computeApartmentOperations,
  computeMonthlyCostSchedule,
  computePreliminaryUnderwriting,
  MONTHLY_COST_FORMULA_VERSION,
  type ApartmentOperationsInputs,
  type ApartmentOperationsIssue,
  type ApartmentOperationsResult,
  type MonthlyCostIssue,
  type MonthlyCostScheduleInputs,
  type MonthlyCostScheduleResult,
  type PreliminaryUnderwritingInputs,
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
};

export type SavedUnderwritingInputSnapshot = PreliminaryUnderwritingInputs
  & Partial<MonthlyCostScheduleInputs>
  & Partial<ApartmentOperationsInputs>;

export type SavedUnderwritingRun = {
  id: string;
  caseId: string;
  caseRevision: number;
  formulaVersion: string;
  status: "complete" | "failed";
  inputSnapshot: SavedUnderwritingInputSnapshot;
  evidenceSnapshot: UnderwritingEvidenceSnapshot;
  issues: Array<UnderwritingIssue | MonthlyCostIssue | ApartmentOperationsIssue>;
  results: UnderwritingResult[];
  monthlyCostResult?: MonthlyCostScheduleResult;
  apartmentOperationsResult?: ApartmentOperationsResult;
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
  result_snapshot: UnderwritingResult[] | MonthlyCostScheduleResult | ApartmentOperationsResult | Record<string, never>;
  issues: Array<UnderwritingIssue | MonthlyCostIssue | ApartmentOperationsIssue>;
  reconciliation_checks: ReconciliationCheck[];
  created_at: Date | string;
};

export class UnderwritingRevisionConflict extends Error {
  constructor() {
    super("The case changed before the calculation ran. Reload it and try again.");
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

  const calculated = savedCase.costSchedule && savedCase.apartmentOperations
    ? computeApartmentOperations(operationsInputsFor(savedCase))
    : savedCase.costSchedule
      ? computeMonthlyCostSchedule(monthlyInputsFor(savedCase.costSchedule))
      : computePreliminaryUnderwriting(inputsFor(savedCase));
  const evidenceSnapshot = evidenceFor(savedCase);
  const resultSnapshot = calculated.formulaVersion === MONTHLY_COST_FORMULA_VERSION
    || calculated.formulaVersion === APARTMENT_OPERATIONS_FORMULA_VERSION
    ? calculated.result ?? {}
    : calculated.results;
  const reconciliations = calculated.formulaVersion === MONTHLY_COST_FORMULA_VERSION
    || calculated.formulaVersion === APARTMENT_OPERATIONS_FORMULA_VERSION
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
  const apartmentOperations = row.formula_version === APARTMENT_OPERATIONS_FORMULA_VERSION
    && !Array.isArray(row.result_snapshot)
    && "months" in row.result_snapshot
    && "totals" in row.result_snapshot
    ? row.result_snapshot as ApartmentOperationsResult
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
