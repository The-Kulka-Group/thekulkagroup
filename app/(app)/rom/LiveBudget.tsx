"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { BlockClassification, DataSnapshot, FramingSystem, MarkupChoices, Rom, UnpricedItem } from "@kulka/engine";

import { knownScopeRom, previewAnswers } from "@/lib/rom/preview";
import { tier1Flow, type Responses } from "@/lib/rom/question-flow";

import { headlineMoney, headlineOf, midpoint, shortMoney, tradeBlocks, valueTier, type TradeBlock } from "./block-layout";
import { groupElements, type ElementGroup } from "./element-groups";
import { LiveElementBox } from "./ElementBox";
import { EASE_SMOOTH, reducedMotion } from "./motion";
import { SpringMoney } from "./SpringMoney";

// LA-1142. The budget builds behind the New budget panel while its questions
// are answered. The browser runs the same pure engine a run does over the
// snapshot GET /api/rom/snapshot reads (see lib/rom/preview.ts), so every
// figure here is one "Add and run" would record from the same data. Nothing
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
// prefers-reduced-motion drops all of it: figures and blocks land at once.

/** What the New budget panel has collected so far, as the preview reads it. */
export type BudgetDraft = {
  /** Whether the project has a name yet. The field stays empty until it does. */
  named: boolean;
  responses: Responses;
  framing: FramingSystem | "";
  /** Null until the Markups step, so the total reads as trade cost first. */
  markups: MarkupChoices | null;
};

export type LiveBudget =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed"; error: string }
  /** Nothing answered yet that brings scope in, so the field is empty. */
  | { phase: "empty" }
  /**
   * The trades in scope are known but the area is not, so tiles stand empty
   * in the order they will take. `answered` is the ROM as the answers stand,
   * read only for what was answered No or Don't know. `blocks` holds only the
   * trades not shown inside an element box; `groups` holds those boxes
   * (LA-1158, ADR 0006).
   */
  | { phase: "waiting"; blocks: TradeBlock[]; groups: ElementGroup[]; answered: Rom }
  /** `rom` is the scope known so far, which the blocks, boxes and the total show. */
  | {
      phase: "ready";
      rom: Rom;
      answered: Rom;
      blocks: TradeBlock[];
      groups: ElementGroup[];
      grossSquareFeet: number;
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
    const answers = previewAnswers(definition, draft.responses, draft.framing, draft.markups);
    const classifications = loaded.snapshot.classifications ?? [];
    try {
      if (!answers) {
        const ordering = previewAnswers(
          definition,
          { ...draft.responses, gross_square_feet: ORDER_AREA },
          draft.framing,
          null,
        );
        if (!ordering) return { phase: "empty" };
        const { known, full } = knownScopeRom(ordering, loaded.snapshot);
        const { blocks, groups } = fieldBlocksAndGroups(known, classifications);
        return { phase: "waiting", blocks, groups, answered: full };
      }
      const { known, full } = knownScopeRom(answers, loaded.snapshot);
      const { blocks, groups } = fieldBlocksAndGroups(known, classifications);
      return {
        phase: "ready",
        rom: known,
        answered: full,
        blocks,
        groups,
        grossSquareFeet: answers.grossSquareFeet,
      };
    } catch (cause) {
      return { phase: "failed", error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [draft, projectType, constructionKind, key, loaded]);
}

/**
 * LA-1158, ADR 0006: an element with a stated driver and at least one other
 * member in scope groups into a box; `tradeBlocks` still names every line
 * that adds to the total, so a grouped line is filtered back out of the
 * single-tile list rather than computed twice.
 */
function fieldBlocksAndGroups(
  rom: Rom,
  classifications: readonly BlockClassification[],
): { blocks: TradeBlock[]; groups: ElementGroup[] } {
  const { groups, singles } = groupElements(rom, classifications);
  const singleCodes = new Set(singles.map((line) => line.costCode));
  const blocks = tradeBlocks(rom).filter((block) => singleCodes.has(block.costCode));
  return { blocks, groups };
}

/** The header band while New budget is open: the total the answers so far add up to. */
export function LiveTotal({ live }: { live: LiveBudget }) {
  const ready = live.phase === "ready" ? live : null;
  const headline = useMemo(() => (ready ? headlineOf(ready.rom) : null), [ready]);
  const [delta, setDelta] = useState<{ id: number; amount: number } | null>(null);
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
        <span className="rb-dot rb-dot--working" aria-hidden="true" />
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
    setDelta((current) => ({ id: (current?.id ?? 0) + 1, amount }));
  }, [headline, ready]);

  if (live.phase === "idle" || live.phase === "empty") return <p className="rb-tnone">New budget</p>;
  if (live.phase === "loading") return <p className="rb-tnone">Reading the data behind the budget.</p>;
  if (live.phase === "failed") return <p className="rb-tnone">New budget. The live figure is not available: {live.error}</p>;
  if (live.phase === "waiting" || !headline || !ready) {
    return (
      <div className="lb-tot">
        <span className="rb-tl">Trade cost</span>
        <span className="rb-tv num lb-wait">&mdash;</span>
        <span className="rb-tb">waiting on the gross area</span>
        <span className="lb-tag">Preview, not saved</span>
        {unpricedBadge}
      </div>
    );
  }

  const fmt = (value: number) => headlineMoney(value, headline);
  return (
    <div className="lb-tot">
      <span className="rb-tl lb-lbl" key={headline.label}>
        {headline.label}
      </span>
      <SpringMoney className="rb-tv num" value={headline.midpoint} format={fmt} />
      <span className="rb-tb">
        range <SpringMoney className="num lb-b" value={headline.low} format={fmt} /> to{" "}
        <SpringMoney className="num lb-b" value={headline.high} format={fmt} />
      </span>
      {delta ? (
        <span key={delta.id} className={`lb-delta num lb-delta--${delta.amount > 0 ? "up" : "down"}`} aria-hidden="true">
          {delta.amount > 0 ? "+" : "−"}
          {shortMoney(Math.abs(delta.amount)).replace("-", "")}
        </span>
      ) : null}
      <span className="lb-tag">Preview, not saved</span>
      {unpricedBadge}
      <Composition rom={ready.rom} />
      <span className="lb-sr" aria-live="polite">
        {headline.label} {headlineMoney(headline.midpoint, headline)}
      </span>
    </div>
  );
}

