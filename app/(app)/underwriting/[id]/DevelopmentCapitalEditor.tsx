"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CAPITALIZED_NET_OPERATING_CASH_VERSION,
  DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS,
  DEVELOPMENT_CAPITAL_INPUT_VERSION,
  EQUITY_FIRST_FUNDING_VERSION,
  MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH,
  OPENING_BALANCE_MONTHLY_VERSION,
  type DevelopmentCapitalAssumptionKey,
  type DevelopmentCapitalEvidence,
} from "@kulka/engine";

import type { UnderwritingCase } from "@/lib/underwriting/cases";

export function DevelopmentCapitalEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const saved = savedCase.developmentCapital;
  const [targetDebtSharePercent, setTargetDebtSharePercent] = useState<number | "">(saved?.targetDebtSharePercent ?? "");
  const [annualInterestRatePercent, setAnnualInterestRatePercent] = useState<number | "">(saved?.annualInterestRatePercent ?? "");
  const [loanFeePercent, setLoanFeePercent] = useState<number | "">(saved?.loanFeePercent ?? "");
  const [feeMonth, setFeeMonth] = useState(saved?.feeMonth ?? savedCase.costSchedule?.analysisStartMonth ?? "");
  const [payoffMonth, setPayoffMonth] = useState(saved?.payoffMonth ?? savedCase.costSchedule?.saleMonth ?? "");
  const [capitalAssumptionEvidence, setCapitalAssumptionEvidence] = useState(saved?.capitalAssumptionEvidence ?? blankEvidence());
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
          interestTreatment: CAPITALIZED_NET_OPERATING_CASH_VERSION,
          interestConvention: OPENING_BALANCE_MONTHLY_VERSION,
          feeMonth,
          payoffMonth,
          capitalAssumptionEvidence,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The case changed in another session. Refresh the page, review the capital inputs, and try again."
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
    <form className="underwriting-capital-editor" onSubmit={save} noValidate>
      <div className="underwriting-section-head">
        <div>
          <h3 id="development-capital-heading">Development Capital</h3>
          <p className="t-meta">Equity, construction debt, interest, and operating shortfall reserves follow one named monthly rule.</p>
        </div>
      </div>

      <div className="underwriting-form-grid underwriting-capital-controls">
        <NumberField id="capital-target-debt-share" label="Target debt share of total uses" value={targetDebtSharePercent} onChange={setTargetDebtSharePercent} error={fieldErrors.targetDebtSharePercent} suffix="%" />
        <NumberField id="capital-annual-interest-rate" label="Annual construction interest rate" value={annualInterestRatePercent} onChange={setAnnualInterestRatePercent} error={fieldErrors.annualInterestRatePercent} suffix="%" />
        <NumberField id="capital-loan-fee" label="Loan fee on planned project-cost debt" value={loanFeePercent} onChange={setLoanFeePercent} error={fieldErrors.loanFeePercent} suffix="%" />
        <MonthField id="capital-fee-month" label="Fee month" value={feeMonth} onChange={setFeeMonth} error={fieldErrors.feeMonth} />
        <MonthField id="capital-payoff-month" label="Debt payoff month" value={payoffMonth} onChange={setPayoffMonth} error={fieldErrors.payoffMonth} />
        <ReadOnlyField label="Funding order" value="Equity First" />
        <ReadOnlyField label="Interest treatment" value="Operating Cash First, Then Capitalized" />
        <ReadOnlyField label="Interest convention" value="Opening Balance, Annual Rate Divided By 12" />
      </div>

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
                <td><select className="input" id={`capital-evidence-${key}-review-state`} aria-label={`${LABELS[key]} review state`} value={capitalAssumptionEvidence[key].reviewState} onChange={(event) => updateEvidence(key, { reviewState: event.target.value as "working" | "done" })} aria-invalid={Boolean(reviewStateError)} aria-describedby={reviewStateError ? `capital-evidence-${key}-review-state-error` : undefined}><option value="working">Working on it</option><option value="done">Done</option></select><FieldError id={`capital-evidence-${key}-review-state-error`} error={reviewStateError} /></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}
      <div className="underwriting-form-actions">
        <button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Capital Plan" : "Save Capital Plan"}</button>
      </div>
    </form>
  );
}

const LABELS: Record<DevelopmentCapitalAssumptionKey, string> = {
  targetDebtSharePercent: "Target Debt Share",
  annualInterestRatePercent: "Annual Interest Rate",
  loanFeePercent: "Loan Fee",
  fundingOrder: "Funding Order",
  interestTreatment: "Interest Treatment",
  interestConvention: "Interest Convention",
  feeMonth: "Fee Month",
  payoffMonth: "Payoff Month",
};

function NumberField({ id, label, value, onChange, error, suffix }: { id: string; label: string; value: number | ""; onChange: (value: number | "") => void; error?: string; suffix: string }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<span className="underwriting-money-input"><input id={id} className="input num" type="number" min="0" max="100" step="0.000001" value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><span>{suffix}</span></span><FieldError id={errorId} error={error} /></label>;
}

function MonthField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<input id={id} className="input num" type="month" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><FieldError id={errorId} error={error} /></label>;
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return <label className="field-label t-label">{label}<input className="input" value={value} readOnly /></label>;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

function blankEvidence() {
  return Object.fromEntries(DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS.map((key) => [
    key,
    { reviewState: "working" as const },
  ])) as Record<DevelopmentCapitalAssumptionKey, DevelopmentCapitalEvidence>;
}

async function responseBody(response: Response) {
  try {
    return await response.json() as { error?: string; fieldErrors?: Record<string, string> };
  } catch {
    return undefined;
  }
}
