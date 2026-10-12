"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarkupChoices } from "@kulka/engine";

import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";
import type { MarkupOptions } from "@/lib/rom/markup";
import {
  factsQuestions,
  gatesFromResponses,
  lastQuestion,
  requiredAnswered,
  scopeQuestions,
} from "@/lib/rom/new-budget-flow";
import { PRICE_LEVELS } from "@/lib/rom/level-rows";
import type { PriceLevel } from "@/lib/rom/part-prices";
import {
  BRANCH_GATE_ANSWERS,
  isQuestionRequired,
  lockedLevels,
  numberAnswerIsValid,
  tier1Flow,
  type Question,
  type Responses,
} from "@/lib/rom/question-flow";

import { answerMoment, CARD_ORDER, cardMoment, setupMoment, type StageMoment } from "@/lib/rom/stage-scenes";

import { factsFor, valueText } from "./engineering";
import type { BudgetDraft } from "./LiveBudget";
import {
  changeMarkupForm,
  formGrMethod,
  initialMarkupForm,
  markupChoicesFrom,
  MarkupControls,
  METHODS,
  missingRates,
  SETUPS,
  setupHistory,
  type MarkupForm,
} from "./Markups";
import { planAnswersFromResponses, type ScheduleView } from "./resource-plan-form";
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

/**
 * LA-1399: New Budget asks for the proposed schedule once the plan shows. The
 * first answer creates the project (advance), so the project exists before
 * any markup question and MarkupControls gets its id. The facts change as the
 * estimator answers, so New Budget starts pending rather than from a state
 * read when the page opened; the server returns a proposal or a recorded
 * failure already made from the current facts without asking again.
 */
const PENDING_SCHEDULE: ScheduleView = { kind: "pending" };

const FRAMING_CHOICES: { value: "wood" | "metal" | ""; label: string }[] = [
  { value: "wood", label: "Wood" },
  { value: "metal", label: "Metal" },
  { value: "", label: "Not Set" },
];

type Slot =
  | { kind: "flow"; question: Question }
  | { kind: "markup_setup" }
  | { kind: "markup_gr_method" }
  | { kind: "markup_method" }
  /** LA-1256: the GRs/GCs rate, so New Budget never finishes with GRs/GCs TBD. */
  | { kind: "markup_rate" }
  | { kind: "markup_detail" };

type SaveState = "idle" | "saving" | "saved" | "failed";

function slotKey(slot: Slot): string {
  if (slot.kind === "flow") return slot.question.id;
  return slot.kind;
}

/**
 * LA-1318: which Design and Engineering cards belong to which answer. The
 * elevator cards follow Elevator Count; the building's own cards follow
 * Balconies, the last fact M-0 reads.
 */
const CARD_GROUP: Record<(typeof CARD_ORDER)[number], "elevators" | "building"> = {
  "V-1": "elevators",
  "V-2": "elevators",
  "V-3": "elevators",
  "A-1": "building",
  "A-2": "building",
  "S-1": "building",
  "M-0": "building",
  "M-1": "building",
  "E-1": "building",
};

/** The answers the criteria read. A change to any of them works them out again. */
function engineeringInputs(responses: Responses, framing: string): string {
  return JSON.stringify([
    responses.stories_above_grade,
    responses.elevator,
    responses.elevator_count,
    responses.levels_below_grade,
    responses.site_conditions,
    responses.retail_storefronts,
    responses.zip,
    framing,
    // LA-1281, LA-1282: what E-1, M-0 and M-1 read.
    responses.project_type,
    responses.construction_kind,
    responses.gross_square_feet,
    responses.unit_count,
    responses.building_count,
    responses.parking_type,
    responses.amenity_scope,
    responses.balconies,
    // LA-1300: what S-1 reads beyond the above.
    responses.existing_building_tie_in,
  ]);
}

/**
 * LA-1281: E-1 applies from 3 units per building (NEC 220.84), the same test
 * the server runs, so its card is never waited on when none will come.
 */
function electricalReady(responses: Responses): boolean {
  const units = Number(responses.unit_count);
  const buildings = Number(responses.building_count) > 0 ? Number(responses.building_count) : 1;
  return responses.project_type === "multifamily" && units > 0 && Math.ceil(units / buildings) >= 3;
}

