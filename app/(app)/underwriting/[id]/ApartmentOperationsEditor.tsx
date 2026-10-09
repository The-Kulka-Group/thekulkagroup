"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  AFFORDABILITY_TIERS,
  type AffordabilityTier,
  APARTMENT_OPERATIONS_ASSUMPTION_KEYS,
  APARTMENT_OPERATIONS_INPUT_VERSION,
  MAX_APARTMENT_OPERATION_LINES,
  MAX_OPERATION_LINE_NAME_LENGTH,
  MAX_OPERATION_SOURCE_LABEL_LENGTH,
  type ApartmentOperationsAssumptionEvidence,
  type ApartmentOperationsAssumptionKey,
  type CapitalExpenditureLine,
  type CategoryGrowth,
  type CommercialOperations,
  type LeaseTurnover,
  type LeaseUpConcession,
  type OccupancyCap,
  type MilestoneAnchor,
  type OperatingExpenseLine,
  type OtherIncomeLine,
  type PropertyTaxPlan,
  type ResidentialUnitType,
  type SeasonalAbsorption,
  type StabilizationRule,
} from "@kulka/engine";
import type { UnderwritingCase } from "@/lib/underwriting/cases";
import { commonSource, seedFromIntake, type CommonSource } from "@/lib/underwriting/intake-seed";

import { CommercialSection } from "./CommercialSection";
import { MilestoneAnchorField } from "./MilestoneAnchorField";
import { GrowthSection } from "./GrowthSection";
import { LeaseUpSection } from "./LeaseUpSection";
import { PropertyTaxSection } from "./PropertyTaxSection";
import { TIER_LABELS } from "./UnitMixByTier";

type MoneyLine = OtherIncomeLine | OperatingExpenseLine | CapitalExpenditureLine;

