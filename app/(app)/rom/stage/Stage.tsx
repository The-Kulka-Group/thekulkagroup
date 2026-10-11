"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { rateUsd, usd } from "@/lib/format/usd";
import { partTints, PRICE_LEVELS, type PriceLevels, rowPerGsf, rowsHolding, rowTint } from "@/lib/rom/level-rows";
import type { LevelView, PartPriceMap, PricedPart, PriceLevel } from "@/lib/rom/part-prices";
import { partsOf, type StageBuilding } from "@/lib/rom/stage-model";
import { CARD_ORDER, cardForPart, decisionsFor, STAGE_PARTS, type StageEvent, type StagePart } from "@/lib/rom/stage-scenes";

import { reducedMotion } from "../motion";
import type { PartState, PartStates, StageController, StageCut } from "./build-model";
import type { Pulse } from "./useAnswerFeedback";
import "./stage.css";

// LA-1317, LA-1318: the Design and Engineering stage across the top of the
// budget. Three.js loads only in the browser, the model draws only while
// something moves, and a browser without WebGL simply gets no stage.
//
// - "assemble" (a saved budget): the building assembles once, piles first,
//   and Replay plays it again. A budget New Budget just built opens finished,
//   since the viewer has just watched it go up.
// - "live" (New Budget): each answer and Design and Engineering card arrives
//   as an event and plays as its own moment, one after another. The caption
//   names the decision, the part draws in blue, and when it lands the caption
//   fills in the answer, `onLand` fires (so the budget can price it and the
//   price tag can fly), and the part settles to the model's own colour. The
//   queue runs faster while it is behind, so answering never waits on it.
//
// LA-1325, LA-1328: the building is an axonometric card with a home of its
// own, never floating over the budget: the last card of the Design and
// Engineering grid on a saved budget, the right end of the hero stage in New
// Budget. On a saved budget, clicking it opens the Building View in place,
// across the whole grid: drag or use the
// arrow keys to turn it, scroll or plus and minus to zoom, cut a plan through
// a level or a section across it, and click a part (or its row beneath) to
// open the Design and Engineering card that decided it in the side panel.
// Nothing covers the page, so the panel opens beside the view as it does
// for any card.
//
// LA-2211: given the run's part price map, a click on a part picks it
// instead: the part's cost, $/GSF, source mark and rate math show over the
// view, the rest of the building fades, and the same click again clears it.
// The row beneath lists the parts, so picking works from the keyboard too,
// and a picked part's panel opens the card that decided it. A part nothing
// prices draws faint with a dashed working-orange edge and reads Not Priced.
//
// LA-2212: given the run's price levels, a list beside the view reads the
// same run at Level 1 (one block), Level 2 (the ADR 0002 elements) or Level 3
// (the canonical work items), and the stage tints to match. Picking a row
// lights its parts; picking a part marks the rows it sits in.

type Props = { building: StageBuilding | null } & (
  | {
      mode: "assemble";
      projectId: string | null;
      /** LA-1325: the budget's Design and Engineering codes, so a part opens the card that decided it. */
      cards?: readonly string[];
      /** The card open in the side panel, whose parts stay lit. */
      openCode?: string | null;
      onOpenCard?: (code: string, from: HTMLElement) => void;
      /** LA-2211: the run's part price map. With it, picking a part shows its price. */
      prices?: PartPriceMap | null;
      /** LA-2212: the run at every price level. With it, the open view lists the run at the level picked. */
      levels?: PriceLevels | null;
    }
  | {
      mode: "live";
      events: readonly StageEvent[];
      /** A moment started: its card's geometry joins the model now, so there is something to draw. */
      onStart: (event: StageEvent) => void;
      /** A moment landed. `point` is where its part sits on screen, in client pixels. */
      onLand: (event: StageEvent, point: { x: number; y: number }) => void;
      /** LA-1324: the hero stage names each moment, so the model shows no caption of its own. */
      quiet?: boolean;
      /** LA-2213: the live budget's part price map. With it, the building opens to pick a part, as the saved budget's does. */
      prices?: PartPriceMap | null;
      /** LA-2213: the parts the last answer changed. Each new pulse lights them once. */
      pulse?: Pulse | null;
    }
);

