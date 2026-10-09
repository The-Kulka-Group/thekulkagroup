"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { GroupedNumberInput } from "@/components/GroupedNumberInput";

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
          },
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(body?.error ?? "The project could not be saved.");
        return;
      }
      if (!body?.case?.id) {
        setError("The project was saved, but the server returned an unreadable response. Reload the project list.");
        return;
      }
      router.push(`/underwriting/${body.case.id}`);
      router.refresh();
    } catch {
      setError("The project could not be saved. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="underwriting-intake" onSubmit={submit}>
      <div className="underwriting-intake-head">
        <div>
          <h2 className="t-2">Start a Ground-Up Multifamily Project</h2>
          <p className="t-meta">Enter what is known. Blank financial inputs stay missing. These values start the cost schedule, apartment operations, development capital, and sale sections, and each section holds its values once saved.</p>
        </div>
      </div>

      <div className="underwriting-form-grid">
        <Field name="name" label="Project Name" required />
        <Field name="address" label="Property Address" required />
        <Field name="proposedUnits" label="Proposed Units" grouped />
        <Field name="averageUnitSquareFeet" label="Average Unit Size" unit="SF" grouped />
        <Field name="grossBuildingSquareFeet" label="Gross Building Area" unit="GSF" grouped />
        <Field name="commonSourceLabel" label="Common Source Label" note="Optional. This source applies to each value entered on this screen and to new lines added later." />
        <Field name="commonSourceDate" label="Common Source Date" note="Optional. Leave both source fields blank when evidence is not available." type="date" />
        <Field name="purchasePrice" label="Purchase Price" unit="USD" grouped />
        <Field name="monthlyRent" label="Average Monthly Rent" unit="USD/month" grouped />
        <Field name="hardCostPerGrossSquareFoot" label="Hard Cost" unit="USD/GSF" grouped />
        <Field name="softCostPercent" label="Soft Cost" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="contingencyPercent" label="Contingency" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="vacancyPercent" label="Vacancy" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="operatingExpensePercent" label="Operating Expenses" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="constructionMonths" label="Construction Duration" unit="months" note="Sets the hard and soft cost months once the schedule has an analysis start." type="number" min="1" step="1" />
        <Field name="debtPercent" label="Expected Debt" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="interestRatePercent" label="Expected Interest Rate" unit="percent" type="number" min="0" max="100" step="any" />
        <Field name="exitCapRatePercent" label="Exit Cap Rate" unit="percent" type="number" min="0" max="100" step="any" />
      </div>

      {error ? <p className="input-error" role="alert">{error}</p> : null}
      <div className="underwriting-form-actions">
        <button className="btn btn--primary btn--lg" type="submit" disabled={saving}>
          {saving ? "Saving" : "Save Project"}
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
  grouped,
  ...input
}: {
  label: string;
  unit?: string;
  note?: string;
  grouped?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `intake-${input.name}`;
  const noteId = note ? `${id}-note` : undefined;
  return (
    <div>
      <label className="field-label t-label" htmlFor={id}>
        {label}{unit ? <>{" "}<span className="underwriting-unit">{unit}</span></> : null}
      </label>
      {grouped ? (
        <GroupedNumberInput id={id} className="input" aria-describedby={noteId} name={input.name} />
      ) : (
        <input id={id} className="input" aria-describedby={noteId} {...input} />
      )}
      {note ? <span id={noteId} className="t-meta underwriting-field-note">{note}</span> : null}
    </div>
  );
}
