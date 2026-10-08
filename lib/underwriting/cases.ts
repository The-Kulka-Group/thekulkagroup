import type { Db } from "@/lib/db";
import {
  APARTMENT_OPERATIONS_ASSUMPTION_KEYS,
  type ApartmentOperationsAssumptionKey,
  type ApartmentOperationsInputs,
  type CommercialOperations,
  type CommercialSpace,
  DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS,
  type DevelopmentCapitalAssumptionKey,
  type DevelopmentCapitalPlan,
  LENDER_TEST_ASSUMPTION_KEYS,
  LENDER_TEST_COMMERCIAL_CAP_KEY,
  leaseStartMonthFor,
  type LenderTestPlan,
  type Milestone,
  PARTNERSHIP_ASSUMPTION_KEYS,
  type PartnershipAssumptionKey,
  type PartnershipPlan,
  type PermanentLoanAssumptionKey,
  type PermanentLoanCapKey,
  type PermanentLoanPlan,
  type LoanSizingPlan,
  type CostQuantities,
  type CostLineBasisType,
  type MilestoneAnchor,
  type MilestoneEndAnchor,
  resolveMilestoneAnchors,
  type PercentOfTotalBase,
  type MonthlyCostLine,
  type MonthlyCostScheduleInputs,
  PROPERTY_RETURNS_ASSUMPTION_KEYS,
  PROPERTY_RETURNS_COMMERCIAL_CAP_KEY,
  PROPERTY_TAX_ASSUMPTION_KEYS,
  SALE_TAX_ASSUMPTION_KEYS,
  type ApartmentScenarioDefinition,
  type ApartmentScenarioEvidence,
  type PropertyReturnsAssumptionKey,
  type PropertyReturnsPlan,
  type PropertyTaxAssumptionKey,
  type PropertyTaxPlan,
  type SaleTaxPlan,
} from "@kulka/engine";

import type { ApartmentOperationsDraft } from "@/lib/underwriting/operations-input";
import type { DevelopmentCapitalDraft } from "@/lib/underwriting/capital-input";
import type { PropertyReturnsDraft } from "@/lib/underwriting/returns-input";

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

export const FACT_DEFINITIONS = {
  proposedUnits: { label: "Proposed units", unit: "units" },
  averageUnitSquareFeet: { label: "Average unit size", unit: "square_feet" },
  grossBuildingSquareFeet: { label: "Gross building area", unit: "gross_square_feet" },
} as const;

export type FactName = keyof typeof FACT_DEFINITIONS;

export type CaseDraft = {
  name: string;
  address: string;
  proposedUnits?: number;
  averageUnitSquareFeet?: number;
  grossBuildingSquareFeet?: number;
  assumptions: Partial<Record<AssumptionName, number>>;
  assumptionMetadata?: Partial<Record<AssumptionName, AssumptionMetadata>>;
  factMetadata?: Partial<Record<FactName, EvidenceMetadata>>;
};

export type EvidenceMetadata = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: "working" | "done";
};

export type AssumptionMetadata = EvidenceMetadata;

export type FactMetadata = EvidenceMetadata & {
  lastChangedAt: string;
  caseRevision: number;
};

export type UnderwritingAssumption = {
  name: AssumptionName;
  key: (typeof ASSUMPTION_DEFINITIONS)[AssumptionName]["key"];
  label: string;
  value: number;
  unit: string;
  sourceKind: "user_supplied";
  sourceLabel?: string;
  sourceDate?: string;
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
  factMetadata: Partial<Record<FactName, FactMetadata>>;
  createdAt: string;
  updatedAt: string;
  assumptions: UnderwritingAssumption[];
  costSchedule?: UnderwritingCostSchedule;
  apartmentOperations?: SavedApartmentOperations;
  developmentCapital?: SavedDevelopmentCapital;
  propertyReturns?: SavedPropertyReturns;
  scenarios?: SavedApartmentScenario[];
};

export type SavedCostLine = MonthlyCostLine & { lastChangedAt: string };

export type UnderwritingCostSchedule = Omit<MonthlyCostScheduleInputs, "costLines"> & {
  costLines: SavedCostLine[];
};

export type SavedApartmentOperations = ApartmentOperationsDraft & { lastChangedAt: string };
export type SavedDevelopmentCapital = DevelopmentCapitalDraft & { lastChangedAt: string };
export type SavedPropertyReturns = PropertyReturnsDraft & { lastChangedAt: string };
export type SavedApartmentScenario = ApartmentScenarioDefinition & { lastChangedAt: string };

