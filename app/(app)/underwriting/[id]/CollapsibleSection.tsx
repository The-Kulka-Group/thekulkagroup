"use client";

import { useCallback, useId, useSyncExternalStore, type ReactNode } from "react";

// LA-2025. A case page section that collapses to its title, so a long case needs less scrolling. The toggle
// sits in the record's margin column. The section stays mounted while collapsed, so unsaved edits survive.

/**
 * Which sections a viewer collapsed, remembered in `localStorage` and read through useSyncExternalStore the
 * way view-switch.tsx reads the ROM view: the server renders every section open and the client re-syncs right
 * after. The choice is also kept in memory, so collapsing works for the visit even where storage is blocked.
 */
const collapsedInMemory = new Map<string, boolean>();
const listeners = new Set<() => void>();
const storageKey = (key: string) => `kulka.underwriting.collapsed.${key}`;

function readCollapsed(key: string, defaultCollapsed: boolean): boolean {
  const remembered = collapsedInMemory.get(key);
  if (remembered !== undefined) return remembered;
  try {
    const stored = window.localStorage.getItem(storageKey(key));
    return stored === null ? defaultCollapsed : stored === "1";
  } catch {
    return defaultCollapsed;
  }
}

function writeCollapsed(key: string, collapsed: boolean) {
  collapsedInMemory.set(key, collapsed);
  try {
    window.localStorage.setItem(storageKey(key), collapsed ? "1" : "0");
  } catch {
    // The in-memory choice still holds for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `defaultCollapsed` starts the section folded until the viewer opens it once (LA-2055). */
export function CollapsibleSection({ storage, title, className, id, defaultCollapsed = false, children }: { storage: string; title: string; className?: string; id?: string; defaultCollapsed?: boolean; children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, () => readCollapsed(storage, defaultCollapsed), () => defaultCollapsed);
  const toggle = useCallback(() => writeCollapsed(storage, !readCollapsed(storage, defaultCollapsed)), [storage, defaultCollapsed]);
  const bodyId = useId();
  const open = !collapsed;

  return (
    <>
      <div className="margin underwriting-collapse-margin">
        <button type="button" className="underwriting-collapse-toggle" aria-expanded={open} aria-controls={bodyId} aria-label={`${open ? "Collapse" : "Expand"} ${title}`} onClick={toggle}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <section id={id} className={`col-field ${className ?? ""}`.trim()} data-collapsed={open ? undefined : "true"}>
        {open ? null : (
          <h3 className="underwriting-collapsed-title">
            <button type="button" aria-expanded={false} aria-controls={bodyId} onClick={toggle}>{title}</button>
          </h3>
        )}
        <div id={bodyId} hidden={!open}>{children}</div>
      </section>
    </>
  );
}
