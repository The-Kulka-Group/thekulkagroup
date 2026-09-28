"use client";

import { useEffect, useRef, useState } from "react";
import type { MarkupChoices } from "@kulka/engine";

import type { MarkupOptions } from "@/lib/rom/markup";
import { factsQuestions, gatesFromResponses, requiredAnswered, scopeQuestions } from "@/lib/rom/new-budget-flow";
import {
  BRANCH_GATE_ANSWERS,
  isQuestionRequired,
  numberAnswerIsValid,
  tier1Flow,
  type Question,
  type Responses,
} from "@/lib/rom/question-flow";

import type { BudgetDraft } from "./LiveBudget";
import { initialMarkupForm, markupChoicesFrom, MarkupControls, METHODS, SETUPS, type MarkupForm } from "./Markups";
import "./scope.css";

// LA-1225. New Budget is a setup card, then one question at a time. Matt
// (2026-09-27): the questions start as soon as the project is set up, each
// answer brings its boxes onto the budget behind the panel as it is given,
// and there is no Generate or Run button at the end.
//
// - The first question appears under the setup fields as soon as the
//   required ones are filled in. Answering it creates the project (POST
//   /api/rom/projects), and setup folds to one line (LA-1230: there is no
//   Start button, which on a phone sat below the screen's edge).
// - Every answer after that saves: the facts through PATCH
//   /api/rom/projects/[id], the gate answers and GRs/GCs choices through PUT
//   /api/rom/projects/[id]/answers. Closing the panel midway leaves a saved
//   project holding every answer given so far.
// - Answering the last question records the run itself (POST /api/rom) and
//   lands the page on that saved budget.
//
// The questions, their wording, choices and follow-ups still come only from
// config/rom/tier1-flow.json, read through lib/rom/new-budget-flow.ts and
// lib/rom/question-flow.ts (LA-1141). Parking is the first question rather
// than a setup field, because it is a scope answer that moves the budget.

const FRAMING_CHOICES: { value: "wood" | "metal" | ""; label: string }[] = [
  { value: "wood", label: "Wood" },
  { value: "metal", label: "Metal" },
  { value: "", label: "Not Set" },
];

type Slot =
  | { kind: "flow"; question: Question }
  | { kind: "markup_setup" }
  | { kind: "markup_method" }
  /** LA-1256: the GRs/GCs rate, so New Budget never finishes with GRs/GCs TBD. */
  | { kind: "markup_rate" }
  | { kind: "markup_detail" };

type SaveState = "idle" | "saving" | "saved" | "failed";

function slotKey(slot: Slot): string {
  return slot.kind === "flow" ? slot.question.id : slot.kind;
}

