"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { RomView } from "./view-groups";

// LA-1159, ADR 0006, CONTEXT.md: View. The two-way switch in the header band
// that picks how the field below groups its lines. By Division is LA-1152
// work still to come and is not built here.

const STORAGE_KEY = "kulka.rom.view";
const listeners = new Set<() => void>();

function readStoredView(): RomView | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "scope" || stored === "package" ? stored : null;
  } catch {
    // A blocked or unavailable store never breaks the page; it just forgets.
    return null;
  }
}

function writeStoredView(view: RomView): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Same as above: nothing here can fail loudly.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// The server has no localStorage, so it renders as though nothing were
// stored yet; the client re-syncs to the real stored choice, if any, right
// after (useSyncExternalStore's own job, not an effect calling setState).
function getServerSnapshot(): RomView | null {
  return null;
}

/**
 * The view on screen, remembered per viewer. `defaultView` is what a screen
 * with nothing stored yet opens on -- By Scope for New budget, By Package for
 * a saved ROM (CONTEXT.md: View) -- and it stays reactive to that until the
 * viewer picks a view themselves; from then on their last choice wins
 * everywhere, New budget and a saved ROM alike, the same way a browser
 * remembers a setting rather than a screen.
 */
export function useRomView(defaultView: RomView): [RomView, (view: RomView) => void] {
  const stored = useSyncExternalStore(subscribe, readStoredView, getServerSnapshot);
  const view = stored ?? defaultView;
  const change = useCallback((next: RomView) => writeStoredView(next), []);
  return [view, change];
}

/** Title Case, "By Scope · By Package" (CONTEXT.md / naming-title-case). */
export function ViewSwitch({ view, onChange }: { view: RomView; onChange: (view: RomView) => void }) {
  return (
    <div className="rb-vsw" role="group" aria-label="View">
      <button
        type="button"
        className="rb-vopt"
        aria-pressed={view === "scope"}
        onClick={() => onChange("scope")}
      >
        By Scope
      </button>
      <span className="rb-vdot" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        className="rb-vopt"
        aria-pressed={view === "package"}
        onClick={() => onChange("package")}
      >
        By Package
      </button>
    </div>
  );
}
