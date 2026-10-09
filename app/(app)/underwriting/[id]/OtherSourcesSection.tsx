"use client";

import { GroupedNumberInput } from "@/components/GroupedNumberInput";
import {
  MAX_OTHER_SOURCES,
  MAX_OTHER_SOURCE_DRAWS,
  MAX_OTHER_SOURCE_TEXT_LENGTH,
  type CreditedLandPlan,
  type OtherFundingSource,
  type OtherSourceKind,
} from "@kulka/engine";

/**
 * Grants, soft loans and credited land beside equity and the senior loan (LA-1813). The parent
 * keeps the state and sends it with the capital plan, so a save and a run read one set of values.
 */
export function OtherSourcesSection({ sources, setSources, creditedLand, setCreditedLand, defaultMonth, fieldErrors }: {
  sources: OtherFundingSource[];
  setSources: (sources: OtherFundingSource[]) => void;
  creditedLand?: CreditedLandPlan;
  setCreditedLand: (land?: CreditedLandPlan) => void;
  defaultMonth: string;
  fieldErrors: Record<string, string>;
}) {
  const update = (index: number, change: Partial<OtherFundingSource>) =>
    setSources(sources.map((source, position) => position === index ? { ...source, ...change } : source));
  const add = (kind: OtherSourceKind) => setSources([...sources, blankSource(kind, sources, defaultMonth)]);

  return (
    <section className="underwriting-line-section" aria-labelledby="other-sources-heading">
      <div className="underwriting-section-head">
        <div>
          <h4 id="other-sources-heading">Grants and Soft Loans</h4>
          <p className="t-meta">Each source brings cash in its own draw months. That cash funds costs first, then equity, then construction debt, so each source cuts the equity needed at the target debt share. A soft loan accrues interest on its balance and repays principal and interest in one month. The project costs must use every draw, or the run fails.</p>
        </div>
        <div className="underwriting-form-actions">
          <button className="btn btn--secondary" type="button" disabled={sources.length >= MAX_OTHER_SOURCES} onClick={() => add("grant")}>Add Grant</button>
          <button className="btn btn--secondary" type="button" disabled={sources.length >= MAX_OTHER_SOURCES} onClick={() => add("soft_loan")}>Add Soft Loan</button>
        </div>
      </div>
      {fieldErrors.otherSources ? <p className="input-error" role="alert">{fieldErrors.otherSources}</p> : null}
      {sources.map((source, index) => {
        const path = `otherSources.${index}`;
        const loan = source.kind === "soft_loan";
        const changeKind = (kind: OtherSourceKind) => kind === "grant"
          ? update(index, { kind, annualInterestRatePercent: undefined, repaymentMonth: undefined })
          : update(index, { kind, annualInterestRatePercent: source.annualInterestRatePercent ?? 0, repaymentMonth: source.repaymentMonth ?? defaultMonth });
        const updateDraw = (drawIndex: number, change: Partial<OtherFundingSource["draws"][number]>) =>
          update(index, { draws: source.draws.map((item, at) => at === drawIndex ? { ...item, ...change } : item) });
        return <fieldset className="underwriting-other-source" key={source.id}>
          <legend>{source.name || (loan ? "Soft Loan" : "Grant")}</legend>
          <div className="underwriting-form-grid underwriting-capital-controls">
            <label className="field-label t-label" htmlFor={`other-source-${index}-name`}>Name<input id={`other-source-${index}-name`} className="input" maxLength={MAX_OTHER_SOURCE_TEXT_LENGTH} value={source.name} onChange={(event) => update(index, { name: event.target.value })} aria-invalid={Boolean(fieldErrors[`${path}.name`])} /><FieldError error={fieldErrors[`${path}.name`] ?? fieldErrors[`${path}.id`] ?? fieldErrors[path]} /></label>
            <label className="field-label t-label" htmlFor={`other-source-${index}-kind`}>Kind<select id={`other-source-${index}-kind`} className="input" value={source.kind} onChange={(event) => changeKind(event.target.value as OtherSourceKind)}><option value="grant">Grant</option><option value="soft_loan">Soft Loan</option></select><FieldError error={fieldErrors[`${path}.kind`]} /></label>
            {loan ? <>
              <label className="field-label t-label" htmlFor={`other-source-${index}-rate`}>Annual Interest Rate<span className="underwriting-money-input"><input id={`other-source-${index}-rate`} className="input num" type="number" min="0" max="100" step="0.000001" value={source.annualInterestRatePercent ?? ""} onChange={(event) => update(index, { annualInterestRatePercent: event.target.value === "" ? undefined : Number(event.target.value) })} aria-invalid={Boolean(fieldErrors[`${path}.annualInterestRatePercent`])} /><span>%</span></span><FieldError error={fieldErrors[`${path}.annualInterestRatePercent`]} /></label>
              <label className="field-label t-label" htmlFor={`other-source-${index}-repayment`}>Repayment Month<input id={`other-source-${index}-repayment`} className="input num" type="month" value={source.repaymentMonth ?? ""} onChange={(event) => update(index, { repaymentMonth: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.repaymentMonth`])} /><FieldError error={fieldErrors[`${path}.repaymentMonth`]} /></label>
            </> : null}
          </div>
          <div className="underwriting-edit-table-wrap">
            <table className="underwriting-operations-table">
              <thead><tr><th>Draw Month</th><th className="right">Amount</th><th>Action</th></tr></thead>
              <tbody>{source.draws.map((draw, drawIndex) => {
                const drawPath = `${path}.draws.${drawIndex}`;
                return <tr key={drawIndex}>
                  <td><input className="input num" type="month" aria-label={`${source.name || "Source"} draw ${drawIndex + 1} month`} value={draw.month} onChange={(event) => updateDraw(drawIndex, { month: event.target.value })} aria-invalid={Boolean(fieldErrors[`${drawPath}.month`])} /><FieldError error={fieldErrors[`${drawPath}.month`]} /></td>
                  <td className="right"><span className="underwriting-money-input"><GroupedNumberInput className="input num" aria-label={`${source.name || "Source"} draw ${drawIndex + 1} amount`} value={draw.amount} onValueChange={(plain) => updateDraw(drawIndex, { amount: toNumber(plain) })} aria-invalid={Boolean(fieldErrors[`${drawPath}.amount`])} /><span>USD</span></span><FieldError error={fieldErrors[`${drawPath}.amount`]} /></td>
                  <td><button className="btn" type="button" disabled={source.draws.length <= 1} onClick={() => update(index, { draws: source.draws.filter((_, at) => at !== drawIndex) })}>Remove Draw</button></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <FieldError error={fieldErrors[`${path}.draws`]} />
          <div className="underwriting-form-actions">
            <button className="btn" type="button" disabled={source.draws.length >= MAX_OTHER_SOURCE_DRAWS} onClick={() => update(index, { draws: [...source.draws, { month: source.draws.at(-1)?.month ?? defaultMonth, amount: 0 }] })}>Add Draw</button>
            <button className="btn" type="button" onClick={() => setSources(sources.filter((_, position) => position !== index))}>Remove {loan ? "Soft Loan" : "Grant"}</button>
          </div>
          <EvidenceFields id={`other-source-${index}`} path={path} item={source} fieldErrors={fieldErrors} onChange={(change) => update(index, change)} />
        </fieldset>;
      })}

      <div className="underwriting-section-head">
        <div>
          <h4 id="credited-land-heading">Credited Land</h4>
          <p className="t-meta">The land value the deal credits, kept apart from the cash land cost in the cost schedule. It is never cash spent. It counts as sponsor equity only if the deal counts it. Loan to cost shows on both bases.</p>
        </div>
      </div>
      <label className="field-label t-label underwriting-checkbox"><input id="credited-land-use" type="checkbox" checked={Boolean(creditedLand)} onChange={(event) => setCreditedLand(event.target.checked ? { creditedValue: 0, countsAsSponsorEquity: false, reviewState: "working" } : undefined)} /> Add Credited Land</label>
      {creditedLand ? <>
        <div className="underwriting-form-grid underwriting-capital-controls">
          <label className="field-label t-label" htmlFor="credited-land-value">Credited Land Value<span className="underwriting-money-input"><GroupedNumberInput id="credited-land-value" className="input num" value={creditedLand.creditedValue} onValueChange={(plain) => setCreditedLand({ ...creditedLand, creditedValue: toNumber(plain) })} aria-invalid={Boolean(fieldErrors["creditedLand.creditedValue"])} /><span>USD</span></span><FieldError error={fieldErrors["creditedLand.creditedValue"]} /></label>
          <label className="field-label t-label" htmlFor="credited-land-equity">Counts as Sponsor Equity<select id="credited-land-equity" className="input" value={creditedLand.countsAsSponsorEquity ? "yes" : "no"} onChange={(event) => setCreditedLand({ ...creditedLand, countsAsSponsorEquity: event.target.value === "yes" })}><option value="no">No</option><option value="yes">Yes</option></select><FieldError error={fieldErrors["creditedLand.countsAsSponsorEquity"]} /></label>
        </div>
        <EvidenceFields id="credited-land" path="creditedLand" item={creditedLand} fieldErrors={fieldErrors} onChange={(change) => setCreditedLand({ ...creditedLand, ...change })} />
      </> : null}
    </section>
  );
}

function EvidenceFields({ id, path, item, fieldErrors, onChange }: {
  id: string;
  path: string;
  item: { sourceLabel?: string; sourceDate?: string; reviewState: "working" | "done" };
  fieldErrors: Record<string, string>;
  onChange: (change: { sourceLabel?: string; sourceDate?: string; reviewState?: "working" | "done" }) => void;
}) {
  return <div className="underwriting-form-grid underwriting-capital-controls">
    <label className="field-label t-label" htmlFor={`${id}-source-label`}>Source Label<input id={`${id}-source-label`} className="input" maxLength={MAX_OTHER_SOURCE_TEXT_LENGTH} value={item.sourceLabel ?? ""} onChange={(event) => onChange({ sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceLabel`])} /><FieldError error={fieldErrors[`${path}.sourceLabel`]} /></label>
    <label className="field-label t-label" htmlFor={`${id}-source-date`}>Source Date<input id={`${id}-source-date`} className="input num" type="date" value={item.sourceDate ?? ""} onChange={(event) => onChange({ sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceDate`])} /><FieldError error={fieldErrors[`${path}.sourceDate`]} /></label>
    <label className="field-label t-label" htmlFor={`${id}-review-state`}>Review State<select id={`${id}-review-state`} className="input" value={item.reviewState} onChange={(event) => onChange({ reviewState: event.target.value as "working" | "done" })}><option value="working">Working on It</option><option value="done">Done</option></select><FieldError error={fieldErrors[`${path}.reviewState`]} /></label>
  </div>;
}

function FieldError({ error }: { error?: string }) {
  return error ? <span className="input-error" role="alert">{error}</span> : null;
}

/** An emptied box stays empty so the engine reports the missing amount, in place of a silent zero. */
function toNumber(value: string) {
  return (value === "" ? "" : Number(value)) as number;
}

function blankSource(kind: OtherSourceKind, existing: OtherFundingSource[], month: string): OtherFundingSource {
  let n = existing.length + 1;
  while (existing.some(({ id }) => id === `source-${n}`)) n += 1;
  return {
    id: `source-${n}`,
    name: "",
    kind,
    draws: [{ month, amount: 0 }],
    ...(kind === "soft_loan" ? { annualInterestRatePercent: 0, repaymentMonth: month } : {}),
    reviewState: "working",
  };
}
