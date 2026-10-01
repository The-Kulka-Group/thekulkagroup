"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  grMethodOf,
  planFromStaffingChoices,
  type GrMethod,
  type MarkupChoices,
  type MarkupMethod,
  type MarkupSetup,
  type ScheduleProposal,
} from "@kulka/engine";

import { personName } from "@/lib/format/person-name";
import type { MarkupOptions } from "@/lib/rom/markup";

import { GrRateCard } from "./GrRateCard";
import { ResourcePlanEditor } from "./ResourcePlanEditor";
import {
  applyProposalToPlanForm,
  emptyPlanForm,
  planFormFrom,
  NO_ANSWERS,
  planFromForm,
  withRuleLines,
  type PlanAnswers,
  type PlanForm,
  type ScheduleView,
} from "./resource-plan-form";

import "./markups.css";

// LA-1016. The GRs/GCs module in Run settings. Every figure the module offers
// comes from the server (rate tables, parameters, history counts) or from what
// the user types. Nothing here supplies a default staffing mix. The waterfall
// it produces (subtotal, GRs/GCs, fee, insurance, total) shows in the total
// panel on /rom since LA-1101. LA-1397 replaced Staffing and Duration with
// Allocated Resources (ResourcePlanEditor.tsx). LA-1398 lets General
// Requirements take its own method under separate lines, a plan included.

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
  const blank = (method: MarkupMethod | GrMethod, percent: string, dollars: string) =>
    (method === "usd_per_gsf" ? dollars : percent).trim() === "";
  if (form.setup !== "separate") {
    // A plan prices the one line.
    if (form.method === "allocated_resources") return [];
    return !useHistory && blank(form.method, form.overridePercent, form.overridePerSf) ? ["GRs/GCs"] : [];
  }
  // LA-1398: each line by its own method. A line its plan prices needs no rate.
  const history = setupHistory(counts, form.setup);
  const grMethod = formGrMethod(form);
  const missing: string[] = [];
  if (grMethod !== "allocated_resources" && blank(grMethod, form.grOverridePercent, form.grOverridePerSf) && !history.gr) {
    missing.push("General Requirements");
  }
  if (form.method !== "allocated_resources" && blank(form.method, form.overridePercent, form.overridePerSf) && history.gc === 0) {
    missing.push("General Conditions");
  }
  return missing;
}

/**
 * The method General Requirements prices by under separate lines: the one
 * the estimator picked, or the rule runs before LA-1398 priced by.
 */
export function formGrMethod(form: Pick<MarkupForm, "method" | "grMethod">): GrMethod {
  return grMethodOf({ setup: "separate", method: form.method, ...(form.grMethod ? { grMethod: form.grMethod } : {}) });
}

function jobsWords(count: number): string {
  return count === 1 ? "1 job" : `${count} jobs`;
}

