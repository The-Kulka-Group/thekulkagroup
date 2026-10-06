"use client";

import {
  MAX_PROPERTY_TAX_FISCAL_YEARS,
  MAX_PROPERTY_TAX_SOURCE_LABEL_LENGTH,
  PROPERTY_TAX_ASSUMPTION_KEYS,
  PROPERTY_TAX_INPUT_VERSION,
  type PropertyTaxAssessmentBasis,
  type PropertyTaxAssumptionKey,
  type PropertyTaxEvidence,
  type PropertyTaxFiscalYear,
  type PropertyTaxMode,
  type PropertyTaxPlan,
  type PropertyTaxRateUnit,
} from "@kulka/engine";

const EVIDENCE_LABELS: Record<PropertyTaxAssumptionKey, string> = {
  firstFiscalYearStartMonth: "First Fiscal Year Start",
  assessment: "Assessment",
  fiscalYears: "Rates and Abatement Steps",
  annualRateGrowthPercent: "Rate Growth After the Schedule",
};

const RATE_UNITS: Array<[PropertyTaxRateUnit, string]> = [
  ["mills", "Mills (USD per 1,000 of Assessed Value)"],
  ["usd_per_100_assessed_value", "USD per 100 of Assessed Value"],
  ["percent_of_assessed_value", "Percent of Assessed Value"],
];

