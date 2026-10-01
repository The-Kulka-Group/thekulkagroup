"use client";

import { Fragment, useState } from "react";

import type { Rom } from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";

import { perSquareFoot, tradeBlocks } from "./block-layout";
import type { BarModel } from "./field-order";
import { markupRows, type Ledger, type LedgerItem, type LedgerRow, type Source } from "./ledger";
import { coarseMoney, coarsePercent, coarsePerSf, initiallyFolded, widestRangeFirst } from "./ledger-rail-model";

// LA-1254. The schedule-of-values layout (ledger.ts builds the rows): one row
// per trade with its division, amount, $/SF, share of the total, range and
// source. A group row (an element, or a division under By Division) folds its
// items open and shut; an item row opens the same side panel a card does.
// LA-1384: numbers round to the confidence a conceptual budget has, every row
// carries its range on one scale from $0, and small groups start folded.

function SourceCell({ source }: { source: Source }) {
  return (
    <span className="lg-src">
      <span className={`lg-dot lg-dot--${source.tone}`} aria-hidden="true" />
      {source.text}
    </span>
  );
}

export function LedgerView({
  rom,
  ledger,
  bar,
  grossSquareFeet,
  selected,
  onOpen,
  mark = null,
  bySpread,
}: {
  rom: Rom;
  ledger: Ledger;
  bar: BarModel;
  grossSquareFeet: number | null;
  selected: string | null;
  onOpen: (costCode: string, el: HTMLElement) => void;
  /** The criterion hovered or open, and the items it prices, lit like the cards light. */
  mark?: { code: string; costCodes: Set<string> } | null;
  /** Widest Range First: rows with the widest range lead, groups and their items alike. */
  bySpread: boolean;
}) {
  const total = bar.parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  const trade = bar.parts.find((part) => part.key === "trade")?.value ?? 0;
  const owner = bar.parts.find((part) => part.key === "owner")?.value ?? 0;
  // A group under 5% of the total starts folded, so the first screen goes to
  // the trades that carry the budget.
  const [closed, setClosed] = useState<Set<string>>(() => initiallyFolded([...ledger.trade, ...ledger.ownerDirect], total));

  const perSf = (amount: number) => {
    const value = perSquareFoot(amount, grossSquareFeet);
    return value === null ? "" : coarsePerSf(value);
  };
  const money = coarseMoney;
  const pct = (amount: number, whole: number) => (whole > 0 ? coarsePercent(amount / whole) : "");

  // Each row's low and high, from the run's own lines.
  const spans = new Map(tradeBlocks(rom).map((block) => [block.costCode, { low: block.low, high: block.high }]));
  const spanOfItems = (items: readonly LedgerItem[]) =>
    items.reduce(
      (acc, item) => {
        const one = spans.get(item.costCode);
        return one ? { low: acc.low + one.low, high: acc.high + one.high } : acc;
      },
      { low: 0, high: 0 },
    );
  const spanOf = (entry: LedgerRow | LedgerItem) =>
    "items" in entry ? spanOfItems(entry.items) : spans.get(entry.costCode) ?? { low: 0, high: 0 };
  const scale = Math.max(1, ...[...ledger.trade, ...ledger.ownerDirect].map((entry) => spanOf(entry).high)) * 1.04;
  const rangeMark = (span: { low: number; high: number }) => {
    if (span.high <= 0) return null;
    const left = (span.low / scale) * 100;
    const width = Math.max(0.6, ((span.high - span.low) / scale) * 100);
    const mid = ((span.low + span.high) / 2 / scale) * 100;
    return (
      <>
        <i className="lg-rb" style={{ left: `${left}%`, width: `${width}%` }} />
        <b className="lg-rm" style={{ left: `${mid}%` }} />
      </>
    );
  };
  const ordered = <T extends LedgerRow | LedgerItem>(rows: readonly T[]): readonly T[] => (bySpread ? widestRangeFirst(rows, spanOf) : rows);

  const toggle = (key: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const lit = (costCode: string) => mark?.costCodes.has(costCode) ?? false;
  const anyLit =
    mark !== null &&
    [...ledger.trade, ...ledger.ownerDirect].some((entry) =>
      entry.kind === "item" ? lit(entry.costCode) : entry.items.some((item) => lit(item.costCode)),
    );
  const markTag = mark ? <span className="lg-mark num">{mark.code}</span> : null;

  const itemRow = (item: LedgerItem, child: boolean) => (
    <button
      key={item.key}
      type="button"
      className={`lg-row lg-item${child ? " lg-child" : ""}${selected === item.costCode ? " lg-row--sel" : ""}`}
      data-lg-lit={lit(item.costCode) ? "" : undefined}
      onClick={(e) => onOpen(item.costCode, e.currentTarget)}
    >
      <span className="lg-div num">{child ? "" : item.division ?? ""}</span>
      <span className="lg-name">
        {titleCase(item.label)}
        {lit(item.costCode) ? markTag : null}
      </span>
      <span className="lg-amt num">{item.amount === null ? "No Rate Yet" : money(item.amount)}</span>
      <span className="lg-psf num">{item.amount === null ? "" : perSf(item.amount)}</span>
      <span className="lg-pct num">{item.amount === null ? "" : pct(item.amount, total)}</span>
      <span
        className={`lg-bar lg-rng${child ? " lg-rng--child" : ""}`}
        title={item.amount === null ? undefined : `Range ${coarseMoney(spanOf(item).low)} to ${coarseMoney(spanOf(item).high)}`}
        aria-hidden="true"
      >
        {item.amount === null ? null : rangeMark(spanOf(item))}
      </span>
      <SourceCell source={item.source} />
    </button>
  );

  const row = (entry: LedgerRow) => {
    if (entry.kind === "item") return itemRow(entry, false);
    const open = !closed.has(entry.key);
    return (
      <div key={entry.key} className="lg-grp">
        <button
          type="button"
          className="lg-row lg-head"
          aria-expanded={open}
          data-lg-lit={entry.items.some((item) => lit(item.costCode)) ? "" : undefined}
          onClick={() => toggle(entry.key)}
        >
          <span className="lg-div num">{entry.key.startsWith("division:") ? "" : entry.division ?? ""}</span>
          <span className="lg-name">
            <svg className={`lg-chev${open ? " lg-chev--open" : ""}`} viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {titleCase(entry.label)}
          </span>
          <span className="lg-amt num">{entry.amount > 0 ? money(entry.amount) : "No Rate Yet"}</span>
          <span className="lg-psf num">{entry.amount > 0 ? perSf(entry.amount) : ""}</span>
          <span className="lg-pct num">{entry.amount > 0 ? pct(entry.amount, total) : ""}</span>
          <span
            className="lg-bar lg-rng"
            title={entry.amount > 0 ? `Range ${coarseMoney(spanOf(entry).low)} to ${coarseMoney(spanOf(entry).high)}` : undefined}
            aria-hidden="true"
          >
            {entry.amount > 0 ? rangeMark(spanOf(entry)) : null}
          </span>
          <span className="lg-src">
            {entry.unpricedCount > 0 ? (
              <>
                <span className="lg-dot lg-dot--none" aria-hidden="true" />
                {entry.unpricedCount === 1 ? "1 Item Not Priced" : `${entry.unpricedCount} Items Not Priced`}
              </>
            ) : (
              `${entry.items.length} ${entry.items.length === 1 ? "Item" : "Items"}`
            )}
          </span>
        </button>
        {open ? ordered(entry.items).map((item) => itemRow(item, true)) : null}
      </div>
    );
  };

  const sumRow = (key: string, label: string, amount: number, strong = false) => (
    <div key={key} className={`lg-row lg-sum${strong ? " lg-sum--total" : ""}`}>
      <span className="lg-div" />
      <span className="lg-name">{label}</span>
      <span className="lg-amt num">{money(amount)}</span>
      <span className="lg-psf num">{perSf(amount)}</span>
      <span className="lg-pct num">{strong ? "" : pct(amount, total)}</span>
      <span className="lg-bar" />
      <span className="lg-src" />
    </div>
  );

  // LA-1398: an Allocated Resources plan's lines, under the markup row they price.
  const planRow = (key: string, label: string, amount: number) => (
    <div key={key} className="lg-row lg-sum lg-child lg-plan">
      <span className="lg-div" />
      <span className="lg-name">{titleCase(label)}</span>
      <span className="lg-amt num">{money(amount)}</span>
      <span className="lg-psf num">{perSf(amount)}</span>
      <span className="lg-pct num">{pct(amount, total)}</span>
      <span className="lg-bar" />
      <span className="lg-src" />
    </div>
  );

  return (
    <div className={`lg${anyLit ? " lg--hl" : ""}`} role="table" aria-label="Schedule of Values">
      <div className="lg-row lg-cols" role="row">
        <span className="lg-div">Div</span>
        <span className="lg-name">Item</span>
        <span className="lg-amt">Amount</span>
        <span className="lg-psf">$/SF</span>
        <span className="lg-pct">%</span>
        <span className="lg-bar">Range, From $0</span>
        <span className="lg-src">Source</span>
      </div>
      {ordered(ledger.trade).map(row)}
      {sumRow("trade", "Trade Cost", trade, false)}
      {markupRows(rom).map((markup) => (
        <Fragment key={markup.key}>
          {sumRow(markup.key, markup.label, markup.amount)}
          {markup.lines?.map((line) => planRow(line.key, line.label, line.amount))}
        </Fragment>
      ))}
      {ledger.ownerDirect.length > 0 ? (
        <>
          <div className="lg-row lg-cap">
            <span className="lg-div" />
            <span className="lg-name">Bought by the Owner Direct</span>
          </div>
          {ordered(ledger.ownerDirect).map(row)}
          {sumRow("owner", "Owner Direct", owner)}
        </>
      ) : null}
      {sumRow("total", "Total", total, true)}
    </div>
  );
}
