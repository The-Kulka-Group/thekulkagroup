"use client";

import { useEffect, useRef, useState } from "react";

import type { StageBuilding } from "@/lib/rom/stage-model";

import { reducedMotion } from "../motion";
import type { StageModel } from "./build-model";
import "./stage.css";

// LA-1317: the Design and Engineering stage across the top of the budget.
// Three.js loads only in the browser, the model draws only while it moves,
// and a browser without WebGL simply gets no stage.

export function Stage({ building }: { building: StageBuilding | null }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const model = useRef<StageModel | null>(null);
  const played = useRef(false);
  const replayRef = useRef<() => void>(() => {});
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  // Rebuild when the building changes, not when the object identity does.
  const key = building ? JSON.stringify(building) : "";

  useEffect(() => {
    if (!building || !canvas.current || !wrap.current) return;
    let cancelled = false;
    let raf = 0;
    let observer: ResizeObserver | null = null;
    const el = wrap.current;

    void import("./build-model")
      .then(({ buildStageModel }) => {
        if (cancelled || !canvas.current) return;
        const narrow = window.matchMedia("(max-width: 900px), (pointer: coarse)").matches;
        const m = buildStageModel(canvas.current, building, {
          occlusion: !narrow,
          pixelRatio: Math.min(window.devicePixelRatio || 1, narrow ? 1.5 : 2),
        });
        model.current = m;
        const size = () => {
          const w = el.clientWidth, h = el.clientHeight;
          if (w > 0 && h > 0) {
            m.resize(w, h);
            m.render();
          }
        };
        observer = new ResizeObserver(size);
        observer.observe(el);
        size();

        const play = () => {
          cancelAnimationFrame(raf);
          const start = performance.now();
          const tick = (now: number) => {
            const t = (now - start) / 1000;
            m.pose(Math.min(t, m.duration));
            m.render();
            if (t < m.duration) raf = requestAnimationFrame(tick);
          };
          raf = requestAnimationFrame(tick);
        };
        replayRef.current = () => (reducedMotion() ? undefined : play());
        // The building assembles the first time the page shows it; a later
        // change (a correction, a new run) lands in its finished state.
        if (!played.current && !reducedMotion()) {
          played.current = true;
          play();
        } else {
          m.pose(m.duration);
          m.render();
        }
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      model.current?.dispose();
      model.current = null;
    };
    // `key` stands in for `building`: rebuild only when its contents change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!building || failed) return null;
  return (
    <section className="stg" ref={wrap} aria-label="Design and Engineering model">
      <canvas ref={canvas} className="stg-cv" role="img" aria-label="3D model of the building this budget assumes" />
      {ready && !reducedMotion() ? (
        <button type="button" className="stg-replay" onClick={() => replayRef.current()}>
          Replay
        </button>
      ) : null}
    </section>
  );
}
