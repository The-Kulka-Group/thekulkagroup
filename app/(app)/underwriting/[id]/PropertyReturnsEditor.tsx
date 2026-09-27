"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  FORWARD_TWELVE_MONTH_NOI_VERSION,
  MONTH_END_CASH_FLOW_DATES_VERSION,
  MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH,
  PROPERTY_RETURNS_ASSUMPTION_KEYS,
  PROPERTY_RETURNS_INPUT_VERSION,
  XIRR_ACTUAL_365_VERSION,
  type PropertyReturnsAssumptionKey,
  type PropertyReturnsEvidence,
} from "@kulka/engine";

import type { UnderwritingCase } from "@/lib/underwriting/cases";

export function PropertyReturnsEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const saved = savedCase.propertyReturns;
  const [terminalCapRatePercent, setTerminalCapRatePercent] = useState<number | "">(saved?.terminalCapRatePercent ?? "");
  const [sellingCostPercent, setSellingCostPercent] = useState<number | "">(saved?.sellingCostPercent ?? "");
  const [saleAssumptionEvidence, setSaleAssumptionEvidence] = useState(saved?.saleAssumptionEvidence ?? blankEvidence());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!savedCase.costSchedule || !savedCase.apartmentOperations || !savedCase.developmentCapital) {
    return <section aria-labelledby="property-returns-heading"><h3 id="property-returns-heading">Property Sale and Returns</h3><div className="empty empty--inline"><p>Save the cost schedule, apartment operations, and capital plan before adding sale terms.</p></div></section>;
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/underwriting/cases/${savedCase.id}/returns`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: savedCase.caseRevision,
          saleInputVersion: PROPERTY_RETURNS_INPUT_VERSION,
          terminalCapRatePercent,
          sellingCostPercent,
          forwardNoiConvention: FORWARD_TWELVE_MONTH_NOI_VERSION,
          cashFlowDateConvention: MONTH_END_CASH_FLOW_DATES_VERSION,
          xirrConvention: XIRR_ACTUAL_365_VERSION,
          saleAssumptionEvidence,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The project changed in another session. Refresh the page, review the sale inputs, and try again."
          : body?.error ?? "The property sale inputs could not be saved.");
        setFieldErrors(body?.fieldErrors ?? {});
        return;
      }
      router.refresh();
    } catch {
      setError("The property sale request failed. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const updateEvidence = (key: PropertyReturnsAssumptionKey, update: Partial<PropertyReturnsEvidence>) => {
    setSaleAssumptionEvidence((current) => ({ ...current, [key]: { ...current[key], ...update } }));
  };

  return <form className="underwriting-returns-editor" onSubmit={save} noValidate>
    <div className="underwriting-section-head"><div><h3 id="property-returns-heading">Property Sale and Returns</h3><p className="t-meta">The model values the sale from forward twelve-month NOI, pays off construction debt, and calculates dated property returns.</p></div></div>
    <div className="underwriting-form-grid underwriting-capital-controls">
      <NumberField id="returns-terminal-cap-rate" label="Terminal Cap Rate" value={terminalCapRatePercent} onChange={setTerminalCapRatePercent} error={fieldErrors.terminalCapRatePercent} />
      <NumberField id="returns-selling-cost" label="Selling Costs" value={sellingCostPercent} onChange={setSellingCostPercent} error={fieldErrors.sellingCostPercent} />
      <ReadOnlyField label="Sale Month" value={savedCase.costSchedule.saleMonth} />
      <ReadOnlyField label="Forward NOI Period" value="Sale Month and Next 11 Months" />
      <ReadOnlyField label="Cash Flow Dates" value="Month End" />
      <ReadOnlyField label="XIRR Convention" value="Actual Days Over 365" />
    </div>
    <section className="underwriting-line-section">
      <h4>Sale Assumption Sources</h4>
      <p className="t-meta">Each sale term and formula choice keeps its source, date, and review state.</p>
      <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-assumption-evidence"><thead><tr><th>Assumption</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>
        {PROPERTY_RETURNS_ASSUMPTION_KEYS.map((key) => {
          const labelPath = `saleAssumptionEvidence.${key}.sourceLabel`;
          const datePath = `saleAssumptionEvidence.${key}.sourceDate`;
          const statePath = `saleAssumptionEvidence.${key}.reviewState`;
          const labelId = `returns-evidence-${key}-source-label`;
          const dateId = `returns-evidence-${key}-source-date`;
          const stateId = `returns-evidence-${key}-review-state`;
          return <tr key={key}><th scope="row">{LABELS[key]}</th><td><input className="input" id={labelId} aria-label={`${LABELS[key]} source label`} maxLength={MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH} value={saleAssumptionEvidence[key].sourceLabel ?? ""} onChange={(event) => updateEvidence(key, { sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[labelPath])} aria-describedby={fieldErrors[labelPath] ? `${labelId}-error` : undefined} /><FieldError id={`${labelId}-error`} error={fieldErrors[labelPath]} /></td><td><input className="input" id={dateId} type="date" aria-label={`${LABELS[key]} source date`} value={saleAssumptionEvidence[key].sourceDate ?? ""} onChange={(event) => updateEvidence(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[datePath])} aria-describedby={fieldErrors[datePath] ? `${dateId}-error` : undefined} /><FieldError id={`${dateId}-error`} error={fieldErrors[datePath]} /></td><td><select className="input" id={stateId} aria-label={`${LABELS[key]} review state`} value={saleAssumptionEvidence[key].reviewState} onChange={(event) => updateEvidence(key, { reviewState: event.target.value as "working" | "done" })} aria-invalid={Boolean(fieldErrors[statePath])} aria-describedby={fieldErrors[statePath] ? `${stateId}-error` : undefined}><option value="working">Working on it</option><option value="done">Done</option></select><FieldError id={`${stateId}-error`} error={fieldErrors[statePath]} /></td></tr>;
        })}
      </tbody></table></div>
    </section>
    {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}
    <div className="underwriting-form-actions"><button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Sale Plan" : "Save Sale Plan"}</button></div>
  </form>;
}

const LABELS: Record<PropertyReturnsAssumptionKey, string> = {
  saleMonth: "Sale Month",
  terminalCapRatePercent: "Terminal Cap Rate",
  sellingCostPercent: "Selling Costs",
  forwardNoiConvention: "Forward NOI Period",
  cashFlowDateConvention: "Cash Flow Dates",
  xirrConvention: "XIRR Convention",
};

function NumberField({ id, label, value, onChange, error }: { id: string; label: string; value: number | ""; onChange: (value: number | "") => void; error?: string }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<span className="underwriting-money-input"><input id={id} className="input num" type="number" min="0" max="100" step="0.000001" value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><span>%</span></span><FieldError id={errorId} error={error} /></label>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <label className="field-label t-label">{label}<input className="input" value={value} readOnly /></label>;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

function blankEvidence() {
  return Object.fromEntries(PROPERTY_RETURNS_ASSUMPTION_KEYS.map((key) => [key, { reviewState: "working" as const }])) as Record<PropertyReturnsAssumptionKey, PropertyReturnsEvidence>;
}

async function responseBody(response: Response) {
  try {
    return await response.json() as { error?: string; fieldErrors?: Record<string, string> };
  } catch {
    return undefined;
  }
}
