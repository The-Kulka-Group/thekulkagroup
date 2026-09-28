"use client";

import { useEffect, useState } from "react";

// Matt, 2026-09-28: a supporting item showing "No Rate Yet" takes a rate on
// its card. This is the panel the card opens. The rate is dollars each, one
// per structure coming down (lib/rom/stated-rates.ts), and it joins the
// benchmarks for this project's type and construction kind, so every such
// budget prices the item from then on. That reach is why this panel keeps a
// Save Rate button where the other panels save as you type.
//
// LA-1245: Suggest a Rate asks Claude for a figure from the project's ZIP,
// labor type and facts. It fills the field and shows its range and reason;
// the estimator keeps or changes the figure before saving (LA-9: a model's
// figure never solely determines a line). A rate that began as a suggestion
// prices this budget only (Matt, 2026-09-28), with the suggestion kept
// beside it; a rate typed without one is the shared rate, as before.
//
// LA-1249. Matt, 2026-09-28: a saved rate can be edited. A priced supporting item's
// panel opens this in edit mode, filled with the rate it has. The change
// stays where the rate lives: a budget-only rate changes for this budget, a
// shared rate changes for every budget of this kind.

type Saved = { projectRate: { value: number; suggested: boolean } | null; sharedRate: { value: number } | null };

type Suggestion = { value: number; low: number; high: number; reasoning: string; model: string };

const money = (value: number) => `$${value.toLocaleString("en-US")}`;

export function RatePanel({
  projectId,
  costCode,
  driverLabel,
  editing = false,
  onSaved,
}: {
  projectId: string;
  costCode: string;
  /** The driver that brings the item in, such as Structure Demolition. */
  driverLabel: string | null;
  /** True when the item is priced and this panel changes its saved rate. */
  editing?: boolean;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);

  useEffect(() => {
    if (!editing) return;
    let live = true;
    void fetch(`/api/rom/rates?projectId=${projectId}&costCode=${encodeURIComponent(costCode)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((body: Saved | null) => {
        if (!live || !body) return;
        setSaved(body);
        const current = body.projectRate?.value ?? body.sharedRate?.value;
        if (current !== undefined) setValue((existing) => (existing === "" ? String(current) : existing));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [editing, projectId, costCode]);

  // Where a save lands: a suggestion or a budget-only rate stays on this
  // budget; a shared card rate being edited is changed in place.
  const target: "project" | "replace" | "shared" =
    suggestion || saved?.projectRate ? "project" : saved?.sharedRate ? "replace" : "shared";

  async function suggest() {
    if (suggesting || busy) return;
    setSuggesting(true);
    setError(null);
    try {
      const response = await fetch("/api/rom/rates/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, costCode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.suggestion) {
        setError(body.error ?? "A rate could not be suggested.");
        return;
      }
      setSuggestion(body.suggestion as Suggestion);
      setMissing((body.missing as string[]) ?? []);
      setValue(String(body.suggestion.value));
    } catch {
      setError("A rate could not be suggested. Check the connection and try again.");
    } finally {
      setSuggesting(false);
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const amount = Number(value.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Enter a dollar amount above zero.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/rom/rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          target === "project"
            ? { projectId, costCode, value: amount, scope: "project", proposal: suggestion }
            : { projectId, costCode, value: amount, replace: target === "replace" },
        ),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The rate could not be saved.");
        setBusy(false);
        return;
      }
      onSaved();
    } catch {
      setError("The rate could not be saved. Check the connection and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <p className="rb-pp">
        {editing
          ? saved?.projectRate
            ? `This budget has its own rate${saved.projectRate.suggested ? ", which began as a suggestion" : ""}.`
            : saved?.sharedRate
              ? "This rate is shared by every budget of this project type and construction kind."
              : "Reading the saved rate."
          : "No rate yet."}
        {driverLabel ? ` It comes in with ${driverLabel}, one for each structure coming down.` : ""}
      </p>
      <label className="rt-field">
        <span className="field-label t-label">Dollars Each, per Structure</span>
        <input
          className="input num"
          inputMode="decimal"
          autoFocus
          value={value}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <div className="rb-acts">
        <button className="btn" type="button" onClick={suggest} disabled={busy || suggesting}>
          {suggesting ? "Suggesting" : suggestion ? "Suggest Again" : "Suggest a Rate"}
        </button>
      </div>
      {suggestion ? (
        <div className="rt-sug">
          <p className="rb-pp">
            <b>{money(suggestion.value)} each</b>, range {money(suggestion.low)} to {money(suggestion.high)}.
          </p>
          <p className="rb-pp">{suggestion.reasoning}</p>
          {missing.length > 0 ? (
            <p className="rb-pp">
              This project has no {missing.join(" or ")} yet, so the range is wider. Add it in Edit Project for a
              closer figure.
            </p>
          ) : null}
        </div>
      ) : null}
      <p className="rb-pp">
        {suggestion
          ? "A suggested rate prices this budget only. Keep the figure or change it, then save. The suggestion is kept with it."
          : target === "project"
            ? "The change applies to this budget only."
            : target === "replace"
              ? "The change applies to every budget of this project type and construction kind. Use Suggest a Rate for a figure for this budget only."
              : "A rate you type prices the item on every budget of this project type and construction kind. Use Suggest a Rate for a figure fitted to this budget's location and labor type."}{" "}
        Saving records a new run of this budget.
      </p>
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rb-acts">
        <button className="btn btn--primary" type="submit" disabled={busy || value.trim() === ""}>
          {busy ? "Saving" : "Save Rate"}
        </button>
      </div>
    </form>
  );
}
