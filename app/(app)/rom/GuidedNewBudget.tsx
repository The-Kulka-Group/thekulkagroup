"use client";

import { useEffect, useRef, useState } from "react";
import type { MarkupChoices } from "@kulka/engine";

import type { MarkupOptions } from "@/lib/rom/markup";
import { factsQuestions, gatesFromResponses, requiredAnswered, scopeQuestions } from "@/lib/rom/new-budget-flow";
import { BRANCH_GATE_ANSWERS, tier1Flow, type Question, type Responses } from "@/lib/rom/question-flow";

import type { BudgetDraft } from "./LiveBudget";
import { initialMarkupForm, markupChoicesFrom, MarkupControls, METHODS, SETUPS, type MarkupForm } from "./Markups";
import "./scope.css";

// LA-1141. The New budget panel walks Facts, Scope and Markups before Review
// instead of asking three facts and leaving parking, demolition's structure
// count, the nine scope gates and GRs/GCs to be discovered later. LA-1140
// already stopped a new budget from running a ROM the moment it was created;
// this closes the gap that left, where an unanswered gate always prices as
// "assumed present" (CONTEXT.md: Branch gate) the first time anyone actually
// ran the budget. The Facts and Scope steps ask exactly what
// config/rom/tier1-flow.json declares, read through lib/rom/new-budget-flow.ts
// and lib/rom/question-flow.ts, so this file states no question's wording,
// choices, or follow-up condition itself.
//
// "Add and run" and "Add without running" both create the project first
// (POST /api/rom/projects), the same call New budget always made. A failed
// run afterward leaves that project and its answers in place -- CONTEXT.md's
// audit trail already treats a run as its own record, not a precondition for
// the project existing -- so retrying "Add and run" reuses the project it
// already made rather than creating a second one.

const STEP_LABELS = ["Facts", "Scope", "Markups", "Review"] as const;
type Step = 1 | 2 | 3 | 4;

const FRAMING_CHOICES: { value: "wood" | "metal" | ""; label: string }[] = [
  { value: "wood", label: "Wood" },
  { value: "metal", label: "Metal" },
  { value: "", label: "Not Set" },
];

function choiceLabel(question: Question | undefined, value: string): string {
  if (!value) return "Not Answered";
  return question?.choices?.find((choice) => choice.value === value)?.label ?? value;
}

function gateLabel(value: string): string {
  return BRANCH_GATE_ANSWERS.find((answer) => answer.value === value)?.label ?? "Not Answered";
}

