"use client";

import {
  MAX_PARTNERSHIP_SOURCE_LABEL_LENGTH,
  MAX_PARTNERSHIP_TIERS,
  PARTNERSHIP_ASSUMPTION_KEYS,
  PARTNERSHIP_INPUT_VERSION,
  type PartnershipAssumptionKey,
  type PartnershipEvidence,
  type PartnershipFundingOrder,
  type PartnershipPlan,
  type PartnershipSplit,
  type PartnershipTier,
  type PreferredReturnAccrual,
} from "@kulka/engine";

/**
 * LP and GP funding and the distribution waterfall on levered cash flow (LA-1863). The parent keeps
 * the plan and sends it with the sale plan, so a save and a run read one set of terms.
 */
export function PartnershipSection({ partnership, setPartnership, fieldErrors }: {
  partnership?: PartnershipPlan;
  setPartnership: (plan?: PartnershipPlan) => void;
  fieldErrors: Record<string, string>;
}) {
  const update = (change: Partial<PartnershipPlan>) => partnership && setPartnership({ ...partnership, ...change });
  const updateTier = (index: number, change: Partial<PartnershipTier>) => partnership && update({
    tiers: partnership.tiers.map((tier, at) => at === index ? { ...tier, ...change } : tier),
  });
  const updateEvidence = (key: PartnershipAssumptionKey, change: Partial<PartnershipEvidence>) => partnership && update({
    partnershipEvidence: { ...partnership.partnershipEvidence, [key]: { ...(partnership.partnershipEvidence[key] ?? { reviewState: "working" }), ...change } },
  });
  const setPreferredReturn = (on: boolean) => {
    if (!partnership) return;
    const { preferredReturn: _dropped, ...evidence } = partnership.partnershipEvidence;
    void _dropped;
    setPartnership(on
      ? { ...partnership, preferredReturn: { ratePercent: blank(), accrual: "compound_monthly" }, partnershipEvidence: { ...evidence, preferredReturn: { reviewState: "working" } } }
      : { ...withoutPreferredReturn(partnership), partnershipEvidence: evidence });
  };
  const error = (path: string) => fieldErrors[`partnership.${path}`];

  return <section className="underwriting-line-section" aria-labelledby="partnership-heading">
    <h4 id="partnership-heading">Partnership Waterfall</h4>
    <p className="t-meta">The waterfall splits the run&apos;s levered cash flow between the LP and the GP. Each month&apos;s equity contribution splits by the funding order. Distributable cash pays any preferred return and then capital, then each tier until the LP reaches the tier&apos;s IRR, then the final split. In each tier the GP promote comes off the top, and the LP base share applies to the rest.</p>
    <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(partnership)} onChange={(event) => setPartnership(event.target.checked ? blankPlan() : undefined)} /> Add Partnership Waterfall</label>
    {partnership ? <>
      <div className="underwriting-form-grid underwriting-capital-controls">
        <PercentField id="partnership-lp-share" label="LP Funding Share" value={partnership.lpFundingSharePercent} onChange={(value) => update({ lpFundingSharePercent: value })} error={error("lpFundingSharePercent")} />
        <label className="field-label t-label" htmlFor="partnership-funding-order">Funding Order<select id="partnership-funding-order" className="input" value={partnership.fundingOrder} onChange={(event) => update({ fundingOrder: event.target.value as PartnershipFundingOrder })} aria-invalid={Boolean(error("fundingOrder"))}><option value="pari_passu">Pari Passu</option><option value="gp_first">GP First</option></select><FieldError error={error("fundingOrder")} /></label>
        <label className="field-label t-label" htmlFor="partnership-lp-entry">LP Entry Month<input id="partnership-lp-entry" className="input num" type="month" value={partnership.lpEntryMonth ?? ""} onChange={(event) => update({ lpEntryMonth: event.target.value || undefined })} aria-invalid={Boolean(error("lpEntryMonth"))} aria-describedby="partnership-lp-entry-help" /><span id="partnership-lp-entry-help" className="t-meta">Optional. The GP funds alone before it, and the LP pays the GP a catch-up in this month.</span><FieldError error={error("lpEntryMonth")} /></label>
      </div>
      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(partnership.preferredReturn)} onChange={(event) => setPreferredReturn(event.target.checked)} /> Pay a Preferred Return and Return Capital Before the Tiers</label>
      {partnership.preferredReturn ? <div className="underwriting-form-grid underwriting-capital-controls">
        <PercentField id="partnership-pref-rate" label="Preferred Return" value={partnership.preferredReturn.ratePercent} onChange={(value) => update({ preferredReturn: { ...partnership.preferredReturn!, ratePercent: value } })} error={error("preferredReturn.ratePercent")} />
        <label className="field-label t-label" htmlFor="partnership-pref-accrual">Accrual<select id="partnership-pref-accrual" className="input" value={partnership.preferredReturn.accrual} onChange={(event) => update({ preferredReturn: { ...partnership.preferredReturn!, accrual: event.target.value as PreferredReturnAccrual } })} aria-invalid={Boolean(error("preferredReturn.accrual"))}><option value="compound_monthly">Compound Monthly</option><option value="simple_monthly">Simple Monthly</option></select><FieldError error={error("preferredReturn.accrual")} /></label>
      </div> : null}
      <h4>IRR Hurdle Tiers</h4>
      <p className="t-meta">List tiers from the lowest LP IRR hurdle to the highest. Without a preferred return block, the first tier also returns capital.</p>
      <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table"><thead><tr><th>Tier</th><th className="right">LP IRR Hurdle</th><th className="right">GP Promote</th><th className="right">LP Base Share</th><th className="right">LP Share of Tier</th><th>Action</th></tr></thead><tbody>
        {partnership.tiers.map((tier, index) => <tr key={index}>
          <th scope="row">Tier {index + 1}</th>
          <td className="right"><PercentInput label={`Tier ${index + 1} LP IRR hurdle`} value={tier.lpIrrHurdlePercent} onChange={(value) => updateTier(index, { lpIrrHurdlePercent: value })} error={error(`tiers.${index}.lpIrrHurdlePercent`)} /></td>
          <td className="right"><PercentInput label={`Tier ${index + 1} GP promote`} value={tier.promotePercent} onChange={(value) => updateTier(index, { promotePercent: value })} error={error(`tiers.${index}.promotePercent`)} /></td>
          <td className="right"><PercentInput label={`Tier ${index + 1} LP base share`} value={tier.lpBaseSharePercent} onChange={(value) => updateTier(index, { lpBaseSharePercent: value })} error={error(`tiers.${index}.lpBaseSharePercent`)} /></td>
          <td className="num right">{lpShareLabel(tier)}</td>
          <td><button className="btn" type="button" onClick={() => update({ tiers: partnership.tiers.filter((_, at) => at !== index) })}>Remove Tier</button></td>
        </tr>)}
        <tr>
          <th scope="row">Final Split</th>
          <td className="t-meta">Above Every Hurdle</td>
          <td className="right"><PercentInput label="Final split GP promote" value={partnership.finalSplit.promotePercent} onChange={(value) => update({ finalSplit: { ...partnership.finalSplit, promotePercent: value } })} error={error("finalSplit.promotePercent")} /></td>
          <td className="right"><PercentInput label="Final split LP base share" value={partnership.finalSplit.lpBaseSharePercent} onChange={(value) => update({ finalSplit: { ...partnership.finalSplit, lpBaseSharePercent: value } })} error={error("finalSplit.lpBaseSharePercent")} /></td>
          <td className="num right">{lpShareLabel(partnership.finalSplit)}</td>
          <td />
        </tr>
      </tbody></table></div>
      <FieldError error={error("tiers")} />
      <div className="underwriting-form-actions"><button className="btn btn--secondary" type="button" disabled={partnership.tiers.length >= MAX_PARTNERSHIP_TIERS} onClick={() => update({ tiers: [...partnership.tiers, { lpIrrHurdlePercent: blank(), promotePercent: blank(), lpBaseSharePercent: blank() }] })}>Add Tier</button></div>
      <h4>Partnership Sources</h4>
      <div className="underwriting-edit-table-wrap"><table className="underwriting-operations-table underwriting-assumption-evidence"><thead><tr><th>Partnership Terms</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead><tbody>
        {PARTNERSHIP_ASSUMPTION_KEYS.filter((key) => key !== "preferredReturn" || partnership.preferredReturn).map((key) => {
          const item = partnership.partnershipEvidence[key] ?? { reviewState: "working" as const };
          const path = `partnershipEvidence.${key}`;
          return <tr key={key}><th scope="row">{EVIDENCE_LABELS[key]}</th>
            <td><input className="input" aria-label={`${EVIDENCE_LABELS[key]} source label`} maxLength={MAX_PARTNERSHIP_SOURCE_LABEL_LENGTH} value={item.sourceLabel ?? ""} onChange={(event) => updateEvidence(key, { sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(error(`${path}.sourceLabel`))} /><FieldError error={error(`${path}.sourceLabel`) ?? error(path)} /></td>
            <td><input className="input" type="date" aria-label={`${EVIDENCE_LABELS[key]} source date`} value={item.sourceDate ?? ""} onChange={(event) => updateEvidence(key, { sourceDate: event.target.value || undefined })} aria-invalid={Boolean(error(`${path}.sourceDate`))} /><FieldError error={error(`${path}.sourceDate`)} /></td>
            <td><select className="input" aria-label={`${EVIDENCE_LABELS[key]} review state`} value={item.reviewState} onChange={(event) => updateEvidence(key, { reviewState: event.target.value as "working" | "done" })}><option value="working">Working on It</option><option value="done">Done</option></select></td>
          </tr>;
        })}
      </tbody></table></div>
      <FieldError error={error("partnershipEvidence")} />
    </> : null}
  </section>;
}

