"use client";

import { useState } from "react";

import type { Rom } from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";

import { perSquareFoot, shortMoney } from "./block-layout";
import type { BarModel } from "./field-order";
import { markupRows, type Ledger, type LedgerItem, type LedgerRow, type Source } from "./ledger";

// LA-1254. The schedule-of-values layout (ledger.ts builds the rows): one row
// per trade with its division, amount, $/SF, share of the total and source.
// A group row (an element, or a division under By Division) folds its items
// open and shut; an item row opens the same side panel a card does.

const PER_SF = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

function percent(amount: number, total: number): string {
  if (total <= 0) return "";
  const share = amount / total;
  if (share > 0 && share < 0.001) return "<0.1%";
  return `${(share * 100).toFixed(1)}%`;
}

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
}: {
  rom: Rom;
  ledger: Ledger;
  bar: BarModel;
  grossSquareFeet: number | null;
  selected: string | null;
  onOpen: (costCode: string, el: HTMLElement) => void;
}) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());
  const total = bar.parts.reduce((sum, part) => sum + Math.max(0, part.value), 0);
  const trade = bar.parts.find((part) => part.key === "trade")?.value ?? 0;
  const owner = bar.parts.find((part) => part.key === "owner")?.value ?? 0;
  const biggest = Math.max(1, ...ledger.trade.map((row) => (row.kind === "group" ? row.amount : row.amount ?? 0)));

  const perSf = (amount: number) => {
    const value = perSquareFoot(amount, grossSquareFeet);
    return value === null ? "" : PER_SF.format(value);
  };

  const toggle = (key: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const itemRow = (item: LedgerItem, child: boolean) => (
    <button
      key={item.key}
      type="button"
      className={`lg-row lg-item${child ? " lg-child" : ""}${selected === item.costCode ? " lg-row--sel" : ""}`}
      onClick={(e) => onOpen(item.costCode, e.currentTarget)}
    >
      <span className="lg-div num">{child ? "" : item.division ?? ""}</span>
      <span className="lg-name">{titleCase(item.label)}</span>
      <span className="lg-amt num">{item.amount === null ? "No Rate Yet" : shortMoney(item.amount)}</span>
      <span className="lg-psf num">{item.amount === null ? "" : perSf(item.amount)}</span>
      <span className="lg-pct num">{item.amount === null ? "" : percent(item.amount, total)}</span>
      <span className="lg-bar" aria-hidden="true">
        {child || item.amount === null ? null : <i style={{ width: `${(item.amount / biggest) * 100}%` }} />}
      </span>
      <SourceCell source={item.source} />
    </button>
  );

  const row = (entry: LedgerRow) => {
    if (entry.kind === "item") return itemRow(entry, false);
    const open = !closed.has(entry.key);
    return (
      <div key={entry.key} className="lg-grp">
        <button type="button" className="lg-row lg-head" aria-expanded={open} onClick={() => toggle(entry.key)}>
          <span className="lg-div num">{entry.key.startsWith("division:") ? "" : entry.division ?? ""}</span>
          <span className="lg-name">
            <svg className={`lg-chev${open ? " lg-chev--open" : ""}`} viewBox="0 0 12 12" aria-hidden="true">
              <path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {titleCase(entry.label)}
          </span>
          <span className="lg-amt num">{entry.amount > 0 ? shortMoney(entry.amount) : "No Rate Yet"}</span>
          <span className="lg-psf num">{entry.amount > 0 ? perSf(entry.amount) : ""}</span>
          <span className="lg-pct num">{entry.amount > 0 ? percent(entry.amount, total) : ""}</span>
          <span className="lg-bar" aria-hidden="true">
            {entry.amount > 0 ? <i style={{ width: `${(entry.amount / biggest) * 100}%` }} /> : null}
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
        {open ? entry.items.map((item) => itemRow(item, true)) : null}
      </div>
    );
  };

  const sumRow = (key: string, label: string, amount: number, strong = false) => (
    <div key={key} className={`lg-row lg-sum${strong ? " lg-sum--total" : ""}`}>
      <span className="lg-div" />
      <span className="lg-name">{label}</span>
      <span className="lg-amt num">{shortMoney(amount)}</span>
      <span className="lg-psf num">{perSf(amount)}</span>
      <span className="lg-pct num">{strong ? "" : percent(amount, total)}</span>
      <span className="lg-bar" />
      <span className="lg-src" />
    </div>
  );

  return (
    <div className="lg" role="table" aria-label="Schedule of Values">
      <div className="lg-row lg-cols" role="row">
        <span className="lg-div">Div</span>
        <span className="lg-name">Item</span>
        <span className="lg-amt">Amount</span>
        <span className="lg-psf">$/SF</span>
        <span className="lg-pct">%</span>
        <span className="lg-bar">Share</span>
        <span className="lg-src">Source</span>
      </div>
      {ledger.trade.map(row)}
      {sumRow("trade", "Trade Cost", trade, false)}
      {markupRows(rom).map((markup) => sumRow(markup.key, markup.label, markup.amount))}
      {ledger.ownerDirect.length > 0 ? (
        <>
          <div className="lg-row lg-cap">
            <span className="lg-div" />
            <span className="lg-name">Bought by the Owner Direct</span>
          </div>
          {ledger.ownerDirect.map(row)}
          {sumRow("owner", "Owner Direct", owner)}
        </>
      ) : null}
      {sumRow("total", "Total", total, true)}
    </div>
  );
}
