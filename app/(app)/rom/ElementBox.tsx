"use client";

import { titleCase } from "@/lib/format/title-case";

import { midpoint, shortMoney } from "./block-layout";
import type { ElementGroup, ElementItem } from "./element-groups";
import { elementHasNoRate } from "./field-order";
import { UnpricedDot } from "./PackageCard";
import type { FieldLink } from "./ShareBar";
import { SpringMoney } from "./SpringMoney";

// LA-1158, ADR 0006. "On the ROM screen an element is the parent box: it
// shows the sum of its items, with the driver as a full-width tile and each
// supporting item as its own tile inside it" (CONTEXT.md: Element).
//
// Two renderings share this file:
//   - ElementBoxBlock, the saved ROM (RomRunner.tsx): a static box, every
//     tile its own button that opens the item in the side panel.
//   - LiveElementBox, the New budget preview (LiveBudget.tsx): tiles spring
//     their own figure and register with the field's FLIP tracking, the same
//     as a lone trade block, so the box moves and enters the same way.
//
// LA-1181: By Package now draws one card per package (PackageCard.tsx), so
// the package box LA-1159 kept here is gone. An element box whose items are
// all unpriced reads "No Rate Yet" with a dashed border (LA-1175), and
// hovering a box previews its share in the header's markup bar.

function itemsNotPricedLabel(count: number): string {
  return count === 1 ? "1 Item Not Priced" : `${count} Items Not Priced`;
}

function itemMidpoint(item: Extract<ElementItem, { kind: "priced" }>): number {
  return midpoint({ low: item.line.low, high: item.line.high });
}

/* --- The saved ROM: a static box, each tile a button -------------------- */

