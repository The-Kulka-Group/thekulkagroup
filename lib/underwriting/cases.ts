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
  assumptionMetadata?: Partial<Record<AssumptionName, AssumptionMetadata>>;
};

export type AssumptionMetadata = {
  sourceLabel: string;
  sourceDate: string;
  reviewState: "working" | "done";
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
  lastChangedAt: string;
};

export type UnderwritingCase = {
  id: string;
  caseNumber: number;
  sheetNumber: string;
  name: string;
  address: string;
  developmentType: "ground_up_multifamily";
  status: "open" | "working" | "stuck" | "done";
  caseRevision: number;
  proposedUnits?: number;
  averageUnitSquareFeet?: number;
  grossBuildingSquareFeet?: number;
  createdAt: string;
  updatedAt: string;
  assumptions: UnderwritingAssumption[];
};

export class UnderwritingCaseRevisionConflict extends Error {
  constructor() {
    super("The case changed before your edits were saved. Refresh the page, review the latest case, and try again.");
  }
}

type CaseRow = {
  id: string;
  case_number: string | number;
  name: string;
  address: string;
  development_type: UnderwritingCase["developmentType"];
  status: UnderwritingCase["status"];
  case_revision: string | number;
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
  value_changed_at: Date | string;
};

type CaseWithAssumptionsRow = CaseRow & { assumptions: AssumptionRow[] };

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
    caseRevision: Number(row.case_revision),
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
        lastChangedAt: iso(assumption.value_changed_at),
      };
    }),
  };
}

function assumptionRows(draft: CaseDraft) {
  return Object.entries(draft.assumptions).flatMap(([name, value]) => {
    if (value === undefined) return [];
    const definition = ASSUMPTION_DEFINITIONS[name as AssumptionName];
    const metadata = draft.assumptionMetadata?.[name as AssumptionName];
    return [{
      key: definition.key,
      value,
      unit: definition.unit,
      source_label: metadata?.sourceLabel ?? "User entered",
      source_date: metadata?.sourceDate ?? new Date().toISOString().slice(0, 10),
      review_state: metadata?.reviewState ?? "working",
    }];
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
         (case_id, assumption_key, value, unit, source_label, source_date, review_state)
       select new_case.id, supplied.key, supplied.value, supplied.unit,
              supplied.source_label, supplied.source_date, supplied.review_state
       from new_case
       cross join jsonb_to_recordset($6::jsonb)
         as supplied(
           key text,
           value numeric,
           unit text,
           source_label text,
           source_date date,
           review_state text
         )
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
  const { rows } = await db.query<CaseWithAssumptionsRow>(
    `select c.*,
            coalesce(
              jsonb_agg(
                jsonb_build_object(
                  'case_id', a.case_id,
                  'assumption_key', a.assumption_key,
                  'value', a.value,
                  'unit', a.unit,
                  'source_kind', a.source_kind,
                  'source_label', a.source_label,
                  'source_date', a.source_date,
                  'review_state', a.review_state,
                  'value_changed_at', a.value_changed_at
                ) order by a.assumption_key
              ) filter (where a.id is not null),
              '[]'::jsonb
            ) as assumptions
     from underwriting_cases c
     left join underwriting_case_assumptions a on a.case_id = c.id
     where c.id = $1
     group by c.id`,
    [id],
  );
  return rows[0] ? mapCase(rows[0], rows[0].assumptions) : null;
}

export async function updateUnderwritingCase(
  db: Db,
  id: string,
  draft: CaseDraft,
  expectedRevision: number,
) {
  const { rows } = await db.query<{ id: string }>(
    `with updated_case as (
       update underwriting_cases
       set name = $2,
           address = $3,
           proposed_units = $4,
           average_unit_square_feet = $5,
           gross_building_square_feet = $6,
           case_revision = case_revision + 1,
           updated_at = now()
       where id = $1 and case_revision = $8
       returning id
     ), supplied_assumptions as (
       select * from jsonb_to_recordset($7::jsonb) as supplied(
         key text,
         value numeric,
         unit text,
         source_label text,
         source_date date,
         review_state text
       )
     ), removed_assumptions as (
       delete from underwriting_case_assumptions
       where case_id in (select id from updated_case)
         and assumption_key not in (select key from supplied_assumptions)
     ), inserted_assumptions as (
       insert into underwriting_case_assumptions
         (case_id, assumption_key, value, unit, source_label, source_date, review_state)
       select updated_case.id, supplied.key, supplied.value, supplied.unit,
              supplied.source_label, supplied.source_date, supplied.review_state
       from updated_case
       cross join supplied_assumptions supplied
       on conflict (case_id, assumption_key) do update
       set value = excluded.value,
           unit = excluded.unit,
           source_label = excluded.source_label,
           source_date = excluded.source_date,
           review_state = case
             when underwriting_case_assumptions.value is distinct from excluded.value then 'working'
             else excluded.review_state
           end,
           value_changed_at = case
             when underwriting_case_assumptions.value is distinct from excluded.value then now()
             else underwriting_case_assumptions.value_changed_at
           end,
           updated_at = now()
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
      expectedRevision,
    ],
  );
  if (rows[0]) return getUnderwritingCase(db, rows[0].id);
  const existing = await getUnderwritingCase(db, id);
  if (existing) throw new UnderwritingCaseRevisionConflict();
  return null;
}
