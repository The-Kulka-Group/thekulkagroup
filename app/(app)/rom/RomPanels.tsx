"use client";

import type { ReactNode } from "react";
import type { ConfidenceFlag, ProvenanceKind, Rom, RomLine } from "@kulka/engine";

import type { LineProvenance, ProvenanceSignal } from "@/lib/rom/provenance";

import { type Headline, type TradeBlock, midpoint, perSquareFoot } from "./block-layout";

// LA-1101. What the black side panel shows. Every figure is read off the run:
// the ROM the engine returned, and the provenance drill-down (LA-18) that
// reads the same run record back. Nothing here computes a cost.

const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const PER_SF = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const SHARE = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 0 });

const AREA = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function range(value: { low: number; high: number }): string {
  return `${DOLLARS.format(value.low)} to ${DOLLARS.format(value.high)}`;
}

// The kinds in the words CONTEXT.md uses for them.
const KIND_LABEL: Record<ProvenanceKind, string> = {
  actuals: "Actuals",
  proest_budget: "ProEst budget",
  reviewed_judgment: "Reviewed judgment",
  llm_proposal: "Model signal",
};

const CONFIDENCE_WORDS: Record<ConfidenceFlag, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence, held for review",
};

export type Drilldown =
  | { phase: "loading" }
  | { phase: "ready"; byCostCode: Record<string, LineProvenance> }
  | { phase: "failed" };

export function PanelHead({
  title,
  sub,
  onClose,
  titleRef,
}: {
  title: ReactNode;
  sub?: ReactNode;
  onClose: () => void;
  titleRef?: React.Ref<HTMLHeadingElement>;
}) {
  return (
    <div className="rb-ph">
      <div>
        <h2 tabIndex={-1} ref={titleRef}>
          {title}
        </h2>
        {sub ? <p className="rb-psub">{sub}</p> : null}
      </div>
      <button type="button" className="rb-x" onClick={onClose} aria-label="Close the panel">
        Close
      </button>
    </div>
  );
}

function Row({
  name,
  amount,
  sub,
  sum,
}: {
  name: ReactNode;
  amount?: ReactNode;
  sub?: ReactNode;
  sum?: boolean;
}) {
  return (
    <div className={`rb-row${sum ? " rb-row--sum" : ""}`}>
      <span className="rb-rn">{name}</span>
      <span className="rb-ra num">{amount}</span>
      {sub ? <span className="rb-rs">{sub}</span> : null}
    </div>
  );
}

/** The total, opened from the header: the markup breakdown and the range. */
export function TotalPanel({
  rom,
  headline,
  grossSquareFeet,
}: {
  rom: Rom;
  headline: Headline;
  grossSquareFeet: number | null;
}) {
  const markups = rom.markups;
  const owner = markups ? markups.ownerDirect.low > 0 || markups.ownerDirect.high > 0 : false;

  return (
    <>
      <div className="rb-pbig">
        <span className="num">{DOLLARS.format(headline.midpoint)}</span>
        <span>midpoint, {headline.includes}</span>
      </div>

      {markups ? (
        <>
          <h3>Markups on the subtotal</h3>
          {[markups.subtotal, markups.generalConditions, markups.fee, markups.insurance].map((line) => (
            <Row
              key={line.label}
              name={line.code ? `${line.code} ${line.label}` : line.label}
              amount={line.tbd ? "TBD" : range(line)}
              sub={line.basis}
            />
          ))}
          <Row name={markups.total.label} amount={range(markups.total)} sub={markups.total.basis} sum />
          {owner ? (
            <>
              <Row
                name="Owner-direct"
                amount={range(markups.ownerDirect)}
                sub="Bought by the owner direct, so it carries no markup."
              />
              <Row
                name="Total project cost"
                amount={range(markups.totalProjectCost)}
                sub="Kulka's contract total plus owner-direct scope."
                sum
              />
            </>
          ) : null}
        </>
      ) : (
        <>
          <h3>Trade cost</h3>
          <Row name="Trade cost" amount={range(rom.total)} sum />
          <p className="rb-pp">
            This run was recorded before the GRs/GCs module existed, so it carries no markups.
          </p>
        </>
      )}

      <h3>Range</h3>
      <Row
        name="Low to high"
        amount={range(headline)}
        sub="The engine adds every line's low together, and every line's high. It computes no narrower likely band."
      />

      <h3>What it rests on</h3>
      <Row
        name="Gross area"
        amount={grossSquareFeet ? `${AREA.format(grossSquareFeet)} SF` : "Not recorded"}
        sub="The area the run was computed on."
      />
      <Row name="Trade cost" amount={range(rom.total)} sub="Every line that adds, before any markup." />
      <Row
        name="Kulka's contract trade cost"
        amount={range(rom.kulkaContractTotal)}
        sub="Owner-direct lines are out of this one."
      />
      {rom.carvedOut.high > 0 ? (
        <Row
          name="Carved out, not added"
          amount={range(rom.carvedOut)}
          sub="Already inside a parent line's rate. Adding it again would count the scope twice."
        />
      ) : null}
    </>
  );
}

