"use client";

// LA-1384. The saved budget's Ledger and Rail layout: the header's menus, the
// range band and rate alert, and Design and Engineering as a rail of facts
// ranked by the share of the range they price. Chosen over eight prototype
// rounds on LA-1331 and scored on Jefferson's Ferry (C00456). The rules these
// components draw are in ledger-rail-model.ts.

import Link from "next/link";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { formatDerivedValue, showsAssumedFact } from "@kulka/engine";

import { Chevron } from "@/components/ButtonMarks";

import type { Criterion, Ping } from "./DerivedCriteria";
import { bandGeometry, coarsePercent, factsByShare, lowCount, rateAlert } from "./ledger-rail-model";

/** A button that opens a small list under it. Escape or a click outside closes it, and Escape hands focus back. */
export function Menu({
  label,
  summary,
  children,
  align = "right",
}: {
  label: string;
  summary?: string;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const dismiss = () => setOpen(false);
  // On open, focus moves to the first control inside.
  useEffect(() => {
    if (!open) return;
    pop.current?.querySelector<HTMLElement>("a, button")?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  // Up and down move between the menu's controls, wrapping at either end.
  const onPopKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const items = [...(pop.current?.querySelectorAll<HTMLElement>("a, button") ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    e.preventDefault();
  };
  return (
    <div className="pm" ref={root}>
      <button
        ref={button}
        type="button"
        className="rb-hbtn pm-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={summary ? `${label}: ${summary}` : undefined}
        onClick={() => setOpen((now) => !now)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {label}
        {summary ? <span className="pm-sum" aria-hidden="true">{summary}</span> : null}
        <Chevron className="pm-car btn-chev" />
      </button>
      {open ? (
        <div ref={pop} className={`pm-pop pm-pop--${align}`} role="group" aria-label={label} onKeyDown={onPopKey}>
          {children(dismiss)}
        </div>
      ) : null}
    </div>
  );
}

/** One row of a menu: a button, or a link when it goes to another page. */
export function MenuItem({ onClick, href, children }: { onClick?: () => void; href?: string; children: ReactNode }) {
  if (href) {
    return (
      <Link className="pm-item" href={href}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className="pm-item" onClick={onClick}>
      {children}
    </button>
  );
}

/** The Ledger's order: Widest Range First, plus the two orders every view has. */
export function LedgerOrderChoice({
  order,
  bySpread,
  onChange,
}: {
  order: "largest" | "masterformat";
  bySpread: boolean;
  onChange: (order: "largest" | "masterformat", bySpread: boolean) => void;
}) {
  const options = [
    { key: "spread", label: "Widest Range First", on: bySpread, pick: () => onChange(order, true) },
    { key: "largest", label: "Largest First", on: !bySpread && order === "largest", pick: () => onChange("largest", false) },
    { key: "mf", label: "MasterFormat", on: !bySpread && order === "masterformat", pick: () => onChange("masterformat", false) },
  ];
  return (
    <div className="pos" role="group" aria-label="Order">
      {options.map((option) => (
        <button key={option.key} type="button" className="pm-item" aria-pressed={option.on} onClick={option.pick}>
          {option.label}
          {option.on ? <span className="pos-on" aria-hidden="true">✓</span> : null}
        </button>
      ))}
    </div>
  );
}

/** The total's range drawn on a scale from $0, labeled only at its low and high. */
export function RangeBand({ low, mid, high, format }: { low: number; mid: number; high: number; format: (v: number) => string }) {
  const at = bandGeometry(low, mid, high);
  return (
    <span className="prb">
      <span className="prb-track" aria-hidden="true">
        <span className="prb-band" style={{ left: `${at.left}%`, width: `${at.width}%` }} />
        <span className="prb-mid" style={{ left: `${at.mid}%` }} />
      </span>
      <span className="prb-lbls" aria-hidden="true">
        <span className="prb-lbl" style={{ left: `${at.left}%` }}>{format(low)}</span>
        <span className="prb-lbl prb-lbl--end" style={{ left: `${at.high}%` }}>{format(high)}</span>
      </span>
      <span className="p-sr">
        Range {format(low)} to {format(high)}.
      </span>
    </span>
  );
}

/** The header's one alert, shown only while a markup has no rate. */
export function RateAlert({ tbd, onEnterRate }: { tbd: readonly string[]; onEnterRate: (el: HTMLElement) => void }) {
  const text = rateAlert(tbd);
  if (!text) return null;
  return (
    <p className="psl psl--compact">
      <span className="psl-alert">
        <span className="psl-dot" aria-hidden="true" />
        {text}
      </span>
      <button type="button" className="psl-act" onClick={(e) => onEnterRate(e.currentTarget)}>
        Enter a Rate
      </button>
    </p>
  );
}

function pinged(item: Criterion, ping: Ping): boolean | null {
  if (ping === null) return null;
  if (!showsAssumedFact(item)) return false;
  return ping.fact === null || item.inputs.some((input) => input.basis === "assumed" && input.name === ping.fact);
}

/** One criterion as a fact: its value, its name, and a grey ring only where confidence is low. */
function Fact({
  item,
  selected,
  share,
  recheck,
  flip,
  ping,
  onOpen,
  onEnter,
  onLeave,
}: {
  item: Criterion;
  selected: boolean;
  /** The share of the range this fact prices, or undefined for a fact that prices no line here. */
  share?: number;
  recheck: boolean;
  flip: boolean;
  /** True lights the fact, false dims it, null leaves it alone. */
  ping: boolean | null;
  onOpen: (code: string, el: HTMLElement | null) => void;
  onEnter: (code: string) => void;
  onLeave: () => void;
}) {
  const value = formatDerivedValue(item.correction?.value ?? item.value);
  const low = item.confidence === "low" && !item.correction;
  const words = [
    `${item.label}: ${value}.`,
    share === undefined ? null : `Prices ${coarsePercent(share)} of the range.`,
    item.correction ? "Corrected." : low ? "Low confidence." : null,
    showsAssumedFact(item) ? "Rests on an assumed fact." : null,
  ];
  const className = [
    "pf",
    selected ? "pf--on" : "",
    recheck ? "pf--recheck" : "",
    flip ? "pf--flip" : "",
    ping === true ? "pf--ping" : ping === false ? "pf--dim" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={className}
      aria-pressed={selected}
      aria-label={words.filter(Boolean).join(" ")}
      onClick={(e) => onOpen(item.code, e.currentTarget)}
      onMouseEnter={() => onEnter(item.code)}
      onMouseLeave={onLeave}
      onFocus={() => onEnter(item.code)}
      onBlur={onLeave}
    >
      <span className="pf-v">
        {value}
        {low ? <span className="pf-dot" aria-hidden="true" /> : null}
      </span>
      {/* The code (A-1) stays in the fact's panel; the rail shows the name. */}
      <span className="pf-l">{item.label}</span>
      {share === undefined ? null : (
        <span className="pf-sh" aria-hidden="true">
          <span className="pf-shb">
            <i style={{ width: `${Math.min(100, share * 100)}%` }} />
          </span>
          <span className="pf-sht num">{coarsePercent(share)}</span>
        </span>
      )}
    </button>
  );
}

export type FactsProps = {
  items: Criterion[];
  /** Each fact's share of the range, by code (factSpreadShares). */
  shares: ReadonlyMap<string, number>;
  selectedCode: string | null;
  recheck: readonly string[];
  flip: readonly string[];
  ping: Ping;
  onOpen: (code: string, el: HTMLElement | null) => void;
  onEnter: (code: string) => void;
  onLeave: () => void;
};

function factList(items: Criterion[], props: FactsProps, withShare: boolean) {
  return items.map((item) => (
    <Fact
      key={item.id}
      item={item}
      selected={props.selectedCode === item.code}
      share={withShare ? props.shares.get(item.code) ?? 0 : undefined}
      recheck={props.recheck.includes(item.code)}
      flip={props.flip.includes(item.code)}
      ping={pinged(item, props.ping)}
      onOpen={props.onOpen}
      onEnter={props.onEnter}
      onLeave={props.onLeave}
    />
  ));
}

/** Design and Engineering as the left rail: facts that price the range first, then one quiet list, then the Building View. */
export function CriteriaRail({ building, ...props }: FactsProps & { building?: ReactNode }) {
  const { pricing, idle } = factsByShare(props.items, props.shares);
  const note = lowCount(props.items);
  return (
    <aside className="pr" aria-label="Design and Engineering">
      <div className="ps-hd">
        <h2 title="Planning assumptions worked out from the project's facts. Nobody has designed or engineered the building.">
          Design and Engineering
        </h2>
        {note ? (
          <span className="ps-note">
            <span className="pf-dot" aria-hidden="true" />
            {note}
          </span>
        ) : null}
      </div>
      <div className="pr-list">{factList(pricing, props, true)}</div>
      {idle.length > 0 ? (
        <>
          <p className="pr-sub pr-sub--q">Price no line in this budget</p>
          <div className="pr-list pr-list--q">{factList(idle, props, false)}</div>
        </>
      ) : null}
      {building ? <div className="pr-bld">{building}</div> : null}
    </aside>
  );
}

/** On a phone, the same facts as one swipe row in the band, biggest share first. */
export function FactsRow(props: FactsProps) {
  if (props.items.length === 0) return null;
  const { pricing, idle } = factsByShare(props.items, props.shares);
  const note = lowCount(props.items);
  return (
    <div className="pb" role="group" aria-label="Design and Engineering">
      <span className="pb-hd">
        Design and Engineering
        {note ? (
          <span className="pb-note">
            <span className="pf-dot" aria-hidden="true" />
            {note}
          </span>
        ) : null}
      </span>
      <div className="pb-row">
        {factList(pricing, props, true)}
        {factList(idle, props, false)}
      </div>
    </div>
  );
}
