"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Sheet, Sep } from "@/components/Sheet";
import type { RunRecord } from "@/lib/rom/run-records";
import {
  RUN_STATUS_CHIP,
  RUN_STATUS_LABEL,
  elapsed,
  formatTime,
  stepLabel,
} from "../run-presentation";

// How often the page asks the API what the run has recorded. A ROM run takes
// seconds, and each poll is one indexed read of two small tables.
const POLL_MS = 1000;

const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const CONFIDENCE_LABEL = { high: "High", medium: "Medium", low: "Low" } as const;

/**
 * One run, live while it goes and browsable once it has stopped (LA-16).
 *
 * The server renders the run it already read, so the first paint holds real
 * records rather than a spinner. While the run is going the page polls the same
 * read the server did, so a step appears here as soon as lib/rom/run.ts records
 * it. Polling stops the moment the run reports a final status.
 */
export function RunView({ initialRun }: { initialRun: RunRecord }) {
  const [run, setRun] = useState(initialRun);
  const [lostContact, setLostContact] = useState(false);
  const live = run.status === "running";

  useEffect(() => {
    if (!live) return;
    let stopped = false;

    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/rom/runs/${run.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        if (!stopped) {
          setRun(body.run);
          setLostContact(false);
        }
      } catch {
        if (!stopped) setLostContact(true);
      }
    }, POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live, run.id]);

  return (
    <Sheet
      number="R-111"
      title={`ROM run ${run.id.slice(0, 8)}`}
      actions={
        <Link className="btn btn--secondary" href="/rom/runs">
          Back to the run list
        </Link>
      }
      meta={
        <>
          <span>{run.projectName}</span>
          <Sep />
          <span>{run.skill}</span>
          <Sep />
          <span className="num">{formatTime(run.startedAt)}</span>
          <Sep />
          <span className={`chip chip--${RUN_STATUS_CHIP[run.status]}`}>
            <span className="dot" />
            {RUN_STATUS_LABEL[run.status]}
          </span>
        </>
      }
    >
      <p className="t-meta" aria-live="polite">
        {live
          ? "This run is going. The steps below update as it records them."
          : `This run finished at ${formatTime(run.finishedAt)} and stays here as the record of what it did.`}
      </p>
      {lostContact ? (
        <p className="t-meta">The site lost contact with the run, so these steps may be behind.</p>
      ) : null}

      <section className="doc-section">
        <h2 className="doc-title">Steps</h2>
        {run.steps.length === 0 ? (
          <p className="empty">This run has recorded no step yet.</p>
        ) : (
          <table className="board">
            <thead>
              <tr>
                <th className="right">Seq</th>
                <th>Step</th>
                <th>Started</th>
                <th className="right">Took</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {run.steps.map((step) => (
                <tr
                  className={`row${step.status === "failed" ? " row--stuck" : ""}`}
                  key={step.seq}
                >
                  <td className="num right">{step.seq}</td>
                  <td>{stepLabel(step.name)}</td>
                  <td className="num">{formatTime(step.startedAt)}</td>
                  <td className="num right">{elapsed(step.startedAt, step.finishedAt)}</td>
                  <td>
                    <span className={`chip chip--${RUN_STATUS_CHIP[step.status]}`}>
                      <span className="dot" />
                      {RUN_STATUS_LABEL[step.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="doc-section">
        <h2 className="doc-title">Inputs</h2>
        {run.answers ? (
          <table className="board">
            <tbody>
              <tr className="row">
                <td>Project</td>
                <td>{run.projectName}</td>
              </tr>
              <tr className="row">
                <td>Project type</td>
                <td>{run.answers.projectType}</td>
              </tr>
              <tr className="row">
                <td>Construction kind</td>
                <td>{run.answers.constructionKind}</td>
              </tr>
              <tr className="row">
                <td>Gross square feet</td>
                <td className="num">{run.answers.grossSquareFeet.toLocaleString("en-US")}</td>
              </tr>
              <tr className="row">
                <td>Snapshot hash</td>
                <td className="num">{run.snapshotHash ?? "Not recorded"}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="empty">
            This run stopped before it worked out what it was budgeting, so it recorded no
            answers.
          </p>
        )}
      </section>

      <section className="doc-section">
        <h2 className="doc-title">Outputs</h2>
        {run.error ? <p className="empty">{run.error}</p> : null}
        {run.rom ? <RomLines rom={run.rom} /> : null}
        {!run.rom && !run.error ? (
          <p className="empty">
            {live ? "No ROM yet. The run is still computing." : "This run recorded no ROM."}
          </p>
        ) : null}
      </section>
    </Sheet>
  );
}

function RomLines({ rom }: { rom: NonNullable<RunRecord["rom"]> }) {
  if (rom.lines.length === 0) {
    return <p className="empty">No benchmark matched this project, so the ROM has no lines.</p>;
  }

  return (
    <>
      <table className="board board--rom">
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
                <span className="behind num">
                  {line.comparableCount === 1 ? "1 job" : `${line.comparableCount} jobs`}
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
        <h3>Assumptions</h3>
        <ul className="doc-list">
          {rom.assumptions.map((assumption) => (
            <li key={assumption}>{assumption}</li>
          ))}
        </ul>
      </section>
    </>
  );
}