/** What the total is made of: trades first, then each markup as the Markups step adds it. */
function Composition({ rom }: { rom: Rom }) {
  const m = rom.markups;
  const parts = [
    { key: "trade", label: "Trades", value: m ? midpoint(m.subtotal) : midpoint(rom.total) },
    { key: "owner", label: "Owner direct", value: m ? midpoint(m.ownerDirect) : 0 },
    { key: "gc", label: "GRs/GCs", value: m && !m.generalConditions.tbd ? midpoint(m.generalConditions) : 0 },
    { key: "fee", label: "Fee", value: m && !m.fee.tbd ? midpoint(m.fee) : 0 },
    { key: "ins", label: "Insurance", value: m && !m.insurance.tbd ? midpoint(m.insurance) : 0 },
  ];
  const sum = parts.reduce((total, part) => total + Math.max(0, part.value), 0);
  let left = 0;
  const shown = parts.map((part) => {
    const width = sum > 0 ? (Math.max(0, part.value) / sum) * 100 : 0;
    const at = left;
    left += width;
    return { ...part, left: at, width };
  });
  return (
    <span className="lb-comp" aria-hidden="true">
      <span className="lb-bar">
        {shown.map((part) => (
          <i
            key={part.key}
            className={`lb-seg lb-seg--${part.key}`}
            style={{ left: `${part.left}%`, width: `${part.width}%` }}
          />
        ))}
      </span>
      {m ? (
        <span className="lb-legend">
          {shown
            .filter((part) => part.width > 0)
            .map((part) => (
              <span key={part.key} className="lb-key">
                <i className={`lb-seg--${part.key}`} />
                {part.label}
              </span>
            ))}
        </span>
      ) : null}
    </span>
  );
}

type Tracked = { x: number; y: number; w: number; h: number; el: HTMLElement };

