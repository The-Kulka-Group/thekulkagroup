"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Rom } from "@kulka/engine";

import { Sheet, Sep } from "@/components/Sheet";
import {
  BRANCH_GATE_ANSWERS,
  visibleQuestions,
  type FlowDefinition,
  type Question,
  type Responses,
} from "@/lib/rom/question-flow";
import type { RomProjectOption } from "@/lib/rom/projects";

// The walk from the tier-1 questions to a ROM. This component renders whatever
// the definition declares and knows nothing about any particular question.

const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CONFIDENCE_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

type State =
  | { phase: "asking" }
  | { phase: "running" }
  | { phase: "done"; rom: Rom; runId: string }
  | { phase: "failed"; error: string };

export function IntakeFlow({
  definition,
  projectId,
  projects = [],
}: {
  definition: FlowDefinition;
  projectId?: string;
  projects?: RomProjectOption[];
}) {
  const router = useRouter();
  const known = projects.some((one) => one.id === projectId);
  const [responses, setResponses] = useState<Responses>({});
  const [state, setState] = useState<State>({ phase: "asking" });

  const asked = visibleQuestions(definition, responses);
  const answered = asked.filter((question) => !question.required || responses[question.id]);
  const ready = Boolean(projectId) && answered.length === asked.length;

  function answer(id: string, value: string) {
    setResponses((current) => ({ ...current, [id]: value }));
  }

  async function submit() {
    if (!projectId) return;
    setState({ phase: "running" });
    try {
      const response = await fetch("/api/rom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, responses }),
      });
      const body = await response.json();
      setState(
        response.ok
          ? { phase: "done", rom: body.rom, runId: body.runId }
          : { phase: "failed", error: body.error ?? "The run failed." },
      );
    } catch {
      setState({ phase: "failed", error: "The site could not reach the engine." });
    }
  }

  const tbd = asked.filter(
    (question) => question.kind === "branch_gate" && responses[question.id] === "dont_know",
  ).length;

  return (
    <Sheet
      number="R-110"
      title={definition.title}
      actions={
        <button
          className="btn btn--primary"
          type="button"
          onClick={submit}
          disabled={!ready || state.phase === "running"}
        >
          {!projectId
            ? "Project required"
            : state.phase === "running"
              ? "Running"
              : "Compute ROM"}
        </button>
      }
      meta={
        <>
          {projects.length > 0 ? (
            <select
              className="input rom-intake-pick"
              aria-label="Project"
              value={known ? projectId : ""}
              onChange={(e) => {
                if (e.target.value) router.push(`/rom/intake?project=${e.target.value}`);
              }}
            >
              {known ? null : <option value="">Choose a project</option>}
              {projects.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </select>
          ) : (
            <span>{projectId ? "Approved project" : "No project configured"}</span>
          )}
          <Sep />
          <span>tier 1</span>
          <Sep />
          <span className="num">
            {answered.length} of {asked.length} answered
          </span>
          {state.phase === "done" ? (
            <>
              <Sep />
              <span className="num">run {state.runId.slice(0, 8)}</span>
            </>
          ) : null}
        </>
      }
      needsReview={tbd}
      reviewLabel="marked don't know"
    >
      {state.phase === "done" ? (
        <Result rom={state.rom} tbd={tbd} />
      ) : (
        <>
          {asked.map((question) => (
            <Field
              key={question.id}
              question={question}
              value={responses[question.id] ?? ""}
              onAnswer={answer}
            />
          ))}
          {state.phase === "failed" ? <p className="empty">{state.error}</p> : null}
          {state.phase === "running" ? (
            <p className="empty">Reading data and computing lines.</p>
          ) : null}
          {!projectId ? (
            <p className="empty">
              Set ROM_PROJECT_ID to an approved project before running a ROM.
            </p>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

function Field({
  question,
  value,
  onAnswer,
}: {
  question: Question;
  value: string;
  onAnswer: (id: string, value: string) => void;
}) {
  const options =
    question.kind === "branch_gate"
      ? BRANCH_GATE_ANSWERS.map((one) => ({ value: one.value as string, label: one.label }))
      : question.choices;

  return (
    <div className="field">
      <label className="field-label" htmlFor={question.id}>
        {question.prompt}
      </label>
      {question.help ? <p className="t-meta">{question.help}</p> : null}
      {options ? (
        <select
          className="input"
          id={question.id}
          value={value}
          onChange={(event) => onAnswer(question.id, event.target.value)}
        >
          <option value="">Choose one</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          className="input num"
          id={question.id}
          inputMode="numeric"
          type="number"
          min={1}
          value={value}
          onChange={(event) => onAnswer(question.id, event.target.value)}
        />
      )}
    </div>
  );
}

function Result({ rom, tbd }: { rom: Rom; tbd: number }) {
  if (rom.lines.length === 0) {
    return <p className="empty">No benchmark matched this project, so the ROM has no lines.</p>;
  }

  return (
    <>
      <table className="board board--rom">
        <thead>
          <tr>
            <th>Code</th>
            <th>Line</th>
            <th className="right">Low</th>
            <th className="right">High</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rom.lines.map((line) => (
            <tr className="row" key={line.costCode}>
              <td className="num">{line.costCode}</td>
              <td>{line.label}</td>
              <td className="num right">{DOLLARS.format(line.low)}</td>
              <td className="num right">{DOLLARS.format(line.high)}</td>
              <td>
                <span className={`chip chip--${line.confidence}`}>
                  <span className="dot" />
                  {CONFIDENCE_LABEL[line.confidence]}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="group">
            <th colSpan={2}>Total range</th>
            <th className="num right">{DOLLARS.format(rom.total.low)}</th>
            <th className="num right">{DOLLARS.format(rom.total.high)}</th>
            <th />
          </tr>
        </tfoot>
      </table>

      {tbd > 0 ? (
        <p className="empty">
          {tbd === 1
            ? "One section is marked don't know. It shows TBD and sits outside this total."
            : `${tbd} sections are marked don't know. They show TBD and sit outside this total.`}
        </p>
      ) : null}
    </>
  );
}
