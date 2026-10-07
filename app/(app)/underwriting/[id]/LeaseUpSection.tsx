"use client";

import {
  MAX_OPERATION_SOURCE_LABEL_LENGTH,
  type LeaseTurnover,
  type OccupancyCap,
  type LeaseTurnoverBasis,
  type LeaseUpConcession,
  type LeaseUpConcessionTiming,
  type SeasonalAbsorption,
  type StabilizationRule,
} from "@kulka/engine";

type Evidence = { sourceLabel?: string; sourceDate?: string; reviewState: "working" | "done" };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const TIMINGS: Array<[LeaseUpConcessionTiming, string]> = [
  ["at_move_in", "At Move-In"],
  ["spread_over_term", "Spread Over the Lease Term"],
];

const TURNOVER_BASES: Array<[LeaseTurnoverBasis, string, string]> = [
  ["each_new_lease_once", "Each New Lease Once", "Each lease signed during lease-up expires once at the end of its term, and the share moves out. Renewed leases do not expire again during lease-up."],
  ["every_expiring_lease", "Every Expiring Lease", "Every lease expires at the end of every term, renewals included, and the share moves out each time."],
  ["net_units_gained", "Net Units Gained", "The share applies to the units the building gained one term earlier. Leases that refill moved-out units do not expire again during lease-up."],
];

