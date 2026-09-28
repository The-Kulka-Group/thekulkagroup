"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";
import { GLAZING, type GlazingBand, GSF_PER_TON, SERVICE_RATINGS } from "@/lib/rom/engineering-tables";

import {
  carsPerRoom,
  choicesFor,
  CRITERION_DISCIPLINE,
  CRITERION_GAUGE,
  CRITERION_PRICING_NOTE,
  type Gauge,
  ladderPosition,
  ratingLabel,
  stepNumber,
  stepText,
  travelFeet,
  valueText,
  windowBays,
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
  const shownText = shown ? valueText(shown) : "";
  const derivedText = criterion ? valueText(criterion.value) : "";

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
  // LA-1281: E-1 slides its load up the ladder of standard ratings.
  const serviceAmps = criterion && code === "E-1" ? stepNumber(criterion, "Service Load") : null;
  const serviceRating = shown?.kind === "quantity" && code === "E-1" ? shown.amount : null;
  // LA-1282: M-0 draws a facade glazed to its band; M-1 lights its climate zone.
  const band: GlazingBand | null =
    code === "M-0" && shown?.kind === "spec"
      ? shown.text.toLowerCase().startsWith("elevated")
        ? "elevated"
        : "standard"
      : code === "M-1" && criterion
        ? (stepText(criterion, "DOE Model") ?? "").includes("High-Rise")
          ? "elevated"
          : "standard"
        : null;
  const zone = criterion && code === "M-1" ? Number(/Zone (\d)/.exec(stepText(criterion, "Climate Zone") ?? "")?.[1] ?? 0) : 0;
  const pricingNote = CRITERION_PRICING_NOTE[code];
  // LA-1298: A-1 stacks the building's stories against the type's height limit.
  const stack =
    criterion && code === "A-1"
      ? (() => {
          const stories = stepNumber(criterion, "Stories");
          const podiumText = stepText(criterion, "Podium Stories") ?? "";
          const heights = /(\d+) ft(?: against (\d+) ft)?/.exec(stepText(criterion, "Height") ?? "");
          if (!stories || !heights) return null;
          return {
            stories,
            podium: stepNumber(criterion, "Podium Stories") ?? 0,
            retail: podiumText.includes("retail"),
            below: podiumText.includes("below grade"),
            steel: (stepText(criterion, "Framed Stories") ?? "").includes("steel"),
            height: Number(heights[1]),
            limit: heights[2] ? Number(heights[2]) : null,
          };
        })()
      : null;

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
          {code === "E-1" && serviceAmps !== null ? (
            <ServiceLadder amps={serviceAmps} rating={serviceRating} on={shownSteps >= 7 || phase === "landed"} landed={phase === "landed"} />
          ) : null}
          {code === "M-0" && band && criterion ? (
            <GlazingFacade
              band={band}
              storefronts={stepText(criterion, "Storefronts") === "Yes"}
              balconies={stepText(criterion, "Balconies") === "Yes"}
              on={shownSteps >= 3 || phase === "landed"}
            />
          ) : null}
          {code === "M-1" && band && zone ? <ZoneStrip zone={zone} band={band} on={shownSteps >= 1 || phase === "landed"} /> : null}
          {stack ? <StoryStack {...stack} on={shownSteps >= 3 || phase === "landed"} landed={phase === "landed"} /> : null}

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
                {pricingNote ? <p className="eng-note">{pricingNote}</p> : null}
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


/**
 * LA-1281: E-1's load on the ladder of NEC 240.6(A) ratings. The cells charge
 * up to the load, the marker settles at it, and the rating the service rounds
 * up to lights. Past 4,000 A the marker runs off the end.
 */
function ServiceLadder({ amps, rating, on, landed }: { amps: number; rating: number | null; on: boolean; landed: boolean }) {
  const at = ladderPosition(amps);
  const lit = rating === null ? -1 : SERVICE_RATINGS.findIndex((one) => one === rating);
  return (
    <div
      className={`eng-ladder${on ? " eng-ladder--on" : ""}${landed ? " eng-ladder--landed" : ""}`}
      role="img"
      aria-label={`${Math.round(amps).toLocaleString("en-US")} A of load${rating ? `, a ${rating.toLocaleString("en-US")} A service` : ", past one 4,000 A service"}`}
    >
      <div className="eng-ladder-track">
        {SERVICE_RATINGS.map((one, index) => (
          <span
            key={one}
            className={`eng-rung${ladderPosition(one) <= at ? " eng-rung--fed" : ""}${index === lit ? " eng-rung--hit" : ""}`}
            style={{ "--eng-rung": index } as CSSProperties}
          />
        ))}
        <span className="eng-mark" style={{ "--eng-at": `${on ? at : 0}%` } as CSSProperties}>
          <span className="eng-mark-lbl num">{Math.round(amps).toLocaleString("en-US")} A</span>
        </span>
      </div>
      <div className="eng-ladder-lbls">
        {SERVICE_RATINGS.map((one, index) => (
          <span key={one} className={index === lit ? "eng-zl eng-zl--hit" : "eng-zl"}>
            {ratingLabel(one)}
          </span>
        ))}
      </div>
    </div>
  );
}

const FLOORS = 5;
const BAYS = 10;

/**
 * LA-1282: M-0's band drawn as a wall: five floors of ten bays, with windows
 * lighting in bay by bay until the glass reaches the band (2 of 10 is 19.9
 * percent, 3 of 10 is 29.8). Storefronts glaze the ground floor; balconies
 * hang a rail under the upper windows.
 */
function GlazingFacade({ band, storefronts, balconies, on }: { band: GlazingBand; storefronts: boolean; balconies: boolean; on: boolean }) {
  const windows = windowBays(band === "elevated" ? 3 : 2, BAYS);
  let order = 0;
  return (
    <div
      className={`eng-facade${on ? " eng-facade--on" : ""}`}
      role="img"
      aria-label={`${GLAZING[band].percent} percent of the wall is glass${storefronts ? ", with ground-floor storefronts" : ""}${balconies ? ", with balconies" : ""}`}
    >
      <div className="eng-wall">
        {Array.from({ length: FLOORS }, (_, row) => {
          const floor = FLOORS - row;
          const ground = floor === 1;
          return (
            <div key={floor} className={`eng-floor${ground && storefronts ? " eng-floor--store" : ""}`}>
              {Array.from({ length: BAYS }, (_, bay) => {
                const glass = ground && storefronts ? bay > 0 && bay < BAYS - 1 : windows.includes(bay);
                const k = glass ? order++ : 0;
                return (
                  <span
                    key={bay}
                    className={`eng-bay${glass ? " eng-bay--glass" : ""}${glass && balconies && !ground ? " eng-bay--rail" : ""}`}
                    style={glass ? ({ "--eng-win": k } as CSSProperties) : undefined}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="eng-facade-cap">
        <b className="num">{GLAZING[band].percent}%</b> of the Wall Is Glass
      </p>
    </div>
  );
}

/**
 * LA-1282: the three New York climate zones side by side, each with the GSF
 * per ton DOE's model gives for this building's band, and the project's zone
 * lit. It shows how much the zone moves the ratio (a few percent) at a glance.
 */
function ZoneStrip({ zone, band, on }: { zone: number; band: GlazingBand; on: boolean }) {
  return (
    <div className={`eng-zones-strip${on ? " eng-zones-strip--on" : ""}`} role="img" aria-label={`Climate zone ${zone}`}>
      {([4, 5, 6] as const).map((one, index) => (
        <span key={one} className={`eng-zchip${one === zone ? " eng-zchip--hit" : ""}`} style={{ "--eng-z": index } as CSSProperties}>
          <span className="eng-zchip-z">Zone {one}</span>
          <span className="eng-zchip-r num">{GSF_PER_TON[one][band].toLocaleString("en-US")} SF per Ton</span>
        </span>
      ))}
    </div>
  );
}

const STACK_PX = 150;

/**
 * LA-1298: A-1's building, drawn to scale. Stories rise from the ground one
 * at a time, concrete podium first, then the frame, and a dashed line marks
 * the height the type allows. A garage below grade sits under the ground line.
 */
function StoryStack({
  stories,
  podium,
  retail,
  below,
  steel,
  height,
  limit,
  on,
  landed,
}: {
  stories: number;
  podium: number;
  retail: boolean;
  below: boolean;
  steel: boolean;
  height: number;
  limit: number | null;
  on: boolean;
  landed: boolean;
}) {
  const scaleMax = Math.max(limit ?? 0, height) + 10;
  const px = (feet: number) => (feet / scaleMax) * STACK_PX;
  const floors = Array.from({ length: stories }, (_, index) => {
    const concrete = index < podium;
    return { concrete, feet: concrete ? (index === 0 && retail ? 15 : 12) : 10 };
  });
  const clear = limit !== null && limit - height > 5;
  return (
    <div
      className={`eng-stack${on ? " eng-stack--on" : ""}${landed ? " eng-stack--landed" : ""}`}
      role="img"
      aria-label={`${stories} stories, ${podium} of them concrete podium, ${height} ft${limit ? ` against a ${limit} ft limit` : ""}`}
    >
      <div className="eng-stack-field" style={{ height: STACK_PX }}>
        <div className="eng-bldg">
          {floors.map((floor, index) => (
            <span
              key={index}
              className={`eng-flr ${floor.concrete ? "eng-flr--podium" : steel ? "eng-flr--steel" : "eng-flr--wood"}`}
              style={{ height: px(floor.feet), "--eng-flr": index } as CSSProperties}
            />
          ))}
        </div>
        {limit !== null ? (
          <span className={`eng-limit${clear ? "" : " eng-limit--tight"}`} style={{ bottom: px(limit) }}>
            <span className="num">{limit} ft Limit</span>
          </span>
        ) : null}
        <span className="eng-top" style={{ bottom: px(height) }}>
          <span className="num">{height} ft</span>
        </span>
      </div>
      <div className="eng-ground" />
      {below ? <span className="eng-flr eng-flr--below" style={{ height: px(10) }} /> : null}
      <div className="eng-stack-key">
        {podium > 0 ? <span className="eng-key eng-key--podium">Concrete Podium</span> : null}
        {podium < stories ? <span className={`eng-key ${steel ? "eng-key--steel" : "eng-key--wood"}`}>{steel ? "Light-Gauge Steel" : "Wood Frame"}</span> : null}
        {below ? <span className="eng-key eng-key--below">Garage Below Grade</span> : null}
      </div>
    </div>
  );
}
