"use client";

import { useState } from "react";

// Matt, 2026-09-28: a supporting item showing "No Rate Yet" takes a rate on
// its card. This is the panel the card opens. The rate is dollars each, one
// per structure coming down (lib/rom/stated-rates.ts), and it joins the
// benchmarks for this project's type and construction kind, so every such
// budget prices the item from then on. That reach is why this panel keeps a
// Save Rate button where the other panels save as you type.

export function RatePanel({
  projectId,
  costCode,
  driverLabel,
  onSaved,
}: {
  projectId: string;
  costCode: string;
  /** The driver that brings the item in, such as Structure Demolition. */
  driverLabel: string | null;
  onSaved: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        body: JSON.stringify({ projectId, costCode, value: amount }),
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
        No rate yet.{driverLabel ? ` It comes in with ${driverLabel}, one for each structure coming down.` : ""}
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
      <p className="rb-pp">
        This rate prices the item on every budget of this project type and construction kind, recorded with
        today&rsquo;s date. Saving records a new run of this budget.
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
