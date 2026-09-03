"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  APARTMENT_SCENARIO_INPUT_VERSION,
  MAX_APARTMENT_SCENARIO_NAME_LENGTH,
  MAX_APARTMENT_SCENARIO_SOURCE_LABEL_LENGTH,
  MAX_SCENARIO_TIMING_SHIFT_MONTHS,
  type ApartmentScenarioChangeKey,
  type ApartmentScenarioRole,
} from "@kulka/engine";

import type { UnderwritingCase } from "@/lib/underwriting/cases";

const KEYS = ["vacancyPercent", "annualIncomeGrowthPercent", "terminalCapRatePercent", "growthStartMonthShiftMonths"] as const;
const LABELS: Record<ApartmentScenarioChangeKey, string> = {
  vacancyPercent: "Vacancy",
  annualIncomeGrowthPercent: "Annual Income Growth",
  terminalCapRatePercent: "Terminal Cap Rate",
  growthStartMonthShiftMonths: "Growth Start Shift",
};
type FormScenario = {
  id: string;
  role: ApartmentScenarioRole;
  name: string;
  values: Record<ApartmentScenarioChangeKey, number | "">;
  evidence: Record<ApartmentScenarioChangeKey, { sourceLabel: string; sourceDate: string; reviewState: "working" | "done" }>;
};

