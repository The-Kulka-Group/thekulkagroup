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
import type { CanonicalItemDivision } from "@/lib/rom/run";
import type { RunRecord, RunSummary } from "@/lib/rom/run-records";
import { holdBack } from "@/lib/rom/design-holds";
import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";
import { type StageFacts, stageBuilding } from "@/lib/rom/stage-model";
import type { StageEvent } from "@/lib/rom/stage-scenes";

import {
  type TradeBlock,
  headlineMoney,
  headlineOf,
  headlineRates,
  tbdScopeWords,
  shortMoney,
  tradeBlocks,
  valueTier,
} from "./block-layout";
import {
  CriteriaToast,
  CriterionPanel,
  type Ping,
  useDerivedCriteria,
} from "./DerivedCriteria";
import { type EditableProject, EditProjectForm, RestorePanel } from "./EditProject";
import { ElementBoxBlock } from "./ElementBox";
import { BulkRatePanel } from "./BulkRatePanel";
import { buildLedger } from "./ledger";
import { LedgerView } from "./LedgerView";
import { RatePanel } from "./RatePanel";
import {
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
import type { ScheduleProposalState } from "@/lib/rom/schedule-proposal";

import { initialMarkupForm, MarkupControls, markupChoicesFrom, type MarkupForm } from "./Markups";
import { planAnswersFromProject } from "./resource-plan-form";
import { useFieldFlip } from "./motion";
import { PackageCard, PackagePanel } from "./PackageCard";
import { CommentsPanel } from "./CommentsPanel";
import { PublishPanel } from "./PublishPanel";
import { AllBudgetsPanel } from "./AllBudgetsPanel";
import { ScopeEntries } from "./ScopeEntries";
import { BlockPanel, type Drilldown, NOTES_TBD_ID, NotesPanel, PanelHead, TotalPanel } from "./RomPanels";
import { type LoadedRun, loadedRunFrom, runName, savedRunsFor } from "./saved-runs";
import { FramingControl, gateAnswersFrom, initialScopeForm, ScopeControls, type ScopeForm } from "./Scope";
import { type FieldLink, ShareChip, useHoverIntent } from "./ShareBar";
import { defaultRomView, type RomView } from "./view-groups";
import {
  GroupingSwitch,
  LayoutSwitch,
  OrderSwitch,
  useLedgerGrouping,
  useRomLayout,
  useRomOrder,
  useRomView,
  ViewSwitch,
} from "./view-switch";
import { markStageBuilt, Stage } from "./stage/Stage";
import { HeroStage } from "./stage/HeroStage";
import { useNewBudgetStage } from "./stage/useNewBudgetStage";
import "./rom-blocks.css";
import "./ledger-rail.css";
import {
  CriteriaRail,
  FactsRow,
  LedgerOrderChoice,
  Menu,
  MenuItem,
  RangeBand,
  RateAlert,
} from "./ledger-rail";
import { factSpreadShares } from "./ledger-rail-model";

// LA-1101. The live conceptual budget in the Round 14 block layout: a black
// header band with the total, one block per trade biggest first, a black side
// panel for whatever was clicked, and a black strip of saved runs. The data
// flow is the one LA-16, LA-18, LA-1016 and LA-1028 built: POST /api/rom runs
// the engine, the run record is read back from /api/rom/runs, and the
// drill-down from /api/rom/provenance. The markup and scope inputs sit behind
// "Run settings" so the first screen is the answer, not the form.

/** What the page is doing. The run on screen is held apart, so a failed run or a bad setting leaves it in place. */
// One shared empty list for a page with no project. useDerivedCriteria resets
// its state whenever it is handed a different list, and a fresh `[]` default
// on every render made that an endless loop: the no-project page (an unknown
// link, or the environment's project archived) crashed with "Too many
// re-renders".
const NO_DERIVED_ASSUMPTIONS: StoredDerivedAssumption[] = [];

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
  | { kind: "edit" }
  /** A supporting item with no rate yet, taking one on its card (RatePanel.tsx). */
  | { kind: "rate"; costCode: string; editing?: boolean }
  /** Matt, 2026-09-28: suggested rates for every item with none, in one go (BulkRatePanel.tsx). */
  | { kind: "rates" }
  | { kind: "budgets" }
  /** LA-1419: publish the run on screen as a client link, and manage its versions (PublishPanel.tsx). */
  | { kind: "publish" }
  /** LA-1490: every client comment thread on the project, with Reply, Close and the rest (CommentsPanel.tsx). */
  | { kind: "comments" };

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
  openNewOnLoad = false,
  openEditOnLoad = false,
  classifications = [],
  canonicalDivisions = [],
  derivedAssumptions = NO_DERIVED_ASSUMPTIONS,
  stageFacts = null,
  scheduleProposal,
}: {
  projectId?: string;
  /**
   * LA-1399: the proposed schedule as the page read it. `ready` opens the
   * plan with it; `pending` asks for one once a plan shows.
   */
  scheduleProposal?: ScheduleProposalState;
  /** Rate tables, fee and insurance parameters, and history counts (LA-1016). */
  markupOptions?: MarkupOptions;
  /** LA-1317: the project facts the Design and Engineering stage draws from. Null with no project. */
  stageFacts?: StageFacts | null;
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
  /** /rom/intake redirects here with ?new=1 (LA-1141), since the guided New budget flow now covers what it asked. */
  openNewOnLoad?: boolean;
  /** LA-1322: `?edit=1`, from the All Budgets menu's Edit, opens Edit Project on load. */
  openEditOnLoad?: boolean;
  /**
   * The stated block classifications (LA-884, LA-1157), read once on the
   * server, so a saved run can group an element into its parent box the same
   * way the New budget preview does (LA-1158, ADR 0006).
   */
  classifications?: BlockClassification[];
  /**
   * Every canonical item's stated MasterFormat division (LA-1214), read once
   * on the server, so the MasterFormat order can resolve a bare item-number
   * cost code to its real division (field-order.ts's `divisionFor`) instead
   * of falling back to "no division" the way it does for an item with no row
   * here.
   */
  canonicalDivisions?: CanonicalItemDivision[];
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
  const [panel, setPanel] = useState<Panel | null>(() =>
    openNewOnLoad ? { kind: "new" } : openEditOnLoad && projectId ? { kind: "edit" } : null,
  );
  const [form, setForm] = useState<MarkupForm>(() =>
    initialMarkupForm(markupOptions, markupDefault, scheduleProposal?.kind === "ready" ? scheduleProposal.proposal : null),
  );
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
  const [chosenView, setView] = useRomView(
    panel?.kind === "new" ? "scope" : run ? defaultRomView(run.rom, classifications) : "scope",
  );
  // Matt, 2026-09-27: hide By Package until packages are assigned. Until most
  // of the run's trade cost has a stated buyout package (the same test
  // defaultRomView uses), By Package is one Unassigned Package card, so the
  // switch hides and the field shows By Scope. The viewer's remembered
  // choice is kept, so By Package returns once packages are stated.
  const packagesAssigned = run !== null && defaultRomView(run.rom, classifications) === "package";
  const view: RomView = packagesAssigned && panel?.kind !== "new" ? chosenView : "scope";

  // LA-1181: MasterFormat or Largest First, remembered per viewer like the view.
  const [order, setOrder] = useRomOrder();
  // LA-1254: cards or the schedule-of-values ledger, and how the ledger groups.
  const [layout, setLayout] = useRomLayout();
  // LA-1384: the Ledger opens Widest Range First, the trades that drive the
  // range at the top. Order also offers Largest First and MasterFormat.
  const [bySpread, setBySpread] = useState(true);
  const [grouping, setGrouping] = useLedgerGrouping();

  const busy = state.phase === "running" || state.phase === "loading";
  // Every line that adds to the total, since the side panel opens any of them
  // by cost code whether or not it is shown inside a box or a card.
  const blocks = useMemo(() => (run ? tradeBlocks(run.rom) : []), [run]);
  // LA-1214: a bare item number's own division, for field-order.ts's
  // `divisionFor` to fall back on once no classification states one.
  const canonicalDivisionMap = useMemo(
    () => new Map(canonicalDivisions.map((item) => [item.itemNumber, item.division])),
    [canonicalDivisions],
  );
  // LA-1181: the field in the chosen view and order (field-order.ts), and the
  // header bar's shares for it, so the dividers follow the field's order.
  const entries = useMemo(
    () => (run ? orderField(buildField(view, run.rom, classifications, canonicalDivisionMap), order) : []),
    [run, classifications, canonicalDivisionMap, view, order],
  );
  const bar = useMemo(() => (run ? barModel(run.rom, entries) : null), [run, entries]);
  // The ledger always reads the By Scope field, so an element keeps its items.
  const ledger = useMemo(() => {
    if (!run || layout !== "ledger") return null;
    const scopeEntries = view === "scope" ? entries : orderField(buildField("scope", run.rom, classifications, canonicalDivisionMap), order);
    return buildLedger(run.rom, scopeEntries, grouping, order, classifications, canonicalDivisionMap);
  }, [run, layout, view, entries, grouping, order, classifications, canonicalDivisionMap]);

  // The live preview's field and bar, the same way.
  const liveRom = live.phase === "ready" || live.phase === "waiting" ? live.rom : null;
  const liveClassifications = live.phase === "ready" || live.phase === "waiting" ? live.classifications : null;
  const liveEntries = useMemo(
    () =>
      liveRom && liveClassifications
        ? orderField(buildField("scope", liveRom, liveClassifications, canonicalDivisionMap), order)
        : [],
    [liveRom, liveClassifications, canonicalDivisionMap, order],
  );
  // LA-1318: New Budget's stage. Each answer and Design and Engineering card
  // plays on it, and what each moved flies into its boxes, which stay lit
  // with its name for a moment and keep its source line.
  const newStage = useNewBudgetStage(
    panel?.kind === "new",
    draft,
    liveEntries,
    live.phase === "ready" ? live.grossSquareFeet : null,
  );
  // LA-1324: what a Design and Engineering card has yet to decide stays out
  // of the total and the bar until its moment lands.
  const heldLive = useMemo(
    () => (live.phase === "ready" ? { ...live, rom: holdBack(live.rom, newStage.held) } : live),
    [live, newStage.held],
  );
  const liveBar = useMemo(
    () =>
      heldLive.phase === "ready"
        ? barModel(
            heldLive.rom,
            liveEntries.map((entry) => (newStage.designing.has(entry.key) ? { ...entry, midpoint: 0 } : entry)),
          )
        : null,
    [heldLive, liveEntries, newStage.designing],
  );
  const heroRef = useRef<HTMLDivElement>(null);
  // A moment's price tag flies from the hero stage's answer, where it was decided.
  const onStageLand = useCallback(
    (event: StageEvent, point: { x: number; y: number }) => {
      const at = heroRef.current?.getBoundingClientRect();
      newStage.onLand(event, at ? { x: at.left + 48, y: at.bottom - 18 } : point);
    },
    [newStage],
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
  const headline = useMemo(
    () => (run ? headlineOf(run.rom, { grossSquareFeet: run.grossSquareFeet, unitCount: run.unitCount }) : null),
    [run],
  );

  // LA-860: Design Criteria. Hovering a card lights the blocks it feeds on
  // LA-1181's hover intent (70ms in, 140ms out); an open card keeps them lit.
  const criteria = useDerivedCriteria(derivedAssumptions);
  const criterionHover = useHoverIntent();
  // LA-1317: the building the stage draws, from the project's facts and its cards.
  const stageSpec = useMemo(
    () => (stageFacts ? stageBuilding(stageFacts, criteria.items) : null),
    [stageFacts, criteria.items],
  );
  // LA-1325: the codes the Building View's parts open.
  const criterionCodes = useMemo(() => criteria.items.map((item) => item.code), [criteria.items]);
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
      (panel.kind !== "criterion" || (next.kind === "criterion" && panel.code === next.code)) &&
      (panel.kind !== "rate" || (next.kind === "rate" && panel.costCode === next.costCode));
    if (same) {
      closePanel();
      return;
    }
    if (panel === null && from) opener.current = from;
    setPanel(next);
  }

  // LA-1227: Run settings has no Run ROM button. Each change saves to the
  // project and records a new run on its own, the way New Budget's last
  // answer does (LA-1225). POST /api/rom already saves the settings before it
  // runs (LA-1109), so the run request is the save. A change waits for the
  // estimator to pause, so typing a percent records one run, not one per
  // keystroke. A change made while a run is in flight runs again once that
  // run lands, with whatever the settings are by then.
  const latestSettings = useRef({ form, scopeForm, framing });
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const rerun = useRef(false);
  const [settingsNote, setSettingsNote] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    },
    [],
  );

  function changeSettings(next: Partial<{ form: MarkupForm; scopeForm: ScopeForm; framing: FramingSystem | "" }>) {
    latestSettings.current = { ...latestSettings.current, ...next };
    if (next.form) setForm(next.form);
    if (next.scopeForm) setScopeForm(next.scopeForm);
    if (next.framing !== undefined) setFraming(next.framing);
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      autoTimer.current = null;
      queueRun();
    }, 700);
  }

  /** Records a run from the settings as they stand, or once the one in flight lands. */
  function queueRun() {
    if (inFlight.current) rerun.current = true;
    else void runRom(latestSettings.current, true);
  }

  async function runRom(
    settings: { form: MarkupForm; scopeForm: ScopeForm; framing: FramingSystem | "" } = latestSettings.current,
    auto = false,
  ) {
    if (!projectId) return;
    // Without the options the page could not read the rate tables, so the
    // request names no markups and the run uses the recorded defaults.
    const choices = markupOptions ? markupChoicesFrom(settings.form, markupOptions, planAnswersFromProject(stageFacts)) : null;
    if (choices && !choices.ok) {
      // A half-typed value saves nothing and records no run until it parses.
      if (auto) setSettingsNote(choices.error);
      else setState({ phase: "failed", error: choices.error });
      return;
    }
    setSettingsNote(null);
    // Without a defaults object the page could not read the project's gate
    // columns, so the request names no gates and the run reads them itself.
    const gates = scopeDefaults ? gateAnswersFrom(settings.scopeForm) : null;
    const framing = settings.framing;
    inFlight.current = true;
    setState({ phase: "running" });
    try {
      await postRun(choices, gates, framing, auto);
    } finally {
      inFlight.current = false;
      if (rerun.current) {
        rerun.current = false;
        void runRom(latestSettings.current, true);
      }
    }
  }

  async function postRun(
    choices: ReturnType<typeof markupChoicesFrom> | null,
    gates: ReturnType<typeof gateAnswersFrom> | null,
    framing: FramingSystem | "",
    auto: boolean,
  ) {
    if (!projectId || (choices && !choices.ok)) return;
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
          unitCount: null,
          startedAt: null,
          answerCount: null,
        },
      );
      setState({ phase: "idle" });
      // An auto run keeps Run settings open, so the next change can follow.
      if (!auto) setPanel(null);
      void refreshRuns();
      // LA-1265: a run can add, change or remove a Design and Engineering
      // card (V-2 follows V-1), so the page reads the criteria again.
      router.refresh();
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
  const rateItem =
    panel?.kind === "rate" && run
      ? panel.editing
        ? run.rom.lines.find((line) => line.costCode === panel.costCode && line.driverCostCode)
        : run.rom.unpricedItems.find((item) => item.costCode === panel.costCode)
      : undefined;
  // Only a supporting item has a rate unit, so only those can take a rate.
  const rateable = run ? run.rom.unpricedItems.filter((item) => item.driverCostCode) : [];
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

  // The Building View, under the rail, and the budget body.
  const savedStage = stageSpec ? (
                <Stage
      key="saved"
      mode="assemble"
      building={stageSpec}
      projectId={projectId ?? null}
      cards={criterionCodes}
      openCode={openCriterion?.code ?? null}
      onOpenCard={(code, el) => openPanel({ kind: "criterion", code }, el)}
    />
  ) : null;
  const budgetField = (
    <>
        {run && layout === "ledger" && ledger && bar && panel?.kind !== "new" ? (
          <LedgerView
            rom={run.rom}
            ledger={ledger}
            bar={bar}
            grossSquareFeet={run.grossSquareFeet}
            mark={litCriterion ? { code: litCriterion.code, costCodes: new Set(litCriterion.costCodes) } : null}
            bySpread={bySpread}
            selected={openBlock?.costCode ?? (panel?.kind === "rate" ? panel.costCode : null)}
            onOpen={(costCode, el) =>
              openPanel(
                run.rom.unpricedItems.some((item) => item.costCode === costCode && item.driverCostCode)
                  ? { kind: "rate", costCode }
                  : { kind: "block", costCode },
                el,
              )
            }
          />
        ) : run ? (
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
              onOpen={(costCode, el) =>
                openPanel(
                  run.rom.unpricedItems.some((item) => item.costCode === costCode && item.driverCostCode)
                    ? { kind: "rate", costCode }
                    : { kind: "block", costCode },
                  el,
                )
              }
              onOpenPackage={(key, el) => openPanel({ kind: "package", key }, el)}
            />
          )
        ) : null}
    </>
  );
  // The Ledger's order adds Widest Range First; Cards keep their two orders.
  const orderChoice =
    layout === "ledger" ? (
      <LedgerOrderChoice
        order={order}
        bySpread={bySpread}
        onChange={(next, spread) => {
          setOrder(next);
          setBySpread(spread);
        }}
      />
    ) : (
      <div className="pm-row">
        <span>Order</span>
        <OrderSwitch order={order} onChange={setOrder} />
      </div>
    );
  // The toolbar's view controls on a desk. The two choices made often stay one
  // click each; order and ledger rows live in the Order menu.
  const ledgerViews = (
    <div className="pv">
      {packagesAssigned ? <ViewSwitch view={view} onChange={setView} /> : null}
      <LayoutSwitch layout={layout} onChange={setLayout} />
      <Menu
        label="Order"
        summary={[
          bySpread && layout === "ledger" ? "Widest Range First" : order === "largest" ? "Largest First" : "MasterFormat",
          layout === "ledger" ? (grouping === "division" ? "By Division" : "By Element") : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      >
        {() => (
          <>
            {orderChoice}
            {layout === "ledger" ? (
              <div className="pm-row">
                <span>Ledger Rows</span>
                <GroupingSwitch grouping={grouping} onChange={setGrouping} />
              </div>
            ) : null}
          </>
        )}
      </Menu>
    </div>
  );
  const statusPills = (withRate: boolean) =>
    run && headline ? (
      <>
            {/* LA-1337: TBD scope and a TBD markup are fixed in different
                places, so each gets its own chip. This one opens the notes,
                which list the scope. */}
            {tbdScopeWords(headline.tbdScope) ? (
              <button
                type="button"
                className="rb-td rb-td--btn"
                title={tbdScopeWords(headline.tbdScope) ?? undefined}
                aria-expanded={panel?.kind === "notes"}
                onClick={(e) => {
                  openPanel({ kind: "notes" }, e.currentTarget);
                  // The TBD list sits under the held lines, so the panel
                  // opens scrolled to it once it has drawn.
                  requestAnimationFrame(() =>
                    document.getElementById(NOTES_TBD_ID)?.scrollIntoView({ block: "start" }),
                  );
                }}
              >
                <span className="rb-dot rb-dot--working" aria-hidden="true" />
                {tbdScopeWords(headline.tbdScope)}
              </button>
            ) : null}
            {withRate && headline.tbd.length > 0 ? (
              // LA-1256: a blank markup rate is fixed in Run Settings, so the
              // note opens it.
              <button
                type="button"
                className="rb-td rb-td--btn"
                onClick={(e) => openPanel({ kind: "settings" }, e.currentTarget)}
              >
                <span className="rb-dot rb-dot--stuck" aria-hidden="true" />
                {headline.tbd.join(", ")} TBD, Enter a Rate
              </button>
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
            {projectId && rateable.length > 0 ? (
              <button
                type="button"
                className="rb-oq"
                aria-expanded={panel?.kind === "rates"}
                onClick={(e) => openPanel({ kind: "rates" }, e.currentTarget)}
              >
                <span className="rb-dot rb-dot--stuck" aria-hidden="true" />
                {rateable.length === 1 ? "Suggest the Missing Rate" : `Suggest ${rateable.length} Missing Rates`}
              </button>
            ) : null}
            <ShareChip chip={chip} />
      </>
    ) : null;
  // The toolbar keeps two short pills: the notes (held lines and TBD scope)
  // open one panel, and missing rates open another.
  const toolbarPills = () => {
    if (!run || !headline) return null;
    const tbdCount = headline.tbdScope.length;
    const notes = [held > 0 ? `${held} Held` : null, tbdCount > 0 ? `${tbdCount} TBD` : null].filter(Boolean).join(" · ");
    return (
      <>
        {notes ? (
          <button
            type="button"
            className="rb-oq"
            aria-expanded={panel?.kind === "notes"}
            aria-label={`Notes: ${held} held for review${tbdCount > 0 ? `, ${tbdCount} TBD` : ""}`}
            onClick={(e) => openPanel({ kind: "notes" }, e.currentTarget)}
          >
            {notes}
          </button>
        ) : null}
        {projectId && rateable.length > 0 ? (
          <button
            type="button"
            className="rb-oq"
            aria-expanded={panel?.kind === "rates"}
            aria-label={rateable.length === 1 ? "Suggest the missing rate" : `Suggest ${rateable.length} missing rates`}
            onClick={(e) => openPanel({ kind: "rates" }, e.currentTarget)}
          >
            <span className="rb-dot rb-dot--stuck ptb-alert" aria-hidden="true" />
            {rateable.length === 1 ? "1 Missing Rate" : `${rateable.length} Missing Rates`}
          </button>
        ) : null}
      </>
    );
  };
  const factsProps = {
    items: criteria.items,
    shares: factSpreadShares(blocks, criteria.items),
    selectedCode: openCriterion?.code ?? null,
    recheck: criteria.recheck,
    flip: criteria.flip,
    ping,
    onOpen: (code: string, el: HTMLElement | null) => openPanel({ kind: "criterion", code }, el),
    onEnter: criterionHover.enter,
    onLeave: criterionHover.leave,
  };
  // The Settings menu's rows; the phone's one Menu adds New Budget first.
  const settingsItems = (close: () => void, withNew: boolean) => (
    <>
      {withNew ? <MenuItem onClick={() => { close(); openPanel({ kind: "new" }); }}>New Budget</MenuItem> : null}
      <MenuItem onClick={() => { close(); openPanel({ kind: "budgets" }); }}>All Budgets</MenuItem>
      {projectId ? <MenuItem onClick={() => { close(); openPanel({ kind: "edit" }); }}>Edit Project</MenuItem> : null}
      {withNew && projectId && run ? <MenuItem onClick={() => { close(); openPanel({ kind: "publish" }); }}>Publish Budget</MenuItem> : null}
      {withNew && projectId && run ? <MenuItem onClick={() => { close(); openPanel({ kind: "comments" }); }}>Client Comments</MenuItem> : null}
      {projectId && (markupOptions || scopeDefaults) ? (
        <MenuItem onClick={() => { close(); openPanel({ kind: "settings" }); }}>Run Settings</MenuItem>
      ) : null}
      <div className="pm-sep" />
      {/* LA-1321: Engine Parameters belongs to Conceptual Budget, so it lives here rather than in the sidebar. */}
      <MenuItem href="/rom/parameters">Engine Parameters</MenuItem>
    </>
  );

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
          {/* LA-1329: a fresh page says nothing about a project; the picker beside it asks. */}
          {!projectId && projectNotFound ? <span>Project Not Found</span> : null}
          <span className="rb-sp" />
          {/* New Budget always builds By Scope: production has almost no
              buyout packages stated yet, so By Package would pour every
              answer into one Not Yet Packaged card (Matt, 2026-09-27). */}
          {/* LA-1384: New Budget stays out; the rest is one Settings menu. On a phone, one Menu holds all of it. */}
          <button
            type="button"
            className="rb-hbtn pm-wide"
            aria-expanded={panel?.kind === "new"}
            onClick={(e) => openPanel({ kind: "new" }, e.currentTarget)}
          >
            New Budget
          </button>
          {projectId && run ? (
            <button
              type="button"
              className="rb-hbtn pm-wide"
              aria-expanded={panel?.kind === "publish"}
              onClick={(e) => openPanel({ kind: "publish" }, e.currentTarget)}
            >
              Publish
            </button>
          ) : null}
          {projectId && run ? (
            <button
              type="button"
              className="rb-hbtn pm-wide"
              aria-expanded={panel?.kind === "comments"}
              onClick={(e) => openPanel({ kind: "comments" }, e.currentTarget)}
            >
              Client Comments
            </button>
          ) : null}
          <div className="pm-wide">
            <Menu label="Settings">{(close) => settingsItems(close, false)}</Menu>
          </div>
          <div className="pm-phone">
            <Menu label="Menu">{(close) => settingsItems(close, true)}</Menu>
          </div>
          {/* LA-1227: once a project has a run, a change in Run settings
              records the next one on its own. The button stays only for a
              project with no run yet, such as a New Budget closed midway. */}
          {/* A fresh page has nothing to run, so it shows no Run ROM (LA-1329). */}
          {!run && projectId ? (
            <button className="btn btn--primary" type="button" onClick={() => void runRom()} disabled={busy}>
              {state.phase === "running" ? "Running" : "Run ROM"}
            </button>
          ) : null}
        </div>

        <div className="rb-t2">
          {/* LA-1142: while New budget is open, the band shows the total the
              answers so far add up to. */}
          <div className="rb-fresh-note lb-hd">
            {panel?.kind === "new" ? <LiveTotal
                live={heldLive}
                bar={liveBar}
                chip={liveChip}
                litKey={liveLitKey}
                source={newStage.totalSource}
              /> : null}
          </div>
          {run && headline ? (
            <>
              <button
                type="button"
                className="rb-tot"
                title={`${titleCase(headline.label)}, ${headline.includes}`}
                aria-expanded={panel?.kind === "total"}
                onClick={(e) => openPanel({ kind: "total" }, e.currentTarget)}
              >
                <span className="rb-tlab">
                  <span className="rb-tl">{titleCase(headline.label)}</span>
                  <span className="rb-ti">{headline.includes}</span>
                </span>
                <span className="rb-tv num">{headlineMoney(headline.midpoint, headline)}</span>
                <span className="rb-tb">
                  <RangeBand low={headline.low} mid={headline.midpoint} high={headline.high} format={(v) => headlineMoney(v, headline)} />
                  {/* The chevron rides inside the last piece so it never wraps onto a
                      line of its own; on a phone the rates take their own line. */}
                  {headlineRates(headline) ? (
                    <span className="rb-rate num">
                      {headlineRates(headline)}
                      <Chevron />
                    </span>
                  ) : (
                    <Chevron />
                  )}
                </span>
              </button>
            </>
          ) : panel?.kind === "new" ? null : (
            <p className="rb-tnone">
              {state.phase === "running"
                ? "Reading data and computing lines."
                : state.phase === "loading"
                  ? "Reading the saved run."
                  : "No ROM on screen yet."}
            </p>
          )}
          {/* During New Budget the live field's order sits beside the running total. */}
          {panel?.kind === "new" ? (
            <div className="rb-views">
              <OrderSwitch order={order} onChange={setOrder} />
            </div>
          ) : null}
          {/* LA-1321: New Budget's status pills get their own line under the total. */}
          {run && headline && panel?.kind === "new" ? <div className="rb-status">{statusPills(true)}</div> : null}
          {run && panel?.kind !== "new" ? <FactsRow {...factsProps} /> : null}
          {/* The header's one line that appears only when something needs doing. */}
          {run && headline && panel?.kind !== "new" ? (
            <RateAlert tbd={headline.tbd} onEnterRate={(el) => openPanel({ kind: "settings" }, el)} />
          ) : null}
        </div>
      </header>

      <main className="rb-fld" aria-busy={busy}>
        {/* LA-1142: and the field shows the budget building, under Design and
            Engineering's stage (LA-1324), with the model in the corner (LA-1325). */}
        <div className="rb-fresh-note">
          {panel?.kind === "new" ? (
            <HeroStage
              ref={heroRef}
              moment={newStage.moment}
              criteria={newStage.criteria}
              building={newStage.building}
              rail={newStage.rail}
              side={
                <Stage
                  key="live"
                  mode="live"
                  quiet
                  building={newStage.building}
                  events={newStage.events}
                  onStart={newStage.onStart}
                  onLand={onStageLand}
                />
              }
            />
          ) : null}
          {panel?.kind === "new" ? (
            <LiveField
              live={live}
              view="scope"
              order={order}
              entries={liveEntries}
              selectedKey={liveSelected}
              onSelect={(key) => setLiveSelected((current) => (current === key ? null : key))}
              link={link}
              mark={newStage.mark}
              sources={newStage.sources}
              designing={newStage.designing}
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
        {/* LA-1384: three columns, each with one job. Design and Engineering on
            the left, the budget in the middle, and whatever is open on the
            right, so nothing that opens covers the rail or the budget. */}
        {run && panel?.kind !== "new" ? (
          <div className="pl">
            <div className="pl-main">
              {/* The view controls and notes sit on the budget they change, off the black band. */}
              <div className="ptb" role="toolbar" aria-label="Budget View">
                <div className="ptb-l pm-wide">{ledgerViews}</div>
                {/* On a phone: the scope switch, and one View menu for the rest, so the controls take one line. */}
                <div className="ptb-l ptb-ph">
                  {packagesAssigned ? <ViewSwitch view={view} onChange={setView} /> : null}
                  <Menu label="View">
                    {() => (
                      <>
                        <div className="pm-row">
                          <span>Show</span>
                          <LayoutSwitch layout={layout} onChange={setLayout} />
                        </div>
                        {orderChoice}
                        {layout === "ledger" ? (
                          <div className="pm-row">
                            <span>Ledger Rows</span>
                            <GroupingSwitch grouping={grouping} onChange={setGrouping} />
                          </div>
                        ) : null}
                      </>
                    )}
                  </Menu>
                </div>
                <div className="ptb-r">{toolbarPills()}</div>
              </div>
              {budgetField}
            </div>
            <CriteriaRail {...factsProps} building={savedStage} />
          </div>
        ) : (
          budgetField
        )}
      </main>

      {panel ? (
        <aside className="rb-pnl" aria-label="Detail">
          {panel.kind === "settings" ? (
            <>
              <PanelHead
                title="Run Settings"
                sub="Each change saves to this project and records a new run."
                onClose={closePanel}
                titleRef={titleRef}
              />
              <p className="nb-save rs-status" role="status">
                {state.phase === "running" ? "Saving a new run" : settingsNote ? "" : run ? `Showing ${runWords(run)}` : ""}
              </p>
              {/* Editing stays open while a run is in flight; a change made
                  then runs again once that run lands. */}
              {projectId && framingDefault !== undefined ? (
                <FramingControl
                  value={framing}
                  onChange={(value) => changeSettings({ framing: value })}
                  disabled={state.phase === "loading"}
                />
              ) : null}
              {projectId && scopeDefaults ? (
                <ScopeControls
                  form={scopeForm}
                  onChange={(value) => changeSettings({ scopeForm: value })}
                  disabled={state.phase === "loading"}
                />
              ) : null}
              {projectId && markupOptions ? (
                <MarkupControls
                  options={markupOptions}
                  form={form}
                  onChange={(value) => changeSettings({ form: value })}
                  disabled={state.phase === "loading"}
                  projectId={projectId}
                  schedule={scheduleProposal}
                  answers={planAnswersFromProject(stageFacts)}
                />
              ) : null}
              {settingsNote ? <p className="rb-pp">{settingsNote} Nothing saves until it does.</p> : null}
              {state.phase === "failed" ? (
                <p className="rb-pp rb-pp--error" role="alert">
                  {state.error}{" "}
                  <button className="nb-retry" type="button" onClick={() => void runRom()}>
                    Try Again
                  </button>
                </p>
              ) : null}
            </>
          ) : null}

          {panel.kind === "budgets" ? (
            <>
              <PanelHead
                title="All Budgets"
                sub="Open, edit, archive or delete any budget. Archived budgets can be restored."
                onClose={closePanel}
                titleRef={titleRef}
              />
              <AllBudgetsPanel currentProjectId={projectId} />
            </>
          ) : null}

          {panel.kind === "new" ? (
            <>
              <PanelHead
                title="New Budget"
                sub="Set up the project, then answer one question at a time. The budget builds and saves as you go."
                onClose={closePanel}
                titleRef={titleRef}
              />
              <GuidedNewBudget
                markupOptions={markupOptions}
                onDraft={setDraft}
                onStageEvent={newStage.onStageEvent}
                onCriteria={newStage.onCriteria}
                landedCards={newStage.landedCards}
                onCreated={(id) => {
                  // The viewer just watched it go up, so the saved budget opens on the finished building.
                  markStageBuilt(id);
                  router.push(`/rom?project=${id}`);
                }}
              />
            </>
          ) : null}

          {panel.kind === "edit" && projectId ? (
            <>
              <PanelHead
                title="Edit Project"
                sub="Each change saves to this project and records a new run. Earlier runs are untouched."
                onClose={closePanel}
                titleRef={titleRef}
              />
              <p className="nb-save rs-status" role="status">
                {state.phase === "running" ? "Saving a new run" : run ? `Showing ${runWords(run)}` : ""}
              </p>
              {state.phase === "failed" ? (
                <p className="rb-pp rb-pp--error" role="alert">
                  {state.error}{" "}
                  <button className="nb-retry" type="button" onClick={() => void runRom()}>
                    Try Again
                  </button>
                </p>
              ) : null}
              <EditProjectPanelBody
                projectId={projectId}
                onSaved={(savedFraming) => {
                  // Framing is on this form and in Run settings. The run
                  // saves Run settings' copy first, so bring it in line with
                  // what was just saved here, or the run would undo it.
                  latestSettings.current = { ...latestSettings.current, framing: savedFraming };
                  setFraming(savedFraming);
                  // LA-1240: a fact change records a new run, read from the
                  // project row just saved, and the panel stays open for the
                  // next change. The refresh carries the new name and area
                  // into the header's picker.
                  queueRun();
                  router.refresh();
                }}
                onArchived={() => {
                  closePanel();
                  router.push("/rom");
                }}
              />
            </>
          ) : null}

          {panel.kind === "publish" && run && projectId ? (
            <>
              <PanelHead
                title="Publish Budget"
                sub={`Publishes ${runWords(run)} as a link for the client.`}
                onClose={closePanel}
                titleRef={titleRef}
              />
              {/* Keyed by run, so loading another saved run starts the form over for it. */}
              <PublishPanel key={run.runId} projectId={projectId} runId={run.runId} />
            </>
          ) : null}

          {panel.kind === "comments" && projectId ? (
            <>
              <PanelHead
                title="Client Comments"
                sub="Every comment, question and flag the client left on this budget."
                onClose={closePanel}
                titleRef={titleRef}
              />
              <CommentsPanel projectId={projectId} />
            </>
          ) : null}

          {panel.kind === "total" && run && headline ? (
            <>
              <PanelHead
                title={titleCase(headline.label)}
                sub={runLabel(run)}
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
                sub={`${openBlock.costCode} · ${runLabel(run)}`}
                onClose={closePanel}
                titleRef={titleRef}
              />
              {projectId && openBlock.line.driverCostCode ? (
                <div className="rb-acts">
                  <button
                    className="btn"
                    type="button"
                    onClick={() => setPanel({ kind: "rate", costCode: openBlock.costCode, editing: true })}
                  >
                    Edit Rate
                  </button>
                </div>
              ) : null}
              <BlockPanel block={openBlock} drilldown={drilldown} grossSquareFeet={run.grossSquareFeet} />
              {projectId ? (
                <ScopeEntries key={openBlock.costCode} projectId={projectId} runId={run.runId} costCode={openBlock.costCode} />
              ) : null}
            </>
          ) : null}

          {panel.kind === "rate" && run && projectId && rateItem ? (
            <>
              <PanelHead
                title={titleCase(rateItem.label)}
                sub={`${rateItem.costCode} · ${runLabel(run)}`}
                onClose={closePanel}
                titleRef={titleRef}
              />
              <RatePanel
                key={`${rateItem.costCode}-${panel.editing ? "edit" : "new"}`}
                projectId={projectId}
                costCode={rateItem.costCode}
                editing={panel.editing}
                driverLabel={
                  run.rom.lines.find((line) => line.costCode === rateItem.driverCostCode)?.label ?? null
                }
                onSaved={() => {
                  // The new rate is in the benchmarks; a run shows it priced.
                  closePanel();
                  queueRun();
                }}
              />
            </>
          ) : null}

          {panel.kind === "rates" && run && projectId ? (
            <>
              <PanelHead
                title="Suggest Missing Rates"
                sub={runLabel(run)}
                onClose={closePanel}
                titleRef={titleRef}
              />
              {rateable.length > 0 ? (
                <BulkRatePanel
                  projectId={projectId}
                  items={rateable.map((item) => ({ costCode: item.costCode, label: titleCase(item.label) }))}
                  onSaved={() => {
                    closePanel();
                    queueRun();
                  }}
                />
              ) : (
                <p className="rb-pp">Every item in this budget has a rate.</p>
              )}
            </>
          ) : null}

          {panel.kind === "package" && run && openPackage ? (
            <>
              <PanelHead
                title={titleCase(openPackage.label)}
                sub={`${openPackage.division ? `Division ${openPackage.division} · ` : ""}${runLabel(run)}`}
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
                // LA-1265: a correction changes what the run prices (V-1's type
                // picks the per-stop rate and whether V-2 applies), so it records
                // a new run like every other change on a saved budget.
                onSave={(value, reason) => void criteria.save(openCriterion, value, reason).then(() => run && queueRun())}
                onRevert={() => void criteria.revert(openCriterion).then(() => run && queueRun())}
                onPing={setPing}
              />
            </>
          ) : null}

          {panel.kind === "notes" && run ? (
            <>
              <PanelHead
                title="Scope and Assumptions"
                sub={runLabel(run)}
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
                  // LA-1335: named by when it ran and how much was answered; the
                  // id stays on hover for support.
                  aria-label={`Load the run from ${runName(one.startedAt, one.answerCount)}`}
                  title={`Run ${one.id}`}
                >
                  <span className="rb-r1">
                    <b>{STAMP.format(started)}</b>
                    <span className="rb-rd num">{CLOCK.format(started)}</span>
                  </span>
                  {one.answerCount !== null ? (
                    <span className="rb-rk num">
                      {one.answerCount} {one.answerCount === 1 ? "Answer" : "Answers"}
                    </span>
                  ) : null}
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
          <Link href="/rom/runs">All Runs</Link>
        </nav>
      </footer>
      <CriteriaToast toast={criteria.toast} onDismiss={criteria.dismissToast} />
    </div>
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
  if (held > 0) parts.push(`${held} Held for Review`);
  if (rom.assumedPresentItems.length > 0) parts.push(`${rom.assumedPresentItems.length} Assumed Present`);
  return parts.length > 0 ? parts.join(", ") : "Scope and Assumptions";
}

/** The total's open-the-panel mark. */
function Chevron() {
  return (
    <svg className="rb-chev" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A run's name as a panel subtitle: "Sep 28, 11:55 PM · 14 answers". */
function runLabel(run: LoadedRun): string {
  return run.startedAt ? runName(run.startedAt, run.answerCount) : "Run Just Made";
}

/** A run's name inside a sentence: "the run from Sep 28, 11:55 PM · 14 answers". */
function runWords(run: LoadedRun): string {
  // A run just made is shown before its record is read back, with no start
  // time yet: it is the run just made.
  if (!run.startedAt) return "the run just made";
  return `the run from ${runName(run.startedAt, run.answerCount)}`;
}

/** Fetches the project's own row for the Edit panel's prefill (LA-1110). */
function EditProjectPanelBody({
  projectId,
  onSaved,
  onArchived,
}: {
  projectId: string;
  onSaved: (framing: FramingSystem | "") => void;
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
    <EditProjectForm project={state.project} onSaved={onSaved} onArchived={onArchived} />
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
