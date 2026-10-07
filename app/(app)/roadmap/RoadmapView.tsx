"use client";

import { useState } from "react";
import { STATUS_DETAIL, STATUS_LABEL, type RoadmapItem, type RoadmapStatus, type Workstream } from "./roadmap-data";
import { formatRoadmapDate } from "./roadmap-format";
import "./roadmap.css";

const STATUSES: RoadmapStatus[] = ["built", "planning", "waiting", "dropped"];
const DAY = 86_400_000;

type Filter = RoadmapStatus | "all";

const isOpen = (i: RoadmapItem) => i.status === "planning" || i.status === "waiting";

function StatusPill({ status }: { status: RoadmapStatus }) {
  return (
    <span className={`rm-pill rm-${status}`}>
      <i className="rm-dot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function Timeline({ workstreams, asOf, onJump }: { workstreams: Workstream[]; asOf: string; onJump: (key: string) => void }) {
  // The axis runs from the Sunday before the first commit to twelve days past
  // today, leaving room after the today line for the undated open items.
  const start = Date.parse("2026-08-23T00:00:00Z");
  const end = Date.parse(`${asOf}T00:00:00Z`) + 12 * DAY;
  const at = (iso: string) => `${(((Date.parse(`${iso}T00:00:00Z`) - start) / (end - start)) * 100).toFixed(2)}%`;
  const ticks: string[] = [];
  for (let t = start; t <= end; t += 7 * DAY) ticks.push(new Date(t).toISOString().slice(0, 10));
  const openAt = new Date(Date.parse(`${asOf}T00:00:00Z`) + 5 * DAY).toISOString().slice(0, 10);
  const grid = ticks.map((d) => <span key={d} className="rm-tick" style={{ left: at(d) }} />);

  return (
    <div className="rm-tl-box">
      <div className="rm-tl">
        <div className="rm-tl-row rm-tl-axis">
          <span />
          <div className="rm-track">
            {ticks.map((d) => (
              <span key={d} className="rm-tick" style={{ left: at(d) }}>
                {/* The Today label owns the few days before it. */}
                {Math.abs(Date.parse(`${asOf}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) > 4 * DAY ? <span>{formatRoadmapDate(d)}</span> : null}
              </span>
            ))}
            <span className="rm-today" style={{ left: at(asOf) }}>
              <span>Today</span>
            </span>
          </div>
        </div>
        {workstreams.map((w) => {
          const dated = w.items.filter((i) => i.date).sort((a, b) => a.date!.localeCompare(b.date!));
          const open = w.items.filter((i) => !i.date && isOpen(i));
          const built = w.items.filter((i) => i.status === "built").length;
          const byDay = new Map<string, RoadmapItem[]>();
          for (const i of dated) byDay.set(i.date!, [...(byDay.get(i.date!) ?? []), i]);
          return (
            <div className="rm-tl-row" key={w.key}>
              <button type="button" className="rm-tl-name" onClick={() => onJump(w.key)}>
                {w.name}
                <small>
                  {built} built{open.length ? `, ${open.length} open` : ""}
                </small>
              </button>
              <div className="rm-track">
                {grid}
                <span className="rm-today" style={{ left: at(asOf) }} />
                {dated.length ? (
                  <span
                    className="rm-span"
                    style={{ left: `calc(${at(dated[0].date!)} - 3px)`, width: `calc(${at(dated.at(-1)!.date!)} - ${at(dated[0].date!)} + 6px)` }}
                  />
                ) : null}
                {[...byDay].flatMap(([day, list]) =>
                  list.map((i, n) => (
                    <span
                      key={`${day}-${n}`}
                      className={`rm-mark rm-${i.status}`}
                      title={`${formatRoadmapDate(day)}: ${i.title}`}
                      style={{ left: `calc(${at(day)} + ${(n - (list.length - 1) / 2) * 3}px)` }}
                    />
                  )),
                )}
                {open.map((i, n) => (
                  <span
                    key={i.title}
                    className={`rm-mark rm-mark--next rm-${i.status}`}
                    title={`Up next: ${i.title}`}
                    style={{ left: `calc(${at(openAt)} + ${n * 15}px)` }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="rm-key">
        {STATUSES.map((s) => (
          <span key={s}>
            <i className={`rm-dot rm-${s}`} />
            {STATUS_LABEL[s]}
          </span>
        ))}
        <span>
          <i className="rm-hollow" />
          Up next, no date yet
        </span>
      </div>
    </div>
  );
}

export function RoadmapView({ workstreams, asOf }: { workstreams: Workstream[]; asOf: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [opened, setOpened] = useState<Set<string>>(new Set());
  const all = workstreams.flatMap((w) => w.items.map((item) => ({ item, ws: w })));
  const count = (s: RoadmapStatus) => all.filter(({ item }) => item.status === s).length;

  // Picking a status opens every workstream that holds one, so the list is in
  // view; each stays free to close by hand after that.
  const pick = (f: Filter) => {
    const next = filter === f && f !== "all" ? "all" : f;
    setFilter(next);
    if (next !== "all") setOpened(new Set(workstreams.filter((w) => w.items.some((i) => i.status === next)).map((w) => w.key)));
  };
  const jump = (key: string) => {
    setOpened((was) => new Set(was).add(key));
    document.getElementById(`rm-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="rm">
      <div className="rm-counts">
        {STATUSES.map((s) => (
          <button key={s} type="button" className={`rm-count rm-${s}`} aria-pressed={filter === s} onClick={() => pick(s)}>
            <span className="rm-count-label">
              <i className="rm-dot" />
              {STATUS_LABEL[s]}
            </span>
            <span className="rm-count-n">{count(s)}</span>
            <span className="rm-count-detail">{STATUS_DETAIL[s]}</span>
          </button>
        ))}
      </div>

      <section className="rm-section">
        <div className="rm-head">
          <h2>Timeline</h2>
          <p>Each dot is one shipped or decided item. Pick a workstream to open its list.</p>
        </div>
        <Timeline workstreams={workstreams} asOf={asOf} onJump={jump} />
      </section>

      <section className="rm-section">
        <div className="rm-head">
          <h2>Up Next</h2>
          <p>Work that is planned or waiting on an answer.</p>
        </div>
        <div className="rm-next">
          {all
            .filter(({ item }) => isOpen(item))
            .sort((a, b) => (a.item.status === b.item.status ? 0 : a.item.status === "planning" ? -1 : 1))
            .map(({ item, ws }) => (
              <div className="rm-card" key={`${ws.key}-${item.title}`}>
                <div className="rm-card-top">
                  <span className="t-label">{ws.name}</span>
                  <StatusPill status={item.status} />
                </div>
                <h3>{item.title}</h3>
                {item.note ? <p>{item.note}</p> : null}
                {item.ticket ? <span className="rm-ticket">{item.ticket}</span> : null}
              </div>
            ))}
        </div>
      </section>

      <section className="rm-section">
        <div className="rm-head">
          <h2>Workstreams</h2>
          <div className="rm-filters" role="group" aria-label="Show items by status">
            {(["all", ...STATUSES] as Filter[]).map((f) => (
              <button key={f} type="button" className="rm-filter" aria-pressed={filter === f} onClick={() => pick(f)}>
                {f === "all" ? "All" : (
                  <>
                    <i className={`rm-dot rm-${f}`} />
                    {STATUS_LABEL[f]}
                  </>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="rm-streams">
          {workstreams.map((w) => {
            const n = Object.fromEntries(STATUSES.map((s) => [s, w.items.filter((i) => i.status === s).length])) as Record<RoadmapStatus, number>;
            const days = w.items.flatMap((i) => (i.date ? [i.date] : [])).sort();
            const rows = w.items
              .filter((i) => filter === "all" || i.status === filter)
              .sort((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9"));
            const open = opened.has(w.key);
            return (
              <details
                key={w.key}
                id={`rm-${w.key}`}
                className="rm-ws"
                open={open}
                onToggle={(e) => {
                  const now = (e.currentTarget as HTMLDetailsElement).open;
                  if (now === open) return;
                  setOpened((was) => {
                    const next = new Set(was);
                    if (now) next.add(w.key);
                    else next.delete(w.key);
                    return next;
                  });
                }}
              >
                <summary>
                  <span className="rm-ws-title">{w.name}</span>
                  <span className="rm-ws-sub">{w.summary}</span>
                  <span className="rm-ws-meta">
                    <span className="rm-bar" title={STATUSES.map((s) => `${n[s]} ${STATUS_LABEL[s].toLowerCase()}`).join(", ")}>
                      {STATUSES.map((s) => (n[s] ? <i key={s} className={`rm-${s}`} style={{ width: `${(n[s] / w.items.length) * 100}%` }} /> : null))}
                    </span>
                    <span className="rm-ws-dates">
                      {days.length ? `${formatRoadmapDate(days[0])} to ${formatRoadmapDate(days.at(-1)!)} · ` : ""}
                      {n.built} of {w.items.length} built
                    </span>
                  </span>
                </summary>
                {rows.length ? (
                  <ul className="rm-items">
                    {rows.map((i) => (
                      <li key={i.title} className={`rm-item rm-${i.status}`}>
                        <span className="rm-date">{i.date ? formatRoadmapDate(i.date) : "Not dated"}</span>
                        <span className={`rm-ticket${i.ticket ? "" : " rm-ticket--none"}`}>{i.ticket ?? "No ticket"}</span>
                        <span className="rm-item-title">
                          {i.title}
                          {i.note ? <span className="rm-note">{i.note}</span> : null}
                        </span>
                        <StatusPill status={i.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rm-empty">Nothing {STATUS_LABEL[filter as RoadmapStatus]?.toLowerCase()} in this workstream.</p>
                )}
              </details>
            );
          })}
        </div>
      </section>

      <p className="rm-foot">
        Built items come from changes merged into Kulka AI. Planned and waiting items come from the project plan and decisions on record.
      </p>
    </div>
  );
}
