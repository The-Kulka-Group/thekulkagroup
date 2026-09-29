"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  readUnitCount,
  type BlockClassification,
  type DataSnapshot,
  type FramingSystem,
  type MarkupChoices,
  type Rom,
} from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";
import { knownScopeRom, previewAnswers, sectionsAwaitingFollowUps } from "@/lib/rom/preview";
import { tier1Flow, type Responses } from "@/lib/rom/question-flow";

import {
  headlineMoney,
  headlineOf,
  headlineRates,
  pricedTradesWords,
  shortMoney,
  tbdScopeWords,
  valueTier,
  type TradeBlock,
} from "./block-layout";
import { LiveElementBox } from "./ElementBox";
import type { BarModel, Chip, FieldEntry, RomOrder } from "./field-order";
import { useFieldFlip } from "./motion";
import { PackageCard, UnpricedDot } from "./PackageCard";
import { type FieldLink, ShareBar, ShareChip } from "./ShareBar";
import { SpringMoney } from "./SpringMoney";
import type { RomView } from "./view-groups";

// LA-1142. The budget builds behind the New budget panel while its questions
// are answered. The browser runs the same pure engine a run does over the
// snapshot GET /api/rom/snapshot reads (see lib/rom/preview.ts), so every
// figure here is one the run saved at the last answer records from the same data. Nothing
// here prices anything, and nothing here is saved.
//
// LA-1147: the field starts empty, and scope arrives as answers put it in
// (lib/rom/preview.ts, knownScopeRom). Naming the project brings in the base
// trades, the lines no scope question governs, as tiles with no figure yet.
// A line a scope question governs arrives only once an answer puts it in
// scope, the elevator on Yes for example, and until then it is neither on
// screen nor in the total.
//
// The motion carries what changed, so the estimator sees what an answer did
// without reading a diff:
//   - Before the gross area, each trade stands as an empty tile in the order
//     it will take. Entering the area rolls every figure up from zero, biggest
//     first, and the header total counts with them.
//   - A trade an answer brings in blurs into its place and counts up.
//   - Figures and the total move on a critically damped spring, so a number
//     glides to its new value and never overshoots a dollar amount.
//   - A block that changes rank slides to its new place (FLIP).
//   - A scope answer of No or Don't know lifts the block off the field and
//     settles it into the matching tray below; changing the answer back
//     returns it. Other blocks close ranks as it goes.
//   - Every answer that moves the total flashes the change beside it.
//   - GRs/GCs, fee and insurance grow onto the composition bar at the
//     Markups step.
//   - LA-1181: the field sorts in the order the viewer picked (field-order.ts),
//     and hovering or selecting a card lights its share in that bar.
// prefers-reduced-motion drops all of it: figures and blocks land at once.

/** What the New budget panel has collected so far, as the preview reads it. */
export type BudgetDraft = {
  /** Whether the project has a name yet. The field stays empty until it does. */
  named: boolean;
  responses: Responses;
  framing: FramingSystem | "";
  /** Null until the Markups step, so the total reads as trade cost first. */
  markups: MarkupChoices | null;
  /**
   * LA-1265: facts Design and Engineering set once its answers land, such as
   * elevatorType from V-1 and hydraulicJackType from V-2, so the live budget
   * prices the elevator and the well hole the way the run will.
   */
  derivedFacts?: Record<string, string>;
};

export type LiveBudget =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed"; error: string }
  /** Nothing answered yet that brings scope in, so the field is empty. */
  | { phase: "empty" }
  /**
   * The trades in scope are known but the area is not, so tiles stand empty
   * in the order they will take. `rom` is priced on a stand-in area only to
   * order them; no figure from it shows. `answered` is the ROM as the answers
   * stand, read only for what was answered No or Don't know. The screen
   * groups `rom` by view and order itself (field-order.ts, LA-1181), reading
   * `classifications` for elements, packages and divisions.
   */
  | { phase: "waiting"; rom: Rom; answered: Rom; classifications: BlockClassification[] }
  /** `rom` is the scope known so far, which the blocks, boxes and the total show. */
  | {
      phase: "ready";
      rom: Rom;
      answered: Rom;
      classifications: BlockClassification[];
      grossSquareFeet: number;
      unitCount: number | null;
    };

