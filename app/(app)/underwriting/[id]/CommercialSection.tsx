"use client";

import {
  MAX_COMMERCIAL_RECOVERIES_PER_SPACE,
  MAX_COMMERCIAL_SPACES,
  MAX_OPERATION_LINE_NAME_LENGTH,
  MAX_OPERATION_SOURCE_LABEL_LENGTH,
  type CommercialOperations,
  type CommercialRecovery,
  type CommercialSpace,
  type Milestone,
  type OperatingExpenseLine,
} from "@kulka/engine";

import { GroupedNumberInput } from "@/components/GroupedNumberInput";
import { MilestoneAnchorField } from "./MilestoneAnchorField";

type Evidence = { sourceLabel?: string; sourceDate?: string; reviewState: "working" | "done" };

const PROPERTY_TAX = "property_tax";
const EXPENSE_LINES = "expense_lines";

/**
 * Commercial spaces (LA-1871). The block is optional: with no space, the case has no commercial
 * income and every month matches a case that never had the block. Each space keeps its own source
 * and review state, and the block keeps one for commercial vacancy and credit loss. A space is never
 * a unit, so it joins no unit count.
 */
export function CommercialSection({ commercial, setCommercial, expenseLines, hasPropertyTax, milestones, defaultMonth, fieldErrors }: {
  commercial?: CommercialOperations;
  setCommercial: (value?: CommercialOperations) => void;
  /** The operating expense lines a tenant can reimburse. */
  expenseLines: OperatingExpenseLine[];
  hasPropertyTax: boolean;
  milestones: Milestone[];
  /** The month a new space's lease starts until the user chooses another. */
  defaultMonth: string;
  fieldErrors: Record<string, string>;
}) {
  const spaces = commercial?.spaces ?? [];
  const update = (change: Partial<CommercialOperations>) => commercial && setCommercial({ ...commercial, ...change });
  const updateSpace = (index: number, change: Partial<CommercialSpace>) => update({
    spaces: spaces.map((space, position) => position === index ? { ...space, ...change } : space),
  });
  const updateRecovery = (spaceIndex: number, recoveryIndex: number, recovery: CommercialRecovery) => updateSpace(spaceIndex, {
    recoveries: spaces[spaceIndex].recoveries.map((item, position) => position === recoveryIndex ? recovery : item),
  });
  const recoverable = expenseLines.filter((line) => line.unit !== "percent_effective_gross_revenue");

  return (
    <section className="underwriting-line-section" aria-labelledby="commercial-heading">
      <h4 id="commercial-heading">Commercial Spaces</h4>
      <p className="t-meta">Ground-floor and in-line space, each with its own lease start, rent, recoveries and first-generation costs. Commercial income carries its own vacancy and credit loss, and commercial net operating income joins the property total. Tenant improvements and leasing commissions are development cost paid in the lease start month. A space is never a unit. Leave it off for a case with no commercial space.</p>
      <label className="field-label t-label underwriting-checkbox"><input id="commercial-use" type="checkbox" checked={Boolean(commercial)} onChange={(event) => setCommercial(event.target.checked ? blankCommercial(defaultMonth) : undefined)} /> Add Commercial Spaces</label>
      {fieldErrors.commercial ? <FieldError error={fieldErrors.commercial} /> : null}
      {commercial ? <>
        <div className="underwriting-form-grid underwriting-operations-controls">
          <NumberField path="commercial.vacancyPercent" label="Commercial Vacancy" value={commercial.vacancyPercent} onChange={(value) => update({ vacancyPercent: value })} error={fieldErrors["commercial.vacancyPercent"]} min="0" max="100" step="0.01" suffix="%" />
          <NumberField path="commercial.creditLossPercent" label="Commercial Credit Loss" value={commercial.creditLossPercent} onChange={(value) => update({ creditLossPercent: value })} error={fieldErrors["commercial.creditLossPercent"]} min="0" max="100" step="0.01" suffix="%" />
        </div>
        <EvidenceTable label="Commercial Vacancy and Credit Loss" path="commercial" item={commercial} onChange={(change) => update(change)} fieldErrors={fieldErrors} />

        <div className="underwriting-section-head">
          <div>
            <h5>Spaces</h5>
            <p className="t-meta">Rent starts at the lease start month and runs to the end of the model. Free rent forgives base rent only. The lease term sets the leasing commission, which is a percent of the base rent the lease schedules over that term.</p>
          </div>
          <button className="btn btn--secondary" type="button" disabled={spaces.length >= MAX_COMMERCIAL_SPACES} onClick={() => update({ spaces: [...spaces, blankSpace(defaultMonth)] })}>Add Commercial Space</button>
        </div>
        {fieldErrors["commercial.spaces"] ? <FieldError error={fieldErrors["commercial.spaces"]} /> : null}
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table underwriting-commercial-spaces">
            <thead><tr><th>Space</th><th className="right">Area</th><th className="right">Annual Rent per SF</th><th>Lease Start</th><th className="right">Free Rent Months</th><th className="right">Tenant Improvement per SF</th><th className="right">Leasing Commission</th><th className="right">Lease Term Months</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Action</th></tr></thead>
            <tbody>{spaces.map((space, index) => {
              const path = `commercial.spaces.${index}`;
              const label = space.name || `Space ${index + 1}`;
              return <tr key={space.id}>
                <td><TextInput path={`${path}.name`} label={`Space ${index + 1} name`} value={space.name} onChange={(name) => updateSpace(index, { name })} error={fieldErrors[`${path}.name`]} /></td>
                <td><NumberInput path={`${path}.areaSf`} label={`${label} area`} value={space.areaSf} onChange={(areaSf) => updateSpace(index, { areaSf })} error={fieldErrors[`${path}.areaSf`]} suffix="SF" grouped /></td>
                <td><NumberInput path={`${path}.annualRentPerSf`} label={`${label} annual rent per square foot`} value={space.annualRentPerSf} onChange={(annualRentPerSf) => updateSpace(index, { annualRentPerSf })} error={fieldErrors[`${path}.annualRentPerSf`]} suffix="USD" grouped /></td>
                <td>
                  <MilestoneAnchorField
                    id={controlId(`${path}.leaseStartMonth`)}
                    label={`${label} lease start`}
                    typedLabel={`${label} lease start month`}
                    month={space.leaseStartMonth ?? ""}
                    onMonthChange={(leaseStartMonth) => updateSpace(index, { leaseStartMonth })}
                    anchor={space.leaseStartAnchor}
                    onAnchorChange={(anchor) => updateSpace(index, { leaseStartAnchor: anchor && "milestoneId" in anchor ? anchor : undefined })}
                    milestones={milestones}
                    errors={[fieldErrors[`${path}.leaseStartMonth`], fieldErrors[`${path}.leaseStartAnchor`], fieldErrors[`${path}.leaseStartAnchor.milestoneId`], fieldErrors[`${path}.leaseStartAnchor.offsetMonths`]]}
                  />
                </td>
                <td><NumberInput path={`${path}.freeRentMonths`} label={`${label} free rent months`} value={space.freeRentMonths} onChange={(freeRentMonths) => updateSpace(index, { freeRentMonths })} error={fieldErrors[`${path}.freeRentMonths`]} min="0" step="1" /></td>
                <td><NumberInput path={`${path}.tenantImprovementPerSf`} label={`${label} tenant improvement per square foot`} value={space.tenantImprovementPerSf} onChange={(tenantImprovementPerSf) => updateSpace(index, { tenantImprovementPerSf })} error={fieldErrors[`${path}.tenantImprovementPerSf`]} suffix="USD" grouped /></td>
                <td><NumberInput path={`${path}.leasingCommissionPercent`} label={`${label} leasing commission percent`} value={space.leasingCommissionPercent} onChange={(leasingCommissionPercent) => updateSpace(index, { leasingCommissionPercent })} error={fieldErrors[`${path}.leasingCommissionPercent`]} min="0" max="100" step="0.01" suffix="%" /></td>
                <td><NumberInput path={`${path}.leaseTermMonths`} label={`${label} lease term months`} value={space.leaseTermMonths} onChange={(leaseTermMonths) => updateSpace(index, { leaseTermMonths })} error={fieldErrors[`${path}.leaseTermMonths`]} min="1" step="1" /></td>
                <EvidenceCells path={path} label={label} item={space} onChange={(change) => updateSpace(index, change)} fieldErrors={fieldErrors} />
                <td><button className="btn btn--secondary" type="button" onClick={() => update({ spaces: spaces.filter((_, position) => position !== index) })}>Remove</button></td>
              </tr>;
            })}</tbody>
          </table>
        </div>

        <div className="underwriting-section-head">
          <div>
            <h5>Recoveries</h5>
            <p className="t-meta">What each tenant reimburses: named operating expense lines or the property tax. Leave the share blank to use the space&apos;s share of total area, which counts residential and commercial area together. Tenants together cannot pay more than all of an expense.{hasPropertyTax ? "" : " A property tax recovery needs a property tax schedule on the case."}</p>
          </div>
        </div>
        <div className="underwriting-edit-table-wrap">
          <table className="underwriting-operations-table underwriting-commercial-recoveries">
            <thead><tr><th>Space</th><th>Reimburses</th><th>Operating Expense Lines</th><th className="right">Share</th><th>Action</th></tr></thead>
            <tbody>{spaces.flatMap((space, spaceIndex) => {
              const spacePath = `commercial.spaces.${spaceIndex}`;
              const label = space.name || `Space ${spaceIndex + 1}`;
              const rows = space.recoveries.map((recovery, recoveryIndex) => {
                const path = `${spacePath}.recoveries.${recoveryIndex}`;
                const basis = recovery.basis.kind;
                const selected = recovery.basis.kind === EXPENSE_LINES ? recovery.basis.lineIds : [];
                const linesError = fieldErrors[`${path}.basis.lineIds`] ?? Object.entries(fieldErrors).find(([key]) => key.startsWith(`${path}.basis.lineIds.`))?.[1];
                return <tr key={`${space.id}-${recoveryIndex}`}>
                  <th scope="row">{label}</th>
                  <td>
                    <select id={controlId(`${path}.basis`)} className="input" aria-label={`${label} recovery ${recoveryIndex + 1} basis`} value={basis} aria-invalid={Boolean(fieldErrors[`${path}.basis`] ?? fieldErrors[`${path}.basis.kind`])} onChange={(event) => updateRecovery(spaceIndex, recoveryIndex, {
                      ...(recovery.sharePercent === undefined ? {} : { sharePercent: recovery.sharePercent }),
                      basis: event.target.value === PROPERTY_TAX ? { kind: PROPERTY_TAX } : { kind: EXPENSE_LINES, lineIds: [] },
                    })}>
                      <option value={EXPENSE_LINES}>Operating Expense Lines</option>
                      <option value={PROPERTY_TAX}>Property Tax</option>
                    </select>
                    <FieldError error={fieldErrors[`${path}.basis`] ?? fieldErrors[`${path}.basis.kind`]} />
                  </td>
                  <td>
                    {recovery.basis.kind === EXPENSE_LINES ? <fieldset className="underwriting-recovery-lines" aria-label={`${label} recovery ${recoveryIndex + 1} expense lines`}>
                      {recoverable.length === 0 ? <span className="t-meta">Add an operating expense line first.</span> : recoverable.map((line) => <label key={line.id} className="underwriting-checkbox">
                        <input type="checkbox" checked={selected.includes(line.id)} onChange={(event) => updateRecovery(spaceIndex, recoveryIndex, {
                          ...recovery,
                          basis: { kind: EXPENSE_LINES, lineIds: event.target.checked ? [...selected, line.id] : selected.filter((id) => id !== line.id) },
                        })} /> {line.name || "Unnamed Line"}
                      </label>)}
                      <FieldError error={linesError} />
                    </fieldset> : <span className="t-meta">The tax the property pays under its schedule</span>}
                  </td>
                  <td>
                    <span className="underwriting-money-input"><input id={controlId(`${path}.sharePercent`)} className="input num right" type="number" min="0" max="100" step="0.01" placeholder="Area Share" aria-label={`${label} recovery ${recoveryIndex + 1} share percent`} value={recovery.sharePercent ?? ""} aria-invalid={Boolean(fieldErrors[`${path}.sharePercent`])} onChange={(event) => {
                      const { sharePercent: _share, ...rest } = recovery;
                      void _share;
                      updateRecovery(spaceIndex, recoveryIndex, event.target.value === "" ? rest : { ...rest, sharePercent: Number(event.target.value) });
                    }} /><span>%</span></span>
                    <FieldError error={fieldErrors[`${path}.sharePercent`]} />
                  </td>
                  <td><button className="btn btn--secondary" type="button" onClick={() => updateSpace(spaceIndex, { recoveries: space.recoveries.filter((_, position) => position !== recoveryIndex) })}>Remove</button></td>
                </tr>;
              });
              rows.push(<tr key={`${space.id}-add`}>
                <th scope="row">{label}</th>
                <td colSpan={4}>
                  {space.recoveries.length === 0 ? <span className="t-meta">This tenant reimburses nothing. </span> : null}
                  <FieldError error={fieldErrors[`${spacePath}.recoveries`]} />
                  <button className="btn btn--secondary" type="button" disabled={space.recoveries.length >= MAX_COMMERCIAL_RECOVERIES_PER_SPACE} onClick={() => updateSpace(spaceIndex, { recoveries: [...space.recoveries, { basis: { kind: EXPENSE_LINES, lineIds: [] } }] })}>Add Recovery for {label}</button>
                </td>
              </tr>);
              return rows;
            })}</tbody>
          </table>
        </div>
      </> : null}
    </section>
  );
}

