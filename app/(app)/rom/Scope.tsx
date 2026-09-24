"use client";

import { SCOPE_QUESTIONS, type GateAnswers } from "@/lib/rom/gates";

import "./scope.css";

// LA-1028. The Scope module above Run ROM, next to the GRs/GCs module: one
// row per yes/no scope question (CONTEXT.md: Branch gate), prefilled from
// the project record, sent with the run request, and recorded with it. This
// is what makes the intake's scope questions actually switch a canonical
// item on or off, instead of only showing up as a line in the assumptions.

export type GateAnswerChoice = "yes" | "no" | "dont_know" | "";

/** One value per question the module shows. Blank means nobody has answered it for this run. */
export type ScopeForm = Record<string, GateAnswerChoice>;

const CHOICES: { value: Exclude<GateAnswerChoice, "">; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "dont_know", label: "Don't know" },
];

export function initialScopeForm(defaults: GateAnswers | undefined): ScopeForm {
  const form: ScopeForm = {};
  for (const question of SCOPE_QUESTIONS) {
    form[question.section] = defaults?.[question.section] ?? "";
  }
  return form;
}

/** What the run request carries: every non-blank row, blank rows left out entirely. */
export function gateAnswersFrom(form: ScopeForm): Record<string, "yes" | "no" | "dont_know"> {
  const gates: Record<string, "yes" | "no" | "dont_know"> = {};
  for (const [section, value] of Object.entries(form)) {
    if (value !== "") gates[section] = value;
  }
  return gates;
}

export function ScopeControls({
  form,
  onChange,
  disabled,
}: {
  form: ScopeForm;
  onChange: (form: ScopeForm) => void;
  disabled: boolean;
}) {
  const set = (section: string, value: GateAnswerChoice) => onChange({ ...form, [section]: value });

  return (
    <section className="markup-module scope-module" aria-label="Scope">
      <h2 className="doc-title">Scope</h2>
      <p className="markup-note">
        Yes prices the item behind the question. No removes it from the total and names it as not in
        this job. Don&rsquo;t know shows it as TBD, outside the total. Left blank, it prices and is
        flagged as assumed present.
      </p>

      <div className="scope-grid">
        {SCOPE_QUESTIONS.map((question) => (
          <div className="scope-row" key={question.section}>
            <span className="field-label t-label scope-row-label">{question.label}</span>
            <div className="scope-choices" role="radiogroup" aria-label={question.label}>
              {CHOICES.map((choice) => (
                <label className="scope-choice" key={choice.value}>
                  <input
                    type="radio"
                    name={`scope-${question.section}`}
                    checked={form[question.section] === choice.value}
                    disabled={disabled}
                    onChange={() => set(question.section, choice.value)}
                  />
                  {choice.label}
                </label>
              ))}
              <button
                className="btn btn--redline scope-clear"
                type="button"
                disabled={disabled || form[question.section] === ""}
                onClick={() => set(question.section, "")}
              >
                Clear
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