/** A setup-card field: a choice, a number or the ZIP. */
function SetupField({
  question,
  value,
  onAnswer,
  disabled,
  required,
}: {
  question: Question;
  value: string;
  onAnswer: (id: string, value: string) => void;
  disabled: boolean;
  required: boolean;
}) {
  return (
    <label>
      <span className="field-label t-label">
        {question.prompt}
        {required ? " *" : ""}
      </span>
      {question.kind === "choice" ? (
        <select className="input" disabled={disabled} value={value} onChange={(e) => onAnswer(question.id, e.target.value)}>
          <option value="">Choose One</option>
          {question.choices?.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className={question.kind === "number" ? "input num" : "input"}
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

/** One answer button. The current answer, when going back, shows as picked. */
function Choice({
  label,
  picked,
  onPick,
  disabled,
  autoFocus,
}: {
  label: string;
  picked: boolean;
  onPick: () => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  return (
    <button
      type="button"
      className={`nb-choice${picked ? " nb-choice--picked" : ""}`}
      aria-pressed={picked}
      disabled={disabled}
      onClick={onPick}
      autoFocus={autoFocus}
    >
      {label}
    </button>
  );
}

export function GuidedNewBudget({
  markupOptions,
  onCreated,
  onDraft,
}: {
  /** Rate tables, fee and insurance parameters (LA-1016). Missing means the GRs/GCs questions are skipped and the run uses its recorded defaults. */
  markupOptions?: MarkupOptions;
  onCreated: (projectId: string) => void;
  /** Every change to the answers, so the page can show the budget building behind the panel (LA-1142). */
  onDraft?: (draft: BudgetDraft) => void;
}) {
  const definition = tier1Flow();
  // Setup stays open until the first answer creates the project, then
  // folds to one line with an Edit link (LA-1230).
  const [editingSetup, setEditingSetup] = useState(false);
  const [index, setIndex] = useState(0);
  const [name, setName] = useState("");
  const [framingSystem, setFramingSystem] = useState<"wood" | "metal" | "">("");
  const [responses, setResponses] = useState<Responses>({
    project_type: "multifamily",
    construction_kind: "new",
    // LA-1199: Building Count defaults to 1, matching projects.building_count's
    // own NOT NULL DEFAULT 1 (20260920140000_rom_spec_decisions_catchup.sql).
    building_count: "1",
    // Matt, 2026-09-28: Kulka's work is nearly always open shop, so Labor
    // Type starts there and changes only when a job is union or prevailing wage.
    labor_type: "open_shop",
  });
  const [markupForm, setMarkupForm] = useState<MarkupForm>(() => initialMarkupForm(markupOptions, null));
  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [finishFailed, setFinishFailed] = useState(false);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const questionRef = useRef<HTMLDivElement>(null);

  const setup = factsQuestions(definition, responses).filter((q) => q.id !== "parking_type");
  const setupReady = name.trim() !== "" && requiredAnswered(setup, responses);

  function slotsFor(current: Responses, form: MarkupForm): Slot[] {
    const flow = [
      ...factsQuestions(definition, current).filter((q) => q.id === "parking_type"),
      ...scopeQuestions(definition, current),
    ];
    const slots: Slot[] = flow.map((question) => ({ kind: "flow", question }));
    if (markupOptions) {
      slots.push({ kind: "markup_setup" }, { kind: "markup_method" });
      if (form.method === "staffing_duration") slots.push({ kind: "markup_detail" });
      else slots.push({ kind: "markup_rate" });
    }
    return slots;
  }

  const slots = slotsFor(responses, markupForm);
  const slot = setupReady ? slots[Math.min(index, slots.length - 1)] : undefined;
  const showSetup = !projectId || editingSetup;
  const questionShowing = slot !== undefined;
  // On a phone the setup fields fill the sheet, so bring the first question
  // into view the moment it appears.
  useEffect(() => {
    if (questionShowing && !projectId) questionRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [questionShowing, projectId]);
  // LA-1142: markups join the preview once the estimator reaches them, and
  // stay after, even going back, so the total never loses GRs/GCs already
  // seen. `advance` sets it on the way into the first GRs/GCs question.
  const [reachedMarkups, setReachedMarkups] = useState(false);

  const lastMarkups = useRef<MarkupChoices | null>(null);
  const named = name.trim() !== "";
  useEffect(() => {
    if (reachedMarkups && markupOptions) {
      const parsed = markupChoicesFrom(markupForm, markupOptions);
      if (parsed.ok) lastMarkups.current = parsed.markups;
    }
    const markups = reachedMarkups && markupOptions ? lastMarkups.current : null;
    onDraft?.({ named, responses, framing: framingSystem, markups });
  }, [onDraft, named, responses, framingSystem, reachedMarkups, markupForm, markupOptions]);

  function projectBody(current: Responses) {
    return {
      name: name.trim(),
      grossSquareFeet: Number(current.gross_square_feet),
      projectType: current.project_type,
      constructionKind: current.construction_kind,
      framingSystem: framingSystem || null,
      parkingType: current.parking_type || null,
      storiesAboveGrade: current.stories_above_grade ? Number(current.stories_above_grade) : null,
      unitCount: current.unit_count ? Number(current.unit_count) : null,
      buildingCount: current.building_count ? Number(current.building_count) : null,
      zip: current.zip || null,
      // LA-1212: "0" is a legal Elevator Count (no elevator), so this is
      // checked against blank rather than truthiness.
      elevatorCount:
        current.elevator_count !== undefined && current.elevator_count !== "" ? Number(current.elevator_count) : null,
      // LA-1239: demolition's building answers go on the project too, so a
      // later run still has them and prices demolition.
      demolitionStructureCount:
        current.demolition_structure_count !== undefined && current.demolition_structure_count !== ""
          ? Number(current.demolition_structure_count)
          : null,
      demolitionStructureSquareFeet: current.demolition_structure_square_feet
        ? Number(current.demolition_structure_square_feet)
        : null,
      demolitionStructureType: current.demolition_structure_type || null,
      laborType: current.labor_type || "open_shop",
    };
  }

  /** The GRs/GCs choices to save or run with, once the estimator has reached them. */
  function markupsFor(form: MarkupForm, reached: boolean): MarkupChoices | undefined {
    if (!reached || !markupOptions) return undefined;
    const parsed = markupChoicesFrom(form, markupOptions);
    return parsed.ok ? parsed.markups : undefined;
  }

  /**
   * Saves the answers as they now stand. Saves run one after another, so a
   * slow earlier save can never land after a later one and undo it.
   */
  function persist(id: string, current: Responses, form: MarkupForm, reached: boolean) {
    setSaveState("saving");
    const markups = markupsFor(form, reached);
    saveChain.current = saveChain.current
      .then(async () => {
        const [facts, answers] = await Promise.all([
          fetch(`/api/rom/projects/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(projectBody(current)),
          }),
          fetch(`/api/rom/projects/${id}/answers`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gates: gatesFromResponses(definition, current), ...(markups ? { markups } : {}) }),
          }),
        ]);
        setSaveState(facts.ok && answers.ok ? "saved" : "failed");
      })
      .catch(() => setSaveState("failed"));
  }

  /** Creates the project from the setup fields and the first answer. */
  async function createProject(current: Responses): Promise<string | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rom/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectBody(current)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.projectId !== "string") {
        setError(body.error ?? "The project could not be added.");
        return null;
      }
      setProjectId(body.projectId as string);
      return body.projectId as string;
    } catch {
      setError("The project could not be added. Check the connection and try again.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  /** Records the run once the last question is answered, then opens the saved budget. */
  async function finish(projectId: string, current: Responses, form: MarkupForm) {
    setBusy(true);
    setError(null);
    setFinishFailed(false);
    try {
      await saveChain.current;
      const markups = markupsFor(form, true);
      const response = await fetch("/api/rom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          // Demolition's follow-ups and the other intake answers with no
          // project column reach the run through `responses` (LA-1141).
          responses: current,
          gates: gatesFromResponses(definition, current),
          ...(markups ? { markups } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The budget could not be saved. Every answer is on the project, so you can try again.");
        setFinishFailed(true);
        setBusy(false);
        return;
      }
      onCreated(projectId);
    } catch {
      setError("The site could not reach the engine. Every answer is on the project, so you can try again.");
      setFinishFailed(true);
      setBusy(false);
    }
  }

  /** Saves this answer and moves on, or finishes after the last question. */
  async function advance(current: Responses, form: MarkupForm) {
    // LA-1230: there is no Start button. The first answer creates the
    // project, with that answer already on it.
    const id = projectId ?? (await createProject(current));
    if (!id) return;
    setEditingSetup(false);
    const nextSlots = slotsFor(current, form);
    const nextIndex = index + 1;
    const reached = reachedMarkups || (nextIndex < nextSlots.length && nextSlots[nextIndex].kind !== "flow");
    if (reached) setReachedMarkups(true);
    persist(id, current, form, reached);
    if (nextIndex >= nextSlots.length) {
      void finish(id, current, form);
    } else {
      setIndex(nextIndex);
    }
  }

  function pickAnswer(id: string, value: string) {
    if (busy) return;
    const current = { ...responses, [id]: value };
    setResponses(current);
    setError(null);
    void advance(current, markupForm);
  }

  function submitNumber(question: Question) {
    if (busy) return;
    const value = (responses[question.id] ?? "").trim();
    if (value === "" ? isQuestionRequired(question, responses) : !numberAnswerIsValid(question, value)) {
      setError(value === "" ? "This one needs an answer." : "Enter a whole number.");
      return;
    }
    setError(null);
    void advance(responses, markupForm);
  }

  function pickMarkup(change: Partial<MarkupForm>) {
    if (busy) return;
    const form = { ...markupForm, ...change };
    setMarkupForm(form);
    setError(null);
    void advance(responses, form);
  }

  function submitMarkupDetail() {
    if (busy || !markupOptions) return;
    const parsed = markupChoicesFrom(markupForm, markupOptions);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    void advance(responses, markupForm);
  }

  /**
   * LA-1256 (Matt, 2026-09-28): the last question requires a rate. A blank
   * rate is allowed only when imported budgets carry history for the setup,
   * and then only through Use History, so the run never lands on TBD.
   */
  function submitMarkupRate(useHistory: boolean) {
    if (busy || !markupOptions) return;
    const form = useHistory ? { ...markupForm, overridePercent: "", overridePerSf: "" } : markupForm;
    const typed = form.method === "pct_of_subtotal" ? form.overridePercent : form.overridePerSf;
    if (!useHistory && typed.trim() === "") {
      setError(
        form.method === "pct_of_subtotal"
          ? "Enter the GRs/GCs percent of subtotal."
          : "Enter the GRs/GCs rate in dollars per GSF.",
      );
      return;
    }
    const parsed = markupChoicesFrom(form, markupOptions);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setMarkupForm(form);
    setError(null);
    void advance(responses, form);
  }

  function back() {
    if (busy) return;
    setError(null);
    if (index > 0) setIndex(index - 1);
  }

  const setupFields = (
    <section className="markup-module nb-setup" aria-label="Project Setup">
      <div className="markup-grid">
        <label>
          <span className="field-label t-label">Project Name *</span>
          <input className="input" value={name} disabled={busy} autoFocus onChange={(e) => setName(e.target.value)} />
        </label>
        {setup.map((question) => (
          <SetupField
            key={question.id}
            question={question}
            value={responses[question.id] ?? ""}
            onAnswer={(id, value) => setResponses((current) => ({ ...current, [id]: value }))}
            disabled={busy}
            required={isQuestionRequired(question, responses)}
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
  );

  // What setup still lacks, by name, so the first question's absence is
  // never a mystery (LA-1230).
  const missing = [
    ...(name.trim() === "" ? ["Project Name"] : []),
    ...setup.filter((question) => !requiredAnswered([question], responses)).map((question) => question.prompt),
  ];

  const summary = (
    <p className="nb-sum">
      <b>{name.trim()}</b>, <span className="num">{Number(responses.gross_square_feet).toLocaleString("en-US")}</span> SF{" "}
      <button className="nb-back" type="button" disabled={busy} onClick={() => setEditingSetup(true)}>
        Edit
      </button>
    </p>
  );

  if (!slot) {
    return (
      <div className="nb">
        {setupFields}
        <p className="nb-help nb-missing">Fill in {missing.join(", ")} and the first question appears here.</p>
        {error ? (
          <p className="rb-pp rb-pp--error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }
  const position = Math.min(index, slots.length - 1) + 1;
  // Until the first answer the estimator may still be typing in setup, so the
  // question must not take the focus away from them.
  const focusQuestion = projectId !== null && !editingSetup;

  return (
    <div className="nb">
      {showSetup ? setupFields : summary}
      {editingSetup && projectId ? (
        <p className="nb-help">
          Changes save with the next answer.{" "}
          <button
            className="nb-back"
            type="button"
            onClick={() => {
              setEditingSetup(false);
              persist(projectId, responses, markupForm, reachedMarkups);
            }}
          >
            Done
          </button>
        </p>
      ) : null}
      <div className="nb-top" ref={questionRef}>
        <span className="nb-count">
          Question <span className="num">{position}</span> of <span className="num">{slots.length}</span>
        </span>
        <span className={`nb-save nb-save--${saveState}`} role="status">
          {busy && position === slots.length
            ? "Saving the budget"
            : saveState === "saving"
              ? "Saving"
              : saveState === "failed"
                ? "Not saved. The next answer tries again."
                : saveState === "saved"
                  ? "Saved"
                  : ""}
        </span>
      </div>
      <div className="nb-track" aria-hidden="true">
        <i style={{ transform: `scaleX(${(position - 1) / slots.length})` }} />
      </div>

      <section className="nb-q" key={slotKey(slot)} aria-live="polite">
        {slot.kind === "flow" ? (
          <>
            <h3 className="nb-prompt">{slot.question.prompt}</h3>
            {slot.question.help ? <p className="nb-help">{slot.question.help}</p> : null}
            {slot.question.kind === "branch_gate" ? (
              <div className="nb-choices">
                {BRANCH_GATE_ANSWERS.map((answer, i) => (
                  <Choice
                    key={answer.value}
                    label={answer.label}
                    picked={responses[slot.question.id] === answer.value}
                    disabled={busy}
                    autoFocus={focusQuestion && i === 0}
                    onPick={() => pickAnswer(slot.question.id, answer.value)}
                  />
                ))}
              </div>
            ) : slot.question.kind === "choice" ? (
              <div className="nb-choices">
                {slot.question.choices?.map((choice, i) => (
                  <Choice
                    key={choice.value}
                    label={choice.label}
                    picked={responses[slot.question.id] === choice.value}
                    disabled={busy}
                    autoFocus={focusQuestion && i === 0}
                    onPick={() => pickAnswer(slot.question.id, choice.value)}
                  />
                ))}
              </div>
            ) : (
              <form
                className="nb-num"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitNumber(slot.question);
                }}
              >
                <input
                  className="input num"
                  inputMode="numeric"
                  aria-label={slot.question.prompt}
                  autoFocus={focusQuestion}
                  disabled={busy}
                  value={responses[slot.question.id] ?? ""}
                  onChange={(e) => setResponses((current) => ({ ...current, [slot.question.id]: e.target.value }))}
                />
                <button className="btn btn--primary" type="submit" disabled={busy}>
                  {isQuestionRequired(slot.question, responses) || (responses[slot.question.id] ?? "") !== ""
                    ? "Next"
                    : "Skip"}
                </button>
              </form>
            )}
          </>
        ) : slot.kind === "markup_setup" ? (
          <>
            <h3 className="nb-prompt">How do GRs and GCs carry on this job?</h3>
            <div className="nb-choices">
              {SETUPS.map((one, i) => (
                <Choice
                  key={one.value}
                  label={one.label}
                  picked={markupForm.setup === one.value}
                  disabled={busy}
                  autoFocus={focusQuestion && i === 0}
                  onPick={() => pickMarkup({ setup: one.value })}
                />
              ))}
            </div>
          </>
        ) : slot.kind === "markup_method" ? (
          <>
            <h3 className="nb-prompt">How should GRs and GCs be priced?</h3>
            <p className="nb-help">Fee and insurance use the recorded rates. Run Settings can change them later.</p>
            <div className="nb-choices">
              {METHODS.map((one, i) => (
                <Choice
                  key={one.value}
                  label={one.label}
                  picked={markupForm.method === one.value}
                  disabled={busy}
                  autoFocus={focusQuestion && i === 0}
                  onPick={() => pickMarkup({ method: one.value })}
                />
              ))}
            </div>
          </>
        ) : slot.kind === "markup_rate" && markupOptions ? (
          <>
            <h3 className="nb-prompt">
              {markupForm.method === "pct_of_subtotal"
                ? "What GRs/GCs rate should this budget carry, as a percent of subtotal?"
                : "What GRs/GCs rate should this budget carry, in dollars per GSF?"}
            </h3>
            <p className="nb-help">
              {markupOptions.historyCounts[markupForm.setup] > 0
                ? `Imported budgets carry a figure for this setup (${
                    markupOptions.historyCounts[markupForm.setup] === 1
                      ? "1 job"
                      : `${markupOptions.historyCounts[markupForm.setup]} jobs`
                  }). Enter your own rate or use theirs.`
                : "No imported budget has a figure for this setup, so enter the rate."}
            </p>
            <form
              className="nb-num"
              onSubmit={(e) => {
                e.preventDefault();
                submitMarkupRate(false);
              }}
            >
              <input
                className="input num"
                inputMode="decimal"
                aria-label={markupForm.method === "pct_of_subtotal" ? "GRs/GCs, % of Subtotal" : "GRs/GCs, $ per GSF"}
                autoFocus={focusQuestion}
                disabled={busy}
                value={markupForm.method === "pct_of_subtotal" ? markupForm.overridePercent : markupForm.overridePerSf}
                onChange={(e) =>
                  setMarkupForm(
                    markupForm.method === "pct_of_subtotal"
                      ? { ...markupForm, overridePercent: e.target.value }
                      : { ...markupForm, overridePerSf: e.target.value },
                  )
                }
              />
              <button className="btn btn--primary" type="submit" disabled={busy}>
                Next
              </button>
            </form>
            {markupOptions.historyCounts[markupForm.setup] > 0 ? (
              <div className="rb-acts">
                <button className="btn" type="button" onClick={() => submitMarkupRate(true)} disabled={busy}>
                  Use History
                </button>
              </div>
            ) : null}
          </>
        ) : markupOptions ? (
          <>
            <h3 className="nb-prompt">Staffing and duration</h3>
            <MarkupControls options={markupOptions} form={markupForm} onChange={setMarkupForm} disabled={busy} />
            <div className="rb-acts">
              <button className="btn btn--primary" type="button" onClick={submitMarkupDetail} disabled={busy}>
                Next
              </button>
            </div>
          </>
        ) : null}
      </section>

      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
          {finishFailed && !busy ? (
            <>
              {" "}
              <button className="nb-retry" type="button" onClick={() => projectId && void finish(projectId, responses, markupForm)}>
                Try Again
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {index > 0 ? (
        <div className="nb-foot">
          <button className="nb-back" type="button" onClick={back} disabled={busy}>
            Back
          </button>
        </div>
      ) : null}
    </div>
  );
}