export class UnderwritingCaseRevisionConflict extends Error {
  constructor() {
    super("The project changed before your edits were saved. Refresh the page, review the latest project, and try again.");
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
  fact_metadata: Partial<Record<FactName, FactMetadata>>;
  created_at: Date | string;
  updated_at: Date | string;
  analysis_start_month: Date | string | null;
  sale_month: Date | string | null;
  sale_anchor_milestone_id: string | null;
  sale_anchor_offset_months: number | null;
  apartment_operations_input_version: ApartmentOperationsInputs["inputVersion"] | null;
  apartment_operations_input: ApartmentOperationsDraft | null;
  apartment_operations_changed_at: Date | string | null;
  development_capital_input_version: DevelopmentCapitalPlan["capitalInputVersion"] | null;
  development_capital_input: DevelopmentCapitalDraft | null;
  development_capital_changed_at: Date | string | null;
  property_returns_input_version: PropertyReturnsPlan["saleInputVersion"] | null;
  property_returns_input: PropertyReturnsDraft | null;
  property_returns_changed_at: Date | string | null;
};

type AssumptionRow = {
  case_id: string;
  assumption_key: UnderwritingAssumption["key"];
  value: string | number;
  unit: string;
  source_kind: "user_supplied";
  source_label: string | null;
  source_date: Date | string | null;
  review_state: "working" | "done";
  value_changed_at: Date | string;
};

type CaseWithAssumptionsRow = CaseRow & { assumptions: AssumptionRow[] };
type CostLineRow = {
  id: string;
  case_id: string;
  line_order: number;
  name: string;
  category: MonthlyCostLine["category"];
  amount: string | number | null;
  basis_type: CostLineBasisType;
  basis_rate: string | number | null;
  basis_base_line_id: string | null;
  basis_percent: string | number | null;
  basis_total_base: PercentOfTotalBase | null;
  unit: MonthlyCostLine["unit"];
  start_month: Date | string;
  end_month: Date | string;
  start_anchor_milestone_id: string | null;
  start_anchor_offset_months: number | null;
  end_anchor_milestone_id: string | null;
  end_anchor_offset_months: number | null;
  end_duration_months: number | null;
  distribution_method: MonthlyCostLine["distributionMethod"];
  distribution_version: MonthlyCostLine["distributionVersion"];
  source_label: string | null;
  source_date: Date | string | null;
  review_state: MonthlyCostLine["reviewState"];
  value_changed_at: Date | string;
};
type MilestoneRow = {
  id: string;
  name: string;
  month: Date | string;
};
type ScenarioRow = {
  id: string;
  role: ApartmentScenarioDefinition["role"];
  name: string;
  input_version: ApartmentScenarioDefinition["inputVersion"];
  delta: ApartmentScenarioDefinition["delta"];
  evidence: ApartmentScenarioDefinition["evidence"];
  value_changed_at: Date | string;
};
type CaseDetailRow = CaseWithAssumptionsRow & { cost_lines: CostLineRow[]; milestones: MilestoneRow[]; scenarios: ScenarioRow[] };

const byStoredKey = new Map(
  Object.entries(ASSUMPTION_DEFINITIONS).map(([name, definition]) => [
    definition.key,
    { name: name as AssumptionName, ...definition },
  ]),
);

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

function dateOnly(value: Date | string | null) {
  if (value === null) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function monthOnly(value: Date | string) {
  return dateOnly(value)!.slice(0, 7);
}

function optionalNumber(value: string | number | null) {
  return value === null ? undefined : Number(value);
}

function basisFields(line: CostLineRow): Pick<MonthlyCostLine, "amount" | "basis"> {
  if (line.basis_type === "per_gross_square_foot" || line.basis_type === "per_unit") {
    return { basis: { type: line.basis_type, rate: Number(line.basis_rate) } };
  }
  if (line.basis_type === "percent_of_total") {
    return { basis: { type: "percent_of_total", base: line.basis_total_base!, percent: Number(line.basis_percent) } };
  }
  if (line.basis_type === "percent_of_line") {
    return { basis: { type: "percent_of_line", baseLineId: line.basis_base_line_id!, percent: Number(line.basis_percent) } };
  }
  return { amount: Number(line.amount) };
}

function anchorFields(line: CostLineRow): Pick<MonthlyCostLine, "startAnchor" | "endAnchor"> {
  const startAnchor: MilestoneAnchor | undefined = line.start_anchor_milestone_id === null
    ? undefined
    : { milestoneId: line.start_anchor_milestone_id, offsetMonths: Number(line.start_anchor_offset_months) };
  const endAnchor: MilestoneEndAnchor | undefined = line.end_anchor_milestone_id !== null
    ? { milestoneId: line.end_anchor_milestone_id, offsetMonths: Number(line.end_anchor_offset_months) }
    : line.end_duration_months !== null
      ? { durationMonths: Number(line.end_duration_months) }
      : undefined;
  return { ...(startAnchor ? { startAnchor } : {}), ...(endAnchor ? { endAnchor } : {}) };
}

/**
 * Months that come from a milestone move when the milestone moves, so a read gives the month the
 * anchor resolves to now. A run resolves the same anchors again and reports any that fail.
 */
function withCurrentAnchoredMonths(
  costSchedule: UnderwritingCostSchedule | undefined,
  operations: SavedApartmentOperations | undefined,
  capital: SavedDevelopmentCapital | undefined,
) {
  if (!costSchedule?.milestones) return { operations, capital };
  const target = {
    analysisStartMonth: costSchedule.analysisStartMonth,
    saleMonth: costSchedule.saleMonth,
    saleAnchor: costSchedule.saleAnchor,
    milestones: costSchedule.milestones,
    operationStartMonth: operations?.operationStartMonth,
    operationStartAnchor: operations?.operationStartAnchor,
    growthStartMonth: operations?.growthStartMonth,
    growthStartAnchor: operations?.growthStartAnchor,
    payoffMonth: capital?.payoffMonth,
  };
  resolveMilestoneAnchors(target);
  const withMonths = operations && target.operationStartMonth !== undefined && target.growthStartMonth !== undefined
    ? { ...operations, operationStartMonth: target.operationStartMonth, growthStartMonth: target.growthStartMonth }
    : operations;
  return {
    operations: withMonths?.commercial ? withCurrentLeaseStarts(withMonths, costSchedule.milestones) : withMonths,
    capital: capital && target.payoffMonth !== undefined ? { ...capital, payoffMonth: target.payoffMonth } : capital,
  };
}

/** A commercial space anchored to a milestone reads the anchor's current month, the same as the engine does on a run. */
function withCurrentLeaseStarts(operations: SavedApartmentOperations, milestones: Milestone[]): SavedApartmentOperations {
  const commercial = operations.commercial!;
  return {
    ...operations,
    commercial: {
      ...commercial,
      spaces: commercial.spaces.map((space) => {
        if (space.leaseStartAnchor === undefined) return space;
        const month = leaseStartMonthFor(space, milestones);
        return month === null ? space : { ...space, leaseStartMonth: month };
      }),
    },
  };
}

/** Quantities that per-area and per-unit lines price against come from the case facts, never from the schedule save. */
function costQuantities(row: CaseRow): CostQuantities {
  const grossSquareFeet = optionalNumber(row.gross_building_square_feet);
  const units = optionalNumber(row.proposed_units);
  return {
    ...(grossSquareFeet !== undefined ? { grossSquareFeet } : {}),
    ...(units !== undefined ? { units } : {}),
  };
}

function mapCase(
  row: CaseRow,
  assumptions: AssumptionRow[] = [],
  costLines: CostLineRow[] = [],
  scenarios: ScenarioRow[] = [],
  milestoneRows: MilestoneRow[] = [],
): UnderwritingCase {
  const costSchedule: UnderwritingCostSchedule | undefined = row.analysis_start_month && row.sale_month ? {
    analysisStartMonth: monthOnly(row.analysis_start_month),
    saleMonth: monthOnly(row.sale_month),
    ...(row.sale_anchor_milestone_id !== null
      ? { saleAnchor: { milestoneId: row.sale_anchor_milestone_id, offsetMonths: Number(row.sale_anchor_offset_months) } }
      : {}),
    ...(milestoneRows.length > 0
      ? { milestones: milestoneRows.map((milestone) => ({ id: milestone.id, name: milestone.name, month: monthOnly(milestone.month) })) }
      : {}),
    costLines: costLines.map((line) => ({
      id: line.id,
      name: line.name,
      category: line.category,
      ...basisFields(line),
      unit: line.unit,
      startMonth: monthOnly(line.start_month),
      endMonth: monthOnly(line.end_month),
      ...anchorFields(line),
      distributionMethod: line.distribution_method,
      distributionVersion: line.distribution_version,
      sourceLabel: line.source_label ?? undefined,
      sourceDate: dateOnly(line.source_date),
      reviewState: line.review_state,
      lastChangedAt: iso(line.value_changed_at),
    })),
    quantities: costQuantities(row),
  } : undefined;
  const savedOperations: SavedApartmentOperations | undefined = row.apartment_operations_input_version && row.apartment_operations_input && row.apartment_operations_changed_at ? {
    ...row.apartment_operations_input,
    inputVersion: row.apartment_operations_input_version,
    lastChangedAt: iso(row.apartment_operations_changed_at),
  } : undefined;
  const savedCapital: SavedDevelopmentCapital | undefined = row.development_capital_input_version && row.development_capital_input && row.development_capital_changed_at ? {
    ...row.development_capital_input,
    capitalInputVersion: row.development_capital_input_version,
    lastChangedAt: iso(row.development_capital_changed_at),
  } : undefined;
  const { operations, capital } = withCurrentAnchoredMonths(costSchedule, savedOperations, savedCapital);
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
    factMetadata: row.fact_metadata ?? {},
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
        sourceLabel: assumption.source_label ?? undefined,
        sourceDate: dateOnly(assumption.source_date),
        reviewState: assumption.review_state,
        lastChangedAt: iso(assumption.value_changed_at),
      };
    }),
    scenarios: scenarios.map((scenario) => ({
      id: scenario.id,
      role: scenario.role,
      name: scenario.name,
      inputVersion: scenario.input_version,
      delta: scenario.delta,
      evidence: scenario.evidence,
      lastChangedAt: iso(scenario.value_changed_at),
    })),
    ...(costSchedule ? { costSchedule } : {}),
    ...(operations ? { apartmentOperations: operations } : {}),
    ...(capital ? { developmentCapital: capital } : {}),
    ...(row.property_returns_input_version && row.property_returns_input && row.property_returns_changed_at ? {
      propertyReturns: {
        ...row.property_returns_input,
        saleInputVersion: row.property_returns_input_version,
        lastChangedAt: iso(row.property_returns_changed_at),
      },
    } : {}),
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
      source_label: metadata?.sourceLabel ?? null,
      source_date: metadata?.sourceDate ?? null,
      review_state: metadata?.reviewState ?? "working",
    }];
  });
}

