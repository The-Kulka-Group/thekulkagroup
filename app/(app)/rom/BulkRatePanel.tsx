"use client";

import { useEffect, useRef, useState } from "react";

import { asksWords } from "./RatePanel";

// LA-1249. Matt, 2026-09-28: one button asks Claude for a rate on every item in the
// budget that has none, all at once. Each suggestion comes from the same
// route as the single-item panel (RatePanel.tsx) and fills its row as it
// arrives. Nothing saves until Save All Rates, so the estimator still sees
// every figure before it prices a line (LA-9: a model's figure never solely
// determines a line). Each saved rate prices this budget only (LA-1245),
// and saving records one new run.

type Suggestion = { value: number; low: number; high: number; reasoning: string; model: string; asks?: number[] };

type Row = {
  costCode: string;
  label: string;
  status: "waiting" | "suggesting" | "ready" | "failed";
  value: string;
  suggestion: Suggestion | null;
  error: string | null;
};

const money = (value: number) => `$${value.toLocaleString("en-US")}`;
/** Suggestions run a few at a time so a long list does not hit the API at once. */
const AT_ONCE = 3;

export function BulkRatePanel({
  projectId,
  items,
  onSaved,
}: {
  projectId: string;
  items: { costCode: string; label: string }[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    items.map((item) => ({ ...item, status: "waiting", value: "", suggestion: null, error: null })),
  );
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  function patch(costCode: string, change: Partial<Row>) {
    setRows((current) => current.map((row) => (row.costCode === costCode ? { ...row, ...change } : row)));
  }

  async function suggestOne(costCode: string) {
    patch(costCode, { status: "suggesting", error: null });
    try {
      const response = await fetch("/api/rom/rates/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, costCode }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.suggestion) {
        patch(costCode, { status: "failed", error: body.error ?? "No rate came back." });
        return;
      }
      setMissing((body.missing as string[]) ?? []);
      patch(costCode, { status: "ready", suggestion: body.suggestion, value: String(body.suggestion.value) });
    } catch {
      patch(costCode, { status: "failed", error: "Check the connection and try again." });
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const queue = items.map((item) => item.costCode);
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) await suggestOne(next);
    };
    void Promise.all(Array.from({ length: Math.min(AT_ONCE, queue.length) }, worker));
    // Runs once for the items the panel opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ready = rows.filter((row) => row.status === "ready");
  const pending = rows.some((row) => row.status === "waiting" || row.status === "suggesting");

  async function saveAll() {
    if (saving || ready.length === 0) return;
    const amounts = ready.map((row) => ({ row, amount: Number(row.value.replace(/[$,\s]/g, "")) }));
    const bad = amounts.find(({ amount }) => !Number.isFinite(amount) || amount <= 0);
    if (bad) {
      setError(`Enter a dollar amount above zero for ${bad.row.label}.`);
      return;
    }
    setSaving(true);
    setError(null);
    for (const { row, amount } of amounts) {
      try {
        const response = await fetch("/api/rom/rates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, costCode: row.costCode, value: amount, scope: "project", proposal: row.suggestion }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          setError(`${row.label}: ${body.error ?? "the rate could not be saved."} Rates above it were saved.`);
          setSaving(false);
          return;
        }
      } catch {
        setError(`${row.label} could not be saved. Check the connection. Rates above it were saved.`);
        setSaving(false);
        return;
      }
    }
    onSaved();
  }

  return (
    <div className="br">
      <p className="rb-pp">
        Claude is asked three times for each item below, from this budget&apos;s ZIP, labor type and facts, and the
        figure is the middle answer. Check each
        figure and change any you disagree with. The rates price this budget only, and saving records one new run.
      </p>
      {missing.length > 0 ? (
        <p className="rb-pp">
          This project has no {missing.join(" or ")} yet, so the ranges are wider. Add it in Edit Project for closer
          figures.
        </p>
      ) : null}
      <ul className="br-list">
        {rows.map((row) => (
          <li key={row.costCode} className="br-row">
            <div className="br-top">
              <span className="br-name">{row.label}</span>
              {row.status === "ready" ? (
                <input
                  className="input num br-in"
                  inputMode="decimal"
                  aria-label={`${row.label}, dollars each per structure`}
                  value={row.value}
                  disabled={saving}
                  onChange={(e) => patch(row.costCode, { value: e.target.value })}
                />
              ) : (
                <span className="br-state">
                  {row.status === "failed" ? "No Rate" : row.status === "suggesting" ? "Suggesting" : "Waiting"}
                </span>
              )}
            </div>
            {row.suggestion ? (
              <p className="br-note">
                {row.suggestion.asks && row.suggestion.asks.length > 1 ? `${asksWords(row.suggestion.asks)} ` : ""}
                Range {money(row.suggestion.low)} to {money(row.suggestion.high)} each. {row.suggestion.reasoning}
              </p>
            ) : null}
            {row.status === "failed" ? (
              <p className="br-note br-note--error">
                {row.error}{" "}
                <button className="nb-retry" type="button" onClick={() => void suggestOne(row.costCode)}>
                  Try Again
                </button>
              </p>
            ) : null}
          </li>
        ))}
      </ul>
      {error ? (
        <p className="rb-pp rb-pp--error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="rb-acts">
        <button className="btn btn--primary" type="button" onClick={saveAll} disabled={saving || pending || ready.length === 0}>
          {saving
            ? "Saving"
            : pending
              ? "Suggesting Rates"
              : ready.length === 0
                ? "No Rates to Save"
                : ready.length === rows.length
                ? "Save All Rates"
                : `Save ${ready.length} of ${rows.length} Rates`}
        </button>
      </div>
    </div>
  );
}
