"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  COST_DISTRIBUTION_VERSIONS,
  MAX_COST_LINES,
  MAX_MILESTONES,
  MAX_MODEL_YEAR,
  MIN_MODEL_YEAR,
  STRAIGHT_LINE_DISTRIBUTION_VERSION,
  type CostLineBasis,
  type Milestone,
  type MilestoneAnchor,
  type MonthlyCostLine,
} from "@kulka/engine";
import type { UnderwritingCase } from "@/lib/underwriting/cases";
import type { RomBudgetOption, RomLink } from "@/lib/underwriting/rom-link";
import {
  commonSource,
  detachesFromAnalysisStart,
  followAnalysisStart,
  INTAKE_LINE_IDS,
  seedFromIntake,
} from "@/lib/underwriting/intake-seed";

import { GroupedNumberInput } from "@/components/GroupedNumberInput";
import { MilestoneAnchorField } from "./MilestoneAnchorField";
import { RomHardCosts } from "./RomHardCosts";
import { EditFieldset, useCanEdit } from "@/components/access/ToolLevel";

type EditableLine = MonthlyCostLine;

const CATEGORY_OPTIONS = [
  ["land", "Land"],
  ["hard_cost", "Hard Cost"],
  ["soft_cost", "Soft Cost"],
  ["development_fee", "Development Fee"],
  ["financing_fee", "Financing Fee"],
] as const;

const BASIS_OPTIONS = [
  ["fixed", "Fixed Amount"],
  ["per_gross_square_foot", "Per Gross SF"],
  ["per_unit", "Per Unit"],
  ["percent_of_line", "Percent of Line"],
  ["percent_of_total", "Percent of Total"],
] as const;

const DISTRIBUTION_OPTIONS = [
  ["straight_line", "Straight-line"],
  ["s_curve", "S-curve"],
  ["front_loaded", "Front-loaded"],
  ["back_loaded", "Back-loaded"],
] as const;

const SUGGESTED_MILESTONES = ["Land Close", "Construction Start", "Construction Complete", "First Units", "Sale"];

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const TOTAL_BASE_OPTIONS = [
  ["total_cost", "Total Cost"],
  ["total_less_land", "Total Less Land"],
  ["hard_and_soft", "Hard and Soft Cost"],
] as const;

type TotalBasis = Extract<CostLineBasis, { type: "percent_of_total" }>;

function withBasis(line: EditableLine, type: CostLineBasis["type"], otherLines: EditableLine[]): EditableLine {
  const { amount, basis, ...rest } = line;
  void basis;
  if (type === "fixed") return { ...rest, amount: amount ?? 0 };
  if (type === "percent_of_total") return { ...rest, basis: { type, base: "total_cost", percent: 0 } };
  if (type === "percent_of_line") {
    return { ...rest, basis: { type, baseLineId: otherLines[0]?.id ?? "", percent: 0 } };
  }
  return { ...rest, basis: { type, rate: 0 } };
}