/** The white field while New budget is open: trades, then what the scope answers took out. */
export function LiveField({ live }: { live: LiveBudget }) {
  const layer = useRef<HTMLDivElement>(null);
  const ghosts = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const tracked = useRef(new Map<string, Tracked>());
  const firstFill = useRef(true);

  const blocks = live.phase === "ready" || live.phase === "waiting" ? live.blocks : [];
  // LA-1158: an element with a stated driver and something else in scope
  // groups into a box (ADR 0006); `blocks` above already excludes whatever
  // groupElements moved in here.
  const groups = live.phase === "ready" || live.phase === "waiting" ? live.groups : [];
  // What was answered No or Don't know, from the ROM as the answers stand.
  // The scope-known ROM cannot say: it leaves unanswered lines out entirely.
  const answered = live.phase === "ready" || live.phase === "waiting" ? live.answered : null;
  const notInJob = answered?.notInThisJob ?? [];
  const tbd = answered?.tbdGateItems ?? [];
  // LA-1153: an item in scope with nothing pricing it yet (ADR 0006). It is
  // not a `TradeBlock`, since it never adds to the total, so it is not read
  // off `answered` the way the trays above are; it comes straight off the
  // ROM, which is the same list whichever ROM the caller passes here. LA-1158:
  // one already shown as a tile inside its element's box is left out here, so
  // it is never named twice.
  const groupedCodes = new Set(groups.flatMap((group) => [group.driver, ...group.members].map((item) => item.costCode)));
  const unpriced = (answered?.unpricedItems ?? []).filter((item) => !groupedCodes.has(item.costCode));

  // Blocks and boxes share one biggest-first order, boxes sorted by their own
  // total. `entries` also fixes the render order the field and the trays
  // agree on for FLIP.
  const entries = [
    ...blocks.map((block) => ({ kind: "block" as const, key: block.costCode, midpoint: block.midpoint, ownerDirect: block.ownerDirect })),
    ...groups.map((group) => ({
      kind: "group" as const,
      key: `element:${group.element}`,
      midpoint: midpoint(group.total),
      ownerDirect: group.ownerDirect,
    })),
  ].sort((a, b) => b.midpoint - a.midpoint);
  const kulkaEntries = entries.filter((entry) => !entry.ownerDirect);
  const ownerEntries = entries.filter((entry) => entry.ownerDirect);
  const rank = new Map(entries.map((entry, index) => [entry.key, index]));
  const groupByKey = new Map(groups.map((group) => [`element:${group.element}`, group]));
  const blockByKey = new Map(blocks.map((block) => [block.costCode, block]));

  // LA-1158: a box's tiles land as a family, the driver first, so a driver an
  // answer just brought in never fades in at the same moment as the disconnects
  // it carries. The delay is set off the box's own rank rather than the
  // generic first-fill cascade below, so a box that arrives later in the
  // session still stages the same way a box in the first fill does.
  const tileDelay = new Map<string, number>();
  for (const group of groups) {
    const base = (rank.get(`element:${group.element}`) ?? 0) * 22;
    tileDelay.set(group.driver.costCode, base);
    group.members.forEach((item, index) => tileDelay.set(item.costCode, base + 70 * (index + 1)));
  }

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  };

  // FLIP, run after every commit. Each cost code is tracked wherever it
  // shows, block or tray chip, so moving between the two reads as one thing
  // travelling rather than one vanishing and another appearing.
  useLayoutEffect(() => {
    const container = layer.current;
    const overlay = ghosts.current;
    if (!container || !overlay) return;
    const still = reducedMotion();
    const origin = container.getBoundingClientRect();
    const previous = tracked.current;
    const next = new Map<string, Tracked>();
    const entering: [string, HTMLElement][] = [];

    // Where each element is on screen right now, mid-slide included, before
    // its running slide is cancelled and its new place measured.
    const offsets = new Map<HTMLElement, { x: number; y: number }>();
    for (const el of nodes.current.values()) {
      const transform = getComputedStyle(el).transform;
      const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
      offsets.set(el, { x: matrix.m41, y: matrix.m42 });
      for (const animation of el.getAnimations()) {
        if ((animation as Animation & { id: string }).id === "lb-move") animation.cancel();
      }
    }

    for (const [key, el] of nodes.current) {
      const r = el.getBoundingClientRect();
      const here: Tracked = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height, el };
      next.set(key, here);
      const before = previous.get(key);
      if (!before) {
        entering.push([key, el]);
        continue;
      }
      if (still) continue;
      if (before.el !== el) {
        // Crossing between the field and a tray: the old element lifts off
        // where it was and heads for the new one, which settles in behind it.
        ghost(overlay, before, here);
        el.animate(
          [
            { opacity: 0, transform: `translate(${before.x - here.x}px, ${before.y - here.y}px) scale(0.92)`, filter: "blur(3px)" },
            { opacity: 1, transform: "none", filter: "blur(0)" },
          ],
          { duration: 520, easing: EASE_SMOOTH, fill: "backwards" },
        );
        continue;
      }
      const offset = offsets.get(el) ?? { x: 0, y: 0 };
      const dx = before.x + offset.x - here.x;
      const dy = before.y + offset.y - here.y;
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        const move = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
          duration: 460,
          easing: EASE_SMOOTH,
        });
        move.id = "lb-move";
      }
    }

    // Gone from both field and trays: it drops away where it stood.
    for (const [key, before] of previous) {
      if (next.has(key) || still) continue;
      ghost(overlay, before, null);
    }

    if (!still) {
      const cascade = firstFill.current && entering.length > 3;
      entering
        .sort((a, b) => (rank.get(a[0]) ?? 0) - (rank.get(b[0]) ?? 0))
        .forEach(([key, el], index) => {
          // LA-1158: a tile inside a box lands off its own family delay,
          // whichever fill this is; everything else keeps the plain cascade.
          const family = tileDelay.get(key);
          const delay = family !== undefined ? family : cascade ? Math.min(index * 22, 520) : 0;
          el.animate(
            [
              { opacity: 0, transform: "translateY(8px) scale(0.98)", filter: "blur(4px)" },
              { opacity: 1, transform: "none", filter: "blur(0)" },
            ],
            { duration: 380, delay, easing: EASE_SMOOTH, fill: "backwards" },
          );
        });
    }
    if (entering.length > 0) firstFill.current = false;
    tracked.current = next;
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
  const tile = (entry: (typeof entries)[number]) => {
    if (entry.kind === "group") {
      const group = groupByKey.get(entry.key)!;
      return (
        <LiveElementBox
          key={entry.key}
          group={group}
          waiting={waiting}
          rollDelay={Math.min((rank.get(entry.key) ?? 0) * 22, 520)}
          register={register}
        />
      );
    }
    const block = blockByKey.get(entry.key)!;
    return (
      <LiveBlock
        key={entry.key}
        block={block}
        waiting={waiting}
        rollDelay={Math.min((rank.get(entry.key) ?? 0) * 22, 520)}
        register={register(entry.key)}
      />
    );
  };

  return (
    <div className={`lb${waiting ? " lb--waiting" : ""}`} ref={layer}>
      <div className="lb-ghosts" ref={ghosts} aria-hidden="true" />
      {waiting ? (
        <p className="rb-none lb-hint">Enter the gross area and each trade fills in.</p>
      ) : null}
      {entries.length === 0 ? <p className="rb-none">No benchmark matched this project type, so there are no lines.</p> : null}
      {kulkaEntries.length > 0 ? (
        <section className="rb-grp" aria-label="Trades">
          <h2>{waiting ? "Trades, in the order they price" : "Trades, biggest first"}</h2>
          <div className="rb-grid">{kulkaEntries.map(tile)}</div>
        </section>
      ) : null}
      {ownerEntries.length > 0 ? (
        <section className="rb-grp" aria-label="Bought by the owner direct">
          <h2>Bought by the owner direct</h2>
          <div className="rb-grid">{ownerEntries.map(tile)}</div>
        </section>
      ) : null}
      {unpriced.length > 0 ? (
        <section className="rb-grp" aria-label="Not Priced Yet">
          <h2>Not Priced Yet</h2>
          <div className="rb-grid">
            {unpriced.map((item) => (
              <UnpricedBlock key={item.costCode} item={item} register={register(`unpriced:${item.costCode}`)} />
            ))}
          </div>
        </section>
      ) : null}
      {tbd.length > 0 || notInJob.length > 0 ? (
        <div className="lb-trays">
          {tbd.length > 0 ? (
            <section className="lb-tray" aria-label="TBD, outside the total">
              <h2>TBD, outside the total</h2>
              <div className="lb-chips">
                {tbd.map((item) => (
                  <span key={item.costCode} ref={register(item.costCode)} className="lb-chip lb-chip--tbd" title={item.question}>
                    {item.label}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          {notInJob.length > 0 ? (
            <section className="lb-tray" aria-label="Not in this job">
              <h2>Not in this job</h2>
              <div className="lb-chips">
                {notInJob.map((item) => (
                  <span key={item.costCode} ref={register(item.costCode)} className="lb-chip lb-chip--out" title={item.question}>
                    {item.label}
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

function LiveBlock({
  block,
  waiting,
  rollDelay,
  register,
}: {
  block: TradeBlock;
  waiting: boolean;
  rollDelay: number;
  register: (el: HTMLElement | null) => void;
}) {
  return (
    <div
      ref={register}
      className={`rb-blk lb-blk${waiting ? " lb-blk--wait" : ""}`}
      aria-label={waiting ? block.label : `${block.label}, ${shortMoney(block.midpoint)}`}
    >
      <span className="rb-bn">{block.label}</span>
      <span className={`rb-st lb-st${!waiting && block.status ? " lb-st--on" : ""}`}>
        {!waiting && block.status ? (
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
      <span className="rb-bar" aria-hidden="true">
        <i style={{ transform: `scaleX(${waiting ? 0 : Math.max(0.02, Math.min(1, block.share)).toFixed(4)})` }} />
      </span>
    </div>
  );
}

/**
 * LA-1153: a canonical item in scope with no benchmark behind it yet (ADR
 * 0006, "A block can arrive unpriced"). It carries no figure and no bar, only
 * the label and the orange "No Rate Yet" status, so it reads as scope that
 * arrived rather than as a zero.
 */
function UnpricedBlock({
  item,
  register,
}: {
  item: UnpricedItem;
  register: (el: HTMLElement | null) => void;
}) {
  return (
    <div ref={register} className="rb-blk lb-blk lb-blk--unpriced" aria-label={`${item.label}, No Rate Yet`}>
      <span className="rb-bn">{item.label}</span>
      <span className="rb-st lb-st lb-st--on">
        <span className="rb-dot rb-dot--working" aria-hidden="true" />
        No Rate Yet
      </span>
      <span className="rb-bv num rb-v4" aria-hidden="true">
        &mdash;
      </span>
      <span className="rb-bar" aria-hidden="true">
        <i style={{ transform: "scaleX(0.02)" }} />
      </span>
    </div>
  );
}

/**
 * The element that just left, put back where it stood in a layer over the
 * field and animated away: toward its new place when it has one, or down and
 * out when it has none. React has already detached it, so this is the node
 * itself, not a copy.
 */
function ghost(overlay: HTMLElement, from: Tracked, to: Tracked | null) {
  const el = from.el;
  if (el.isConnected) return;
  el.getAnimations().forEach((animation) => animation.cancel());
  Object.assign(el.style, {
    position: "absolute",
    left: `${from.x}px`,
    top: `${from.y}px`,
    width: `${from.w}px`,
    height: `${from.h}px`,
    margin: "0",
    pointerEvents: "none",
    transformOrigin: "top left",
  });
  overlay.appendChild(el);
  const end = to
    ? `translate(${to.x - from.x}px, ${to.y - from.y}px) scale(${Math.max(0.2, to.w / from.w)}, ${Math.max(0.2, to.h / from.h)})`
    : "translateY(10px) scale(0.94)";
  const flight = el.animate(
    [
      { opacity: 1, transform: "none", filter: "blur(0)" },
      { opacity: 0, transform: end, filter: "blur(4px)" },
    ],
    { duration: to ? 460 : 260, easing: EASE_SMOOTH, fill: "forwards" },
  );
  flight.onfinish = () => el.remove();
  flight.oncancel = () => el.remove();
}