// Only used for tile order before the area is known; no figure from it shows.
const ORDER_AREA = "10000";

/**
 * LA-1153: the header's count of items in scope with no benchmark behind
 * them yet (ADR 0006, "A block can arrive unpriced"). Title case, since every
 * label in the software is (CONTEXT.md / kulka-rom-naming-title-case).
 */
function itemsNotPricedLabel(count: number): string {
  return count === 1 ? "1 Item Not Priced" : `${count} Items Not Priced`;
}

const snapshots = new Map<string, Promise<DataSnapshot>>();

function readSnapshot(projectType: string, constructionKind: string): Promise<DataSnapshot> {
  const key = `${projectType}/${constructionKind}`;
  let pending = snapshots.get(key);
  if (!pending) {
    const query = new URLSearchParams({ projectType, constructionKind });
    pending = fetch(`/api/rom/snapshot?${query}`).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "The data could not be read.");
      return body.snapshot as DataSnapshot;
    });
    // A failed read is forgotten so reopening New budget tries again.
    pending.catch(() => snapshots.delete(key));
    snapshots.set(key, pending);
  }
  return pending;
}

/** The tray listing TBD scope, which the chip on the live total opens. */
const TBD_TRAY_ID = "lb-tbd";

/** The ROM the draft would produce right now, recomputed on every answer. */
export function useLiveBudget(draft: BudgetDraft | null): LiveBudget {
  const projectType = draft?.responses.project_type ?? "";
  const constructionKind = draft?.responses.construction_kind ?? "";
  const [loaded, setLoaded] = useState<{ key: string; snapshot?: DataSnapshot; error?: string } | null>(null);
  const key = `${projectType}/${constructionKind}`;

  useEffect(() => {
    if (!projectType || !constructionKind) return;
    let live = true;
    readSnapshot(projectType, constructionKind).then(
      (snapshot) => live && setLoaded({ key, snapshot }),
      (cause: unknown) => live && setLoaded({ key, error: cause instanceof Error ? cause.message : String(cause) }),
    );
    return () => {
      live = false;
    };
  }, [projectType, constructionKind, key]);

  return useMemo<LiveBudget>(() => {
    if (!draft || !projectType || !constructionKind) return { phase: "idle" };
    if (!loaded || loaded.key !== key) return { phase: "loading" };
    if (loaded.error || !loaded.snapshot) return { phase: "failed", error: loaded.error ?? "The data could not be read." };
    if (!draft.named) return { phase: "empty" };
    const definition = tier1Flow();
    const read = previewAnswers(definition, draft.responses, draft.framing, draft.markups);
    const answers = read && draft.derivedFacts ? { ...read, facts: { ...read.facts, ...draft.derivedFacts } } : read;
    const classifications = loaded.snapshot.classifications ?? [];
    const awaiting = sectionsAwaitingFollowUps(definition, draft.responses);
    try {
      if (!answers) {
        const ordering = previewAnswers(
          definition,
          { ...draft.responses, gross_square_feet: ORDER_AREA },
          draft.framing,
          null,
        );
        if (!ordering) return { phase: "empty" };
        const { known, full } = knownScopeRom(ordering, loaded.snapshot, awaiting);
        return { phase: "waiting", rom: known, answered: full, classifications };
      }
      const { known, full } = knownScopeRom(answers, loaded.snapshot, awaiting);
      return {
        phase: "ready",
        rom: known,
        answered: full,
        classifications,
        grossSquareFeet: answers.grossSquareFeet,
        unitCount: readUnitCount(answers.facts),
      };
    } catch (cause) {
      return { phase: "failed", error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [draft, projectType, constructionKind, key, loaded]);
}

/** The header band while New budget is open: the total the answers so far add up to. */
export function LiveTotal({
  live,
  bar,
  chip,
  litKey,
  source = null,
}: {
  live: LiveBudget;
  /** LA-1265: the criterion code that moved the total, named beside the change. */
  source?: string | null;
  /** LA-1181: the markup bar for the field's current view and order. */
  bar: BarModel | null;
  /** What is hovered or selected, named beside the total; null names nothing. */
  chip: Chip | null;
  litKey: string | null;
}) {
  const ready = live.phase === "ready" ? live : null;
  const headline = useMemo(
    () =>
      ready
        ? headlineOf(ready.rom, {
            grossSquareFeet: ready.grossSquareFeet,
            unitCount: ready.unitCount,
            live: true,
            tbdScope: ready.answered.tbdGateItems,
          })
        : null,
    [ready],
  );
  const [delta, setDelta] = useState<{ id: number; amount: number; source: string | null } | null>(null);
  const sourceRef = useRef(source);
  useEffect(() => {
    sourceRef.current = source;
  });
  const previous = useRef<{ midpoint: number; area: number } | null>(null);

  // LA-1153: named whether the area is known yet or not, the same way the
  // trays below already read `answered` regardless of phase.
  const unpricedCount =
    live.phase === "ready"
      ? live.rom.unpricedItems.length
      : live.phase === "waiting"
        ? live.answered.unpricedItems.length
        : 0;
  const unpricedBadge =
    unpricedCount > 0 ? (
      <span className="lb-unpriced">
        <UnpricedDot />
        {itemsNotPricedLabel(unpricedCount)}
      </span>
    ) : null;

  // Flash what an answer did to the total. A change of area is left out: it
  // moves every figure at once, and the rolling total already says so.
  useEffect(() => {
    if (!headline || !ready) {
      previous.current = null;
      return;
    }
    const before = previous.current;
    previous.current = { midpoint: headline.midpoint, area: ready.grossSquareFeet };
    if (!before || before.area !== ready.grossSquareFeet) return;
    const amount = headline.midpoint - before.midpoint;
    if (Math.abs(amount) < 1) return;
    setDelta((current) => ({ id: (current?.id ?? 0) + 1, amount, source: sourceRef.current }));
  }, [headline, ready]);

  if (live.phase === "idle" || live.phase === "empty") return <p className="rb-tnone">New Budget</p>;
  if (live.phase === "loading") return <p className="rb-tnone">Reading the data behind the budget.</p>;
  if (live.phase === "failed") return <p className="rb-tnone">New Budget. The live figure is not available: {live.error}</p>;
  if (live.phase === "waiting" || !headline || !ready) {
    return (
      <div className="lb-tot">
        <span className="rb-tlab">
          <span className="rb-tl">Total</span>
          <span className="rb-ti">trade cost so far</span>
        </span>
        <span className="rb-tv num lb-wait">&mdash;</span>
        <span className="rb-tb">waiting on the gross area</span>
        <span className="lb-tag">Live, Saves at the Last Answer</span>
        {unpricedBadge}
      </div>
    );
  }

  const fmt = (value: number) => headlineMoney(value, headline);
  const rates = headlineRates(headline);
  const excludes = tbdScopeWords(headline.tbdScope);
  return (
    <div className="lb-tot">
      {/* LA-1334: the label stays put; the line under it says what changed.
          LA-1337: and how many trades are in it while the questions run. */}
      <span className="rb-tlab">
        <span className="rb-tl">{titleCase(headline.label)}</span>
        <span className="rb-ti lb-lbl" key={headline.includes}>
          {headline.includes}, {pricedTradesWords(headline.pricedTrades)}
        </span>
      </span>
      <SpringMoney className="rb-tv num" value={headline.midpoint} format={fmt} />
      <span className="rb-tb">
        range <SpringMoney className="num lb-b" value={headline.low} format={fmt} /> to{" "}
        <SpringMoney className="num lb-b" value={headline.high} format={fmt} />
        {rates ? <span className="rb-rate num">{rates}</span> : null}
      </span>
      {delta ? (
        <span key={delta.id} className={`lb-delta num lb-delta--${delta.amount > 0 ? "up" : "down"}`} aria-hidden="true">
          {delta.amount > 0 ? "+" : "−"}
          {shortMoney(Math.abs(delta.amount)).replace("-", "")}
          {delta.source ? <span className="lb-delta-src"> from {delta.source}</span> : null}
        </span>
      ) : null}
      <span className="lb-tag">Live, Saves at the Last Answer</span>
      {excludes ? (
        // LA-1337: the figure leaves this scope out, so the chip says so and
        // takes you to the tray that lists it.
        <button
          type="button"
          className="rb-td rb-td--btn lb-excl"
          onClick={() => {
            const tray = document.getElementById(TBD_TRAY_ID);
            tray?.scrollIntoView({ behavior: "smooth", block: "center" });
            tray?.focus({ preventScroll: true });
          }}
        >
          <span className="rb-dot rb-dot--working" aria-hidden="true" />
          {excludes}
        </button>
      ) : null}
      {unpricedBadge}
      <ShareChip chip={chip} />
      {bar ? <ShareBar bar={bar} litKey={litKey} /> : null}
      <span className="lb-sr" aria-live="polite">
        {titleCase(headline.label)} {headlineMoney(headline.midpoint, headline)}, {headline.includes},{" "}
        {pricedTradesWords(headline.pricedTrades)}
        {rates ? `, ${rates.replace(" · ", ", ")}` : ""}
        {excludes ? `. ${excludes}.` : ""}
      </span>
    </div>
  );
}

/**
 * The white field while New budget is open: trades, then what the scope
 * answers took out. `entries` is the field already grouped by view and sorted
 * by order (field-order.ts, LA-1181): By Scope shows element boxes, loose
 * trade blocks and loose unpriced items; By Package shows one card per
 * buyout package. The header total this field sits under never moves when
 * the view or the order changes; only the cards move, on the shared FLIP
 * tracker (`useFieldFlip`, motion.ts). An order switch moves them over about
 * 420ms with a 25ms stagger per card, capped at 100ms.
 */
export function LiveField({
  live,
  view,
  order,
  entries,
  selectedKey,
  onSelect,
  link,
  mark = null,
  sources = {},
  designing,
}: {
  live: LiveBudget;
  view: RomView;
  order: RomOrder;
  entries: FieldEntry[];
  /** LA-1265: the entries a landed Design and Engineering answer feeds, lit and marked with its code. */
  mark?: { code: string; keys: Set<string> } | null;
  /** LA-1318: each box's source line, the last moment that moved it: "S-1 +$472k". */
  sources?: Readonly<Record<string, string>>;
  /** LA-1324: the entries a Design and Engineering card has yet to decide, shown as Designing with no figure. */
  designing?: ReadonlySet<string>;
  /** The card or block the viewer clicked, which keeps its share lit. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  link: FieldLink;
}) {
  const flip = useFieldFlip();
  const layer = useRef<HTMLDivElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const lastOrder = useRef(order);

  // LA-1265: each entry's root carries its key, and the lit ones the
  // criterion's code, so the stylesheet fades the rest and draws the mark
  // (the saved field's BlockField does the same). Tiles inside a box track
  // under their own cost codes and are left alone.
  const entryKeys = new Set(entries.map((entry) => entry.key));
  const register = (key: string) => {
    const track = flip.register(key);
    return (el: HTMLElement | null) => {
      track(el);
      if (!el || !entryKeys.has(key)) return;
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

  // What was answered No or Don't know, from the ROM as the answers stand.
  // The scope-known ROM cannot say: it leaves unanswered lines out entirely.
  const answered = live.phase === "ready" || live.phase === "waiting" ? live.answered : null;
  const notInJob = answered?.notInThisJob ?? [];
  const tbd = answered?.tbdGateItems ?? [];

  const kulkaEntries = entries.filter((entry) => !entry.ownerDirect);
  const ownerEntries = entries.filter((entry) => entry.ownerDirect);
  const rank = new Map(entries.map((entry, index) => [entry.key, index]));

  // LA-1158: an element box's tiles land as a family, the driver first, so a
  // box an answer or a view switch just brought in never fades in at the
  // same moment as everything it carries.
  const tileDelay = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "element") continue;
    const base = (rank.get(entry.key) ?? 0) * 22;
    tileDelay.set(entry.group.driver.costCode, base);
    entry.group.members.forEach((item, index) => tileDelay.set(item.costCode, base + 70 * (index + 1)));
  }

  // FLIP, run after every commit. Each cost code is tracked wherever it
  // shows, block, tray chip or box tile, so moving between them reads as one
  // thing travelling rather than one vanishing and another appearing.
  useLayoutEffect(() => {
    const reordered = lastOrder.current !== order;
    lastOrder.current = order;
    flip.run(layer.current, ghosts.current, rank, {
      delayFor: (key) => tileDelay.get(key),
      move: reordered ? { duration: 420, delayFor: (key) => Math.min((rank.get(key) ?? 0) * 25, 100) } : undefined,
    });
  });

  if (live.phase === "idle" || live.phase === "loading" || live.phase === "empty") {
    return (
      <div className="lb" ref={layer}>
        <div className="lb-ghosts" ref={ghosts} />
        <p className="rb-none lb-hint">
          {live.phase === "loading"
            ? "Reading the data behind the budget."
            : "Name the project and the budget starts building here."}
        </p>
      </div>
    );
  }
  if (live.phase === "failed") {
    return (
      <div className="lb" ref={layer}>
        <div className="lb-ghosts" ref={ghosts} />
        <p className="rb-none">The live budget is not available: {live.error}</p>
      </div>
    );
  }

  const waiting = live.phase === "waiting";
  const tile = (entry: FieldEntry) => {
    const rollDelay = Math.min((rank.get(entry.key) ?? 0) * 22, 520);
    const held = !waiting && (designing?.has(entry.key) ?? false);
    if (entry.kind === "element") {
      return (
        <LiveElementBox
          key={entry.key}
          group={entry.group}
          waiting={waiting || held}
          designing={held}
          rollDelay={rollDelay}
          source={sources[entry.key]}
          register={register}
          link={link}
        />
      );
    }
    if (entry.kind === "package") {
      return (
        <PackageCard
          key={entry.key}
          entry={entry}
          selected={selectedKey === entry.key}
          waiting={waiting}
          rollDelay={rollDelay}
          link={link}
          onSelect={onSelect}
          register={register(entry.key)}
        />
      );
    }
    if (entry.kind === "unpriced") {
      return <UnpricedBlock key={entry.key} entry={entry} link={link} register={register(entry.key)} />;
    }
    return (
      <LiveBlock
        key={entry.key}
        entryKey={entry.key}
        block={entry.block}
        waiting={waiting || held}
        designing={held}
        source={sources[entry.key]}
        selected={selectedKey === entry.key}
        rollDelay={rollDelay}
        link={link}
        onSelect={onSelect}
        register={register(entry.key)}
      />
    );
  };

  return (
    <div className={`lb${waiting ? " lb--waiting" : ""}${mark ? " dc-hl" : ""}`} ref={layer}>
      <div className="lb-ghosts" ref={ghosts} aria-hidden="true" />
      {waiting ? (
        <p className="rb-none lb-hint">Enter the gross area and each trade fills in.</p>
      ) : null}
      {entries.length === 0 ? <p className="rb-none">No benchmark matched this project type, so there are no lines.</p> : null}
      {kulkaEntries.length > 0 ? (
        <section className="rb-grp" aria-label={view === "package" ? "Packages" : "Trades"}>
          <h2>{view === "package" ? "Packages" : "Trades"}</h2>
          <div className="rb-grid">{kulkaEntries.map(tile)}</div>
        </section>
      ) : null}
      {ownerEntries.length > 0 ? (
        <section className="rb-grp" aria-label="Bought by the Owner Direct">
          <h2>Bought by the Owner Direct</h2>
          <div className="rb-grid">{ownerEntries.map(tile)}</div>
        </section>
      ) : null}
      {tbd.length > 0 || notInJob.length > 0 ? (
        <div className="lb-trays">
          {tbd.length > 0 ? (
            <section className="lb-tray" id={TBD_TRAY_ID} tabIndex={-1} aria-label="TBD, Outside the Total">
              <h2>TBD, Outside the Total</h2>
              <div className="lb-chips">
                {tbd.map((item) => (
                  <span key={item.costCode} ref={flip.register(item.costCode)} className="lb-chip lb-chip--tbd" title={item.question}>
                    {titleCase(item.label)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          {notInJob.length > 0 ? (
            <section className="lb-tray" aria-label="Not in This Job">
              <h2>Not in This Job</h2>
              <div className="lb-chips">
                {notInJob.map((item) => (
                  <span key={item.costCode} ref={flip.register(item.costCode)} className="lb-chip lb-chip--out" title={item.question}>
                    {titleCase(item.label)}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function LiveBlock({
  entryKey,
  block,
  waiting,
  designing = false,
  source,
  selected,
  rollDelay,
  link,
  onSelect,
  register,
}: {
  entryKey: string;
  block: TradeBlock;
  waiting: boolean;
  /** LA-1324: a card has yet to decide it, so it waits with a Designing mark. */
  designing?: boolean;
  /** LA-1318: the moment that last moved it, "S-1 +$472k". */
  source?: string;
  selected: boolean;
  rollDelay: number;
  link: FieldLink;
  onSelect: (key: string) => void;
  register: (el: HTMLElement | null) => void;
}) {
  return (
    <button
      ref={register}
      type="button"
      className={`rb-blk lb-blk${waiting ? " lb-blk--wait" : ""}${selected ? " rb-blk--sel" : ""}`}
      aria-pressed={selected}
      aria-label={
        designing
          ? `${titleCase(block.label)}, Designing`
          : waiting
            ? titleCase(block.label)
            : `${titleCase(block.label)}, ${shortMoney(block.midpoint)}`
      }
      onClick={() => onSelect(entryKey)}
      onMouseEnter={() => link.onEnter(entryKey)}
      onMouseLeave={link.onLeave}
      onFocus={() => link.onEnter(entryKey)}
      onBlur={link.onLeave}
    >
      <span className="rb-bn">{titleCase(block.label)}</span>
      <span className={`rb-st lb-st${designing || (!waiting && block.status) ? " lb-st--on" : ""}`}>
        {designing ? (
          <span className="lb-design">
            <i aria-hidden="true" />
            Designing
          </span>
        ) : !waiting && block.status ? (
          <>
            <span className={`rb-dot rb-dot--${block.status.tone}`} aria-hidden="true" />
            {block.status.word}
          </>
        ) : null}
      </span>
      <SpringMoney
        className={`rb-bv num rb-${waiting ? "v3" : valueTier(block.share)}`}
        value={waiting ? null : block.midpoint}
        format={shortMoney}
        delay={rollDelay}
      />
      {source && !waiting ? (
        <span className="lb-src num" key={source}>
          {source}
        </span>
      ) : null}
      <span className="rb-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${waiting ? 0 : Math.max(0.02, Math.min(1, block.share)).toFixed(4)})` }} />
      </span>
    </button>
  );
}

/**
 * LA-1153: a canonical item in scope with no benchmark behind it yet (ADR
 * 0006, "A block can arrive unpriced"). It carries no figure and no bar, only
 * the label and the orange "No Rate Yet" status, with the dashed border
 * LA-1175 gives anything with nothing priced, so it reads as scope that
 * arrived rather than as a zero. Shared with the saved ROM's field.
 */
export function UnpricedBlock({
  entry,
  link,
  register,
}: {
  entry: Extract<FieldEntry, { kind: "unpriced" }>;
  link: FieldLink;
  register: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      ref={register}
      className="rb-blk lb-blk lb-blk--unpriced pk-card--none"
      aria-label={`${titleCase(entry.label)}, No Rate Yet`}
      onMouseEnter={() => link.onEnter(entry.key)}
      onMouseLeave={link.onLeave}
    >
      <span className="pk-top">
        <span className="rb-bn">{titleCase(entry.label)}</span>
        {entry.division ? <span className="pk-div">{titleCase(entry.division)}</span> : null}
      </span>
      <span className="rb-st lb-st lb-st--on">
        <UnpricedDot pulseKey={entry.item.costCode} />
        No Rate Yet
      </span>
    </div>
  );
}
