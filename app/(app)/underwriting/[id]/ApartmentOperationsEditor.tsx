"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  APARTMENT_OPERATIONS_ASSUMPTION_KEYS,
  APARTMENT_OPERATIONS_INPUT_VERSION,
  MAX_APARTMENT_OPERATION_LINES,
  MAX_OPERATION_LINE_NAME_LENGTH,
  MAX_OPERATION_SOURCE_LABEL_LENGTH,
  type ApartmentOperationsAssumptionEvidence,
  type ApartmentOperationsAssumptionKey,
  type CapitalExpenditureLine,
  type OperatingExpenseLine,
  type OtherIncomeLine,
  type ResidentialUnitType,
} from "@kulka/engine";
import type { UnderwritingCase } from "@/lib/underwriting/cases";

type MoneyLine = OtherIncomeLine | OperatingExpenseLine | CapitalExpenditureLine;

export function ApartmentOperationsEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const saved = savedCase.apartmentOperations;
  const [operationStartMonth, setOperationStartMonth] = useState(saved?.operationStartMonth ?? "");
  const [growthStartMonth, setGrowthStartMonth] = useState(saved?.growthStartMonth ?? "");
  const [preleasedUnits, setPreleasedUnits] = useState(saved?.preleasedUnits ?? 0);
  const [leaseUpUnitsPerMonth, setLeaseUpUnitsPerMonth] = useState(saved?.leaseUpUnitsPerMonth ?? 0);
  const [annualIncomeGrowthPercent, setAnnualIncomeGrowthPercent] = useState(saved?.annualIncomeGrowthPercent ?? 0);
  const [annualExpenseGrowthPercent, setAnnualExpenseGrowthPercent] = useState(saved?.annualExpenseGrowthPercent ?? 0);
  const [rentAdjustmentLossPercent, setRentAdjustmentLossPercent] = useState(saved?.rentAdjustmentLossPercent ?? 0);
  const [freeRentPercent, setFreeRentPercent] = useState(saved?.freeRentPercent ?? 0);
  const [vacancyPercent, setVacancyPercent] = useState(saved?.vacancyPercent ?? 0);
  const [creditLossPercent, setCreditLossPercent] = useState(saved?.creditLossPercent ?? 0);
  const [assumptionEvidence, setAssumptionEvidence] = useState(saved?.assumptionEvidence ?? blankAssumptionEvidence());
  const [residentialUnitTypes, setResidentialUnitTypes] = useState<ResidentialUnitType[]>(saved?.residentialUnitTypes ?? []);
  const [otherIncomeLines, setOtherIncomeLines] = useState<OtherIncomeLine[]>(saved?.otherIncomeLines ?? []);
  const [operatingExpenseLines, setOperatingExpenseLines] = useState<OperatingExpenseLine[]>(saved?.operatingExpenseLines ?? []);
  const [capitalExpenditureLines, setCapitalExpenditureLines] = useState<CapitalExpenditureLine[]>(saved?.capitalExpenditureLines ?? []);
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
          growthStartMonth,
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
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The case changed in another session. Refresh the page, review the operating inputs, and try again."
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
        <NumberField label="Operation start month" type="month" value={operationStartMonth} onChange={setOperationStartMonth} error={fieldErrors.operationStartMonth} />
        <NumberField label="Growth start month" type="month" value={growthStartMonth} onChange={setGrowthStartMonth} error={fieldErrors.growthStartMonth} />
        <NumberField label="Pre-leased units" value={preleasedUnits} onChange={(value) => setPreleasedUnits(Number(value))} error={fieldErrors.preleasedUnits} min="0" step="1" />
        <NumberField label="Lease-up units per month" value={leaseUpUnitsPerMonth} onChange={(value) => setLeaseUpUnitsPerMonth(Number(value))} error={fieldErrors.leaseUpUnitsPerMonth} min="1" step="1" />
        <NumberField label="Annual income growth" value={annualIncomeGrowthPercent} onChange={(value) => setAnnualIncomeGrowthPercent(Number(value))} error={fieldErrors.annualIncomeGrowthPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField label="Annual expense growth" value={annualExpenseGrowthPercent} onChange={(value) => setAnnualExpenseGrowthPercent(Number(value))} error={fieldErrors.annualExpenseGrowthPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField label="Rent adjustment loss" value={rentAdjustmentLossPercent} onChange={(value) => setRentAdjustmentLossPercent(Number(value))} error={fieldErrors.rentAdjustmentLossPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField label="Free rent" value={freeRentPercent} onChange={(value) => setFreeRentPercent(Number(value))} error={fieldErrors.freeRentPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField label="Vacancy" value={vacancyPercent} onChange={(value) => setVacancyPercent(Number(value))} error={fieldErrors.vacancyPercent} min="0" max="100" step="0.01" suffix="%" />
        <NumberField label="Credit loss" value={creditLossPercent} onChange={(value) => setCreditLossPercent(Number(value))} error={fieldErrors.creditLossPercent} min="0" max="100" step="0.01" suffix="%" />
      </div>

      <LineSection
        title="Residential Unit Types"
        description="Gross rent and non-revenue units remain visible before lease-up and rent losses."
        addLabel="Add Unit Type"
        canAdd={canAddLine}
        onAdd={() => setResidentialUnitTypes((lines) => [...lines, blankUnitType()])}
      >
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table underwriting-unit-types">
            <thead><tr><th>Unit Type</th><th className="right">Units</th><th className="right">Average Area</th><th className="right">Non-Revenue Units</th><th className="right">Monthly Market Rent</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Action</th></tr></thead>
            <tbody>{residentialUnitTypes.map((line, index) => (
              <tr key={line.id}>
                <td><TextInput label={`Unit type ${index + 1} name`} value={line.name} onChange={(name) => updateAt(setResidentialUnitTypes, index, { name })} error={fieldErrors[`residentialUnitTypes.${index}.name`]} /></td>
                <td><NumberInput label={`${line.name || `Unit type ${index + 1}`} units`} value={line.units} onChange={(units) => updateAt(setResidentialUnitTypes, index, { units })} error={fieldErrors[`residentialUnitTypes.${index}.units`]} min="1" step="1" /></td>
                <td><NumberInput label={`${line.name || `Unit type ${index + 1}`} average area`} value={line.averageAreaSf} onChange={(averageAreaSf) => updateAt(setResidentialUnitTypes, index, { averageAreaSf })} error={fieldErrors[`residentialUnitTypes.${index}.averageAreaSf`]} min="1" step="0.01" suffix="SF" /></td>
                <td><NumberInput label={`${line.name || `Unit type ${index + 1}`} non-revenue units`} value={line.nonRevenueUnits} onChange={(nonRevenueUnits) => updateAt(setResidentialUnitTypes, index, { nonRevenueUnits })} error={fieldErrors[`residentialUnitTypes.${index}.nonRevenueUnits`]} min="0" step="1" /></td>
                <td><NumberInput label={`${line.name || `Unit type ${index + 1}`} monthly market rent`} value={line.monthlyMarketRent} onChange={(monthlyMarketRent) => updateAt(setResidentialUnitTypes, index, { monthlyMarketRent })} error={fieldErrors[`residentialUnitTypes.${index}.monthlyMarketRent`]} min="0.01" step="0.01" suffix="USD" /></td>
                <EvidenceCells line={line} onChange={(update) => updateAt(setResidentialUnitTypes, index, update)} />
                <td><RemoveButton onClick={() => removeAt(setResidentialUnitTypes, index)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </LineSection>

      <MoneyLineSection title="Other Income" description="Each line states whether it is annual or tied to occupied units." addLabel="Add Other Income" canAdd={canAddLine} lines={otherIncomeLines} setLines={setOtherIncomeLines} path="otherIncomeLines" units={[
        ["usd_per_year", "USD Per Year"], ["usd_per_occupied_unit_month", "USD Per Occupied Unit Per Month"],
      ]} fieldErrors={fieldErrors} />
      <MoneyLineSection title="Operating Expenses" description="Fixed, per-unit, and percent-of-revenue expenses remain separate." addLabel="Add Operating Expense" canAdd={canAddLine} lines={operatingExpenseLines} setLines={setOperatingExpenseLines} path="operatingExpenseLines" units={[
        ["usd_per_year", "USD Per Year"], ["usd_per_unit_year", "USD Per Unit Per Year"], ["percent_effective_gross_revenue", "Percent Of Effective Gross Revenue"],
      ]} fieldErrors={fieldErrors} />
      <MoneyLineSection title="Capital Expenditures" description="Capital costs stay below net operating income in operating cash flow." addLabel="Add Capital Expenditure" canAdd={canAddLine} lines={capitalExpenditureLines} setLines={setCapitalExpenditureLines} path="capitalExpenditureLines" units={[
        ["usd_per_year", "USD Per Year"], ["usd_per_unit_year", "USD Per Unit Per Year"],
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
  leaseUpUnitsPerMonth: "Lease-Up Units Per Month",
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
  return <section className="underwriting-line-section"><h4>Operating Assumption Sources</h4><p className="t-meta">Each timing and rate input keeps its source and review state with the saved case.</p><div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-assumption-evidence"><thead><tr><th>Assumption</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>{APARTMENT_OPERATIONS_ASSUMPTION_KEYS.map((key) => <tr key={key}><th scope="row">{ASSUMPTION_LABELS[key]}</th><td><input className="input" maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH} aria-label={`${ASSUMPTION_LABELS[key]} source label`} value={evidence[key].sourceLabel ?? ""} onChange={(event) => update(key, { sourceLabel: event.target.value || undefined })} /></td><td><input className="input" type="date" aria-label={`${ASSUMPTION_LABELS[key]} source date`} value={evidence[key].sourceDate ?? ""} onChange={(event) => update(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`assumptionEvidence.${key}.sourceDate`])} /><FieldError error={fieldErrors[`assumptionEvidence.${key}.sourceDate`]} /></td><td><select className="input" aria-label={`${ASSUMPTION_LABELS[key]} review state`} value={evidence[key].reviewState} onChange={(event) => update(key, { reviewState: event.target.value as "working" | "done" })}><option value="working">Working on it</option><option value="done">Done</option></select></td></tr>)}</tbody></table></div></section>;
}

function LineSection({ title, description, addLabel, canAdd, onAdd, children }: { title: string; description: string; addLabel: string; canAdd: boolean; onAdd: () => void; children: React.ReactNode }) {
  return <section className="underwriting-line-section"><div className="underwriting-section-head"><div><h4>{title}</h4><p className="t-meta">{description}</p></div><button className="btn btn--secondary" type="button" onClick={onAdd} disabled={!canAdd}>{addLabel}</button></div>{children}</section>;
}

function MoneyLineSection<T extends MoneyLine>({ title, description, addLabel, canAdd, lines, setLines, path, units, fieldErrors }: {
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
    <LineSection title={title} description={description} addLabel={addLabel} canAdd={canAdd} onAdd={() => setLines((current) => [...current, blankMoneyLine(units[0][0]) as T])}>
      <div className="underwriting-edit-table-wrap">
        <table className="underwriting-operations-table underwriting-money-lines">
          <thead><tr><th>Line</th><th className="right">Amount</th><th>Unit</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Action</th></tr></thead>
          <tbody>{lines.map((line, index) => <tr key={line.id}>
            <td><TextInput label={`${title} line ${index + 1} name`} value={line.name} onChange={(name) => updateAt(setLines, index, { name } as Partial<T>)} error={fieldErrors[`${path}.${index}.name`]} /></td>
            <td><NumberInput label={`${line.name || `${title} line ${index + 1}`} amount`} value={line.amount} onChange={(amount) => updateAt(setLines, index, { amount } as Partial<T>)} error={fieldErrors[`${path}.${index}.amount`]} min="0" step="0.01" /></td>
            <td><select className="input" aria-label={`${line.name || `${title} line ${index + 1}`} unit`} value={line.unit} onChange={(event) => updateAt(setLines, index, { unit: event.target.value } as Partial<T>)}>{units.map(([value, label]) => <option key={String(value)} value={String(value)}>{label}</option>)}</select></td>
            <EvidenceCells line={line} onChange={(update) => updateAt(setLines, index, update as Partial<T>)} />
            <td><RemoveButton onClick={() => removeAt(setLines, index)} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </LineSection>
  );
}

function EvidenceCells({ line, onChange }: { line: ResidentialUnitType | MoneyLine; onChange: (update: Partial<ResidentialUnitType | MoneyLine>) => void }) {
  return <><td><input className="input" maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH} aria-label={`${line.name || "Line"} source label`} value={line.sourceLabel ?? ""} onChange={(event) => onChange({ sourceLabel: event.target.value || undefined })} /></td><td><input className="input" type="date" aria-label={`${line.name || "Line"} source date`} value={line.sourceDate ?? ""} onChange={(event) => onChange({ sourceDate: event.target.value || undefined })} /></td><td><select className="input" aria-label={`${line.name || "Line"} review state`} value={line.reviewState} onChange={(event) => onChange({ reviewState: event.target.value as "working" | "done" })}><option value="working">Working on it</option><option value="done">Done</option></select></td></>;
}

function NumberField({ label, value, onChange, error, type = "number", suffix, ...input }: { label: string; value: string | number; onChange: (value: string) => void; error?: string; type?: "number" | "month"; suffix?: string; min?: string; max?: string; step?: string }) {
  return <label className="field-label t-label">{label}<span className={suffix ? "underwriting-money-input" : undefined}><input className="input num" type={type} value={value || ""} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} {...input} />{suffix ? <span>{suffix}</span> : null}</span><FieldError error={error} /></label>;
}

function TextInput({ label, value, onChange, error }: { label: string; value: string; onChange: (value: string) => void; error?: string }) {
  return <><input className="input" maxLength={MAX_OPERATION_LINE_NAME_LENGTH} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} /><FieldError error={error} /></>;
}

function NumberInput({ label, value, onChange, error, suffix, ...input }: { label: string; value: number; onChange: (value: number) => void; error?: string; suffix?: string; min?: string; max?: string; step?: string }) {
  return <><span className={suffix ? "underwriting-money-input" : undefined}><input className="input num right" type="number" aria-label={label} value={value || ""} onChange={(event) => onChange(Number(event.target.value))} aria-invalid={Boolean(error)} {...input} />{suffix ? <span>{suffix}</span> : null}</span><FieldError error={error} /></>;
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return <button className="btn btn--secondary" type="button" onClick={onClick}>Remove</button>;
}

function FieldError({ error }: { error?: string }) {
  return error ? <span className="input-error" role="alert">{error}</span> : null;
}

function blankUnitType(): ResidentialUnitType {
  return { id: crypto.randomUUID(), name: "", units: 0, nonRevenueUnits: 0, averageAreaSf: 0, monthlyMarketRent: 0, reviewState: "working" };
}

function blankAssumptionEvidence() {
  return Object.fromEntries(APARTMENT_OPERATIONS_ASSUMPTION_KEYS.map((key) => [
    key,
    { reviewState: "working" as const },
  ])) as Record<ApartmentOperationsAssumptionKey, ApartmentOperationsAssumptionEvidence>;
}

function blankMoneyLine(unit: string): MoneyLine {
  return { id: crypto.randomUUID(), name: "", amount: 0, unit, reviewState: "working" } as MoneyLine;
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
