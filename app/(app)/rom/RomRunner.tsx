"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FramingSystem, MarkupChoices, Rom } from "@kulka/engine";

import type { GateAnswers } from "@/lib/rom/gates";
import type { MarkupOptions } from "@/lib/rom/markup";
import type { LineProvenance } from "@/lib/rom/provenance";
import type { RomProjectOption } from "@/lib/rom/projects";
import type { RunRecord, RunSummary } from "@/lib/rom/run-records";

import {
  type TradeBlock,
  headlineMoney,
  headlineOf,
  shortMoney,
  tradeBlocks,
  valueTier,
} from "./block-layout";
import { type EditableProject, EditProjectForm, RestorePanel } from "./EditProject";
import { initialMarkupForm, MarkupControls, markupChoicesFrom, type MarkupForm } from "./Markups";
import { NewBudgetForm } from "./NewBudget";
import { BlockPanel, type Drilldown, NotesPanel, PanelHead, TotalPanel } from "./RomPanels";
import { type LoadedRun, loadedRunFrom, savedRunsFor } from "./saved-runs";
import { FramingControl, gateAnswersFrom, initialScopeForm, ScopeControls, type ScopeForm } from "./Scope";
import "./rom-blocks.css";

// LA-1101. The live conceptual budget in the Round 14 block layout: a black
// header band with the total, one block per trade biggest first, a black side
// panel for whatever was clicked, and a black strip of saved runs. The data
// flow is the one LA-16, LA-18, LA-1016 and LA-1028 built: POST /api/rom runs
// the engine, the run record is read back from /api/rom/runs, and the
// drill-down from /api/rom/provenance. The markup and scope inputs sit behind
// "Run settings" so the first screen is the answer, not the form.

/** What the page is doing. The run on screen is held apart, so a failed run or a bad setting leaves it in place. */
type Status =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "loading"; runId: string }
  | { phase: "failed"; error: string };

type Panel =
  | { kind: "total" }
  | { kind: "block"; costCode: string }
  | { kind: "notes" }
  | { kind: "settings" }
  | { kind: "new" }
  | { kind: "edit" };