export async function createUnderwritingCase(db: Db, draft: CaseDraft) {
  const { rows } = await db.query<CaseRow>(
    `with new_case as (
       insert into underwriting_cases
         (name, address, proposed_units, average_unit_square_feet, gross_building_square_feet,
          fact_metadata)
       values (
         $1, $2, $3::integer, $4::numeric, $5::numeric,
         reconcile_underwriting_fact_metadata(
           '{}'::jsonb, null, null, null,
           $3::integer, $4::numeric, $5::numeric, $7::jsonb, 1, now()
         )
       )
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
      JSON.stringify(draft.factMetadata ?? {}),
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
  const { rows } = await db.query<CaseDetailRow>(
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
            ) as assumptions,
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', line.id,
                    'case_id', line.case_id,
                    'line_order', line.line_order,
                    'name', line.name,
                    'category', line.category,
                    'amount', line.amount,
                    'basis_type', line.basis_type,
                    'basis_rate', line.basis_rate,
                    'basis_base_line_id', line.basis_base_line_id,
                    'basis_percent', line.basis_percent,
                    'basis_total_base', line.basis_total_base,
                    'unit', line.unit,
                    'start_month', line.start_month,
                    'end_month', line.end_month,
                    'start_anchor_milestone_id', line.start_anchor_milestone_id,
                    'start_anchor_offset_months', line.start_anchor_offset_months,
                    'end_anchor_milestone_id', line.end_anchor_milestone_id,
                    'end_anchor_offset_months', line.end_anchor_offset_months,
                    'end_duration_months', line.end_duration_months,
                    'distribution_method', line.distribution_method,
                    'distribution_version', line.distribution_version,
                    'source_label', line.source_label,
                    'source_date', line.source_date,
                    'review_state', line.review_state,
                    'value_changed_at', line.value_changed_at
                  ) order by line.line_order
                )
                from underwriting_case_cost_lines line
                where line.case_id = c.id
              ),
              '[]'::jsonb
            ) as cost_lines
            ,coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object('id', milestone.id, 'name', milestone.name, 'month', milestone.month)
                  order by milestone.line_order
                )
                from underwriting_case_milestones milestone
                where milestone.case_id = c.id
              ),
              '[]'::jsonb
            ) as milestones
            ,coalesce(
              (
                select jsonb_agg(jsonb_build_object(
                  'id', scenario.id,
                  'role', scenario.role,
                  'name', scenario.name,
                  'input_version', scenario.input_version,
                  'delta', scenario.delta,
                  'evidence', scenario.evidence,
                  'value_changed_at', scenario.value_changed_at
                ) order by scenario.role)
                from underwriting_case_scenarios scenario
                where scenario.case_id = c.id
              ),
              '[]'::jsonb
            ) as scenarios
     from underwriting_cases c
     left join underwriting_case_assumptions a on a.case_id = c.id
     where c.id = $1
     group by c.id`,
    [id],
  );
  return rows[0] ? mapCase(rows[0], rows[0].assumptions, rows[0].cost_lines, rows[0].scenarios, rows[0].milestones) : null;
}

export async function saveApartmentScenarios(
  db: Db,
  id: string,
  expectedRevision: number,
  scenarios: ApartmentScenarioDefinition[],
) {
  const existing = await getUnderwritingCase(db, id);
  if (!existing) return null;
  if (existing.caseRevision !== expectedRevision) throw new UnderwritingCaseRevisionConflict();
  const priorById = new Map((existing.scenarios ?? []).map((scenario) => [scenario.id, scenario]));
  const supplied = scenarios.map((scenario) => ({
    ...scenario,
    evidence: reconcileScenarioEvidence(priorById.get(scenario.id), scenario),
  }));
  const { rows } = await db.query<{ id: string }>(
    `with updated_case as (
       update underwriting_cases set case_revision = case_revision + 1, updated_at = now()
       where id = $1 and case_revision = $3 returning id
     ), supplied as (
       select * from jsonb_to_recordset($2::jsonb) as item(
         id text, role text, name text, "inputVersion" text, delta jsonb, evidence jsonb
       )
     ), removed as (
       delete from underwriting_case_scenarios
       where case_id in (select id from updated_case)
         and id not in (select id from supplied)
     ), saved as (
       insert into underwriting_case_scenarios(case_id, id, role, name, input_version, delta, evidence)
       select updated_case.id, supplied.id, supplied.role, supplied.name,
              supplied."inputVersion", supplied.delta, supplied.evidence
       from updated_case cross join supplied
       on conflict (case_id, id) do update set
         role = excluded.role,
         name = excluded.name,
         input_version = excluded.input_version,
         delta = excluded.delta,
         evidence = excluded.evidence,
         value_changed_at = case when
           underwriting_case_scenarios.role is distinct from excluded.role
           or underwriting_case_scenarios.name is distinct from excluded.name
           or underwriting_case_scenarios.input_version is distinct from excluded.input_version
           or underwriting_case_scenarios.delta is distinct from excluded.delta
           or underwriting_case_scenarios.evidence is distinct from excluded.evidence
         then now() else underwriting_case_scenarios.value_changed_at end,
         updated_at = now()
     ) select id from updated_case`,
    [id, JSON.stringify(supplied), expectedRevision],
  );
  if (!rows[0]) throw new UnderwritingCaseRevisionConflict();
  return getUnderwritingCase(db, id);
}