function blankCommercial(defaultMonth: string): CommercialOperations {
  return { spaces: [blankSpace(defaultMonth)], vacancyPercent: 0, creditLossPercent: 0, reviewState: "working" };
}

function blankSpace(defaultMonth: string): CommercialSpace {
  return {
    id: crypto.randomUUID(),
    name: "",
    areaSf: 0,
    annualRentPerSf: 0,
    leaseStartMonth: defaultMonth,
    freeRentMonths: 0,
    recoveries: [],
    tenantImprovementPerSf: 0,
    leasingCommissionPercent: 0,
    leaseTermMonths: 120,
    reviewState: "working",
  };
}

function EvidenceTable({ label, path, item, onChange, fieldErrors }: { label: string; path: string; item: Evidence; onChange: (change: Partial<Evidence>) => void; fieldErrors: Record<string, string> }) {
  return (
    <div className="underwriting-edit-table-wrap">
      <table className="underwriting-operations-table underwriting-assumption-evidence">
        <thead><tr><th>Input</th><th>Source Label</th><th>Source Date</th><th>Review State</th></tr></thead>
        <tbody><tr>
          <th scope="row">{label}</th>
          <EvidenceCells path={path} label={label} item={item} onChange={onChange} fieldErrors={fieldErrors} />
        </tr></tbody>
      </table>
    </div>
  );
}