export function ScenarioComparisonEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<FormScenario[]>(() => [formFor(savedCase, "downside"), formFor(savedCase, "upside")]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  if (!savedCase.propertyReturns) return <section><h3>Apartment Scenarios</h3><div className="empty empty--inline"><p>Save the property sale plan before adding scenarios.</p></div></section>;

  const update = (index: number, next: Partial<FormScenario>) => setScenarios((current) =>
    current.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item));

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    try {
      const payload = {
        expectedRevision: savedCase.caseRevision,
        scenarios: scenarios.map((scenario) => ({
          id: scenario.id,
          role: scenario.role,
          name: scenario.name,
          inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
          delta: Object.fromEntries(KEYS.flatMap((key) => scenario.values[key] === "" ? [] : [[key, scenario.values[key]]])),
          evidence: Object.fromEntries(KEYS.flatMap((key) => scenario.values[key] === "" ? [] : [[key, scenario.evidence[key]]])),
        })),
      };
      const response = await fetch(`/api/underwriting/cases/${savedCase.id}/scenarios`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) {
        setError(response.status === 409 ? "The case changed in another session. Refresh and review the scenarios." : body.error);
        setFieldErrors(body.fieldErrors ?? {});
        return;
      }
      router.refresh();
    } catch {
      setError("The scenario request failed. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return <form className="underwriting-scenario-editor" onSubmit={save} noValidate>
    <div className="underwriting-section-head"><div><h3>Apartment Scenarios</h3><p className="t-meta">Each scenario stores changed inputs only. Leave a name blank to use a neutral name based on one changed input.</p></div></div>
    <FieldError id="scenario-list-error" error={fieldErrors.scenarios} />
    {scenarios.map((scenario, index) => {
      const scenarioPath = `scenarios.${index}`;
      const nameId = `scenario-${scenario.role}-name`;
      const nameError = fieldError(fieldErrors, `${scenarioPath}.name`);
      return <section className="underwriting-line-section" key={scenario.role}>
        <h4>{title(scenario.role)} Scenario</h4>
        <label className="field-label t-label" htmlFor={nameId}>Name
          <input id={nameId} className="input" maxLength={MAX_APARTMENT_SCENARIO_NAME_LENGTH} value={scenario.name} onChange={(event) => update(index, { name: event.target.value })} aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `${nameId}-error` : undefined} />
          <FieldError id={`${nameId}-error`} error={nameError} />
        </label>
        <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-scenario-table"><thead><tr><th>Changed Input</th><th>Value</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>
          {KEYS.map((key) => {
            const valueId = `scenario-${scenario.role}-${key}-value`;
            const labelId = `scenario-${scenario.role}-${key}-source-label`;
            const dateId = `scenario-${scenario.role}-${key}-source-date`;
            const stateId = `scenario-${scenario.role}-${key}-review-state`;
            const deltaPath = `${scenarioPath}.delta.${key}`;
            const evidencePath = `${scenarioPath}.evidence.${key}`;
            const valueError = fieldError(fieldErrors, deltaPath, `${scenarioPath}.delta`);
            const labelError = fieldError(fieldErrors, `${evidencePath}.sourceLabel`, evidencePath);
            const dateError = fieldError(fieldErrors, `${evidencePath}.sourceDate`, evidencePath);
            const stateError = fieldError(fieldErrors, `${evidencePath}.reviewState`, evidencePath);
            return <tr key={key}><th scope="row">{LABELS[key]}</th>
              <td><input id={valueId} className="input num" aria-label={`${title(scenario.role)} ${LABELS[key]} value`} type="number" step={key === "growthStartMonthShiftMonths" ? 1 : 0.01} min={key === "growthStartMonthShiftMonths" ? -MAX_SCENARIO_TIMING_SHIFT_MONTHS : key === "terminalCapRatePercent" ? 0.01 : 0} max={key === "growthStartMonthShiftMonths" ? MAX_SCENARIO_TIMING_SHIFT_MONTHS : 100} value={scenario.values[key]} onChange={(event) => update(index, { values: { ...scenario.values, [key]: event.target.value === "" ? "" : Number(event.target.value) } })} aria-invalid={Boolean(valueError)} aria-describedby={valueError ? `${valueId}-error` : undefined} /><FieldError id={`${valueId}-error`} error={valueError} /></td>
              <td><input id={labelId} className="input" aria-label={`${title(scenario.role)} ${LABELS[key]} source label`} maxLength={MAX_APARTMENT_SCENARIO_SOURCE_LABEL_LENGTH} value={scenario.evidence[key].sourceLabel} onChange={(event) => update(index, { evidence: { ...scenario.evidence, [key]: { ...scenario.evidence[key], sourceLabel: event.target.value } } })} aria-invalid={Boolean(labelError)} aria-describedby={labelError ? `${labelId}-error` : undefined} /><FieldError id={`${labelId}-error`} error={labelError} /></td>
              <td><input id={dateId} className="input" aria-label={`${title(scenario.role)} ${LABELS[key]} source date`} type="date" value={scenario.evidence[key].sourceDate} onChange={(event) => update(index, { evidence: { ...scenario.evidence, [key]: { ...scenario.evidence[key], sourceDate: event.target.value } } })} aria-invalid={Boolean(dateError)} aria-describedby={dateError ? `${dateId}-error` : undefined} /><FieldError id={`${dateId}-error`} error={dateError} /></td>
              <td><select id={stateId} className="input" aria-label={`${title(scenario.role)} ${LABELS[key]} review state`} value={scenario.evidence[key].reviewState} onChange={(event) => update(index, { evidence: { ...scenario.evidence, [key]: { ...scenario.evidence[key], reviewState: event.target.value as "working" | "done" } } })} aria-invalid={Boolean(stateError)} aria-describedby={stateError ? `${stateId}-error` : undefined}><option value="working">Working on it</option><option value="done">Done</option></select><FieldError id={`${stateId}-error`} error={stateError} /></td>
            </tr>;
          })}
        </tbody></table></div>
      </section>;
    })}
    {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}
    <div className="underwriting-form-actions"><button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Scenarios" : "Save Scenarios"}</button></div>
  </form>;
}

function formFor(savedCase: UnderwritingCase, role: ApartmentScenarioRole): FormScenario {
  const saved = savedCase.scenarios?.find((scenario) => scenario.role === role);
  return {
    id: saved?.id ?? `${role}-scenario`,
    role,
    name: saved?.name ?? "",
    values: Object.fromEntries(KEYS.map((key) => [key, saved?.delta[key] ?? ""])) as FormScenario["values"],
    evidence: Object.fromEntries(KEYS.map((key) => [key, {
      sourceLabel: saved?.evidence[key]?.sourceLabel ?? "",
      sourceDate: saved?.evidence[key]?.sourceDate ?? "",
      reviewState: saved?.evidence[key]?.reviewState ?? "working",
    }])) as FormScenario["evidence"],
  };
}

function fieldError(fieldErrors: Record<string, string>, ...paths: string[]) {
  return paths.map((path) => fieldErrors[path]).find(Boolean);
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

function title(value: string) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}