/** Optional lease-up inputs (LA-1704, LA-1784, LA-1849). Each block left off keeps the engine's default behavior. */
export function LeaseUpSection({ concession, setConcession, seasonal, setSeasonal, occupancyCap, setOccupancyCap, vacancyPercent, rule, setRule, turnover, setTurnover, fieldErrors }: {
  concession?: LeaseUpConcession;
  setConcession: (value?: LeaseUpConcession) => void;
  seasonal?: SeasonalAbsorption;
  setSeasonal: (value?: SeasonalAbsorption) => void;
  occupancyCap?: OccupancyCap;
  setOccupancyCap: (value?: OccupancyCap) => void;
  vacancyPercent: number;
  rule?: StabilizationRule;
  setRule: (value?: StabilizationRule) => void;
  turnover?: LeaseTurnover;
  setTurnover: (value?: LeaseTurnover) => void;
  fieldErrors: Record<string, string>;
}) {
  return (
    <section className="underwriting-line-section" aria-labelledby="lease-up-heading">
      <h4 id="lease-up-heading">Lease-Up</h4>
      <p className="t-meta">Free rent on new leases, a seasonal pace, a stabilization test and lease turnover. Leave a block off to keep one pace, no lease-up free rent, every revenue unit leased with the vacancy percent taken off income, stabilization the first month every revenue unit is leased, and no lease ending during lease-up.</p>

      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(concession)} onChange={(event) => setConcession(event.target.checked ? { monthsFree: 1, leaseTermMonths: 12, timing: "at_move_in", reviewState: "working" } : undefined)} /> Add Lease-Up Concession</label>
      {concession ? <>
        <p className="t-meta">Applies to each lease signed during lease-up, apart from the stabilized free rent above.</p>
        <div className="underwriting-form-grid underwriting-operations-controls">
          <Field path="leaseUpConcession.monthsFree" label="Months Free" value={concession.monthsFree} step="0.01" onChange={(value) => setConcession({ ...concession, monthsFree: Number(value) })} error={fieldErrors["leaseUpConcession.monthsFree"]} />
          <Field path="leaseUpConcession.leaseTermMonths" label="Lease Term Months" value={concession.leaseTermMonths} step="1" onChange={(value) => setConcession({ ...concession, leaseTermMonths: Number(value) })} error={fieldErrors["leaseUpConcession.leaseTermMonths"]} />
          <label className="field-label t-label" htmlFor={controlId("leaseUpConcession.timing")}>Timing
            <select id={controlId("leaseUpConcession.timing")} className="input" value={concession.timing} onChange={(event) => setConcession({ ...concession, timing: event.target.value as LeaseUpConcessionTiming })} aria-invalid={Boolean(fieldErrors["leaseUpConcession.timing"])}>{TIMINGS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
            <FieldError error={fieldErrors["leaseUpConcession.timing"]} />
          </label>
        </div>
        <EvidenceRow path="leaseUpConcession" label="Lease-Up Concession" item={concession} onChange={(change) => setConcession({ ...concession, ...change })} fieldErrors={fieldErrors} />
      </> : null}

      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(seasonal)} onChange={(event) => setSeasonal(event.target.checked ? { monthlyFactors: Array(12).fill(1), reviewState: "working" } : undefined)} /> Add Seasonal Absorption</label>
      {seasonal ? <>
        <p className="t-meta">Each factor scales the lease-up pace in that calendar month. One keeps the base pace.</p>
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table underwriting-seasonal-factors">
            <thead><tr>{MONTH_NAMES.map((name) => <th key={name} className="right">{name.slice(0, 3)}</th>)}</tr></thead>
            <tbody><tr>{seasonal.monthlyFactors.map((factor, index) => {
              const path = `seasonalAbsorption.monthlyFactors.${index}`;
              return <td key={index}><input id={controlId(path)} className="input num right" type="number" min="0" step="0.01" aria-label={`${MONTH_NAMES[index]} absorption factor`} value={factor} onChange={(event) => setSeasonal({ ...seasonal, monthlyFactors: seasonal.monthlyFactors.map((value, position) => position === index ? Number(event.target.value) : value) })} aria-invalid={Boolean(fieldErrors[path])} /><FieldError error={fieldErrors[path]} /></td>;
            })}</tr></tbody>
          </table>
        </div>
        <FieldError error={fieldErrors["seasonalAbsorption.monthlyFactors"]} />
        <EvidenceRow path="seasonalAbsorption" label="Seasonal Absorption" item={seasonal} onChange={(change) => setSeasonal({ ...seasonal, ...change })} fieldErrors={fieldErrors} />
      </> : null}

      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(occupancyCap)} onChange={(event) => setOccupancyCap(event.target.checked ? { reviewState: "working" } : undefined)} /> Stop Lease-Up at One Less the Vacancy Rate</label>
      {occupancyCap ? <>
        <p className="t-meta">Leased units stop at {Number.isFinite(vacancyPercent) ? `${100 - vacancyPercent} percent` : "one less the vacancy percent"} of revenue units. The unleased units are the vacancy, so lease-up loss carries them and no vacancy loss is charged on top. Credit loss still applies. Stabilization is the first month at the cap, and a stabilization rule cannot target more than the cap.</p>
        <EvidenceRow path="occupancyCap" label="Occupancy Cap" item={occupancyCap} onChange={(change) => setOccupancyCap({ ...occupancyCap, ...change })} fieldErrors={fieldErrors} />
      </> : null}

      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(rule)} onChange={(event) => setRule(event.target.checked ? { targetOccupancyPercent: 95, holdMonths: 3, reviewState: "working" } : undefined)} /> Add Stabilization Rule</label>
      {rule ? <>
        <p className="t-meta">The property stabilizes in the month leased units have held at or above the target for the hold months, counting the first month at target.</p>
        <div className="underwriting-form-grid underwriting-operations-controls">
          <Field path="stabilizationRule.targetOccupancyPercent" label="Target Occupancy" value={rule.targetOccupancyPercent} step="0.01" suffix="%" onChange={(value) => setRule({ ...rule, targetOccupancyPercent: Number(value) })} error={fieldErrors["stabilizationRule.targetOccupancyPercent"]} />
          <Field path="stabilizationRule.holdMonths" label="Hold Months" value={rule.holdMonths} step="1" onChange={(value) => setRule({ ...rule, holdMonths: Number(value) })} error={fieldErrors["stabilizationRule.holdMonths"]} />
        </div>
        <EvidenceRow path="stabilizationRule" label="Stabilization Rule" item={rule} onChange={(change) => setRule({ ...rule, ...change })} fieldErrors={fieldErrors} />
      </> : null}

      <label className="field-label t-label underwriting-checkbox"><input type="checkbox" checked={Boolean(turnover)} onChange={(event) => setTurnover(event.target.checked ? { turnoverPercent: 50, leaseTermMonths: 12, vacantMonths: 0, basis: "each_new_lease_once", reviewState: "working" } : undefined)} /> Add Lease Turnover</label>
      {turnover ? <>
        <p className="t-meta">Leases signed during lease-up end, and the turnover share moves out. Those units can be leased again after the vacant months. Turnover stops once leased units reach the stabilization target, and the vacancy percent carries it from then on.</p>
        <div className="underwriting-form-grid underwriting-operations-controls">
          <Field path="leaseTurnover.turnoverPercent" label="Turnover" value={turnover.turnoverPercent} step="0.01" suffix="%" onChange={(value) => setTurnover({ ...turnover, turnoverPercent: Number(value) })} error={fieldErrors["leaseTurnover.turnoverPercent"]} />
          <Field path="leaseTurnover.leaseTermMonths" label="Lease Term Months" value={turnover.leaseTermMonths} step="1" onChange={(value) => setTurnover({ ...turnover, leaseTermMonths: Number(value) })} error={fieldErrors["leaseTurnover.leaseTermMonths"]} />
          <Field path="leaseTurnover.vacantMonths" label="Vacant Months" value={turnover.vacantMonths} step="1" onChange={(value) => setTurnover({ ...turnover, vacantMonths: Number(value) })} error={fieldErrors["leaseTurnover.vacantMonths"]} />
          <label className="field-label t-label" htmlFor={controlId("leaseTurnover.basis")}>Expiring Leases
            <select id={controlId("leaseTurnover.basis")} className="input" value={turnover.basis} onChange={(event) => setTurnover({ ...turnover, basis: event.target.value as LeaseTurnoverBasis })} aria-invalid={Boolean(fieldErrors["leaseTurnover.basis"])}>{TURNOVER_BASES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
            <FieldError error={fieldErrors["leaseTurnover.basis"]} />
          </label>
        </div>
        <p className="t-meta">{TURNOVER_BASES.find(([value]) => value === turnover.basis)?.[2]}</p>
        <EvidenceRow path="leaseTurnover" label="Lease Turnover" item={turnover} onChange={(change) => setTurnover({ ...turnover, ...change })} fieldErrors={fieldErrors} />
      </> : null}
    </section>
  );
}