/** One block, opened from the field: where its number came from. */
export function BlockPanel({
  block,
  drilldown,
  grossSquareFeet,
}: {
  block: TradeBlock;
  drilldown: Drilldown;
  grossSquareFeet: number | null;
}) {
  const line = block.line;
  const rate = perSquareFoot(block.midpoint, grossSquareFeet);

  return (
    <>
      <div className="rb-pbig">
        <span className="num">{DOLLARS.format(block.midpoint)}</span>
        <span>midpoint{block.ownerDirect ? ", bought by the owner direct" : ", trade cost"}</span>
      </div>
      <p className="rb-pp">
        Range <b className="num">{range(line)}</b>.
        {rate !== null && grossSquareFeet ? (
          <>
            {" "}
            That is <b className="num">{PER_SF.format(rate)}/SF</b> on{" "}
            <span className="num">{AREA.format(grossSquareFeet)}</span> SF.
          </>
        ) : null}
      </p>
      <p className="rb-pp">
        <span className={`rb-dot rb-dot--${line.confidence}`} aria-hidden="true" />
        {CONFIDENCE_WORDS[line.confidence]}, {behind(line)}.
      </p>
      {line.gateStatus === "assumed_present" ? (
        <p className="rb-pp">
          Nobody answered the scope question behind this line, so it prices as present.
        </p>
      ) : null}
      {line.framing?.reason ? <p className="rb-pp">{line.framing.reason}</p> : null}
      {line.buyoutPackage ? <p className="rb-pp">Bought as {line.buyoutPackage}.</p> : null}

      <Provenance drilldown={drilldown} costCode={line.costCode} label={line.label} />

      {block.breakouts.length > 0 ? (
        <>
          <h3>Carved out inside it</h3>
          <p className="rb-pp">
            These are priced on their own but already sit inside this line&rsquo;s rate, so they add
            nothing to the total.
          </p>
          {block.breakouts.map((breakout) => (
            <Row
              key={breakout.costCode}
              name={breakout.label}
              amount={DOLLARS.format(midpoint(breakout))}
              sub={`${breakout.costCode}, range ${range(breakout)}`}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

// What stands behind the flag, in the words CONTEXT.md uses. A model's figure
// is not a comparable, so a line resting on one alone says so outright.
function behind(line: RomLine): string {
  if (line.comparables.every((c) => c.kind === "llm_proposal")) return "no Kulka data behind it";
  const jobs = line.comparableCount === 1 ? "1 job" : `${line.comparableCount} jobs`;
  const measured = line.comparables.some((c) => c.kind === "actuals" || c.kind === "proest_budget");
  return measured ? `${jobs} behind it` : `${jobs} behind it, judgment only`;
}

// LA-18. Every figure here is read back from the run record, so the panel can
// only ever show what the engine used.
function Provenance({
  drilldown,
  costCode,
  label,
}: {
  drilldown: Drilldown;
  costCode: string;
  label: string;
}) {
  if (drilldown.phase === "loading") {
    return <p className="rb-pp">Reading where this line came from.</p>;
  }
  if (drilldown.phase === "failed") {
    return <p className="rb-pp">The site could not read this line&rsquo;s provenance.</p>;
  }

  const line = drilldown.byCostCode[costCode];
  if (!line || line.signals.length === 0) {
    return <p className="rb-pp">Nothing is recorded behind this line.</p>;
  }

  return (
    <>
      <h3>Where the number came from</h3>
      <p className="rb-pp">
        {line.comparableCount === 0
          ? `No comparable Kulka project stands behind ${label}. These are every signal the blend used.`
          : `${label} blends ${countWords(line.signals.length, "signal")} from ${countWords(line.comparableCount, "Kulka project")}.`}
      </p>
      {line.signals.map((signal, index) => (
        <Row
          key={`${signal.kind}-${signal.recordedAt}-${index}`}
          name={projectWords(signal)}
          amount={`${PER_SF.format(signal.rate)}/SF`}
          sub={signalWords(signal)}
        />
      ))}
      {line.excluded.length > 0 ? (
        <>
          <h3>Left out of the blend</h3>
          {line.excluded.map((signal, index) => (
            <Row
              key={`excluded-${signal.kind}-${signal.recordedAt}-${index}`}
              name={projectWords(signal)}
              amount={`${PER_SF.format(signal.rate)}/SF`}
              sub={signal.reason}
            />
          ))}
        </>
      ) : null}
      {line.judgments.length > 0 ? (
        <>
          <h3>Estimator rules</h3>
          <p className="rb-pp">
            An approved estimator rule moved this line. The signals above do not account for it on
            their own.
          </p>
          {line.judgments.map((judgment) => (
            <Row
              key={judgment.ruleId}
              name={`${KIND_LABEL.reviewed_judgment}, ${PER_SF.format(judgment.adjustmentUsdPerGsf)}/SF stated`}
              amount={`${PER_SF.format(judgment.appliedUsdPerGsf)}/SF`}
              sub={`Moved the rate by this much. Weight ${judgment.weight}. Stated ${judgment.recordedAt} by ${judgment.recordedBy}.`}
            />
          ))}
        </>
      ) : null}
    </>
  );
}

function signalWords(signal: ProvenanceSignal): string {
  const parts = [
    KIND_LABEL[signal.kind],
    signal.exportLabel ?? "no export named",
    `recorded ${signal.recordedAt} by ${signal.recordedBy}`,
    `weight ${signal.weight} (${SHARE.format(signal.weightShare)})`,
  ];
  return parts.join(", ");
}

function countWords(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

function projectWords(signal: Pick<ProvenanceSignal, "projects">): string {
  if (signal.projects.length === 0) return "No comparable project";
  return signal.projects.map((p) => p.name ?? "Project record missing").join(", ");
}

/** Scope answers, held lines, carved-out lines and the run's assumptions. */
export function NotesPanel({
  rom,
  blocks,
  onOpenBlock,
}: {
  rom: Rom;
  blocks: TradeBlock[];
  onOpenBlock: (costCode: string) => void;
}) {
  const held = blocks.filter((block) => block.line.heldForReview);
  const carved = rom.lines.filter((line) => line.breakoutOf !== null);
  const labelOf = new Map(rom.lines.map((line) => [line.costCode, line.label]));

  return (
    <>
      {held.length > 0 ? (
        <>
          <h3>Held for review</h3>
          <p className="rb-pp">Low confidence holds a line back until someone examines it.</p>
          {held.map((block) => (
            <button
              key={block.costCode}
              type="button"
              className="rb-orow"
              onClick={() => onOpenBlock(block.costCode)}
            >
              <Row name={block.label} amount={DOLLARS.format(block.midpoint)} sub={behind(block.line)} />
            </button>
          ))}
        </>
      ) : null}

      <ScopeList title="Not in this job" items={rom.notInThisJob} />
      <ScopeList title="TBD, outside the total" items={rom.tbdGateItems} />
      <ScopeList title="Assumed present, nobody answered" items={rom.assumedPresentItems} />

      {carved.length > 0 ? (
        <>
          <h3>Carved out, not added</h3>
          {carved.map((line) => (
            <Row
              key={line.costCode}
              name={line.label}
              amount={DOLLARS.format(midpoint(line))}
              sub={`Inside ${labelOf.get(line.breakoutOf ?? "") ?? line.breakoutOf}.`}
            />
          ))}
        </>
      ) : null}

      <h3>Assumptions</h3>
      <ul className="rb-log">
        {rom.assumptions.map((assumption) => (
          <li key={assumption}>{assumption}</li>
        ))}
      </ul>
    </>
  );
}

function ScopeList({ title, items }: { title: string; items: Rom["notInThisJob"] }) {
  if (items.length === 0) return null;
  return (
    <>
      <h3>{title}</h3>
      {items.map((item) => (
        <Row key={item.costCode} name={item.label} sub={item.question} />
      ))}
    </>
  );
}
