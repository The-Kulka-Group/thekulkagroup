"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { BarModel, BarSpan, Chip } from "./field-order";
import { UnpricedDot } from "./PackageCard";

// LA-1181. The header's markup bar, linked to the field below it. At rest it
// shows the markup split (Trades, GRs/GCs, Fee, Insurance, Owner Direct) with
// faint dividers inside Trades at each card's share, in the field's order.
// Hovering or selecting a card lights its share in solid ink, and the chip
// beside the total names it. The lit share slides from one card to the next;
// it never blinks out and back in.

/** How long a hover must hold before the bar reacts, and how long it lingers after. */
const ENTER_MS = 70;
const LEAVE_MS = 140;

/**
 * Hover intent: the bar follows the pointer only once it settles on a card
 * (about 70ms) and lets go only once it has really left (about 140ms), so
 * sweeping across the field slides the lit share instead of flickering it.
 * Focus drives it the same way, so the keyboard previews as the pointer does.
 */
export function useHoverIntent() {
  const [key, setKey] = useState<string | null>(null);
  const timer = useRef(0);
  const enter = useCallback((next: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setKey(next), ENTER_MS);
  }, []);
  const leave = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setKey(null), LEAVE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { key, enter, leave };
}

/** What a card or block needs to take part in the link to the bar. */
export type FieldLink = {
  onEnter: (key: string) => void;
  onLeave: () => void;
  /** The one item hovered in a card's strip or the side panel, by cost code. */
  item: string | null;
  onItem: (costCode: string | null) => void;
};

type Lit = { key: string | null; span: BarSpan | null; snap: boolean };

export function ShareBar({ bar, litKey }: { bar: BarModel; litKey: string | null }) {
  const span = litKey ? (bar.spans.get(litKey) ?? null) : null;
  // The lit share keeps its last place while it fades, and appears in place
  // (no slide) when nothing was lit before; from one card to another it
  // slides. Derived during render, the way React adjusts state to a prop.
  const [lit, setLit] = useState<Lit>({ key: null, span: null, snap: true });
  const moved = span !== null && (span.left !== lit.span?.left || span.width !== lit.span?.width);
  if (litKey !== lit.key || moved) {
    setLit({ key: litKey, span: span ?? lit.span, snap: lit.key === null && litKey !== null });
  }
  const shown = span ?? lit.span;

  return (
    <span className="lb-comp" aria-hidden="true">
      <span className="lb-bar sb-bar">
        {bar.parts.map((part) => (
          <i
            key={part.key}
            className={`lb-seg lb-seg--${part.key}`}
            title={part.label}
            style={{ left: `${part.left}%`, width: `${part.width}%` }}
          />
        ))}
        {bar.hairlines.map((line) => (
          <i key={line.key} className="sb-hair" style={{ left: `${line.left}%` }} />
        ))}
        <i
          className={`sb-lit${span && span.width > 0 ? " sb-lit--on" : ""}${lit.snap ? " sb-lit--snap" : ""}`}
          style={shown ? { left: `${shown.left}%`, width: `${Math.max(shown.width, 0)}%` } : undefined}
        />
      </span>
    </span>
  );
}

/** "Plumbing $788k, 32% of Trades", or "Site Work" with the orange No Rate Yet. */
export function ShareChip({ chip }: { chip: Chip | null }) {
  if (!chip) return null;
  return (
    <span className="sb-chip" key={chip.name}>
      <b>{chip.name}</b>
      {chip.figure === null ? (
        <span className="sb-none">
          <UnpricedDot />
          No Rate Yet
        </span>
      ) : (
        <>
          <span className="num">{chip.figure}</span>
          {chip.share ? <span className="sb-share num">{chip.share}</span> : null}
        </>
      )}
    </span>
  );
}
