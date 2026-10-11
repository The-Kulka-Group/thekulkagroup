"use client";

import { useEffect, useRef, useState } from "react";

import type { PartPriceMap } from "@/lib/rom/part-prices";
import type { StagePart } from "@/lib/rom/stage-scenes";

import { changedParts } from "./answer-feedback";

// LA-2213: watches the live part prices and names the parts an answer just
// changed, once each time. A change of gross area moves every figure at once
// and no answer caused it, so it pulses nothing, the same rule the header's
// change flash and the box diff follow.

export type Pulse = { id: number; parts: readonly StagePart[] };

export function useAnswerFeedback(active: boolean, prices: PartPriceMap | null, area: number | null): Pulse | null {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const last = useRef<{ prices: PartPriceMap; area: number | null } | null>(null);

  useEffect(() => {
    if (!active || !prices) {
      last.current = null;
      return;
    }
    const before = last.current;
    last.current = { prices, area };
    if (!before || before.area !== area || before.prices === prices) return;
    const parts = changedParts(before.prices, prices);
    if (parts.length > 0) setPulse((now) => ({ id: (now?.id ?? 0) + 1, parts }));
  }, [active, prices, area]);

  return pulse;
}
