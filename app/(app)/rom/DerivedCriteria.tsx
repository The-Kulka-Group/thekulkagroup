"use client";

import {
  changedCriteria,
  type DerivedValue,
  formatDerivedValue,
  isCorrected,
  showsAssumedFact,
} from "@kulka/engine";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";

import { choicesFor } from "./engineering";
import { reducedMotion } from "./motion";
import { SpringMoney } from "./SpringMoney";
import "./derived-criteria.css";

// LA-860. Design and Engineering (Matt renamed it from Design Criteria,
// 2026-09-28) on the ROM face: one card per derived assumption,
// the approved criteria-card design of 2026-09-27. A card leads with its code
// and a Derived pill, then the value, then the label; hover swaps the label
// for the method line in the same space. Clicking opens the black side panel
// with the facts, Jev's arithmetic, the confidence and the correction form.
// These are planning assumptions for the budget. They are not a design.

export type Criterion = StoredDerivedAssumption;

/** How long the shimmer holds before a changed value springs in, and how long the spring runs. */
const RECHECK_MS = 520;
const FLIP_MS = 600;
const TOAST_MS = 4000;

const STAMP = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

/** The part of an email before the @, which is how a correction names who set it. */
export function personName(email: string): string {
  return email.split("@")[0] || email;
}

type Toast = { text: string; undo: () => void };

/**
 * The criteria on screen and every change to them. A new list from the server
 * (a fact changed and the page refreshed) shimmers each card whose shown value
 * moved, then springs the new value in. Saving or reverting a correction
 * springs that card's value and offers Undo.
 */