function reconcileScenarioEvidence(
  existing: SavedApartmentScenario | undefined,
  draft: ApartmentScenarioDefinition,
) {
  return Object.fromEntries(Object.entries(draft.evidence).map(([key, evidence]) => {
    const prior = existing?.evidence[key as keyof ApartmentScenarioDefinition["evidence"]];
    const changed = existing && (
      existing.delta[key as keyof ApartmentScenarioDefinition["delta"]] !== draft.delta[key as keyof ApartmentScenarioDefinition["delta"]]
      || prior?.sourceLabel !== evidence?.sourceLabel
      || prior?.sourceDate !== evidence?.sourceDate
    );
    return [key, changed ? { ...evidence, reviewState: "working" as const } : evidence];
  })) as Partial<Record<keyof ApartmentScenarioDefinition["evidence"], ApartmentScenarioEvidence>>;
}

export async function saveUnderwritingCostSchedule(
  db: Db,
  id: string,
  expectedRevision: number,
  schedule: MonthlyCostScheduleInputs,
) {
  const supplied = schedule.costLines.map((line, lineOrder) => ({
    ...line,
    amount: line.amount ?? null,
    basisType: line.basis?.type ?? "fixed",
    basisRate: line.basis && "rate" in line.basis ? line.basis.rate : null,
    basisBaseLineId: line.basis?.type === "percent_of_line" ? line.basis.baseLineId : null,
    basisPercent: line.basis?.type === "percent_of_line" || line.basis?.type === "percent_of_total" ? line.basis.percent : null,
    basisTotalBase: line.basis?.type === "percent_of_total" ? line.basis.base : null,
    startAnchorMilestoneId: line.startAnchor?.milestoneId ?? null,
    startAnchorOffsetMonths: line.startAnchor?.offsetMonths ?? null,
    endAnchorMilestoneId: line.endAnchor && "milestoneId" in line.endAnchor ? line.endAnchor.milestoneId : null,
    endAnchorOffsetMonths: line.endAnchor && "milestoneId" in line.endAnchor ? line.endAnchor.offsetMonths : null,
    endDurationMonths: line.endAnchor && "durationMonths" in line.endAnchor ? line.endAnchor.durationMonths : null,
    lineOrder,
    sourceLabel: line.sourceLabel ?? null,
    sourceDate: line.sourceDate ?? null,
  }));
  const suppliedMilestones = (schedule.milestones ?? []).map((milestone, lineOrder) => ({ ...milestone, lineOrder }));
  const { rows } = await db.query<{ id: string }>(
    `with updated_case as (
       update underwriting_cases
       set analysis_start_month = ($2::text || '-01')::date,
           sale_month = ($3::text || '-01')::date,
           sale_anchor_milestone_id = $6::text,
           sale_anchor_offset_months = $7::integer,
           property_returns_input = case
             when property_returns_input is not null
               and sale_month is distinct from ($3::text || '-01')::date
             then jsonb_set(
               property_returns_input,
               '{saleAssumptionEvidence,saleMonth,reviewState}',
               '"working"'::jsonb
             )
             else property_returns_input
           end,
           property_returns_changed_at = case
             when property_returns_input is not null
               and sale_month is distinct from ($3::text || '-01')::date
             then now()
             else property_returns_changed_at
           end,
           case_revision = case_revision + 1,
           updated_at = now()
       where id = $1 and case_revision = $5
       returning id
     ), supplied_lines as (
       select * from jsonb_to_recordset($4::jsonb) as supplied(
         id text, name text, category text, amount numeric, unit text,
         "basisType" text, "basisRate" numeric, "basisBaseLineId" text, "basisPercent" numeric,
         "basisTotalBase" text,
         "startMonth" text, "endMonth" text,
         "startAnchorMilestoneId" text, "startAnchorOffsetMonths" integer,
         "endAnchorMilestoneId" text, "endAnchorOffsetMonths" integer, "endDurationMonths" integer,
         "distributionMethod" text,
         "distributionVersion" text, "sourceLabel" text, "sourceDate" date,
         "reviewState" text, "lineOrder" integer
       )
     ), removed_milestones as (
       delete from underwriting_case_milestones
       where case_id in (select id from updated_case)
         and id not in (select id from jsonb_to_recordset($8::jsonb) as kept(id text))
     ), saved_milestones as (
       insert into underwriting_case_milestones (case_id, id, line_order, name, month)
       select updated_case.id, supplied.id, supplied."lineOrder", supplied.name,
              (supplied.month || '-01')::date
       from updated_case
       cross join jsonb_to_recordset($8::jsonb)
         as supplied(id text, name text, month text, "lineOrder" integer)
       on conflict (case_id, id) do update
       set line_order = excluded.line_order,
           name = excluded.name,
           month = excluded.month,
           value_changed_at = case
             when underwriting_case_milestones.name is distinct from excluded.name
               or underwriting_case_milestones.month is distinct from excluded.month
             then now()
             else underwriting_case_milestones.value_changed_at
           end,
           updated_at = now()
       returning case_id
     ), removed_lines as (
       delete from underwriting_case_cost_lines
       where case_id in (select id from updated_case)
         and id not in (select id from supplied_lines)
     ), saved_lines as (
       insert into underwriting_case_cost_lines
         (case_id, id, line_order, name, category, amount, unit, basis_type,
          basis_rate, basis_base_line_id, basis_percent, basis_total_base, start_month,
          end_month, start_anchor_milestone_id, start_anchor_offset_months,
          end_anchor_milestone_id, end_anchor_offset_months, end_duration_months,
          distribution_method, distribution_version, source_label,
          source_date, review_state)
       select updated_case.id, supplied.id, supplied."lineOrder", supplied.name,
              supplied.category, supplied.amount, supplied.unit,
              supplied."basisType", supplied."basisRate", supplied."basisBaseLineId",
              supplied."basisPercent", supplied."basisTotalBase",
              (supplied."startMonth" || '-01')::date,
              (supplied."endMonth" || '-01')::date,
              supplied."startAnchorMilestoneId", supplied."startAnchorOffsetMonths",
              supplied."endAnchorMilestoneId", supplied."endAnchorOffsetMonths",
              supplied."endDurationMonths",
              supplied."distributionMethod", supplied."distributionVersion",
              supplied."sourceLabel", supplied."sourceDate", supplied."reviewState"
       from updated_case cross join supplied_lines supplied
       on conflict (case_id, id) do update
       set line_order = excluded.line_order,
           name = excluded.name,
           category = excluded.category,
           amount = excluded.amount,
           unit = excluded.unit,
           basis_type = excluded.basis_type,
           basis_rate = excluded.basis_rate,
           basis_base_line_id = excluded.basis_base_line_id,
           basis_percent = excluded.basis_percent,
           basis_total_base = excluded.basis_total_base,
           start_month = excluded.start_month,
           end_month = excluded.end_month,
           start_anchor_milestone_id = excluded.start_anchor_milestone_id,
           start_anchor_offset_months = excluded.start_anchor_offset_months,
           end_anchor_milestone_id = excluded.end_anchor_milestone_id,
           end_anchor_offset_months = excluded.end_anchor_offset_months,
           end_duration_months = excluded.end_duration_months,
           distribution_method = excluded.distribution_method,
           distribution_version = excluded.distribution_version,
           source_label = excluded.source_label,
           source_date = excluded.source_date,
           review_state = case
             when underwriting_case_cost_lines.name is distinct from excluded.name
               or underwriting_case_cost_lines.category is distinct from excluded.category
               or underwriting_case_cost_lines.amount is distinct from excluded.amount
               or underwriting_case_cost_lines.unit is distinct from excluded.unit
               or underwriting_case_cost_lines.basis_type is distinct from excluded.basis_type
               or underwriting_case_cost_lines.basis_rate is distinct from excluded.basis_rate
               or underwriting_case_cost_lines.basis_base_line_id is distinct from excluded.basis_base_line_id
               or underwriting_case_cost_lines.basis_percent is distinct from excluded.basis_percent
               or underwriting_case_cost_lines.basis_total_base is distinct from excluded.basis_total_base
               or underwriting_case_cost_lines.start_month is distinct from excluded.start_month
               or underwriting_case_cost_lines.end_month is distinct from excluded.end_month
               or underwriting_case_cost_lines.start_anchor_milestone_id is distinct from excluded.start_anchor_milestone_id
               or underwriting_case_cost_lines.start_anchor_offset_months is distinct from excluded.start_anchor_offset_months
               or underwriting_case_cost_lines.end_anchor_milestone_id is distinct from excluded.end_anchor_milestone_id
               or underwriting_case_cost_lines.end_anchor_offset_months is distinct from excluded.end_anchor_offset_months
               or underwriting_case_cost_lines.end_duration_months is distinct from excluded.end_duration_months
               or underwriting_case_cost_lines.distribution_method is distinct from excluded.distribution_method
               or underwriting_case_cost_lines.distribution_version is distinct from excluded.distribution_version
               or underwriting_case_cost_lines.source_label is distinct from excluded.source_label
               or underwriting_case_cost_lines.source_date is distinct from excluded.source_date
             then 'working'
             else excluded.review_state
           end,
           value_changed_at = case
             when underwriting_case_cost_lines.name is distinct from excluded.name
               or underwriting_case_cost_lines.category is distinct from excluded.category
               or underwriting_case_cost_lines.amount is distinct from excluded.amount
               or underwriting_case_cost_lines.unit is distinct from excluded.unit
               or underwriting_case_cost_lines.basis_type is distinct from excluded.basis_type
               or underwriting_case_cost_lines.basis_rate is distinct from excluded.basis_rate
               or underwriting_case_cost_lines.basis_base_line_id is distinct from excluded.basis_base_line_id
               or underwriting_case_cost_lines.basis_percent is distinct from excluded.basis_percent
               or underwriting_case_cost_lines.basis_total_base is distinct from excluded.basis_total_base
               or underwriting_case_cost_lines.start_month is distinct from excluded.start_month
               or underwriting_case_cost_lines.end_month is distinct from excluded.end_month
               or underwriting_case_cost_lines.start_anchor_milestone_id is distinct from excluded.start_anchor_milestone_id
               or underwriting_case_cost_lines.start_anchor_offset_months is distinct from excluded.start_anchor_offset_months
               or underwriting_case_cost_lines.end_anchor_milestone_id is distinct from excluded.end_anchor_milestone_id
               or underwriting_case_cost_lines.end_anchor_offset_months is distinct from excluded.end_anchor_offset_months
               or underwriting_case_cost_lines.end_duration_months is distinct from excluded.end_duration_months
               or underwriting_case_cost_lines.distribution_method is distinct from excluded.distribution_method
               or underwriting_case_cost_lines.distribution_version is distinct from excluded.distribution_version
               or underwriting_case_cost_lines.source_label is distinct from excluded.source_label
               or underwriting_case_cost_lines.source_date is distinct from excluded.source_date
             then now()
             else underwriting_case_cost_lines.value_changed_at
           end,
           updated_at = now()
       returning case_id
     )
     select id from updated_case`,
    [
      id,
      schedule.analysisStartMonth,
      schedule.saleMonth,
      JSON.stringify(supplied),
      expectedRevision,
      schedule.saleAnchor?.milestoneId ?? null,
      schedule.saleAnchor?.offsetMonths ?? null,
      JSON.stringify(suppliedMilestones),
    ],
  );
  if (!rows[0]) {
    const existing = await getUnderwritingCase(db, id);
    if (existing) throw new UnderwritingCaseRevisionConflict();
    return null;
  }
  return getUnderwritingCase(db, id);
}

