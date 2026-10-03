"use client";

import { useCallback, useSyncExternalStore } from "react";

// LA-1490 (spec Decision 4). "Reply As" is the name a client reads on Kulka's
// reply. Sign-in is off, so the account alone would read open-access. The
// field starts as the version's Prepared By, and a name the user types is
// remembered in this browser. Storage can be missing or blocked, so every
// read and write is guarded and the field still works without it.

export const REPLY_AS_KEY = "kulka-reply-as";
const CHANGED = "kulka-reply-as-changed";

// Kept for this visit when storage is blocked, so a typed name still sticks.
let typed: string | null = null;

/** The name this browser remembered, an empty string if the user cleared the field, or null if none. */
export function readReplyAs(): string | null {
  try {
    return window.localStorage.getItem(REPLY_AS_KEY) ?? typed;
  } catch {
    return typed;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGED, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** The Reply As name and a setter that remembers it. `fallback` is the version's Prepared By. */
export function useReplyAs(fallback: string | null): [string, (name: string) => void] {
  const stored = useSyncExternalStore(subscribe, readReplyAs, () => null);
  const set = useCallback((name: string) => {
    typed = name;
    try {
      window.localStorage.setItem(REPLY_AS_KEY, name);
    } catch {
      // Not remembered across visits, but the field keeps the name for this one.
    }
    window.dispatchEvent(new Event(CHANGED));
  }, []);
  return [stored ?? fallback ?? "", set];
}
