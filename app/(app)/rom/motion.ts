"use client";

import { useRef } from "react";

// LA-1142's motion primitives, shared by LiveBudget.tsx and the element box
// (LA-1158). One easing curve and one reduced-motion check for the whole /rom
// folder, so a box's tiles move the same way a trade block already does.

export const EASE_SMOOTH = "cubic-bezier(0.22, 1, 0.36, 1)";

export function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Where one tracked tile stood on its last measured commit. */
export type FlipTracked = { x: number; y: number; w: number; h: number; el: HTMLElement };

/**
 * LA-1142's FLIP tracker (First, Last, Invert, Play), pulled out of the live
 * budget's field so LA-1159's By Scope / By Package switch on the saved ROM
 * moves its blocks the same way New budget's field already does. Every
 * tracked key is measured on each commit against where it stood last time:
 *   - New: fades and blurs in, biggest-first cascaded on first fill.
 *   - Moved, same DOM node: slides from its old spot to its new one.
 *   - Moved to a different DOM node under the same key (crossing between a
 *     box and a flat block, say): the old node ghosts out from where it
 *     stood toward the new node's spot, and the new node fades in from that
 *     same offset, so the tile reads as one thing travelling.
 *   - Gone this commit: `onGone` hands the caller its last measured spot,
 *     since the node itself has already detached and there is nothing left
 *     here to animate.
 * prefers-reduced-motion skips every animation; positions still update.
 */
export function useFieldFlip() {
  const nodes = useRef(new Map<string, HTMLElement>());
  const tracked = useRef(new Map<string, FlipTracked>());
  const firstFill = useRef(true);

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(key, el);
    else nodes.current.delete(key);
  };

  /**
   * Runs the flip for the commit that just happened. Call from a
   * `useLayoutEffect` after every render, passing the field's own container
   * and ghost-layer nodes (each held in a `useRef` the caller owns, so the
   * ref itself is never threaded through this hook). `rank` orders the
   * entering cascade; `delayFor`, when given, names a tile's own entrance
   * delay (a box staging its tiles as a family) ahead of the plain cascade.
   */
  function run(
    container: HTMLElement | null,
    overlay: HTMLElement | null,
    rank: Map<string, number>,
    options?: {
      delayFor?: (key: string) => number | undefined;
      /**
       * LA-1181: how a tile that only moved travels. An order switch passes
       * its own duration and a short per-card stagger; without it a move
       * takes the default 460ms with no delay.
       */
      move?: { duration: number; delayFor: (key: string) => number };
    },
  ): void {
    if (!container) return;
    const still = reducedMotion();
    const origin = container.getBoundingClientRect();
    const previous = tracked.current;
    const next = new Map<string, FlipTracked>();
    const entering: [string, HTMLElement][] = [];

    // Where each element is on screen right now, mid-slide included, before
    // its running slide is cancelled and its new place measured.
    const offsets = new Map<HTMLElement, { x: number; y: number }>();
    for (const el of nodes.current.values()) {
      const transform = getComputedStyle(el).transform;
      const matrix = new DOMMatrixReadOnly(transform === "none" ? undefined : transform);
      offsets.set(el, { x: matrix.m41, y: matrix.m42 });
      for (const animation of el.getAnimations()) {
        if ((animation as Animation & { id: string }).id === "flip-move") animation.cancel();
      }
    }

    for (const [key, el] of nodes.current) {
      const r = el.getBoundingClientRect();
      const here: FlipTracked = { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height, el };
      next.set(key, here);
      const before = previous.get(key);
      if (!before) {
        entering.push([key, el]);
        continue;
      }
      if (still) continue;
      if (before.el !== el) {
        // Crossing between two different containers under the same key: the
        // old element lifts off where it was and heads for the new one,
        // which settles in behind it.
        if (overlay) ghost(overlay, before, here);
        el.animate(
          [
            {
              opacity: 0,
              transform: `translate(${before.x - here.x}px, ${before.y - here.y}px) scale(0.92)`,
              filter: "blur(3px)",
            },
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
          duration: options?.move?.duration ?? 460,
          delay: options?.move?.delayFor(key) ?? 0,
          easing: EASE_SMOOTH,
          fill: "backwards",
        });
        move.id = "flip-move";
      }
    }

    // Gone this commit: the node has already detached, so this ghosts it
    // away in place. A caller with somewhere better for it to land (a tray
    // below the field) still gets first refusal below, before this runs.
    for (const [key, before] of previous) {
      if (next.has(key) || still) continue;
      if (overlay) ghost(overlay, before, null);
    }

    if (!still) {
      const cascade = firstFill.current && entering.length > 3;
      entering
        .sort((a, b) => (rank.get(a[0]) ?? 0) - (rank.get(b[0]) ?? 0))
        .forEach(([key, el], index) => {
          const family = options?.delayFor?.(key);
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
  }

  return { register, run };
}

/**
 * The element that just left, put back where it stood in a layer over the
 * field and animated away: toward its new place when it has one, or down and
 * out when it has none. React has already detached it, so this is the node
 * itself, not a copy.
 */
export function ghost(overlay: HTMLElement, from: FlipTracked, to: FlipTracked | null): void {
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
