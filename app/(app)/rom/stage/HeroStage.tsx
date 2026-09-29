"use client";

import { forwardRef, useMemo } from "react";

import { heroScene, type HeroScene, type TravelBand } from "@/lib/rom/hero-scenes";
import type { StageBuilding } from "@/lib/rom/stage-model";
import { CARD_ORDER, type StageEvent } from "@/lib/rom/stage-scenes";
import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";

import "./hero.css";

// LA-1324. Matt, 2026-09-28: the top of the budget is Design and
// Engineering's stage while New Budget runs. The moment playing is named on
// the left, and a Design and Engineering card draws the picture of its own
// arithmetic on the right: V-1 and V-2 the travel scale, V-3 the machine
// rooms, S-1 the foundation, M-0 the facade, M-1 the climate zone, E-1 the
// amp ladder, A-1 the height against its type's limit and A-2 the plan. The
// picture builds while the moment plays and marks its answer when it lands.
// An answer (Parking, Balconies) names itself with no picture. Along the
// bottom, each card the job will get shows whether it is still designing,
// playing or done.

const CARD_CODES: ReadonlySet<string> = new Set(CARD_ORDER);

export type RailState = "designing" | "playing" | "done";

type Props = {
  moment: { event: StageEvent; landed: boolean } | null;
  criteria: Readonly<Record<string, StoredDerivedAssumption>>;
  building: StageBuilding | null;
  rail: readonly { code: string; state: RailState }[];
  /** LA-1328: the Building View, at the stage's right end, so it never floats over the budget. */
  side?: React.ReactNode;
};

/** Where a moment's price tag starts: the answer line, so it flies from what decided it. */
export type HeroHandle = HTMLDivElement;

export const HeroStage = forwardRef<HeroHandle, Props>(function HeroStage({ moment, criteria, building, rail, side = null }, capRef) {
  const event = moment?.event ?? null;
  const landed = moment?.landed ?? false;
  const card = event && CARD_CODES.has(event.source) ? criteria[event.source] : undefined;
  const scene = useMemo(() => (card ? heroScene(card) : null), [card]);

  return (
    <section className={`hs${side ? " hs--side" : ""}`} aria-label="Design and Engineering">
      <div className="hs-cap" ref={capRef}>
        {event ? (
          <div className="hs-cap-in" key={event.id}>
            <span className="hs-head">
              {event.tag && event.tag !== event.title ? <span className="hs-code num">{event.tag}</span> : null}
              <span className="hs-title">{event.title}</span>
            </span>
            <span className={`hs-ans${landed ? " hs-ans--on" : ""}`}>{landed ? event.answer : ""}</span>
          </div>
        ) : (
          <div className="hs-cap-in">
            <span className="hs-title">Design and Engineering</span>
            <span className="hs-idle">The building works itself out as you answer.</span>
          </div>
        )}
      </div>
      <div className="hs-scene" data-phase={landed ? "land" : "play"} key={event?.id ?? "idle"}>
        {scene ? <Scene scene={scene} building={building} /> : null}
      </div>
      {side ? <div className="hs-side">{side}</div> : null}
      {rail.length > 0 ? (
        <ol className="hs-rail" aria-label="Design and Engineering cards">
          {rail.map((one) => (
            <li key={one.code} className="hs-chip" data-state={one.state}>
              <span className="hs-dot" aria-hidden="true" />
              <span className="num">{one.code}</span>
              <span className="lb-sr">{one.state === "done" ? ", done" : one.state === "playing" ? ", playing" : ", designing"}</span>
            </li>
          ))}
        </ol>
      ) : null}
      <span className="lb-sr" aria-live="polite">
        {event && landed ? `${event.title}: ${event.answer}` : ""}
      </span>
    </section>
  );
});

/* --- The pictures. Each is a 600 by 150 drawing that fits the stage's right side. --- */

const W = 600;
const H = 150;
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function Scene({ scene, building }: { scene: HeroScene; building: StageBuilding | null }) {
  switch (scene.kind) {
    case "travel":
      return <Scale value={scene.travelFeet} bands={scene.bands} label={`${fmt(scene.travelFeet)} ft`} what="Travel" />;
    case "height":
      return (
        <Scale
          value={scene.heightFeet}
          bands={scene.limitFeet ? [{ to: scene.limitFeet, label: "Within the Type" }, { to: null, label: "Past Its Limit" }] : [{ to: null, label: "" }]}
          label={`${fmt(scene.heightFeet)} ft`}
          what="Height"
        />
      );
    case "rooms":
      return <Rooms cars={scene.cars} rooms={scene.rooms} />;
    case "foundation":
      return <Foundation system={scene.system} coverage={scene.coverage} poorGround={scene.poorGround} />;
    case "facade":
      return <Facade percent={scene.percent} />;
    case "climate":
      return <Climate zone={scene.zone} place={scene.place} gsfPerTon={scene.gsfPerTon} />;
    case "amps":
      return <Amps load={scene.loadAmps} rating={scene.rating} ratings={scene.ratings} />;
    case "plan":
      return building ? <Plan building={building} /> : null;
  }
}