export const METHODS: { value: MarkupMethod & GrMethod; label: string }[] = [
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
  /**
   * General Requirements' own method under separate lines (LA-1398). Null
   * until the estimator picks one, and then it follows the rule runs before
   * LA-1398 priced by (formGrMethod).
   */
  grMethod: GrMethod | null;
  /** General Requirements' own plan, read only when it is priced by Allocated Resources. */
  grPlan: PlanForm;
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
export function initialMarkupForm(
  options: MarkupOptions | undefined,
  saved?: MarkupChoices | null,
  proposal?: ScheduleProposal | null,
): MarkupForm {
  const savedGrMethod = saved ? grMethodOf(saved) : "pct_of_subtotal";
  const form: MarkupForm = {
    setup: saved?.setup ?? "both",
    // LA-1397: a choice saved under the retired Staffing and Duration method
    // opens as the equivalent Allocated Resources plan.
    method: saved?.method === "staffing_duration" ? "allocated_resources" : (saved?.method ?? "pct_of_subtotal"),
    overridePercent: saved?.method === "pct_of_subtotal" ? percentText(saved.overrideRate) : "",
    overridePerSf: saved?.method === "usd_per_gsf" && saved.overrideRate !== undefined ? String(saved.overrideRate) : "",
    grOverridePercent: savedGrMethod !== "usd_per_gsf" ? percentText(saved?.grOverrideRate) : "",
    grOverridePerSf: savedGrMethod === "usd_per_gsf" && saved?.grOverrideRate !== undefined ? String(saved.grOverrideRate) : "",
    plan: savedPlan(options, saved),
    grMethod: saved?.grMethod ?? null,
    grPlan: saved?.grResourcePlan ? planFormFrom(saved.grResourcePlan) : emptyPlanForm(),
    feePercent: percentText(saved?.feeRate ?? options?.feeRate?.value),
    insurancePercent: percentText(saved?.insuranceRate ?? options?.insuranceRate?.value),
  };
  return withRuleLinesOnForm(proposal ? applyProposalToMarkupForm(form, proposal) : form, options);
}

/**
 * The plan that prices General Requirements: the separate one under Separate
 * Lines, the one plan under any other setup that includes General
 * Requirements, or none.
 */
function grPlanInUse(form: MarkupForm): "plan" | "grPlan" | null {
  if (form.setup === "separate") return formGrMethod(form) === "allocated_resources" ? "grPlan" : null;
  return form.setup !== "gc_only" && form.method === "allocated_resources" ? "plan" : null;
}

/**
 * LA-1402: a General Requirements plan with no lines opens with the lines its
 * rules switch. A plan that already has lines is left as it is. Only the
 * moments a plan is opened call this: the form's first values, and a change
 * of setup or method that puts a plan to use (changeMarkupForm).
 */
export function withRuleLinesOnForm(form: MarkupForm, options: MarkupOptions | undefined): MarkupForm {
  const rates = options?.grRates ?? [];
  const used = grPlanInUse(form);
  if (rates.length === 0 || used === null) return form;
  return { ...form, [used]: withRuleLines(form[used], rates) };
}

/**
 * One change to the form. The seed lines come in only when the change puts a
 * General Requirements plan to use that was not in use before, so an
 * estimator who removes every line keeps an empty plan.
 */
export function changeMarkupForm(form: MarkupForm, patch: Partial<MarkupForm>, options: MarkupOptions | undefined): MarkupForm {
  const next = { ...form, ...patch };
  const used = grPlanInUse(next);
  return used !== null && used !== grPlanInUse(form) ? withRuleLinesOnForm(next, options) : next;
}

/**
 * LA-1399: the proposed schedule on both plans the form holds, General
 * Conditions' (or the combined line's) and General Requirements' own. Phases
 * the estimator typed are kept.
 */
export function applyProposalToMarkupForm(form: MarkupForm, proposal: ScheduleProposal): MarkupForm {
  return {
    ...form,
    plan: applyProposalToPlanForm(form.plan, proposal),
    grPlan: applyProposalToPlanForm(form.grPlan, proposal),
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
  answers: PlanAnswers = NO_ANSWERS,
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
    // LA-1398: General Requirements' own method, recorded only where it
    // differs from the rule runs before LA-1398 priced by.
    const grMethod = formGrMethod(form);
    if (grMethod !== grMethodOf({ setup: "separate", method: form.method })) markups.grMethod = grMethod;
    if (grMethod === "allocated_resources") {
      const plan = planFromForm(form.grPlan, answers, options?.grRates);
      if (!plan.ok) return { ok: false, error: `General Requirements: ${plan.error.charAt(0).toLowerCase()}${plan.error.slice(1)}` };
      markups.grResourcePlan = plan.plan;
    }
    if (grMethod === "usd_per_gsf" && form.grOverridePerSf.trim() !== "") {
      const value = Number(form.grOverridePerSf);
      if (!(value > 0)) return { ok: false, error: "The General Requirements rate per GSF must be above zero." };
      markups.grOverrideRate = value;
    }
    if (grMethod === "pct_of_subtotal" && form.grOverridePercent.trim() !== "") {
      const value = Number(form.grOverridePercent) / 100;
      if (!(value > 0 && value < 1)) {
        return { ok: false, error: "The General Requirements percent must be above 0 and below 100." };
      }
      markups.grOverrideRate = value;
    }
  }

  if (form.method === "allocated_resources") {
    const plan = planFromForm(form.plan, answers, options?.grRates);
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
  projectId,
  schedule: initialSchedule,
  answers = NO_ANSWERS,
}: {
  options: MarkupOptions;
  form: MarkupForm;
  onChange: (form: MarkupForm) => void;
  disabled: boolean;
  /** The project the proposed schedule is for (LA-1399). Without one, no weeks are proposed. */
  projectId?: string;
  /** The proposed schedule as the page opened it. `pending` asks for one once a plan shows. */
  schedule?: ScheduleView;
  /** LA-1402: the answers the line rules read, with the schedule's construction weeks. */
  answers?: PlanAnswers;
}) {
  const set = (patch: Partial<MarkupForm>) => onChange(changeMarkupForm(form, patch, options));
  const schedule = useProposedSchedule(projectId, initialSchedule, form, onChange);
  const history = setupHistory(options.historyCounts, form.setup);
  const separate = form.setup === "separate";
  const perSf = form.method === "usd_per_gsf";
  const grMethod = formGrMethod(form);
  const grPerSf = grMethod === "usd_per_gsf";
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

        {separate ? (
          // LA-1398: under separate lines each line picks its own method.
          <label>
            <span className="field-label t-label">General Requirements Method</span>
            <select
              className="input"
              value={grMethod}
              disabled={disabled}
              onChange={(e) => set({ grMethod: e.target.value as GrMethod })}
            >
              {METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span className="field-label t-label">{separate ? "General Conditions Method" : "Method"}</span>
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

      {separate && grMethod !== "allocated_resources" ? (
        // LA-1383: General Requirements on its own line, at its own rate.
        <div className="markup-grid">
          <label>
            <span className="field-label t-label">
              {grPerSf ? "General Requirements, $ per GSF" : "General Requirements, % of Subtotal"}
            </span>
            <input
              className="input num"
              inputMode="decimal"
              placeholder="Use History"
              value={grPerSf ? form.grOverridePerSf : form.grOverridePercent}
              disabled={disabled}
              onChange={(e) =>
                set(grPerSf ? { grOverridePerSf: e.target.value } : { grOverridePercent: e.target.value })
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

      {separate && grMethod === "allocated_resources" ? (
        <ResourcePlanEditor
          options={options}
          plan={form.grPlan}
          onChange={(grPlan) => set({ grPlan })}
          disabled={disabled}
          lineName="General Requirements"
          kind="gr"
          schedule={schedule}
          answers={answers}
        />
      ) : null}

      {form.method === "allocated_resources" ? (
        <ResourcePlanEditor
          options={options}
          plan={form.plan}
          onChange={(plan) => set({ plan })}
          disabled={disabled}
          lineName={separate || form.setup === "gc_only" ? "General Conditions" : form.setup === "gr_only" ? "General Requirements" : "GRs/GCs"}
          kind={separate || form.setup === "gc_only" ? "gc" : form.setup === "gr_only" ? "gr" : "both"}
          schedule={schedule}
          answers={answers}
        />
      ) : null}

      {form.method === "allocated_resources" || (separate && grMethod === "allocated_resources") ? (
        <GrRateCard rates={options.grRates ?? []} />
      ) : null}
    </section>
  );
}

/**
 * LA-1399: the proposed schedule while a plan shows. A `pending` proposal is
 * asked for once a plan is on screen; when it lands it fills the phases the
 * estimator has not typed, on both plans, and the change runs like any other.
 * A failure leaves the weeks blank and says why.
 */
function useProposedSchedule(
  projectId: string | undefined,
  initial: ScheduleView | undefined,
  form: MarkupForm,
  onChange: (form: MarkupForm) => void,
): ScheduleView | undefined {
  const [schedule, setSchedule] = useState<ScheduleView | undefined>(projectId ? initial : undefined);
  const latest = useRef({ form, onChange });
  useEffect(() => {
    latest.current = { form, onChange };
  });
  const planShowing =
    form.method === "allocated_resources" || (form.setup === "separate" && formGrMethod(form) === "allocated_resources");
  const asking = projectId !== undefined && planShowing && schedule?.kind === "pending";

  useEffect(() => {
    if (!asking) return;
    let cancelled = false;
    (async () => {
      let next: ScheduleView;
      try {
        const response = await fetch(`/api/rom/projects/${projectId}/schedule-proposal`, { method: "POST" });
        const body = (await response.json().catch(() => ({}))) as { proposal?: ScheduleProposal; error?: string };
        next =
          response.ok && body.proposal
            ? { kind: "ready", proposal: body.proposal }
            : { kind: "failed", error: body.error ?? "The weeks could not be proposed. Enter them." };
      } catch {
        next = { kind: "failed", error: "The weeks could not be proposed. Enter them." };
      }
      if (cancelled) return;
      setSchedule(next);
      if (next.kind === "ready") {
        // Only a change to the weeks is sent on, so asking again for a proposal
        // already applied (the panel reopened) does not run the budget again.
        const current = latest.current.form;
        const applied = applyProposalToMarkupForm(current, next.proposal);
        const weeksOf = (f: MarkupForm) => JSON.stringify([f.plan.weeks, f.plan.weeksFrom, f.grPlan.weeks, f.grPlan.weeksFrom]);
        if (weeksOf(applied) !== weeksOf(current)) latest.current.onChange(applied);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [asking, projectId]);

  return schedule;
}