/** Whether the elevator criteria have what they need: an elevator, a count and a height. */
function elevatorReady(responses: Responses): boolean {
  return (
    responses.elevator === "yes" && Number(responses.elevator_count) > 0 && Number(responses.stories_above_grade) > 0
  );
}

/** LA-2274: the balcony numbers the chosen balcony type asks, keyed as the project saves them. */
function balconyNumbers(current: Responses) {
  const number = (type: string, id: string) =>
    current.balcony_type === type && current[id] ? Number(current[id]) : null;
  return {
    balconyCount: number("full", "balcony_count"),
    balconyDeckSquareFeet: number("full", "balcony_deck_square_feet"),
    balconyRailLinearFeet: number("full", "balcony_rail_linear_feet"),
    julietCount: number("juliet", "juliet_count"),
    julietRailLinearFeet: number("juliet", "juliet_rail_linear_feet"),
  };
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
  onStageEvent,
  onCriteria,
  landedCards = [],
  level = 3,
  onLevel,
}: {
  /** Rate tables, fee and insurance parameters (LA-1016). Missing means the GRs/GCs questions are skipped and the run uses its recorded defaults. */
  markupOptions?: MarkupOptions;
  onCreated: (projectId: string) => void;
  /** Every change to the answers, so the page can show the budget building behind the panel (LA-1142). */
  onDraft?: (draft: BudgetDraft) => void;
  /**
   * LA-1318: an answer, a Design and Engineering card or the finished setup,
   * for the stage to play. The cards no longer show in this panel; the stage
   * plays them across the top of the budget.
   */
  onStageEvent?: (moment: StageMoment) => void;
  /** The Design and Engineering cards as the server last worked them out, for the stage to draw. */
  onCriteria?: (criteria: Record<string, StoredDerivedAssumption>) => void;
  /** The cards whose moment has landed on the stage. Only these price the live budget, so the budget moves as each lands. */
  landedCards?: readonly string[];
  /** LA-2218: the price level, shared with the Building View's list. Questions a higher level adds stay hidden until it is picked. */
  level?: PriceLevel;
  onLevel?: (level: PriceLevel) => void;
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
  // LA-1265, LA-1318: the Design and Engineering cards as the server worked
  // them out. A card prices the live budget only once its moment lands on the
  // stage, so the boxes change the moment the stage says so.
  const [criteria, setCriteria] = useState<Record<string, StoredDerivedAssumption>>({});
  const derivedFor = useRef<string | null>(null);
  // Which card groups the answers have reached, and the answer each card last played.
  const [dueGroups, setDueGroups] = useState<ReadonlySet<"elevators" | "building">>(new Set());
  const played = useRef<Record<string, string>>({});
  const setupPlayed = useRef(false);
  const landedKey = landedCards.join(",");
  const landedFacts = useMemo(() => {
    const landed = new Set(landedKey.split(","));
    const facts: Record<string, string> = {};
    for (const one of Object.values(criteria)) {
      if (!landed.has(one.code)) continue;
      const value = one.correction?.value ?? one.value;
      if (value.kind === "spec") Object.assign(facts, factsFor(one.code, value.text));
    }
    return facts;
  }, [criteria, landedKey]);
  const questionRef = useRef<HTMLDivElement>(null);

  const setup = factsQuestions(definition, responses).filter((q) => q.id !== "parking_type");
  const setupReady = name.trim() !== "" && requiredAnswered(setup, responses);

  function slotsFor(current: Responses, form: MarkupForm, at: PriceLevel = level): Slot[] {
    const flow = [
      ...factsQuestions(definition, current, at).filter((q) => q.id === "parking_type"),
      ...scopeQuestions(definition, current, at),
    ];
    const slots: Slot[] = [];
    for (const question of flow) {
      slots.push({ kind: "flow", question });
    }
    if (markupOptions) {
      slots.push({ kind: "markup_setup" });
      // LA-1398: under separate lines, General Requirements picks its own method first.
      const separate = form.setup === "separate";
      if (separate) slots.push({ kind: "markup_gr_method" });
      slots.push({ kind: "markup_method" });
      const planned = form.method === "allocated_resources" || (separate && formGrMethod(form) === "allocated_resources");
      slots.push(planned ? { kind: "markup_detail" } : { kind: "markup_rate" });
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
      const parsed = markupChoicesFrom(markupForm, markupOptions, planAnswersFromResponses(responses));
      if (parsed.ok) lastMarkups.current = parsed.markups;
    }
    const markups = reachedMarkups && markupOptions ? lastMarkups.current : null;
    // The criteria's facts count only while the job still has its elevator.
    const facts = elevatorReady(responses) ? landedFacts : {};
    onDraft?.({ named, responses, framing: framingSystem, markups, derivedFacts: facts });
  }, [onDraft, named, responses, framingSystem, reachedMarkups, markupForm, markupOptions, landedFacts]);

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
      // LA-2274: the balcony answers go on the project too, so a later run keeps them.
      balconyType: current.balcony_type || null,
      ...balconyNumbers(current),
    };
  }

  /** The GRs/GCs choices to save or run with, once the estimator has reached them. */
  function markupsFor(form: MarkupForm, reached: boolean, current: Responses): MarkupChoices | undefined {
    if (!reached || !markupOptions) return undefined;
    const parsed = markupChoicesFrom(form, markupOptions, planAnswersFromResponses(current));
    return parsed.ok ? parsed.markups : undefined;
  }

  /**
   * Saves the answers as they now stand. Saves run one after another, so a
   * slow earlier save can never land after a later one and undo it.
   */
  function persist(id: string, current: Responses, form: MarkupForm, reached: boolean) {
    setSaveState("saving");
    const markups = markupsFor(form, reached, current);
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
      const markups = markupsFor(form, true, current);
      const response = await fetch("/api/rom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          // Demolition's follow-ups and the other intake answers with no
          // project column reach the run through `responses` (LA-1141).
          responses: current,
          gates: gatesFromResponses(definition, current, level),
          level,
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
  async function advance(current: Responses, form: MarkupForm, answered: string | null = null) {
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
    // LA-1265, LA-1318: Elevator Count brings the elevator cards and the
    // level's last question the building's own (LA-2209 review Q2: Balconies
    // did, but Levels 1 and 2 never ask it); after that, any answer they read
    // works them out again, so the live budget prices what the run will.
    const group =
      answered === "elevator_count" && elevatorReady(current)
        ? "elevators"
        : answered !== null && answered === lastQuestion(definition, current, level)?.id && current.project_type === "multifamily"
          ? "building"
          : null;
    if (group && !dueGroups.has(group)) setDueGroups((due) => new Set([...due, group]));
    if ((group || Object.keys(criteria).length > 0) && derivedFor.current !== engineeringInputs(current, framingSystem)) {
      void deriveEngineering(id, current);
    }
    if (nextIndex >= nextSlots.length) {
      // LA-2209 review S2: a question this level does not ask never holds the budget; the run reads its gate as TBD.
      void finish(id, current, form);
    } else {
      setIndex(nextIndex);
    }
  }

  /** LA-1318: the answer's moment goes to the stage as it is given. */
  function playAnswer(question: Question, value: string) {
    const moment = answerMoment(question, value);
    if (moment) onStageEvent?.(moment);
  }

  function pickAnswer(question: Question, value: string) {
    if (busy) return;
    const current = { ...responses, [question.id]: value };
    setResponses(current);
    setError(null);
    playAnswer(question, value);
    void advance(current, markupForm, question.id);
  }

  function submitNumber(question: Question) {
    if (busy) return;
    const value = (responses[question.id] ?? "").trim();
    if (value === "" ? isQuestionRequired(question, responses) : !numberAnswerIsValid(question, value)) {
      setError(value === "" ? "This one needs an answer." : "Enter a whole number.");
      return;
    }
    setError(null);
    playAnswer(question, value);
    void advance(responses, markupForm, question.id);
  }

  function pickMarkup(change: Partial<MarkupForm>) {
    if (busy) return;
    const form = changeMarkupForm(markupForm, change, markupOptions);
    setMarkupForm(form);
    setError(null);
    void advance(responses, form);
  }

  function submitMarkupDetail() {
    if (busy || !markupOptions) return;
    // LA-1256: never finish on a TBD line, so separate lines still need a
    // General Requirements rate unless it has history of its own.
    const blanks = missingRates(markupForm, markupOptions.historyCounts, false);
    if (blanks.length > 0) {
      setError(`Enter the ${blanks.join(" and ")} rate.`);
      return;
    }
    const parsed = markupChoicesFrom(markupForm, markupOptions, planAnswersFromResponses(responses));
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
    const form = useHistory
      ? { ...markupForm, overridePercent: "", overridePerSf: "", grOverridePercent: "", grOverridePerSf: "" }
      : markupForm;
    const perSf = form.method === "usd_per_gsf";
    const mixed = form.setup === "separate" && (formGrMethod(form) === "usd_per_gsf") !== perSf;
    const blanks = missingRates(form, markupOptions.historyCounts, useHistory);
    if (blanks.length > 0) {
      setError(
        mixed
          ? `Enter the ${blanks.join(" and ")} rate.`
          : perSf
            ? `Enter the ${blanks.join(" and ")} rate in dollars per GSF.`
            : `Enter the ${blanks.join(" and ")} percent of subtotal.`,
      );
      return;
    }
    const parsed = markupChoicesFrom(form, markupOptions, planAnswersFromResponses(responses));
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setMarkupForm(form);
    setError(null);
    void advance(responses, form);
  }

  /**
   * LA-1265: works the Design and Engineering cards out on the server from
   * the answers as they stand (after the saves queued so far), and keeps what
   * comes back. A failure keeps the cards on hand; the run at the end works
   * them out again regardless.
   */
  const deriveEngineering = useCallback(
    async (id: string, current: Responses) => {
      derivedFor.current = engineeringInputs(current, framingSystem);
      try {
        await saveChain.current;
        const response = await fetch(`/api/rom/projects/${id}/derive`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responses: current }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          derivedFor.current = null;
          return;
        }
        const next: Record<string, StoredDerivedAssumption> = {};
        for (const one of (body.criteria ?? []) as StoredDerivedAssumption[]) next[one.code] = one;
        setCriteria(next);
      } catch {
        derivedFor.current = null;
      }
    },
    [framingSystem],
  );

  useEffect(() => {
    onCriteria?.(criteria);
  }, [criteria, onCriteria]);

  // LA-1318: each card the answers have reached plays on the stage, in order,
  // and plays again if a later answer changes what it says.
  useEffect(() => {
    if (!onStageEvent) return;
    const v1 = criteria["V-1"];
    const hydraulic = v1 ? valueText(v1.correction?.value ?? v1.value).toLowerCase().startsWith("hydraulic") : false;
    const applies: Record<(typeof CARD_ORDER)[number], boolean> = {
      "V-1": elevatorReady(responses),
      "V-2": elevatorReady(responses) && hydraulic,
      "V-3": elevatorReady(responses),
      "A-1": responses.construction_kind === "new" && Number(responses.stories_above_grade) > 0,
      "A-2": responses.construction_kind === "new" && Number(responses.stories_above_grade) > 0 && Number(responses.gross_square_feet) > 0,
      "S-1": Number(responses.stories_above_grade) > 0,
      "M-0": true,
      "M-1": true,
      "E-1": electricalReady(responses),
    };
    for (const code of CARD_ORDER) {
      const card = criteria[code];
      if (!card || !dueGroups.has(CARD_GROUP[code]) || !applies[code]) continue;
      const text = valueText(card.correction?.value ?? card.value);
      if (played.current[code] === text) continue;
      played.current[code] = text;
      onStageEvent(cardMoment(code, text));
    }
  }, [criteria, dueGroups, responses, onStageEvent]);

  // LA-1318: the building appears once setup has its size and the typing has
  // paused, so it does not rebuild with every keystroke of Stories.
  const setupKey = setupReady
    ? `${responses.stories_above_grade}|${responses.gross_square_feet}|${responses.building_count}`
    : null;
  useEffect(() => {
    if (!setupKey || setupPlayed.current || !onStageEvent) return;
    const timer = window.setTimeout(() => {
      const stories = Number(responses.stories_above_grade);
      const gsf = Number(responses.gross_square_feet);
      if (!(stories > 0 && gsf > 0)) return;
      setupPlayed.current = true;
      onStageEvent(setupMoment(stories, gsf, responses.project_type === "multifamily"));
    }, 700);
    return () => window.clearTimeout(timer);
    // The key carries every answer the moment reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupKey, onStageEvent]);

  /**
   * LA-2218: move the shared level. Going up lands on the first question the
   * new level asks that is still unanswered, so it never skips one the flow
   * has not reached yet (LA-2209 review Q1).
   */
  function chooseLevel(next: PriceLevel) {
    if (busy || next === level) return;
    onLevel?.(next);
    setError(null);
    if (next > level) {
      const target = slotsFor(responses, markupForm, next).findIndex(
        (one) => one.kind === "flow" && (responses[one.question.id] ?? "") === "",
      );
      if (target >= 0) setIndex(target);
    }
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
            {slot.question.id === "levels_below_grade" ? (
              <p className="nb-divider">Now the New Building</p>
            ) : null}
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
                    onPick={() => pickAnswer(slot.question, answer.value)}
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
                    onPick={() => pickAnswer(slot.question, choice.value)}
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
        ) : slot.kind === "markup_gr_method" ? (
          <>
            <h3 className="nb-prompt">How should General Requirements be priced?</h3>
            <p className="nb-help">General Requirements sits inside trade cost, so General Conditions, fee and insurance compute on top of it.</p>
            <div className="nb-choices">
              {METHODS.map((one, i) => (
                <Choice
                  key={one.value}
                  label={one.label}
                  picked={formGrMethod(markupForm) === one.value}
                  disabled={busy}
                  autoFocus={focusQuestion && i === 0}
                  onPick={() => pickMarkup({ grMethod: one.value })}
                />
              ))}
            </div>
          </>
        ) : slot.kind === "markup_method" ? (
          <>
            <h3 className="nb-prompt">
              {markupForm.setup === "separate" ? "How should General Conditions be priced?" : "How should GRs and GCs be priced?"}
            </h3>
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
          <MarkupRateQuestion
            options={markupOptions}
            form={markupForm}
            busy={busy}
            autoFocus={focusQuestion}
            onChange={setMarkupForm}
            onSubmit={submitMarkupRate}
          />
        ) : markupOptions ? (
          <>
            <h3 className="nb-prompt">What resources does this job carry, phase by phase?</h3>
            <MarkupControls
              options={markupOptions}
              form={markupForm}
              onChange={setMarkupForm}
              disabled={busy}
              projectId={projectId ?? undefined}
              schedule={PENDING_SCHEDULE}
              answers={planAnswersFromResponses(responses)}
            />
            <div className="rb-acts">
              <button className="btn btn--primary" type="button" onClick={submitMarkupDetail} disabled={busy}>
                Next
              </button>
            </div>
          </>
        ) : null}
      </section>

      <LevelTiles
        level={level}
        locked={lockedLevels(definition, responses, level)}
        disabled={busy}
        onLevel={chooseLevel}
      />

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

/**
 * LA-2218: the price level and a dashed tile for each locked one, saying how
 * many questions it adds. A tile moves the shared level up to that level.
 */
function LevelTiles({
  level,
  locked,
  disabled,
  onLevel,
}: {
  level: PriceLevel;
  locked: { level: PriceLevel; added: number }[];
  disabled: boolean;
  onLevel: (level: PriceLevel) => void;
}) {
  const tiles = locked.filter((one) => one.added > 0);
  return (
    <div className="nb-levels">
      <div className="nb-level-seg" role="group" aria-label="Level">
        {PRICE_LEVELS.map((one) => (
          <button
            key={one}
            type="button"
            className="nb-level-pill"
            aria-pressed={level === one}
            disabled={disabled}
            onClick={() => onLevel(one)}
          >
            Level {one}
          </button>
        ))}
      </div>
      {tiles.map((tile) => (
        <button
          key={tile.level}
          type="button"
          className="nb-lock"
          data-level={tile.level}
          disabled={disabled}
          onClick={() => onLevel(tile.level)}
        >
          Level {tile.level} · {tile.added} More {tile.added === 1 ? "Question" : "Questions"}
        </button>
      ))}
    </div>
  );
}

/**
 * New Budget's last GRs/GCs question: the rate. One field for a single line;
 * with separate lines (LA-1383), one field each for General Requirements and
 * General Conditions, where a line with history may stay blank to use it.
 */
function MarkupRateQuestion({
  options,
  form,
  busy,
  autoFocus,
  onChange,
  onSubmit,
}: {
  options: MarkupOptions;
  form: MarkupForm;
  busy: boolean;
  autoFocus: boolean;
  onChange: (form: MarkupForm) => void;
  onSubmit: (useHistory: boolean) => void;
}) {
  const perSf = form.method === "usd_per_gsf";
  const history = setupHistory(options.historyCounts, form.setup);
  const unit = perSf ? "in dollars per GSF" : "as a percent of subtotal";
  const jobs = (count: number) => (count === 1 ? "1 job" : `${count} jobs`);

  if (form.setup === "separate") {
    // LA-1398: each line keeps its own method, so each field its own unit.
    const grPerSf = formGrMethod(form) === "usd_per_gsf";
    const fields = [
      {
        name: "General Requirements",
        count: history.gr ?? 0,
        perSf: grPerSf,
        value: grPerSf ? form.grOverridePerSf : form.grOverridePercent,
        set: (text: string) => onChange(grPerSf ? { ...form, grOverridePerSf: text } : { ...form, grOverridePercent: text }),
      },
      {
        name: "General Conditions",
        count: history.gc,
        perSf,
        value: perSf ? form.overridePerSf : form.overridePercent,
        set: (text: string) => onChange(perSf ? { ...form, overridePerSf: text } : { ...form, overridePercent: text }),
      },
    ];
    return (
      <>
        <h3 className="nb-prompt">
          {grPerSf === perSf
            ? `What General Requirements and General Conditions rates should this budget carry, ${unit}?`
            : `What General Requirements rate, ${grPerSf ? "in dollars per GSF" : "as a percent of subtotal"}, and General Conditions rate, ${unit}, should this budget carry?`}
        </h3>
        <p className="nb-help">
          {fields
            .map((field) =>
              field.count > 0
                ? `Imported budgets carry ${field.name} alone on ${jobs(field.count)}, so it can stay blank to use them.`
                : `No imported budget carries ${field.name} alone, so enter it.`,
            )
            .join(" ")}
          {perSf ? "" : " General Conditions computes on the subtotal plus General Requirements."}
        </p>
        <form
          className="nb-num nb-num--pair"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(false);
          }}
        >
          {fields.map((field, i) => (
            <input
              key={field.name}
              className="input num"
              inputMode="decimal"
              aria-label={`${field.name}, ${field.perSf ? "$ per GSF" : "% of Subtotal"}`}
              placeholder={field.count > 0 ? `${field.name}: Use History` : field.name}
              autoFocus={autoFocus && i === 0}
              disabled={busy}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
            />
          ))}
          <button className="btn btn--primary" type="submit" disabled={busy}>
            Next
          </button>
        </form>
      </>
    );
  }

  const count = history.gc;
  return (
    <>
      <h3 className="nb-prompt">What GRs/GCs rate should this budget carry, {unit}?</h3>
      <p className="nb-help">
        {count > 0
          ? `Imported budgets carry a figure for this setup (${jobs(count)}). Enter your own rate or use theirs.`
          : "No imported budget has a figure for this setup, so enter the rate."}
      </p>
      <form
        className="nb-num"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(false);
        }}
      >
        <input
          className="input num"
          inputMode="decimal"
          aria-label={perSf ? "GRs/GCs, $ per GSF" : "GRs/GCs, % of Subtotal"}
          autoFocus={autoFocus}
          disabled={busy}
          value={perSf ? form.overridePerSf : form.overridePercent}
          onChange={(e) =>
            onChange(perSf ? { ...form, overridePerSf: e.target.value } : { ...form, overridePercent: e.target.value })
          }
        />
        <button className="btn btn--primary" type="submit" disabled={busy}>
          Next
        </button>
      </form>
      {count > 0 ? (
        <div className="rb-acts">
          <button className="btn" type="button" onClick={() => onSubmit(true)} disabled={busy}>
            Use History
          </button>
        </div>
      ) : null}
    </>
  );
}
