"use client";

import { WEEKS_PER_MONTH, type MarkupChoices, type MarkupMethod, type MarkupSetup } from "@kulka/engine";

import type { MarkupOptions } from "@/lib/rom/markup";

import "./markups.css";

// LA-1016. The GRs/GCs module in Run settings. Every figure the module offers
// comes from the server (rate tables, parameters, history counts) or from what
// the user types. Nothing here supplies a default staffing mix. The waterfall
// it produces (subtotal, GRs/GCs, fee, insurance, total) shows in the total
// panel on /rom since LA-1101.

const WEEKLY = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const SETUPS: { value: MarkupSetup; label: string }[] = [
  { value: "both", label: "Both, one combined line" },
  { value: "gc_only", label: "General Conditions only" },
  { value: "gr_only", label: "General Requirements only" },
];

const METHODS: { value: MarkupMethod; label: string }[] = [
  { value: "pct_of_subtotal", label: "Percent of subtotal" },
  { value: "usd_per_gsf", label: "Dollars per GSF" },
  { value: "staffing_duration", label: "Staffing and duration" },
];

const BASIS_WORDS: Record<string, string> = {
  monthly: "per month",
  lump_sum: "lump sum",
  each: "each",
  lump_sum_then_monthly: "connect, then per month",
};

export type MarkupForm = {
  setup: MarkupSetup;
  method: MarkupMethod;
  overridePercent: string;
  overridePerSf: string;
  durationWeeks: string;
  staff: { rateId: string; weeks: string }[];
  fieldOffice: { rateId: string; quantity: string }[];
  feePercent: string;
  insurancePercent: string;
};

function percentText(fraction: number | undefined | null): string {
  return fraction === undefined || fraction === null ? "" : String(Number((fraction * 100).toFixed(4)));
}