export async function saveApartmentOperations(
  db: Db,
  id: string,
  expectedRevision: number,
  operations: ApartmentOperationsDraft,
) {
  const existing = await getUnderwritingCase(db, id);
  if (!existing) return null;
  if (existing.caseRevision !== expectedRevision) throw new UnderwritingCaseRevisionConflict();
  const reconciled = reconcileOperationsReview(existing.apartmentOperations, operations);
  const { rows } = await db.query<{ id: string }>(
    `update underwriting_cases
     set apartment_operations_input_version = $2,
         apartment_operations_input = $3::jsonb,
         apartment_operations_changed_at = now(),
         case_revision = case_revision + 1,
         updated_at = now()
     where id = $1 and case_revision = $4
     returning id`,
    [id, reconciled.inputVersion, JSON.stringify(reconciled), expectedRevision],
  );
  if (!rows[0]) {
    throw new UnderwritingCaseRevisionConflict();
  }
  return getUnderwritingCase(db, id);
}

export async function saveDevelopmentCapital(
  db: Db,
  id: string,
  expectedRevision: number,
  capital: DevelopmentCapitalDraft,
) {
  const existing = await getUnderwritingCase(db, id);
  if (!existing) return null;
  if (existing.caseRevision !== expectedRevision) throw new UnderwritingCaseRevisionConflict();
  const reconciled = reconcileDevelopmentCapitalReview(existing.developmentCapital, capital);
  const { rows } = await db.query<{ id: string }>(
    `update underwriting_cases
     set development_capital_input_version = $2,
         development_capital_input = $3::jsonb,
         development_capital_changed_at = now(),
         case_revision = case_revision + 1,
         updated_at = now()
     where id = $1 and case_revision = $4
     returning id`,
    [id, reconciled.capitalInputVersion, JSON.stringify(reconciled), expectedRevision],
  );
  if (!rows[0]) throw new UnderwritingCaseRevisionConflict();
  return getUnderwritingCase(db, id);
}

export async function savePropertyReturns(
  db: Db,
  id: string,
  expectedRevision: number,
  propertyReturns: PropertyReturnsDraft,
) {
  const existing = await getUnderwritingCase(db, id);
  if (!existing) return null;
  if (existing.caseRevision !== expectedRevision) throw new UnderwritingCaseRevisionConflict();
  const reconciled = reconcilePropertyReturnsReview(existing.propertyReturns, propertyReturns);
  const { rows } = await db.query<{ id: string }>(
    `update underwriting_cases
     set property_returns_input_version = $2,
         property_returns_input = $3::jsonb,
         property_returns_changed_at = now(),
         case_revision = case_revision + 1,
         updated_at = now()
     where id = $1 and case_revision = $4
     returning id`,
    [id, reconciled.saleInputVersion, JSON.stringify(reconciled), expectedRevision],
  );
  if (!rows[0]) throw new UnderwritingCaseRevisionConflict();
  return getUnderwritingCase(db, id);
}

