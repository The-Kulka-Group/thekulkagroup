"use client";

import {
  MAX_PERMANENT_LOAN_FUNDING_OFFSET_MONTHS,
  MAX_PERMANENT_LOAN_SOURCE_LABEL_LENGTH,
  PERMANENT_LOAN_ASSUMPTION_KEYS,
  PERMANENT_LOAN_CAP_KEYS,
  PERMANENT_LOAN_INPUT_VERSION,
  type DevelopmentCapitalEvidence,
  type Milestone,
  type PermanentLoanAssumptionKey,
  type PermanentLoanCapKey,
  type PermanentLoanCashOut,
  type PermanentLoanFundingAnchor,
  type PermanentLoanNoiWindow,
  type PermanentLoanPlan,
  type PermanentLoanSizingMode,
} from "@kulka/engine";

import { PERMANENT_LOAN_EVIDENCE_LABELS as EVIDENCE_LABELS } from "./PermanentLoanResults";

const STABILIZATION = "__stabilization";
const TYPED = "__typed";

/**
 * The permanent loan that takes out the construction loan (LA-1869). The parent keeps the plan and
 * sends it with the capital plan, so a save and a run read one set of terms. Each term keeps its own
 * source and review state.
 */
export function PermanentLoanSection({ permanentLoan, setPermanentLoan, milestones, defaultMonth, hasCommercial = false, fieldErrors }: {
  permanentLoan?: PermanentLoanPlan;
  setPermanentLoan: (plan?: PermanentLoanPlan) => void;
  milestones: Milestone[];
  defaultMonth: string;
  /** The case has commercial spaces, so the LTV cap can value them at their own cap rate. */
  hasCommercial?: boolean;
  fieldErrors: Record<string, string>;
}) {
  const error = (path: string) => fieldErrors[`permanentLoan.${path}`];
  const update = (change: Partial<PermanentLoanPlan>) => permanentLoan && setPermanentLoan({ ...permanentLoan, ...change });
  const updateEvidence = (key: PermanentLoanAssumptionKey | PermanentLoanCapKey, change: Partial<DevelopmentCapitalEvidence>) => permanentLoan && update({
    evidence: { ...permanentLoan.evidence, [key]: { ...(permanentLoan.evidence[key] ?? { reviewState: "working" }), ...change } },
  });
  /** A cap that is set carries evidence; a cap that is cleared drops it. */
  const setCap = (key: PermanentLoanCapKey, value: number | undefined) => {
    if (!permanentLoan) return;
    const { [key]: _dropped, ...evidence } = permanentLoan.evidence;
    void _dropped;
    const { [key]: _old, ...rest } = permanentLoan;
    void _old;
    setPermanentLoan(value === undefined
      ? { ...rest, evidence } as PermanentLoanPlan
      : { ...rest, [key]: value, evidence: { ...evidence, [key]: permanentLoan.evidence[key] ?? { reviewState: "working" } } } as PermanentLoanPlan);
  };

  return <section className="underwriting-line-section" aria-labelledby="permanent-loan-heading">
    <h4 id="permanent-loan-heading">Permanent Loan</h4>
    <p className="t-meta">A permanent loan takes out the construction loan in its funding month instead of the sale month. The construction loan repays then, the permanent loan funds, and debt service runs monthly from operating cash. The balance repays at sale, which must fall on or before maturity. Without one, the construction loan repays in the payoff month.</p>
    <label className="field-label t-label underwriting-checkbox"><input id="permanent-loan-use" type="checkbox" checked={Boolean(permanentLoan)} onChange={(event) => setPermanentLoan(event.target.checked ? blankPlan() : undefined)} /> Add Permanent Loan</label>
    {permanentLoan ? <>
      <h4>Funding and Sizing</h4>
      <div className="underwriting-form-grid underwriting-capital-controls">
        <FundingField plan={permanentLoan} update={update} milestones={milestones} defaultMonth={defaultMonth} errors={[error("fundingMonth"), error("fundingAnchor"), error("fundingAnchor.offsetMonths")]} />
        <label className="field-label t-label" htmlFor="permanent-loan-sizing-mode">Sizing Mode<select id="permanent-loan-sizing-mode" className="input" value={permanentLoan.sizingMode} onChange={(event) => update({ sizingMode: event.target.value as PermanentLoanSizingMode })} aria-invalid={Boolean(error("sizingMode"))}><option value="lesser_of_tests">Lesser of the Tests</option><option value="construction_balance">Construction Balance</option></select><FieldError error={error("sizingMode")} /></label>
        <label className="field-label t-label" htmlFor="permanent-loan-window-kind">Sizing NOI Window<select id="permanent-loan-window-kind" className="input" value={permanentLoan.sizingNoiWindow.kind} onChange={(event) => update({ sizingNoiWindow: event.target.value === "forward_twelve" ? { kind: "forward_twelve" } : { kind: "trailing", months: blank() } })} aria-invalid={Boolean(error("sizingNoiWindow"))}><option value="trailing">Annualized Trailing NOI</option><option value="forward_twelve">Forward Twelve Months</option></select><FieldError error={error("sizingNoiWindow")} /></label>
        {permanentLoan.sizingNoiWindow.kind === "trailing"
          ? <NumberField id="permanent-loan-window-months" label="Trailing Months" value={permanentLoan.sizingNoiWindow.months} onChange={(value) => update({ sizingNoiWindow: { kind: "trailing", months: value } as PermanentLoanNoiWindow })} error={error("sizingNoiWindow.months")} suffix="Months" step="1" max={24} />
          : null}
        <label className="field-label t-label" htmlFor="permanent-loan-tax-basis">Size On<select id="permanent-loan-tax-basis" className="input" value={permanentLoan.noiTaxBasis} onChange={(event) => update({ noiTaxBasis: event.target.value as PermanentLoanPlan["noiTaxBasis"] })} aria-invalid={Boolean(error("noiTaxBasis"))}><option value="full_tax">Full Tax</option><option value="abated">Abated Tax</option></select><FieldError error={error("noiTaxBasis")} /></label>
        <label className="field-label t-label" htmlFor="permanent-loan-cash-out">Proceeds Above Payoff<select id="permanent-loan-cash-out" className="input" value={permanentLoan.cashOut} onChange={(event) => update({ cashOut: event.target.value as PermanentLoanCashOut })} aria-invalid={Boolean(error("cashOut"))}><option value="distribute">Distribute to Equity Holders</option><option value="limit_to_payoff">Cut the Loan to Payoff</option></select><FieldError error={error("cashOut")} /></label>
      </div>
      <p className="t-meta">Leave a cap empty to skip it. A commercial valuation cap rate values the commercial spaces separately in the loan-to-value test. Lesser of the tests takes the smallest cap that is set, so it needs at least one. A shortfall against the construction payoff is an equity paydown.</p>
      <div className="underwriting-form-grid underwriting-capital-controls">
        <OptionalField id="permanent-loan-max-ltv" label="Maximum Loan to Value" value={permanentLoan.maxLoanToValuePercent} onChange={(value) => setCap("maxLoanToValuePercent", value)} error={error("maxLoanToValuePercent")} suffix="%" max={100} />
        <OptionalField id="permanent-loan-valuation-cap" label="Valuation Cap Rate" value={permanentLoan.valuationCapRatePercent} onChange={(value) => setCap("valuationCapRatePercent", value)} error={error("valuationCapRatePercent")} suffix="%" max={100} />
        {hasCommercial || permanentLoan.commercialValuationCapRatePercent !== undefined
          ? <OptionalField id="permanent-loan-commercial-cap" label="Commercial Valuation Cap Rate" value={permanentLoan.commercialValuationCapRatePercent} onChange={(value) => setCap("commercialValuationCapRatePercent", value)} error={error("commercialValuationCapRatePercent")} suffix="%" max={100} />
          : null}
        <OptionalField id="permanent-loan-min-dscr" label="Minimum Debt Service Coverage" value={permanentLoan.minDebtServiceCoverage} onChange={(value) => setCap("minDebtServiceCoverage", value)} error={error("minDebtServiceCoverage")} suffix="x" max={10} />
        <OptionalField id="permanent-loan-min-debt-yield" label="Minimum Debt Yield" value={permanentLoan.minDebtYieldPercent} onChange={(value) => setCap("minDebtYieldPercent", value)} error={error("minDebtYieldPercent")} suffix="%" max={100} />
      </div>
      <h4>Loan Terms</h4>
      <div className="underwriting-form-grid underwriting-capital-controls">
        <NumberField id="permanent-loan-rate" label="Annual Interest Rate" value={permanentLoan.annualRatePercent} onChange={(value) => update({ annualRatePercent: value })} error={error("annualRatePercent")} suffix="%" max={100} />
        <NumberField id="permanent-loan-io-months" label="Interest-Only Months" value={permanentLoan.interestOnlyMonths} onChange={(value) => update({ interestOnlyMonths: value })} error={error("interestOnlyMonths")} suffix="Months" step="1" />
        <NumberField id="permanent-loan-amortization" label="Amortization" value={permanentLoan.amortizationYears} onChange={(value) => update({ amortizationYears: value })} error={error("amortizationYears")} suffix="Years" step="1" max={40} />
        <NumberField id="permanent-loan-term" label="Term" value={permanentLoan.termYears} onChange={(value) => update({ termYears: value })} error={error("termYears")} suffix="Years" step="1" max={40} />
        <NumberField id="permanent-loan-fee" label="Loan Fee" value={permanentLoan.feePercent} onChange={(value) => update({ feePercent: value })} error={error("feePercent")} suffix="%" max={99.999999} />
        <label className="field-label t-label" htmlFor="permanent-loan-closing-costs">Closing Costs<span className="underwriting-money-input"><input id="permanent-loan-closing-costs" className="input num" type="number" min="0" step="0.01" value={permanentLoan.closingCosts} onChange={(event) => update({ closingCosts: event.target.value === "" ? blank() : Number(event.target.value) })} aria-invalid={Boolean(error("closingCosts"))} aria-describedby={error("closingCosts") ? "permanent-loan-closing-costs-error" : undefined} /><span>USD</span></span><FieldError id="permanent-loan-closing-costs-error" error={error("closingCosts")} /></label>
      </div>
      <p className="t-meta">Zero amortization years is interest only for the whole term. The fee is a percent of the loan amount and the closing costs are fixed. Both come out of proceeds.</p>
      <h4>Permanent Loan Sources</h4>
      <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-assumption-evidence"><thead><tr><th>Permanent Loan Terms</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>
        {[...PERMANENT_LOAN_ASSUMPTION_KEYS, ...PERMANENT_LOAN_CAP_KEYS.filter((key) => permanentLoan[key] !== undefined)].map((key) => {
          const item = permanentLoan.evidence[key] ?? { reviewState: "working" as const };
          const path = `evidence.${key}`;
          return <tr key={key}><th scope="row">{EVIDENCE_LABELS[key]}</th>
            <td><input className="input" aria-label={`${EVIDENCE_LABELS[key]} source label`} maxLength={MAX_PERMANENT_LOAN_SOURCE_LABEL_LENGTH} value={item.sourceLabel ?? ""} onChange={(event) => updateEvidence(key, { sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(error(`${path}.sourceLabel`))} /><FieldError error={error(`${path}.sourceLabel`) ?? error(path)} /></td>
            <td><input className="input" type="date" aria-label={`${EVIDENCE_LABELS[key]} source date`} value={item.sourceDate ?? ""} onChange={(event) => updateEvidence(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(error(`${path}.sourceDate`))} /><FieldError error={error(`${path}.sourceDate`)} /></td>
            <td><select className="input" aria-label={`${EVIDENCE_LABELS[key]} review state`} value={item.reviewState} onChange={(event) => updateEvidence(key, { reviewState: event.target.value as "working" | "done" })} aria-invalid={Boolean(error(`${path}.reviewState`))}><option value="working">Working on It</option><option value="done">Done</option></select><FieldError error={error(`${path}.reviewState`)} /></td>
          </tr>;
        })}
      </tbody></table></div>
      <FieldError error={error("evidence")} />
    </> : null}
  </section>;
}

function blankPlan(): PermanentLoanPlan {
  return {
    permanentLoanInputVersion: PERMANENT_LOAN_INPUT_VERSION,
    fundingAnchor: { kind: "stabilization", offsetMonths: 0 },
    sizingMode: "lesser_of_tests",
    sizingNoiWindow: { kind: "trailing", months: blank() },
    noiTaxBasis: "full_tax",
    annualRatePercent: blank(),
    interestOnlyMonths: blank(),
    amortizationYears: blank(),
    termYears: blank(),
    feePercent: blank(),
    closingCosts: blank(),
    cashOut: "distribute",
    evidence: Object.fromEntries(PERMANENT_LOAN_ASSUMPTION_KEYS.map((key) => [key, { reviewState: "working" as const }])) as PermanentLoanPlan["evidence"],
  };
}

/** An empty box stays empty so the engine names the missing term, in place of a silent zero. */
function blank() {
  return "" as unknown as number;
}

function FundingField({ plan, update, milestones, defaultMonth, errors }: {
  plan: PermanentLoanPlan;
  update: (change: Partial<PermanentLoanPlan>) => void;
  milestones: Milestone[];
  defaultMonth: string;
  errors: Array<string | undefined>;
}) {
  const anchor = plan.fundingAnchor;
  const selected = anchor === undefined ? TYPED : "kind" in anchor ? STABILIZATION : anchor.milestoneId;
  const known = anchor === undefined || "kind" in anchor || milestones.some(({ id }) => id === anchor.milestoneId);
  const error = errors.find((item) => item !== undefined);
  const choose = (value: string) => {
    const offsetMonths = anchor ? anchor.offsetMonths : 0;
    if (value === TYPED) update({ fundingMonth: defaultMonth, fundingAnchor: undefined });
    else if (value === STABILIZATION) update({ fundingMonth: undefined, fundingAnchor: { kind: "stabilization", offsetMonths } });
    else update({ fundingMonth: undefined, fundingAnchor: { milestoneId: value, offsetMonths } });
  };
  const setOffset = (offsetMonths: number) => anchor && update({ fundingAnchor: { ...anchor, offsetMonths } as PermanentLoanFundingAnchor });
  return <div className="field-label t-label">
    <label htmlFor="permanent-loan-funding-source">Funding Month</label>
    <div className="underwriting-anchor-field">
      <select id="permanent-loan-funding-source" className="input" value={selected} onChange={(event) => choose(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? "permanent-loan-funding-error" : undefined}>
        <option value={TYPED}>Typed Month</option>
        <option value={STABILIZATION}>First Stabilized Month</option>
        {milestones.map((milestone) => <option value={milestone.id} key={milestone.id}>{milestone.name || "Unnamed Milestone"}</option>)}
        {anchor && !known && !("kind" in anchor) ? <option value={anchor.milestoneId}>Missing Milestone</option> : null}
      </select>
      {anchor
        ? <span className="underwriting-money-input"><input className="input num right" type="number" step="1" min={-MAX_PERMANENT_LOAN_FUNDING_OFFSET_MONTHS} max={MAX_PERMANENT_LOAN_FUNDING_OFFSET_MONTHS} aria-label="Funding month offset, in months after the start point" value={Number.isFinite(anchor.offsetMonths) ? anchor.offsetMonths : ""} onChange={(event) => setOffset(event.target.value === "" ? blank() : Number(event.target.value))} aria-invalid={Boolean(error)} /><span>Months</span></span>
        : <input className="input num" type="month" aria-label="Funding month" value={plan.fundingMonth ?? ""} onChange={(event) => update({ fundingMonth: event.target.value })} aria-invalid={Boolean(error)} />}
    </div>
    <FieldError id="permanent-loan-funding-error" error={error} />
  </div>;
}

function NumberField({ id, label, value, onChange, error, suffix, step = "0.000001", max }: { id: string; label: string; value: number; onChange: (value: number) => void; error?: string; suffix: string; step?: string; max?: number }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<span className="underwriting-money-input"><input id={id} className="input num" type="number" min="0" max={max} step={step} value={value} onChange={(event) => onChange(event.target.value === "" ? blank() : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><span>{suffix}</span></span><FieldError id={errorId} error={error} /></label>;
}

function OptionalField({ id, label, value, onChange, error, suffix, max }: { id: string; label: string; value?: number; onChange: (value?: number) => void; error?: string; suffix: string; max: number }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<span className="underwriting-money-input"><input id={id} className="input num" type="number" min="0" max={max} step="0.000001" value={value ?? ""} onChange={(event) => onChange(event.target.value === "" ? undefined : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><span>{suffix}</span></span><FieldError id={errorId} error={error} /></label>;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}
