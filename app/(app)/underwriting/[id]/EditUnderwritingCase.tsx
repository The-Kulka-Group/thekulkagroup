"use client";

import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";

import type {
  AssumptionName,
  UnderwritingCase,
} from "@/lib/underwriting/cases";

const ASSUMPTION_FIELDS: Array<{
  name: AssumptionName;
  label: string;
  unit: string;
  min: number;
  max?: number;
  step: string;
}> = [
  { name: "purchasePrice", label: "Purchase price", unit: "USD", min: 0, step: "any" },
  { name: "monthlyRent", label: "Average monthly rent", unit: "USD/month", min: 0, step: "any" },
  { name: "hardCostPerGrossSquareFoot", label: "Hard cost", unit: "USD/GSF", min: 0, step: "any" },
  { name: "softCostPercent", label: "Soft cost", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "contingencyPercent", label: "Contingency", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "vacancyPercent", label: "Vacancy", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "operatingExpensePercent", label: "Operating expenses", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "constructionMonths", label: "Construction duration", unit: "months", min: 1, step: "1" },
  { name: "debtPercent", label: "Expected debt", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "interestRatePercent", label: "Expected interest rate", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "exitCapRatePercent", label: "Exit cap rate", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "holdYears", label: "Hold period", unit: "years", min: 1, step: "1" },
];

function numberValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" && value !== "" ? Number(value) : undefined;
}

export function EditUnderwritingCase({
  savedCase,
  defaultSourceDate,
}: {
  savedCase: UnderwritingCase;
  defaultSourceDate: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const assumptions = new Map(savedCase.assumptions.map((assumption) => [assumption.name, assumption]));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const assumptionValues: Record<string, number | undefined> = {};
    const assumptionMetadata: Record<string, object> = {};

    for (const field of ASSUMPTION_FIELDS) {
      const value = numberValue(form, `assumptions.${field.name}`);
      assumptionValues[field.name] = value;
      if (value !== undefined) {
        assumptionMetadata[field.name] = {
          sourceLabel: form.get(`assumptionMetadata.${field.name}.sourceLabel`),
          sourceDate: form.get(`assumptionMetadata.${field.name}.sourceDate`),
          reviewState: form.get(`assumptionMetadata.${field.name}.reviewState`),
        };
      }
    }

    try {
      const response = await fetch(`/api/underwriting/cases/${savedCase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          address: form.get("address"),
          proposedUnits: numberValue(form, "proposedUnits"),
          averageUnitSquareFeet: numberValue(form, "averageUnitSquareFeet"),
          grossBuildingSquareFeet: numberValue(form, "grossBuildingSquareFeet"),
          assumptions: assumptionValues,
          assumptionMetadata,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The case could not be saved.");
        setFieldErrors(body.fieldErrors ?? {});
        setSaving(false);
        return;
      }

      const runResponse = await fetch(`/api/underwriting/cases/${savedCase.id}/runs`, {
        method: "POST",
      });
      if (!runResponse.ok) {
        const runBody = await runResponse.json();
        setError(`The changes were saved. ${runBody.error ?? "The calculation could not run."}`);
        setSaving(false);
        return;
      }

      router.refresh();
      setSaving(false);
    } catch {
      setError("The case could not be saved. Check the connection and try again.");
      setSaving(false);
    }
  }

  return (
    <form className="underwriting-edit" onSubmit={submit} noValidate>
      <section className="record-section">
        <h3>Project facts</h3>
        <div className="underwriting-form-grid">
          <Field name="name" label="Case name" defaultValue={savedCase.name} required error={fieldErrors.name} />
          <Field name="address" label="Property address" defaultValue={savedCase.address} required error={fieldErrors.address} />
          <Field name="proposedUnits" label="Proposed units" type="number" min="1" step="1" defaultValue={savedCase.proposedUnits} error={fieldErrors.proposedUnits} />
          <Field name="averageUnitSquareFeet" label="Average unit size" unit="SF" type="number" min="0" step="any" defaultValue={savedCase.averageUnitSquareFeet} error={fieldErrors.averageUnitSquareFeet} />
          <Field name="grossBuildingSquareFeet" label="Gross building area" unit="GSF" type="number" min="0" step="any" defaultValue={savedCase.grossBuildingSquareFeet} error={fieldErrors.grossBuildingSquareFeet} />
        </div>
      </section>

      <section className="record-section">
        <div className="underwriting-section-head">
          <div>
            <h3>Financial assumptions</h3>
            <p className="t-meta">Each supplied value keeps its source date and review state.</p>
          </div>
          <span className="chip chip--neutral"><span className="dot" />User supplied</span>
        </div>
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-edit-table">
            <thead>
              <tr>
                <th>Assumption</th>
                <th>Value</th>
                <th>Source label</th>
                <th>Source date</th>
                <th>Review state</th>
              </tr>
            </thead>
            <tbody>
              {ASSUMPTION_FIELDS.map((field) => {
                const assumption = assumptions.get(field.name);
                return (
                  <tr key={field.name}>
                    <th scope="row">
                      {field.label}
                      <span className="underwriting-unit">{field.unit}</span>
                    </th>
                    <td>
                      <InlineInput
                        name={`assumptions.${field.name}`}
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        defaultValue={assumption?.value}
                        error={fieldErrors[`assumptions.${field.name}`]}
                      />
                    </td>
                    <td>
                      <InlineInput
                        name={`assumptionMetadata.${field.name}.sourceLabel`}
                        defaultValue={assumption?.sourceLabel ?? "User entered"}
                        error={fieldErrors[`assumptionMetadata.${field.name}.sourceLabel`]}
                      />
                    </td>
                    <td>
                      <InlineInput
                        name={`assumptionMetadata.${field.name}.sourceDate`}
                        type="date"
                        defaultValue={assumption?.sourceDate ?? defaultSourceDate}
                        error={fieldErrors[`assumptionMetadata.${field.name}.sourceDate`]}
                      />
                    </td>
                    <td>
                      <select
                        className="input"
                        name={`assumptionMetadata.${field.name}.reviewState`}
                        defaultValue={assumption?.reviewState ?? "working"}
                        aria-invalid={Boolean(fieldErrors[`assumptionMetadata.${field.name}.reviewState`])}
                      >
                        <option value="working">Working on it</option>
                        <option value="done">Done</option>
                      </select>
                      <FieldError error={fieldErrors[`assumptionMetadata.${field.name}.reviewState`]} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}
      <div className="underwriting-form-actions">
        <button className="btn btn--primary btn--lg" type="submit" disabled={saving}>
          {saving ? "Saving and calculating" : "Save and recalculate"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, unit, error, ...input }: {
  label: string;
  unit?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span className="field-label t-label">
        {label}{unit ? <span className="underwriting-unit">{unit}</span> : null}
      </span>
      <input className="input" aria-invalid={Boolean(error)} {...input} />
      <FieldError error={error} />
    </label>
  );
}

function InlineInput({ error, ...input }: { error?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <>
      <input className="input" aria-invalid={Boolean(error)} {...input} />
      <FieldError error={error} />
    </>
  );
}

function FieldError({ error }: { error?: string }) {
  return error ? <span className="input-error" role="alert">{error}</span> : null;
}