function reconcilePropertyReturnsReview(
  existing: SavedPropertyReturns | undefined,
  draft: PropertyReturnsDraft,
): PropertyReturnsDraft {
  return {
    ...draft,
    saleAssumptionEvidence: Object.fromEntries((draft.commercialTerminalCapRatePercent === undefined
      ? [...PROPERTY_RETURNS_ASSUMPTION_KEYS]
      : [...PROPERTY_RETURNS_ASSUMPTION_KEYS, PROPERTY_RETURNS_COMMERCIAL_CAP_KEY]
    ).map((key) => {
      const priorEvidence = existing?.saleAssumptionEvidence[key];
      const nextEvidence = draft.saleAssumptionEvidence[key]!;
      const changed = existing && (
        propertyReturnsValue(existing, key) !== propertyReturnsValue(draft, key)
        || priorEvidence?.sourceLabel !== nextEvidence.sourceLabel
        || priorEvidence?.sourceDate !== nextEvidence.sourceDate
      );
      return [key, changed ? { ...nextEvidence, reviewState: "working" as const } : nextEvidence];
    })) as PropertyReturnsPlan["saleAssumptionEvidence"],
    ...(draft.lenderTests ? { lenderTests: reconcileLenderTestReview(existing?.lenderTests, draft.lenderTests) } : {}),
    ...(draft.saleTax ? { saleTax: reconcileSaleTaxReview(existing?.saleTax, draft.saleTax) } : {}),
    ...(draft.partnership ? { partnership: reconcilePartnershipReview(existing?.partnership, draft.partnership) } : {}),
  };
}

/** The partnership inputs each piece of evidence speaks for. Changing any of them resets that evidence to Working on It. */
const PARTNERSHIP_EVIDENCE_FIELDS: Record<PartnershipAssumptionKey, Array<keyof PartnershipPlan>> = {
  funding: ["lpFundingSharePercent", "fundingOrder", "lpEntryMonth"],
  preferredReturn: ["preferredReturn"],
  promoteTiers: ["tiers", "finalSplit"],
};

function reconcilePartnershipReview(existing: PartnershipPlan | undefined, draft: PartnershipPlan): PartnershipPlan {
  return {
    ...draft,
    partnershipEvidence: Object.fromEntries(PARTNERSHIP_ASSUMPTION_KEYS.flatMap((key) => {
      const nextEvidence = draft.partnershipEvidence[key];
      if (!nextEvidence) return [];
      const priorEvidence = existing?.partnershipEvidence[key];
      const changed = existing && (
        PARTNERSHIP_EVIDENCE_FIELDS[key].some((field) => stableJson(existing[field]) !== stableJson(draft[field]))
        || priorEvidence?.sourceLabel !== nextEvidence.sourceLabel
        || priorEvidence?.sourceDate !== nextEvidence.sourceDate
      );
      return [[key, changed ? { ...nextEvidence, reviewState: "working" as const } : nextEvidence]];
    })),
  };
}

function reconcileSaleTaxReview(existing: SaleTaxPlan | undefined, draft: SaleTaxPlan): SaleTaxPlan {
  return {
    ...draft,
    saleTaxEvidence: Object.fromEntries(SALE_TAX_ASSUMPTION_KEYS.flatMap((key) => {
      const nextEvidence = draft.saleTaxEvidence[key];
      if (!nextEvidence) return [];
      const priorEvidence = existing?.saleTaxEvidence[key];
      const changed = existing && (
        existing[key] !== draft[key]
        || priorEvidence?.sourceLabel !== nextEvidence.sourceLabel
        || priorEvidence?.sourceDate !== nextEvidence.sourceDate
      );
      return [[key, changed ? { ...nextEvidence, reviewState: "working" as const } : nextEvidence]];
    })),
  };
}

/** The inputs each piece of tax evidence speaks for. Changing any of them resets that evidence to Working on It. */
const PROPERTY_TAX_EVIDENCE_FIELDS: Record<PropertyTaxAssumptionKey, Array<keyof PropertyTaxPlan>> = {
  firstFiscalYearStartMonth: ["firstFiscalYearStartMonth"],
  assessment: ["assessmentBasis", "landAssessedValue", "improvementAssessedValue", "assessorExpenseRatioPercent", "assessmentCapRatePercent", "leaseUpAssessmentCapRatePercent", "assessmentRatioPercent"],
  fiscalYears: ["mode", "rateUnit", "fiscalYears"],
  annualRateGrowthPercent: ["annualRateGrowthPercent"],
};

function reconcilePropertyTaxReview(existing: PropertyTaxPlan | undefined, draft: PropertyTaxPlan): PropertyTaxPlan {
  return {
    ...draft,
    taxEvidence: Object.fromEntries(PROPERTY_TAX_ASSUMPTION_KEYS.map((key) => {
      const priorEvidence = existing?.taxEvidence[key];
      const nextEvidence = draft.taxEvidence[key];
      const changed = existing && (
        PROPERTY_TAX_EVIDENCE_FIELDS[key].some((field) => JSON.stringify(existing[field]) !== JSON.stringify(draft[field]))
        || priorEvidence?.sourceLabel !== nextEvidence.sourceLabel
        || priorEvidence?.sourceDate !== nextEvidence.sourceDate
      );
      return [key, changed ? { ...nextEvidence, reviewState: "working" as const } : nextEvidence];
    })) as PropertyTaxPlan["taxEvidence"],
  };
}

function reconcileLenderTestReview(existing: LenderTestPlan | undefined, draft: LenderTestPlan): LenderTestPlan {
  return {
    lenderTestInputVersion: draft.lenderTestInputVersion,
    valuationMonth: draft.valuationMonth,
    asStabilizedCapRatePercent: draft.asStabilizedCapRatePercent,
    ...(draft.annualDebtService === undefined ? {} : { annualDebtService: draft.annualDebtService }),
    noiBasis: draft.noiBasis,
    ...(draft.commercialCapRatePercent === undefined ? {} : { commercialCapRatePercent: draft.commercialCapRatePercent }),
    ...(draft.debtServiceBasis === undefined ? {} : { debtServiceBasis: draft.debtServiceBasis }),
    lenderTestEvidence: Object.fromEntries((draft.commercialCapRatePercent === undefined
      ? [...LENDER_TEST_ASSUMPTION_KEYS]
      : [...LENDER_TEST_ASSUMPTION_KEYS, LENDER_TEST_COMMERCIAL_CAP_KEY]
    ).map((key) => {
      const priorEvidence = existing?.lenderTestEvidence[key];
      const { sourceLabel, sourceDate, reviewState } = draft.lenderTestEvidence[key]!;
      const nextEvidence = {
        ...(sourceLabel === undefined ? {} : { sourceLabel }),
        ...(sourceDate === undefined ? {} : { sourceDate }),
        reviewState,
      };
      const changed = existing && (
        existing[key] !== draft[key]
        || priorEvidence?.sourceLabel !== nextEvidence.sourceLabel
        || priorEvidence?.sourceDate !== nextEvidence.sourceDate
      );
      return [key, changed ? { ...nextEvidence, reviewState: "working" as const } : nextEvidence];
    })) as LenderTestPlan["lenderTestEvidence"],
    ...(draft.loanSizing ? { loanSizing: reconcileLoanSizingReview(existing?.loanSizing, draft.loanSizing) } : {}),
  };
}