// Pinned to Eastern so the server (UTC) and the browser print the same run
// time; otherwise React reports a hydration mismatch (LA-1102).
const STAMP = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const AREA = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function RomRunner({
  projectId,
  markupOptions,
  markupDefault,
  scopeDefaults,
  framingDefault,
  initialRuns = [],
  initialRun = null,
  projects = [],
  projectNotFound = false,
  projectArchivedAt = null,
  isEnvProject = false,
}: {
  projectId?: string;
  /** Rate tables, fee and insurance parameters, and history counts (LA-1016). */
  markupOptions?: MarkupOptions;
  /** The project's own saved markup choice (LA-1109), null when it has never saved one. */
  markupDefault?: MarkupChoices | null;
  /** The project's own recorded answers to the nine yes/no scope questions (LA-1028). */
  scopeDefaults?: GateAnswers;
  /** The project's recorded framing system, null when not set (LA-1103). Undefined when the page could not read it. */
  framingDefault?: FramingSystem | null;
  /** This project's saved runs, newest first, read on the server. */
  initialRuns?: RunSummary[];
  /** The newest saved run, so the first screen opens on an answer. */
  initialRun?: LoadedRun | null;
  /** Projects with at least one run, for the header picker (LA-1107). */
  projects?: RomProjectOption[];
  /** The URL named a project that does not exist. */
  projectNotFound?: boolean;
  /** Set when the URL names an archived project (LA-1110); blocks the pricing UI for a Restore prompt. */
  projectArchivedAt?: string | null;
  /** Whether projectId is the project configured for this environment (ROM_PROJECT_ID); it cannot be archived (LA-1110). */
  isEnvProject?: boolean;
}) {
  const router = useRouter();
  const [run, setRun] = useState<LoadedRun | null>(initialRun);
  const [state, setState] = useState<Status>({ phase: "idle" });
  const [runs, setRuns] = useState<RunSummary[]>(initialRuns);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [form, setForm] = useState<MarkupForm>(() => initialMarkupForm(markupOptions, markupDefault));
  const [scopeForm, setScopeForm] = useState<ScopeForm>(() => initialScopeForm(scopeDefaults));
  const [framing, setFraming] = useState<FramingSystem | "">(framingDefault ?? "");
  const opener = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const busy = state.phase === "running" || state.phase === "loading";
  const blocks = useMemo(() => (run ? tradeBlocks(run.rom) : []), [run]);
  const headline = useMemo(() => (run ? headlineOf(run.rom) : null), [run]);
  const drilldown = useProvenance(run?.runId ?? null);

  const refreshRuns = useCallback(async () => {
    try {
      const response = await fetch("/api/rom/runs?limit=50");
      if (!response.ok) return;
      const body = await response.json();
      setRuns(savedRunsFor(body.runs as RunSummary[], projectId));
    } catch {
      // The strip keeps the list it had. A missing refresh loses nothing.
    }
  }, [projectId]);

  const closePanel = useCallback(() => {
    setPanel(null);
    const back = opener.current;
    opener.current = null;
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  }, []);

  // The title takes focus when the panel opens or changes, so a keyboard user
  // lands on what they opened.
  useEffect(() => {
    if (panel) titleRef.current?.focus({ preventScroll: true });
  }, [panel]);

  useEffect(() => {
    if (!panel) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, closePanel]);

  // Clicking what is already open closes it, the way Round 14 does.
  function openPanel(next: Panel, from?: HTMLElement | null) {
    const same =
      panel !== null &&
      panel.kind === next.kind &&
      (panel.kind !== "block" || (next.kind === "block" && panel.costCode === next.costCode));
    if (same) {
      closePanel();
      return;
    }
    if (panel === null && from) opener.current = from;
    setPanel(next);
  }

  async function runRom() {
    if (!projectId) return;
    // Without the options the page could not read the rate tables, so the
    // request names no markups and the run uses the recorded defaults.
    const choices = markupOptions ? markupChoicesFrom(form, markupOptions) : null;
    if (choices && !choices.ok) {
      setState({ phase: "failed", error: choices.error });
      return;
    }
    // Without a defaults object the page could not read the project's gate
    // columns, so the request names no gates and the run reads them itself.
    const gates = scopeDefaults ? gateAnswersFrom(scopeForm) : null;
    setState({ phase: "running" });
    try {
      const response = await fetch("/api/rom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          ...(choices ? { markups: choices.markups } : {}),
          ...(gates ? { gates } : {}),
          // Without a default the page could not read the project's column, so
          // the request names none and the run reads it itself.
          ...(framingDefault !== undefined ? { framingSystem: framing === "" ? null : framing } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setState({ phase: "failed", error: body.error ?? "The run failed." });
        void refreshRuns();
        return;
      }
      // The run record carries the area and the project name the ROM itself
      // does not. Without it the blocks still show; only $/SF goes quiet.
      const record = await readRun(body.runId as string);
      setRun(
        (record && loadedRunFrom(record)) ?? {
          runId: body.runId,
          rom: body.rom,
          projectName: null,
          grossSquareFeet: null,
          startedAt: null,
        },
      );
      setState({ phase: "idle" });
      setPanel(null);
      void refreshRuns();
    } catch {
      setState({ phase: "failed", error: "The site could not reach the engine." });
    }
  }

  async function loadRun(runId: string) {
    if (run?.runId === runId) return;
    setState({ phase: "loading", runId });
    setPanel((current) => (current?.kind === "settings" ? current : null));
    const record = await readRun(runId);
    const loaded = record ? loadedRunFrom(record) : null;
    if (loaded) {
      setRun(loaded);
      setState({ phase: "idle" });
    } else {
      setState({ phase: "failed", error: "The site could not read that run." });
    }
  }

  const openBlock = panel?.kind === "block" ? blocks.find((b) => b.costCode === panel.costCode) : undefined;
  const held = blocks.filter((block) => block.line.heldForReview).length;
  const noteCount = run
    ? held + run.rom.tbdGateItems.length + run.rom.assumedPresentItems.length
    : 0;

  // LA-1110: an archived project shows only its archived state and a Restore
  // button. The rest of the runner (settings, run, blocks) never mounts for
  // it, so there is nothing stale to reconcile once it is restored -- the
  // restore just reloads the page.
  if (projectArchivedAt) {
    return (
      <div className="rb">
        <header className="rb-hdr">
          <div className="rb-t1">
            <span className="rb-badge">R-100</span>
            <h1 className="rb-title">Conceptual budget</h1>
          </div>
        </header>
        <main className="rb-fld">
          <RestorePanel projectId={projectId ?? ""} onRestored={() => router.refresh()} />
        </main>
      </div>
    );
  }

  return (
    <div className={`rb${panel ? " rb--open" : ""}`}>
      <header className="rb-hdr">
        <div className="rb-t1">
          <span className="rb-badge">R-100</span>
          <h1 className="rb-title">Conceptual budget</h1>
          {/* The picker sits where the project name was, so the name shows once
              and the header stays on one line. */}
          {projects.length > 0 ? (
            <select
              className="rb-pick"
              aria-label="Project"
              value={projects.some((one) => one.id === projectId) ? projectId : ""}
              onChange={(e) => {
                if (e.target.value) router.push(`/rom?project=${e.target.value}`);
              }}
            >
              {projects.some((one) => one.id === projectId) ? null : <option value="">Choose a project</option>}
              {projects.map((one) => (
                <option key={one.id} value={one.id}>
                  {one.name}
                </option>
              ))}
            </select>
          ) : null}
          {projects.length === 0 && run?.projectName ? <span className="rb-proj">{run.projectName}</span> : null}
          {run?.grossSquareFeet ? (
            <span className="num">{AREA.format(run.grossSquareFeet)} SF</span>
          ) : null}
          {!projectId ? <span>{projectNotFound ? "Project not found" : "No project configured"}</span> : null}
          <span className="rb-sp" />
          <button
            type="button"
            className="rb-hbtn"
            aria-expanded={panel?.kind === "new"}
            onClick={(e) => openPanel({ kind: "new" }, e.currentTarget)}
          >
            New budget
          </button>
          {projectId ? (
            <button
              type="button"
              className="rb-hbtn"
              aria-expanded={panel?.kind === "edit"}
              onClick={(e) => openPanel({ kind: "edit" }, e.currentTarget)}
            >
              Edit project
            </button>
          ) : null}
          {projectId && (markupOptions || scopeDefaults) ? (
            <button
              type="button"
              className="rb-hbtn"
              aria-expanded={panel?.kind === "settings"}
              onClick={(e) => openPanel({ kind: "settings" }, e.currentTarget)}
            >
              Run settings
            </button>
          ) : null}
          <button
            className="btn btn--primary"
            type="button"
            onClick={runRom}
            disabled={!projectId || busy}
          >
            {!projectId ? "Project required" : state.phase === "running" ? "Running" : "Run ROM"}
          </button>
        </div>

        <div className="rb-t2">
          {run && headline ? (
            <>
              <button
                type="button"
                className="rb-tot"
                aria-expanded={panel?.kind === "total"}
                onClick={(e) => openPanel({ kind: "total" }, e.currentTarget)}
              >
                <span className="rb-tl">{headline.label}</span>
                <span className="rb-tv num">{headlineMoney(headline.midpoint, headline)}</span>
                <span className="rb-tb">
                  range{" "}
                  <b className="num">
                    {headlineMoney(headline.low, headline)} to {headlineMoney(headline.high, headline)}
                  </b>
                  {/* Inside the range so it never wraps onto a line of its own. */}
                  <svg className="rb-chev" viewBox="0 0 12 12" aria-hidden="true">
                    <path
                      d="M4.5 2.5 8 6 4.5 9.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </button>
              {headline.tbd.length > 0 ? (
                <span className="rb-td">{headline.tbd.join(", ")} TBD, outside the total</span>
              ) : null}
              <button
                type="button"
                className="rb-oq"
                aria-expanded={panel?.kind === "notes"}
                onClick={(e) => openPanel({ kind: "notes" }, e.currentTarget)}
              >
                {noteCount > 0 ? (
                  <span className={`rb-dot rb-dot--${held > 0 ? "stuck" : "working"}`} aria-hidden="true" />
                ) : null}
                {notesLabel(held, run.rom)}
              </button>
            </>
          ) : (
            <p className="rb-tnone">
              {state.phase === "running"
                ? "Reading data and computing lines."
                : state.phase === "loading"
                  ? "Reading the saved run."
                  : "No ROM on screen yet."}
            </p>
          )}
        </div>
      </header>

      <main className="rb-fld" aria-busy={busy}>
        {state.phase === "idle" && !run ? (
          <p className="rb-none">
            {projectId
              ? "No ROM yet. Run one to see a ranged budget."
              : projectNotFound
                ? "No project matches that link. Choose one from the list or start a new budget."
                : "Choose a project or start a new budget."}
          </p>
        ) : null}
        {state.phase === "running" ? <p className="rb-none">Reading data and computing lines.</p> : null}
        {state.phase === "loading" ? <p className="rb-none">Reading the saved run.</p> : null}
        {state.phase === "failed" ? (
          <p className="rb-none rb-none--error" role="alert">
            {state.error}
            {run ? ` The blocks below are still ${runWords(run)}.` : ""}
          </p>
        ) : null}
        {run ? (
          blocks.length === 0 ? (
            <p className="rb-none">No benchmark matched this project, so the ROM has no lines.</p>
          ) : (
            <BlockField
              blocks={blocks}
              selected={openBlock?.costCode ?? null}
              onOpen={(costCode, el) => openPanel({ kind: "block", costCode }, el)}
            />
          )
        ) : null}
      </main>

      {panel ? (
        <aside className="rb-pnl" aria-label="Detail">
          {panel.kind === "settings" ? (
            <>
              <PanelHead
                title="Run settings"
                sub="These settings save to this project when you run."
                onClose={closePanel}
                titleRef={titleRef}
              />
              {projectId && framingDefault !== undefined ? (
                <FramingControl value={framing} onChange={setFraming} disabled={busy} />
              ) : null}
              {projectId && scopeDefaults ? (
                <ScopeControls form={scopeForm} onChange={setScopeForm} disabled={busy} />
              ) : null}
              {projectId && markupOptions ? (
                <MarkupControls options={markupOptions} form={form} onChange={setForm} disabled={busy} />
              ) : null}
              {state.phase === "failed" ? <p className="rb-pp rb-pp--error">{state.error}</p> : null}
              <div className="rb-acts">
                <button className="btn btn--primary" type="button" onClick={runRom} disabled={busy}>
                  {state.phase === "running" ? "Running" : "Run ROM"}
                </button>
              </div>
            </>
          ) : null}

          {panel.kind === "new" ? (
            <>
              <PanelHead
                title="New budget"
                sub="Adds the project and runs its first ROM from these facts. Anything not asked here stays blank on the project."
                onClose={closePanel}
                titleRef={titleRef}
              />
              <NewBudgetForm onCreated={(id) => router.push(`/rom?project=${id}`)} />
            </>
          ) : null}

          {panel.kind === "edit" && projectId ? (
            <>
              <PanelHead title="Edit project" sub="Saved runs are untouched." onClose={closePanel} titleRef={titleRef} />
              <EditProjectPanelBody
                projectId={projectId}
                isEnvProject={isEnvProject}
                onSaved={() => {
                  closePanel();
                  router.refresh();
                }}
                onArchived={() => {
                  closePanel();
                  router.push("/rom");
                }}
              />
            </>
          ) : null}

          {panel.kind === "total" && run && headline ? (
            <>
              <PanelHead
                title={headline.label}
                sub={runWords(run)}
                onClose={closePanel}
                titleRef={titleRef}
              />
              <TotalPanel rom={run.rom} headline={headline} grossSquareFeet={run.grossSquareFeet} />
            </>
          ) : null}

          {panel.kind === "block" && run && openBlock ? (
            <>
              <PanelHead
                title={openBlock.label}
                sub={`${openBlock.costCode} · ${runWords(run)}`}
                onClose={closePanel}
                titleRef={titleRef}
              />
              <BlockPanel block={openBlock} drilldown={drilldown} grossSquareFeet={run.grossSquareFeet} />
            </>
          ) : null}

          {panel.kind === "notes" && run ? (
            <>
              <PanelHead
                title="Scope and assumptions"
                sub={runWords(run)}
                onClose={closePanel}
                titleRef={titleRef}
              />
              <NotesPanel
                rom={run.rom}
                blocks={blocks}
                onOpenBlock={(costCode) => setPanel({ kind: "block", costCode })}
              />
            </>
          ) : null}
        </aside>
      ) : null}

      <footer className="rb-revs" aria-label="Saved runs">
        <h2>Saved runs</h2>
        {runs.length === 0 ? (
          <p className="rb-rnone">No saved run for this project yet.</p>
        ) : (
          <div className="rb-rvl" role="group" aria-label="Saved run list">
            {runs.map((one) => {
              const current = run?.runId === one.id || (state.phase === "loading" && state.runId === one.id);
              const started = new Date(one.startedAt);
              return (
                <button
                  key={one.id}
                  type="button"
                  className="rb-rv"
                  aria-current={current}
                  disabled={busy}
                  onClick={() => loadRun(one.id)}
                  aria-label={`Load run ${one.id.slice(0, 8)}, ${STAMP.format(started)} at ${CLOCK.format(started)}`}
                >
                  <span className="rb-r1">
                    <b>{STAMP.format(started)}</b>
                    <span className="rb-rd num">{CLOCK.format(started)}</span>
                  </span>
                  <span className="rb-rk num">run {one.id.slice(0, 8)}</span>
                </button>
              );
            })}
          </div>
        )}
        {/* The page links live here, beside All runs, so the header keeps to
            one line when a long project name is chosen. */}
        <nav className="rb-links rb-rall" aria-label="ROM pages">
          {run ? <Link href={`/rom/blocks?run=${run.runId}`}>Block board</Link> : null}
          <Link href="/rom/backtest">Backtest</Link>
          <Link href="/rom/runs">All runs</Link>
        </nav>
      </footer>
    </div>
  );
}

function BlockField({
  blocks,
  selected,
  onOpen,
}: {
  blocks: TradeBlock[];
  selected: string | null;
  onOpen: (costCode: string, el: HTMLElement) => void;
}) {
  const kulka = blocks.filter((block) => !block.ownerDirect);
  const owner = blocks.filter((block) => block.ownerDirect);

  return (
    <>
      <section className="rb-grp" aria-label="Trades">
        <h2>Trades, biggest first</h2>
        <div className="rb-grid">
          {kulka.map((block) => (
            <Block key={block.costCode} block={block} selected={selected === block.costCode} onOpen={onOpen} />
          ))}
        </div>
      </section>
      {owner.length > 0 ? (
        <section className="rb-grp" aria-label="Bought by the owner direct">
          <h2>Bought by the owner direct</h2>
          <div className="rb-grid">
            {owner.map((block) => (
              <Block key={block.costCode} block={block} selected={selected === block.costCode} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

export function Block({
  block,
  selected,
  onOpen,
}: {
  block: TradeBlock;
  selected: boolean;
  onOpen: (costCode: string, el: HTMLElement) => void;
}) {
  return (
    <button
      type="button"
      className={`rb-blk${selected ? " rb-blk--sel" : ""}`}
      aria-pressed={selected}
      aria-label={`${block.label}, ${shortMoney(block.midpoint)}${block.status ? `, ${block.status.word.toLowerCase()}` : ""}`}
      onClick={(e) => onOpen(block.costCode, e.currentTarget)}
    >
      <span className="rb-bn">{block.label}</span>
      {block.status ? (
        <span className="rb-st">
          <span className={`rb-dot rb-dot--${block.status.tone}`} aria-hidden="true" />
          {block.status.word}
        </span>
      ) : null}
      <span className={`rb-bv num rb-${valueTier(block.share)}`}>{shortMoney(block.midpoint)}</span>
      <span className="rb-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${Math.max(0.02, Math.min(1, block.share)).toFixed(4)})` }} />
      </span>
    </button>
  );
}

function notesLabel(held: number, rom: Rom): string {
  const parts: string[] = [];
  if (held > 0) parts.push(`${held} held for review`);
  if (rom.tbdGateItems.length > 0) parts.push(`${rom.tbdGateItems.length} TBD`);
  if (rom.assumedPresentItems.length > 0) parts.push(`${rom.assumedPresentItems.length} assumed present`);
  return parts.length > 0 ? parts.join(", ") : "Scope and assumptions";
}

function runWords(run: LoadedRun): string {
  const id = `run ${run.runId.slice(0, 8)}`;
  if (!run.startedAt) return id;
  const started = new Date(run.startedAt);
  return `${id}, ${STAMP.format(started)} at ${CLOCK.format(started)}`;
}

/** Fetches the project's own row for the Edit panel's prefill (LA-1110). */
function EditProjectPanelBody({
  projectId,
  isEnvProject,
  onSaved,
  onArchived,
}: {
  projectId: string;
  isEnvProject: boolean;
  onSaved: () => void;
  onArchived: () => void;
}) {
  const [state, setState] = useState<
    { phase: "loading" } | { phase: "ready"; project: EditableProject } | { phase: "failed" }
  >({ phase: "loading" });

  useEffect(() => {
    let live = true;
    fetch(`/api/rom/projects/${encodeURIComponent(projectId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("not found");
        const body = await response.json();
        if (live) setState({ phase: "ready", project: body.project as EditableProject });
      })
      .catch(() => {
        if (live) setState({ phase: "failed" });
      });
    return () => {
      live = false;
    };
  }, [projectId]);

  if (state.phase === "loading") return <p className="rb-none">Reading the project.</p>;
  if (state.phase === "failed") return <p className="rb-none rb-none--error">The project could not be read.</p>;
  return (
    <EditProjectForm project={state.project} isEnvProject={isEnvProject} onSaved={onSaved} onArchived={onArchived} />
  );
}

async function readRun(runId: string): Promise<RunRecord | null> {
  try {
    const response = await fetch(`/api/rom/runs/${encodeURIComponent(runId)}`);
    if (!response.ok) return null;
    const body = await response.json();
    return body.run as RunRecord;
  } catch {
    return null;
  }
}

// LA-18. The drill-down for the run on screen, read once per run.
function useProvenance(runId: string | null): Drilldown {
  const [drilldown, setDrilldown] = useState<{ runId: string | null; value: Drilldown }>({
    runId: null,
    value: { phase: "loading" },
  });

  useEffect(() => {
    if (!runId) return;
    let live = true;
    fetch(`/api/rom/provenance?runId=${encodeURIComponent(runId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error("no provenance");
        const { provenance } = await response.json();
        if (!live) return;
        setDrilldown({
          runId,
          value: {
            phase: "ready",
            byCostCode: Object.fromEntries(
              (provenance.lines as LineProvenance[]).map((line) => [line.costCode, line]),
            ),
          },
        });
      })
      .catch(() => {
        if (live) setDrilldown({ runId, value: { phase: "failed" } });
      });
    return () => {
      live = false;
    };
  }, [runId]);

  // A second run shows loading rather than the last run's provenance.
  return drilldown.runId === runId ? drilldown.value : { phase: "loading" };
}
