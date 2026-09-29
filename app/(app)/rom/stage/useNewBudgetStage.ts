"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { heldCards, holdsCostCode } from "@/lib/rom/design-holds";
import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";
import { stageBuilding, stageFactsFromResponses } from "@/lib/rom/stage-model";
import { CARD_ORDER, type StageEvent, type StageMoment } from "@/lib/rom/stage-scenes";

import { shortMoney } from "../block-layout";
import type { FieldEntry } from "../field-order";
import type { BudgetDraft } from "../LiveBudget";
import { flyTag, type Move, movesBetween, type Snapshot, snapshotOf } from "./attribution";
import type { RailState } from "./HeroStage";

// LA-1318: New Budget's stage, wired to the live budget.
//
// - Every answer and Design and Engineering card becomes a stage event.
// - A card's geometry joins the model when its moment starts, and it prices
//   the live budget when its moment lands, so the boxes move on the landing.
// - What each moment moved is the change in every box between one moment's
//   pricing and the next. Typing a number moves the budget before the answer
//   is given, so a change nobody has claimed yet waits for the next answer.
// - When a moment lands, a tag carrying its change flies from its part of the
//   model into each box it moved (the three largest), and each box keeps a
//   source line such as "S-1 +$472k".
// - LA-1324: a box a card has yet to decide (Elevator, Concrete, HVAC,
//   Electrical) counts as zero until the card lands, so no design-linked
//   price shows early, and the landing itself is the move that flies its
//   price into the box.

const CARD_CODES: ReadonlySet<string> = new Set(CARD_ORDER);
/** How long a moment waits for the budget to move before it counts as moving nothing. */
const SETTLE_MS = 350;
/** How long a box stays lit after its tag lands. */
const LIT_MS = 2200;

