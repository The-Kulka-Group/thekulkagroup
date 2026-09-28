"use client";

import { useEffect, useRef, useState } from "react";

import type { StageBuilding } from "@/lib/rom/stage-model";
import { STAGE_PARTS, type StageEvent, type StagePart } from "@/lib/rom/stage-scenes";

import { reducedMotion } from "../motion";
import type { PartState, PartStates, StageController } from "./build-model";
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

type Props = { building: StageBuilding | null } & (
  | { mode: "assemble"; projectId: string | null }
  | {
      mode: "live";
      events: readonly StageEvent[];
      /** A moment started: its card's geometry joins the model now, so there is something to draw. */
      onStart: (event: StageEvent) => void;
      /** A moment landed. `point` is where its part sits on screen, in client pixels. */
      onLand: (event: StageEvent, point: { x: number; y: number }) => void;
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

type Scene = { event: StageEvent; start: number; land: number; end: number; build: StagePart[]; mark: StagePart[]; landed: boolean };
type Caption = { event: StageEvent; landed: boolean };

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
          captionRoom: latest.current.mode === "live",
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
      const landAt = (build.length ? BUILD : drawn.length ? MARK : CAPTION_ONLY) * speed;
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

  if (!building || failed) return null;
  const cap = caption?.event;
  return (
    <section className="stg" ref={wrap} aria-label="Design and Engineering model">
      <canvas ref={canvas} className="stg-cv" role="img" aria-label="3D model of the building this budget assumes" />
      {props.mode === "live" && cap ? (
        <div className="stg-cap" ref={capRef} key={cap.id}>
          {cap.tag && cap.tag !== cap.title ? <span className="stg-code num">{cap.tag}</span> : null}
          <span className="stg-title">{cap.title}</span>
          <span className={`stg-ans${caption.landed ? " stg-ans--on" : ""}`}>{caption.landed ? cap.answer : ""}</span>
        </div>
      ) : null}
      <span className="lb-sr" aria-live="polite">
        {caption?.landed && cap ? `${cap.title}: ${cap.answer}` : ""}
      </span>
      {props.mode === "assemble" && ready && !reducedMotion() ? (
        <button type="button" className="stg-replay" onClick={() => replayRef.current()}>
          Replay
        </button>
      ) : null}
    </section>
  );
}