export function CostScheduleEditor({
  savedCase,
  romLink = null,
  romBudgets = [],
}: {
  savedCase: UnderwritingCase;
  /** LA-2417: the linked ROM budget and the budgets the case could link. */
  romLink?: RomLink | null;
  romBudgets?: RomBudgetOption[];
}) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [lastScheduleSave, setLastScheduleSave] = useState({
    caseId: savedCase.id,
    revision: savedCase.caseRevision,
  });
  const [analysisStartMonth, setAnalysisStartMonth] = useState(savedCase.costSchedule?.analysisStartMonth ?? "");
  const [saleMonth, setSaleMonth] = useState(savedCase.costSchedule?.saleMonth ?? "");
  const [saleAnchor, setSaleAnchor] = useState<MilestoneAnchor | undefined>(savedCase.costSchedule?.saleAnchor);
  const [milestones, setMilestones] = useState<Milestone[]>(savedCase.costSchedule?.milestones ?? []);
  const [lines, setLines] = useState<EditableLine[]>(() => editableLines(savedCase));
  const source = commonSource(savedCase);
  const constructionMonths = savedCase.assumptions?.find((assumption) => assumption.name === "constructionMonths")?.value;

  // Seeded lines the user has not retimed or recategorized. Only these follow the analysis start month.
  const [following, setFollowing] = useState<ReadonlySet<string>>(
    () => new Set(savedCase.costSchedule ? [] : Object.values(INTAKE_LINE_IDS)),
  );

  /** Until the schedule is first saved, untouched seeded lines follow the analysis start month. */
  function changeAnalysisStartMonth(month: string) {
    setAnalysisStartMonth(month);
    if (savedCase.costSchedule) return;
    setLines((current) => followAnalysisStart(current, following, month, constructionMonths));
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const clientReady = useSyncExternalStore(hydrationSubscription, () => true, () => false);
  const expectedRevision = lastScheduleSave.caseId === savedCase.id
    ? Math.max(savedCase.caseRevision, lastScheduleSave.revision)
    : savedCase.caseRevision;

  function addLine() {
    setLines((current) => [...current, {
      id: crypto.randomUUID(),
      name: "",
      category: "hard_cost",
      amount: 0,
      unit: "usd",
      startMonth: analysisStartMonth,
      endMonth: analysisStartMonth,
      distributionMethod: "straight_line",
      distributionVersion: STRAIGHT_LINE_DISTRIBUTION_VERSION,
      ...source,
      reviewState: "working",
    }]);
  }

  function addMilestone(name = "") {
    setMilestones((current) => [...current, { id: name ? slug(name) : crypto.randomUUID(), name, month: analysisStartMonth }]);
  }

  function updateMilestone(index: number, update: Partial<Milestone>) {
    setMilestones((current) => current.map((milestone, position) => position === index ? { ...milestone, ...update } : milestone));
  }

  function updateLine(index: number, update: Partial<EditableLine>, replace = false) {
    const id = lines[index]?.id;
    if (id && following.has(id) && detachesFromAnalysisStart(update)) {
      setFollowing((current) => new Set([...current].filter((item) => item !== id)));
    }
    setLines((current) => current.map((line, position) => position === index ? (replace ? update as EditableLine : { ...line, ...update }) : line));
  }

  // LA-2417: what the schedule last saved or loaded as, so leaving for the ROM saves only real edits.
  const draft = JSON.stringify({ analysisStartMonth, saleMonth, saleAnchor, milestones, lines });
  const [savedDraft, setSavedDraft] = useState(draft);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await persist();
  }

  /** Saves the schedule before leaving for the ROM. Nothing to save counts as saved. */
  async function saveBeforeLeaving() {
    return draft === savedDraft ? true : persist();
  }

  async function persist(): Promise<boolean> {
    setSaving(true);
    setError(undefined);
    setFieldErrors({});
    try {
      const response = await fetch(`/api/underwriting/cases/${savedCase.id}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision,
          analysisStartMonth,
          saleMonth,
          saleAnchor: saleAnchor ?? null,
          milestones,
          costLines: lines,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The project changed in another session. Refresh the page, review the schedule, and try again."
          : body?.error ?? "The cost schedule could not be saved.");
        setFieldErrors(body?.fieldErrors ?? {});
        return false;
      }
      if (!body?.case?.costSchedule) {
        setError("The saved cost schedule could not be loaded. Refresh the page before making another change.");
        return false;
      }
      setLastScheduleSave({ caseId: body.case.id, revision: body.case.caseRevision });
      setAnalysisStartMonth(body.case.costSchedule.analysisStartMonth);
      setSaleMonth(body.case.costSchedule.saleMonth);
      setSaleAnchor(body.case.costSchedule.saleAnchor);
      setMilestones(body.case.costSchedule.milestones ?? []);
      setLines(editableLines(body.case));
      setSavedDraft(JSON.stringify({
        analysisStartMonth: body.case.costSchedule.analysisStartMonth,
        saleMonth: body.case.costSchedule.saleMonth,
        saleAnchor: body.case.costSchedule.saleAnchor,
        milestones: body.case.costSchedule.milestones ?? [],
        lines: editableLines(body.case),
      }));
      router.refresh();
      return true;
    } catch {
      setError("The cost schedule request failed. Check the connection and try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="underwriting-cost-editor"
      data-client-ready={clientReady ? "true" : "false"}
      data-expected-revision={expectedRevision}
      onSubmit={save}
      noValidate
    ><EditFieldset>
      <div className="underwriting-section-head">
        <div>
          <h3>Development Cost Schedule</h3>
          <p className="t-meta">Enter dated source amounts. A saved schedule uses the monthly formula version on the next run.</p>
        </div>
        <button className="btn btn--secondary" type="button" onClick={addLine} disabled={lines.length >= MAX_COST_LINES}>Add Cost Line</button>
      </div>
      <RomHardCosts
        caseId={savedCase.id}
        grossSquareFeet={savedCase.grossBuildingSquareFeet}
        link={romLink}
        budgets={romBudgets}
        beforeLeave={saveBeforeLeaving}
      />
      <div className="underwriting-form-grid underwriting-schedule-dates">
        <label className="field-label t-label">
          Analysis Start Month
          <input
            id="cost-schedule-analysis-start-month"
            className="input"
            type="month"
            min={`${MIN_MODEL_YEAR}-01`}
            max={`${MAX_MODEL_YEAR}-12`}
            value={analysisStartMonth}
            onChange={(event) => changeAnalysisStartMonth(event.target.value)}
            aria-invalid={Boolean(fieldErrors.analysisStartMonth)}
            aria-describedby={fieldErrors.analysisStartMonth ? "cost-schedule-analysis-start-month-error" : undefined}
          />
          <FieldError id="cost-schedule-analysis-start-month-error" error={fieldErrors.analysisStartMonth} />
        </label>
        <div className="field-label t-label">
          Sale Month
          <MilestoneAnchorField
            id="cost-schedule-sale-month"
            label="Sale"
            month={saleMonth}
            onMonthChange={setSaleMonth}
            anchor={saleAnchor}
            onAnchorChange={(anchor) => setSaleAnchor(anchor && "milestoneId" in anchor ? anchor : undefined)}
            milestones={milestones}
            errors={[fieldErrors.saleMonth, fieldErrors.saleAnchor, fieldErrors["saleAnchor.milestoneId"], fieldErrors["saleAnchor.offsetMonths"]]}
          />
        </div>
      </div>

      <section className="underwriting-milestones" aria-labelledby="cost-schedule-milestones-heading">
        <div className="underwriting-section-head">
          <div>
            <h4 id="cost-schedule-milestones-heading">Milestones</h4>
            <p className="t-meta">Name the months the budget hangs on. A line, the sale, operation start and growth start can start at a milestone plus an offset, so moving a milestone moves everything anchored to it.</p>
          </div>
          <button className="btn btn--secondary" type="button" onClick={() => addMilestone()} disabled={milestones.length >= MAX_MILESTONES}>Add Milestone</button>
        </div>
        {SUGGESTED_MILESTONES.some((name) => !milestones.some((milestone) => milestone.id === slug(name))) ? (
          <p className="underwriting-milestone-suggestions">
            {SUGGESTED_MILESTONES.filter((name) => !milestones.some((milestone) => milestone.id === slug(name))).map((name) => (
              <button className="btn btn--secondary" type="button" key={name} onClick={() => addMilestone(name)} disabled={milestones.length >= MAX_MILESTONES}>Add {name}</button>
            ))}
          </p>
        ) : null}
        {milestones.length > 0 ? (
          <table className="underwriting-edit-table underwriting-milestone-table">
            <thead><tr><th>Milestone</th><th>Month</th><th>Action</th></tr></thead>
            <tbody>
              {milestones.map((milestone, index) => {
                const nameError = fieldErrors[`milestones.${index}.name`] ?? fieldErrors[`milestones.${index}.id`];
                const monthError = fieldErrors[`milestones.${index}.month`];
                return <tr key={milestone.id}>
                  <td>
                    <input id={`milestone-${index}-name`} className="input" maxLength={80} aria-label={`Milestone ${index + 1} name`} value={milestone.name}
                      aria-invalid={Boolean(nameError)} aria-describedby={nameError ? `milestone-${index}-name-error` : undefined}
                      onChange={(event) => updateMilestone(index, { name: event.target.value })} />
                    <FieldError id={`milestone-${index}-name-error`} error={nameError} />
                  </td>
                  <td>
                    <input id={`milestone-${index}-month`} className="input" type="month" min={`${MIN_MODEL_YEAR}-01`} max={`${MAX_MODEL_YEAR}-12`}
                      aria-label={`${milestone.name || `Milestone ${index + 1}`} milestone month`} value={milestone.month}
                      aria-invalid={Boolean(monthError)} aria-describedby={monthError ? `milestone-${index}-month-error` : undefined}
                      onChange={(event) => updateMilestone(index, { month: event.target.value })} />
                    <FieldError id={`milestone-${index}-month-error`} error={monthError} />
                  </td>
                  <td><button className="btn btn--secondary" type="button" onClick={() => setMilestones((current) => current.filter((_, position) => position !== index))}>Remove</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        ) : null}
        <FieldError id="cost-schedule-milestones-error" error={fieldErrors.milestones} />
      </section>

      <div className="underwriting-edit-table-wrap">
        <table className="underwriting-cost-lines">
          <thead>
            <tr>
              <th>Cost Line</th><th>Category</th><th>Basis</th><th className="right">Amount</th><th>Start</th><th>End</th>
              <th>Distribution</th><th>Source Label</th><th>Source Date</th><th>Review State</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const name = fieldState(fieldErrors, index, "name");
              const category = fieldState(fieldErrors, index, "category");
              const amount = fieldState(fieldErrors, index, "amount", "basis");
              const basisState = fieldState(fieldErrors, index, "basis");
              const label = line.name || `Cost line ${index + 1}`;
              const otherLines = lines.filter((_, position) => position !== index);
              const quantityError = line.basis?.type === "per_unit" ? fieldErrors["quantities.units"]
                : line.basis?.type === "per_gross_square_foot" ? fieldErrors["quantities.grossSquareFeet"] : undefined;
              const startMonth = fieldState(fieldErrors, index, "startMonth", "line");
              const endMonth = fieldState(fieldErrors, index, "endMonth");
              const distribution = fieldState(fieldErrors, index, "distributionMethod", "distributionVersion");
              const sourceLabel = fieldState(fieldErrors, index, "sourceLabel");
              const sourceDate = fieldState(fieldErrors, index, "sourceDate");
              const reviewState = fieldState(fieldErrors, index, "reviewState");
              return <tr key={line.id}>
                <td>
                  <input {...name.controlProps} className="input" maxLength={200} aria-label={`Cost line ${index + 1} name`} value={line.name}
                    onChange={(event) => updateLine(index, { name: event.target.value })} />
                  <FieldError id={name.errorId} error={name.error} />
                </td>
                <td>
                  <select {...category.controlProps} className="input" aria-label={`${line.name || `Cost line ${index + 1}`} category`} value={line.category}
                    onChange={(event) => updateLine(index, { category: event.target.value as EditableLine["category"] })}>
                    {CATEGORY_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                  <FieldError id={category.errorId} error={category.error} />
                </td>
                <td>
                  <select {...basisState.controlProps} className="input" aria-label={`${label} basis`} value={line.basis?.type ?? "fixed"}
                    onChange={(event) => updateLine(index, withBasis(line, event.target.value as CostLineBasis["type"], otherLines), true)}>
                    {BASIS_OPTIONS.map(([value, optionLabel]) => <option value={value} key={value}>{optionLabel}</option>)}
                  </select>
                  <FieldError id={basisState.errorId} error={basisState.error} />
                </td>
                <td>
                  {!line.basis || line.basis.type === "fixed" ? (
                    <div className="underwriting-money-input">
                      <GroupedNumberInput {...amount.controlProps} className="input num right"
                        aria-label={`${label} amount in USD`} value={line.amount || ""}
                        onValueChange={(plain) => updateLine(index, { amount: Number(plain) })} />
                      <span>USD</span>
                    </div>
                  ) : line.basis.type === "percent_of_total" ? (
                    <div className="underwriting-money-input">
                      <input id={`cost-line-${index}-basis-percent`} className="input num right" type="number" min="0.01" max="99.99" step="0.01"
                        aria-label={`${label} percent of total`} value={line.basis.percent || ""}
                        onChange={(event) => updateLine(index, { basis: { ...line.basis as TotalBasis, percent: Number(event.target.value) } })} />
                      <span>% of</span>
                      <select className="input" aria-label={`${label} total base`} value={line.basis.base}
                        onChange={(event) => updateLine(index, { basis: { ...line.basis as TotalBasis, base: event.target.value as TotalBasis["base"] } })}>
                        {TOTAL_BASE_OPTIONS.map(([value, optionLabel]) => <option value={value} key={value}>{optionLabel}</option>)}
                      </select>
                    </div>
                  ) : line.basis.type === "percent_of_line" ? (
                    <div className="underwriting-money-input">
                      <input id={`cost-line-${index}-basis-percent`} className="input num right" type="number" min="0.01" max="1000" step="0.01"
                        aria-label={`${label} percent of base line`} value={line.basis.percent || ""}
                        onChange={(event) => updateLine(index, { basis: { ...line.basis as Extract<CostLineBasis, { type: "percent_of_line" }>, percent: Number(event.target.value) } })} />
                      <span>% of</span>
                      <select className="input" aria-label={`${label} base line`} value={line.basis.baseLineId}
                        onChange={(event) => updateLine(index, { basis: { ...line.basis as Extract<CostLineBasis, { type: "percent_of_line" }>, baseLineId: event.target.value } })}>
                        {line.basis.baseLineId === "" ? <option value="">Choose a Line</option> : null}
                        {otherLines.map((other) => <option value={other.id} key={other.id}>{other.name || "Unnamed Line"}</option>)}
                      </select>
                    </div>
                  ) : (
                    <div className="underwriting-money-input">
                      <GroupedNumberInput id={`cost-line-${index}-basis-rate`} className="input num right"
                        aria-label={`${label} rate in USD ${line.basis.type === "per_unit" ? "per unit" : "per gross square foot"}`} value={line.basis.rate || ""}
                        onValueChange={(plain) => updateLine(index, { basis: { ...line.basis as Extract<CostLineBasis, { type: "per_unit" | "per_gross_square_foot" }>, rate: Number(plain) } })} />
                      <span>{line.basis.type === "per_unit" ? "USD/Unit" : "USD/GSF"}</span>
                    </div>
                  )}
                  <FieldError id={amount.errorId} error={amount.error ?? fieldErrors[`costLines.${index}.basis.rate`] ?? fieldErrors[`costLines.${index}.basis.percent`] ?? fieldErrors[`costLines.${index}.basis.baseLineId`] ?? fieldErrors[`costLines.${index}.basis.base`] ?? quantityError} />
                </td>
                <td>
                  <MilestoneAnchorField
                    id={`cost-line-${index}-startMonth`}
                    label={`${label} start`}
                    month={line.startMonth}
                    onMonthChange={(value) => updateLine(index, { startMonth: value })}
                    anchor={line.startAnchor}
                    onAnchorChange={(anchor) => updateLine(index, { startAnchor: anchor && "milestoneId" in anchor ? anchor : undefined })}
                    milestones={milestones}
                    errors={[startMonth.error, fieldErrors[`costLines.${index}.startAnchor`], fieldErrors[`costLines.${index}.startAnchor.milestoneId`], fieldErrors[`costLines.${index}.startAnchor.offsetMonths`]]}
                  />
                </td>
                <td>
                  <MilestoneAnchorField
                    id={`cost-line-${index}-endMonth`}
                    label={`${label} end`}
                    month={line.endMonth}
                    onMonthChange={(value) => updateLine(index, { endMonth: value })}
                    anchor={line.endAnchor}
                    onAnchorChange={(anchor) => updateLine(index, { endAnchor: anchor })}
                    milestones={milestones}
                    allowDuration
                    errors={[endMonth.error, fieldErrors[`costLines.${index}.endAnchor`], fieldErrors[`costLines.${index}.endAnchor.milestoneId`], fieldErrors[`costLines.${index}.endAnchor.offsetMonths`], fieldErrors[`costLines.${index}.endAnchor.durationMonths`]]}
                  />
                </td>
                <td>
                  <select {...distribution.controlProps} className="input" aria-label={`${line.name || `Cost line ${index + 1}`} distribution`}
                    value={line.distributionMethod}
                    onChange={(event) => {
                      const distributionMethod = event.target.value as EditableLine["distributionMethod"];
                      updateLine(index, {
                        distributionMethod,
                        distributionVersion: COST_DISTRIBUTION_VERSIONS[distributionMethod],
                      });
                    }}>
                    {DISTRIBUTION_OPTIONS.map(([value, optionLabel]) => <option value={value} key={value}>{optionLabel}</option>)}
                  </select>
                  <FieldError id={distribution.errorId} error={distribution.error} />
                </td>
                <td><input {...sourceLabel.controlProps} className="input" aria-label={`${line.name || `Cost line ${index + 1}`} source label`}
                  value={line.sourceLabel ?? ""} onChange={(event) => updateLine(index, { sourceLabel: event.target.value || undefined })} /><FieldError id={sourceLabel.errorId} error={sourceLabel.error} /></td>
                <td><input {...sourceDate.controlProps} className="input" type="date" aria-label={`${line.name || `Cost line ${index + 1}`} source date`}
                  value={line.sourceDate ?? ""} onChange={(event) => updateLine(index, { sourceDate: event.target.value || undefined })} /><FieldError id={sourceDate.errorId} error={sourceDate.error} /></td>
                <td>
                  <select {...reviewState.controlProps} className="input" aria-label={`${line.name || `Cost line ${index + 1}`} review state`}
                    value={line.reviewState} onChange={(event) => updateLine(index, { reviewState: event.target.value as EditableLine["reviewState"] })}>
                    <option value="working">Working on It</option><option value="done">Done</option>
                  </select>
                  <FieldError id={reviewState.errorId} error={reviewState.error} />
                </td>
                <td><button className="btn btn--secondary" type="button" onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>Remove</button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <FieldError id="cost-schedule-lines-error" error={fieldErrors.costLines} />
      {lines.length === 0 ? <div className="empty empty--inline"><p>Add at least one cost line to build the monthly schedule.</p></div> : null}
      {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}
      <div className="underwriting-form-actions">
        {canEdit ? <button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Schedule" : "Save Schedule"}</button> : null}
      </div>
    </EditFieldset></form>
  );
}

function fieldState(
  fieldErrors: Record<string, string>,
  index: number,
  field: string,
  alternateField?: string,
) {
  const path = `costLines.${index}.${field}`;
  const alternatePath = alternateField === "line"
    ? `costLines.${index}`
    : alternateField ? `costLines.${index}.${alternateField}` : undefined;
  const error = fieldErrors[path] ?? (alternatePath ? fieldErrors[alternatePath] : undefined);
  const controlId = `cost-line-${index}-${field}`;
  const errorId = `${controlId}-error`;
  return {
    error,
    errorId,
    controlProps: {
      id: controlId,
      "aria-invalid": Boolean(error),
      "aria-describedby": error ? errorId : undefined,
    },
  };
}

function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <span id={id} className="input-error" role="alert">{error}</span> : null;
}

async function responseBody(response: Response): Promise<{
  error?: string;
  fieldErrors?: Record<string, string>;
  case?: UnderwritingCase;
} | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** A schedule that has never been saved starts from the land, hard and soft cost lines intake supplies. */
function editableLines(savedCase: UnderwritingCase): EditableLine[] {
  return savedCase.costSchedule?.costLines.map((savedLine) => {
    const { lastChangedAt, ...line } = savedLine;
    void lastChangedAt;
    return line;
  }) ?? seedFromIntake(savedCase).costLines;
}

function hydrationSubscription() {
  return () => undefined;
}
