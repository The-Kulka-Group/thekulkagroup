"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { computeRom, type DataSnapshot, type FramingSystem, type MarkupChoices, type Rom } from "@kulka/engine";

import { previewAnswers } from "@/lib/rom/preview";
import { tier1Flow, type Responses } from "@/lib/rom/question-flow";

import { headlineMoney, headlineOf, midpoint, shortMoney, tradeBlocks, valueTier, type TradeBlock } from "./block-layout";

// LA-1142. The budget builds behind the New budget panel while its questions
// are answered. The browser runs the same pure engine a run does over the
// snapshot GET /api/rom/snapshot reads (see lib/rom/preview.ts), so every
// figure here is one "Add and run" would record from the same data. Nothing
// here prices anything, and nothing here is saved.
//
// The motion carries what changed, so the estimator sees what an answer did
// without reading a diff:
//   - Before the gross area, each trade stands as an empty tile in the order
//     it will take. Entering the area rolls every figure up from zero, biggest
//     first, and the header total counts with them.
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
  responses: Responses;
  framing: FramingSystem | "";
  /** Null until the Markups step, so the total reads as trade cost first. */
  markups: MarkupChoices | null;
};

export type LiveBudget =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "failed"; error: string }
  /** The trades are known but the area is not, so tiles stand empty in the order they will take. */
  | { phase: "waiting"; blocks: TradeBlock[] }
  | { phase: "ready"; rom: Rom; blocks: TradeBlock[]; grossSquareFeet: number };

// Critically damped: glides in fast and settles without overshoot, since a
// dollar figure that swings past its value reads as a wrong number.
const STIFFNESS = 170;
const DAMPING = 2 * Math.sqrt(STIFFNESS);
const STEP = 1 / 240;
const EASE_SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)";
// Only used for tile order before the area is known; no figure from it shows.
const ORDER_AREA = "10000";

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
    const definition = tier1Flow();
    const answers = previewAnswers(definition, draft.responses, draft.framing, draft.markups);
    try {
      if (!answers) {
        const ordering = previewAnswers(
          definition,
          { ...draft.responses, gross_square_feet: ORDER_AREA },
          draft.framing,
          null,
        );
        if (!ordering) return { phase: "idle" };
        return { phase: "waiting", blocks: tradeBlocks(computeRom(ordering, loaded.snapshot)) };
      }
      const rom = computeRom(answers, loaded.snapshot);
      return { phase: "ready", rom, blocks: tradeBlocks(rom), grossSquareFeet: answers.grossSquareFeet };
    } catch (cause) {
      return { phase: "failed", error: cause instanceof Error ? cause.message : String(cause) };
    }
  }, [draft, projectType, constructionKind, key, loaded]);
}

/**
 * A dollar figure that springs to each new value. It writes its own text on
 * each frame instead of re-rendering, so sixty blocks rolling at once cost
 * React nothing. Null shows a dash; the first real value rolls up from zero
 * after `delay`, which is how the first fill cascades biggest first.
 */
function SpringMoney({
  value,
  format,
  delay = 0,
  className,
}: {
  value: number | null;
  format: (value: number) => string;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const state = useRef({ x: 0, v: 0, target: 0, frame: 0, timer: 0, fromDash: false });
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });

  // A layout effect, so a figure never paints blank on the frame it mounts.
  useLayoutEffect(() => {
    const s = state.current;
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(s.frame);
    window.clearTimeout(s.timer);
    if (value === null) {
      s.fromDash = true;
      s.x = 0;
      s.v = 0;
      el.textContent = "—";
      return;
    }
    s.target = value;
    if (reducedMotion()) {
      s.x = value;
      s.v = 0;
      s.fromDash = false;
      el.textContent = formatRef.current(value);
      return;
    }

    // Fixed sub-steps over the real time elapsed, so a slow or throttled
    // frame rate lands the figure on schedule instead of in slow motion.
    let last = 0;
    const tick = (now: number) => {
      const elapsed = last ? Math.min(1, (now - last) / 1000) : 1 / 60;
      last = now;
      const steps = Math.max(1, Math.ceil(elapsed / STEP));
      const dt = elapsed / steps;
      for (let i = 0; i < steps; i++) {
        const force = -STIFFNESS * (s.x - s.target) - DAMPING * s.v;
        s.v += force * dt;
        s.x += s.v * dt;
      }
      const settled = Math.abs(s.x - s.target) < Math.max(0.5, Math.abs(s.target) * 1e-5) && Math.abs(s.v) < 1;
      if (settled) {
        s.x = s.target;
        s.v = 0;
      }
      el.textContent = formatRef.current(s.x);
      if (!settled) s.frame = requestAnimationFrame(tick);
    };
    const start = () => {
      s.fromDash = false;
      s.frame = requestAnimationFrame(tick);
    };
    el.textContent = formatRef.current(s.x);
    if (s.fromDash && delay > 0) s.timer = window.setTimeout(start, delay);
    else start();
    return () => {
      cancelAnimationFrame(s.frame);
      window.clearTimeout(s.timer);
    };
  }, [value, delay]);

  return <span ref={ref} className={className} />;
}

