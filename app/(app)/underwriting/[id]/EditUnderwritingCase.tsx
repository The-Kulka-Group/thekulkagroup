"use client";

import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { useRouter } from "next/navigation";

import type {
  AssumptionName,
  FactMetadata,
  FactName,
  UnderwritingCase,
} from "@/lib/underwriting/cases";
import { GroupedNumberInput } from "@/components/GroupedNumberInput";
import { ownedAssumptions } from "@/lib/underwriting/intake-seed";
import { EditFieldset, useCanEdit } from "@/components/access/ToolLevel";

const ASSUMPTION_FIELDS: Array<{
  name: AssumptionName;
  label: string;
  unit: string;
  min: number;
  max?: number;
  step: string;
  recordOnly?: boolean;
  grouped?: boolean;
}> = [
  { name: "purchasePrice", label: "Purchase Price", unit: "USD", min: 0, step: "any", grouped: true },
  { name: "monthlyRent", label: "Average Monthly Rent", unit: "USD/month", min: 0, step: "any", grouped: true },
  { name: "hardCostPerGrossSquareFoot", label: "Hard Cost", unit: "USD/GSF", min: 0, step: "any", grouped: true },
  { name: "softCostPercent", label: "Soft Cost", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "contingencyPercent", label: "Contingency", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "vacancyPercent", label: "Vacancy", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "operatingExpensePercent", label: "Operating Expenses", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "constructionMonths", label: "Construction Duration", unit: "months", min: 1, step: "1" },
  { name: "debtPercent", label: "Expected Debt", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "interestRatePercent", label: "Expected Interest Rate", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "exitCapRatePercent", label: "Exit Cap Rate", unit: "percent", min: 0, max: 100, step: "any" },
  { name: "holdYears", label: "Hold Period", unit: "years", min: 1, step: "1", recordOnly: true },
];

const FACT_FIELDS: Array<{
  name: FactName;
  label: string;
  unit: string;
  min: number;
  step: string;
  grouped?: boolean;
}> = [
  { name: "proposedUnits", label: "Proposed Units", unit: "units", min: 1, step: "1", grouped: true },
  { name: "averageUnitSquareFeet", label: "Average Unit Size", unit: "SF", min: 0, step: "any", grouped: true },
  { name: "grossBuildingSquareFeet", label: "Gross Building Area", unit: "GSF", min: 0, step: "any", grouped: true },
];

function numberValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === "string" && value !== "" ? Number(value) : undefined;
}

