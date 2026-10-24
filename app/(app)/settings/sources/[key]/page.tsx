import Link from "next/link";
import { notFound } from "next/navigation";

import { Sep, Sheet } from "@/components/Sheet";
import { getDb } from "@/lib/db";
import { readSourceHealth } from "@/lib/sources/health";
import { readSourceRuns } from "@/lib/sources/log";

import { SourceRefresh } from "../SourceRefresh";
import { actionFor, cardState, heroFor, runRow, runStrip, scheduleText, TONE } from "../sources-view";
import "../sources.css";

// LA-3050. One source's page under Data Sources: its health, three facts, the
// last 14 days and the run log, with the error text under each failed run.

export const dynamic = "force-dynamic";

export default async function SourceRuns({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const now = new Date();
  const db = getDb();
  const source = (await readSourceHealth(db, now)).find((s) => s.key === key);
  if (!source) notFound();
  const runs = await readSourceRuns(db, key);
  const state = cardState(source);
  const hero = heroFor(source, now);
  const action = actionFor(source);
  const last = runs.find((run) => run.outcome) ?? null;
  const strip = runStrip(runs, now);
  return (
    <Sheet
      number="S-210"
      title={source.name}
      meta={
        <>
          <Link href="/settings/sources">Data Sources</Link>
          <Sep />
          <span className={`ds-health ds-tone--${TONE[state]}`}>
            <i />
            {state}
          </span>
        </>
      }
      actions={
        action.kind === "refresh" ? (
          <SourceRefresh />
        ) : action.label === "Reconnect" ? (
          <Link className="btn btn--secondary" href={action.href} prefetch={false}>
            Reconnect
          </Link>
        ) : null
      }
    >
      <div className="ds-page">
        <div className="ds-facts">
          <div className="ds-fact">
            <span className="t-label">{hero.label}</span>
            <b className="num">{hero.figure}</b>
          </div>
          <div className="ds-fact">
            <span className="t-label">Schedule</span>
            <b className="ds-fact--text">{scheduleText(source, now)}</b>
          </div>
          <div className="ds-fact">
            <span className="t-label">Last Run</span>
            <b className="ds-fact--text">{last ? runRow(last).outcome : "None Logged"}</b>
          </div>
        </div>

        <section className="ds-panel" aria-label="Last 14 Days">
          <h2>Last 14 Days</h2>
          <div className="ds-strip" role="list">
            {strip.map((day) => (
              <i key={day.label} role="listitem" aria-label={`${day.label}: ${day.tone === "none" ? "no run" : day.tone === "stuck" ? "failed" : "ok"}`} className={`ds-day ds-day--${day.tone}`} />
            ))}
          </div>
          <div className="ds-strip-ends">
            <span>{strip[0].label}</span>
            <span>Today</span>
          </div>
        </section>

        <section className="ds-panel ds-panel--flush" aria-label="Run Log">
          <h2>Run Log</h2>
          {runs.length === 0 ? (
            <p className="ds-empty">No runs logged yet. Each refresh adds a row here.</p>
          ) : (
            <table className="ds-log">
              <thead>
                <tr>
                  <th>Started</th>
                  <th className="ds-hide-sm">Took</th>
                  <th>Outcome</th>
                  <th className="ds-hide-sm">Changed</th>
                  <th className="ds-hide-sm">Started By</th>
                </tr>
              </thead>
              {runs.map((run) => {
                const row = runRow(run);
                return (
                  <tbody key={row.id}>
                    <tr>
                      <td className="ds-when">{row.when}</td>
                      <td className="ds-hide-sm num">{row.took}</td>
                      <td>
                        <span className={`ds-health ds-tone--${row.tone}`}>
                          <i />
                          {row.outcome}
                        </span>
                      </td>
                      <td className="ds-hide-sm">{row.changed}</td>
                      <td className="ds-hide-sm ds-by">{row.by}</td>
                    </tr>
                    {row.error ? (
                      <tr className="ds-error-row">
                        <td colSpan={5}>
                          <p className="ds-error">{row.error}</p>
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                );
              })}
            </table>
          )}
        </section>
      </div>
    </Sheet>
  );
}
