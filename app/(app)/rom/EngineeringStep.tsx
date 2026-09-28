"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";

import {
  carsPerRoom,
  choicesFor,
  CRITERION_DISCIPLINE,
  CRITERION_GAUGE,
  type Gauge,
  stepNumber,
  travelFeet,
  zoneIndex,
} from "./engineering";
import { reducedMotion } from "./motion";

// LA-1265. Design and Engineering, answered in the flow (Matt's option 1,
// 2026-09-28). When the facts a criterion needs are in, the next card in the
// question slot is the app answering its own question: the arithmetic ticks
// in line by line, the deciding number slides along the scale its rule
// draws, the answer lands, and the boxes it feeds light on the budget. Then
// it moves on by itself. The estimator can pick a different answer, which is
// recorded as a correction, the same as on the saved budget.
//
// These are planning assumptions for the budget, never a design: nothing
// here reads drawings, and nobody has engineered the building.

const STEP_MS = 230;
const LAND_AFTER_MS = 320;
const ADVANCE_MS = 3600;

type Phase = "working" | "landed";

export function EngineeringStep({
  code,
  label,
  criterion,
  failed,
  busy,
  onPick,
  onLanded,
  onContinue,
  onRetry,
}: {
  code: string;
  label: string;
  /** Null while the server works it out. */
  criterion: StoredDerivedAssumption | null;
  failed: string | null;
  busy: boolean;
  /** The estimator picked another answer; the card records it as a correction. */
  onPick: (text: string) => void;
  /** The answer landed: light the boxes it feeds. */
  onLanded: () => void;
  onContinue: () => void;
  onRetry: () => void;
}) {
  // The parent keys this card by the criterion's id, so a fresh answer
  // starts the arithmetic over and a correction to the same one does not.
  const [quiet] = useState(reducedMotion);
  const stepCount = criterion?.steps.length ?? 0;
  const [shownSteps, setShownSteps] = useState(quiet ? stepCount : 0);
  const [phase, setPhase] = useState<Phase>(quiet && criterion ? "landed" : "working");
  const [held, setHeld] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const landedFor = useRef<string | null>(null);
  // The parent hands a new callback each render; the timer reads the latest
  // one so a re-render never restarts the count.
  const continueRef = useRef(onContinue);
  const landedRef = useRef(onLanded);
  useEffect(() => {
    continueRef.current = onContinue;
    landedRef.current = onLanded;
  });

  const steps = criterion?.steps ?? [];
  const shown = criterion ? (criterion.correction?.value ?? criterion.value) : null;
  const shownText = shown ? (shown.kind === "spec" ? shown.text : `${shown.amount} ${shown.unit}`) : "";
  const derivedText = criterion?.value.kind === "spec" ? criterion.value.text : "";

  // The arithmetic ticks in one line at a time, then the answer lands.
  const hasCriterion = criterion !== null;
  useEffect(() => {
    if (!hasCriterion || quiet) return;
    const timers: number[] = [];
    for (let index = 0; index < stepCount; index++) {
      timers.push(window.setTimeout(() => setShownSteps(index + 1), STEP_MS * (index + 1)));
    }
    timers.push(window.setTimeout(() => setPhase("landed"), STEP_MS * stepCount + LAND_AFTER_MS));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [hasCriterion, quiet, stepCount]);

  useEffect(() => {
    if (phase !== "landed" || !criterion || landedFor.current === criterion.id) return;
    landedFor.current = criterion.id;
    landedRef.current();
  }, [phase, criterion]);

  // Moves on by itself once landed, unless the pointer or focus rests on the
  // card, which holds it so it can be read.
  useEffect(() => {
    if (phase !== "landed" || held || busy) return;
    const timer = window.setTimeout(() => continueRef.current(), ADVANCE_MS);
    return () => window.clearTimeout(timer);
  }, [phase, held, busy, criterion]);

  const gauge = CRITERION_GAUGE[code];
  const travel = criterion ? travelFeet(criterion) : null;
  // LA-1269: V-3 draws its cars grouped into the rooms that serve them.
  const cars = criterion ? stepNumber(criterion, "Elevators") : null;
  const rooms = criterion ? stepNumber(criterion, "Machine Rooms") : null;
  const choices = criterion ? choicesFor(criterion) : [];
  const corrected = Boolean(criterion?.correction);

  return (
    <div
      ref={cardRef}
      className={`eng eng--${phase}${held ? " eng--held" : ""}`}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!cardRef.current?.contains(e.relatedTarget as Node)) setHeld(false);
      }}
    >
      <div className="eng-eyebrow">
        <span className="eng-pulse" aria-hidden="true" />
        <span>Design and Engineering</span>
        <span className="eng-disc">{CRITERION_DISCIPLINE[code] ?? ""}</span>
      </div>

      <h3 className="eng-title">
        <span className="eng-code">{code}</span>
        {label}
      </h3>

      {failed ? (
        <p className="eng-fail" role="alert">
          {failed}{" "}
          <button type="button" className="nb-retry" onClick={onRetry}>
            Try Again
          </button>
        </p>
      ) : null}

      {!criterion && !failed ? (
        <div className="eng-tape eng-tape--wait" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      ) : null}

      {criterion ? (
        <>
          <ol className="eng-tape" aria-label="How it was worked out">
            {steps.map((step, index) => (
              <li
                key={`${criterion.id}-${index}`}
                className={`${index < shownSteps ? "eng-on" : ""}${index === steps.length - 1 ? " eng-res" : ""}`}
              >
                <span>{step.label}</span>
                <b className="num">{step.result.replace(/\s*->\s*/g, " → ")}</b>
              </li>
            ))}
          </ol>

          {gauge && travel !== null ? <TravelGauge gauge={gauge} value={travel} on={shownSteps >= 3 || phase === "landed"} /> : null}
          {code === "V-3" && cars !== null && rooms !== null ? (
            <RoomsDiagram cars={cars} rooms={rooms} on={shownSteps >= 2 || phase === "landed"} />
          ) : null}

          <div className="eng-answer" aria-live="polite">
            {phase === "landed" ? (
              <>
                <span className="eng-val" key={shownText}>
                  {shownText}
                </span>
                <span className="eng-conf">
                  <span className={`dc-dot dc-dot--${corrected ? "high" : criterion.confidence}`} aria-hidden="true" />
                  {corrected ? "Set by You" : criterion.confidence === "high" ? "High Confidence" : "Low Confidence"}
                </span>
                <p className="eng-why">{corrected ? `The rule said ${derivedText}.` : criterion.confidenceReason}</p>
              </>
            ) : (
              <span className="eng-working">Working It Out</span>
            )}
          </div>

          {choices.length > 0 && phase === "landed" ? (
            <div className="nb-choices eng-choices" role="radiogroup" aria-label={label}>
              {choices.map((choice) => {
                const picked = shownText === choice;
                return (
                  <button
                    key={choice}
                    type="button"
                    role="radio"
                    aria-checked={picked}
                    className={`nb-choice${picked ? " nb-choice--picked" : ""}`}
                    disabled={busy}
                    onClick={() => (picked ? onContinue() : onPick(choice))}
                  >
                    {choice}
                    {choice === derivedText ? <span className="eng-tag">Derived</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="eng-foot">
            <span className={`eng-bar${phase === "landed" && !held && !busy ? " eng-bar--run" : ""}`} aria-hidden="true">
              <i style={{ "--eng-ms": `${ADVANCE_MS}ms` } as CSSProperties} />
            </span>
            <span className="eng-hint">
              {phase !== "landed" ? "" : held ? "Held while you read" : busy ? "Saving" : "Moves On by Itself"}
            </span>
            <button type="button" className="nb-back" onClick={onContinue} disabled={busy || phase !== "landed"}>
              Continue
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Each band's share of the scale, left to right. */
function zoneWidths(gauge: Gauge): number[] {
  return gauge.zones.map((zone, index) => ((zone.upTo - (index === 0 ? 0 : gauge.zones[index - 1].upTo)) / gauge.max) * 100);
}

/** The scale the rule draws: its bands, and a marker that slides to the deciding number. */
function TravelGauge({ gauge, value, on }: { gauge: Gauge; value: number; on: boolean }) {
  const at = Math.min(100, (Math.min(value, gauge.max) / gauge.max) * 100);
  const hit = zoneIndex(gauge, value);
  const widths = zoneWidths(gauge);
  return (
    <div className={`eng-gauge${on ? " eng-gauge--on" : ""}`} role="img" aria-label={`${value.toFixed(1)} ${gauge.unit}, in the ${gauge.zones[hit].label} band`}>
      <div className="eng-track">
        {gauge.zones.map((zone, index) => (
          <span
            key={zone.label}
            className={`eng-zone${index === hit ? " eng-zone--hit" : ""}`}
            style={{ width: `${widths[index]}%` }}
          />
        ))}
        <span className="eng-mark" style={{ "--eng-at": `${on ? at : 0}%` } as CSSProperties}>
          <span className="eng-mark-lbl num">{Math.round(value)} ft</span>
        </span>
      </div>
      <div className="eng-zones">
        {gauge.zones.map((zone, index) => (
          <span key={zone.label} className={index === hit ? "eng-zl eng-zl--hit" : "eng-zl"} style={{ width: `${widths[index]}%` }}>
            {zone.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * LA-1269: V-3's answer drawn: each elevator a small car, grouped into the
 * machine rooms that serve them. Cars rise in one at a time, then each room's
 * outline closes around its cars.
 */
function RoomsDiagram({ cars, rooms, on }: { cars: number; rooms: number; on: boolean }) {
  const groups = rooms > 0 ? carsPerRoom(cars, rooms) : [cars];
  let index = 0;
  return (
    <div
      className={`eng-rooms${on ? " eng-rooms--on" : ""}${rooms === 0 ? " eng-rooms--none" : ""}`}
      role="img"
      aria-label={`${cars} ${cars === 1 ? "elevator" : "elevators"}, ${rooms === 0 ? "no machine room" : `${rooms} ${rooms === 1 ? "machine room" : "machine rooms"}`}`}
    >
      {groups.map((count, room) => (
        <div key={room} className="eng-room" style={{ "--eng-room": room } as CSSProperties}>
          <div className="eng-cars">
            {Array.from({ length: count }, () => {
              const k = index++;
              return <span key={k} className="eng-car" style={{ "--eng-car": k } as CSSProperties} />;
            })}
          </div>
          <span className="eng-room-lbl">{rooms === 0 ? "No Machine Room" : `Machine Room ${room + 1}`}</span>
        </div>
      ))}
    </div>
  );
}