const EVIDENCE_LABELS: Record<PartnershipAssumptionKey, string> = {
  funding: "Funding",
  preferredReturn: "Preferred Return",
  promoteTiers: "Tiers and Final Split",
};

function blankPlan(): PartnershipPlan {
  return {
    partnershipInputVersion: PARTNERSHIP_INPUT_VERSION,
    lpFundingSharePercent: blank(),
    fundingOrder: "pari_passu",
    tiers: [],
    finalSplit: { promotePercent: blank(), lpBaseSharePercent: blank() },
    partnershipEvidence: { funding: { reviewState: "working" }, promoteTiers: { reviewState: "working" } },
  };
}

function withoutPreferredReturn(plan: PartnershipPlan): PartnershipPlan {
  const { preferredReturn: _dropped, ...rest } = plan;
  void _dropped;
  return rest;
}

/** An empty box stays empty so the engine names the missing term, in place of a silent zero. */
function blank() {
  return "" as unknown as number;
}

function lpShareLabel(split: PartnershipSplit) {
  const lp = Number(split.lpBaseSharePercent);
  const promote = Number(split.promotePercent);
  if (String(split.lpBaseSharePercent) === "" || String(split.promotePercent) === "" || !Number.isFinite(lp) || !Number.isFinite(promote)) return "";
  return `${Math.round(lp * (100 - promote)) / 100}%`;
}

function PercentField({ id, label, value, onChange, error }: { id: string; label: string; value: number; onChange: (value: number) => void; error?: string }) {
  const errorId = `${id}-error`;
  return <label className="field-label t-label" htmlFor={id}>{label}<span className="underwriting-money-input"><input id={id} className="input num" type="number" min="0" max="100" step="0.000001" value={value} onChange={(event) => onChange(event.target.value === "" ? blank() : Number(event.target.value))} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} /><span>%</span></span><FieldError id={errorId} error={error} /></label>;
}

function PercentInput({ label, value, onChange, error }: { label: string; value: number; onChange: (value: number) => void; error?: string }) {
  return <><span className="underwriting-money-input"><input className="input num" type="number" min="0" max="100" step="0.000001" aria-label={label} value={value} onChange={(event) => onChange(event.target.value === "" ? blank() : Number(event.target.value))} aria-invalid={Boolean(error)} /><span>%</span></span><FieldError error={error} /></>;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}
