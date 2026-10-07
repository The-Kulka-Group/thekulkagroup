"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  MAX_COST_LINES,
  MAX_MODEL_YEAR,
  MIN_MODEL_YEAR,
  S_CURVE_DISTRIBUTION_VERSION,
  STRAIGHT_LINE_DISTRIBUTION_VERSION,
  type CostLineBasis,
  type MonthlyCostLine,
} from "@kulka/engine";
import type { UnderwritingCase } from "@/lib/underwriting/cases";

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

export function CostScheduleEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const [lastScheduleSave, setLastScheduleSave] = useState({
    caseId: savedCase.id,
    revision: savedCase.caseRevision,
  });
  const [analysisStartMonth, setAnalysisStartMonth] = useState(savedCase.costSchedule?.analysisStartMonth ?? "");
  const [saleMonth, setSaleMonth] = useState(savedCase.costSchedule?.saleMonth ?? "");
  const [lines, setLines] = useState<EditableLine[]>(() => editableLines(savedCase));
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
      reviewState: "working",
    }]);
  }

  function updateLine(index: number, update: Partial<EditableLine>, replace = false) {
    setLines((current) => current.map((line, position) => position === index ? (replace ? update as EditableLine : { ...line, ...update }) : line));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          costLines: lines,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The project changed in another session. Refresh the page, review the schedule, and try again."
          : body?.error ?? "The cost schedule could not be saved.");
        setFieldErrors(body?.fieldErrors ?? {});
        return;
      }
      if (!body?.case?.costSchedule) {
        setError("The saved cost schedule could not be loaded. Refresh the page before making another change.");
        return;
      }
      setLastScheduleSave({ caseId: body.case.id, revision: body.case.caseRevision });
      setAnalysisStartMonth(body.case.costSchedule.analysisStartMonth);
      setSaleMonth(body.case.costSchedule.saleMonth);
      setLines(editableLines(body.case));
      router.refresh();
    } catch {
      setError("The cost schedule request failed. Check the connection and try again.");
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
    >
      <div className="underwriting-section-head">
        <div>
          <h3>Development Cost Schedule</h3>
          <p className="t-meta">Enter dated source amounts. A saved schedule uses the monthly formula version on the next run.</p>
        </div>
        <button className="btn btn--secondary" type="button" onClick={addLine} disabled={lines.length >= MAX_COST_LINES}>Add Cost Line</button>
      </div>
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
            onChange={(event) => setAnalysisStartMonth(event.target.value)}
            aria-invalid={Boolean(fieldErrors.analysisStartMonth)}
            aria-describedby={fieldErrors.analysisStartMonth ? "cost-schedule-analysis-start-month-error" : undefined}
          />
          <FieldError id="cost-schedule-analysis-start-month-error" error={fieldErrors.analysisStartMonth} />
        </label>
        <label className="field-label t-label">
          Sale Month
          <input
            id="cost-schedule-sale-month"
            className="input"
            type="month"
            min={`${MIN_MODEL_YEAR}-01`}
            max={`${MAX_MODEL_YEAR}-12`}
            value={saleMonth}
            onChange={(event) => setSaleMonth(event.target.value)}
            aria-invalid={Boolean(fieldErrors.saleMonth)}
            aria-describedby={fieldErrors.saleMonth ? "cost-schedule-sale-month-error" : undefined}
          />
          <FieldError id="cost-schedule-sale-month-error" error={fieldErrors.saleMonth} />
        </label>
      </div>

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
                      <input {...amount.controlProps} className="input num right" type="number" min="0.01" step="0.01"
                        aria-label={`${label} amount in USD`} value={line.amount || ""}
                        onChange={(event) => updateLine(index, { amount: Number(event.target.value) })} />
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
                      <input id={`cost-line-${index}-basis-rate`} className="input num right" type="number" min="0.0001" step="0.0001"
                        aria-label={`${label} rate in USD ${line.basis.type === "per_unit" ? "per unit" : "per gross square foot"}`} value={line.basis.rate || ""}
                        onChange={(event) => updateLine(index, { basis: { ...line.basis as Extract<CostLineBasis, { type: "per_unit" | "per_gross_square_foot" }>, rate: Number(event.target.value) } })} />
                      <span>{line.basis.type === "per_unit" ? "USD/Unit" : "USD/GSF"}</span>
                    </div>
                  )}
                  <FieldError id={amount.errorId} error={amount.error ?? fieldErrors[`costLines.${index}.basis.rate`] ?? fieldErrors[`costLines.${index}.basis.percent`] ?? fieldErrors[`costLines.${index}.basis.baseLineId`] ?? fieldErrors[`costLines.${index}.basis.base`] ?? quantityError} />
                </td>
                <td><input {...startMonth.controlProps} className="input" type="month" min={`${MIN_MODEL_YEAR}-01`} max={`${MAX_MODEL_YEAR}-12`} aria-label={`${line.name || `Cost line ${index + 1}`} start month`}
                  value={line.startMonth} onChange={(event) => updateLine(index, { startMonth: event.target.value })} /><FieldError id={startMonth.errorId} error={startMonth.error} /></td>
                <td><input {...endMonth.controlProps} className="input" type="month" min={`${MIN_MODEL_YEAR}-01`} max={`${MAX_MODEL_YEAR}-12`} aria-label={`${line.name || `Cost line ${index + 1}`} end month`}
                  value={line.endMonth} onChange={(event) => updateLine(index, { endMonth: event.target.value })} /><FieldError id={endMonth.errorId} error={endMonth.error} /></td>
                <td>
                  <select {...distribution.controlProps} className="input" aria-label={`${line.name || `Cost line ${index + 1}`} distribution`}
                    value={line.distributionMethod}
                    onChange={(event) => {
                      const distributionMethod = event.target.value as EditableLine["distributionMethod"];
                      updateLine(index, {
                        distributionMethod,
                        distributionVersion: distributionMethod === "straight_line"
                          ? STRAIGHT_LINE_DISTRIBUTION_VERSION
                          : S_CURVE_DISTRIBUTION_VERSION,
                      });
                    }}>
                    <option value="straight_line">Straight-line</option>
                    <option value="s_curve">S-curve</option>
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
        <button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Schedule" : "Save Schedule"}</button>
      </div>
    </form>
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

function editableLines(savedCase: UnderwritingCase): EditableLine[] {
  return savedCase.costSchedule?.costLines.map((savedLine) => {
    const { lastChangedAt, ...line } = savedLine;
    void lastChangedAt;
    return line;
  }) ?? [];
}

function hydrationSubscription() {
  return () => undefined;
}
