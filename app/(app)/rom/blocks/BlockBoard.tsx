"use client";

import { useMemo, useState } from "react";

import type { Block, BlockRange, BoardLevel, RunBoard } from "@/lib/rom/board";

import "./blocks.css";

// The board reads one run and never recomputes it. The three axes re-sort the
// same blocks, so nothing is stored three times: grouping only changes which
// key the blocks are bucketed under before they are drawn.

type Axis = "element" | "division" | "package";

const AXIS_LABEL: Record<Axis, string> = {
  element: "Element",
  division: "Division",
  package: "Package",
};

const LEVEL_NAME: Record<string, string> = {
  "1": "Level 1",
  "2": "Level 2",
  "3": "Level 3",
  "4": "Level 4",
  unclassified: "Unclassified",
};

const LEVEL_NOTE: Record<string, string> = {
  "1": "Area. Square feet.",
  "2": "Counts. Whole objects at building or unit scale.",
  "3": "Points inside a room, or a spec choice.",
  "4": "Material and labor. Below the threshold, never asked for.",
  unclassified: "Nobody has stated a level for these blocks yet.",
};

const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function range(value: BlockRange, format: Intl.NumberFormat = DOLLARS): string {
  return `${format.format(value.low)} to ${format.format(value.high)}`;
}

function levelKey(level: BoardLevel["level"]): string {
  return level === null ? "unclassified" : String(level);
}