/** Set by New Budget as it hands off, so the saved budget opens on the finished building. */
export function markStageBuilt(projectId: string) {
  try {
    sessionStorage.setItem(`kulka-stage-built:${projectId}`, "1");
  } catch {
    // Without storage the saved budget simply assembles again.
  }
}
function takeStageBuilt(projectId: string | null): boolean {
  if (!projectId) return false;
  try {
    const key = `kulka-stage-built:${projectId}`;
    const built = sessionStorage.getItem(key) === "1";
    sessionStorage.removeItem(key);
    return built;
  } catch {
    return false;
  }
}

// A moment's timing, in seconds, before the queue speeds it up.
const BUILD = 0.85;
const MARK = 0.4;
const SETTLE = 0.5;
const CAPTION_ONLY = 0.55;
/** LA-1324: a Design and Engineering card plays its picture on the hero stage, so it runs longer. */
const CARD_BUILD = 1.5;
const CARD_CODES: ReadonlySet<string> = new Set(CARD_ORDER);

type Scene = { event: StageEvent; start: number; land: number; end: number; build: StagePart[]; mark: StagePart[]; landed: boolean };
type Caption = { event: StageEvent; landed: boolean };
type CutKind = StageCut["kind"];

const CUTS: { kind: CutKind; label: string }[] = [
  { kind: "none", label: "No Cut" },
  { kind: "plan", label: "Plan Cut" },
  { kind: "section", label: "Section Cut" },
];
/** Radians a pixel of drag turns the view. */
const TURN = 0.008;
const EMPTY: readonly string[] = [];
/** LA-2212: below this width in CSS pixels, the open view has no room for the price list beside the building. */
const TIGHT = 720;
/** LA-2213: how long a changed part stays lit. */
const PULSE_MS = 900;

