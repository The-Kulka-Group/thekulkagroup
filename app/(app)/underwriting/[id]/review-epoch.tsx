"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";

import type { ReviewSectionKey } from "@/lib/underwriting/presentation";

// LA-2054. The editors copy their props into state when they mount, so after Mark Section Done saved new
// review states on the server, an editor still showed the old ones and a later save would write them back.
// ReviewList calls bumpReviewEpoch once the refreshed page has arrived. Each editor sits in a RemountOnReviewDone
// that changes its key then, so the editor mounts again from the saved props. An editor's own saves bump nothing,
// so its saved message stays.

const epochs = new Map<ReviewSectionKey, number>();
const listeners = new Set<() => void>();

export function bumpReviewEpoch(section: ReviewSectionKey) {
  epochs.set(section, (epochs.get(section) ?? 0) + 1);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function RemountOnReviewDone({ sections, children }: { sections: ReviewSectionKey[]; children: ReactNode }) {
  const epoch = useSyncExternalStore(
    subscribe,
    () => sections.map((section) => epochs.get(section) ?? 0).join("."),
    () => "",
  );
  return <Fragment key={epoch}>{children}</Fragment>;
}