export function BlockBoard({ board }: { board: RunBoard }) {
  const [axis, setAxis] = useState<Axis>("element");
  const [traced, setTraced] = useState<string | null>(null);

  const rows = useMemo(
    () => board.levels.filter((level) => level.blocks.length > 0),
    [board.levels],
  );
  const element = board.elements.find((one) => one.element === traced) ?? null;

  if (board.levels.every((level) => level.blocks.length === 0)) {
    return <p className="empty">This run produced no blocks, so the board is empty.</p>;
  }

  return (
    <div className="blocks">
      <div className="blocks-bar">
        <span className="t-label">Group by</span>
        <div className="blocks-axis" role="group" aria-label="Group blocks by">
          {(Object.keys(AXIS_LABEL) as Axis[]).map((one) => (
            <button
              key={one}
              type="button"
              aria-pressed={axis === one}
              onClick={() => setAxis(one)}
            >
              {AXIS_LABEL[one]}
            </button>
          ))}
        </div>
      </div>

      {board.elements.length > 0 ? (
        <div className="blocks-bar">
          <span className="t-label">Trace an element</span>
          <div className="blocks-elements">
            {board.elements.map((one) => (
              <button
                key={one.element}
                className="blocks-element"
                type="button"
                aria-pressed={traced === one.element}
                onClick={() => setTraced(traced === one.element ? null : one.element)}
              >
                {one.element}
                <span className="num">
                  {one.blockCount} {one.blockCount === 1 ? "block" : "blocks"}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="blocks-hint" aria-live="polite">
        {element
          ? `${element.element} is one fact reaching ${element.divisions.length === 1 ? "1 division" : `${element.divisions.length} divisions`} across ${element.blockCount} ${element.blockCount === 1 ? "block" : "blocks"}. It adds ${range(element.adds)}, and ${element.carvedOut.high > 0 ? `${range(element.carvedOut)} of it is carved out of a level 1 lump and adds nothing` : "nothing of it is carved out"}.`
          : "Pick an element to light every block that one fact pays for."}
      </p>

      <div className={`blocks-board${traced ? " blocks-board--traced" : ""}`}>
        {rows.map((level, index) => (
          <LevelRow
            key={levelKey(level.level)}
            level={level}
            axis={axis}
            traced={traced}
            order={index}
          />
        ))}
      </div>

      <div className="blocks-totals">
        <div className="blocks-total blocks-total--lead">
          <span className="t-label">Total project cost</span>
          <span className="num">{range(board.total)}</span>
          <span className="blocks-note">
            Kulka&rsquo;s contract plus whatever the owner buys direct. Carved-out blocks are
            not in it.
          </span>
        </div>
        <div className="blocks-total">
          <span className="t-label">Kulka&rsquo;s contract</span>
          <span className="num">{range(board.kulkaContractTotal)}</span>
          <span className="blocks-note">Owner-direct scope is out of this one.</span>
        </div>
        <div className="blocks-total">
          <span className="t-label">Carved out, not added</span>
          <span className="num">{range(board.carvedOut)}</span>
          <span className="blocks-note">
            Already inside a level 1 lump. Counting it again would count the scope twice.
          </span>
        </div>
      </div>
    </div>
  );
}

function LevelRow({
  level,
  axis,
  traced,
  order,
}: {
  level: BoardLevel;
  axis: Axis;
  traced: string | null;
  order: number;
}) {
  const key = levelKey(level.level);
  const groups = groupBlocks(level.blocks, axis);

  return (
    <section
      className="blocks-level"
      style={{ ["--reveal-order" as string]: order }}
      aria-label={LEVEL_NAME[key]}
    >
      <header className="blocks-level-head">
        <span className="blocks-level-badge">{level.level === null ? "?" : `L${level.level}`}</span>
        <span className="blocks-level-name">{LEVEL_NAME[key]}</span>
        <span className="blocks-level-note">{LEVEL_NOTE[key]}</span>
      </header>

      <div className={`blocks-level-body${axis === "element" ? "" : " blocks-level-body--packed"}`}>
        {groups.map((group) => (
          <div className="blocks-group" key={group.key}>
            <h3 className="t-label">{group.label}</h3>
            <div className="blocks-row">
              {group.blocks.map((block) => (
                <BlockCard key={block.costCode} block={block} axis={axis} traced={traced} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="blocks-level-sum">
        <span className="t-label">Adds to total</span>
        <span className="num">{range(level.adds, COMPACT)}</span>
        {level.carvedOut.high > 0 ? (
          <>
            <span className="t-label">Carved out</span>
            <span className="num blocks-level-sum-carved">{range(level.carvedOut, COMPACT)}</span>
          </>
        ) : null}
      </div>
    </section>
  );
}

function BlockCard({
  block,
  axis,
  traced,
}: {
  block: Block;
  axis: Axis;
  traced: string | null;
}) {
  const lit = traced !== null && block.element === traced;
  const dim = traced !== null && !lit;

  return (
    <article
      className={`blocks-block${block.addsToTotal ? "" : " blocks-block--carved"}${lit ? " blocks-block--lit" : ""}${dim ? " blocks-block--dim" : ""}`}
    >
      <span className="blocks-block-top">
        <span className="blocks-block-div num">{block.division ?? "No division"}</span>
        <span className="blocks-block-name">{block.label}</span>
      </span>
      <span className="blocks-block-cost num">{range(block, COMPACT)}</span>
      {block.addsToTotal ? null : (
        <span className="blocks-block-carve num">Carved out of {block.breakoutOf}</span>
      )}
      {axis !== "element" && block.element ? (
        <span className="blocks-block-meta">{block.element}</span>
      ) : null}
      {axis !== "package" && block.buyoutPackage ? (
        <span className="blocks-block-meta">{block.buyoutPackage}</span>
      ) : null}
    </article>
  );
}

type Group = { key: string; label: string; blocks: Block[] };

/** One axis, one bucketing pass. The blocks themselves never change. */
function groupBlocks(blocks: Block[], axis: Axis): Group[] {
  const groups = new Map<string, Group>();

  for (const block of blocks) {
    const key = keyFor(block, axis);
    const group = groups.get(key.key);
    if (group) group.blocks.push(block);
    else groups.set(key.key, { ...key, blocks: [block] });
  }

  // Named groups first, then the blocks nobody has put in one, so an unstated
  // fact never leads the row.
  return [...groups.values()].sort(
    (a, b) => Number(a.key.startsWith("~")) - Number(b.key.startsWith("~")) || a.label.localeCompare(b.label),
  );
}

function keyFor(block: Block, axis: Axis): { key: string; label: string } {
  if (axis === "element") {
    return block.element
      ? { key: block.element, label: block.element }
      : { key: "~none", label: "No Element" };
  }
  if (axis === "division") {
    return block.division
      ? { key: block.division, label: `Division ${block.division}` }
      : { key: "~none", label: "No Division On The Cost Code" };
  }
  return block.buyoutPackage
    ? { key: block.buyoutPackage, label: block.buyoutPackage }
    : { key: "~none", label: "No Buyout Package Stated" };
}
