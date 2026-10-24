"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CAPITALIZED_GROSS_INTEREST_VERSION,
  CAPITALIZED_NET_OPERATING_CASH_VERSION,
  DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS,
  DEVELOPMENT_CAPITAL_INPUT_VERSION,
  EQUITY_FIRST_FUNDING_VERSION,
  MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH,
  OPENING_BALANCE_MONTHLY_VERSION,
  type DevelopmentCapitalAssumptionKey,
  type DevelopmentCapitalEvidence,
  type CreditedLandPlan,
  type DevelopmentCapitalRatePath,
  type InterestTreatment,
  type OtherFundingSource,
  type PermanentLoanPlan,
} from "@kulka/engine";

import type { UnderwritingCase } from "@/lib/underwriting/cases";
import { blankEvidenceRows, commonSource, seedFromIntake } from "@/lib/underwriting/intake-seed";

import { OtherSourcesSection } from "./OtherSourcesSection";
import { PermanentLoanSection } from "./PermanentLoanSection";
import { EditFieldset, useCanEdit } from "@/components/access/ToolLevel";

export function DevelopmentCapitalEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const saved = savedCase.developmentCapital;
  // An unsaved section starts from the debt share and interest rate intake supplies.
  const seed = saved ? undefined : seedFromIntake(savedCase);
  const source = commonSource(savedCase);
  const [targetDebtSharePercent, setTargetDebtSharePercent] = useState<number | "">(saved?.targetDebtSharePercent ?? seed?.targetDebtSharePercent?.value ?? "");
  const [annualInterestRatePercent, setAnnualInterestRatePercent] = useState<number | "">(saved?.annualInterestRatePercent ?? seed?.annualInterestRatePercent?.value ?? "");
  const [loanFeePercent, setLoanFeePercent] = useState<number | "">(saved?.loanFeePercent ?? "");
  const [feeMonth, setFeeMonth] = useState(saved?.feeMonth ?? savedCase.costSchedule?.analysisStartMonth ?? "");
  const [payoffMonth, setPayoffMonth] = useState(saved?.payoffMonth ?? savedCase.costSchedule?.saleMonth ?? "");
  const [interestTreatment, setInterestTreatment] = useState<InterestTreatment>(saved?.interestTreatment ?? CAPITALIZED_NET_OPERATING_CASH_VERSION);
  const savedPath = saved?.ratePath;
  const [usePath, setUsePath] = useState(savedPath !== undefined);
  const [spreadPercent, setSpreadPercent] = useState<number | "">(savedPath?.spreadPercent ?? "");
  const [curveSourceLabel, setCurveSourceLabel] = useState(savedPath?.curveSourceLabel ?? "");
  const [asOfDate, setAsOfDate] = useState(savedPath?.asOfDate ?? "");
  const [curveStartMonth, setCurveStartMonth] = useState(savedPath?.baseRates[0]?.month ?? savedCase.costSchedule?.analysisStartMonth ?? "");
  const [baseRates, setBaseRates] = useState<Array<number | "">>(savedPath?.baseRates.map(({ baseRatePercent }) => baseRatePercent) ?? [""]);
  const [otherSources, setOtherSources] = useState<OtherFundingSource[]>(saved?.otherSources ?? []);
  const [creditedLand, setCreditedLand] = useState<CreditedLandPlan | undefined>(saved?.creditedLand);
  const [permanentLoan, setPermanentLoan] = useState<PermanentLoanPlan | undefined>(saved?.permanentLoan);
  const [capitalAssumptionEvidence, setCapitalAssumptionEvidence] = useState(saved?.capitalAssumptionEvidence ?? {
    ...blankEvidenceRows(DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS, source),
    ...(seed?.targetDebtSharePercent ? { targetDebtSharePercent: seed.targetDebtSharePercent.evidence } : {}),
    ...(seed?.annualInterestRatePercent ? { annualInterestRatePercent: seed.annualInterestRatePercent.evidence } : {}),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!savedCase.costSchedule || !savedCase.apartmentOperations) {
    return (
      <section aria-labelledby="development-capital-heading">
        <h3 id="development-capital-heading">Development Capital</h3>
        <div className="empty empty--inline"><p>Save the development cost schedule and apartment operations before adding the capital plan.</p></div>
      </section>
    );
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/underwriting/cases/${savedCase.id}/capital`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: savedCase.caseRevision,
          capitalInputVersion: DEVELOPMENT_CAPITAL_INPUT_VERSION,
          targetDebtSharePercent,
          annualInterestRatePercent,
          loanFeePercent,
          fundingOrder: EQUITY_FIRST_FUNDING_VERSION,
          interestTreatment,
          interestConvention: OPENING_BALANCE_MONTHLY_VERSION,
          feeMonth,
          payoffMonth,
          ratePath: usePath ? ratePathFrom({ spreadPercent, curveSourceLabel, asOfDate, curveStartMonth, baseRates }) : null,
          otherSources: otherSources.length > 0 ? otherSources : null,
          creditedLand: creditedLand ?? null,
          permanentLoan: permanentLoan ?? null,
          capitalAssumptionEvidence,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The project changed in another session. Refresh the page, review the capital inputs, and try again."
          : body?.error ?? "The development capital inputs could not be saved.");
        setFieldErrors(body?.fieldErrors ?? {});
        return;
      }
      router.refresh();
    } catch {
      setError("The development capital request failed. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const updateEvidence = (key: DevelopmentCapitalAssumptionKey, update: Partial<DevelopmentCapitalEvidence>) => {
    setCapitalAssumptionEvidence((current) => ({ ...current, [key]: { ...current[key], ...update } }));
  };

  return (
    <form className="underwriting-capital-editor" onSubmit={save} noValidate><EditFieldset>
      <div className="underwriting-section-head">
        <div>
          <h3 id="development-capital-heading">Development Capital</h3>
          <p className="t-meta">Equity, construction debt, interest, and operating shortfall reserves follow one named monthly rule.</p>
        </div>
      </div>

      <div className="underwriting-form-grid underwriting-capital-controls">
        <NumberField id="capital-target-debt-share" label="Loan to Cost, % of Total Uses" hint="The engine solves the loan to this share of total uses, including interest, fees and operating shortfall. A lower lender NOI cap wins." value={targetDebtSharePercent} onChange={setTargetDebtSharePercent} error={fieldErrors.targetDebtSharePercent} suffix="%" />
        <NumberField id="capital-annual-interest-rate" label="Annual Construction Interest Rate" value={annualInterestRatePercent} onChange={setAnnualInterestRatePercent} error={fieldErrors.annualInterestRatePercent} suffix="%" />
        <NumberField id="capital-loan-fee" label="Loan Fee on Planned Project-Cost Debt" value={loanFeePercent} onChange={setLoanFeePercent} error={fieldErrors.loanFeePercent} suffix="%" />
        <MonthField id="capital-fee-month" label="Fee Month" value={feeMonth} onChange={setFeeMonth} error={fieldErrors.feeMonth} />
        <MonthField id="capital-payoff-month" label="Debt Payoff Month" value={payoffMonth} onChange={setPayoffMonth} error={fieldErrors.payoffMonth} />
        <ReadOnlyField label="Funding Order" value="Equity First" />
        <label className="field-label t-label" htmlFor="capital-interest-treatment">Interest Treatment<select id="capital-interest-treatment" className="input" value={interestTreatment} onChange={(event) => setInterestTreatment(event.target.value as InterestTreatment)} aria-invalid={Boolean(fieldErrors.interestTreatment)} aria-describedby={fieldErrors.interestTreatment ? "capital-interest-treatment-error" : undefined}>
          {Object.entries(INTEREST_TREATMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select><FieldError id="capital-interest-treatment-error" error={fieldErrors.interestTreatment} /></label>
        <ReadOnlyField label="Interest Convention" value="Opening Balance, Annual Rate Divided by 12" />
      </div>

      <section className="underwriting-line-section">
        <h4>Dated Rate Path</h4>
        <p className="t-meta">Off, the fixed annual rate above applies to every month. On, each month charges its base rate plus the spread. Months before the curve use its first rate, and months after it use its last rate.</p>
        <label className="field-label t-label"><span><input id="capital-use-rate-path" type="checkbox" checked={usePath} onChange={(event) => setUsePath(event.target.checked)} /> Use a Dated Rate Path</span></label>
        {usePath ? <>
          <div className="underwriting-form-grid underwriting-capital-controls">
            <label className="field-label t-label" htmlFor="capital-rate-spread">Spread Over Base Rate<span className="underwriting-money-input"><input id="capital-rate-spread" className="input num" type="number" min="-100" max="100" step="0.000001" value={spreadPercent} onChange={(event) => setSpreadPercent(event.target.value === "" ? "" : Number(event.target.value))} aria-invalid={Boolean(fieldErrors["ratePath.spreadPercent"])} /><span>%</span></span><FieldError error={fieldErrors["ratePath.spreadPercent"]} /></label>
            <label className="field-label t-label" htmlFor="capital-rate-source">Curve Source<input id="capital-rate-source" className="input" maxLength={MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH} value={curveSourceLabel} onChange={(event) => setCurveSourceLabel(event.target.value)} aria-invalid={Boolean(fieldErrors["ratePath.curveSourceLabel"])} /><FieldError error={fieldErrors["ratePath.curveSourceLabel"]} /></label>
            <label className="field-label t-label" htmlFor="capital-rate-as-of">Curve As-Of Date<input id="capital-rate-as-of" className="input num" type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} aria-invalid={Boolean(fieldErrors["ratePath.asOfDate"])} /><FieldError error={fieldErrors["ratePath.asOfDate"]} /></label>
            <MonthField id="capital-rate-start" label="First Curve Month" value={curveStartMonth} onChange={setCurveStartMonth} error={fieldErrors["ratePath.baseRates.0.month"]} />
          </div>
          <div className="underwriting-edit-table-wrap">
            <table className="underwriting-operations-table">
              <thead><tr><th>Month</th><th className="right">Base Rate</th></tr></thead>
              <tbody>{baseRates.map((rate, index) => {
                const error = fieldErrors[`ratePath.baseRates.${index}.baseRatePercent`];
                return <tr key={index}>
                  <th scope="row" className="num">{addMonths(curveStartMonth, index)}</th>
                  <td className="right"><input className="input num" type="number" step="0.000001" aria-label={`Base rate for ${addMonths(curveStartMonth, index)}`} value={rate} onChange={(event) => setBaseRates((current) => current.map((item, at) => at === index ? (event.target.value === "" ? "" : Number(event.target.value)) : item))} aria-invalid={Boolean(error)} /><FieldError error={error} /></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="underwriting-form-actions">
            <button className="btn" type="button" onClick={() => setBaseRates((current) => [...current, current[current.length - 1] ?? ""])}>Add Month</button>
            <button className="btn" type="button" disabled={baseRates.length <= 1} onClick={() => setBaseRates((current) => current.slice(0, -1))}>Remove Last Month</button>
          </div>
        </> : null}
      </section>

      <OtherSourcesSection
        sources={otherSources}
        setSources={setOtherSources}
        creditedLand={creditedLand}
        setCreditedLand={setCreditedLand}
        defaultMonth={feeMonth}
        source={source}
        fieldErrors={fieldErrors}
      />

      <PermanentLoanSection
        permanentLoan={permanentLoan}
        setPermanentLoan={setPermanentLoan}
        milestones={savedCase.costSchedule.milestones ?? []}
        defaultMonth={payoffMonth}
        hasCommercial={Boolean(savedCase.apartmentOperations.commercial?.spaces.length)}
        source={source}
        fieldErrors={fieldErrors}
      />

      <section className="underwriting-line-section">
        <h4>Capital Assumption Sources</h4>
        <p className="t-meta">Each term keeps its source, date, and review state. The formula choices stay visible with every run.</p>
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table underwriting-assumption-evidence">
            <thead><tr><th>Assumption</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead>
            <tbody>{DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS.map((key) => {
              const path = `capitalAssumptionEvidence.${key}`;
              const sourceLabelError = fieldErrors[`${path}.sourceLabel`];
              const sourceDateError = fieldErrors[`${path}.sourceDate`];
              const reviewStateError = fieldErrors[`${path}.reviewState`];
              return <tr key={key}>
                <th scope="row">{LABELS[key]}</th>
                <td><input className="input" id={`capital-evidence-${key}-source-label`} maxLength={MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH} aria-label={`${LABELS[key]} source label`} value={capitalAssumptionEvidence[key].sourceLabel ?? ""} onChange={(event) => updateEvidence(key, { sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(sourceLabelError)} aria-describedby={sourceLabelError ? `capital-evidence-${key}-source-label-error` : undefined} /><FieldError id={`capital-evidence-${key}-source-label-error`} error={sourceLabelError} /></td>
                <td><input className="input" id={`capital-evidence-${key}-source-date`} type="date" aria-label={`${LABELS[key]} source date`} value={capitalAssumptionEvidence[key].sourceDate ?? ""} onChange={(event) => updateEvidence(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(sourceDateError)} aria-describedby={sourceDateError ? `capital-evidence-${key}-source-date-error` : undefined} /><FieldError id={`capital-evidence-${key}-source-date-error`} error={sourceDateError} /></td>
                <td><select className="input" id={`capital-evidence-${key}-review-state`} aria-label={`${LABELS[key]} review state`} value={capitalAssumptionEvidence[key].reviewState} onChange={(event) => updateEvidence(key, { reviewState: event.target.value as "working" | "done" })} aria-invalid={Boolean(reviewStateError)} aria-describedby={reviewStateError ? `capital-evidence-${key}-review-state-error` : undefined}><option value="working">Working on It</option><option value="done">Done</option></select><FieldError id={`capital-evidence-${key}-review-state-error`} error={reviewStateError} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}
      <div className="underwriting-form-actions">
        {canEdit ? <button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Capital Plan" : "Save Capital Plan"}</button> : null}
      </div>
    </EditFieldset></form>
  );
}

const INTEREST_TREATMENT_LABELS: Record<InterestTreatment, string> = {
  [CAPITALIZED_NET_OPERATING_CASH_VERSION]: "Operating Cash First, Then Capitalized",
  [CAPITALIZED_GROSS_INTEREST_VERSION]: "Full Interest Reserve, Lease-Up Cash to Equity",
};

const LABELS: Record<DevelopmentCapitalAssumptionKey, string> = {
  targetDebtSharePercent: "Loan to Cost, % of Total Uses",
  annualInterestRatePercent: "Annual Interest Rate",
  loanFeePercent: "Loan Fee",
  fundingOrder: "Funding Order",
  interestTreatment: "Interest Treatment",
  interestConvention: "Interest Convention",
  feeMonth: "Fee Month",
  payoffMonth: "Payoff Month",
};

function NumberField({ id, label, hint, value, onChange, error, suffix }: { id: string; label: string; hint?: string; value: number | ""; onChange: (value: number | "") => void; error?: string; suffix: string }) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  return <label className="field-label t-label" htmlFor={id}>{label}<span className="underwriting-money-input"><input id={id} className="input num" type="number" min="0" max="100" step="0.000001" value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={[hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined} /><span>{suffix}</span></span>{hint ? <span id={hintId} className="t-meta">{hint}</span> : null}<FieldError id={errorId} error={error} /></label>;
}

function MonthField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<input id={id} className="input num" type="month" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><FieldError id={errorId} error={error} /></label>;
}

function addMonths(start: string, offset: number) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(start);
  if (!match) return "";
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function ratePathFrom(form: { spreadPercent: number | ""; curveSourceLabel: string; asOfDate: string; curveStartMonth: string; baseRates: Array<number | ""> }) {
  return {
    baseRates: form.baseRates.map((baseRatePercent, index) => ({ month: addMonths(form.curveStartMonth, index), baseRatePercent })),
    spreadPercent: form.spreadPercent,
    curveSourceLabel: form.curveSourceLabel,
    asOfDate: form.asOfDate,
  } as unknown as DevelopmentCapitalRatePath;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <label className="field-label t-label">{label}<input className="input" value={value} readOnly /></label>;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

async function responseBody(response: Response) {
  try {
    return await response.json() as { error?: string; fieldErrors?: Record<string, string> };
  } catch {
    return undefined;
  }
}