export function ApartmentOperationsEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const saved = savedCase.apartmentOperations;
  // An unsaved section starts from the unit type and vacancy intake supplies.
  const seed = saved ? undefined : seedFromIntake(savedCase);
  const source = commonSource(savedCase);
  const milestones = savedCase.costSchedule?.milestones ?? [];
  const [operationStartMonth, setOperationStartMonth] = useState(saved?.operationStartMonth ?? "");
  const [operationStartAnchor, setOperationStartAnchor] = useState<MilestoneAnchor | undefined>(saved?.operationStartAnchor);
  const [growthStartMonth, setGrowthStartMonth] = useState(saved?.growthStartMonth ?? "");
  const [growthStartAnchor, setGrowthStartAnchor] = useState<MilestoneAnchor | undefined>(saved?.growthStartAnchor);
  const [preleasedUnits, setPreleasedUnits] = useState(saved?.preleasedUnits ?? 0);
  const [leaseUpUnitsPerMonth, setLeaseUpUnitsPerMonth] = useState(saved?.leaseUpUnitsPerMonth ?? 0);
  const [annualIncomeGrowthPercent, setAnnualIncomeGrowthPercent] = useState(saved?.annualIncomeGrowthPercent ?? 0);
  const [annualExpenseGrowthPercent, setAnnualExpenseGrowthPercent] = useState(saved?.annualExpenseGrowthPercent ?? 0);
  const [rentAdjustmentLossPercent, setRentAdjustmentLossPercent] = useState(saved?.rentAdjustmentLossPercent ?? 0);
  const [freeRentPercent, setFreeRentPercent] = useState(saved?.freeRentPercent ?? 0);
  const [vacancyPercent, setVacancyPercent] = useState(saved?.vacancyPercent ?? seed?.vacancyPercent?.value ?? 0);
  const [creditLossPercent, setCreditLossPercent] = useState(saved?.creditLossPercent ?? 0);
  const [assumptionEvidence, setAssumptionEvidence] = useState(saved?.assumptionEvidence ?? {
    ...blankAssumptionEvidence(),
    ...(seed?.vacancyPercent ? { vacancyPercent: seed.vacancyPercent.evidence } : {}),
  });
  const [residentialUnitTypes, setResidentialUnitTypes] = useState<ResidentialUnitType[]>(saved?.residentialUnitTypes ?? seed?.residentialUnitTypes ?? []);
  const [otherIncomeLines, setOtherIncomeLines] = useState<OtherIncomeLine[]>(saved?.otherIncomeLines ?? []);
  const [operatingExpenseLines, setOperatingExpenseLines] = useState<OperatingExpenseLine[]>(saved?.operatingExpenseLines ?? []);
  const [capitalExpenditureLines, setCapitalExpenditureLines] = useState<CapitalExpenditureLine[]>(saved?.capitalExpenditureLines ?? []);
  const [propertyTax, setPropertyTax] = useState<PropertyTaxPlan | undefined>(saved?.propertyTax);
  const [leaseUpConcession, setLeaseUpConcession] = useState<LeaseUpConcession | undefined>(saved?.leaseUpConcession);
  const [seasonalAbsorption, setSeasonalAbsorption] = useState<SeasonalAbsorption | undefined>(saved?.seasonalAbsorption);
  const [occupancyCap, setOccupancyCap] = useState<OccupancyCap | undefined>(saved?.occupancyCap);
  const [stabilizationRule, setStabilizationRule] = useState<StabilizationRule | undefined>(saved?.stabilizationRule);
  const [leaseTurnover, setLeaseTurnover] = useState<LeaseTurnover | undefined>(saved?.leaseTurnover);
  const [categoryGrowth, setCategoryGrowth] = useState<CategoryGrowth | undefined>(saved?.categoryGrowth);
  const [commercial, setCommercial] = useState<CommercialOperations | undefined>(saved?.commercial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clientReady = useSyncExternalStore(hydrationSubscription, () => true, () => false);
  const operationLineCount = residentialUnitTypes.length + otherIncomeLines.length
    + operatingExpenseLines.length + capitalExpenditureLines.length;
  const canAddLine = operationLineCount < MAX_APARTMENT_OPERATION_LINES;

  if (!savedCase.costSchedule) {
    return (
      <section aria-labelledby="apartment-operations-heading">
        <h3 id="apartment-operations-heading">Apartment Operations</h3>
        <div className="empty empty--inline"><p>Save the development cost schedule before adding lease-up and operations.</p></div>
      </section>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/underwriting/cases/${savedCase.id}/operations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: savedCase.caseRevision,
          inputVersion: APARTMENT_OPERATIONS_INPUT_VERSION,
          operationStartMonth,
          operationStartAnchor: operationStartAnchor ?? null,
          growthStartMonth,
          growthStartAnchor: growthStartAnchor ?? null,
          preleasedUnits,
          leaseUpUnitsPerMonth,
          annualIncomeGrowthPercent,
          annualExpenseGrowthPercent,
          rentAdjustmentLossPercent,
          freeRentPercent,
          vacancyPercent,
          creditLossPercent,
          assumptionEvidence,
          residentialUnitTypes,
          otherIncomeLines,
          operatingExpenseLines,
          capitalExpenditureLines,
          ...(propertyTax ? { propertyTax } : {}),
          ...(leaseUpConcession ? { leaseUpConcession } : {}),
          ...(seasonalAbsorption ? { seasonalAbsorption } : {}),
          ...(occupancyCap ? { occupancyCap } : {}),
          ...(stabilizationRule ? { stabilizationRule } : {}),
          ...(leaseTurnover ? { leaseTurnover } : {}),
          ...(categoryGrowth ? { categoryGrowth } : {}),
          ...(commercial ? { commercial } : {}),
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The project changed in another session. Refresh the page, review the operating inputs, and try again."
          : body?.error ?? "The apartment operations inputs could not be saved.");
        setFieldErrors(body?.fieldErrors ?? {});
        return;
      }
      router.refresh();
    } catch {
      setError("The apartment operations request failed. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="underwriting-operations-editor" data-client-ready={clientReady ? "true" : "false"} onSubmit={save} noValidate>
      <div className="underwriting-section-head">
        <div>
          <h3 id="apartment-operations-heading">Apartment Operations</h3>
          <p className="t-meta">Lease-up, rent, other income, vacancy, credit loss, expenses, and capital costs stay separate in each saved month.</p>
        </div>
      </div>

      <AssumptionEvidenceTable
        evidence={assumptionEvidence}
        setEvidence={setAssumptionEvidence}
        fieldErrors={fieldErrors}
      />

      <div className="underwriting-form-grid underwriting-operations-controls">
        <div className="field-label t-label">
          Operation Start Month
          <MilestoneAnchorField
            id="apartment-operations-operationStartMonth"
            label="Operation Start"
            typedLabel="Operation Start Month"
            month={operationStartMonth}
            onMonthChange={setOperationStartMonth}
            anchor={operationStartAnchor}
            onAnchorChange={(anchor) => setOperationStartAnchor(anchor && "milestoneId" in anchor ? anchor : undefined)}
            milestones={milestones}
            errors={[fieldErrors.operationStartMonth, fieldErrors.operationStartAnchor, fieldErrors["operationStartAnchor.milestoneId"], fieldErrors["operationStartAnchor.offsetMonths"]]}
          />
        </div>
        <div className="field-label t-label">
          Growth Start Month
          <MilestoneAnchorField
            id="apartment-operations-growthStartMonth"
            label="Growth Start"
            typedLabel="Growth Start Month"
            month={growthStartMonth}
            onMonthChange={setGrowthStartMonth}
            anchor={growthStartAnchor}
            onAnchorChange={(anchor) => setGrowthStartAnchor(anchor && "milestoneId" in anchor ? anchor : undefined)}
            milestones={milestones}
            errors={[fieldErrors.growthStartMonth, fieldErrors.growthStartAnchor, fieldErrors["growthStartAnchor.milestoneId"], fieldErrors["growthStartAnchor.offsetMonths"]]}
          />
        </div>
        <NumberField path="preleasedUnits" label="Pre-leased units" value={preleasedUnits} onChange={(value) => setPreleasedUnits(Number(value))} error={fieldErrors.preleasedUnits} min="0" step="1" />
        <NumberField path="leaseUpUnitsPerMonth" label="Lease-up units per month" value={leaseUpUnitsPerMonth} onChange={(value) => setLeaseUpUnitsPerMonth(Number(value))} error={fieldErrors.leaseUpUnitsPerMonth} min="1" step="1" />
        <NumberField path="annualIncomeGrowthPercent" label="Annual Income Growth" value={annualIncomeGrowthPercent} onChange={(value) => setAnnualIncomeGrowthPercent(Number(value))} error={fieldErrors.annualIncomeGrowthPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField path="annualExpenseGrowthPercent" label="Annual Expense Growth" value={annualExpenseGrowthPercent} onChange={(value) => setAnnualExpenseGrowthPercent(Number(value))} error={fieldErrors.annualExpenseGrowthPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField path="rentAdjustmentLossPercent" label="Rent Adjustment Loss" value={rentAdjustmentLossPercent} onChange={(value) => setRentAdjustmentLossPercent(Number(value))} error={fieldErrors.rentAdjustmentLossPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField path="freeRentPercent" label="Free Rent" value={freeRentPercent} onChange={(value) => setFreeRentPercent(Number(value))} error={fieldErrors.freeRentPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField path="vacancyPercent" label="Vacancy" value={vacancyPercent} onChange={(value) => setVacancyPercent(Number(value))} error={fieldErrors.vacancyPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField path="creditLossPercent" label="Credit Loss" value={creditLossPercent} onChange={(value) => setCreditLossPercent(Number(value))} error={fieldErrors.creditLossPercent} min="0" max="100" step="0.01" suffix="%" />
      </div>

      <GrowthSection
        growth={categoryGrowth}
        setGrowth={setCategoryGrowth}
        incomePercent={annualIncomeGrowthPercent}
        expensePercent={annualExpenseGrowthPercent}
        fieldErrors={fieldErrors}
      />

      <LeaseUpSection
        concession={leaseUpConcession}
        setConcession={setLeaseUpConcession}
        seasonal={seasonalAbsorption}
        setSeasonal={setSeasonalAbsorption}
        occupancyCap={occupancyCap}
        setOccupancyCap={setOccupancyCap}
        vacancyPercent={vacancyPercent}
        rule={stabilizationRule}
        setRule={setStabilizationRule}
        turnover={leaseTurnover}
        setTurnover={setLeaseTurnover}
        fieldErrors={fieldErrors}
      />

      <LineSection
        title="Residential Unit Types"
        description="Gross rent and non-revenue units remain visible before lease-up and rent losses."
        addLabel="Add Unit Type"
        canAdd={canAddLine}
        onAdd={() => setResidentialUnitTypes((lines) => [...lines, blankUnitType(source)])}
      >
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table underwriting-unit-types">
            <thead><tr><th>Unit Type</th><th className="right">Units</th><th className="right">Average Area</th><th className="right">Non-Revenue Units</th><th className="right">Monthly Market Rent</th><th>Affordability Tier</th><th className="right">AMI</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Action</th></tr></thead>
            <tbody>{residentialUnitTypes.map((line, index) => (
              <tr key={line.id}>
                <td><TextInput path={`residentialUnitTypes.${index}.name`} label={`Unit type ${index + 1} name`} value={line.name} onChange={(name) => updateAt(setResidentialUnitTypes, index, { name })} error={fieldErrors[`residentialUnitTypes.${index}.name`]} /></td>
                <td><NumberInput path={`residentialUnitTypes.${index}.units`} label={`${line.name || `Unit type ${index + 1}`} units`} value={line.units} onChange={(units) => updateAt(setResidentialUnitTypes, index, { units })} error={fieldErrors[`residentialUnitTypes.${index}.units`]} min="1" step="1" /></td>
                <td><NumberInput path={`residentialUnitTypes.${index}.averageAreaSf`} label={`${line.name || `Unit type ${index + 1}`} average area`} value={line.averageAreaSf} onChange={(averageAreaSf) => updateAt(setResidentialUnitTypes, index, { averageAreaSf })} error={fieldErrors[`residentialUnitTypes.${index}.averageAreaSf`]} min="1" step="0.01" suffix="SF" /></td>
                <td><NumberInput path={`residentialUnitTypes.${index}.nonRevenueUnits`} label={`${line.name || `Unit type ${index + 1}`} non-revenue units`} value={line.nonRevenueUnits} onChange={(nonRevenueUnits) => updateAt(setResidentialUnitTypes, index, { nonRevenueUnits })} error={fieldErrors[`residentialUnitTypes.${index}.nonRevenueUnits`]} min="0" step="1" /></td>
                <td><NumberInput path={`residentialUnitTypes.${index}.monthlyMarketRent`} label={`${line.name || `Unit type ${index + 1}`} monthly market rent`} value={line.monthlyMarketRent} onChange={(monthlyMarketRent) => updateAt(setResidentialUnitTypes, index, { monthlyMarketRent })} error={fieldErrors[`residentialUnitTypes.${index}.monthlyMarketRent`]} min="0.01" step="0.01" suffix="USD" /></td>
                <td><select className="input" aria-label={`${line.name || `Unit type ${index + 1}`} affordability tier`} value={line.affordabilityTier ?? "market"} onChange={(event) => updateAt(setResidentialUnitTypes, index, event.target.value === "market" ? { affordabilityTier: undefined, amiPercent: undefined } : { affordabilityTier: event.target.value as AffordabilityTier })}>{AFFORDABILITY_TIERS.map((tier) => <option key={tier} value={tier}>{TIER_LABELS[tier]}</option>)}</select></td>
                <td>{(line.affordabilityTier ?? "market") === "market" ? null : <><input className="input num right" type="number" min="1" max="200" step="1" aria-label={`${line.name || `Unit type ${index + 1}`} AMI percent`} value={line.amiPercent ?? ""} onChange={(event) => updateAt(setResidentialUnitTypes, index, { amiPercent: event.target.value === "" ? undefined : Number(event.target.value) })} aria-invalid={Boolean(fieldErrors[`residentialUnitTypes.${index}.amiPercent`])} /><FieldError id={`residentialUnitTypes-${index}-amiPercent-error`} error={fieldErrors[`residentialUnitTypes.${index}.amiPercent`]} /></>}</td>
                <EvidenceCells path={`residentialUnitTypes.${index}`} line={line} fieldErrors={fieldErrors} onChange={(update) => updateAt(setResidentialUnitTypes, index, update)} />
                <td><RemoveButton onClick={() => removeAt(setResidentialUnitTypes, index)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </LineSection>

      <MoneyLineSection source={source} title="Other Income" description="Each line states whether it is annual or tied to occupied units." addLabel="Add Other Income" canAdd={canAddLine} lines={otherIncomeLines} setLines={setOtherIncomeLines} path="otherIncomeLines" units={[
        ["usd_per_year", "USD per Year"], ["usd_per_occupied_unit_month", "USD per Occupied Unit per Month"],
      ]} fieldErrors={fieldErrors} />
      <MoneyLineSection source={source} title="Operating Expenses" description="Fixed, per-unit, and percent-of-revenue expenses remain separate. Variable share scales a line with leased units during lease-up; lead months start it before operation start at its fixed share. A line that applies to the commercial spaces starts its lead months before the first commercial lease, takes no per-unit amount and no variable share, and as a percent of revenue reads commercial effective gross revenue." addLabel="Add Operating Expense" canAdd={canAddLine} lines={operatingExpenseLines} setLines={setOperatingExpenseLines} path="operatingExpenseLines" ramp="variable_and_lead" appliesTo units={[
        ["usd_per_year", "USD per Year"], ["usd_per_unit_year", "USD per Unit per Year"], ["percent_effective_gross_revenue", "Percent of Effective Gross Revenue"],
      ]} fieldErrors={fieldErrors} />
      <PropertyTaxSection plan={propertyTax} setPlan={setPropertyTax} fieldErrors={fieldErrors} />
      <CommercialSection
        commercial={commercial}
        setCommercial={setCommercial}
        expenseLines={operatingExpenseLines}
        hasPropertyTax={Boolean(propertyTax)}
        milestones={milestones}
        defaultMonth={operationStartMonth}
        fieldErrors={fieldErrors}
      />
      <MoneyLineSection source={source} title="Capital Expenditures" description="Capital costs stay below net operating income in operating cash flow. Variable share scales a line with leased units during lease-up." addLabel="Add Capital Expenditure" canAdd={canAddLine} lines={capitalExpenditureLines} setLines={setCapitalExpenditureLines} path="capitalExpenditureLines" ramp="variable" units={[
        ["usd_per_year", "USD per Year"], ["usd_per_unit_year", "USD per Unit per Year"],
      ]} fieldErrors={fieldErrors} />

      {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}
      <div className="underwriting-form-actions">
        <button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Operations" : "Save Operations"}</button>
      </div>
    </form>
  );
}

const ASSUMPTION_LABELS: Record<ApartmentOperationsAssumptionKey, string> = {
  operationStartMonth: "Operation Start Month",
  growthStartMonth: "Growth Start Month",
  preleasedUnits: "Pre-Leased Units",
  leaseUpUnitsPerMonth: "Lease-Up Units per Month",
  annualIncomeGrowthPercent: "Annual Income Growth",
  annualExpenseGrowthPercent: "Annual Expense Growth",
  rentAdjustmentLossPercent: "Rent Adjustment Loss",
  freeRentPercent: "Free Rent",
  vacancyPercent: "Vacancy",
  creditLossPercent: "Credit Loss",
};

function AssumptionEvidenceTable({ evidence, setEvidence, fieldErrors }: {
  evidence: Record<ApartmentOperationsAssumptionKey, ApartmentOperationsAssumptionEvidence>;
  setEvidence: React.Dispatch<React.SetStateAction<Record<ApartmentOperationsAssumptionKey, ApartmentOperationsAssumptionEvidence>>>;
  fieldErrors: Record<string, string>;
}) {
  const update = (key: ApartmentOperationsAssumptionKey, value: Partial<ApartmentOperationsAssumptionEvidence>) => {
    setEvidence((current) => ({ ...current, [key]: { ...current[key], ...value } }));
  };
  return (
    <section className="underwriting-line-section">
      <h4>Operating Assumption Sources</h4>
      <p className="t-meta">Each timing and rate input keeps its source and review state with the saved case.</p>
      <div className="underwriting-edit-table-wrap">
        <table className="underwriting-operations-table underwriting-assumption-evidence">
          <thead><tr><th>Assumption</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead>
          <tbody>{APARTMENT_OPERATIONS_ASSUMPTION_KEYS.map((key) => {
            const path = `assumptionEvidence.${key}`;
            const sourceLabel = controlProps(`${path}.sourceLabel`, fieldErrors[`${path}.sourceLabel`]);
            const sourceDate = controlProps(`${path}.sourceDate`, fieldErrors[`${path}.sourceDate`]);
            const reviewState = controlProps(`${path}.reviewState`, fieldErrors[`${path}.reviewState`]);
            return <tr key={key}>
              <th scope="row">{ASSUMPTION_LABELS[key]}</th>
              <td>
                <input {...sourceLabel.input} className="input" maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH} aria-label={`${ASSUMPTION_LABELS[key]} source label`} value={evidence[key].sourceLabel ?? ""} onChange={(event) => update(key, { sourceLabel: event.target.value || undefined })} />
                <FieldError id={sourceLabel.errorId} error={fieldErrors[`${path}.sourceLabel`]} />
              </td>
              <td>
                <input {...sourceDate.input} className="input" type="date" aria-label={`${ASSUMPTION_LABELS[key]} source date`} value={evidence[key].sourceDate ?? ""} onChange={(event) => update(key, { sourceDate: event.target.value || undefined })} />
                <FieldError id={sourceDate.errorId} error={fieldErrors[`${path}.sourceDate`]} />
              </td>
              <td>
                <select {...reviewState.input} className="input" aria-label={`${ASSUMPTION_LABELS[key]} review state`} value={evidence[key].reviewState} onChange={(event) => update(key, { reviewState: event.target.value as "working" | "done" })}><option value="working">Working on It</option><option value="done">Done</option></select>
                <FieldError id={reviewState.errorId} error={fieldErrors[`${path}.reviewState`]} />
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function LineSection({ title, description, addLabel, canAdd, onAdd, children }: { title: string; description: string; addLabel: string; canAdd: boolean; onAdd: () => void; children: React.ReactNode }) {
  return <section className="underwriting-line-section"><div className="underwriting-section-head"><div><h4>{title}</h4><p className="t-meta">{description}</p></div><button className="btn btn--secondary" type="button" onClick={onAdd} disabled={!canAdd}>{addLabel}</button></div>{children}</section>;
}

function MoneyLineSection<T extends MoneyLine>({ title, description, addLabel, canAdd, lines, setLines, path, units, fieldErrors, ramp, appliesTo = false, source }: {
  /** The common intake source each new line starts with. */
  source: CommonSource;
  /** Lease-up ramp columns: variable share, and for operating expenses lead months too. */
  ramp?: "variable" | "variable_and_lead";
  /** Adds the Applies To choice, Residential or Commercial (LA-1871). Operating expenses only. */
  appliesTo?: boolean;
  title: string;
  description: string;
  addLabel: string;
  canAdd: boolean;
  lines: T[];
  setLines: React.Dispatch<React.SetStateAction<T[]>>;
  path: string;
  units: ReadonlyArray<readonly [T["unit"], string]>;
  fieldErrors: Record<string, string>;
}) {
  return (
    <LineSection title={title} description={description} addLabel={addLabel} canAdd={canAdd} onAdd={() => setLines((current) => [...current, blankMoneyLine(units[0][0], source) as T])}>
      <div className="underwriting-edit-table-wrap">
        <table className={`underwriting-operations-table underwriting-money-lines${ramp ? " underwriting-money-lines--ramp" : ""}`}>
          <thead><tr><th>Line</th><th className="right">Amount</th><th>Unit</th>{appliesTo ? <th>Applies To</th> : null}{ramp ? <th className="right">Variable Share</th> : null}{ramp === "variable_and_lead" ? <th className="right">Lead Months</th> : null}<th>Source Label</th><th>Source Date</th><th>Review State</th><th>Action</th></tr></thead>
          <tbody>{lines.map((line, index) => {
            const linePath = `${path}.${index}`;
            const unit = controlProps(`${linePath}.unit`, fieldErrors[`${linePath}.unit`]);
            const commercialLine = (line as OperatingExpenseLine).appliesTo === "commercial";
            const unitChoices = commercialLine ? units.filter(([value]) => value !== "usd_per_unit_year") : units;
            const appliesToControl = controlProps(`${linePath}.appliesTo`, fieldErrors[`${linePath}.appliesTo`]);
            return <tr key={line.id}>
              <td><TextInput path={`${linePath}.name`} label={`${title} line ${index + 1} name`} value={line.name} onChange={(name) => updateAt(setLines, index, { name } as Partial<T>)} error={fieldErrors[`${linePath}.name`]} /></td>
              <td><NumberInput path={`${linePath}.amount`} label={`${line.name || `${title} line ${index + 1}`} amount`} value={line.amount} onChange={(amount) => updateAt(setLines, index, { amount } as Partial<T>)} error={fieldErrors[`${linePath}.amount`]} min="0" step="0.01" /></td>
              <td><select {...unit.input} className="input" aria-label={`${line.name || `${title} line ${index + 1}`} unit`} value={line.unit} onChange={(event) => updateAt(setLines, index, (event.target.value === "percent_effective_gross_revenue" ? { unit: event.target.value, variablePercent: undefined, leadMonths: undefined } : { unit: event.target.value }) as Partial<T>)}>{unitChoices.map(([value, label]) => <option key={String(value)} value={String(value)}>{label}</option>)}</select><FieldError id={unit.errorId} error={fieldErrors[`${linePath}.unit`]} /></td>
              {appliesTo ? <td><select {...appliesToControl.input} className="input" aria-label={`${line.name || `${title} line ${index + 1}`} applies to`} value={commercialLine ? "commercial" : "residential"} onChange={(event) => updateAt(setLines, index, (event.target.value === "commercial"
                ? { appliesTo: "commercial", variablePercent: undefined, ...((line as OperatingExpenseLine).unit === "usd_per_unit_year" ? { unit: "usd_per_year" } : {}) }
                : { appliesTo: undefined }) as unknown as Partial<T>)}><option value="residential">Residential</option><option value="commercial">Commercial</option></select><FieldError id={appliesToControl.errorId} error={fieldErrors[`${linePath}.appliesTo`]} /></td> : null}
              {ramp ? <RampCells line={line as OperatingExpenseLine} linePath={linePath} label={line.name || `${title} line ${index + 1}`} withLead={ramp === "variable_and_lead"} fieldErrors={fieldErrors} onChange={(update) => updateAt(setLines, index, update as Partial<T>)} /> : null}
              <EvidenceCells path={linePath} line={line} fieldErrors={fieldErrors} onChange={(update) => updateAt(setLines, index, update as Partial<T>)} />
              <td><RemoveButton onClick={() => removeAt(setLines, index)} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </LineSection>
  );
}

function RampCells({ line, linePath, label, withLead, fieldErrors, onChange }: {
  line: OperatingExpenseLine;
  linePath: string;
  label: string;
  withLead: boolean;
  fieldErrors: Record<string, string>;
  onChange: (update: Partial<OperatingExpenseLine>) => void;
}) {
  if (line.unit === "percent_effective_gross_revenue") {
    return <><td><span className="t-meta">Moves with Revenue</span></td>{withLead ? <td /> : null}</>;
  }
  return <>
    <td>{line.appliesTo === "commercial" ? null : <NumberInput path={`${linePath}.variablePercent`} label={`${label} variable share`} value={line.variablePercent ?? 0} onChange={(value) => onChange({ variablePercent: value === 0 ? undefined : value })} error={fieldErrors[`${linePath}.variablePercent`]} min="0" max="100" step="1" suffix="%" />}</td>
    {withLead ? <td><NumberInput path={`${linePath}.leadMonths`} label={`${label} lead months`} value={line.leadMonths ?? 0} onChange={(value) => onChange({ leadMonths: value === 0 ? undefined : value })} error={fieldErrors[`${linePath}.leadMonths`]} min="0" step="1" /></td> : null}
  </>;
}

function EvidenceCells({ path, line, fieldErrors, onChange }: { path: string; line: ResidentialUnitType | MoneyLine; fieldErrors: Record<string, string>; onChange: (update: Partial<ResidentialUnitType | MoneyLine>) => void }) {
  const sourceLabel = controlProps(`${path}.sourceLabel`, fieldErrors[`${path}.sourceLabel`]);
  const sourceDate = controlProps(`${path}.sourceDate`, fieldErrors[`${path}.sourceDate`]);
  const reviewState = controlProps(`${path}.reviewState`, fieldErrors[`${path}.reviewState`]);
  return <>
    <td><input {...sourceLabel.input} className="input" maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH} aria-label={`${line.name || "Line"} source label`} value={line.sourceLabel ?? ""} onChange={(event) => onChange({ sourceLabel: event.target.value || undefined })} /><FieldError id={sourceLabel.errorId} error={fieldErrors[`${path}.sourceLabel`]} /></td>
    <td><input {...sourceDate.input} className="input" type="date" aria-label={`${line.name || "Line"} source date`} value={line.sourceDate ?? ""} onChange={(event) => onChange({ sourceDate: event.target.value || undefined })} /><FieldError id={sourceDate.errorId} error={fieldErrors[`${path}.sourceDate`]} /></td>
    <td><select {...reviewState.input} className="input" aria-label={`${line.name || "Line"} review state`} value={line.reviewState} onChange={(event) => onChange({ reviewState: event.target.value as "working" | "done" })}><option value="working">Working on It</option><option value="done">Done</option></select><FieldError id={reviewState.errorId} error={fieldErrors[`${path}.reviewState`]} /></td>
  </>;
}

function NumberField({ path, label, value, onChange, error, type = "number", suffix, ...input }: { path: string; label: string; value: string | number; onChange: (value: string) => void; error?: string; type?: "number" | "month"; suffix?: string; min?: string; max?: string; step?: string }) {
  const control = controlProps(path, error);
  return <label className="field-label t-label" htmlFor={control.input.id}>{label}<span className={suffix ? "underwriting-money-input" : undefined}><input {...control.input} className="input num" type={type} value={value} onChange={(event) => onChange(event.target.value)} {...input} />{suffix ? <span>{suffix}</span> : null}</span><FieldError id={control.errorId} error={error} /></label>;
}

function TextInput({ path, label, value, onChange, error }: { path: string; label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const control = controlProps(path, error);
  return <><input {...control.input} className="input" maxLength={MAX_OPERATION_LINE_NAME_LENGTH} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} /><FieldError id={control.errorId} error={error} /></>;
}

function NumberInput({ path, label, value, onChange, error, suffix, ...input }: { path: string; label: string; value: number; onChange: (value: number) => void; error?: string; suffix?: string; min?: string; max?: string; step?: string }) {
  const control = controlProps(path, error);
  return <><span className={suffix ? "underwriting-money-input" : undefined}><input {...control.input} className="input num right" type="number" aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))} {...input} />{suffix ? <span>{suffix}</span> : null}</span><FieldError id={control.errorId} error={error} /></>;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return <button className="btn btn--secondary" type="button" onClick={onClick}>Remove</button>;
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

function controlProps(path: string, error?: string) {
  const id = `apartment-operations-${path.replaceAll(".", "-")}`;
  const errorId = `${id}-error`;
  return {
    errorId,
    input: {
      id,
      "aria-invalid": Boolean(error),
      "aria-describedby": error ? errorId : undefined,
    },
  };
}

function blankUnitType(source: CommonSource): ResidentialUnitType {
  return { id: crypto.randomUUID(), name: "", units: 0, nonRevenueUnits: 0, averageAreaSf: 0, monthlyMarketRent: 0, ...source, reviewState: "working" };
}

function blankAssumptionEvidence() {
  return Object.fromEntries(APARTMENT_OPERATIONS_ASSUMPTION_KEYS.map((key) => [
    key,
    { reviewState: "working" as const },
  ])) as Record<ApartmentOperationsAssumptionKey, ApartmentOperationsAssumptionEvidence>;
}

function blankMoneyLine(unit: string, source: CommonSource): MoneyLine {
  return { id: crypto.randomUUID(), name: "", amount: 0, unit, ...source, reviewState: "working" } as MoneyLine;
}

function updateAt<T>(setLines: React.Dispatch<React.SetStateAction<T[]>>, index: number, update: Partial<T>) {
  setLines((current) => current.map((line, position) => position === index ? { ...line, ...update } : line));
}

function removeAt<T>(setLines: React.Dispatch<React.SetStateAction<T[]>>, index: number) {
  setLines((current) => current.filter((_, position) => position !== index));
}

async function responseBody(response: Response): Promise<{ error?: string; fieldErrors?: Record<string, string> } | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function hydrationSubscription() {
  return () => undefined;
}