export function useNewBudgetStage(active: boolean, draft: BudgetDraft | null, entries: readonly FieldEntry[], area: number | null) {
  const [events, setEvents] = useState<StageEvent[]>([]);
  const [criteria, setCriteria] = useState<Record<string, StoredDerivedAssumption>>({});
  const [started, setStarted] = useState<readonly string[]>([]);
  const [landed, setLanded] = useState<readonly string[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [mark, setMark] = useState<{ code: string; keys: Set<string> } | null>(null);
  const [totalSource, setTotalSource] = useState<string | null>(null);
  // LA-1324: the moment on the hero stage, and whether it has landed.
  const [moment, setMoment] = useState<{ event: StageEvent; landed: boolean } | null>(null);

  const nextId = useRef(0);
  const tags = useRef(new Map<number, string>());
  const baseline = useRef<Snapshot | null>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const pending = useRef<{ id: number; timer: number } | null>(null);
  const moved = useRef(new Map<number, Move[]>());
  const points = useRef(new Map<number, { x: number; y: number }>());
  const flown = useRef(new Set<number>());
  const litTimer = useRef(0);

  // Closing New Budget leaves nothing behind for the next one.
  const [wasActive, setWasActive] = useState(active);
  if (wasActive !== active) {
    setWasActive(active);
    if (!active) {
      setEvents([]);
      setCriteria({});
      setStarted([]);
      setLanded([]);
      setSources({});
      setMark(null);
      setTotalSource(null);
      setMoment(null);
    }
  }
  useEffect(() => {
    if (active) return;
    tags.current.clear();
    moved.current.clear();
    points.current.clear();
    flown.current.clear();
    baseline.current = null;
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = null;
  }, [active]);

  const fly = useCallback((id: number) => {
    const moves = moved.current.get(id);
    const from = points.current.get(id);
    const tag = tags.current.get(id);
    if (!moves || !from || !tag || flown.current.has(id)) return;
    flown.current.add(id);
    const lines = moves.slice(0, 3).map((move) => {
      const money = `${move.amount > 0 ? "+" : "−"}${shortMoney(Math.abs(move.amount)).replace("-", "")}`;
      return { move, money };
    });
    lines.forEach(({ move, money }, i) => {
      const el = document.querySelector<HTMLElement>(`[data-dc-entry="${CSS.escape(move.key)}"]`);
      const arrive = () => {
        setSources((current) => ({ ...current, [move.key]: `${tag} ${money}` }));
        setMark((current) =>
          current && current.code === tag ? { code: tag, keys: new Set([...current.keys, move.key]) } : { code: tag, keys: new Set([move.key]) },
        );
        window.clearTimeout(litTimer.current);
        litTimer.current = window.setTimeout(() => setMark(null), LIT_MS);
      };
      if (el) void flyTag(money, from, el, move.amount > 0, i * 90).then(arrive);
      else arrive();
    });
  }, []);

  /** Closes the moment being priced: everything that moved since the last one is its. */
  const settle = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    pending.current = null;
    const now = snapshot.current;
    const before = baseline.current;
    moved.current.set(p.id, before && now ? movesBetween(before, now) : []);
    baseline.current = now;
    fly(p.id);
  }, [fly]);

  /** Starts pricing a moment. The next change to the boxes, or the lack of one, is its. */
  const claim = useCallback(
    (id: number, tag: string) => {
      settle();
      setTotalSource(tag);
      pending.current = { id, timer: window.setTimeout(settle, SETTLE_MS) };
    },
    [settle],
  );

  // LA-1324: the cards still designing, and the boxes that wait on them.
  const landedKey = landed.join(",");
  const designingCards = useMemo(
    () => (active && draft ? heldCards(draft.responses, new Set(landedKey.split(","))) : []),
    [active, draft, landedKey],
  );
  const holds = useMemo(() => holdsCostCode(designingCards), [designingCards]);
  const designing = useMemo(
    () => new Set(entries.filter((entry) => entry.costCodes.some(holds)).map((entry) => entry.key)),
    [entries, holds],
  );
  // Every line in a designing box waits with it, so the total leaves out
  // exactly what the field shows as Designing, the whole Elevator box included.
  const held = useMemo(() => {
    const codes = new Set(entries.filter((entry) => designing.has(entry.key)).flatMap((entry) => entry.costCodes));
    return (costCode: string) => codes.has(costCode);
  }, [entries, designing]);

  // The boxes as they stand, a designing one at zero. A change of area resets
  // the baseline, since it moves every figure at once and no single answer caused it.
  const current = useMemo(
    () => snapshotOf(entries.map((entry) => (designing.has(entry.key) ? { ...entry, midpoint: 0 } : entry)), area),
    [entries, area, designing],
  );
  useEffect(() => {
    snapshot.current = current;
    if (pending.current) settle();
    else if (!baseline.current || baseline.current.area !== current.area) baseline.current = current;
  }, [current, settle]);

  const onStageEvent = useCallback(
    (moment: StageMoment) => {
      const id = ++nextId.current;
      tags.current.set(id, moment.tag);
      setEvents((list) => [...list, { ...moment, id }]);
      // An answer prices the budget as it is given; a card prices it when it lands.
      if (moment.tag && !CARD_CODES.has(moment.source)) claim(id, moment.tag);
    },
    [claim],
  );

  const onStart = useCallback((event: StageEvent) => {
    setMoment({ event, landed: false });
    if (CARD_CODES.has(event.source)) setStarted((list) => (list.includes(event.source) ? list : [...list, event.source]));
  }, []);

  const onLand = useCallback(
    (event: StageEvent, point: { x: number; y: number }) => {
      points.current.set(event.id, point);
      setMoment({ event, landed: true });
      if (CARD_CODES.has(event.source)) {
        claim(event.id, event.tag);
        setLanded((list) => (list.includes(event.source) ? list : [...list, event.source]));
      }
      fly(event.id);
    },
    [claim, fly],
  );

  // The model: the project's answers so far, and the cards whose moment has begun.
  const startedKey = started.join(",");
  const building = useMemo(() => {
    if (!active || !draft) return null;
    const begun = new Set(startedKey.split(","));
    return stageBuilding(
      stageFactsFromResponses(draft.responses),
      Object.values(criteria).filter((card) => begun.has(card.code)),
    );
  }, [active, draft, criteria, startedKey]);

  // LA-1324: each card the job will get, along the bottom of the hero stage.
  const rail = useMemo(() => {
    const codes = new Set([...Object.keys(criteria), ...designingCards, ...landed]);
    return CARD_ORDER.filter((code) => codes.has(code)).map((code): { code: string; state: RailState } => ({
      code,
      state: landed.includes(code) ? "done" : moment && !moment.landed && moment.event.source === code ? "playing" : "designing",
    }));
  }, [criteria, designingCards, landed, moment]);

  return {
    events,
    designing,
    held,
    rail,
    building,
    landedCards: landed,
    moment,
    criteria,
    sources,
    mark,
    totalSource,
    onStageEvent,
    onCriteria: setCriteria,
    onStart,
    onLand,
  };
}