export function EditUnderwritingCase({
  savedCase,
}: {
  savedCase: UnderwritingCase;
}) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const assumptions = new Map(savedCase.assumptions.map((assumption) => [assumption.name, assumption]));
  // A saved section owns the values intake seeded into it, so this table shows no second copy to edit.
  // Hold Period is no longer asked for; an older case that recorded one still shows it.
  const owned = ownedAssumptions(savedCase);
  const shownFields = ASSUMPTION_FIELDS.filter((field) => !owned.has(field.name)
    && (field.name !== "holdYears" || assumptions.has("holdYears")));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const assumptionValues: Record<string, number | undefined> = {};
    const assumptionMetadata: Record<string, object> = {};
    const factMetadata: Record<string, object> = {};

    for (const field of ASSUMPTION_FIELDS) {
      if (!shownFields.includes(field)) {
        // A hidden value keeps what is saved, so this save never clears it.
        const kept = assumptions.get(field.name);
        assumptionValues[field.name] = kept?.value;
        if (kept) {
          assumptionMetadata[field.name] = {
            sourceLabel: kept.sourceLabel,
            sourceDate: kept.sourceDate,
            reviewState: kept.reviewState,
          };
        }
        continue;
      }
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

    for (const field of FACT_FIELDS) {
      if (numberValue(form, field.name) === undefined) continue;
      factMetadata[field.name] = {
        sourceLabel: form.get(`factMetadata.${field.name}.sourceLabel`),
        sourceDate: form.get(`factMetadata.${field.name}.sourceDate`),
        reviewState: form.get(`factMetadata.${field.name}.reviewState`),
      };
    }

    let caseWasSaved = false;
    try {
      const response = await fetch(`/api/underwriting/cases/${savedCase.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: savedCase.caseRevision,
          name: form.get("name"),
          address: form.get("address"),
          proposedUnits: numberValue(form, "proposedUnits"),
          averageUnitSquareFeet: numberValue(form, "averageUnitSquareFeet"),
          grossBuildingSquareFeet: numberValue(form, "grossBuildingSquareFeet"),
          factMetadata,
          assumptions: assumptionValues,
          assumptionMetadata,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The project changed in another session. Refresh the page, review the latest values, then retry your edits. Your entries remain in this form."
          : body?.error ?? "The project could not be saved.");
        setFieldErrors(body?.fieldErrors ?? {});
        return;
      }
      if (!body?.case?.caseRevision) {
        setError("The project may have been saved, but the server returned an unreadable response. Reload before making more changes.");
        return;
      }
      caseWasSaved = true;

      const runResponse = await fetch(`/api/underwriting/cases/${savedCase.id}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: body.case.caseRevision }),
      });
      const runBody = await responseBody(runResponse);
      if (!runResponse.ok) {
        setError(runResponse.status === 409
          ? "The changes were saved, but the project changed again before calculation. Refresh the page and retry the calculation."
          : `The changes were saved. ${runBody?.error ?? "The calculation could not run."}`);
        return;
      }

      router.refresh();
    } catch {
      setError(caseWasSaved
        ? "The changes were saved, but the calculation request failed. Check the connection, reload, and run the calculation."
        : "The project could not be saved. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="underwriting-edit" onSubmit={submit} noValidate><EditFieldset>
      <section className="record-section">
        <h3>Project Facts</h3>
        <div className="underwriting-form-grid">
          <Field name="name" label="Project Name" defaultValue={savedCase.name} required error={fieldErrors.name} />
          <Field name="address" label="Property Address" defaultValue={savedCase.address} required error={fieldErrors.address} />
        </div>
        <EvidenceTable
          fields={FACT_FIELDS}
          value={(name) => savedCase[name]}
          metadata={(name) => savedCase.factMetadata[name]}
          fieldErrors={fieldErrors}
        />
      </section>

      <section className="record-section">
        <div className="underwriting-section-head">
          <div>
            <h3>Financial Assumptions</h3>
            <p className="t-meta">Each supplied value keeps its source date and review state. Once a section below is saved, it holds the values it took from here.</p>
          </div>
          <span className="chip chip--neutral"><span className="dot" />User Supplied</span>
        </div>
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-edit-table">
            <thead>
              <tr>
                <th>Assumption</th>
                <th>Value</th>
                <th>Source Label</th>
                <th>Source Date</th>
                <th>Review State</th>
              </tr>
            </thead>
            <tbody>
              {shownFields.map((field) => {
                const assumption = assumptions.get(field.name);
                return (
                  <tr key={field.name}>
                    <th scope="row">
                      {field.label}
                      <span className="underwriting-unit">{field.unit}</span>
                      {field.recordOnly ? <span className="underwriting-record-only">Record only. The current model does not use this value.</span> : null}
                    </th>
                    <td>
                      <InlineInput
                        name={`assumptions.${field.name}`}
                        type="number"
                        grouped={field.grouped}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        defaultValue={assumption?.value}
                        label={`${field.label} value`}
                        error={fieldErrors[`assumptions.${field.name}`]}
                      />
                    </td>
                    <td>
                      <InlineInput
                        name={`assumptionMetadata.${field.name}.sourceLabel`}
                        defaultValue={assumption?.sourceLabel ?? ""}
                        label={`${field.label} source label`}
                        error={fieldErrors[`assumptionMetadata.${field.name}.sourceLabel`]}
                      />
                    </td>
                    <td>
                      <InlineInput
                        name={`assumptionMetadata.${field.name}.sourceDate`}
                        type="date"
                        defaultValue={assumption?.sourceDate ?? ""}
                        label={`${field.label} source date`}
                        error={fieldErrors[`assumptionMetadata.${field.name}.sourceDate`]}
                      />
                    </td>
                    <td>
                      <select
                        id={controlId(`assumptionMetadata.${field.name}.reviewState`)}
                        className="input"
                        name={`assumptionMetadata.${field.name}.reviewState`}
                        defaultValue={assumption?.reviewState ?? "working"}
                        aria-label={`${field.label} review state`}
                        aria-invalid={Boolean(fieldErrors[`assumptionMetadata.${field.name}.reviewState`])}
                        aria-describedby={fieldErrors[`assumptionMetadata.${field.name}.reviewState`]
                          ? `${controlId(`assumptionMetadata.${field.name}.reviewState`)}-error`
                          : undefined}
                      >
                        <option value="working">Working on It</option>
                        <option value="done">Done</option>
                      </select>
                      <FieldError
                        id={`${controlId(`assumptionMetadata.${field.name}.reviewState`)}-error`}
                        error={fieldErrors[`assumptionMetadata.${field.name}.reviewState`]}
                      />
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
        {canEdit ? <button className="btn btn--primary btn--lg" type="submit" disabled={saving}>
          {saving ? "Saving and calculating" : "Save and recalculate"}
        </button> : null}
      </div>
    </EditFieldset></form>
  );
}

function EvidenceTable({
  fields,
  value,
  metadata,
  fieldErrors,
}: {
  fields: typeof FACT_FIELDS;
  value: (name: FactName) => number | undefined;
  metadata: (name: FactName) => FactMetadata | undefined;
  fieldErrors: Record<string, string>;
}) {
  return (
    <div className="underwriting-edit-table-wrap">
      <table className="underwriting-edit-table">
        <thead>
          <tr><th>Project Fact</th><th>Value</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr>
        </thead>
        <tbody>
          {fields.map((field) => {
            const evidence = metadata(field.name);
            return (
              <tr key={field.name}>
                <th scope="row">{field.label}<span className="underwriting-unit">{field.unit}</span></th>
                <td>
                  <InlineInput
                    name={field.name}
                    type="number"
                    grouped={field.grouped}
                    min={field.min}
                    step={field.step}
                    defaultValue={value(field.name)}
                    label={`${field.label} value`}
                    error={fieldErrors[field.name]}
                  />
                </td>
                <td>
                  <InlineInput
                    name={`factMetadata.${field.name}.sourceLabel`}
                    defaultValue={evidence?.sourceLabel ?? ""}
                    label={`${field.label} source label`}
                    error={fieldErrors[`factMetadata.${field.name}.sourceLabel`]}
                  />
                </td>
                <td>
                  <InlineInput
                    name={`factMetadata.${field.name}.sourceDate`}
                    type="date"
                    defaultValue={evidence?.sourceDate ?? ""}
                    label={`${field.label} source date`}
                    error={fieldErrors[`factMetadata.${field.name}.sourceDate`]}
                  />
                </td>
                <td>
                  <select
                    id={controlId(`factMetadata.${field.name}.reviewState`)}
                    className="input"
                    name={`factMetadata.${field.name}.reviewState`}
                    defaultValue={evidence?.reviewState ?? "working"}
                    aria-label={`${field.label} review state`}
                    aria-invalid={Boolean(fieldErrors[`factMetadata.${field.name}.reviewState`])}
                  >
                    <option value="working">Working on It</option>
                    <option value="done">Done</option>
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function responseBody(response: Response): Promise<{
  error?: string;
  fieldErrors?: Record<string, string>;
  case?: { caseRevision?: number };
} | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function Field({ label, unit, error, ...input }: {
  label: string;
  unit?: string;
  error?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? controlId(String(input.name));
  const errorId = `${id}-error`;
  return (
    <div>
      <span className="field-label t-label">
        <label htmlFor={id}>{label}</label>{unit ? <span className="underwriting-unit">{unit}</span> : null}
      </span>
      <input
        id={id}
        className="input"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...input}
      />
      <FieldError id={errorId} error={error} />
    </div>
  );
}

function InlineInput({ error, label, grouped, ...input }: {
  error?: string;
  label: string;
  grouped?: boolean;
} & InputHTMLAttributes<HTMLInputElement>) {
  const id = input.id ?? controlId(String(input.name));
  const errorId = `${id}-error`;
  return (
    <>
      {grouped ? (
        <GroupedNumberInput
          id={id}
          className="input"
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          name={input.name}
          defaultValue={input.defaultValue as number | string | undefined}
        />
      ) : (
        <input
          id={id}
          className="input"
          aria-label={label}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          {...input}
        />
      )}
      <FieldError id={errorId} error={error} />
    </>
  );
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

function controlId(name: string) {
  return `underwriting-${name.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
