"use client";

import { midpoint, shortMoney } from "./block-layout";
import type { ElementGroup, ElementItem } from "./element-groups";
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
}: {
  group: ElementGroup;
  selected: string | null;
  onOpen: (costCode: string, el: HTMLElement) => void;
}) {
  const mid = midpoint(group.total);
  return (
    <div className="rb-blk eb-box" aria-label={`${group.element}, ${shortMoney(mid)}`}>
      <div className="eb-head">
        <span className="rb-bn">{group.element}</span>
        <span className="rb-bv num eb-hv">{shortMoney(mid)}</span>
      </div>
      <span className="rb-bar eb-hbar" aria-hidden="true">
        <i style={{ transform: "scaleX(1)" }} />
      </span>
      {group.unpricedCount > 0 ? (
        <span className="eb-unpriced">
          <span className="rb-dot rb-dot--working" aria-hidden="true" />
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
    return (
      <div
        className={`eb-tile eb-tile--unpriced${full ? " eb-tile--full" : ""}`}
        aria-label={`${item.label}, No Rate Yet`}
      >
        <span className="eb-tn">{item.label}</span>
        <span className="eb-ts">
          <span className="rb-dot rb-dot--working" aria-hidden="true" />
          No Rate Yet
        </span>
      </div>
    );
  }
  const selectedHere = selected === item.costCode;
  return (
    <button
      type="button"
      className={`eb-tile${full ? " eb-tile--full" : ""}${selectedHere ? " eb-tile--sel" : ""}`}
      aria-pressed={selectedHere}
      aria-label={`${item.label}, ${shortMoney(itemMidpoint(item))}`}
      onClick={(e) => onOpen(item.costCode, e.currentTarget)}
    >
      <span className="eb-tn">{item.label}</span>
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
}: {
  group: ElementGroup;
  waiting: boolean;
  /** When the box itself lands, same units as a lone block's roll delay. */
  rollDelay: number;
  register: (key: string) => (el: HTMLElement | null) => void;
}) {
  const mid = midpoint(group.total);
  // The header counts up last, once every tile under it has had its turn.
  const headDelay = rollDelay + (1 + group.members.length) * 70;

  return (
    <div
      ref={register(`element:${group.element}`)}
      className={`rb-blk lb-blk eb-box${waiting ? " lb-blk--wait" : ""}`}
      aria-label={waiting ? group.element : `${group.element}, ${shortMoney(mid)}`}
    >
      <div className="eb-head">
        <span className="rb-bn">{group.element}</span>
        <SpringMoney
          className="rb-bv num eb-hv"
          value={waiting ? null : mid}
          format={shortMoney}
          delay={headDelay}
        />
      </div>
      <span className="rb-bar eb-hbar" aria-hidden="true">
        <i style={{ transform: `scaleX(${waiting ? 0 : 1})` }} />
      </span>
      {!waiting && group.unpricedCount > 0 ? (
        <span className="eb-unpriced">
          <span className="rb-dot rb-dot--working" aria-hidden="true" />
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
        aria-label={`${item.label}, No Rate Yet`}
      >
        <span className="eb-tn">{item.label}</span>
        <span className="eb-ts">
          <span className="rb-dot rb-dot--working" aria-hidden="true" />
          No Rate Yet
        </span>
      </div>
    );
  }
  return (
    <div
      ref={register}
      className={`eb-tile${full ? " eb-tile--full" : ""}${waiting ? " eb-tile--wait" : ""}`}
      aria-label={waiting ? item.label : `${item.label}, ${shortMoney(itemMidpoint(item))}`}
    >
      <span className="eb-tn">{item.label}</span>
      <SpringMoney className="eb-tv num" value={waiting ? null : itemMidpoint(item)} format={shortMoney} delay={delay} />
    </div>
  );
}
