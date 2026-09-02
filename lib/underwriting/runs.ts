import {
  computePreliminaryUnderwriting,
  type PreliminaryUnderwritingInputs,
  type UnderwritingIssue,
  type UnderwritingResult,
} from "@kulka/engine";

import type { Db } from "@/lib/db";
import { getUnderwritingCase, type UnderwritingCase } from "@/lib/underwriting/cases";

export type SavedUnderwritingRun = {
  id: string;
  caseId: string;
  formulaVersion: string;
  status: "complete" | "failed";
  inputSnapshot: PreliminaryUnderwritingInputs;
  issues: UnderwritingIssue[];
  results: UnderwritingResult[];
  createdAt: string;
};

type RunRow = {
  id: string;
  case_id: string;
  formula_version: string;
  status: SavedUnderwritingRun["status"];
  input_snapshot: PreliminaryUnderwritingInputs;
  issues: UnderwritingIssue[];
  created_at: Date | string;
};

type ResultRow = {
  result_key: UnderwritingResult["key"];
  label: string;
  value: string | number;
  unit: UnderwritingResult["unit"];
  formula: string;
  input_keys: UnderwritingResult["inputKeys"];
};

export async function runUnderwritingCase(db: Db, caseId: string) {
  const savedCase = await getUnderwritingCase(db, caseId);
  if (!savedCase) return null;

  const calculated = computePreliminaryUnderwriting(inputsFor(savedCase));
  const resultRows = calculated.results.map((result, resultOrder) => ({
    resultOrder,
    ...result,
  }));
  const { rows } = await db.query<RunRow>(
    `with new_run as (
       insert into underwriting_calculation_runs
         (case_id, formula_version, status, input_snapshot, issues)
       values ($1, $2, $3, $4::jsonb, $5::jsonb)
       returning *
     ), inserted_results as (
       insert into underwriting_calculation_results
         (run_id, result_order, result_key, label, value, unit, formula, input_keys)
       select new_run.id, supplied.result_order, supplied.result_key, supplied.label,
              supplied.value, supplied.unit, supplied.formula, supplied.input_keys
       from new_run
       cross join jsonb_to_recordset($6::jsonb) as supplied(
         result_order integer,
         result_key text,
         label text,
         value numeric,
         unit text,
         formula text,
         input_keys jsonb
       )
     )
     select * from new_run`,
    [
      caseId,
      calculated.formulaVersion,
      calculated.status,
      JSON.stringify(calculated.inputSnapshot),
      JSON.stringify(calculated.issues),
      JSON.stringify(resultRows.map(({ resultOrder, key, ...result }) => ({
        result_order: resultOrder,
        result_key: key,
        ...result,
        input_keys: result.inputKeys,
      }))),
    ],
  );
  return getUnderwritingRun(db, rows[0].id);
}

export async function getLatestUnderwritingRun(db: Db, caseId: string) {
  const { rows } = await db.query<{ id: string }>(
    `select id from underwriting_calculation_runs
     where case_id = $1
     order by created_at desc, id desc
     limit 1`,
    [caseId],
  );
  return rows[0] ? getUnderwritingRun(db, rows[0].id) : null;
}

export async function listUnderwritingRuns(db: Db, caseId: string, limit = 2) {
  const boundedLimit = Math.max(1, Math.min(limit, 20));
  const { rows } = await db.query<{ id: string }>(
    `select id from underwriting_calculation_runs
     where case_id = $1
     order by created_at desc, id desc
     limit $2`,
    [caseId, boundedLimit],
  );
  return Promise.all(rows.map((row) => getUnderwritingRun(db, row.id)))
    .then((runs) => runs.filter((run): run is SavedUnderwritingRun => run !== null));
}

export async function getUnderwritingRun(db: Db, runId: string) {
  const [{ rows: runs }, { rows: results }] = await Promise.all([
    db.query<RunRow>(`select * from underwriting_calculation_runs where id = $1`, [runId]),
    db.query<ResultRow>(
      `select result_key, label, value, unit, formula, input_keys
       from underwriting_calculation_results
       where run_id = $1
       order by result_order`,
      [runId],
    ),
  ]);
  const row = runs[0];
  if (!row) return null;
  return {
    id: row.id,
    caseId: row.case_id,
    formulaVersion: row.formula_version,
    status: row.status,
    inputSnapshot: row.input_snapshot,
    issues: row.issues,
    results: results.map((result) => ({
      key: result.result_key,
      label: result.label,
      value: Number(result.value),
      unit: result.unit,
      formula: result.formula,
      inputKeys: result.input_keys,
    })),
    createdAt: new Date(row.created_at).toISOString(),
  } satisfies SavedUnderwritingRun;
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
