"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import {
  S_CURVE_DISTRIBUTION_VERSION,
  STRAIGHT_LINE_DISTRIBUTION_VERSION,
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

export function CostScheduleEditor({ savedCase }: { savedCase: UnderwritingCase }) {
  const router = useRouter();
  const [analysisStartMonth, setAnalysisStartMonth] = useState(savedCase.costSchedule?.analysisStartMonth ?? "");
  const [saleMonth, setSaleMonth] = useState(savedCase.costSchedule?.saleMonth ?? "");
  const [lines, setLines] = useState<EditableLine[]>(() =>
    savedCase.costSchedule?.costLines.map((savedLine) => {
      const { lastChangedAt, ...line } = savedLine;
      void lastChangedAt;
      return line;
    }) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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

  function updateLine(index: number, update: Partial<EditableLine>) {
    setLines((current) => current.map((line, position) => position === index ? { ...line, ...update } : line));
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
          expectedRevision: savedCase.caseRevision,
          analysisStartMonth,
          saleMonth,
          costLines: lines,
        }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The case changed in another session. Refresh the page, review the schedule, and try again."
          : body?.error ?? "The cost schedule could not be saved.");
        setFieldErrors(body?.fieldErrors ?? {});
        return;
      }
      router.refresh();
    } catch {
      setError("The cost schedule request failed. Check the connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="underwriting-cost-editor" onSubmit={save} noValidate>
      <div className="underwriting-section-head">
        <div>
          <h3>Development Cost Schedule</h3>
          <p className="t-meta">Enter dated source amounts. A saved schedule uses the monthly formula version on the next run.</p>
        </div>
        <button className="btn btn--secondary" type="button" onClick={addLine}>Add Cost Line</button>
      </div>
      <div className="underwriting-form-grid underwriting-schedule-dates">
        <label className="field-label t-label">
          Analysis start month
          <input
            className="input"
            type="month"
            value={analysisStartMonth}
            onChange={(event) => setAnalysisStartMonth(event.target.value)}
            aria-invalid={Boolean(fieldErrors.analysisStartMonth)}
          />
          <FieldError error={fieldErrors.analysisStartMonth} />
        </label>
        <label className="field-label t-label">
          Sale month
          <input
            className="input"
            type="month"
            value={saleMonth}
            onChange={(event) => setSaleMonth(event.target.value)}
            aria-invalid={Boolean(fieldErrors.saleMonth)}
          />
          <FieldError error={fieldErrors.saleMonth} />
        </label>
      </div>

      <div className="underwriting-edit-table-wrap">
        <table className="underwriting-cost-lines">
          <thead>
            <tr>
              <th>Cost Line</th><th>Category</th><th className="right">Amount</th><th>Start</th><th>End</th>
              <th>Distribution</th><th>Source label</th><th>Source date</th><th>Review state</th><th>Action</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td>
                  <input className="input" aria-label={`Cost line ${index + 1} name`} value={line.name}
                    onChange={(event) => updateLine(index, { name: event.target.value })} />
                  <FieldError error={fieldErrors[`costLines.${index}.name`]} />
                </td>
                <td>
                  <select className="input" aria-label={`${line.name || `Cost line ${index + 1}`} category`} value={line.category}
                    onChange={(event) => updateLine(index, { category: event.target.value as EditableLine["category"] })}>
                    {CATEGORY_OPTIONS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                  </select>
                </td>
                <td>
                  <div className="underwriting-money-input">
                    <input className="input num right" type="number" min="0.01" step="0.01"
                      aria-label={`${line.name || `Cost line ${index + 1}`} amount in USD`} value={line.amount || ""}
                      onChange={(event) => updateLine(index, { amount: Number(event.target.value) })} />
                    <span>USD</span>
                  </div>
                  <FieldError error={fieldErrors[`costLines.${index}.amount`]} />
                </td>
                <td><input className="input" type="month" aria-label={`${line.name || `Cost line ${index + 1}`} start month`}
                  value={line.startMonth} onChange={(event) => updateLine(index, { startMonth: event.target.value })} /></td>
                <td><input className="input" type="month" aria-label={`${line.name || `Cost line ${index + 1}`} end month`}
                  value={line.endMonth} onChange={(event) => updateLine(index, { endMonth: event.target.value })} /></td>
                <td>
                  <select className="input" aria-label={`${line.name || `Cost line ${index + 1}`} distribution`}
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
                </td>
                <td><input className="input" aria-label={`${line.name || `Cost line ${index + 1}`} source label`}
                  value={line.sourceLabel ?? ""} onChange={(event) => updateLine(index, { sourceLabel: event.target.value || undefined })} /></td>
                <td><input className="input" type="date" aria-label={`${line.name || `Cost line ${index + 1}`} source date`}
                  value={line.sourceDate ?? ""} onChange={(event) => updateLine(index, { sourceDate: event.target.value || undefined })} /></td>
                <td>
                  <select className="input" aria-label={`${line.name || `Cost line ${index + 1}`} review state`}
                    value={line.reviewState} onChange={(event) => updateLine(index, { reviewState: event.target.value as EditableLine["reviewState"] })}>
                    <option value="working">Working on it</option><option value="done">Done</option>
                  </select>
                </td>
                <td><button className="btn btn--secondary" type="button" onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lines.length === 0 ? <div className="empty empty--inline"><p>Add at least one cost line to build the monthly schedule.</p></div> : null}
      {error ? <p className="input-error underwriting-save-error" role="alert">{error}</p> : null}
      <div className="underwriting-form-actions">
        <button className="btn btn--primary" type="submit" disabled={saving}>{saving ? "Saving Schedule" : "Save Schedule"}</button>
      </div>
    </form>
  );
}

function FieldError({ error }: { error?: string }) {
  return error ? <span className="input-error" role="alert">{error}</span> : null;
}

async function responseBody(response: Response): Promise<{
  error?: string;
  fieldErrors?: Record<string, string>;
} | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
