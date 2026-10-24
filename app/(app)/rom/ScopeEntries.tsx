"use client";

import { useEffect, useState } from "react";

import { useCanEdit } from "@/components/access/ToolLevel";

import "./scope-entries.css";

// LA-1503. A line's Inclusions and Exclusions, in its block panel. Draft
// Entries asks AI for them from Kulka's definition of the item and the
// project's answers; they save straight away as drafts (no Generate step).
// The estimator edits, approves or removes each one, or writes one by hand.
// Only an approved entry reaches a published budget, so the panel marks
// every entry Approved or Draft. Changed words need approving again.

export type PanelEntry = {
  id: string;
  side: "include" | "exclude";
  text: string;
  drafter: "ai" | "user";
  approvedBy: string | null;
};

const SIDES = [
  { side: "include", title: "Inclusions", empty: "No inclusions yet." },
  { side: "exclude", title: "Exclusions", empty: "No exclusions yet." },
] as const;

async function readError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => ({}));
  return typeof body.error === "string" ? body.error : fallback;
}

export function ScopeEntries({ projectId, runId, costCode }: { projectId: string; runId: string; costCode: string }) {
  const base = `/api/rom/projects/${projectId}/scope-entries`;
  const canEdit = useCanEdit();
  const [entries, setEntries] = useState<PanelEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [adding, setAdding] = useState<Record<"include" | "exclude", string>>({ include: "", exclude: "" });

  useEffect(() => {
    let live = true;
    void fetch(`${base}?costCode=${encodeURIComponent(costCode)}`)
      .then(async (response) => {
        if (!live) return;
        if (!response.ok) {
          setError(await readError(response, "The entries could not be read."));
          setEntries([]);
          return;
        }
        setEntries(((await response.json()).entries as PanelEntry[]) ?? []);
      })
      .catch(() => live && setError("The entries could not be read. Check the connection."));
    return () => {
      live = false;
    };
  }, [base, costCode]);

  const replace = (entry: PanelEntry) => setEntries((all) => (all ?? []).map((e) => (e.id === entry.id ? entry : e)));

  async function draft() {
    if (drafting) return;
    setDrafting(true);
    setError(null);
    try {
      const response = await fetch(`${base}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costCode, runId }),
      });
      if (!response.ok) setError(await readError(response, "The draft could not be made."));
      else setEntries((await response.json()).entries as PanelEntry[]);
    } catch {
      setError("The draft could not be made. Check the connection and try again.");
    } finally {
      setDrafting(false);
    }
  }

  async function change(id: string, patch: { text?: string; approved?: boolean }) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`${base}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) {
        setError(await readError(response, "The entry could not be saved."));
        return false;
      }
      replace((await response.json()).entry as PanelEntry);
      return true;
    } catch {
      setError("The entry could not be saved. Check the connection and try again.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const response = await fetch(`${base}/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) {
        setError(await readError(response, "The entry could not be removed."));
        return;
      }
      setEntries((all) => (all ?? []).filter((e) => e.id !== id));
    } catch {
      setError("The entry could not be removed. Check the connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function add(side: "include" | "exclude", event: React.FormEvent) {
    event.preventDefault();
    const text = adding[side].trim();
    if (text === "") return;
    setBusyId(`add-${side}`);
    setError(null);
    try {
      const response = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costCode, side, text }),
      });
      if (!response.ok) {
        setError(await readError(response, "The entry could not be added."));
        return;
      }
      const entry = (await response.json()).entry as PanelEntry;
      setEntries((all) => [...(all ?? []), entry]);
      setAdding((current) => ({ ...current, [side]: "" }));
    } catch {
      setError("The entry could not be added. Check the connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function approveAll() {
    for (const entry of (entries ?? []).filter((e) => !e.approvedBy)) {
      if (!(await change(entry.id, { approved: true }))) return;
    }
  }

  const drafts = (entries ?? []).filter((e) => !e.approvedBy).length;

  return (
    <section className="se" aria-label="Inclusions and Exclusions">
      <h3>Inclusions and Exclusions</h3>
      <p className="rb-pp">
        Only approved entries reach the client page. Drafts start from Kulka&rsquo;s definition of this item and the
        project&rsquo;s answers, never from drawings.
      </p>
      {canEdit ? <div className="rb-acts">
        <button className="btn" type="button" onClick={draft} disabled={drafting || entries === null}>
          {drafting ? "Drafting" : (entries?.length ?? 0) > 0 ? "Draft More" : "Draft Entries"}
        </button>
        {drafts > 0 ? (
          <button className="btn" type="button" onClick={approveAll} disabled={busyId !== null}>
            {drafts === 1 ? "Approve the Draft" : `Approve All ${drafts} Drafts`}
          </button>
        ) : null}
      </div> : null}
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      {entries === null ? <p className="rb-pp">Reading the entries.</p> : null}
      {entries !== null
        ? SIDES.map(({ side, title, empty }) => {
            const list = entries.filter((e) => e.side === side);
            return (
              <div key={side} className="se-side">
                <h4 className="se-h">{title}</h4>
                {list.length === 0 ? <p className="rb-pp">{empty}</p> : null}
                <ul className="se-list">
                  {list.map((entry) => {
                    const busy = busyId === entry.id;
                    const isEditing = editing?.id === entry.id;
                    return (
                      <li key={entry.id} className={`se-entry${entry.approvedBy ? " se-entry--ok" : ""}`}>
                        {isEditing ? (
                          <form
                            className="se-edit"
                            onSubmit={async (event) => {
                              event.preventDefault();
                              if (await change(entry.id, { text: editing.text })) setEditing(null);
                            }}
                          >
                            <input
                              className="input"
                              aria-label={`Edit ${entry.text}`}
                              autoFocus
                              value={editing.text}
                              disabled={busy}
                              onChange={(e) => setEditing({ id: entry.id, text: e.target.value })}
                            />
                            <button className="btn" type="submit" disabled={busy}>
                              Save
                            </button>
                            <button className="btn" type="button" onClick={() => setEditing(null)} disabled={busy}>
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <>
                            <span className="se-text">{entry.text}</span>
                            <span className="se-state">
                              <span className={`rb-dot rb-dot--${entry.approvedBy ? "high" : "medium"}`} aria-hidden="true" />
                              {entry.approvedBy ? "Approved" : entry.drafter === "ai" ? "AI Draft" : "Draft"}
                            </span>
                            {canEdit ? <span className="se-acts">
                              <button
                                type="button"
                                className="se-btn"
                                disabled={busy}
                                onClick={() => change(entry.id, { approved: !entry.approvedBy })}
                              >
                                {entry.approvedBy ? "Unapprove" : "Approve"}
                              </button>
                              <button
                                type="button"
                                className="se-btn"
                                disabled={busy}
                                onClick={() => setEditing({ id: entry.id, text: entry.text })}
                              >
                                Edit
                              </button>
                              <button type="button" className="se-btn se-btn--x" disabled={busy} onClick={() => remove(entry.id)}>
                                Remove
                              </button>
                            </span> : null}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {canEdit ? <form className="se-edit" onSubmit={(event) => add(side, event)}>
                  <input
                    className="input"
                    aria-label={`Add to ${title}`}
                    placeholder={`Add to ${title}`}
                    value={adding[side]}
                    disabled={busyId === `add-${side}`}
                    onChange={(e) => setAdding((current) => ({ ...current, [side]: e.target.value }))}
                  />
                  <button className="btn" type="submit" disabled={busyId === `add-${side}` || adding[side].trim() === ""}>
                    Add
                  </button>
                </form> : null}
              </div>
            );
          })
        : null}
    </section>
  );
}
