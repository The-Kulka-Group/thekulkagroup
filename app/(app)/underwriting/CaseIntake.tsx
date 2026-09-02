"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

function numberValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" && value !== "" ? Number(value) : undefined;
}

export function CaseIntake() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/underwriting/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          address: form.get("address"),
          proposedUnits: numberValue(form, "proposedUnits"),
          averageUnitSquareFeet: numberValue(form, "averageUnitSquareFeet"),
          grossBuildingSquareFeet: numberValue(form, "grossBuildingSquareFeet"),
          commonSourceLabel: form.get("commonSourceLabel"),
          commonSourceDate: form.get("commonSourceDate"),
          assumptions: {
            purchasePrice: numberValue(form, "purchasePrice"),
            monthlyRent: numberValue(form, "monthlyRent"),
            hardCostPerGrossSquareFoot: numberValue(form, "hardCostPerGrossSquareFoot"),
            softCostPercent: numberValue(form, "softCostPercent"),
            contingencyPercent: numberValue(form, "contingencyPercent"),
            vacancyPercent: numberValue(form, "vacancyPercent"),
            operatingExpensePercent: numberValue(form, "operatingExpensePercent"),
            constructionMonths: numberValue(form, "constructionMonths"),
            debtPercent: numberValue(form, "debtPercent"),
            interestRatePercent: numberValue(form, "interestRatePercent"),
            exitCapRatePercent: numberValue(form, "exitCapRatePercent"),
            holdYears: numberValue(form, "holdYears"),
          },
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(body?.error ?? "The case could not be saved.");
        return;
      }
      if (!body?.case?.id) {
        setError("The case was saved, but the server returned an unreadable response. Reload the case list.");
        return;
      }
      router.push(`/underwriting/${body.case.id}`);
      router.refresh();
    } catch {
      setError("The case could not be saved. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="underwriting-intake" onSubmit={submit}>
      <div className="underwriting-intake-head">
        <div>
          <h2 className="t-2">Start a ground-up multifamily case</h2>
          <p className="t-meta">Enter what is known. Blank financial inputs stay missing.</p>
        </div>
      </div>

      <div className="underwriting-form-grid">
        <Field name="name" label="Case name" required />
        <Field name="address" label="Property address" required />
        <Field name="proposedUnits" label="Proposed units" type="number" min="1" step="1" />
        <Field name="averageUnitSquareFeet" label="Average unit size" unit="SF" type="number" min="0" step="any" />
        <Field name="grossBuildingSquareFeet" label="Gross building area" unit="GSF" type="number" min="0" step="any" />
        <Field name="commonSourceLabel" label="Common source label" note="Optional. This source applies to each value entered on this screen." />
        <Field name="commonSourceDate" label="Common source date" note="Optional. Leave both source fields blank when evidence is not available." type="date" />
        <Field name="purchasePrice" label="Purchase price" unit="USD" type="number" min="0" step="any" />
        <Field name="monthlyRent" label="Average monthly rent" unit="USD/month" type="number" min="0" step="any" />
        <Field name="hardCostPerGrossSquareFoot" label="Hard cost" unit="USD/GSF" type="number" min="0" step="any" />
        <Field name="softCostPercent" label="Soft cost" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="contingencyPercent" label="Contingency" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="vacancyPercent" label="Vacancy" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="operatingExpensePercent" label="Operating expenses" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="constructionMonths" label="Construction duration" unit="months" note="Record only. The current model does not use this value." type="number" min="1" step="1" />
        <Field name="debtPercent" label="Expected debt" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="interestRatePercent" label="Expected interest rate" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="exitCapRatePercent" label="Exit cap rate" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="holdYears" label="Hold period" unit="years" note="Record only. The current model does not use this value." type="number" min="1" step="1" />
      </div>

      {error ? <p className="input-error" role="alert">{error}</p> : null}
      <div className="underwriting-form-actions">
        <button className="btn btn--primary btn--lg" type="submit" disabled={saving}>
          {saving ? "Saving" : "Save case"}
        </button>
      </div>
    </form>
  );
}

async function responseBody(response: Response): Promise<{ error?: string; case?: { id?: string } } | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function Field({
  label,
  unit,
  note,
  ...input
}: {
  label: string;
  unit?: string;
  note?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label>
      <span className="field-label t-label">
        {label}{unit ? <span className="underwriting-unit">{unit}</span> : null}
      </span>
      <input className="input" {...input} />
      {note ? <span className="t-meta underwriting-field-note">{note}</span> : null}
    </label>
  );
}