export function Stage(props: Props) {
  const { building } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const capRef = useRef<HTMLDivElement>(null);
  const ctl = useRef<StageController | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [caption, setCaption] = useState<Caption | null>(null);
  const replayRef = useRef<() => void>(() => {});
  const kick = useRef<() => void>(() => {});
  // LA-1325: the open Building View, its cut, and the parts the pointer or a row lights.
  const [open, setOpen] = useState(false);
  const [cutKind, setCutKind] = useState<CutKind>("none");
  const [level, setLevel] = useState(0);
  const [across, setAcross] = useState(0.5);
  const [hover, setHover] = useState<readonly StagePart[]>([]);
  // LA-2211: the picked part, when the stage has the run's prices.
  const [picked, setPicked] = useState<StagePart | null>(null);
  // LA-2212: the price level the list reads, and the row picked in it.
  const [priceLevel, setPriceLevel] = useState<PriceLevel>(3);
  const [row, setRow] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; moved: boolean; id: number } | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const partsRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const pickRef = useRef<HTMLElement>(null);
  const rowsRef = useRef<HTMLElement>(null);
  const hoverFrame = useRef(0);

  // Live mode's working state, kept out of React so a frame never re-renders.
  const parts = useRef<Record<StagePart, PartState>>(
    Object.fromEntries(STAGE_PARTS.map((p) => [p, { arrive: 0, tint: 1 }])) as Record<StagePart, PartState>,
  );
  const queue = useRef<StageEvent[]>([]);
  const seen = useRef(0);
  const scene = useRef<Scene | null>(null);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  // Rebuild when the building changes, not when the object identity does.
  const key = building ? JSON.stringify(building) : "";
  const hasBuilding = building !== null;

  // One renderer for the stage's life.
  useEffect(() => {
    if (!hasBuilding || !canvas.current || !wrap.current) return;
    let cancelled = false;
    let raf = 0;
    let last = 0;
    let observer: ResizeObserver | null = null;
    const el = wrap.current;

    void import("./build-model")
      .then(({ createStage, assemblyPlan, assemblyStates }) => {
        if (cancelled || !canvas.current) return;
        const narrow = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
        const c = createStage(canvas.current, {
          occlusion: !narrow,
          pixelRatio: Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2),
          captionRoom: latest.current.mode === "live" && !latest.current.quiet,
        });
        ctl.current = c;
        const spec = latest.current.building;
        if (!spec) return;
        c.setBuilding(spec);

        const size = () => {
          const w = el.clientWidth, h = el.clientHeight;
          if (w > 0 && h > 0) {
            c.resize(w, h);
            c.render();
          }
        };
        observer = new ResizeObserver(size);
        observer.observe(el);
        size();

        const p = latest.current;
        if (p.mode === "assemble") {
          const play = () => {
            cancelAnimationFrame(raf);
            const now0 = performance.now();
            const plan = assemblyPlan(latest.current.building ?? spec);
            const tick = (now: number) => {
              const t = (now - now0) / 1000;
              const b = latest.current.building ?? spec;
              c.setParts(assemblyStates(b, Math.min(t, plan.duration)));
              c.setDrift(Math.min(1, t / 6));
              c.tick(1);
              c.render();
              if (t < Math.max(plan.duration, 6)) raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
          };
          const finished = () => {
            const b = latest.current.building ?? spec;
            c.setParts(assemblyStates(b, assemblyPlan(b).duration + 1));
            c.setDrift(1);
            c.tick(1);
            c.render();
          };
          replayRef.current = () => (reducedMotion() ? undefined : play());
          kick.current = finished;
          if (reducedMotion() || takeStageBuilt(p.projectId)) finished();
          else play();
        } else {
          c.setDrift(1);
          c.tick(10);
          const frame = (now: number) => {
            const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
            last = now;
            const busy = step(now / 1000);
            const moving = c.tick(dt);
            c.setParts(parts.current as PartStates);
            c.render();
            if (busy || moving) raf = requestAnimationFrame(frame);
            else {
              raf = 0;
              last = 0;
            }
          };
          kick.current = () => {
            if (!raf) raf = requestAnimationFrame(frame);
          };
          kick.current();
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    /** Advances the scene queue to `now`. True while anything is still playing. */
    function step(now: number): boolean {
      const s = scene.current;
      if (s) {
        const t = now - s.start;
        const buildLen = s.land;
        for (const part of s.build) {
          parts.current[part] = {
            arrive: Math.min(1, t / buildLen),
            tint: Math.max(0, Math.min(1, (t - buildLen) / (s.end - buildLen))),
          };
        }
        for (const part of s.mark) {
          // Lit blue at once, held while the caption fills in, then settled.
          parts.current[part] = { arrive: 1, tint: Math.max(0, Math.min(1, (t - s.land) / (s.end - s.land))) };
        }
        if (!s.landed && t >= s.land) {
          s.landed = true;
          land(s.event, [...s.build, ...s.mark][0] ?? null);
        }
        if (t >= s.end) scene.current = null;
        else return true;
      }
      const next = queue.current.shift();
      if (!next) return false;
      start(next, now);
      return true;
    }

    function start(event: StageEvent, now: number) {
      const drawn = event.parts;
      const build = drawn.filter((part) => parts.current[part].arrive < 1);
      const mark = drawn.filter((part) => parts.current[part].arrive >= 1);
      // Behind by several moments, each plays at under half length.
      const behind = queue.current.length;
      const speed = behind >= 3 ? 0.45 : behind >= 1 ? 0.7 : 1;
      const card = CARD_CODES.has(event.source);
      const landAt = (card ? CARD_BUILD : build.length ? BUILD : drawn.length ? MARK : CAPTION_ONLY) * speed;
      const end = landAt + (drawn.length ? SETTLE : 0.3) * speed;
      for (const part of mark) parts.current[part] = { arrive: 1, tint: 0 };
      scene.current = { event, start: now, land: landAt, end, build, mark, landed: false };
      setCaption({ event, landed: false });
      const p = latest.current;
      if (p.mode === "live") p.onStart(event);
    }

    function land(event: StageEvent, part: StagePart | null) {
      setCaption({ event, landed: true });
      const p = latest.current;
      if (p.mode !== "live") return;
      const rect = canvas.current?.getBoundingClientRect();
      const at = part && ctl.current ? ctl.current.pointOf(part) : null;
      const cap = capRef.current?.getBoundingClientRect();
      const point =
        at && rect
          ? { x: rect.left + at.x, y: rect.top + at.y }
          : cap
            ? { x: cap.left + cap.width / 2, y: cap.top + cap.height / 2 }
            : { x: window.innerWidth / 2, y: 120 };
      p.onLand(event, point);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      ctl.current?.dispose();
      ctl.current = null;
      setReady(false);
    };
  }, [hasBuilding]);

  // The building's facts changed: rebuild it in place and let the camera reframe.
  useEffect(() => {
    const c = ctl.current;
    if (!c || !building) return;
    c.setBuilding(building);
    kick.current();
    // `key` stands in for `building`: rebuild only when its contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Live mode: new events join the queue.
  const events = props.mode === "live" ? props.events : null;
  useEffect(() => {
    if (!events) return;
    const fresh = events.filter((e) => e.id > seen.current);
    if (fresh.length === 0) return;
    seen.current = fresh[fresh.length - 1].id;
    if (reducedMotion()) {
      // Every moment lands at once, in its finished state.
      for (const event of fresh) {
        for (const part of event.parts) parts.current[part] = { arrive: 1, tint: 1 };
        setCaption({ event, landed: true });
        const p = latest.current;
        const rect = wrap.current?.getBoundingClientRect();
        if (p.mode === "live") p.onStart(event);
        if (p.mode === "live") p.onLand(event, { x: (rect?.left ?? 0) + 120, y: (rect?.top ?? 0) + 40 });
      }
      kick.current();
      return;
    }
    queue.current.push(...fresh);
    kick.current();
  }, [events, ready]);

  // LA-1325: what the open view knows about the budget's cards.
  const assemble = props.mode === "assemble" ? props : null;
  const cards = assemble?.cards ?? EMPTY;
  const openCode = assemble?.openCode ?? null;
  const codes = useMemo(() => new Set(cards), [cards]);
  const decisions = useMemo(() => (building ? decisionsFor(partsOf(building), codes) : []), [building, codes]);
  const prices = props.prices ?? null;
  const openable = !failed && (props.mode === "assemble" || prices !== null);
  const pulse = props.mode === "live" ? (props.pulse ?? null) : null;
  const priceOf = useMemo(() => new Map((prices?.parts ?? []).map((one) => [one.part, one])), [prices]);
  const unpricedParts = useMemo(() => (prices?.parts ?? []).filter((one) => one.unpriced).map((one) => one.part), [prices]);
  // A picked part the building no longer draws is no longer picked.
  const pick = picked && priceOf.has(picked) ? priceOf.get(picked)! : null;
  const levels = assemble?.levels ?? null;
  const view = levels?.views[priceLevel] ?? null;
  const rowParts = useMemo(() => view?.rows.find((one) => one.key === row)?.parts ?? [], [view, row]);
  const holding = useMemo(() => new Set(view && pick ? rowsHolding(view, pick.part) : []), [view, pick]);
  const tints = useMemo(() => (open && view ? partTints(view) : {}), [open, view]);
  const stories = building?.levels.length ?? 0;

  const cut: StageCut = useMemo(
    () =>
      cutKind === "plan"
        ? { kind: "plan", level: Math.min(level, Math.max(0, stories - 1)) }
        : cutKind === "section"
          ? { kind: "section", at: across }
          : { kind: "none" },
    [cutKind, level, across, stories],
  );
  const lit = useMemo(
    () =>
      hover.length > 0
        ? hover
        : rowParts.length > 0
          ? rowParts
          : (decisions.find((d) => d.code === openCode)?.parts ?? []),
    [hover, rowParts, decisions, openCode],
  );
  const focus = open ? (pick?.part ?? null) : null;

  // LA-2213: an answer lights the parts it changed once, up and back. Under
  // reduced motion there is no sweep; the figures still change.
  useEffect(() => {
    const c = ctl.current;
    if (!pulse || !c || !ready || reducedMotion()) return;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / PULSE_MS);
      c.setPulse(pulse.parts, Math.sin(Math.PI * p));
      c.render();
      if (p < 1) raf = requestAnimationFrame(step);
      else c.setPulse([], 0);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      c.setPulse([], 0);
    };
  }, [pulse, ready]);

  // Only the open view is cut; closing it puts the whole building back.
  useEffect(() => {
    const c = ctl.current;
    if (!c) return;
    c.setCut(open ? cut : { kind: "none" });
    c.setHighlight(lit);
    c.setUnpriced(unpricedParts);
    c.setFocus(focus);
    c.setTints(tints);
    c.render();
  }, [open, cut, lit, unpricedParts, focus, tints, ready, key]);

  // The open view's controls cover its top and bottom, so the building frames between them.
  useEffect(() => {
    const el = wrap.current;
    const c = ctl.current;
    if (!el || !c) return;
    const inset = () => {
      const box = el.getBoundingClientRect();
      // Open, the tools sit on top and the decisions below; closed, the card's label on top.
      const top = (open ? barRef.current : labelRef.current)?.getBoundingClientRect();
      const row = open ? partsRef.current?.getBoundingClientRect() : undefined;
      // LA-2211: the picked part's panel sits under the tools. In a view too
      // narrow to frame the building beside it, the building frames below it.
      const panel = open ? pickRef.current?.getBoundingClientRect() : undefined;
      if (top) el.style.setProperty("--stg-bar-bottom", `${top.bottom - box.top}px`);
      el.style.setProperty("--stg-row-top", `${row ? row.top - box.top : box.height}px`);
      // LA-2212: the price list sits beside the building, or, in a view too
      // narrow for that, under the tools with the building framed below it.
      const tight = box.width < TIGHT;
      el.dataset.tight = String(tight);
      const list = open && tight ? rowsRef.current?.getBoundingClientRect() : undefined;
      const under = Math.max(
        top?.bottom ?? 0,
        panel && panel.width * 2 > box.width ? panel.bottom : 0,
        list ? list.bottom : 0,
      );
      c.setInsets(under ? under - box.top + 6 : 0, row ? box.bottom - row.top + 8 : 0);
      c.render();
    };
    inset();
    const observer = new ResizeObserver(inset);
    observer.observe(el);
    if (pickRef.current) observer.observe(pickRef.current);
    if (rowsRef.current) observer.observe(rowsRef.current);
    return () => observer.disconnect();
  }, [open, ready, decisions.length, prices, pick?.part, view]);

  // Opening scrolls the view into sight; closing returns the camera to its framing.
  useEffect(() => {
    if (open) wrap.current?.scrollIntoView({ block: "start", behavior: reducedMotion() ? "auto" : "smooth" });
    else {
      ctl.current?.resetView();
      ctl.current?.render();
    }
  }, [open]);

  // Open, the view fills the field's height, so its decisions are in sight
  // and the wheel, which zooms it, has nothing below to reach for.
  useEffect(() => {
    const el = wrap.current;
    const field = el?.closest(".rb-fld");
    if (!open || !el || !field) return;
    const place = () => el.style.setProperty("--stg-open-height", `${Math.max(320, field.clientHeight - 32)}px`);
    place();
    const observer = new ResizeObserver(place);
    observer.observe(field);
    return () => observer.disconnect();
  }, [open, hasBuilding, failed]);

  // The wheel zooms the open view; it needs a listener that can stop the page scrolling.
  useEffect(() => {
    const el = canvas.current;
    if (!open || !el) return;
    const onWheel = (event: WheelEvent) => {
      const c = ctl.current;
      if (!c) return;
      event.preventDefault();
      c.zoom(Math.exp(-event.deltaY * 0.0015));
      c.render();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, ready]);

  if (!building || failed) return null;
  const cap = caption?.event;

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const openCard = (code: string, from: HTMLElement) => assemble?.onOpenCard?.(code, from);
  /** LA-2211: picks a part, or clears the pick when it is already picked or nothing is under the pointer. */
  const pickPart = (part: StagePart | null) => {
    setPicked((now) => (part === null || part === now ? null : part));
    setRow(null);
  };
  /** LA-2212: picks a row of the list, or clears it when it is already picked. A row and a part are never picked together. */
  const pickRow = (key: string) => {
    setRow((now) => (now === key ? null : key));
    setPicked(null);
  };
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!open || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, moved: false, id: event.pointerId };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!open) return;
    const c = ctl.current;
    const d = drag.current;
    if (c && d && d.id === event.pointerId) {
      const dx = event.clientX - d.x, dy = event.clientY - d.y;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      d.moved = true;
      d.x = event.clientX;
      d.y = event.clientY;
      c.orbit(-dx * TURN, dy * TURN * 0.75);
      c.render();
      return;
    }
    // Hovering lights the part under the pointer, at most once a frame.
    const at = pointAt(event);
    const target = event.currentTarget;
    cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = requestAnimationFrame(() => {
      const part = ctl.current?.pick(at.x, at.y) ?? null;
      if (prices) {
        // Priced, every part picks, and only the one under the pointer lights.
        const parts = part && priceOf.has(part) ? [part] : [];
        target.style.cursor = parts.length ? "pointer" : "grab";
        setHover((now) => (now.join() === parts.join() ? now : parts));
        return;
      }
      const code = part ? cardForPart(part, codes) : null;
      target.style.cursor = code ? "pointer" : "grab";
      const parts = code ? (decisions.find((one) => one.code === code)?.parts ?? [part!]) : [];
      setHover((now) => (now.join() === parts.join() ? now : parts));
    });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!open || !d || d.id !== event.pointerId || d.moved) return;
    const at = pointAt(event);
    const part = ctl.current?.pick(at.x, at.y) ?? null;
    if (prices) {
      pickPart(part && priceOf.has(part) ? part : null);
      return;
    }
    const code = part ? cardForPart(part, codes) : null;
    if (code) openCard(code, event.currentTarget);
  };
  const onKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    const c = ctl.current;
    if (!open || !c) return;
    if (event.key === "Escape" && (picked || row)) {
      event.preventDefault();
      setPicked(null);
      setRow(null);
      return;
    }
    const moves: Record<string, () => void> = {
      ArrowLeft: () => c.orbit(0.12, 0),
      ArrowRight: () => c.orbit(-0.12, 0),
      ArrowUp: () => c.orbit(0, 0.08),
      ArrowDown: () => c.orbit(0, -0.08),
      "+": () => c.zoom(1.2),
      "=": () => c.zoom(1.2),
      "-": () => c.zoom(1 / 1.2),
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    move();
    c.render();
  };
  const shapeLine = [building.form.shape, `${stories} ${stories === 1 ? "Story" : "Stories"}`].filter(Boolean).join(", ");
  return (
    <section
      className={`stg ${open ? "stg--open" : "stg--card"}${props.mode === "live" ? " stg--live" : ""}`}
      ref={wrap}
      aria-label="Building View"
    >
      <canvas
        ref={canvas}
        className="stg-cv"
        role={open ? "application" : "img"}
        tabIndex={open ? 0 : -1}
        aria-label={
          open
            ? "3D model of the building. Drag or use the arrow keys to turn it, and scroll or press plus and minus to zoom."
            : "3D model of the building this budget assumes"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={() => {
          cancelAnimationFrame(hoverFrame.current);
          if (!drag.current) setHover([]);
        }}
        onKeyDown={onKeyDown}
      />
      {props.mode === "live" && !props.quiet && cap ? (
        <div className="stg-cap" ref={capRef} key={cap.id}>
          {cap.tag && cap.tag !== cap.title ? <span className="stg-code num">{cap.tag}</span> : null}
          <span className="stg-title">{cap.title}</span>
          <span className={`stg-ans${caption.landed ? " stg-ans--on" : ""}`}>{caption.landed ? cap.answer : ""}</span>
        </div>
      ) : null}
      {props.mode === "live" && props.quiet ? null : (
        <span className="lb-sr" aria-live="polite">
          {caption?.landed && cap ? `${cap.title}: ${cap.answer}` : ""}
        </span>
      )}
      {openable && !open ? (
        <>
          <span className="stg-lbl" ref={labelRef} aria-hidden="true">
            <span className="stg-lbl-t">Building View</span>
            <span className="stg-lbl-s">{shapeLine}</span>
          </span>
          <button type="button" className="stg-hit" aria-expanded={false} onClick={() => setOpen(true)}>
            <span className="lb-sr">Open the Building View</span>
          </button>
        </>
      ) : null}
      {open ? (
        <>
          <div className="stg-bar" ref={barRef}>
            <div className="stg-head">
              <span className="stg-head-t">Building View</span>
              <span className="stg-head-s">{shapeLine}</span>
            </div>
            <div className="stg-tools">
              <div className="stg-seg" role="group" aria-label="Cut">
                {CUTS.map((one) => (
                  <button
                    key={one.kind}
                    type="button"
                    className="stg-pill"
                    aria-pressed={cutKind === one.kind}
                    onClick={() => setCutKind(one.kind)}
                  >
                    {one.label}
                  </button>
                ))}
              </div>
              {cutKind === "plan" ? (
                <label className="stg-range">
                  <span className="num">Level {Math.min(level, stories - 1) + 1}</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, stories - 1)}
                    step={1}
                    value={Math.min(level, stories - 1)}
                    onChange={(e) => setLevel(Number(e.target.value))}
                    aria-label="Level to cut through"
                  />
                </label>
              ) : null}
              {cutKind === "section" ? (
                <label className="stg-range">
                  <span className="num">{Math.round(across * 100)}% Across</span>
                  <input
                    type="range"
                    min={0.02}
                    max={0.98}
                    step={0.01}
                    value={across}
                    onChange={(e) => setAcross(Number(e.target.value))}
                    aria-label="How far across to cut"
                  />
                </label>
              ) : null}
              <button
                type="button"
                className="stg-pill"
                onClick={() => {
                  ctl.current?.resetView();
                  ctl.current?.render();
                }}
              >
                Reset View
              </button>
              {!reducedMotion() ? (
                <button type="button" className="stg-pill" onClick={() => replayRef.current()}>
                  Replay
                </button>
              ) : null}
              <button
                type="button"
                className="stg-pill stg-pill--ink"
                aria-expanded={true}
                onClick={() => {
                  setOpen(false);
                  setHover([]);
                  setPicked(null);
                  setRow(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
          {levels && view ? (
            <LevelList
              listRef={rowsRef}
              view={view}
              grossSquareFeet={levels.grossSquareFeet}
              row={row}
              holding={holding}
              onLevel={(level) => {
                setPriceLevel(level);
                setRow(null);
              }}
              onRow={pickRow}
            />
          ) : null}
          {pick ? (
            <PickedPart
              panelRef={pickRef}
              part={pick}
              card={cardForPart(pick.part, codes)}
              cardTitle={decisions.find((one) => one.parts.includes(pick.part))?.title ?? null}
              onOpenCard={openCard}
              onClear={() => setPicked(null)}
            />
          ) : null}
          {prices ? (
            <div className="stg-parts" ref={partsRef} role="group" aria-label="Parts of the building, with their prices">
              {prices.parts.map((one) => (
                <button
                  key={one.part}
                  type="button"
                  className={`stg-pill stg-part${one.unpriced ? " stg-part--unpriced" : ""}`}
                  aria-pressed={pick?.part === one.part}
                  data-part={one.part}
                  data-lit={lit.includes(one.part) ? "true" : undefined}
                  onClick={() => pickPart(one.part)}
                  onPointerEnter={() => setHover([one.part])}
                  onPointerLeave={() => setHover([])}
                  onFocus={() => setHover([one.part])}
                  onBlur={() => setHover([])}
                >
                  {one.name}
                  <span className="stg-part-p num">{one.total === null ? "Not Priced" : usd(one.total)}</span>
                </button>
              ))}
            </div>
          ) : decisions.length > 0 ? (
            <div className="stg-parts" ref={partsRef} role="group" aria-label="Design and Engineering decisions in the model">
              {decisions.map((one) => (
                <button
                  key={one.code}
                  type="button"
                  className="stg-pill stg-part"
                  aria-pressed={openCode === one.code}
                  onClick={(e) => openCard(one.code, e.currentTarget)}
                  onPointerEnter={() => setHover(one.parts)}
                  onPointerLeave={() => setHover([])}
                  onFocus={() => setHover(one.parts)}
                  onBlur={() => setHover([])}
                >
                  <span className="stg-part-c num">{one.code}</span>
                  {one.title}
                </button>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** LA-2212: the run at one price level, with the switch between levels. */
function LevelList({
  listRef,
  view,
  grossSquareFeet,
  row,
  holding,
  onLevel,
  onRow,
}: {
  listRef: React.Ref<HTMLElement>;
  view: LevelView;
  grossSquareFeet: number | null;
  row: string | null;
  holding: ReadonlySet<string>;
  onLevel: (level: PriceLevel) => void;
  onRow: (key: string) => void;
}) {
  return (
    <aside ref={listRef} className="stg-rows" aria-label="The budget at this price level">
      <div className="stg-seg" role="group" aria-label="Price Level">
        {PRICE_LEVELS.map((level) => (
          <button key={level} type="button" className="stg-pill" aria-pressed={view.level === level} onClick={() => onLevel(level)}>
            Level {level}
          </button>
        ))}
      </div>
      <ol className="stg-rows-list">
        {view.rows.map((one) => {
          const tint = rowTint(view.level, one);
          const perGsf = view.level === 1 ? rowPerGsf(one, grossSquareFeet) : null;
          return (
            <li key={one.key}>
              <button
                type="button"
                className={`stg-row${one.total === null ? " stg-row--unpriced" : ""}`}
                data-row={one.key}
                aria-pressed={row === one.key}
                aria-current={holding.has(one.key) ? "true" : undefined}
                onClick={() => onRow(one.key)}
              >
                <span className="stg-row-sw" style={tint ? { background: tint } : undefined} aria-hidden="true" />
                <span className="stg-row-l">{one.label}</span>
                <span className="stg-row-p num">{one.total === null ? "Not Priced" : usd(one.total)}</span>
                {perGsf !== null ? <span className="stg-row-psf num">{rateUsd(perGsf)} per GSF</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

/** "Kulka Rate" and the rest, as the chip tone each one wears. */
const SOURCE_TONE: Record<PricedPart["source"], string> = {
  "Kulka Rate": "done",
  "Kulka Figure": "done",
  "Placeholder Rate": "working",
  "No Rate Yet": "neutral",
};

/** LA-2211: the picked part's price, over the open view. */
function PickedPart({
  part,
  panelRef,
  card,
  cardTitle,
  onOpenCard,
  onClear,
}: {
  part: PricedPart;
  panelRef: React.Ref<HTMLElement>;
  card: string | null;
  cardTitle: string | null;
  onOpenCard: (code: string, from: HTMLElement) => void;
  onClear: () => void;
}) {
  return (
    <aside ref={panelRef} className="stg-pick" aria-label={`${part.name} price`} aria-live="polite" data-part={part.part}>
      <div className="stg-pick-head">
        <span className="stg-pick-name">{part.name}</span>
        <button type="button" className="stg-pick-x" aria-label="Clear the picked part" onClick={onClear}>
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      {part.total === null ? (
        <span className="stg-pick-total stg-pick-total--none">Not Priced</span>
      ) : (
        <span className="stg-pick-total num">{usd(part.total)}</span>
      )}
      <div className="stg-pick-meta">
        {part.perGsf !== null ? <span className="stg-pick-psf num">{rateUsd(part.perGsf)} per GSF</span> : null}
        <span className={`chip chip--${SOURCE_TONE[part.source]}`}>
          <span className="dot" aria-hidden="true" />
          {part.source}
        </span>
      </div>
      {part.math.length > 0 ? (
        <ul className="stg-pick-math">
          {part.math.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      ) : (
        <p className="stg-pick-none">No line in this budget prices this part yet.</p>
      )}
      {card ? (
        <button type="button" className="stg-pill stg-part" onClick={(e) => onOpenCard(card, e.currentTarget)}>
          <span className="stg-part-c num">{card}</span>
          {cardTitle ?? "Open the Decision"}
        </button>
      ) : null}
    </aside>
  );
}