function Svg({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <svg className="hs-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={label}>
      {children}
    </svg>
  );
}

/** V-1 and V-2's travel, and A-1's height: a bar along a scale of bands, marked where it lands. */
function Scale({ value, bands, label, what }: { value: number; bands: TravelBand[]; label: string; what: string }) {
  const lastTo = [...bands].reverse().find((b) => b.to !== null)?.to ?? 0;
  const max = Math.ceil(Math.max(value * 1.2, lastTo + 15, 60) / 10) * 10;
  const x0 = 24, x1 = W - 24;
  const x = (ft: number) => x0 + (Math.min(ft, max) / max) * (x1 - x0);
  const hit = bands.findIndex((b) => b.to === null || value <= b.to);
  const ticks = Array.from({ length: max / 10 + 1 }, (_, i) => i * 10);
  const starts = bands.map((_, i) => (i === 0 ? 0 : (bands[i - 1].to ?? max)));
  return (
    <Svg label={`${what} of ${label}${bands[hit]?.label ? `, in the ${bands[hit].label} band` : ""}`}>
      {bands.map((band, i) => {
        const a = x(starts[i]), b = x(band.to ?? max);
        return (
          <g key={band.label + i} className={`hs-band${i === hit ? " hs-band--hit" : ""}`} data-tone={i % 3}>
            <rect x={a} y={58} width={Math.max(0, b - a)} height={32} />
            {band.label ? (
              <text x={(a + b) / 2} y={79} textAnchor="middle">
                {band.label}
              </text>
            ) : null}
          </g>
        );
      })}
      <line className="hs-axis" x1={x0} x2={x1} y1={90} y2={90} />
      {ticks.map((t) => (
        <g key={t} className="hs-tick">
          <line x1={x(t)} x2={x(t)} y1={90} y2={t % 20 === 0 ? 97 : 94} />
          {t % 20 === 0 ? (
            <text x={x(t)} y={112} textAnchor="middle">
              {t === max || t + 20 > max ? `${t} ft` : t}
            </text>
          ) : null}
        </g>
      ))}
      <rect className="hs-fill hs-grow-x" x={x0} y={42} width={x(value) - x0} height={8} rx={4} />
      <g className="hs-on-land">
        <line className="hs-mark" x1={x(value)} x2={x(value)} y1={36} y2={90} />
        <text className="hs-val" x={x(value)} y={28} textAnchor={x(value) > x1 - 40 ? "end" : "middle"}>
          {label}
        </text>
      </g>
    </Svg>
  );
}

/** V-3: the cars' shafts, and the machine rooms they share. */
function Rooms({ cars, rooms }: { cars: number; rooms: number }) {
  const shown = Math.min(cars, 6), roomN = Math.min(rooms, 4);
  const width = shown * 30 + (roomN > 0 ? 48 + roomN * 72 : 0);
  const left = (W - width) / 2;
  const roomX = (j: number) => left + shown * 30 + 48 + j * 72;
  return (
    <Svg label={`${cars} ${cars === 1 ? "car" : "cars"} and ${rooms === 0 ? "no machine room" : `${rooms} machine ${rooms === 1 ? "room" : "rooms"}`}`}>
      <line className="hs-axis" x1={left - 30} x2={left + width + 30} y1={120} y2={120} />
      {Array.from({ length: shown }, (_, i) => (
        <rect key={i} className="hs-shaft hs-grow-y" style={{ "--i": i } as React.CSSProperties} x={left + i * 30} y={30} width={24} height={90} />
      ))}
      {Array.from({ length: roomN }, (_, j) => (
        <g key={j} className="hs-on-land">
          <line className="hs-feed" x1={left + shown * 30 - 4} x2={roomX(j)} y1={104} y2={104} />
          <rect className="hs-room" x={roomX(j)} y={88} width={60} height={32} rx={3} />
        </g>
      ))}
      <text className="hs-note" x={left + (shown * 30 - 6) / 2} y={138} textAnchor="middle">
        {cars === 1 ? "1 Car" : `${cars} Cars`}
      </text>
      <text className="hs-val hs-on-land" x={roomN > 0 ? roomX(0) + (roomN * 72 - 12) / 2 : left + width + 20} y={roomN > 0 ? 78 : 80} textAnchor={roomN > 0 ? "middle" : "start"}>
        {rooms === 0 ? "No Machine Room" : rooms === 1 ? "1 Machine Room" : `${rooms} Machine Rooms`}
      </text>
    </Svg>
  );
}

