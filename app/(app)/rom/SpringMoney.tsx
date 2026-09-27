"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { reducedMotion } from "./motion";

// LA-1142. A dollar figure that springs to each new value, critically
// damped so it glides in and settles without overshoot: a figure that swings
// past its value would read as a wrong number. Shared by the live budget's
// trade blocks and the element box (LA-1158), so a driver's total and its
// box's header count up the same way.
const STIFFNESS = 170;
const DAMPING = 2 * Math.sqrt(STIFFNESS);
const STEP = 1 / 240;

/**
 * Writes its own text on each frame instead of re-rendering, so sixty blocks
 * rolling at once cost React nothing. Null shows a dash; the first real value
 * rolls up from zero after `delay`, which is how the first fill cascades
 * biggest first.
 */
export function SpringMoney({
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
