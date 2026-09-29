"use client";

import Link from "next/link";
import { planFromStaffingChoices, type MarkupChoices, type MarkupMethod, type MarkupSetup } from "@kulka/engine";

import { personName } from "@/lib/format/person-name";
import type { MarkupOptions } from "@/lib/rom/markup";

import { ResourcePlanEditor } from "./ResourcePlanEditor";
import { emptyPlanForm, planFormFrom, planFromForm, type PlanForm } from "./resource-plan-form";

import "./markups.css";

// LA-1016. The GRs/GCs module in Run settings. Every figure the module offers
// comes from the server (rate tables, parameters, history counts) or from what
// the user types. Nothing here supplies a default staffing mix. The waterfall
// it produces (subtotal, GRs/GCs, fee, insurance, total) shows in the total
// panel on /rom since LA-1101. LA-1397 replaced Staffing and Duration with
// Allocated Resources (ResourcePlanEditor.tsx).

export const SETUPS: { value: MarkupSetup; label: string }[] = [
  { value: "both", label: "Both, One Combined Line" },
  { value: "gc_only", label: "General Conditions Only" },
  { value: "gr_only", label: "General Requirements Only" },
  { value: "separate", label: "Separate Lines" },
];

/**
 * How many imported budgets stand behind a setup's line or lines. A split
 * budget reads General Requirements alone for its first line and General
 * Conditions alone for its second (LA-1383).
 */
export function setupHistory(
  counts: MarkupOptions["historyCounts"],
  setup: MarkupSetup,
): { gr: number | null; gc: number } {
  return setup === "separate" ? { gr: counts.gr_only, gc: counts.gc_only } : { gr: null, gc: counts[setup] };
}

/**
 * New Budget's rate question must never finish on a TBD line (LA-1256). The
 * names of the lines still missing a rate: a field may stay blank only
 * through Use History for one line, or, with separate lines (LA-1383), where
 * that line has history of its own.
 */
export function missingRates(form: MarkupForm, counts: MarkupOptions["historyCounts"], useHistory: boolean): string[] {
  const perSf = form.method === "usd_per_gsf";
  const blank = (percent: string, dollars: string) => (perSf ? dollars : percent).trim() === "";
  if (form.method === "allocated_resources") {
    // The plan prices General Conditions; with separate lines, General
    // Requirements is still a percent and needs a rate or its own history.
    if (form.setup !== "separate") return [];
    const history = setupHistory(counts, form.setup);
    return form.grOverridePercent.trim() === "" && !history.gr ? ["General Requirements"] : [];
  }
  if (form.setup !== "separate") {
    return !useHistory && blank(form.overridePercent, form.overridePerSf) ? ["GRs/GCs"] : [];
  }
  const history = setupHistory(counts, form.setup);
  const missing: string[] = [];
  if (blank(form.grOverridePercent, form.grOverridePerSf) && !history.gr) missing.push("General Requirements");
  if (blank(form.overridePercent, form.overridePerSf) && history.gc === 0) missing.push("General Conditions");
  return missing;
}

function jobsWords(count: number): string {
  return count === 1 ? "1 job" : `${count} jobs`;
}

export const METHODS: { value: MarkupMethod; label: string }[] = [
  { value: "pct_of_subtotal", label: "Percent of Subtotal" },
  { value: "usd_per_gsf", label: "Dollars per GSF" },
  { value: "allocated_resources", label: "Allocated Resources" },
];

export type MarkupForm = {
  setup: MarkupSetup;
  method: MarkupMethod;
  overridePercent: string;
  overridePerSf: string;
  /** General Requirements' own rate, read only when the setup is "separate" (LA-1383). */
  grOverridePercent: string;
  grOverridePerSf: string;
  /** The Allocated Resources plan (LA-1397), read only under that method. */
  plan: PlanForm;
  feePercent: string;
  insurancePercent: string;
};

function percentText(fraction: number | undefined | null): string {
  return fraction === undefined || fraction === null ? "" : String(Number((fraction * 100).toFixed(4)));
}

/**
 * The form's starting values: the project's own saved choice (LA-1109) where
 * it recorded one, the recorded rate-table defaults everywhere else. A
 * project nobody has run with a saved choice yet (`saved` null) opens exactly
 * as it always has.
 */
