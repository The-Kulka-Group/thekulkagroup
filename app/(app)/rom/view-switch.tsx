"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { RomOrder } from "./field-order";
import type { RomView } from "./view-groups";

// LA-1159, ADR 0006, CONTEXT.md: View. The two-way switch in the header band
// that picks how the field below groups its lines. By Division is LA-1152
// work still to come and is not built here.

// LA-1181 adds the MasterFormat / Largest First switch beside it, remembered
// the same way under its own key.

/**
 * One remembered choice per viewer, shared by every screen: `localStorage`
 * under `key`, read through useSyncExternalStore so the server renders the
 * default and the client re-syncs right after, with no effect calling
 * setState.
 */
function rememberedChoice<T extends string>(key: string, allowed: readonly T[]) {
  const listeners = new Set<() => void>();
  const read = (): T | null => {
    try {
      const stored = window.localStorage.getItem(key);
      return allowed.includes(stored as T) ? (stored as T) : null;
    } catch {
      // A blocked or unavailable store never breaks the page; it just forgets.
      return null;
    }
  };
  const write = (value: T) => {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Same as above: nothing here can fail loudly.
    }
    listeners.forEach((listener) => listener());
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return { read, write, subscribe };
}

const viewStore = rememberedChoice<RomView>("kulka.rom.view", ["scope", "package"]);
const orderStore = rememberedChoice<RomOrder>("kulka.rom.order", ["masterformat", "largest"]);

// The server has no localStorage, so it renders as though nothing were
// stored yet.
function getServerSnapshot(): null {
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
  const stored = useSyncExternalStore(viewStore.subscribe, viewStore.read, getServerSnapshot);
  const view = stored ?? defaultView;
  const change = useCallback((next: RomView) => viewStore.write(next), []);
  return [view, change];
}

/**
 * LA-1181: the order the field sorts in, remembered per viewer the same way.
 * MasterFormat is the default on both screens and in both views.
 */
export function useRomOrder(): [RomOrder, (order: RomOrder) => void] {
  const stored = useSyncExternalStore(orderStore.subscribe, orderStore.read, getServerSnapshot);
  const change = useCallback((next: RomOrder) => orderStore.write(next), []);
  return [stored ?? "masterformat", change];
}

/** "MasterFormat · Largest First", the same pill as the view switch. */
export function OrderSwitch({ order, onChange }: { order: RomOrder; onChange: (order: RomOrder) => void }) {
  return (
    <div className="rb-vsw" role="group" aria-label="Order">
      <button
        type="button"
        className="rb-vopt"
        aria-pressed={order === "masterformat"}
        onClick={() => onChange("masterformat")}
      >
        MasterFormat
      </button>
      <span className="rb-vdot" aria-hidden="true">
        ·
      </span>
      <button
        type="button"
        className="rb-vopt"
        aria-pressed={order === "largest"}
        onClick={() => onChange("largest")}
      >
        Largest First
      </button>
    </div>
  );
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