/** Loan sizing terms carry one evidence record, reset to Working on It when any term or its source changes. */
function reconcileLoanSizingReview(existing: LoanSizingPlan | undefined, draft: LoanSizingPlan): LoanSizingPlan {
  const { evidence } = draft;
  const terms = {
    noiTaxBasis: draft.noiTaxBasis,
    ...(draft.maxLoanToValuePercent === undefined ? {} : { maxLoanToValuePercent: draft.maxLoanToValuePercent }),
    ...(draft.minDebtYieldPercent === undefined ? {} : { minDebtYieldPercent: draft.minDebtYieldPercent }),
    ...(draft.minDebtServiceCoverage === undefined ? {} : { minDebtServiceCoverage: draft.minDebtServiceCoverage }),
    ...(draft.dscrRatePercent === undefined ? {} : { dscrRatePercent: draft.dscrRatePercent }),
    ...(draft.dscrAmortizationYears === undefined ? {} : { dscrAmortizationYears: draft.dscrAmortizationYears }),
  };
  const nextEvidence = {
    ...(evidence.sourceLabel === undefined ? {} : { sourceLabel: evidence.sourceLabel }),
    ...(evidence.sourceDate === undefined ? {} : { sourceDate: evidence.sourceDate }),
    reviewState: evidence.reviewState,
  };
  const termKeys = ["noiTaxBasis", "maxLoanToValuePercent", "minDebtYieldPercent", "minDebtServiceCoverage", "dscrRatePercent", "dscrAmortizationYears"] as const;
  const changed = existing && (
    termKeys.some((key) => existing[key] !== draft[key])
    || existing.evidence.sourceLabel !== nextEvidence.sourceLabel
    || existing.evidence.sourceDate !== nextEvidence.sourceDate
  );
  return { ...terms, evidence: changed ? { ...nextEvidence, reviewState: "working" } : nextEvidence };
}

function propertyReturnsValue(plan: PropertyReturnsPlan, key: PropertyReturnsAssumptionKey | typeof PROPERTY_RETURNS_COMMERCIAL_CAP_KEY) {
  if (key === "saleMonth") return undefined;
  return plan[key];
}

function reconcileDevelopmentCapitalReview(
  existing: SavedDevelopmentCapital | undefined,
  draft: DevelopmentCapitalDraft,
): DevelopmentCapitalDraft {
  const ratePathChanged = existing !== undefined && JSON.stringify(existing.ratePath) !== JSON.stringify(draft.ratePath);
  return {
    ...draft,
    ...(draft.otherSources ? { otherSources: reconcileLineReview(existing?.otherSources, draft.otherSources) } : {}),
    ...(draft.creditedLand ? { creditedLand: reconcileBlockReview(existing?.creditedLand, draft.creditedLand) } : {}),
    ...(draft.permanentLoan ? { permanentLoan: reconcilePermanentLoanReview(existing?.permanentLoan, draft.permanentLoan) } : {}),
    capitalAssumptionEvidence: Object.fromEntries(DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS.map((key) => [
      key,
      existing && (
        (key === "annualInterestRatePercent" && ratePathChanged)
        || existing[key] !== draft[key]
        || existing.capitalAssumptionEvidence[key].sourceLabel !== draft.capitalAssumptionEvidence[key].sourceLabel
        || existing.capitalAssumptionEvidence[key].sourceDate !== draft.capitalAssumptionEvidence[key].sourceDate
      )
        ? { ...draft.capitalAssumptionEvidence[key], reviewState: "working" as const }
        : draft.capitalAssumptionEvidence[key],
    ])) as Record<DevelopmentCapitalAssumptionKey, DevelopmentCapitalPlan["capitalAssumptionEvidence"][DevelopmentCapitalAssumptionKey]>,
  };
}

/** The permanent loan inputs each piece of evidence speaks for. Changing any of them resets that evidence to Working on It. */
const PERMANENT_LOAN_EVIDENCE_FIELDS: Record<PermanentLoanAssumptionKey | PermanentLoanCapKey, Array<keyof PermanentLoanPlan>> = {
  fundingMonth: ["fundingMonth", "fundingAnchor"],
  sizingMode: ["sizingMode"],
  sizingNoiWindow: ["sizingNoiWindow"],
  noiTaxBasis: ["noiTaxBasis"],
  annualRatePercent: ["annualRatePercent"],
  interestOnlyMonths: ["interestOnlyMonths"],
  amortizationYears: ["amortizationYears"],
  termYears: ["termYears"],
  feePercent: ["feePercent"],
  closingCosts: ["closingCosts"],
  cashOut: ["cashOut"],
  maxLoanToValuePercent: ["maxLoanToValuePercent"],
  valuationCapRatePercent: ["valuationCapRatePercent"],
  commercialValuationCapRatePercent: ["commercialValuationCapRatePercent"],
  minDebtServiceCoverage: ["minDebtServiceCoverage"],
  minDebtYieldPercent: ["minDebtYieldPercent"],
};

function reconcilePermanentLoanReview(existing: PermanentLoanPlan | undefined, draft: PermanentLoanPlan): PermanentLoanPlan {
  const evidence = Object.fromEntries(Object.entries(draft.evidence).map(([key, nextEvidence]) => {
    const fields = PERMANENT_LOAN_EVIDENCE_FIELDS[key as keyof typeof PERMANENT_LOAN_EVIDENCE_FIELDS];
    const priorEvidence = existing?.evidence[key as keyof PermanentLoanPlan["evidence"]];
    const changed = existing && fields && (
      fields.some((field) => stableJson(existing[field]) !== stableJson(draft[field]))
      || priorEvidence?.sourceLabel !== nextEvidence?.sourceLabel
      || priorEvidence?.sourceDate !== nextEvidence?.sourceDate
    );
    return [key, changed && nextEvidence ? { ...nextEvidence, reviewState: "working" as const } : nextEvidence];
  })) as PermanentLoanPlan["evidence"];
  return { ...draft, evidence };
}

