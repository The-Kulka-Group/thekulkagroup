"use client";

import { useEffect, useState, type CSSProperties } from "react";

import { titleCase } from "@/lib/format/title-case";

import { shortMoney } from "./block-layout";
import { itemsLabel, notPricedLabel, packageCard, type FieldEntry } from "./field-order";
import type { FieldLink } from "./ShareBar";
import { SpringMoney } from "./SpringMoney";

// LA-1181 (replaces LA-1177 and LA-1178, includes LA-1175). By Package shows
// one card per buyout package, the same size as a By Scope block: its name,
// its total, and a strip with one segment per priced item sized by its figure
// and an orange dot per unpriced item. Hovering a segment names that item in
// the card's own line; clicking the card selects it. A card with nothing
// priced reads "No Rate Yet" and wears a dashed border. The same card serves
// the saved ROM and the New budget preview.

/** Cost codes whose orange dot has already pulsed once in this page's life. */
const pulsed = new Set<string>();

/**
 * The orange "no rate yet" dot. It pulses once the first time a given item's
 * dot appears, and never again, even when its card re-mounts under another
 * view.
 */
export function UnpricedDot({ pulseKey }: { pulseKey?: string }) {
  const [pulse] = useState(() => pulseKey !== undefined && !pulsed.has(pulseKey));
  useEffect(() => {
    if (pulseKey !== undefined) pulsed.add(pulseKey);
  }, [pulseKey]);
  return <span className={`rb-dot rb-dot--working${pulse ? " pk-pulse" : ""}`} aria-hidden="true" />;
}

export function PackageCard({
  entry,
  selected,
  waiting = false,
  rollDelay = 0,
  link,
  onSelect,
  register,
}: {
  entry: Extract<FieldEntry, { kind: "package" }>;
  selected: boolean;
  /** New budget before the gross area: the card stands, its figures wait. */
  waiting?: boolean;
  /** When the figure starts counting and the strip starts growing, in ms. */
  rollDelay?: number;
  link: FieldLink;
  onSelect: (key: string, el: HTMLElement) => void;
  register?: (el: HTMLElement | null) => void;
}) {
  const card = packageCard(entry.group);
  const hotSegment = card.segments.find((segment) => segment.costCode === link.item);
  const hot = hotSegment ?? card.dots.find((dot) => dot.costCode === link.item);
  const hotValue = hotSegment ? hotSegment.value : null;
  const figure = card.noRate ? "No Rate Yet" : shortMoney(entry.midpoint);

  return (
    <button
      ref={register}
      type="button"
      className={`rb-blk pk-card${card.noRate ? " pk-card--none" : ""}${selected ? " rb-blk--sel" : ""}${waiting ? " lb-blk--wait" : ""}`}
      aria-pressed={selected}
      aria-label={waiting ? titleCase(entry.label) : `${titleCase(entry.label)}, ${figure}, ${itemsLabel(card.itemCount)}`}
      onClick={(e) => onSelect(entry.key, e.currentTarget)}
      onMouseEnter={() => link.onEnter(entry.key)}
      onMouseLeave={link.onLeave}
      onFocus={() => link.onEnter(entry.key)}
      onBlur={link.onLeave}
    >
      <span className="pk-top">
        <span className="rb-bn">{titleCase(entry.label)}</span>
        {entry.division ? <span className="pk-div">{titleCase(entry.division)}</span> : null}
      </span>
      {card.noRate ? (
        <span className="rb-st pk-none">
          <UnpricedDot pulseKey={entry.key} />
          No Rate Yet
        </span>
      ) : (
        <SpringMoney className="rb-bv num pk-tot" value={waiting ? null : entry.midpoint} format={shortMoney} delay={rollDelay} />
      )}
      <span
        className={`pk-strip${hot ? " pk-strip--hot" : ""}`}
        aria-hidden="true"
        onMouseLeave={() => link.onItem(null)}
      >
        {waiting
          ? null
          : card.segments.map((segment, index) => (
              <span
                key={segment.costCode}
                className={`pk-seg${hot?.costCode === segment.costCode ? " pk-seg--hot" : ""}`}
                style={{ flexGrow: segment.value, "--pk-d": `${rollDelay + index * 90}ms` } as CSSProperties}
                onMouseEnter={() => link.onItem(segment.costCode)}
              >
                <i />
              </span>
            ))}
        {card.dots.map((dot) => (
          <span
            key={dot.costCode}
            className={`pk-dotw${hot?.costCode === dot.costCode ? " pk-seg--hot" : ""}`}
            onMouseEnter={() => link.onItem(dot.costCode)}
          >
            <UnpricedDot pulseKey={dot.costCode} />
          </span>
        ))}
      </span>
      <span className="pk-line">
        {hot && !waiting ? (
          <>
            <span className="pk-ln">{titleCase(hot.label)}</span>
            <span className="num pk-lv">{hotValue === null ? "No Rate Yet" : shortMoney(hotValue)}</span>
          </>
        ) : (
          <>
            <span>{itemsLabel(card.itemCount)}</span>
            {card.unpricedCount > 0 && !card.noRate ? (
              <span className="pk-np">
                <UnpricedDot />
                {notPricedLabel(card.unpricedCount)}
              </span>
            ) : null}
          </>
        )}
      </span>
    </button>
  );
}

const DOLLARS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/**
 * The side panel for a selected package card: its total, then one row per
 * item in the strip's own order. A supporting item says which driver brought
 * it in ("From Structure Demolition"), read off the ROM. Hovering a row
 * lights its strip segment on the card, and hovering a segment lights the
 * row. A priced row opens that line's own detail.
 */
export function PackagePanel({
  entry,
  link,
  onOpenLine,
}: {
  entry: Extract<FieldEntry, { kind: "package" }>;
  link: FieldLink;
  onOpenLine: (costCode: string) => void;
}) {
  const card = packageCard(entry.group);
  return (
    <>
      <div className="rb-pbig">
        <span className="num">{card.noRate ? "No Rate Yet" : DOLLARS.format(entry.midpoint)}</span>
        <span>{itemsLabel(card.itemCount)}</span>
      </div>
      <div className="pk-rows" onMouseLeave={() => link.onItem(null)}>
        {card.segments.map((segment) => (
          <button
            key={segment.costCode}
            type="button"
            className={`rb-orow pk-row${link.item === segment.costCode ? " pk-row--hot" : ""}`}
            onMouseEnter={() => link.onItem(segment.costCode)}
            onFocus={() => link.onItem(segment.costCode)}
            onBlur={() => link.onItem(null)}
            onClick={() => onOpenLine(segment.costCode)}
          >
            <span className="rb-row">
              <span className="rb-rn">{titleCase(segment.label)}</span>
              <span className="rb-ra num">{DOLLARS.format(segment.value)}</span>
              {segment.driverLabel ? <span className="rb-rs">From {titleCase(segment.driverLabel)}</span> : null}
            </span>
          </button>
        ))}
        {card.dots.map((dot) => (
          <div
            key={dot.costCode}
            className={`pk-row${link.item === dot.costCode ? " pk-row--hot" : ""}`}
            onMouseEnter={() => link.onItem(dot.costCode)}
          >
            <span className="rb-row">
              <span className="rb-rn">{titleCase(dot.label)}</span>
              <span className="rb-ra pk-rnone">
                <UnpricedDot />
                No Rate Yet
              </span>
              {dot.driverLabel ? <span className="rb-rs">From {titleCase(dot.driverLabel)}</span> : null}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}
