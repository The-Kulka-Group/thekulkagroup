"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  FORWARD_TWELVE_MONTH_NOI_VERSION,
  LENDER_TEST_ASSUMPTION_KEYS,
  LENDER_TESTS_INPUT_VERSION,
  MAX_LENDER_TEST_SOURCE_LABEL_LENGTH,
  MONTH_END_CASH_FLOW_DATES_VERSION,
  MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH,
  PROPERTY_RETURNS_ASSUMPTION_KEYS,
  PROPERTY_RETURNS_INPUT_VERSION,
  SALE_TAX_ASSUMPTION_KEYS,
  SALE_TAX_INPUT_VERSION,
  XIRR_ACTUAL_365_VERSION,
  type LenderTestAssumptionKey,
  type LenderTestEvidence,
  type LenderTestNoiBasis,
  type LoanSizingPlan,
  type PropertyReturnsAssumptionKey,
  type PropertyReturnsEvidence,
  type SaleTaxAssumptionKey,
  type SaleTaxValueBasis,
} from "@kulka/engine";

import type { UnderwritingCase } from "@/lib/underwriting/cases";

export function PropertyReturnsEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const saved = savedCase.propertyReturns;
  const [terminalCapRatePercent, setTerminalCapRatePercent] = useState<number | "">(saved?.terminalCapRatePercent ?? "");
  const [sellingCostPercent, setSellingCostPercent] = useState<number | "">(saved?.sellingCostPercent ?? "");
  const [saleAssumptionEvidence, setSaleAssumptionEvidence] = useState(saved?.saleAssumptionEvidence ?? blankEvidence());
  const savedLender = saved?.lenderTests;
  const [lenderEnabled, setLenderEnabled] = useState(Boolean(savedLender));
  const [valuationMonth, setValuationMonth] = useState(savedLender?.valuationMonth ?? "");
  const [asStabilizedCapRatePercent, setAsStabilizedCapRatePercent] = useState<number | "">(savedLender?.asStabilizedCapRatePercent ?? "");
  const [annualDebtService, setAnnualDebtService] = useState<number | "">(savedLender?.annualDebtService ?? "");
  const [noiBasis, setNoiBasis] = useState<LenderTestNoiBasis>(savedLender?.noiBasis ?? "noi_before_reserves");
  const [lenderTestEvidence, setLenderTestEvidence] = useState(savedLender?.lenderTestEvidence ?? blankLenderEvidence());
  const savedSizing = savedLender?.loanSizing;
  const [sizingEnabled, setSizingEnabled] = useState(Boolean(savedSizing));
  const [noiTaxBasis, setNoiTaxBasis] = useState<LoanSizingPlan["noiTaxBasis"]>(savedSizing?.noiTaxBasis ?? "full_tax");
  const [maxLoanToValuePercent, setMaxLoanToValuePercent] = useState<number | "">(savedSizing?.maxLoanToValuePercent ?? "");
  const [minDebtYieldPercent, setMinDebtYieldPercent] = useState<number | "">(savedSizing?.minDebtYieldPercent ?? "");
  const [minDebtServiceCoverage, setMinDebtServiceCoverage] = useState<number | "">(savedSizing?.minDebtServiceCoverage ?? "");
  const [dscrRatePercent, setDscrRatePercent] = useState<number | "">(savedSizing?.dscrRatePercent ?? "");
  const [dscrAmortizationYears, setDscrAmortizationYears] = useState<number | "">(savedSizing?.dscrAmortizationYears ?? "");
  const [sizingEvidence, setSizingEvidence] = useState<LenderTestEvidence>(savedSizing?.evidence ?? { reviewState: "working" });
  const savedSaleTax = saved?.saleTax;
  const [saleTaxBasis, setSaleTaxBasis] = useState<SaleTaxValueBasis>(savedSaleTax?.valueBasis ?? "scheduled_tax");
  const [abatementDiscountRatePercent, setAbatementDiscountRatePercent] = useState<number | "">(savedSaleTax?.abatementDiscountRatePercent ?? "");
  const [saleTaxEvidence, setSaleTaxEvidence] = useState({ ...blankSaleTaxEvidence(), ...savedSaleTax?.saleTaxEvidence });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  if (!savedCase.costSchedule || !savedCase.apartmentOperations || !savedCase.developmentCapital) {
    return <section aria-labelledby="property-returns-heading"><h3 id="property-returns-heading">Property Sale and Returns</h3><div className="empty empty--inline"><p>Save the cost schedule, apartment operations, and capital plan before adding sale terms.</p></div></section>;
  }

  const hasAbatement = savedCase.apartmentOperations.propertyTax?.mode === "abatement";
  const usesDiscountRate = saleTaxBasis === "full_tax_plus_abatement_value";

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
          ...(lenderEnabled ? {
            lenderTests: {
              lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
              valuationMonth,
              asStabilizedCapRatePercent,
              annualDebtService,
              noiBasis,
              lenderTestEvidence,
              ...(sizingEnabled ? {
                loanSizing: {
                  noiTaxBasis,
                  ...(maxLoanToValuePercent === "" ? {} : { maxLoanToValuePercent }),
                  ...(minDebtYieldPercent === "" ? {} : { minDebtYieldPercent }),
                  ...(minDebtServiceCoverage === "" ? {} : {
                    minDebtServiceCoverage,
                    dscrRatePercent: dscrRatePercent === "" ? undefined : dscrRatePercent,
                    dscrAmortizationYears: dscrAmortizationYears === "" ? undefined : dscrAmortizationYears,
                  }),
                  evidence: sizingEvidence,
                },
              } : {}),
            },
          } : {}),
          ...(hasAbatement ? {
            saleTax: {
              saleTaxInputVersion: SALE_TAX_INPUT_VERSION,
              valueBasis: saleTaxBasis,
              ...(usesDiscountRate ? { abatementDiscountRatePercent } : {}),
              saleTaxEvidence: usesDiscountRate ? saleTaxEvidence : { valueBasis: saleTaxEvidence.valueBasis },
            },
          } : {}),
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

  const updateLenderEvidence = (key: LenderTestAssumptionKey, update: Partial<LenderTestEvidence>) => {
    setLenderTestEvidence((current) => ({ ...current, [key]: { ...current[key], ...update } }));
  };
  const lenderError = (key: LenderTestAssumptionKey) => fieldErrors[`lenderTests.${key}`];
  const updateSaleTaxEvidence = (key: SaleTaxAssumptionKey, update: Partial<PropertyReturnsEvidence>) => {
    setSaleTaxEvidence((current) => ({ ...current, [key]: { ...current[key], ...update } }));
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
          return <tr key={key}><th scope="row">{LABELS[key]}</th><td><input className="input" id={labelId} aria-label={`${LABELS[key]} source label`} maxLength={MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH} value={saleAssumptionEvidence[key].sourceLabel ?? ""} onChange={(event) => updateEvidence(key, { sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[labelPath])} aria-describedby={fieldErrors[labelPath] ? `${labelId}-error` : undefined} /><FieldError id={`${labelId}-error`} error={fieldErrors[labelPath]} /></td><td><input className="input" id={dateId} type="date" aria-label={`${LABELS[key]} source date`} value={saleAssumptionEvidence[key].sourceDate ?? ""} onChange={(event) => updateEvidence(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[datePath])} aria-describedby={fieldErrors[datePath] ? `${dateId}-error` : undefined} /><FieldError id={`${dateId}-error`} error={fieldErrors[datePath]} /></td><td><select className="input" id={stateId} aria-label={`${LABELS[key]} review state`} value={saleAssumptionEvidence[key].reviewState} onChange={(event) => updateEvidence(key, { reviewState: event.target.value as "working" | "done" })} aria-invalid={Boolean(fieldErrors[statePath])} aria-describedby={fieldErrors[statePath] ? `${stateId}-error` : undefined}><option value="working">Working on It</option><option value="done">Done</option></select><FieldError id={`${stateId}-error`} error={fieldErrors[statePath]} /></td></tr>;
        })}
      </tbody></table></div>
    </section>
    {hasAbatement ? <section className="underwriting-line-section" aria-labelledby="sale-tax-heading">
      <h4 id="sale-tax-heading">Sale Tax Basis</h4>
      <p className="t-meta">The tax schedule carries an abatement, so the sale states which tax it prices. Full tax plus abatement value caps NOI with no abatement, then adds the present value of the tax the abatement still saves after the sale.</p>
      <div className="underwriting-form-grid underwriting-capital-controls">
        <label className="field-label t-label" htmlFor="sale-tax-basis">Sale Prices<select id="sale-tax-basis" className="input" value={saleTaxBasis} onChange={(event) => setSaleTaxBasis(event.target.value as SaleTaxValueBasis)} aria-invalid={Boolean(fieldErrors["saleTax.valueBasis"])} aria-describedby={fieldErrors["saleTax.valueBasis"] ? "sale-tax-basis-error" : undefined}><option value="scheduled_tax">Scheduled Tax</option><option value="full_tax">Full Tax</option><option value="full_tax_plus_abatement_value">Full Tax Plus Abatement Value</option></select><FieldError id="sale-tax-basis-error" error={fieldErrors["saleTax.valueBasis"]} /></label>
        {usesDiscountRate ? <NumberField id="sale-tax-discount-rate" label="Abatement Discount Rate" value={abatementDiscountRatePercent} onChange={setAbatementDiscountRatePercent} error={fieldErrors["saleTax.abatementDiscountRatePercent"]} /> : null}
      </div>
      <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-assumption-evidence"><thead><tr><th>Sale Tax Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>
        {SALE_TAX_ASSUMPTION_KEYS.filter((key) => usesDiscountRate || key === "valueBasis").map((key) => {
          const path = `saleTax.saleTaxEvidence.${key}`;
          const id = `sale-tax-evidence-${key}`;
          const evidence = saleTaxEvidence[key];
          return <tr key={key}><th scope="row">{SALE_TAX_LABELS[key]}</th><td><input className="input" id={`${id}-source-label`} aria-label={`${SALE_TAX_LABELS[key]} source label`} maxLength={MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH} value={evidence.sourceLabel ?? ""} onChange={(event) => updateSaleTaxEvidence(key, { sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceLabel`])} /><FieldError error={fieldErrors[`${path}.sourceLabel`]} /></td><td><input className="input" id={`${id}-source-date`} type="date" aria-label={`${SALE_TAX_LABELS[key]} source date`} value={evidence.sourceDate ?? ""} onChange={(event) => updateSaleTaxEvidence(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceDate`])} /><FieldError error={fieldErrors[`${path}.sourceDate`]} /></td><td><select className="input" id={`${id}-review-state`} aria-label={`${SALE_TAX_LABELS[key]} review state`} value={evidence.reviewState} onChange={(event) => updateSaleTaxEvidence(key, { reviewState: event.target.value as "working" | "done" })}><option value="working">Working on It</option><option value="done">Done</option></select></td></tr>;
        })}
      </tbody></table></div>
    </section> : null}
    <section className="underwriting-line-section" aria-labelledby="lender-tests-heading">
      <h4 id="lender-tests-heading">Lender Tests</h4>
      <p className="t-meta">A lender values the stabilized year and tests the construction loan against value, cost and debt service. The tests report on the loan. Loan Sizing below can also size it.</p>
      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={lenderEnabled} onChange={(event) => setLenderEnabled(event.target.checked)} /> Add Lender Tests</label>
      {lenderEnabled ? <>
        <div className="underwriting-form-grid underwriting-capital-controls">
          <MonthField id="lender-valuation-month" label="Valuation Year Starts" value={valuationMonth} onChange={setValuationMonth} error={lenderError("valuationMonth")} />
          <NumberField id="lender-cap-rate" label="As-Stabilized Cap Rate" value={asStabilizedCapRatePercent} onChange={setAsStabilizedCapRatePercent} error={lenderError("asStabilizedCapRatePercent")} />
          <MoneyField id="lender-debt-service" label="Annual Debt Service" value={annualDebtService} onChange={setAnnualDebtService} error={lenderError("annualDebtService")} />
          <label className="field-label t-label" htmlFor="lender-noi-basis">NOI Basis<select id="lender-noi-basis" className="input" value={noiBasis} onChange={(event) => setNoiBasis(event.target.value as LenderTestNoiBasis)} aria-invalid={Boolean(lenderError("noiBasis"))} aria-describedby={lenderError("noiBasis") ? "lender-noi-basis-error" : undefined}><option value="noi_before_reserves">NOI Before Reserves</option><option value="noi_after_reserves">NOI After Reserves</option></select><FieldError id="lender-noi-basis-error" error={lenderError("noiBasis")} /></label>
        </div>
        <h4>Lender Test Sources</h4>
        <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-assumption-evidence"><thead><tr><th>Lender Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>
          {LENDER_TEST_ASSUMPTION_KEYS.map((key) => {
            const labelPath = `lenderTests.lenderTestEvidence.${key}.sourceLabel`;
            const datePath = `lenderTests.lenderTestEvidence.${key}.sourceDate`;
            const statePath = `lenderTests.lenderTestEvidence.${key}.reviewState`;
            const labelId = `lender-evidence-${key}-source-label`;
            const dateId = `lender-evidence-${key}-source-date`;
            const stateId = `lender-evidence-${key}-review-state`;
            return <tr key={key}><th scope="row">{LENDER_LABELS[key]}</th><td><input className="input" id={labelId} aria-label={`${LENDER_LABELS[key]} source label`} maxLength={MAX_LENDER_TEST_SOURCE_LABEL_LENGTH} value={lenderTestEvidence[key].sourceLabel ?? ""} onChange={(event) => updateLenderEvidence(key, { sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[labelPath])} aria-describedby={fieldErrors[labelPath] ? `${labelId}-error` : undefined} /><FieldError id={`${labelId}-error`} error={fieldErrors[labelPath]} /></td><td><input className="input" id={dateId} type="date" aria-label={`${LENDER_LABELS[key]} source date`} value={lenderTestEvidence[key].sourceDate ?? ""} onChange={(event) => updateLenderEvidence(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[datePath])} aria-describedby={fieldErrors[datePath] ? `${dateId}-error` : undefined} /><FieldError id={`${dateId}-error`} error={fieldErrors[datePath]} /></td><td><select className="input" id={stateId} aria-label={`${LENDER_LABELS[key]} review state`} value={lenderTestEvidence[key].reviewState} onChange={(event) => updateLenderEvidence(key, { reviewState: event.target.value as "working" | "done" })} aria-invalid={Boolean(fieldErrors[statePath])} aria-describedby={fieldErrors[statePath] ? `${stateId}-error` : undefined}><option value="working">Working on It</option><option value="done">Done</option></select><FieldError id={`${stateId}-error`} error={fieldErrors[statePath]} /></td></tr>;
          })}
        </tbody></table></div>
        {fieldErrors["lenderTests.lenderTestEvidence"] ? <p className="input-error" role="alert">{fieldErrors["lenderTests.lenderTestEvidence"]}</p> : null}
        <h4 id="loan-sizing-heading">Loan Sizing</h4>
        <p className="t-meta">The loan is the lesser of the capital plan&apos;s loan to cost and each cap set here. Leave a cap blank to skip it. Every cap reads the valuation year above.</p>
        <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={sizingEnabled} onChange={(event) => setSizingEnabled(event.target.checked)} /> Size the Loan on Lender Caps</label>
        {sizingEnabled ? <>
          <div className="underwriting-form-grid underwriting-capital-controls">
            <label className="field-label t-label" htmlFor="sizing-tax-basis">Size On<select id="sizing-tax-basis" className="input" value={noiTaxBasis} onChange={(event) => setNoiTaxBasis(event.target.value as LoanSizingPlan["noiTaxBasis"])} aria-invalid={Boolean(fieldErrors["lenderTests.loanSizing.noiTaxBasis"])} aria-describedby={fieldErrors["lenderTests.loanSizing.noiTaxBasis"] ? "sizing-tax-basis-error" : undefined}><option value="full_tax">Full Tax</option><option value="abated">Abated Tax</option></select><FieldError id="sizing-tax-basis-error" error={fieldErrors["lenderTests.loanSizing.noiTaxBasis"]} /></label>
            <NumberField id="sizing-max-ltv" label="Maximum Loan to Value" value={maxLoanToValuePercent} onChange={setMaxLoanToValuePercent} error={fieldErrors["lenderTests.loanSizing.maxLoanToValuePercent"]} />
            <NumberField id="sizing-min-debt-yield" label="Minimum Debt Yield" value={minDebtYieldPercent} onChange={setMinDebtYieldPercent} error={fieldErrors["lenderTests.loanSizing.minDebtYieldPercent"]} />
            <NumberField id="sizing-min-dscr" label="Minimum DSCR" suffix="x" max={10} value={minDebtServiceCoverage} onChange={setMinDebtServiceCoverage} error={fieldErrors["lenderTests.loanSizing.minDebtServiceCoverage"]} />
            {minDebtServiceCoverage !== "" ? <>
              <NumberField id="sizing-dscr-rate" label="DSCR Rate" value={dscrRatePercent} onChange={setDscrRatePercent} error={fieldErrors["lenderTests.loanSizing.dscrRatePercent"]} />
              <NumberField id="sizing-dscr-amortization" label="DSCR Amortization" suffix="Years" max={40} value={dscrAmortizationYears} onChange={setDscrAmortizationYears} error={fieldErrors["lenderTests.loanSizing.dscrAmortizationYears"]} />
            </> : null}
          </div>
          <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-assumption-evidence"><thead><tr><th>Sizing Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>
            <tr><th scope="row">Loan Sizing Terms</th><td><input className="input" id="sizing-evidence-source-label" aria-label="Loan sizing terms source label" maxLength={MAX_LENDER_TEST_SOURCE_LABEL_LENGTH} value={sizingEvidence.sourceLabel ?? ""} onChange={(event) => setSizingEvidence((current) => ({ ...current, sourceLabel: event.target.value || undefined }))} aria-invalid={Boolean(fieldErrors["lenderTests.loanSizing.evidence.sourceLabel"])} /><FieldError error={fieldErrors["lenderTests.loanSizing.evidence.sourceLabel"]} /></td><td><input className="input" id="sizing-evidence-source-date" type="date" aria-label="Loan sizing terms source date" value={sizingEvidence.sourceDate ?? ""} onChange={(event) => setSizingEvidence((current) => ({ ...current, sourceDate: event.target.value || undefined }))} aria-invalid={Boolean(fieldErrors["lenderTests.loanSizing.evidence.sourceDate"])} /><FieldError error={fieldErrors["lenderTests.loanSizing.evidence.sourceDate"]} /></td><td><select className="input" id="sizing-evidence-review-state" aria-label="Loan sizing terms review state" value={sizingEvidence.reviewState} onChange={(event) => setSizingEvidence((current) => ({ ...current, reviewState: event.target.value as "working" | "done" }))}><option value="working">Working on It</option><option value="done">Done</option></select></td></tr>
          </tbody></table></div>
          {fieldErrors["lenderTests.loanSizing"] ? <p className="input-error" role="alert">{fieldErrors["lenderTests.loanSizing"]}</p> : null}
        </> : null}
      </> : null}
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

function NumberField({ id, label, value, onChange, error, suffix = "%", max = 100 }: { id: string; label: string; value: number | ""; onChange: (value: number | "") => void; error?: string; suffix?: string; max?: number }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<span className="underwriting-money-input"><input id={id} className="input num" type="number" min="0" max={max} step="0.000001" value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><span>{suffix}</span></span><FieldError id={errorId} error={error} /></label>;
}

const SALE_TAX_LABELS: Record<SaleTaxAssumptionKey, string> = {
  valueBasis: "Sale Prices",
  abatementDiscountRatePercent: "Abatement Discount Rate",
};

const LENDER_LABELS: Record<LenderTestAssumptionKey, string> = {
  valuationMonth: "Valuation Year Starts",
  asStabilizedCapRatePercent: "As-Stabilized Cap Rate",
  annualDebtService: "Annual Debt Service",
  noiBasis: "NOI Basis",
};

function MonthField({ id, label, value, onChange, error }: { id: string; label: string; value: string; onChange: (value: string) => void; error?: string }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<input id={id} className="input num" type="month" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><FieldError id={errorId} error={error} /></label>;
}

function MoneyField({ id, label, value, onChange, error }: { id: string; label: string; value: number | ""; onChange: (value: number | "") => void; error?: string }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<span className="underwriting-money-input"><input id={id} className="input num" type="number" min="0" step="0.01" value={value} onChange={(event) => onChange(event.target.value === "" ? "" : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><span>USD</span></span><FieldError id={errorId} error={error} /></label>;
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

function blankSaleTaxEvidence() {
  return Object.fromEntries(SALE_TAX_ASSUMPTION_KEYS.map((key) => [key, { reviewState: "working" as const }])) as Record<SaleTaxAssumptionKey, PropertyReturnsEvidence>;
}

function blankLenderEvidence() {
  return Object.fromEntries(LENDER_TEST_ASSUMPTION_KEYS.map((key) => [key, { reviewState: "working" as const }])) as Record<LenderTestAssumptionKey, LenderTestEvidence>;
}

async function responseBody(response: Response) {
  try {
    return await response.json() as { error?: string; fieldErrors?: Record<string, string> };
  } catch {
    return undefined;
  }
}