/** The header band while New budget is open: the total the answers so far add up to. */
export function LiveTotal({ live }: { live: LiveBudget }) {
  const ready = live.phase === "ready" ? live : null;
  const headline = useMemo(() => (ready ? headlineOf(ready.rom) : null), [ready]);
  const [delta, setDelta] = useState<{ id: number; amount: number } | null>(null);
  const previous = useRef<{ midpoint: number; area: number } | null>(null);

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

  if (live.phase === "idle") return <p className="rb-tnone">New budget</p>;
  if (live.phase === "loading") return <p className="rb-tnone">Reading the data behind the budget.</p>;
  if (live.phase === "failed") return <p className="rb-tnone">New budget. The live figure is not available: {live.error}</p>;
  if (live.phase === "waiting" || !headline || !ready) {
    return (
      <div className="lb-tot">
        <span className="rb-tl">Trade cost</span>
        <span className="rb-tv num lb-wait">&mdash;</span>
        <span className="rb-tb">waiting on the gross area</span>
        <span className="lb-tag">Preview, not saved</span>
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
  const rom = live.phase === "ready" ? live.rom : null;
  const notInJob = rom?.notInThisJob ?? [];
  const tbd = rom?.tbdGateItems ?? [];
  const kulka = blocks.filter((block) => !block.ownerDirect);
  const owner = blocks.filter((block) => block.ownerDirect);
  const rank = new Map(blocks.map((block, index) => [block.costCode, index]));

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
        .forEach(([, el], index) => {
          el.animate(
            [
              { opacity: 0, transform: "translateY(8px) scale(0.98)", filter: "blur(4px)" },
              { opacity: 1, transform: "none", filter: "blur(0)" },
            ],
            { duration: 380, delay: cascade ? Math.min(index * 22, 520) : 0, easing: EASE_SMOOTH, fill: "backwards" },
          );
        });
    }
    if (entering.length > 0) firstFill.current = false;
    tracked.current = next;
  });

  if (live.phase === "idle" || live.phase === "loading") {
    return (
      <div className="lb" ref={layer}>
        <div className="lb-ghosts" ref={ghosts} />
        <p className="rb-none">{live.phase === "loading" ? "Reading the data behind the budget." : "Nothing here yet."}</p>
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
  const tile = (block: TradeBlock) => (
    <LiveBlock
      key={block.costCode}
      block={block}
      waiting={waiting}
      rollDelay={Math.min((rank.get(block.costCode) ?? 0) * 22, 520)}
      register={register(block.costCode)}
    />
  );

  return (
    <div className={`lb${waiting ? " lb--waiting" : ""}`} ref={layer}>
      <div className="lb-ghosts" ref={ghosts} aria-hidden="true" />
      {waiting ? (
        <p className="rb-none lb-hint">Enter the gross area and each trade fills in.</p>
      ) : null}
      {blocks.length === 0 ? <p className="rb-none">No benchmark matched this project type, so there are no lines.</p> : null}
      {kulka.length > 0 ? (
        <section className="rb-grp" aria-label="Trades">
          <h2>{waiting ? "Trades, in the order they price" : "Trades, biggest first"}</h2>
          <div className="rb-grid">{kulka.map(tile)}</div>
        </section>
      ) : null}
      {owner.length > 0 ? (
        <section className="rb-grp" aria-label="Bought by the owner direct">
          <h2>Bought by the owner direct</h2>
          <div className="rb-grid">{owner.map(tile)}</div>
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