/** S-1: the building on the ground, and what carries it. */
function Foundation({ system, coverage, poorGround }: { system: string; coverage: number | null; poorGround: boolean }) {
  const bx = 170, bw = 260, ground = 62;
  const n = 10;
  const at = (i: number) => bx + 12 + i * ((bw - 24) / (n - 1));
  return (
    <Svg label={`${system}${coverage !== null ? `, ${coverage}% coverage` : ""}${poorGround ? ", on poor ground" : ""}`}>
      <rect className={`hs-soil${poorGround ? " hs-soil--poor" : ""}`} x={40} y={ground} width={W - 80} height={H - ground - 6} />
      <rect className="hs-bldg" x={bx} y={12} width={bw} height={ground - 12} />
      {[22, 32, 42, 52].map((y) => (
        <line key={y} className="hs-floor" x1={bx} x2={bx + bw} y1={y} y2={y} />
      ))}
      <line className="hs-axis" x1={40} x2={W - 40} y1={ground} y2={ground} />
      {system === "Deep Foundations"
        ? Array.from({ length: n }, (_, i) => (
            <line key={i} className="hs-pile hs-grow-y hs-down" style={{ "--i": i } as React.CSSProperties} x1={at(i)} x2={at(i)} y1={ground + 6} y2={H - 12} />
          ))
        : system === "Ground Improvement"
          ? Array.from({ length: n + 4 }, (_, i) => (
              <rect key={i} className="hs-pier hs-grow-y hs-down" style={{ "--i": i } as React.CSSProperties} x={bx + 6 + i * ((bw - 20) / (n + 3))} y={ground + 2} width={8} height={34} rx={3} />
            ))
          : system === "Mat Foundation"
            ? <rect className="hs-conc hs-grow-x" x={bx - 6} y={ground} width={bw + 12} height={14} />
            : system === "Spread Footings"
              ? Array.from({ length: 7 }, (_, i) => {
                  const x = bx + 8 + i * ((bw - 40) / 6);
                  return <path key={i} className="hs-conc hs-pop" style={{ "--i": i } as React.CSSProperties} d={`M${x} ${ground} h24 l6 12 h-36 z`} />;
                })
              : <rect className="hs-exist" x={bx} y={ground} width={bw} height={12} />}
      {system === "Deep Foundations" ? <rect className="hs-conc hs-grow-x" x={bx - 4} y={ground} width={bw + 8} height={6} /> : null}
      {poorGround ? (
        <text className="hs-note hs-on-land" x={56} y={ground + 20}>
          Poor Ground
        </text>
      ) : null}
      {coverage !== null ? (
        <text className="hs-val hs-on-land" x={bx + bw + 24} y={ground - 20}>
          {coverage}% Coverage
        </text>
      ) : null}
    </Svg>
  );
}

/** M-0: a wall with its windows drawn at the job's share of glass, against New York's 30 percent cap. */
function Facade({ percent }: { percent: number }) {
  const wx = 150, wy = 12, ww = 240, wh = 126, rows = 5, cols = 8;
  const cw = ww / cols, ch = wh / rows;
  const s = Math.sqrt(Math.max(0, Math.min(percent, 100)) / 100);
  const mx = 470, top = 14, bottom = 136, cap = 40;
  const y = (p: number) => bottom - (Math.min(p, cap) / cap) * (bottom - top);
  return (
    <Svg label={`Windows are ${percent}% of the wall`}>
      <rect className="hs-bldg" x={wx} y={wy} width={ww} height={wh} />
      {Array.from({ length: rows * cols }, (_, k) => {
        const r = Math.floor(k / cols), c = k % cols;
        return (
          <rect
            key={k}
            className="hs-glass hs-pop"
            style={{ "--i": r + c } as React.CSSProperties}
            x={wx + c * cw + (cw * (1 - s)) / 2}
            y={wy + r * ch + (ch * (1 - s)) / 2}
            width={cw * s}
            height={ch * s}
          />
        );
      })}
      <rect className="hs-meter" x={mx} y={top} width={14} height={bottom - top} rx={7} />
      <rect className="hs-fill hs-grow-y" x={mx} y={y(percent)} width={14} height={bottom - y(percent)} rx={7} />
      <line className="hs-cap-line" x1={mx - 6} x2={mx + 20} y1={y(30)} y2={y(30)} />
      <text className="hs-note" x={mx + 26} y={y(30) + 4}>
        30% Cap
      </text>
      <text className="hs-val hs-on-land" x={mx - 12} y={y(percent) + 5} textAnchor="end">
        {percent}%
      </text>
    </Svg>
  );
}