function EvidenceRow({ path, label, item, onChange, fieldErrors }: {
  path: string;
  label: string;
  item: Evidence;
  onChange: (change: Partial<Evidence>) => void;
  fieldErrors: Record<string, string>;
}) {
  return (
    <div className="underwriting-edit-table-wrap">
      <table className="underwriting-operations-table underwriting-assumption-evidence">
        <thead><tr><th>Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead>
        <tbody><tr>
          <th scope="row">{label}</th>
          <td><input className="input" id={controlId(`${path}.sourceLabel`)} maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH} aria-label={`${label} source label`} value={item.sourceLabel ?? ""} onChange={(event) => onChange({ sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceLabel`])} /><FieldError error={fieldErrors[`${path}.sourceLabel`]} /></td>
          <td><input className="input" id={controlId(`${path}.sourceDate`)} type="date" aria-label={`${label} source date`} value={item.sourceDate ?? ""} onChange={(event) => onChange({ sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceDate`])} /><FieldError error={fieldErrors[`${path}.sourceDate`]} /></td>
          <td><select className="input" id={controlId(`${path}.reviewState`)} aria-label={`${label} review state`} value={item.reviewState} onChange={(event) => onChange({ reviewState: event.target.value as Evidence["reviewState"] })}><option value="working">Working on It</option><option value="done">Done</option></select></td>
        </tr></tbody>
      </table>
    </div>
  );
}

function Field({ path, label, value, onChange, error, suffix, step }: { path: string; label: string; value: number; onChange: (value: string) => void; error?: string; suffix?: string; step?: string }) {
  const id = controlId(path);
  return <label className="field-label t-label" htmlFor={id}>{label}<span className={suffix ? "underwriting-money-input" : undefined}><input id={id} className="input num" type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />{suffix ? <span>{suffix}</span> : null}</span><FieldError id={`${id}-error`} error={error} /></label>;
}

function FieldError({ id, error }: { id?: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

function controlId(path: string) {
  return `apartment-operations-${path.replaceAll(".", "-")}`;
}