export function ElementBoxBlock({
  group,
  selected,
  onOpen,
  register,
  entryKey,
  link,
}: {
  group: ElementGroup;
  selected: string | null;
  onOpen: (costCode: string, el: HTMLElement) => void;
  /** LA-1159: the box's own root node, for the field's FLIP tracker. */
  register?: (el: HTMLElement | null) => void;
  /** LA-1181: the key the header's markup bar knows this box by. */
  entryKey?: string;
  link?: FieldLink;
}) {
  const mid = midpoint(group.total);
  const noRate = elementHasNoRate(group);
  const key = entryKey ?? `element:${group.element}`;
  return (
    <div
      ref={register}
      className={`rb-blk eb-box${noRate ? " pk-card--none" : ""}`}
      aria-label={`${titleCase(group.element)}, ${noRate ? "No Rate Yet" : shortMoney(mid)}`}
      onMouseEnter={link ? () => link.onEnter(key) : undefined}
      onMouseLeave={link?.onLeave}
    >
      <div className="eb-head">
        <span className="rb-bn">{titleCase(group.element)}</span>
        {noRate ? (
          <NoRateYet pulseKey={key} />
        ) : (
          <SpringMoney className="rb-bv num eb-hv" value={mid} format={shortMoney} />
        )}
      </div>
      <span className="rb-bar eb-hbar" aria-hidden="true">
        <i style={{ transform: `scaleX(${noRate ? 0 : 1})` }} />
      </span>
      {group.unpricedCount > 0 && !noRate ? (
        <span className="eb-unpriced">
          <UnpricedDot />
          {itemsNotPricedLabel(group.unpricedCount)}
        </span>
      ) : null}
      <div className="eb-tiles">
        <StaticTile item={group.driver} full selected={selected} onOpen={onOpen} />
        {group.members.map((item) => (
          <StaticTile key={item.costCode} item={item} selected={selected} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

/** LA-1175: the header of an element box with nothing priced inside it. */
function NoRateYet({ pulseKey }: { pulseKey: string }) {
  return (
    <span className="rb-st pk-none">
      <UnpricedDot pulseKey={pulseKey} />
      No Rate Yet
    </span>
  );
}

function StaticTile({
  item,
  full = false,
  selected,
  onOpen,
}: {
  item: ElementItem;
  full?: boolean;
  selected: string | null;
  onOpen: (costCode: string, el: HTMLElement) => void;
}) {
  if (item.kind === "unpriced") {
    const body = (
      <>
        <span className="eb-tn">{titleCase(item.label)}</span>
        <span className="eb-ts">
          <UnpricedDot pulseKey={item.costCode} />
          No Rate Yet
        </span>
      </>
    );
    // A supporting item takes a rate on its card (RatePanel.tsx), so it is a
    // button. Anything else with no rate stays a plain tile.
    if (item.item.driverCostCode) {
      const selectedHere = selected === item.costCode;
      return (
        <button
          type="button"
          className={`eb-tile eb-tile--unpriced${full ? " eb-tile--full" : ""}${selectedHere ? " eb-tile--sel" : ""}`}
          aria-pressed={selectedHere}
          aria-label={`${titleCase(item.label)}, No Rate Yet. Enter a rate.`}
          onClick={(e) => onOpen(item.costCode, e.currentTarget)}
        >
          {body}
        </button>
      );
    }
    return (
      <div
        className={`eb-tile eb-tile--unpriced${full ? " eb-tile--full" : ""}`}
        aria-label={`${titleCase(item.label)}, No Rate Yet`}
      >
        {body}
      </div>
    );
  }
  const selectedHere = selected === item.costCode;
  return (
    <button
      type="button"
      className={`eb-tile${full ? " eb-tile--full" : ""}${selectedHere ? " eb-tile--sel" : ""}`}
      aria-pressed={selectedHere}
      aria-label={`${titleCase(item.label)}, ${shortMoney(itemMidpoint(item))}`}
      onClick={(e) => onOpen(item.costCode, e.currentTarget)}
    >
      <span className="eb-tn">{titleCase(item.label)}</span>
      <span className="eb-tv num">{shortMoney(itemMidpoint(item))}</span>
    </button>
  );
}

/* --- The New budget preview: springs its figures, registers with FLIP --- */

export function LiveElementBox({
  group,
  waiting,
  rollDelay,
  register,
  link,
}: {
  group: ElementGroup;
  waiting: boolean;
  /** When the box itself lands, same units as a lone block's roll delay. */
  rollDelay: number;
  register: (key: string) => (el: HTMLElement | null) => void;
  link: FieldLink;
}) {
  const mid = midpoint(group.total);
  const key = `element:${group.element}`;
  const noRate = elementHasNoRate(group);
  // The header counts up last, once every tile under it has had its turn.
  const headDelay = rollDelay + (1 + group.members.length) * 70;

  return (
    <div
      ref={register(key)}
      className={`rb-blk lb-blk eb-box${waiting ? " lb-blk--wait" : ""}${noRate ? " pk-card--none" : ""}`}
      aria-label={waiting ? titleCase(group.element) : `${titleCase(group.element)}, ${noRate ? "No Rate Yet" : shortMoney(mid)}`}
      onMouseEnter={() => link.onEnter(key)}
      onMouseLeave={link.onLeave}
    >
      <div className="eb-head">
        <span className="rb-bn">{titleCase(group.element)}</span>
        {noRate ? (
          <NoRateYet pulseKey={key} />
        ) : (
          <SpringMoney
            className="rb-bv num eb-hv"
            value={waiting ? null : mid}
            format={shortMoney}
            delay={headDelay}
          />
        )}
      </div>
      <span className="rb-bar eb-hbar" aria-hidden="true">
        <i style={{ transform: `scaleX(${waiting || noRate ? 0 : 1})` }} />
      </span>
      {!waiting && !noRate && group.unpricedCount > 0 ? (
        <span className="eb-unpriced">
          <UnpricedDot />
          {itemsNotPricedLabel(group.unpricedCount)}
        </span>
      ) : null}
      <div className="eb-tiles">
        {/* The driver first, so it always lands ahead of what it brought in. */}
        <LiveTile
          item={group.driver}
          full
          waiting={waiting}
          delay={rollDelay}
          register={register(group.driver.costCode)}
        />
        {group.members.map((item, index) => (
          <LiveTile
            key={item.costCode}
            item={item}
            waiting={waiting}
            delay={rollDelay + 70 * (index + 1)}
            register={register(item.costCode)}
          />
        ))}
      </div>
    </div>
  );
}

function LiveTile({
  item,
  full = false,
  waiting,
  delay,
  register,
}: {
  item: ElementItem;
  full?: boolean;
  waiting: boolean;
  delay: number;
  register: (el: HTMLElement | null) => void;
}) {
  if (item.kind === "unpriced") {
    return (
      <div
        ref={register}
        className={`eb-tile eb-tile--unpriced${full ? " eb-tile--full" : ""}`}
        aria-label={`${titleCase(item.label)}, No Rate Yet`}
      >
        <span className="eb-tn">{titleCase(item.label)}</span>
        <span className="eb-ts">
          <UnpricedDot pulseKey={item.costCode} />
          No Rate Yet
        </span>
      </div>
    );
  }
  return (
    <div
      ref={register}
      className={`eb-tile${full ? " eb-tile--full" : ""}${waiting ? " eb-tile--wait" : ""}`}
      aria-label={waiting ? titleCase(item.label) : `${titleCase(item.label)}, ${shortMoney(itemMidpoint(item))}`}
    >
      <span className="eb-tn">{titleCase(item.label)}</span>
      <SpringMoney className="eb-tv num" value={waiting ? null : itemMidpoint(item)} format={shortMoney} delay={delay} />
    </div>
  );
}