export function initialMarkupForm(options: MarkupOptions | undefined): MarkupForm {
  return {
    setup: "both",
    method: "pct_of_subtotal",
    overridePercent: "",
    overridePerSf: "",
    durationWeeks: "",
    staff: [],
    fieldOffice: [],
    feePercent: percentText(options?.feeRate?.value),
    insurancePercent: percentText(options?.insuranceRate?.value),
  };
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

  if (form.method === "staffing_duration") {
    const weeks = Number(form.durationWeeks);
    if (form.durationWeeks.trim() === "" || !(weeks > 0)) {
      return { ok: false, error: "Enter the job duration in weeks." };
    }
    markups.durationWeeks = weeks;
    markups.staff = [];
    for (const pick of form.staff) {
      if (pick.weeks.trim() === "") {
        markups.staff.push({ rateId: pick.rateId });
        continue;
      }
      const roleWeeks = Number(pick.weeks);
      if (!(roleWeeks > 0)) return { ok: false, error: "Each role's weeks must be above zero." };
      markups.staff.push({ rateId: pick.rateId, weeks: roleWeeks });
    }
    markups.fieldOffice = [];
    for (const pick of form.fieldOffice) {
      if (pick.quantity.trim() === "") {
        markups.fieldOffice.push({ rateId: pick.rateId });
        continue;
      }
      const quantity = Number(pick.quantity);
      if (!(quantity > 0)) return { ok: false, error: "Each item's quantity must be above zero." };
      markups.fieldOffice.push({ rateId: pick.rateId, quantity });
    }
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
  const staffById = new Map(options.staffingRates.map((r) => [r.id, r]));
  const officeById = new Map(options.fieldOfficeRates.map((r) => [r.id, r]));
  const jobs = options.historyCounts[form.setup];
  const weeks = Number(form.durationWeeks);

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
          ? `Fee defaults to ${percentText(options.feeRate.value)}%, recorded by ${options.feeRate.provenance.recordedBy} on ${options.feeRate.provenance.recordedAt}. `
          : "No fee rate is recorded yet, so enter one. "}
        {options.insuranceRate
          ? `Insurance defaults to ${percentText(options.insuranceRate.value)}%, recorded by ${options.insuranceRate.provenance.recordedBy} on ${options.insuranceRate.provenance.recordedAt}. `
          : "No insurance rate is recorded yet, so enter one. "}
        A change here applies to this ROM only.
      </p>

      {form.method === "pct_of_subtotal" || form.method === "usd_per_gsf" ? (
        <div className="markup-grid">
          <label>
            <span className="field-label t-label">
              {form.method === "pct_of_subtotal" ? "Your rate, % of subtotal" : "Your rate, $ per GSF"}
            </span>
            <input
              className="input num"
              inputMode="decimal"
              placeholder="Use history"
              value={form.method === "pct_of_subtotal" ? form.overridePercent : form.overridePerSf}
              disabled={disabled}
              onChange={(e) =>
                set(
                  form.method === "pct_of_subtotal"
                    ? { overridePercent: e.target.value }
                    : { overridePerSf: e.target.value },
                )
              }
            />
          </label>
          <p className="markup-note markup-note--inline">
            {jobs === 0
              ? "No imported budget has a figure for this setup yet. Leave the rate blank and the line shows as TBD, outside the total."
              : `History for this setup: ${jobs === 1 ? "1 job" : `${jobs} jobs`}. Leave the rate blank to use it.`}
          </p>
        </div>
      ) : null}

      {form.method === "staffing_duration" ? (
        <>
          <div className="markup-grid">
            <label>
              <span className="field-label t-label">Job duration, weeks</span>
              <input
                className="input num"
                inputMode="decimal"
                value={form.durationWeeks}
                disabled={disabled}
                onChange={(e) => set({ durationWeeks: e.target.value })}
              />
            </label>
            <p className="markup-note markup-note--inline">
              Monthly items price at weeks divided by {WEEKS_PER_MONTH}
              {weeks > 0 ? `, so ${(weeks / WEEKS_PER_MONTH).toFixed(2)} months` : ""}.
            </p>
          </div>

          <h3 className="t-label markup-sub">Staff</h3>
          {form.staff.length === 0 ? <p className="markup-note">No role picked yet.</p> : null}
          <ul className="markup-picks">
            {form.staff.map((pick, index) => {
              const rate = staffById.get(pick.rateId);
              return (
                <li key={`${pick.rateId}-${index}`}>
                  <span>
                    {rate?.role}, {rate?.daysPerWeek} days/week,{" "}
                    <span className="num">
                      {rate && rate.weeklyRateLow === rate.weeklyRateHigh
                        ? `${WEEKLY.format(rate.weeklyRateLow)}/week`
                        : `${WEEKLY.format(rate?.weeklyRateLow ?? 0)} to ${WEEKLY.format(rate?.weeklyRateHigh ?? 0)}/week`}
                    </span>
                  </span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    aria-label="Weeks"
                    placeholder={form.durationWeeks ? `${form.durationWeeks} weeks` : "Weeks"}
                    value={pick.weeks}
                    disabled={disabled}
                    onChange={(e) =>
                      set({
                        staff: form.staff.map((p, i) => (i === index ? { ...p, weeks: e.target.value } : p)),
                      })
                    }
                  />
                  <button
                    className="btn btn--redline"
                    type="button"
                    disabled={disabled}
                    onClick={() => set({ staff: form.staff.filter((_, i) => i !== index) })}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          <select
            className="input"
            value=""
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) set({ staff: [...form.staff, { rateId: e.target.value, weeks: "" }] });
            }}
          >
            <option value="">Add a role&hellip;</option>
            {options.staffingRates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.role}, {r.daysPerWeek} days/week
              </option>
            ))}
          </select>

          <h3 className="t-label markup-sub">Field office</h3>
          {form.fieldOffice.length === 0 ? <p className="markup-note">No item picked yet.</p> : null}
          <ul className="markup-picks">
            {form.fieldOffice.map((pick, index) => {
              const rate = officeById.get(pick.rateId);
              return (
                <li key={`${pick.rateId}-${index}`}>
                  <span>
                    {rate?.item},{" "}
                    <span className="num">
                      {rate?.rateBasis === "lump_sum_then_monthly"
                        ? `${WEEKLY.format(rate.rate)} then ${WEEKLY.format(rate.recurringRate ?? 0)} per month`
                        : `${WEEKLY.format(rate?.rate ?? 0)} ${BASIS_WORDS[rate?.rateBasis ?? ""] ?? ""}`}
                    </span>
                  </span>
                  <input
                    className="input num"
                    inputMode="decimal"
                    aria-label="Quantity"
                    placeholder="Qty 1"
                    value={pick.quantity}
                    disabled={disabled}
                    onChange={(e) =>
                      set({
                        fieldOffice: form.fieldOffice.map((p, i) =>
                          i === index ? { ...p, quantity: e.target.value } : p,
                        ),
                      })
                    }
                  />
                  <button
                    className="btn btn--redline"
                    type="button"
                    disabled={disabled}
                    onClick={() => set({ fieldOffice: form.fieldOffice.filter((_, i) => i !== index) })}
                  >
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
          <select
            className="input"
            value=""
            disabled={disabled}
            onChange={(e) => {
              if (e.target.value) {
                set({ fieldOffice: [...form.fieldOffice, { rateId: e.target.value, quantity: "" }] });
              }
            }}
          >
            <option value="">Add a field-office item&hellip;</option>
            {options.fieldOfficeRates.map((r) => (
              <option key={r.id} value={r.id}>
                {r.item}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </section>
  );
}