/** M-1: the climate zones New York spans, the job's lit, and what a ton cools there. */
function Climate({ zone, place, gsfPerTon }: { zone: number | null; place: string | null; gsfPerTon: number | null }) {
  const zones = [3, 4, 5, 6, 7];
  const bw = 88, gap = 8, left = (W - (zones.length * bw + (zones.length - 1) * gap)) / 2;
  const at = zone !== null ? zones.indexOf(zone) : -1;
  return (
    <Svg label={`Climate zone ${zone ?? "unknown"}${gsfPerTon ? `, ${gsfPerTon} square feet a ton` : ""}`}>
      {zones.map((z, i) => (
        <g key={z} className={`hs-zone hs-pop${i === at ? " hs-zone--hit" : ""}`} style={{ "--i": i } as React.CSSProperties}>
          <rect x={left + i * (bw + gap)} y={30} width={bw} height={50} rx={8} />
          <text x={left + i * (bw + gap) + bw / 2} y={60} textAnchor="middle">
            Zone {z}
          </text>
        </g>
      ))}
      {at >= 0 ? (
        <g className="hs-on-land">
          {gsfPerTon ? (
            <text className="hs-val" x={left + at * (bw + gap) + bw / 2} y={104} textAnchor="middle">
              {fmt(gsfPerTon)} SF a Ton
            </text>
          ) : null}
          {place ? (
            <text className="hs-note" x={left + at * (bw + gap) + bw / 2} y={122} textAnchor="middle">
              {place}
            </text>
          ) : null}
        </g>
      ) : null}
    </Svg>
  );
}

/** E-1: the standard service ratings as rungs; the load climbs to the rung above it. */
function Amps({ load, rating, ratings }: { load: number | null; rating: number; ratings: number[] }) {
  const x0 = 36, x1 = W - 36;
  const step = (x1 - x0) / (ratings.length - 1);
  const xOf = (amps: number) => {
    if (amps <= ratings[0]) return x0;
    for (let i = 1; i < ratings.length; i++) {
      if (amps <= ratings[i]) return x0 + (i - 1 + (amps - ratings[i - 1]) / (ratings[i] - ratings[i - 1])) * step;
    }
    return x1;
  };
  const at = ratings.indexOf(rating);
  return (
    <Svg label={`A ${fmt(rating)} amp service${load !== null ? ` for a ${fmt(load)} amp load` : ""}`}>
      <line className="hs-rail-line" x1={x0} x2={x1} y1={48} y2={48} />
      <line className="hs-rail-line" x1={x0} x2={x1} y1={92} y2={92} />
      {ratings.map((r, i) => (
        <line key={r} className={`hs-rung${i === at ? " hs-rung--hit" : ""}`} x1={x0 + i * step} x2={x0 + i * step} y1={48} y2={92} />
      ))}
      {load !== null ? <rect className="hs-fill hs-grow-x" x={x0} y={66} width={Math.max(4, xOf(load) - x0)} height={8} rx={4} /> : null}
      <text className="hs-note" x={x0} y={112} textAnchor="middle">
        {fmt(ratings[0])} A
      </text>
      <text className="hs-note" x={x1} y={112} textAnchor="middle">
        {fmt(ratings[ratings.length - 1])} A
      </text>
      {at >= 0 ? (
        <g className="hs-on-land">
          <text className="hs-val" x={x0 + at * step} y={36} textAnchor="middle">
            {fmt(rating)} A
          </text>
          {load !== null ? (
            <text className="hs-note" x={xOf(load)} y={130} textAnchor="middle">
              {fmt(load)} A Load
            </text>
          ) : null}
        </g>
      ) : null}
    </Svg>
  );
}

/** A-2: the plan, each wing drawn to scale, the stepped wing lighter. */
function Plan({ building }: { building: StageBuilding }) {
  const { wings } = building.form;
  const tall = Math.max(...wings.map((w) => w.stories));
  const box = { w: W - 40, h: H - 34 };
  const scale = Math.min(box.w / building.width, box.h / building.depth);
  const ox = W / 2, oy = (H - 16) / 2;
  return (
    <Svg label={`${building.form.shape ?? "Block"} plan, ${wings.length} ${wings.length === 1 ? "wing" : "wings"}`}>
      {wings.map((w, i) => (
        <rect
          key={i}
          className={`hs-wing hs-pop${w.stories < tall ? " hs-wing--low" : ""}`}
          style={{ "--i": i * 2 } as React.CSSProperties}
          x={ox + w.x0 * scale}
          y={oy + w.z0 * scale}
          width={(w.x1 - w.x0) * scale}
          height={(w.z1 - w.z0) * scale}
        />
      ))}
      {wings.some((w) => w.stories < tall) ? (
        <text className="hs-note hs-on-land" x={ox} y={H - 2} textAnchor="middle">
          Front Wing {Math.min(...wings.map((w) => w.stories))} Stories, the Rest {tall}
        </text>
      ) : null}
    </Svg>
  );
}