export function initialMarkupForm(options: MarkupOptions | undefined, saved?: MarkupChoices | null): MarkupForm {
  return {
    setup: saved?.setup ?? "both",
    // LA-1397: a choice saved under the retired Staffing and Duration method
    // opens as the equivalent Allocated Resources plan.
    method: saved?.method === "staffing_duration" ? "allocated_resources" : (saved?.method ?? "pct_of_subtotal"),
    overridePercent: saved?.method === "pct_of_subtotal" ? percentText(saved.overrideRate) : "",
    overridePerSf: saved?.method === "usd_per_gsf" && saved.overrideRate !== undefined ? String(saved.overrideRate) : "",
    grOverridePercent: saved?.method !== "usd_per_gsf" ? percentText(saved?.grOverrideRate) : "",
    grOverridePerSf: saved?.method === "usd_per_gsf" && saved.grOverrideRate !== undefined ? String(saved.grOverrideRate) : "",
    plan: savedPlan(options, saved),
    feePercent: percentText(saved?.feeRate ?? options?.feeRate?.value),
    insurancePercent: percentText(saved?.insuranceRate ?? options?.insuranceRate?.value),
  };
}

/**
 * The plan a saved choice opens with. The server already opens a Staffing and
 * Duration choice as a plan (lib/rom/markup.ts, openSavedChoices); this
 * covers one that reaches the form unconverted.
 */
function savedPlan(options: MarkupOptions | undefined, saved: MarkupChoices | null | undefined): PlanForm {
  if (saved?.method === "allocated_resources" && saved.resourcePlan) return planFormFrom(saved.resourcePlan);
  if (saved?.method === "staffing_duration") {
    return planFormFrom(planFromStaffingChoices(saved, options?.staffingRates ?? [], options?.fieldOfficeRates ?? []));
  }
  return emptyPlanForm();
}

/**
 * Turns the form into the `markups` a ROM request carries, or says what is
 * wrong. Fee and insurance are sent only when the user changed them from the
 * recorded parameter, so the run records the parameter when it was used.
 */
export function markupChoicesFrom(
  form: MarkupForm,
  options: MarkupOptions | undefined,
): { ok: true; markups: MarkupChoices } | { ok: false; error: string } {
  const markups: MarkupChoices = { setup: form.setup, method: form.method };

  const rate = (text: string, parameter: number | undefined | null, name: string) => {
    if (text.trim() === "") return { ok: true as const, value: undefined };
    const value = Number(text) / 100;
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      return { ok: false as const, error: `${name} must be a percent from 0 up to 100.` };
    }
    if (parameter !== undefined && parameter !== null && Math.abs(value - parameter) < 1e-9) {
      return { ok: true as const, value: undefined };
    }
    return { ok: true as const, value };
  };

  const fee = rate(form.feePercent, options?.feeRate?.value, "Fee");
  if (!fee.ok) return fee;
  if (fee.value !== undefined) markups.feeRate = fee.value;
  const insurance = rate(form.insurancePercent, options?.insuranceRate?.value, "Insurance");
  if (!insurance.ok) return insurance;
  if (insurance.value !== undefined) markups.insuranceRate = insurance.value;

  if (form.method === "pct_of_subtotal" && form.overridePercent.trim() !== "") {
    const value = Number(form.overridePercent) / 100;
    if (!(value > 0 && value < 1)) {
      return { ok: false, error: "The GRs/GCs percent must be above 0 and below 100." };
    }
    markups.overrideRate = value;
  }
  if (form.method === "usd_per_gsf" && form.overridePerSf.trim() !== "") {
    const value = Number(form.overridePerSf);
    if (!(value > 0)) return { ok: false, error: "The GRs/GCs rate per GSF must be above zero." };
    markups.overrideRate = value;
  }

  if (form.setup === "separate") {
    if (form.method === "usd_per_gsf" && form.grOverridePerSf.trim() !== "") {
      const value = Number(form.grOverridePerSf);
      if (!(value > 0)) return { ok: false, error: "The General Requirements rate per GSF must be above zero." };
      markups.grOverrideRate = value;
    }
    if (form.method !== "usd_per_gsf" && form.grOverridePercent.trim() !== "") {
      const value = Number(form.grOverridePercent) / 100;
      if (!(value > 0 && value < 1)) {
        return { ok: false, error: "The General Requirements percent must be above 0 and below 100." };
      }
      markups.grOverrideRate = value;
    }
  }

  if (form.method === "allocated_resources") {
    const plan = planFromForm(form.plan);
    if (!plan.ok) return plan;
    markups.resourcePlan = plan.plan;
  }

  return { ok: true, markups };
}

