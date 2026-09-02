import type { Db } from "@/lib/db";

export const ASSUMPTION_DEFINITIONS = {
  purchasePrice: { key: "purchase_price", unit: "usd", label: "Purchase price" },
  monthlyRent: { key: "monthly_rent", unit: "usd_per_month", label: "Average monthly rent" },
  hardCostPerGrossSquareFoot: {
    key: "hard_cost_per_gross_square_foot",
    unit: "usd_per_gross_square_foot",
    label: "Hard cost per gross square foot",
  },
  softCostPercent: { key: "soft_cost_percent", unit: "percent", label: "Soft cost" },
  contingencyPercent: { key: "contingency_percent", unit: "percent", label: "Contingency" },
  vacancyPercent: { key: "vacancy_percent", unit: "percent", label: "Vacancy" },
  operatingExpensePercent: {
    key: "operating_expense_percent",
    unit: "percent",
    label: "Operating expenses",
  },
  constructionMonths: { key: "construction_months", unit: "months", label: "Construction duration" },
  debtPercent: { key: "debt_percent", unit: "percent", label: "Debt" },
  interestRatePercent: { key: "interest_rate_percent", unit: "percent", label: "Interest rate" },
  exitCapRatePercent: { key: "exit_cap_rate_percent", unit: "percent", label: "Exit cap rate" },
  holdYears: { key: "hold_years", unit: "years", label: "Hold period" },
} as const;

export type AssumptionName = keyof typeof ASSUMPTION_DEFINITIONS;

export type CaseDraft = {
  name: string;
  address: string;
  proposedUnits?: number;
  averageUnitSquareFeet?: number;
  grossBuildingSquareFeet?: number;
  assumptions: Partial<Record<AssumptionName, number>>;
};

export type UnderwritingAssumption = {
  name: AssumptionName;
  key: (typeof ASSUMPTION_DEFINITIONS)[AssumptionName]["key"];
  label: string;
  value: number;
  unit: string;
  sourceKind: "user_supplied";
  sourceLabel: string;
  sourceDate: string;
  reviewState: "working" | "done";
};

export type UnderwritingCase = {
  id: string;
  caseNumber: number;
  sheetNumber: string;
  name: string;
  address: string;
  developmentType: "ground_up_multifamily";
  status: "open" | "working" | "stuck" | "done";
  proposedUnits?: number;
  averageUnitSquareFeet?: number;
  grossBuildingSquareFeet?: number;
  createdAt: string;
  updatedAt: string;
  assumptions: UnderwritingAssumption[];
};

