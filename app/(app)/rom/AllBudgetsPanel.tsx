"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useCanEdit } from "@/components/access/ToolLevel";
import type { RomBudgetRow } from "@/lib/rom/budgets";

// LA-1322: the All Budgets menu, in the header's side panel. Every budget,
// active first and archived after, each with Open, Edit, Archive or Restore,
// and Delete. Delete asks on the row before it acts and can't be undone; a
// past job other budgets price from shows why it can't be deleted instead.

const AREA = new Intl.NumberFormat("en-US");
const STAMP = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

type Load = { phase: "loading" } | { phase: "ready"; budgets: RomBudgetRow[] } | { phase: "failed"; error: string };

async function readBudgets(): Promise<Load> {
  try {
    const response = await fetch("/api/rom/projects", { cache: "no-store" });
    const body = (await response.json()) as { budgets?: RomBudgetRow[]; error?: string };
    if (!response.ok || !body.budgets) throw new Error(body.error ?? "The budgets could not be read.");
    return { phase: "ready", budgets: body.budgets };
  } catch (cause) {
    return { phase: "failed", error: cause instanceof Error ? cause.message : "The budgets could not be read." };
  }
}

export function AllBudgetsPanel({ currentProjectId }: { currentProjectId?: string }) {
  const router = useRouter();
  const canEdit = useCanEdit();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => setLoad(await readBudgets()), []);

  useEffect(() => {
    let live = true;
    void readBudgets().then((next) => {
      if (live) setLoad(next);
    });
    return () => {
      live = false;
    };
  }, []);

  const act = async (budget: RomBudgetRow, action: "archive" | "restore" | "delete") => {
    setBusy(budget.id);
    setError(null);
    try {
      const response =
        action === "delete"
          ? await fetch(`/api/rom/projects/${budget.id}`, { method: "DELETE" })
          : await fetch(`/api/rom/projects/${budget.id}/${action}`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "That didn't save. Try again.");
      }
      setConfirming(null);
      await refresh();
      // The header's picker and the page follow the change; a deleted or
      // archived budget that was on screen leaves it.
      if (budget.id === currentProjectId && action !== "restore") router.push("/rom");
      else router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That didn't save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (load.phase === "loading") return <p className="ab-note">Reading the budgets.</p>;
  if (load.phase === "failed")
    return (
      <p className="ab-note" role="alert">
        {load.error}{" "}
        <button type="button" className="ab-pill" onClick={() => void refresh()}>
          Try Again
        </button>
      </p>
    );
  if (load.budgets.length === 0) return <p className="ab-note">No budgets yet. Start one with New Budget.</p>;

  const active = load.budgets.filter((one) => !one.archivedAt);
  const archived = load.budgets.filter((one) => one.archivedAt);

  const row = (budget: RomBudgetRow) => {
    const facts = [
      budget.grossSquareFeet ? `${AREA.format(budget.grossSquareFeet)} SF` : null,
      budget.unitCount ? `${AREA.format(budget.unitCount)} Units` : null,
      budget.runCount === 1 ? "1 Run" : `${budget.runCount} Runs`,
      budget.lastRunAt ? `Last Run ${STAMP.format(new Date(budget.lastRunAt))}` : null,
    ].filter(Boolean);
    const isCurrent = budget.id === currentProjectId;
    const disabled = busy !== null;
    return (
      <li key={budget.id} className={`ab-row${isCurrent ? " ab-row--current" : ""}`}>
        <div className="ab-name">
          {budget.name}
          {isCurrent ? <span className="ab-tag">On Screen</span> : null}
          {budget.feedsPricing ? <span className="ab-tag">Past Job, Feeds Pricing</span> : null}
        </div>
        <div className="ab-facts num">{facts.join(" · ")}</div>
        {confirming === budget.id ? (
          <div className="ab-confirm" role="group" aria-label={`Delete ${budget.name}`}>
            <p>
              Delete {budget.name}
              {budget.runCount === 0 ? "" : budget.runCount === 1 ? " and its run" : ` and its ${budget.runCount} runs`}? This
              can&apos;t be undone.
            </p>
            <div className="ab-acts">
              <button
                type="button"
                className="ab-pill ab-pill--danger"
                disabled={disabled}
                onClick={() => void act(budget, "delete")}
              >
                {busy === budget.id ? "Deleting" : "Delete Permanently"}
              </button>
              <button type="button" className="ab-pill" disabled={disabled} onClick={() => setConfirming(null)}>
                Keep It
              </button>
            </div>
          </div>
        ) : (
          <div className="ab-acts">
            {budget.archivedAt ? null : (
              <>
                <button type="button" className="ab-pill" disabled={disabled} onClick={() => router.push(`/rom?project=${budget.id}`)}>
                  Open
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    className="ab-pill"
                    disabled={disabled}
                    onClick={() => router.push(`/rom?project=${budget.id}&edit=1`)}
                  >
                    Edit
                  </button>
                ) : null}
              </>
            )}
            {canEdit ? (
              <button
                type="button"
                className="ab-pill"
                disabled={disabled}
                onClick={() => void act(budget, budget.archivedAt ? "restore" : "archive")}
              >
                {busy === budget.id ? "Saving" : budget.archivedAt ? "Restore" : "Archive"}
              </button>
            ) : null}
            {budget.feedsPricing || !canEdit ? null : (
              <button
                type="button"
                className="ab-pill ab-pill--quiet-danger"
                disabled={disabled}
                onClick={() => {
                  setError(null);
                  setConfirming(budget.id);
                }}
              >
                Delete
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="ab">
      {error ? (
        <p className="ab-note ab-note--error" role="alert">
          {error}
        </p>
      ) : null}
      <h3 className="ab-h">Active</h3>
      {active.length === 0 ? <p className="ab-note">No active budgets.</p> : <ul className="ab-list">{active.map(row)}</ul>}
      {archived.length > 0 ? (
        <>
          <h3 className="ab-h">Archived</h3>
          <ul className="ab-list">{archived.map(row)}</ul>
        </>
      ) : null}
    </div>
  );
}