export function MarkupControls({
  options,
  form,
  onChange,
  disabled,
}: {
  options: MarkupOptions;
  form: MarkupForm;
  onChange: (form: MarkupForm) => void;
  disabled: boolean;
}) {
  const set = (patch: Partial<MarkupForm>) => onChange({ ...form, ...patch });
  const history = setupHistory(options.historyCounts, form.setup);
  const separate = form.setup === "separate";
  const perSf = form.method === "usd_per_gsf";
  const note = (jobs: number, what: string) =>
    jobs === 0
      ? `No imported budget has a figure for ${what} yet. Leave the rate blank and the line shows as TBD, outside the total.`
      : `History for ${what}: ${jobsWords(jobs)}. Leave the rate blank to use it.`;

  return (
    <section className="markup-module" aria-label="GRs / GCs">
      <h2 className="doc-title">GRs / GCs</h2>

      <div className="markup-grid">
        <label>
          <span className="field-label t-label">Setup</span>
          <select
            className="input"
            value={form.setup}
            disabled={disabled}
            onChange={(e) => set({ setup: e.target.value as MarkupSetup })}
          >
            {SETUPS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="field-label t-label">Method</span>
          <select
            className="input"
            value={form.method}
            disabled={disabled}
            onChange={(e) => set({ method: e.target.value as MarkupMethod })}
          >
            {METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="field-label t-label">Fee %</span>
          <input
            className="input num"
            inputMode="decimal"
            value={form.feePercent}
            disabled={disabled}
            onChange={(e) => set({ feePercent: e.target.value })}
          />
        </label>

        <label>
          <span className="field-label t-label">Insurance %</span>
          <input
            className="input num"
            inputMode="decimal"
            value={form.insurancePercent}
            disabled={disabled}
            onChange={(e) => set({ insurancePercent: e.target.value })}
          />
        </label>
      </div>

      <p className="markup-note">
        {options.feeRate
          ? `Fee defaults to ${percentText(options.feeRate.value)}%, recorded by ${personName(options.feeRate.provenance.recordedBy)} on ${options.feeRate.provenance.recordedAt}. `
          : "No fee rate is recorded yet, so enter one. "}
        {options.insuranceRate
          ? `Insurance defaults to ${percentText(options.insuranceRate.value)}%, recorded by ${personName(options.insuranceRate.provenance.recordedBy)} on ${options.insuranceRate.provenance.recordedAt}. `
          : "No insurance rate is recorded yet, so enter one. "}
        A change here applies to this ROM only. The defaults themselves change on{" "}
        <Link href="/rom/parameters">Engine Parameters</Link>.
      </p>

      {separate ? (
        // LA-1383: General Requirements on its own line. An Allocated
        // Resources plan prices General Conditions, so beside it General
        // Requirements is a percent until LA-1398 gives it a plan of its own.
        <div className="markup-grid">
          <label>
            <span className="field-label t-label">
              {perSf ? "General Requirements, $ per GSF" : "General Requirements, % of Subtotal"}
            </span>
            <input
              className="input num"
              inputMode="decimal"
              placeholder="Use History"
              value={perSf ? form.grOverridePerSf : form.grOverridePercent}
              disabled={disabled}
              onChange={(e) =>
                set(perSf ? { grOverridePerSf: e.target.value } : { grOverridePercent: e.target.value })
              }
            />
          </label>
          <p className="markup-note markup-note--inline">{note(history.gr ?? 0, "General Requirements alone")}</p>
        </div>
      ) : null}

      {form.method === "pct_of_subtotal" || form.method === "usd_per_gsf" ? (
        <div className="markup-grid">
          <label>
            <span className="field-label t-label">
              {separate
                ? perSf
                  ? "General Conditions, $ per GSF"
                  : "General Conditions, % of Subtotal and GRs"
                : perSf
                  ? "Your Rate, $ per GSF"
                  : "Your Rate, % of Subtotal"}
            </span>
            <input
              className="input num"
              inputMode="decimal"
              placeholder="Use History"
              value={perSf ? form.overridePerSf : form.overridePercent}
              disabled={disabled}
              onChange={(e) =>
                set(perSf ? { overridePerSf: e.target.value } : { overridePercent: e.target.value })
              }
            />
          </label>
          <p className="markup-note markup-note--inline">
            {note(history.gc, separate ? "General Conditions alone" : "this setup")}
          </p>
        </div>
      ) : null}

      {form.method === "allocated_resources" ? (
        <ResourcePlanEditor
          options={options}
          plan={form.plan}
          onChange={(plan) => set({ plan })}
          disabled={disabled}
          lineName={separate || form.setup === "gc_only" ? "General Conditions" : form.setup === "gr_only" ? "General Requirements" : "GRs/GCs"}
        />
      ) : null}
    </section>
  );
}