function reconcileOperationsReview(
  existing: SavedApartmentOperations | undefined,
  draft: ApartmentOperationsDraft,
): ApartmentOperationsDraft {
  return {
    ...draft,
    assumptionEvidence: reconcileAssumptionEvidence(existing, draft),
    residentialUnitTypes: reconcileLineReview(existing?.residentialUnitTypes, draft.residentialUnitTypes),
    otherIncomeLines: reconcileLineReview(existing?.otherIncomeLines, draft.otherIncomeLines),
    operatingExpenseLines: reconcileLineReview(existing?.operatingExpenseLines, draft.operatingExpenseLines),
    capitalExpenditureLines: reconcileLineReview(existing?.capitalExpenditureLines, draft.capitalExpenditureLines),
    ...(draft.propertyTax ? { propertyTax: reconcilePropertyTaxReview(existing?.propertyTax, draft.propertyTax) } : {}),
    ...(draft.leaseUpConcession ? { leaseUpConcession: reconcileBlockReview(existing?.leaseUpConcession, draft.leaseUpConcession) } : {}),
    ...(draft.seasonalAbsorption ? { seasonalAbsorption: reconcileBlockReview(existing?.seasonalAbsorption, draft.seasonalAbsorption) } : {}),
    ...(draft.occupancyCap ? { occupancyCap: reconcileBlockReview(existing?.occupancyCap, draft.occupancyCap) } : {}),
    ...(draft.stabilizationRule ? { stabilizationRule: reconcileBlockReview(existing?.stabilizationRule, draft.stabilizationRule) } : {}),
    ...(draft.leaseTurnover ? { leaseTurnover: reconcileBlockReview(existing?.leaseTurnover, draft.leaseTurnover) } : {}),
    ...(draft.categoryGrowth ? { categoryGrowth: reconcileBlockReview(existing?.categoryGrowth, draft.categoryGrowth) } : {}),
    ...(draft.commercial ? { commercial: reconcileCommercialReview(existing?.commercial, draft.commercial) } : {}),
  };
}

/**
 * Each space keeps its own review state, and the block's own terms (commercial vacancy and credit
 * loss) keep another, so editing one space never sends the others or the block back to Working on It.
 */
function reconcileCommercialReview(existing: CommercialOperations | undefined, draft: CommercialOperations): CommercialOperations {
  const { spaces: existingSpaces, ...existingBlock } = existing ?? { spaces: [] as CommercialSpace[] };
  const { spaces: draftSpaces, ...draftBlock } = draft;
  const block = existing ? reconcileBlockReview(existingBlock as Omit<CommercialOperations, "spaces">, draftBlock) : draftBlock;
  return { ...block, spaces: reconcileLineReview(existing ? existingSpaces : undefined, draftSpaces) };
}

/** An optional block whose values or source change goes back to Working on It. */
function reconcileBlockReview<T extends { reviewState: "working" | "done" }>(existing: T | undefined, draft: T): T {
  if (!existing || sameLineWithoutReview(existing, draft)) return draft;
  return { ...draft, reviewState: "working" };
}

function reconcileAssumptionEvidence(
  existing: SavedApartmentOperations | undefined,
  draft: ApartmentOperationsDraft,
) {
  return Object.fromEntries(APARTMENT_OPERATIONS_ASSUMPTION_KEYS.map((key) => [
    key,
    existing && (
      existing[key] !== draft[key]
      || existing.assumptionEvidence[key].sourceLabel !== draft.assumptionEvidence[key].sourceLabel
      || existing.assumptionEvidence[key].sourceDate !== draft.assumptionEvidence[key].sourceDate
    )
      ? { ...draft.assumptionEvidence[key], reviewState: "working" as const }
      : draft.assumptionEvidence[key],
  ])) as Record<ApartmentOperationsAssumptionKey, ApartmentOperationsInputs["assumptionEvidence"][ApartmentOperationsAssumptionKey]>;
}

function reconcileLineReview<T extends { id: string; reviewState: "working" | "done" }>(
  existing: T[] | undefined,
  draft: T[],
) {
  const priorById = new Map(existing?.map((line) => [line.id, line]) ?? []);
  return draft.map((line) => {
    const prior = priorById.get(line.id);
    if (!prior || sameLineWithoutReview(prior, line)) return line;
    return { ...line, reviewState: "working" as const };
  });
}

function sameLineWithoutReview<T extends { reviewState: "working" | "done" }>(left: T, right: T) {
  const withoutReview = (line: T) => Object.fromEntries(
    Object.entries(line).filter(([key]) => key !== "reviewState"),
  );
  return stableJson(withoutReview(left)) === stableJson(withoutReview(right));
}

/** JSON with sorted keys, so a stored object and a submitted one compare equal whatever their key order. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export async function updateUnderwritingCase(
  db: Db,
  id: string,
  draft: CaseDraft,
  expectedRevision: number,
) {
  const { rows } = await db.query<CaseWithAssumptionsRow>(
    `with updated_case as (
       update underwriting_cases
       set name = $2,
           address = $3,
           proposed_units = $4::integer,
           average_unit_square_feet = $5::numeric,
           gross_building_square_feet = $6::numeric,
           fact_metadata = reconcile_underwriting_fact_metadata(
             fact_metadata,
             proposed_units,
             average_unit_square_feet,
             gross_building_square_feet,
             $4::integer,
             $5::numeric,
             $6::numeric,
             $9::jsonb,
             case_revision + 1,
             now()
           ),
           case_revision = case_revision + 1,
           updated_at = now()
       where id = $1 and case_revision = $8
       returning *
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
             when underwriting_case_assumptions.value is distinct from excluded.value
               or underwriting_case_assumptions.source_label is distinct from excluded.source_label
               or underwriting_case_assumptions.source_date is distinct from excluded.source_date
             then 'working'
             else excluded.review_state
           end,
           value_changed_at = case
             when underwriting_case_assumptions.value is distinct from excluded.value
               or underwriting_case_assumptions.source_label is distinct from excluded.source_label
               or underwriting_case_assumptions.source_date is distinct from excluded.source_date
             then now()
             else underwriting_case_assumptions.value_changed_at
           end,
           updated_at = now()
       returning case_id, assumption_key, value, unit, source_kind, source_label,
                 source_date, review_state, value_changed_at
     )
     select updated_case.*,
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'case_id', inserted_assumptions.case_id,
                    'assumption_key', inserted_assumptions.assumption_key,
                    'value', inserted_assumptions.value,
                    'unit', inserted_assumptions.unit,
                    'source_kind', inserted_assumptions.source_kind,
                    'source_label', inserted_assumptions.source_label,
                    'source_date', inserted_assumptions.source_date,
                    'review_state', inserted_assumptions.review_state,
                    'value_changed_at', inserted_assumptions.value_changed_at
                  ) order by inserted_assumptions.assumption_key
                )
                from inserted_assumptions
              ),
              '[]'::jsonb
            ) as assumptions
     from updated_case`,
    [
      id,
      draft.name,
      draft.address,
      draft.proposedUnits ?? null,
      draft.averageUnitSquareFeet ?? null,
      draft.grossBuildingSquareFeet ?? null,
      JSON.stringify(assumptionRows(draft)),
      expectedRevision,
      JSON.stringify(draft.factMetadata ?? {}),
    ],
  );
  if (rows[0]) return mapCase(rows[0], rows[0].assumptions);
  const existing = await getUnderwritingCase(db, id);
  if (existing) throw new UnderwritingCaseRevisionConflict();
  return null;
}