type CaseRow = {
  id: string;
  case_number: string | number;
  name: string;
  address: string;
  development_type: UnderwritingCase["developmentType"];
  status: UnderwritingCase["status"];
  proposed_units: number | null;
  average_unit_square_feet: string | number | null;
  gross_building_square_feet: string | number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AssumptionRow = {
  case_id: string;
  assumption_key: UnderwritingAssumption["key"];
  value: string | number;
  unit: string;
  source_kind: "user_supplied";
  source_label: string;
  source_date: Date | string;
  review_state: "working" | "done";
};

const byStoredKey = new Map(
  Object.entries(ASSUMPTION_DEFINITIONS).map(([name, definition]) => [
    definition.key,
    { name: name as AssumptionName, ...definition },
  ]),
);

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

function dateOnly(value: Date | string) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function optionalNumber(value: string | number | null) {
  return value === null ? undefined : Number(value);
}

function mapCase(row: CaseRow, assumptions: AssumptionRow[] = []): UnderwritingCase {
  return {
    id: row.id,
    caseNumber: Number(row.case_number),
    sheetNumber: `U-${String(Number(row.case_number) + 100).padStart(3, "0")}`,
    name: row.name,
    address: row.address,
    developmentType: row.development_type,
    status: row.status,
    proposedUnits: optionalNumber(row.proposed_units),
    averageUnitSquareFeet: optionalNumber(row.average_unit_square_feet),
    grossBuildingSquareFeet: optionalNumber(row.gross_building_square_feet),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    assumptions: assumptions.map((assumption) => {
      const definition = byStoredKey.get(assumption.assumption_key);
      if (!definition) throw new Error(`Unknown assumption ${assumption.assumption_key}.`);
      return {
        name: definition.name,
        key: assumption.assumption_key,
        label: definition.label,
        value: Number(assumption.value),
        unit: assumption.unit,
        sourceKind: assumption.source_kind,
        sourceLabel: assumption.source_label,
        sourceDate: dateOnly(assumption.source_date),
        reviewState: assumption.review_state,
      };
    }),
  };
}

function assumptionRows(draft: CaseDraft) {
  return Object.entries(draft.assumptions).flatMap(([name, value]) => {
    if (value === undefined) return [];
    const definition = ASSUMPTION_DEFINITIONS[name as AssumptionName];
    return [{ key: definition.key, value, unit: definition.unit }];
  });
}

export async function createUnderwritingCase(db: Db, draft: CaseDraft) {
  const { rows } = await db.query<CaseRow>(
    `with new_case as (
       insert into underwriting_cases
         (name, address, proposed_units, average_unit_square_feet, gross_building_square_feet)
       values ($1, $2, $3, $4, $5)
       returning *
     ), inserted_assumptions as (
       insert into underwriting_case_assumptions
         (case_id, assumption_key, value, unit)
       select new_case.id, supplied.key, supplied.value, supplied.unit
       from new_case
       cross join jsonb_to_recordset($6::jsonb)
         as supplied(key text, value numeric, unit text)
     )
     select * from new_case`,
    [
      draft.name,
      draft.address,
      draft.proposedUnits ?? null,
      draft.averageUnitSquareFeet ?? null,
      draft.grossBuildingSquareFeet ?? null,
      JSON.stringify(assumptionRows(draft)),
    ],
  );
  return getUnderwritingCase(db, rows[0].id);
}

export async function listUnderwritingCases(db: Db): Promise<UnderwritingCase[]> {
  const { rows } = await db.query<CaseRow>(
    `select * from underwriting_cases order by updated_at desc, case_number desc`,
  );
  return rows.map((row) => mapCase(row));
}

export async function getUnderwritingCase(db: Db, id: string): Promise<UnderwritingCase | null> {
  const [{ rows: cases }, { rows: assumptions }] = await Promise.all([
    db.query<CaseRow>(`select * from underwriting_cases where id = $1`, [id]),
    db.query<AssumptionRow>(
      `select * from underwriting_case_assumptions where case_id = $1 order by assumption_key`,
      [id],
    ),
  ]);
  return cases[0] ? mapCase(cases[0], assumptions) : null;
}

export async function updateUnderwritingCase(db: Db, id: string, draft: CaseDraft) {
  const { rows } = await db.query<{ id: string }>(
    `with updated_case as (
       update underwriting_cases
       set name = $2,
           address = $3,
           proposed_units = $4,
           average_unit_square_feet = $5,
           gross_building_square_feet = $6,
           updated_at = now()
       where id = $1
       returning id
     ), removed_assumptions as (
       delete from underwriting_case_assumptions
       where case_id in (select id from updated_case)
     ), inserted_assumptions as (
       insert into underwriting_case_assumptions
         (case_id, assumption_key, value, unit)
       select updated_case.id, supplied.key, supplied.value, supplied.unit
       from updated_case
       cross join jsonb_to_recordset($7::jsonb)
         as supplied(key text, value numeric, unit text)
     )
     select id from updated_case`,
    [
      id,
      draft.name,
      draft.address,
      draft.proposedUnits ?? null,
      draft.averageUnitSquareFeet ?? null,
      draft.grossBuildingSquareFeet ?? null,
      JSON.stringify(assumptionRows(draft)),
    ],
  );
  return rows[0] ? getUnderwritingCase(db, rows[0].id) : null;
}
