"use client";

import { useState } from "react";
import type { Rom } from "@kulka/engine";

import { Sheet, Sep } from "@/components/Sheet";

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
              <span className="num">run {state.runId.slice(0, 8)}</span>
            </>
          ) : null}
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

      {rom ? <Result rom={rom} /> : null}
    </Sheet>
  );
}

function Result({ rom }: { rom: Rom }) {
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
          {rom.lines.map((line) => (
            <tr className={`row${line.heldForReview ? " row--stuck" : ""}`} key={line.costCode}>
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
