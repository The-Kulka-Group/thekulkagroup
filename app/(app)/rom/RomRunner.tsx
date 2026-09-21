"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import type { ProvenanceKind, Rom, RomLine } from "@kulka/engine";

import { Sheet, Sep } from "@/components/Sheet";
import type { LineProvenance, ProvenanceSignal } from "@/lib/rom/provenance";

import "./provenance.css";

// Money to the nearest dollar. A ROM is a range, so cents would imply a
// precision the number does not have.
const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

// The column header carries the noun, so the chip only names the level. The
// long form overflowed the fixed-layout board.
const CONFIDENCE_LABEL = {
  high: "High",
  medium: "Medium",
  low: "Low",
} as const;

type State =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "done"; rom: Rom; runId: string }
  | { phase: "failed"; error: string };

export function RomRunner({ projectId }: { projectId?: string }) {
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run() {
    if (!projectId) return;
    setState({ phase: "running" });
    try {
      const response = await fetch("/api/rom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
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

  const rom = state.phase === "done" ? state.rom : undefined;
  const held = rom?.lines.filter((l) => l.heldForReview).length ?? 0;

  return (
    <Sheet
      number="R-100"
      title="Conceptual budget"
      actions={
        <button
          className="btn btn--primary"
          type="button"
          onClick={run}
          disabled={!projectId || state.phase === "running"}
        >
          {!projectId ? "Project required" : state.phase === "running" ? "Running" : "Run ROM"}
        </button>
      }
      meta={
        <>
          <span>{projectId ? "Approved project" : "No project configured"}</span>
          <Sep />
          <span>tier 1</span>
          {state.phase === "done" ? (
            <>
              <Sep />
              <Link className="num" href={`/rom/runs/${state.runId}`}>
                run {state.runId.slice(0, 8)}
              </Link>
            </>
          ) : null}
          <Sep />
          <Link href="/rom/runs">Past runs</Link>
        </>
      }
      needsReview={held}
      reviewLabel="held for review"
    >
      {state.phase === "idle" ? (
        <p className="empty">
          {projectId
            ? "No ROM yet. Run one to see a ranged budget."
            : "Set ROM_PROJECT_ID to an approved project before running a ROM."}
        </p>
      ) : null}

      {state.phase === "running" ? <p className="empty">Reading data and computing lines.</p> : null}

      {state.phase === "failed" ? <p className="empty">{state.error}</p> : null}

      {/* Keyed by run: a second run gets a fresh panel rather than the last run's provenance. */}
      {rom && state.phase === "done" ? (
        <Result key={state.runId} rom={rom} runId={state.runId} />
      ) : null}
    </Sheet>
  );
}

// What stands behind the flag, in the words CONTEXT.md uses. A model's figure
// is not a comparable, so a line resting on one alone says so outright.
function behind(line: RomLine): string {
  if (line.comparables.every((c) => c.kind === "llm_proposal")) return "no Kulka data";
  const jobs = line.comparableCount === 1 ? "1 job" : `${line.comparableCount} jobs`;
  const measured = line.comparables.some((c) => c.kind === "actuals" || c.kind === "proest_budget");
  return measured ? jobs : `${jobs}, judgment`;
}

// LA-18. The kinds in the words CONTEXT.md uses for them.
const KIND_LABEL: Record<ProvenanceKind, string> = {
  actuals: "Actuals",
  proest_budget: "ProEst budget",
  reviewed_judgment: "Reviewed judgment",
  llm_proposal: "Model signal",
};

const PER_SF = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SHARE = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

type Drilldown =
  | { phase: "loading" }
  | { phase: "ready"; byCostCode: Record<string, LineProvenance> }
  | { phase: "failed" };

function Result({ rom, runId }: { rom: Rom; runId: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<Drilldown>({ phase: "loading" });

  useEffect(() => {
    let live = true;

    fetch(`/api/rom/provenance?runId=${encodeURIComponent(runId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("no provenance");
        const { provenance } = await response.json();
        if (!live) return;
        setDrilldown({
          phase: "ready",
          byCostCode: Object.fromEntries(
            (provenance.lines as LineProvenance[]).map((line) => [line.costCode, line]),
          ),
        });
      })
      .catch(() => {
        if (live) setDrilldown({ phase: "failed" });
      });

    return () => {
      live = false;
    };
  }, [runId]);

  if (rom.lines.length === 0) {
    return <p className="empty">No benchmark matched this project, so the ROM has no lines.</p>;
  }

  return (
    <>
      <table className="board board--rom">
        {/* Widths come from daylight.css. The board lays out fixed, so without
            them the confidence chip was clipped. */}
        <colgroup>
          <col />
          <col />
          <col />
          <col />
          <col />
        </colgroup>
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
          {rom.lines.map((line) => {
            const expanded = open === line.costCode;
            return (
              <Fragment key={line.costCode}>
                <tr
                  className={`row${line.heldForReview ? " row--stuck" : ""}${expanded ? " row--open" : ""}`}
                >
                  <td>
                    <button
                      className="line-toggle num"
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : line.costCode)}
                    >
                      <span aria-hidden="true" className="caret">
                        {expanded ? "▾" : "▸"}
                      </span>
                      {line.costCode}
                    </button>
                  </td>
                  <td>{line.label}</td>
                  <td className="num right">{DOLLARS.format(line.low)}</td>
                  <td className="num right">{DOLLARS.format(line.high)}</td>
                  <td>
                    <span className={`chip chip--${line.confidence}`}>
                      <span className="dot" />
                      {CONFIDENCE_LABEL[line.confidence]}
                    </span>
                    <span className="behind num">{behind(line)}</span>
                  </td>
                </tr>
                {expanded ? (
                  <tr>
                    <td className="prov-cell" colSpan={5}>
                      <Provenance
                        drilldown={drilldown}
                        label={line.label}
                        costCode={line.costCode}
                      />
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
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

      <section className="doc-section rom-assumptions">
        <h2 className="doc-title">Assumptions</h2>
        <ul className="doc-list">
          {rom.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </section>
    </>
  );
}

// LA-18. Where one line's number came from. Every figure here is read back
// from the run record, so the panel can only ever show what the engine used.
function Provenance({
  drilldown,
  costCode,
  label,
}: {
  drilldown: Drilldown;
  costCode: string;
  label: string;
}) {
  if (drilldown.phase === "loading") {
    return <p className="prov-empty">Reading where this line came from.</p>;
  }
  if (drilldown.phase === "failed") {
    return <p className="prov-empty">The site could not read this line&rsquo;s provenance.</p>;
  }

  const line = drilldown.byCostCode[costCode];
  if (!line || line.signals.length === 0) {
    return <p className="prov-empty">Nothing is recorded behind this line.</p>;
  }

  return (
    <>
      <p className="prov-head">
        {line.comparableCount === 0
          ? `No comparable Kulka project stands behind ${label}. What follows is every signal the blend used.`
          : `${label} blends ${countWords(line.signals.length, "signal")} from ${countWords(line.comparableCount, "Kulka project")}.`}
      </p>
      <table className="prov-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Projects</th>
            <th>Export</th>
            <th>Recorded</th>
            <th className="right">Rate</th>
            <th className="right">Weight</th>
          </tr>
        </thead>
        <tbody>
          {line.signals.map((signal, index) => (
            <tr key={`${signal.kind}-${signal.recordedAt}-${index}`}>
              <th scope="row">{KIND_LABEL[signal.kind]}</th>
              <td>{projectWords(signal)}</td>
              <td className={signal.exportLabel ? undefined : "quiet"}>
                {signal.exportLabel ?? "No export named"}
              </td>
              <td className="num">
                {signal.recordedAt} by {signal.recordedBy}
              </td>
              <td className="num right">{PER_SF.format(signal.rate)}/SF</td>
              <td className="num right">
                {signal.weight} ({SHARE.format(signal.weightShare)})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {line.judgments.length > 0 ? (
        <>
          <p className="prov-head">
            An approved estimator rule moved this line. The signals above do not
            account for it on their own.
          </p>
          <table className="prov-table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Stated</th>
                <th className="right">Rule</th>
                <th className="right">Moved the rate</th>
                <th className="right">Weight</th>
              </tr>
            </thead>
            <tbody>
              {line.judgments.map((judgment) => (
                <tr key={judgment.ruleId}>
                  <th scope="row">{KIND_LABEL.reviewed_judgment}</th>
                  <td className="num">
                    {judgment.recordedAt} by {judgment.recordedBy}
                  </td>
                  <td className="num right">
                    {PER_SF.format(judgment.adjustmentUsdPerGsf)}/SF
                  </td>
                  <td className="num right">
                    {PER_SF.format(judgment.appliedUsdPerGsf)}/SF
                  </td>
                  <td className="num right">{judgment.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : null}
    </>
  );
}

function countWords(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function projectWords(signal: ProvenanceSignal): string {
  if (signal.projects.length === 0) return "No comparable project";
  return signal.projects.map((p) => p.name ?? "Project record missing").join(", ");
}
