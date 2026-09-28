"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BlockClassification, FramingSystem, MarkupChoices, Rom } from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";
import type { GateAnswers } from "@/lib/rom/gates";
import type { MarkupOptions } from "@/lib/rom/markup";
import type { LineProvenance } from "@/lib/rom/provenance";
import type { RomProjectOption } from "@/lib/rom/projects";
import type { RunRecord, RunSummary } from "@/lib/rom/run-records";
import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";

import {
  type TradeBlock,
  headlineMoney,
  headlineOf,
  shortMoney,
  tradeBlocks,
  valueTier,
} from "./block-layout";
import {
  CriteriaToast,
  CriterionPanel,
  DerivedCriteriaSection,
  type Ping,
  useDerivedCriteria,
} from "./DerivedCriteria";
import { type EditableProject, EditProjectForm, RestorePanel } from "./EditProject";
import { ElementBoxBlock } from "./ElementBox";
import {
  type BarModel,
  barModel,
  buildField,
  chipFor,
  entryForCostCode,
  type FieldEntry,
  orderField,
  type RomOrder,
} from "./field-order";
import { GuidedNewBudget } from "./GuidedNewBudget";
import { type BudgetDraft, LiveField, LiveTotal, UnpricedBlock, useLiveBudget } from "./LiveBudget";
import { initialMarkupForm, MarkupControls, markupChoicesFrom, type MarkupForm } from "./Markups";
import { useFieldFlip } from "./motion";
import { PackageCard, PackagePanel } from "./PackageCard";
import { BlockPanel, type Drilldown, NotesPanel, PanelHead, TotalPanel } from "./RomPanels";
import { type LoadedRun, loadedRunFrom, savedRunsFor } from "./saved-runs";
import { FramingControl, gateAnswersFrom, initialScopeForm, ScopeControls, type ScopeForm } from "./Scope";
import { type FieldLink, ShareBar, ShareChip, useHoverIntent } from "./ShareBar";
import { defaultRomView, type RomView } from "./view-groups";
import { OrderSwitch, useRomOrder, useRomView, ViewSwitch } from "./view-switch";
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
  /** LA-1181: a package card, its items listed in the panel. */
  | { kind: "package"; key: string }
  /** LA-860: one derived assumption, by its criterion code. */
  | { kind: "criterion"; code: string }
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
  openNewOnLoad = false,
  classifications = [],
  derivedAssumptions = [],
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
  /** /rom/intake redirects here with ?new=1 (LA-1141), since the guided New budget flow now covers what it asked. */
  openNewOnLoad?: boolean;
  /**
   * The stated block classifications (LA-884, LA-1157), read once on the
   * server, so a saved run can group an element into its parent box the same
   * way the New budget preview does (LA-1158, ADR 0006).
   */
  classifications?: BlockClassification[];
  /**
   * LA-860: the project's derived assumptions, read on the server. Empty
   * means the Design Criteria section does not show at all.
   */
  derivedAssumptions?: StoredDerivedAssumption[];
}) {
  const router = useRouter();
  const [run, setRun] = useState<LoadedRun | null>(initialRun);
  const [state, setState] = useState<Status>({ phase: "idle" });
  const [runs, setRuns] = useState<RunSummary[]>(initialRuns);
  const [panel, setPanel] = useState<Panel | null>(() => (openNewOnLoad ? { kind: "new" } : null));
  const [form, setForm] = useState<MarkupForm>(() => initialMarkupForm(markupOptions, markupDefault));
  const [scopeForm, setScopeForm] = useState<ScopeForm>(() => initialScopeForm(scopeDefaults));
  const [framing, setFraming] = useState<FramingSystem | "">(framingDefault ?? "");
  const [draft, setDraft] = useState<BudgetDraft | null>(null);
  const live = useLiveBudget(panel?.kind === "new" ? draft : null);
  const opener = useRef<HTMLElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // LA-1159, ADR 0006, CONTEXT.md: View. New budget always opens on By Scope.
  // A saved ROM opens on By Scope when most of its trade cost has no stated
  // buyout package, and on By Package once most of it does (LA-1210,
  // defaultRomView, view-groups.ts) -- production has almost none stated
  // today, so this keeps a saved run off one giant Unassigned Package card.
  // Once the viewer has picked a view at all, that choice follows them
  // everywhere (useRomView, view-switch.tsx).
  const [view, setView] = useRomView(
    panel?.kind === "new" ? "scope" : run ? defaultRomView(run.rom, classifications) : "scope",
  );

  // LA-1181: MasterFormat or Largest First, remembered per viewer like the view.
  const [order, setOrder] = useRomOrder();

  const busy = state.phase === "running" || state.phase === "loading";
  // Every line that adds to the total, since the side panel opens any of them
  // by cost code whether or not it is shown inside a box or a card.
  const blocks = useMemo(() => (run ? tradeBlocks(run.rom) : []), [run]);
  // LA-1181: the field in the chosen view and order (field-order.ts), and the
  // header bar's shares for it, so the dividers follow the field's order.
  const entries = useMemo(
    () => (run ? orderField(buildField(view, run.rom, classifications), order) : []),
    [run, classifications, view, order],
  );
  const bar = useMemo(() => (run ? barModel(run.rom, entries) : null), [run, entries]);

  // The live preview's field and bar, the same way.
  const liveRom = live.phase === "ready" || live.phase === "waiting" ? live.rom : null;
  const liveClassifications = live.phase === "ready" || live.phase === "waiting" ? live.classifications : null;
  const liveEntries = useMemo(
    () => (liveRom && liveClassifications ? orderField(buildField(view, liveRom, liveClassifications), order) : []),
    [liveRom, liveClassifications, view, order],
  );
  const liveBar = useMemo(
    () => (live.phase === "ready" ? barModel(live.rom, liveEntries) : null),
    [live, liveEntries],
  );

  // LA-1181: hovering a card previews its share in the bar after a short
  // hold; the item hovered in a card's strip or the side panel lights its
  // twin in the other.
  const hover = useHoverIntent();
  const [hotItem, setHotItem] = useState<string | null>(null);
  const link: FieldLink = useMemo(
    () => ({ onEnter: hover.enter, onLeave: hover.leave, item: hotItem, onItem: setHotItem }),
    [hover.enter, hover.leave, hotItem],
  );
  // New budget has no side panel to open, so a click there only keeps the
  // card's share lit.
  const [liveSelected, setLiveSelected] = useState<string | null>(null);
  const headline = useMemo(() => (run ? headlineOf(run.rom) : null), [run]);

  // LA-860: Design Criteria. Hovering a card lights the blocks it feeds on
  // LA-1181's hover intent (70ms in, 140ms out); an open card keeps them lit.
  const criteria = useDerivedCriteria(derivedAssumptions);
  const criterionHover = useHoverIntent();
  const [ping, setPing] = useState<Ping>(null);
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
      (panel.kind !== "block" || (next.kind === "block" && panel.costCode === next.costCode)) &&
      (panel.kind !== "package" || (next.kind === "package" && panel.key === next.key)) &&
      (panel.kind !== "criterion" || (next.kind === "criterion" && panel.code === next.code));
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
  const openPackage =
    panel?.kind === "package"
      ? entries.find((entry): entry is Extract<FieldEntry, { kind: "package" }> => entry.key === panel.key)
      : undefined;
  // What stays lit once the pointer leaves: the selected card, or the card
  // an open line sits in.
  const selectedEntryKey = openPackage?.key ?? entryForCostCode(entries, openBlock?.costCode ?? null)?.key ?? null;
  const litKey = hover.key ?? selectedEntryKey;
  const litEntry = entries.find((entry) => entry.key === litKey);
  const chip = litEntry && bar ? chipFor(litEntry, bar.spans.get(litEntry.key)) : null;
  const liveLitKey = hover.key ?? liveSelected;
  const liveLitEntry = live.phase === "ready" ? liveEntries.find((entry) => entry.key === liveLitKey) : undefined;
  const liveChip = liveLitEntry && liveBar ? chipFor(liveLitEntry, liveBar.spans.get(liveLitEntry.key)) : null;
  const openCriterion =
    panel?.kind === "criterion" ? criteria.items.find((item) => item.code === panel.code) : undefined;
  const litCriterion = criteria.items.find(
    (item) => item.code === (criterionHover.key ?? openCriterion?.code ?? null),
  );
  const criterionMark = useMemo(() => {
    if (!litCriterion) return null;
    const keys = new Set<string>();
    for (const costCode of litCriterion.costCodes) {
      const entry = entryForCostCode(entries, costCode);
      if (entry) keys.add(entry.key);
    }
    return { code: litCriterion.code, keys };
  }, [litCriterion, entries]);
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
            <h1 className="rb-title">Conceptual Budget</h1>
          </div>
        </header>
        <main className="rb-fld">
          <RestorePanel projectId={projectId ?? ""} onRestored={() => router.refresh()} />
        </main>
      </div>
    );
  }

  return (
    // New budget clears the screen behind its form, so the new project starts
    // blank rather than over the last project's blocks and runs.
    <div className={`rb${panel ? " rb--open" : ""}${panel?.kind === "new" ? " rb--fresh" : ""}`}>
      <header className="rb-hdr">
        <div className="rb-t1">
          <span className="rb-badge">R-100</span>
          <h1 className="rb-title">Conceptual Budget</h1>
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
              {projects.some((one) => one.id === projectId) ? null : <option value="">Choose a Project</option>}
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
          {!projectId ? <span>{projectNotFound ? "Project Not Found" : "No Project Configured"}</span> : null}
          <span className="rb-sp" />
          {run || panel?.kind === "new" ? <ViewSwitch view={view} onChange={setView} /> : null}
          {run || panel?.kind === "new" ? <OrderSwitch order={order} onChange={setOrder} /> : null}
          <button
            type="button"
            className="rb-hbtn"
            aria-expanded={panel?.kind === "new"}
            onClick={(e) => openPanel({ kind: "new" }, e.currentTarget)}
          >
            New Budget
          </button>
          {projectId ? (
            <button
              type="button"
              className="rb-hbtn"
              aria-expanded={panel?.kind === "edit"}
              onClick={(e) => openPanel({ kind: "edit" }, e.currentTarget)}
            >
              Edit Project
            </button>
          ) : null}
          {projectId && (markupOptions || scopeDefaults) ? (
            <button
              type="button"
              className="rb-hbtn"
              aria-expanded={panel?.kind === "settings"}
              onClick={(e) => openPanel({ kind: "settings" }, e.currentTarget)}
            >
              Run Settings
            </button>
          ) : null}
          <button
            className="btn btn--primary"
            type="button"
            onClick={runRom}
            disabled={!projectId || busy}
          >
            {!projectId ? "Project Required" : state.phase === "running" ? "Running" : "Run ROM"}
          </button>
        </div>

        <div className="rb-t2">
          {/* LA-1142: while New budget is open, the band shows the total the
              answers so far add up to. */}
          <div className="rb-fresh-note lb-hd">
            {panel?.kind === "new" ? <LiveTotal live={live} bar={liveBar} chip={liveChip} litKey={liveLitKey} /> : null}
          </div>
          {run && headline ? (
            <>
              <button
                type="button"
                className="rb-tot"
                aria-expanded={panel?.kind === "total"}
                onClick={(e) => openPanel({ kind: "total" }, e.currentTarget)}
              >
                <span className="rb-tl">{titleCase(headline.label)}</span>
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
                <span className="rb-td">{headline.tbd.join(", ")} TBD, Outside the Total</span>
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
              <ShareChip chip={chip} />
              {bar ? <SavedBar bar={bar} litKey={litKey} /> : null}
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
        {/* LA-1142: and the field shows the budget building. */}
        <div className="rb-fresh-note">
          {panel?.kind === "new" ? (
            <LiveField
              live={live}
              view={view}
              order={order}
              entries={liveEntries}
              selectedKey={liveSelected}
              onSelect={(key) => setLiveSelected((current) => (current === key ? null : key))}
              link={link}
            />
          ) : null}
        </div>
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
        {run && panel?.kind !== "new" ? (
          <DerivedCriteriaSection
            items={criteria.items}
            recheck={criteria.recheck}
            flip={criteria.flip}
            selectedCode={openCriterion?.code ?? null}
            ping={ping}
            onPing={setPing}
            onOpen={(code, el) => openPanel({ kind: "criterion", code }, el)}
            onEnter={criterionHover.enter}
            onLeave={criterionHover.leave}
          />
        ) : null}
        {run ? (
          entries.length === 0 ? (
            <p className="rb-none">No benchmark matched this project, so the ROM has no lines.</p>
          ) : (
            <BlockField
              view={view}
              order={order}
              entries={entries}
              selected={openBlock?.costCode ?? null}
              selectedPackage={openPackage?.key ?? null}
              link={link}
              mark={criterionMark}
              onOpen={(costCode, el) => openPanel({ kind: "block", costCode }, el)}
              onOpenPackage={(key, el) => openPanel({ kind: "package", key }, el)}
            />
          )
        ) : null}
      </main>

      {panel ? (
        <aside className="rb-pnl" aria-label="Detail">
          {panel.kind === "settings" ? (
            <>
              <PanelHead
                title="Run Settings"
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
                title="New Budget"
                sub="Walks the facts, scope and GRs/GCs the engine reads, then adds the project."
                onClose={closePanel}
                titleRef={titleRef}
              />
              <GuidedNewBudget
                markupOptions={markupOptions}
                onDraft={setDraft}
                onCreated={(id) => router.push(`/rom?project=${id}`)}
              />
            </>
          ) : null}

          {panel.kind === "edit" && projectId ? (
            <>
              <PanelHead title="Edit Project" sub="Saved runs are untouched." onClose={closePanel} titleRef={titleRef} />
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
                title={titleCase(headline.label)}
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
                title={titleCase(openBlock.label)}
                sub={`${openBlock.costCode} · ${runWords(run)}`}
                onClose={closePanel}
                titleRef={titleRef}
              />
              <BlockPanel block={openBlock} drilldown={drilldown} grossSquareFeet={run.grossSquareFeet} />
            </>
          ) : null}

          {panel.kind === "package" && run && openPackage ? (
            <>
              <PanelHead
                title={titleCase(openPackage.label)}
                sub={`${openPackage.division ? `Division ${openPackage.division} · ` : ""}${runWords(run)}`}
                onClose={closePanel}
                titleRef={titleRef}
              />
              <PackagePanel
                entry={openPackage}
                link={link}
                onOpenLine={(costCode) => setPanel({ kind: "block", costCode })}
              />
            </>
          ) : null}

          {panel.kind === "criterion" && openCriterion ? (
            <>
              <PanelHead title={openCriterion.label} onClose={closePanel} titleRef={titleRef} />
              <CriterionPanel
                key={`${openCriterion.code}-${openCriterion.correctionId ?? "jev"}`}
                item={openCriterion}
                busy={criteria.busy}
                error={criteria.error}
                onSave={(value, reason) => void criteria.save(openCriterion, value, reason)}
                onRevert={() => void criteria.revert(openCriterion)}
                onPing={setPing}
              />
            </>
          ) : null}

          {panel.kind === "notes" && run ? (
            <>
              <PanelHead
                title="Scope and Assumptions"
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

      <footer className="rb-revs" aria-label="Saved Runs">
        <p className="rb-rnone rb-fresh-note">No saved runs yet.</p>
        <h2>Saved Runs</h2>
        {runs.length === 0 ? (
          <p className="rb-rnone">No saved run for this project yet.</p>
        ) : (
          <div className="rb-rvl" role="group" aria-label="Saved Run List">
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
          {run ? <Link href={`/rom/blocks?run=${run.runId}`}>Block Board</Link> : null}
          <Link href="/rom/backtest">Backtest</Link>
          <Link href="/rom/parameters">Engine Parameters</Link>
          <Link href="/rom/runs">All Runs</Link>
        </nav>
      </footer>
      <CriteriaToast toast={criteria.toast} onDismiss={criteria.dismissToast} />
    </div>
  );
}

/** The saved ROM's markup bar, on its own line under the total. */
function SavedBar({ bar, litKey }: { bar: BarModel; litKey: string | null }) {
  return (
    <span className="rb-sbar">
      <ShareBar bar={bar} litKey={litKey} />
    </span>
  );
}

/**
 * The saved ROM's field. `entries` is already grouped by view (LA-1159) and
 * sorted by order (LA-1181, field-order.ts). The header total this field sits
 * under never re-renders when the view or the order changes; only these cards
 * move, on the same FLIP tracker New budget's field uses (`useFieldFlip`,
 * motion.ts). An order switch moves them over about 420ms with a 25ms
 * stagger per card, capped at 100ms.
 */
function BlockField({
  view,
  order,
  entries,
  selected,
  selectedPackage,
  link,
  mark = null,
  onOpen,
  onOpenPackage,
}: {
  view: RomView;
  order: RomOrder;
  entries: FieldEntry[];
  selected: string | null;
  selectedPackage: string | null;
  link: FieldLink;
  /** LA-860: the entries a hovered or open criterion feeds, lit and marked with its code. */
  mark?: { code: string; keys: Set<string> } | null;
  onOpen: (costCode: string, el: HTMLElement) => void;
  onOpenPackage: (key: string, el: HTMLElement) => void;
}) {
  const flip = useFieldFlip();
  // Each entry's root node carries its key, and the lit ones carry the
  // criterion's code, so the stylesheet can fade the rest and draw the mark
  // without every kind of card taking a new prop.
  const register = (key: string) => {
    const track = flip.register(key);
    return (el: HTMLElement | null) => {
      track(el);
      if (!el) return;
      el.dataset.dcEntry = key;
      if (mark?.keys.has(key)) {
        el.dataset.dcLit = "";
        el.dataset.dcMark = mark.code;
      } else {
        delete el.dataset.dcLit;
        delete el.dataset.dcMark;
      }
    };
  };
  const layer = useRef<HTMLDivElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const lastOrder = useRef(order);

  const kulka = entries.filter((entry) => !entry.ownerDirect);
  const owner = entries.filter((entry) => entry.ownerDirect);
  const rank = new Map(entries.map((entry, index) => [entry.key, index]));

  const tileDelay = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "element") continue;
    const base = (rank.get(entry.key) ?? 0) * 22;
    tileDelay.set(entry.group.driver.costCode, base);
    entry.group.members.forEach((item, index) => tileDelay.set(item.costCode, base + 70 * (index + 1)));
  }

  useLayoutEffect(() => {
    const reordered = lastOrder.current !== order;
    lastOrder.current = order;
    flip.run(layer.current, ghosts.current, rank, {
      delayFor: (key) => tileDelay.get(key),
      move: reordered ? { duration: 420, delayFor: (key) => Math.min((rank.get(key) ?? 0) * 25, 100) } : undefined,
    });
  });

  const render = (entry: FieldEntry) => {
    const rollDelay = Math.min((rank.get(entry.key) ?? 0) * 22, 520);
    if (entry.kind === "element") {
      return (
        <ElementBoxBlock
          key={entry.key}
          group={entry.group}
          selected={selected}
          onOpen={onOpen}
          register={register(entry.key)}
          entryKey={entry.key}
          link={link}
        />
      );
    }
    if (entry.kind === "package") {
      return (
        <PackageCard
          key={entry.key}
          entry={entry}
          selected={selectedPackage === entry.key}
          rollDelay={rollDelay}
          link={link}
          onSelect={onOpenPackage}
          register={register(entry.key)}
        />
      );
    }
    if (entry.kind === "unpriced") {
      return <UnpricedBlock key={entry.key} entry={entry} link={link} register={register(entry.key)} />;
    }
    return (
      <Block
        key={entry.key}
        block={entry.block}
        selected={selected === entry.key}
        onOpen={onOpen}
        register={register(entry.key)}
        link={link}
      />
    );
  };

  const heading = view === "package" ? "Packages" : "Trades";

  return (
    <div className={`rb-vflip${mark ? " dc-hl" : ""}`} ref={layer}>
      <div className="lb-ghosts" ref={ghosts} aria-hidden="true" />
      <section className="rb-grp" aria-label={heading}>
        <h2>{heading}</h2>
        <div className="rb-grid">{kulka.map(render)}</div>
      </section>
      {owner.length > 0 ? (
        <section className="rb-grp" aria-label="Bought by the Owner Direct">
          <h2>Bought by the Owner Direct</h2>
          <div className="rb-grid">{owner.map(render)}</div>
        </section>
      ) : null}
    </div>
  );
}

export function Block({
  block,
  selected,
  onOpen,
  register,
  link,
}: {
  block: TradeBlock;
  selected: boolean;
  onOpen: (costCode: string, el: HTMLElement) => void;
  /** LA-1159: the block's own root node, for the field's FLIP tracker. */
  register?: (el: HTMLElement | null) => void;
  /** LA-1181: hovering or focusing the block previews its share in the header bar. */
  link?: FieldLink;
}) {
  return (
    <button
      ref={register}
      type="button"
      className={`rb-blk${selected ? " rb-blk--sel" : ""}`}
      aria-pressed={selected}
      aria-label={`${titleCase(block.label)}, ${shortMoney(block.midpoint)}${block.status ? `, ${block.status.word.toLowerCase()}` : ""}`}
      onClick={(e) => onOpen(block.costCode, e.currentTarget)}
      onMouseEnter={link ? () => link.onEnter(block.costCode) : undefined}
      onMouseLeave={link?.onLeave}
      onFocus={link ? () => link.onEnter(block.costCode) : undefined}
      onBlur={link?.onLeave}
    >
      <span className="rb-bn">{titleCase(block.label)}</span>
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
  return parts.length > 0 ? parts.join(", ") : "Scope and Assumptions";
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