export function PropertyTaxSection({ plan, setPlan, fieldErrors }: {
  plan?: PropertyTaxPlan;
  setPlan: (plan?: PropertyTaxPlan) => void;
  fieldErrors: Record<string, string>;
}) {
  const update = (change: Partial<PropertyTaxPlan>) => plan && setPlan({ ...plan, ...change });
  const updateYear = (index: number, change: Partial<PropertyTaxFiscalYear>) => plan && update({
    fiscalYears: plan.fiscalYears.map((year, position) => position === index ? { ...year, ...change } : year),
  });
  const updateEvidence = (key: PropertyTaxAssumptionKey, change: Partial<PropertyTaxEvidence>) => plan && update({
    taxEvidence: { ...plan.taxEvidence, [key]: { ...plan.taxEvidence[key], ...change } },
  });
  const abatement = plan?.mode === "abatement";

  return (
    <section className="underwriting-line-section" aria-labelledby="property-tax-heading">
      <h4 id="property-tax-heading">Property Tax Schedule</h4>
      <p className="t-meta">A dated tax line by tax fiscal year. It replaces a flat tax expense line, so remove that line when you add the schedule. Under an abatement, each run reports NOI, value and lender tests on scheduled tax and on full tax.</p>
      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(plan)} onChange={(event) => setPlan(event.target.checked ? blankPlan() : undefined)} /> Add Property Tax Schedule</label>
      {plan ? <>
        <div className="underwriting-form-grid underwriting-operations-controls">
          <SelectField path="mode" label="Tax Mode" value={plan.mode} options={[["full_tax", "Full Tax"], ["abatement", "Abatement"]]} onChange={(mode) => update({
            mode: mode as PropertyTaxMode,
            ...(mode === "full_tax" ? { fiscalYears: plan.fiscalYears.map(({ rate }) => ({ rate, exemptionPercent: 0 })) } : {}),
          })} error={fieldErrors["propertyTax.mode"]} />
          <SelectField path="assessmentBasis" label="Assessment Basis" value={plan.assessmentBasis} options={[["stated_assessed_value", "Stated Assessed Value"], ["income", "Income"]]} onChange={(basis) => update(basis === "income"
            ? { assessmentBasis: "income", landAssessedValue: undefined, improvementAssessedValue: undefined }
            : { assessmentBasis: basis as PropertyTaxAssessmentBasis, assessorExpenseRatioPercent: undefined, assessmentCapRatePercent: undefined })} error={fieldErrors["propertyTax.assessmentBasis"]} />
          <InputField path="firstFiscalYearStartMonth" label="First Fiscal Year Starts" type="month" value={plan.firstFiscalYearStartMonth} onChange={(value) => update({ firstFiscalYearStartMonth: value })} error={fieldErrors["propertyTax.firstFiscalYearStartMonth"]} />
          <SelectField path="rateUnit" label="Rate Unit" value={plan.rateUnit} options={RATE_UNITS} onChange={(unit) => update({ rateUnit: unit as PropertyTaxRateUnit })} error={fieldErrors["propertyTax.rateUnit"]} />
          {plan.assessmentBasis === "stated_assessed_value" ? <>
            <InputField path="landAssessedValue" label="Land Assessed Value" value={plan.landAssessedValue ?? ""} onChange={(value) => update({ landAssessedValue: optionalNumber(value) })} error={fieldErrors["propertyTax.landAssessedValue"]} suffix="USD" step="0.01" />
            <InputField path="improvementAssessedValue" label="Improvement Assessed Value" value={plan.improvementAssessedValue ?? ""} onChange={(value) => update({ improvementAssessedValue: optionalNumber(value) })} error={fieldErrors["propertyTax.improvementAssessedValue"]} suffix="USD" step="0.01" />
          </> : <>
            <InputField path="assessorExpenseRatioPercent" label="Assessor Expense Ratio" value={plan.assessorExpenseRatioPercent ?? ""} onChange={(value) => update({ assessorExpenseRatioPercent: optionalNumber(value) })} error={fieldErrors["propertyTax.assessorExpenseRatioPercent"]} suffix="%" step="0.01" />
            <InputField path="assessmentCapRatePercent" label="Assessment Cap Rate" value={plan.assessmentCapRatePercent ?? ""} onChange={(value) => update({ assessmentCapRatePercent: optionalNumber(value) })} error={fieldErrors["propertyTax.assessmentCapRatePercent"]} suffix="%" step="0.01" />
          </>}
          <InputField path="assessmentRatioPercent" label={plan.assessmentBasis === "income" ? "Assessment Ratio" : "Assessment Ratio (Optional)"} value={plan.assessmentRatioPercent ?? ""} onChange={(value) => update({ assessmentRatioPercent: optionalNumber(value) })} error={fieldErrors["propertyTax.assessmentRatioPercent"]} suffix="%" step="0.0001" />
          <InputField path="annualRateGrowthPercent" label="Rate Growth After the Schedule" value={plan.annualRateGrowthPercent} onChange={(value) => update({ annualRateGrowthPercent: Number(value) })} error={fieldErrors["propertyTax.annualRateGrowthPercent"]} suffix="%" step="0.01" />
        </div>

        <div className="underwriting-section-head">
          <div><p className="t-meta">One row per tax fiscal year, in order from the first. Years after the last row grow the last rate and carry no abatement.</p></div>
          <button className="btn btn--secondary" type="button" disabled={plan.fiscalYears.length >= MAX_PROPERTY_TAX_FISCAL_YEARS} onClick={() => update({ fiscalYears: [...plan.fiscalYears, { rate: plan.fiscalYears.at(-1)?.rate ?? 0, exemptionPercent: 0 }] })}>Add Fiscal Year</button>
        </div>
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table">
            <thead><tr><th>Fiscal Year</th><th>Starts</th><th className="right">Rate</th>{abatement ? <><th className="right">Exemption</th><th className="right">PILOT Payment</th></> : null}<th>Action</th></tr></thead>
            <tbody>{plan.fiscalYears.map((year, index) => (
              <tr key={index}>
                <th scope="row">{index + 1}</th>
                <td className="num">{fiscalYearStart(plan.firstFiscalYearStartMonth, index)}</td>
                <td><CellInput path={`fiscalYears.${index}.rate`} label={`Fiscal year ${index + 1} rate`} value={year.rate} onChange={(value) => updateYear(index, { rate: Number(value) })} error={fieldErrors[`propertyTax.fiscalYears.${index}.rate`]} step="0.0001" /></td>
                {abatement ? <>
                  <td><CellInput path={`fiscalYears.${index}.exemptionPercent`} label={`Fiscal year ${index + 1} exemption`} value={year.exemptionPercent} onChange={(value) => updateYear(index, { exemptionPercent: Number(value) })} error={fieldErrors[`propertyTax.fiscalYears.${index}.exemptionPercent`]} suffix="%" step="0.01" /></td>
                  <td><CellInput path={`fiscalYears.${index}.statedPayment`} label={`Fiscal year ${index + 1} PILOT payment`} value={year.statedPayment ?? ""} onChange={(value) => updateYear(index, { statedPayment: optionalNumber(value) })} error={fieldErrors[`propertyTax.fiscalYears.${index}.statedPayment`]} suffix="USD" step="0.01" /></td>
                </> : null}
                <td><button className="btn btn--secondary" type="button" disabled={plan.fiscalYears.length === 1} onClick={() => update({ fiscalYears: plan.fiscalYears.filter((_, position) => position !== index) })}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {fieldErrors["propertyTax.fiscalYears"] ? <p className="input-error" role="alert">{fieldErrors["propertyTax.fiscalYears"]}</p> : null}

        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table underwriting-assumption-evidence">
            <thead><tr><th>Tax Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead>
            <tbody>{PROPERTY_TAX_ASSUMPTION_KEYS.map((key) => {
              const path = `propertyTax.taxEvidence.${key}`;
              return <tr key={key}>
                <th scope="row">{EVIDENCE_LABELS[key]}</th>
                <td><input className="input" id={controlId(`taxEvidence.${key}.sourceLabel`)} maxLength={MAX_PROPERTY_TAX_SOURCE_LABEL_LENGTH} aria-label={`${EVIDENCE_LABELS[key]} source label`} value={plan.taxEvidence[key].sourceLabel ?? ""} onChange={(event) => updateEvidence(key, { sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceLabel`])} /><FieldError error={fieldErrors[`${path}.sourceLabel`]} /></td>
                <td><input className="input" id={controlId(`taxEvidence.${key}.sourceDate`)} type="date" aria-label={`${EVIDENCE_LABELS[key]} source date`} value={plan.taxEvidence[key].sourceDate ?? ""} onChange={(event) => updateEvidence(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceDate`])} /><FieldError error={fieldErrors[`${path}.sourceDate`]} /></td>
                <td><select className="input" id={controlId(`taxEvidence.${key}.reviewState`)} aria-label={`${EVIDENCE_LABELS[key]} review state`} value={plan.taxEvidence[key].reviewState} onChange={(event) => updateEvidence(key, { reviewState: event.target.value as "working" | "done" })}><option value="working">Working on It</option><option value="done">Done</option></select></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </> : null}
    </section>
  );
}

function SelectField({ path, label, value, options, onChange, error }: { path: string; label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void; error?: string }) {
  const id = controlId(path);
  return <label className="field-label t-label" htmlFor={id}>{label}<select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select><FieldError id={`${id}-error`} error={error} /></label>;
}

function InputField({ path, label, value, onChange, error, type = "number", suffix, step }: { path: string; label: string; value: string | number; onChange: (value: string) => void; error?: string; type?: "number" | "month"; suffix?: string; step?: string }) {
  const id = controlId(path);
  return <label className="field-label t-label" htmlFor={id}>{label}<span className={suffix ? "underwriting-money-input" : undefined}><input id={id} className="input num" type={type} min={type === "number" ? "0" : undefined} step={step} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />{suffix ? <span>{suffix}</span> : null}</span><FieldError id={`${id}-error`} error={error} /></label>;
}

function CellInput({ path, label, value, onChange, error, suffix, step }: { path: string; label: string; value: string | number; onChange: (value: string) => void; error?: string; suffix?: string; step?: string }) {
  const id = controlId(path);
  return <><span className={suffix ? "underwriting-money-input" : undefined}><input id={id} className="input num right" type="number" min="0" step={step} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />{suffix ? <span>{suffix}</span> : null}</span><FieldError id={`${id}-error`} error={error} /></>;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

function controlId(path: string) {
  return `apartment-operations-propertyTax-${path.replaceAll(".", "-")}`;
}

function optionalNumber(value: string) {
  return value === "" ? undefined : Number(value);
}

function fiscalYearStart(firstMonth: string, index: number) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(firstMonth)) return "";
  const [year, month] = firstMonth.split("-").map(Number);
  const start = year * 12 + month - 1 + index * 12;
  return `${Math.floor(start / 12)}-${String(start % 12 + 1).padStart(2, "0")}`;
}

function blankPlan(): PropertyTaxPlan {
  return {
    taxInputVersion: PROPERTY_TAX_INPUT_VERSION,
    mode: "full_tax",
    assessmentBasis: "stated_assessed_value",
    firstFiscalYearStartMonth: "",
    rateUnit: "mills",
    fiscalYears: [{ rate: 0, exemptionPercent: 0 }],
    annualRateGrowthPercent: 0,
    taxEvidence: Object.fromEntries(PROPERTY_TAX_ASSUMPTION_KEYS.map((key) => [key, { reviewState: "working" as const }])) as PropertyTaxPlan["taxEvidence"],
  };
}