function EvidenceCells({ path, label, item, onChange, fieldErrors }: { path: string; label: string; item: Evidence; onChange: (change: Partial<Evidence>) => void; fieldErrors: Record<string, string> }) {
  return <>
    <td><input id={controlId(`${path}.sourceLabel`)} className="input" maxLength={MAX_OPERATION_SOURCE_LABEL_LENGTH} aria-label={`${label} source label`} value={item.sourceLabel ?? ""} onChange={(event) => onChange({ sourceLabel: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceLabel`])} /><FieldError error={fieldErrors[`${path}.sourceLabel`]} /></td>
    <td><input id={controlId(`${path}.sourceDate`)} className="input" type="date" aria-label={`${label} source date`} value={item.sourceDate ?? ""} onChange={(event) => onChange({ sourceDate: event.target.value || undefined })} aria-invalid={Boolean(fieldErrors[`${path}.sourceDate`])} /><FieldError error={fieldErrors[`${path}.sourceDate`]} /></td>
    <td><select id={controlId(`${path}.reviewState`)} className="input" aria-label={`${label} review state`} value={item.reviewState} onChange={(event) => onChange({ reviewState: event.target.value as Evidence["reviewState"] })} aria-invalid={Boolean(fieldErrors[`${path}.reviewState`])}><option value="working">Working on It</option><option value="done">Done</option></select><FieldError error={fieldErrors[`${path}.reviewState`]} /></td>
  </>;
}

function NumberField({ path, label, value, onChange, error, suffix, ...input }: { path: string; label: string; value: number; onChange: (value: number) => void; error?: string; suffix?: string; min?: string; max?: string; step?: string }) {
  return <label className="field-label t-label" htmlFor={controlId(path)}>{label}<span className={suffix ? "underwriting-money-input" : undefined}><input id={controlId(path)} className="input num" type="number" value={value} onChange={(event) => onChange(Number(event.target.value))} aria-invalid={Boolean(error)} {...input} />{suffix ? <span>{suffix}</span> : null}</span><FieldError error={error} /></label>;
}

function NumberInput({ path, label, value, onChange, error, suffix, grouped, ...input }: { path: string; label: string; value: number; onChange: (value: number) => void; error?: string; suffix?: string; grouped?: boolean; min?: string; max?: string; step?: string }) {
  return <><span className={suffix ? "underwriting-money-input" : undefined}>{grouped ? <GroupedNumberInput id={controlId(path)} className="input num right" aria-label={label} value={value} onValueChange={(plain) => onChange(Number(plain))} aria-invalid={Boolean(error)} /> : <input id={controlId(path)} className="input num right" type="number" aria-label={label} value={value} onChange={(event) => onChange(Number(event.target.value))} aria-invalid={Boolean(error)} {...input} />}{suffix ? <span>{suffix}</span> : null}</span><FieldError error={error} /></>;
}

function TextInput({ path, label, value, onChange, error }: { path: string; label: string; value: string; onChange: (value: string) => void; error?: string }) {
  return <><input id={controlId(path)} className="input" maxLength={MAX_OPERATION_LINE_NAME_LENGTH} aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} /><FieldError error={error} /></>;
}

function FieldError({ error }: { error?: string }) {
  return error ? <span className="input-error" role="alert">{error}</span> : null;
}

function controlId(path: string) {
  return `apartment-operations-${path.replaceAll(".", "-")}`;
}