export function useDerivedCriteria(initial: Criterion[]) {
  const [items, setItems] = useState(initial);
  const [source, setSource] = useState(initial);
  const [recheck, setRecheck] = useState<string[]>([]);
  const [flip, setFlip] = useState<string[]>([]);
  const [toast, setToast] = useState<Toast | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Adjusted during render, the way React adjusts state to a new prop.
  if (initial !== source) {
    const changed = changedCriteria(items, initial);
    setSource(initial);
    setItems(initial);
    setRecheck(reducedMotion() ? [] : changed);
    if (reducedMotion()) setFlip(changed);
  }

  useEffect(() => {
    if (recheck.length === 0) return;
    const timer = window.setTimeout(() => {
      setFlip(recheck);
      setRecheck([]);
    }, RECHECK_MS);
    return () => window.clearTimeout(timer);
  }, [recheck]);

  useEffect(() => {
    if (flip.length === 0) return;
    const timer = window.setTimeout(() => setFlip([]), FLIP_MS);
    return () => window.clearTimeout(timer);
  }, [flip]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function send(id: string, init: RequestInit): Promise<Criterion | null> {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/rom/derived-assumptions/${encodeURIComponent(id)}/correction`, {
        headers: { "Content-Type": "application/json" },
        ...init,
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "The correction could not be saved.");
        return null;
      }
      const next = body.derivedAssumption as Criterion;
      setItems((current) => current.map((one) => (one.id === next.id ? next : one)));
      setFlip([next.code]);
      return next;
    } catch {
      setError("The site could not reach the server.");
      return null;
    } finally {
      setBusy(false);
    }
  }

  const restore = async (item: Criterion, correctionId: string) => {
    setToast(null);
    await send(item.id, { method: "POST", body: JSON.stringify({ restore: correctionId }) });
  };

  const revert = async (item: Criterion, withToast = true) => {
    const correctionId = item.correctionId;
    const next = await send(item.id, { method: "DELETE" });
    if (next && withToast && correctionId) {
      setToast({ text: "Back to the worked-out value.", undo: () => void restore(next, correctionId) });
    }
  };

  const save = async (item: Criterion, value: DerivedValue, reason: string) => {
    const previous = item.correctionId;
    const next = await send(item.id, { method: "POST", body: JSON.stringify({ value, reason }) });
    if (next) {
      setToast({
        text: "Correction saved.",
        undo: () => {
          setToast(null);
          if (previous) void restore(next, previous);
          else void revert(next, false);
        },
      });
    }
  };

  return {
    items,
    recheck,
    flip,
    toast,
    busy,
    error,
    save,
    revert,
    dismissToast: () => setToast(null),
  };
}

/** What lights cards orange: every card resting on an assumed fact, or the ones resting on one named fact. */
export type Ping = { fact: string | null } | null;

function pinged(item: Criterion, ping: Ping): boolean {
  if (!ping || !showsAssumedFact(item)) return false;
  return ping.fact === null || item.inputs.some((input) => input.basis === "assumed" && input.name === ping.fact);
}

export function DerivedCriteriaSection({
  items,
  recheck = [],
  flip = [],
  selectedCode,
  ping,
  onPing,
  onOpen,
  onEnter,
  onLeave,
  trailing = null,
}: {
  items: Criterion[];
  recheck?: string[];
  flip?: string[];
  selectedCode: string | null;
  ping: Ping;
  onPing: (ping: Ping) => void;
  onOpen: (code: string, el: HTMLElement | null) => void;
  /** Hover intent (LA-1181's 70ms in, 140ms out) for lighting the blocks a criterion feeds. */
  onEnter: (code: string) => void;
  onLeave: () => void;
  /** LA-1328: the Building View, the grid's last card, so it never floats over the budget. */
  trailing?: ReactNode;
}) {
  // Cards rise in one after another on first load only.
  const [entering, setEntering] = useState(true);
  const count = useRef(items.length);
  useEffect(() => {
    const timer = window.setTimeout(() => setEntering(false), 500 + count.current * 45);
    return () => window.clearTimeout(timer);
  }, []);

  if (items.length === 0 && !trailing) return null;
  const leaning = items.filter(showsAssumedFact);

  return (
    <section className="dc" aria-label="Design and Engineering">
      <div className="dc-hd">
        <h2>Design and Engineering</h2>
        <div className="dc-legend" hidden={items.length === 0}>
          {leaning.length > 0 ? (
            <button
              type="button"
              className="dc-cnt"
              onMouseEnter={() => onPing({ fact: null })}
              onMouseLeave={() => onPing(null)}
              onFocus={() => onPing({ fact: null })}
              onBlur={() => onPing(null)}
              onClick={(e) => onOpen(leaning[0].code, e.currentTarget)}
            >
              <span className="dc-dot dc-dot--low" aria-hidden="true" />
              {`${leaning.length} ${leaning.length === 1 ? "Rests" : "Rest"} on an Assumed Fact`}
            </button>
          ) : null}
          <span>
            <span className="dc-dot dc-dot--high" aria-hidden="true" />
            High
          </span>
          <span>
            <span className="dc-dot dc-dot--low" aria-hidden="true" />
            Low Confidence
          </span>
        </div>
      </div>
      <div className={`dc-grid${entering ? " dc-grid--enter" : ""}`}>
        {items.map((item, index) => (
          <CriterionCard
            key={item.id}
            item={item}
            index={index}
            selected={selectedCode === item.code}
            recheck={recheck.includes(item.code)}
            flip={flip.includes(item.code)}
            ping={ping === null ? null : pinged(item, ping)}
            onOpen={onOpen}
            onEnter={onEnter}
            onLeave={onLeave}
          />
        ))}
        {trailing}
      </div>
      <p className="dc-foot" hidden={items.length === 0}>
        These are planning assumptions for the budget, worked out from the project&apos;s facts. Nobody has designed or engineered the building.
      </p>
    </section>
  );
}

export function CriterionCard({
  item,
  index = 0,
  selected = false,
  recheck = false,
  flip = false,
  ping = null,
  onOpen,
  onEnter,
  onLeave,
}: {
  item: Criterion;
  index?: number;
  selected?: boolean;
  recheck?: boolean;
  flip?: boolean;
  /** True lights the card orange, false fades it, null leaves it alone. */
  ping?: boolean | null;
  onOpen?: (code: string, el: HTMLElement | null) => void;
  onEnter?: (code: string) => void;
  onLeave?: () => void;
}) {
  const corrected = isCorrected(item);
  const leans = showsAssumedFact(item);
  const shown = item.correction?.value ?? item.value;
  const confidence = item.confidence === "high" ? "High" : "Low";
  const assumed = item.inputs.filter((input) => input.basis === "assumed").map((input) => input.name);
  const name = [
    `${item.code} ${item.label}: ${formatDerivedValue(shown)}.`,
    corrected
      ? `Corrected by ${personName(item.correction!.correctedBy)}; the worked-out value was ${formatDerivedValue(item.value)}.`
      : `${confidence} confidence${leans ? ", rests on an assumed fact" : ""}.`,
  ].join(" ");

  const className = [
    "dc-card",
    selected ? "dc-card--sel" : "",
    leans ? "dc-card--leans" : "",
    ping === true ? "dc-card--ping" : "",
    ping === false ? "dc-card--dim" : "",
    recheck ? "dc-card--recheck" : "",
    flip ? "dc-card--flip" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      className={className}
      style={{ "--k": index } as CSSProperties}
      aria-pressed={selected}
      aria-label={name}
      onClick={(e) => onOpen?.(item.code, e.currentTarget)}
      onMouseEnter={() => onEnter?.(item.code)}
      onMouseLeave={onLeave}
      onFocus={() => onEnter?.(item.code)}
      onBlur={onLeave}
    >
      <span className="dc-top">
        <span className="dc-code">{item.code}</span>
        <CriterionPill corrected={corrected} />
        {corrected ? null : (
          <span className="dc-conf" title={`${confidence} confidence`}>
            <span className={`dc-dot dc-dot--${item.confidence}`} />
          </span>
        )}
      </span>
      <span className="dc-val">
        <ValueText value={shown} />
        {corrected ? <span className="dc-was">{formatDerivedValue(item.value)}</span> : null}
      </span>
      <span className="dc-swap">
        <span className="dc-lbl">{item.label}</span>
        <span className="dc-meth" aria-hidden="true">
          {corrected ? (
            `Set by ${personName(item.correction!.correctedBy)}: ${item.correction!.reason}`
          ) : (
            <>
              {leans ? <b>Assumed {assumed.join(" and ")}. </b> : null}
              {item.method}
            </>
          )}
        </span>
      </span>
    </button>
  );
}

function CriterionPill({ corrected }: { corrected: boolean }) {
  return corrected ? (
    <span className="dc-pill dc-pill--corrected">
      <i aria-hidden="true" />
      Corrected
    </span>
  ) : (
    <span className="dc-pill dc-pill--derived">
      <i aria-hidden="true" />
      Derived
    </span>
  );
}

const decimals = (amount: number) => (Number.isInteger(amount) ? 0 : Math.min(2, String(amount).split(".")[1]?.length ?? 0));

/** A quantity springs to its value with SpringMoney; a spec choice is its own words. */
function ValueText({ value }: { value: DerivedValue }) {
  if (value.kind === "spec") return <span>{value.text}</span>;
  const places = decimals(value.amount);
  const number = new Intl.NumberFormat("en-US", { minimumFractionDigits: places, maximumFractionDigits: places });
  const unit = value.unit;
  return <SpringMoney value={value.amount} format={(n) => `${number.format(n)} ${unit}`} />;
}

/** The black side panel's body for one criterion: facts, arithmetic, confidence, and the correction. */
export function CriterionPanel({
  item,
  busy,
  error,
  onSave,
  onRevert,
  onPing,
}: {
  item: Criterion;
  busy: boolean;
  error: string | null;
  onSave: (value: DerivedValue, reason: string) => void;
  onRevert: () => void;
  onPing: (ping: Ping) => void;
}) {
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const corrected = item.correction;
  const shown = corrected?.value ?? item.value;
  const confidence = item.confidence === "high" ? "High" : "Low";

  const parsed: DerivedValue | null = (() => {
    const text = value.trim();
    if (!text) return null;
    if (item.value.kind === "spec") return { kind: "spec", text };
    const amount = Number(text.replace(/,/g, ""));
    return Number.isFinite(amount) ? { kind: "quantity", amount, unit: item.value.unit } : null;
  })();
  const ready = parsed !== null && reason.trim().length > 0 && !busy;

  return (
    <div className="dc-pnl">
      <div className="dc-pnl-top">
        <span className="dc-code">{item.code}</span>
        <CriterionPill corrected={corrected !== null} />
      </div>
      <p className="dc-big">{formatDerivedValue(shown)}</p>
      <p className="dc-src">{item.method}</p>

      <div>
        <h3 className="dc-blockh">From These Facts</h3>
        <div className="dc-inputs">
          {item.inputs.map((input) =>
            input.basis === "assumed" ? (
              <span
                key={input.name}
                className="dc-fact dc-fact--assumed"
                tabIndex={0}
                title="Assumed, not stated"
                onMouseEnter={() => onPing({ fact: input.name })}
                onMouseLeave={() => onPing(null)}
                onFocus={() => onPing({ fact: input.name })}
                onBlur={() => onPing(null)}
              >
                {input.name} {input.value}
                <span className="dc-sr">, assumed</span>
              </span>
            ) : (
              <span key={input.name} className="dc-fact">
                {input.name} {input.value}
              </span>
            ),
          )}
        </div>
      </div>

      <div>
        <h3 className="dc-blockh">How It Was Worked Out</h3>
        <ol className="dc-steps">
          {item.steps.map((step, index) => (
            <li key={index} className={index === item.steps.length - 1 ? "dc-res" : undefined}>
              <span>{step.label}</span>
              <b>{step.result.replace(/\s*->\s*/g, " → ")}</b>
            </li>
          ))}
        </ol>
      </div>

      <p className="dc-why">
        <span className={`dc-dot dc-dot--${item.confidence}`} aria-hidden="true" />
        <span>
          <b>{confidence} confidence.</b> {item.confidenceReason}
        </span>
      </p>

      <div className="dc-fix">
        {corrected ? (
          <>
            <p className="dc-hist">
              {personName(corrected.correctedBy)} set this to <b>{formatDerivedValue(corrected.value)}</b> on{" "}
              {STAMP.format(new Date(corrected.correctedAt))}. Reason: {corrected.reason}. the worked-out value was{" "}
              {formatDerivedValue(item.value)}.
            </p>
            <div className="dc-row">
              <button type="button" className="dc-btn" disabled={busy} onClick={onRevert}>
                Use the Worked-Out Value
              </button>
            </div>
          </>
        ) : (
          <form
            className="dc-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready && parsed) onSave(parsed, reason.trim());
            }}
          >
            <label htmlFor={`dc-v-${item.code}`}>Correct This Value</label>
            {item.value.kind === "spec" && choicesFor(item).length > 0 ? (
              // LA-1265: a criterion with set answers (V-1, V-2) offers them as buttons.
              <div className="dc-choices" role="radiogroup" aria-label={item.label}>
                {choicesFor(item)
                  .filter((choice) => item.value.kind === "spec" && choice !== item.value.text)
                  .map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      role="radio"
                      aria-checked={value === choice}
                      className={`nb-choice${value === choice ? " nb-choice--picked" : ""}`}
                      onClick={() => setValue(choice)}
                    >
                      {choice}
                    </button>
                  ))}
              </div>
            ) : null}
            <span className="dc-unit" hidden={item.value.kind === "spec" && choicesFor(item).length > 0}>
              <input
                id={`dc-v-${item.code}`}
                inputMode={item.value.kind === "quantity" ? "decimal" : undefined}
                placeholder={item.value.kind === "quantity" ? String(item.value.amount) : item.value.text}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              {item.value.kind === "quantity" ? <span>{item.value.unit}</span> : null}
            </span>
            <label htmlFor={`dc-r-${item.code}`}>Reason</label>
            <input
              id={`dc-r-${item.code}`}
              placeholder="Why the value is different"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="dc-row">
              <button type="submit" className="dc-btn dc-btn--pri" disabled={!ready}>
                Save Correction
              </button>
            </div>
          </form>
        )}
        {error ? (
          <p className="dc-err" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function CriteriaToast({ toast, onDismiss }: { toast: Toast | null; onDismiss: () => void }) {
  return (
    <div className={`dc-toast${toast ? " dc-toast--on" : ""}`} role="status">
      <span>{toast?.text}</span>
      {toast ? (
        <button
          type="button"
          onClick={() => {
            toast.undo();
            onDismiss();
          }}
        >
          Undo
        </button>
      ) : null}
    </div>
  );
}
