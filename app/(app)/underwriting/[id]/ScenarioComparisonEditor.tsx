"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { APARTMENT_SCENARIO_INPUT_VERSION, type ApartmentScenarioChangeKey, type ApartmentScenarioRole } from "@kulka/engine";
import type { UnderwritingCase } from "@/lib/underwriting/cases";

const KEYS = ["vacancyPercent", "annualIncomeGrowthPercent", "terminalCapRatePercent", "growthStartMonthShiftMonths"] as const;
const LABELS: Record<ApartmentScenarioChangeKey, string> = { vacancyPercent: "Vacancy", annualIncomeGrowthPercent: "Annual Income Growth", terminalCapRatePercent: "Terminal Cap Rate", growthStartMonthShiftMonths: "Growth Start Shift" };
type FormScenario = { id: string; role: ApartmentScenarioRole; name: string; values: Record<ApartmentScenarioChangeKey, number | "">; evidence: Record<ApartmentScenarioChangeKey, { sourceLabel: string; sourceDate: string; reviewState: "working" | "done" }> };

export function ScenarioComparisonEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<FormScenario[]>(() => [formFor(savedCase, "downside"), formFor(savedCase, "upside")]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  if (!savedCase.propertyReturns) return <section><h3>Apartment Scenarios</h3><div className="empty empty--inline"><p>Save the property sale plan before adding scenarios.</p></div></section>;
  const update = (index: number, next: Partial<FormScenario>) => setScenarios((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...next } : item));
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(undefined); setFieldErrors({});
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
      if (!response.ok) { setError(response.status === 409 ? "The case changed in another session. Refresh and review the scenarios." : body.error); setFieldErrors(body.fieldErrors ?? {}); return; }
      router.refresh();
    } catch { setError("The scenario request failed. Check the connection and try again."); } finally { setSaving(false); }
  }
  return <form className="underwriting-scenario-editor" onSubmit={save} noValidate><div className="underwriting-section-head"><div><h3>Apartment Scenarios</h3><p className="t-meta">Each scenario stores changed inputs only. The current reviewed inputs stay unchanged.</p></div></div>
    {scenarios.map((scenario, index) => <section className="underwriting-line-section" key={scenario.role}><h4>{title(scenario.role)} Scenario</h4><label className="field-label t-label" htmlFor={`scenario-${scenario.role}-name`}>Name<input id={`scenario-${scenario.role}-name`} className="input" value={scenario.name} onChange={(event) => update(index, { name: event.target.value })} aria-invalid={Boolean(fieldErrors[`scenarios.${index}.name`])} /></label>{fieldErrors[`scenarios.${index}.name`] ? <span className="input-error" role="alert">{fieldErrors[`scenarios.${index}.name`]}</span> : null}
      <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-scenario-table"><thead><tr><th>Changed Input</th><th>Value</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>{KEYS.map((key) => <tr key={key}><th scope="row">{LABELS[key]}</th><td><input className="input num" aria-label={`${title(scenario.role)} ${LABELS[key]} value`} type="number" step={key === "growthStartMonthShiftMonths" ? 1 : 0.01} value={scenario.values[key]} onChange={(event) => update(index, { values: { ...scenario.values, [key]: event.target.value === "" ? "" : Number(event.target.value) } })} /></td><td><input className="input" aria-label={`${title(scenario.role)} ${LABELS[key]} source label`} value={scenario.evidence[key].sourceLabel} onChange={(event) => update(index, { evidence: { ...scenario.evidence, [key]: { ...scenario.evidence[key], sourceLabel: event.target.value } } })} /></td><td><input className="input" aria-label={`${title(scenario.role)} ${LABELS[key]} source date`} type="date" value={scenario.evidence[key].sourceDate} onChange={(event) => update(index, { evidence: { ...scenario.evidence, [key]: { ...scenario.evidence[key], sourceDate: event.target.value } } })} /></td><td><select className="input" aria-label={`${title(scenario.role)} ${LABELS[key]} review state`} value={scenario.evidence[key].reviewState} onChange={(event) => update(index, { evidence: { ...scenario.evidence, [key]: { ...scenario.evidence[key], reviewState: event.target.value as "working" | "done" } } })}><option value="working">Working on it</option><option value="done">Done</option></select></td></tr>)}</tbody></table></div>
    </section>)}
    {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}<div className="underwriting-form-actions"><button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Scenarios" : "Save Scenarios"}</button></div>
  </form>;
}

function formFor(savedCase: UnderwritingCase, role: ApartmentScenarioRole): FormScenario { const saved = savedCase.scenarios?.find((scenario) => scenario.role === role); return { id: saved?.id ?? `${role}-scenario`, role, name: saved?.name ?? "", values: Object.fromEntries(KEYS.map((key) => [key, saved?.delta[key] ?? ""])) as FormScenario["values"], evidence: Object.fromEntries(KEYS.map((key) => [key, { sourceLabel: saved?.evidence[key]?.sourceLabel ?? "", sourceDate: saved?.evidence[key]?.sourceDate ?? "", reviewState: saved?.evidence[key]?.reviewState ?? "working" }])) as FormScenario["evidence"] }; }
function title(value: string) { return `${value[0].toUpperCase()}${value.slice(1)}`; }