function Field({
  question,
  value,
  onAnswer,
  disabled,
}: {
  question: Question;
  value: string;
  onAnswer: (id: string, value: string) => void;
  disabled: boolean;
}) {
  if (question.kind === "branch_gate") {
    return (
      <div className="scope-row">
        <span className="field-label t-label scope-row-label">{question.prompt}</span>
        <div className="scope-choices" role="radiogroup" aria-label={question.prompt}>
          {BRANCH_GATE_ANSWERS.map((answer) => (
            <label className="scope-choice" key={answer.value}>
              <input
                type="radio"
                name={`gnb-${question.id}`}
                checked={value === answer.value}
                disabled={disabled}
                onChange={() => onAnswer(question.id, answer.value)}
              />
              {answer.label}
            </label>
          ))}
        </div>
      </div>
    );
  }

  return (
    <label>
      <span className="field-label t-label">{question.prompt}</span>
      {question.kind === "choice" ? (
        <select
          className="input"
          disabled={disabled}
          value={value}
          onChange={(e) => onAnswer(question.id, e.target.value)}
        >
          <option value="">Choose One</option>
          {question.choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input num"
          inputMode="numeric"
          disabled={disabled}
          value={value}
          onChange={(e) => onAnswer(question.id, e.target.value)}
        />
      )}
      {question.help ? <span className="markup-note markup-note--inline">{question.help}</span> : null}
    </label>
  );
}

export function GuidedNewBudget({
  markupOptions,
  onCreated,
  onDraft,
}: {
  /** Rate tables, fee and insurance parameters (LA-1016). Missing means the Markups step falls back to the run's own recorded defaults. */
  markupOptions?: MarkupOptions;
  onCreated: (projectId: string) => void;
  /** Every change to the answers, so the page can show the budget building behind the panel (LA-1142). */
  onDraft?: (draft: BudgetDraft) => void;
}) {
  const definition = tier1Flow();
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [framingSystem, setFramingSystem] = useState<"wood" | "metal" | "">("");
  const [responses, setResponses] = useState<Responses>({ project_type: "multifamily", construction_kind: "new" });
  const [markupForm, setMarkupForm] = useState<MarkupForm>(() => initialMarkupForm(markupOptions, null));
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // LA-1142: the preview behind the panel. Markups join once the estimator
  // reaches the Markups step and stay after it, even going back, so the
  // total never loses GRs/GCs the estimator has already seen added. A form
  // mid-edit that does not parse keeps the last choice that did.
  const [reachedMarkups, setReachedMarkups] = useState(false);
  const lastMarkups = useRef<MarkupChoices | null>(null);
  // LA-1147: the preview stays empty until the project has a name.
  const named = name.trim() !== "";
  useEffect(() => {
    if (reachedMarkups && markupOptions) {
      const parsed = markupChoicesFrom(markupForm, markupOptions);
      if (parsed.ok) lastMarkups.current = parsed.markups;
    }
    const markups = reachedMarkups && markupOptions ? lastMarkups.current : null;
    onDraft?.({ named, responses, framing: framingSystem, markups });
  }, [onDraft, named, responses, framingSystem, reachedMarkups, markupForm, markupOptions]);

  const answer = (id: string, value: string) => setResponses((current) => ({ ...current, [id]: value }));

  const facts = factsQuestions(definition, responses);
  const scope = scopeQuestions(definition, responses);
  const factsById = new Map(facts.map((q) => [q.id, q]));
  const factsReady = name.trim() !== "" && requiredAnswered(facts, responses);
  const scopeReady = requiredAnswered(scope, responses);

  function back() {
    if (busy) return;
    setError(null);
    setStep((current) => (current > 1 ? ((current - 1) as Step) : current));
  }

  function next() {
    if (busy) return;
    if ((step === 1 && !factsReady) || (step === 2 && !scopeReady)) return;
    setError(null);
    if (step >= 2) setReachedMarkups(true);
    setStep((current) => (current < 4 ? ((current + 1) as Step) : current));
  }

  /** Creates the project once, and reuses it on a retry after a failed run. */
  async function ensureProject(): Promise<string | null> {
    if (createdProjectId) return createdProjectId;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rom/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          grossSquareFeet: Number(responses.gross_square_feet),
          projectType: responses.project_type,
          constructionKind: responses.construction_kind,
          framingSystem: framingSystem || null,
          parkingType: responses.parking_type || null,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.projectId !== "string") {
        setError(body.error ?? "The project could not be added.");
        setBusy(false);
        return null;
      }
      setCreatedProjectId(body.projectId as string);
      return body.projectId as string;
    } catch {
      setError("The project could not be added. Check the connection and try again.");
      setBusy(false);
      return null;
    }
  }

  async function addWithoutRunning() {
    if (busy) return;
    const id = await ensureProject();
    setBusy(false);
    if (id) onCreated(id);
  }

  async function addAndRun() {
    if (busy) return;
    const id = await ensureProject();
    if (!id) return;

    let markups: MarkupChoices | undefined;
    if (markupOptions) {
      const parsed = markupChoicesFrom(markupForm, markupOptions);
      if (!parsed.ok) {
        setError(parsed.error);
        setBusy(false);
        return;
      }
      markups = parsed.markups;
    }

    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          // The tier-1 answers reach the run itself, including parking type
          // and demolition's structure count, which have no Run settings
          // field of their own (LA-1141).
          responses,
          // The same answers, as the Scope module's gate map, so this run
          // saves them to the project the way Run settings does (LA-1109).
          gates: gatesFromResponses(definition, responses),
          ...(markups ? { markups } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The run failed. The project and its answers were saved, so you can try again.");
        setBusy(false);
        return;
      }
      onCreated(id);
    } catch {
      setError("The site could not reach the engine. The project and its answers were saved, so you can try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <ol className="rb-steps" aria-label="Steps">
        {STEP_LABELS.map((label, index) => {
          const n = (index + 1) as Step;
          return (
            <li
              key={label}
              className={`rb-step${step === n ? " rb-step--active" : ""}${step > n ? " rb-step--done" : ""}`}
              aria-current={step === n ? "step" : undefined}
            >
              {n}. {label}
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <section className="markup-module" aria-label="Facts">
          <div className="markup-grid">
            <label>
              <span className="field-label t-label">Project Name</span>
              <input className="input" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
            </label>
            {facts.map((question) => (
              <Field
                key={question.id}
                question={question}
                value={responses[question.id] ?? ""}
                onAnswer={answer}
                disabled={busy}
              />
            ))}
            <label>
              <span className="field-label t-label">Framing System</span>
              <select
                className="input"
                value={framingSystem}
                disabled={busy}
                onChange={(e) => setFramingSystem(e.target.value as "wood" | "metal" | "")}
              >
                {FRAMING_CHOICES.map((choice) => (
                  <option key={choice.label} value={choice.value}>
                    {choice.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="markup-module scope-module" aria-label="Scope">
          <p className="markup-note">
            Yes prices the item behind the question. No removes it from the total and names it as not in
            this job. Don&rsquo;t know shows it as TBD, outside the total.
          </p>
          <div className="scope-grid">
            {scope.map((question) => (
              <Field
                key={question.id}
                question={question}
                value={responses[question.id] ?? ""}
                onAnswer={answer}
                disabled={busy}
              />
            ))}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        markupOptions ? (
          <MarkupControls options={markupOptions} form={markupForm} onChange={setMarkupForm} disabled={busy} />
        ) : (
          <p className="rb-pp">Rate tables could not be read, so this run will use the recorded defaults.</p>
        )
      ) : null}

      {step === 4 ? (
        <section aria-label="Review">
          <h3>Facts</h3>
          <p className="rb-pp">
            {name.trim() || "Untitled Project"}, <span className="num">{responses.gross_square_feet || "0"}</span> SF
          </p>
          <p className="rb-pp">
            {choiceLabel(factsById.get("project_type"), responses.project_type ?? "")},{" "}
            {choiceLabel(factsById.get("construction_kind"), responses.construction_kind ?? "")}, framing{" "}
            {framingSystem || "not set"}, parking {choiceLabel(factsById.get("parking_type"), responses.parking_type ?? "")}
          </p>
          <h3>Scope</h3>
          {scope.map((question) => (
            <p className="rb-pp" key={question.id}>
              {question.prompt}{" "}
              <b>
                {question.kind === "branch_gate"
                  ? gateLabel(responses[question.id] ?? "")
                  : responses[question.id] || "Not Answered"}
              </b>
            </p>
          ))}
          {markupOptions ? (
            <>
              <h3>GRs / GCs</h3>
              <p className="rb-pp">
                {/* The same labels the Markups step shows, not the stored codes. */}
                <b>{SETUPS.find((one) => one.value === markupForm.setup)?.label ?? markupForm.setup}</b>, priced
                by <b>{(METHODS.find((one) => one.value === markupForm.method)?.label ?? markupForm.method).toLowerCase()}</b>.
              </p>
            </>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="rb-acts">
        {step > 1 ? (
          <button className="btn" type="button" onClick={back} disabled={busy}>
            Back
          </button>
        ) : null}
        {step < 4 ? (
          <button
            className="btn btn--primary"
            type="button"
            onClick={next}
            disabled={busy || (step === 1 && !factsReady) || (step === 2 && !scopeReady)}
          >
            Next
          </button>
        ) : (
          <>
            <button className="btn" type="button" onClick={addWithoutRunning} disabled={busy}>
              {busy ? "Adding" : "Add Without Running"}
            </button>
            <button className="btn btn--primary" type="button" onClick={addAndRun} disabled={busy}>
              {busy ? "Running" : "Add and Run"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
