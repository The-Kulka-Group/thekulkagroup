"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import type { RomBudgetOption, RomLink } from "@/lib/underwriting/rom-link";

import { expandSection } from "./CollapsibleSection";

// LA-2417. Where a case gets its construction cost from the ROM: build a
// budget and come back filled, or pick a budget that already exists. Leaving
// and coming back are full page loads, so the card morphs into the budget
// screen and back (daylight.css, "Handoff between underwriting and the ROM").

const MONEY = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const MILLIONS = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 1, maximumFractionDigits: 1 });
const AREA = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });

const millions = (value: number) => `${MILLIONS.format(value / 1_000_000)}M`;

export function RomHardCosts({
  caseId,
  grossSquareFeet,
  link,
  budgets,
  beforeLeave,
}: {
  caseId: string;
  grossSquareFeet?: number;
  link: RomLink | null;
  budgets: RomBudgetOption[];
  /** Saves the case's unsaved schedule edits. False keeps the user on the case. */
  beforeLeave: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"leaving" | "linking" | "updating" | null>(null);
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState("");
  const card = useRef<HTMLDivElement>(null);

  // Back from the ROM, or just filled: the card lights for a moment.
  useEffect(() => {
    const element = card.current;
    if (!element || new URLSearchParams(window.location.search).get("from") !== "rom") return;
    element.scrollIntoView({ block: "center" });
    element.classList.add("uw-rom-card--filled");
    // No cleanup: the URL is cleared below, so a second run of this effect would never remove the light.
    window.setTimeout(() => element.classList.remove("uw-rom-card--filled"), 2400);
    window.history.replaceState(null, "", `${window.location.pathname}#hard-costs`);
  }, []);

  // A budget saved while the user was away fills the case the first time the case opens.
  const unfilled = Boolean(link?.latest && !link.appliedRunId);
  useEffect(() => {
    if (!unfilled) return;
    let cancelled = false;
    void fetch(`/api/underwriting/cases/${caseId}/rom`, { method: "POST" }).then((response) => {
      if (!cancelled && response.ok) router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [unfilled, caseId, router]);

  async function leaveFor(url: string) {
    setBusy("leaving");
    setError(undefined);
    if (!(await beforeLeave())) {
      setBusy(null);
      setError("Save the cost schedule before leaving. The error is shown below.");
      return;
    }
    expandSection("costs");
    // A full page load, not router.push: only a document navigation runs the cross-document view transition.
    window.location.assign(url);
  }

  async function fill(projectId?: string) {
    setBusy(projectId ? "linking" : "updating");
    setError(undefined);
    // The fill remounts the schedule editor on the saved lines, so unsaved edits save first.
    if (!(await beforeLeave())) {
      setBusy(null);
      setError("Save the cost schedule before filling it. The error is shown below.");
      return;
    }
    try {
      const response = await fetch(`/api/underwriting/cases/${caseId}/rom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectId ? { projectId } : {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? "The budget could not be linked.");
        return;
      }
      // The editor remounts on the filled lines; the new card lights the way it does back from the ROM.
      window.history.replaceState(null, "", `${window.location.pathname}?from=rom#hard-costs`);
      router.refresh();
    } catch {
      setError("The request failed. Check the connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  const figures = link?.applied ?? null;
  const newer = figures && link?.latest && link.latest.runId !== link.appliedRunId
    ? { ...link.latest, change: link.latest.total - figures.total }
    : null;
  const areaDiffers = figures?.grossSquareFeet && grossSquareFeet && Math.round(figures.grossSquareFeet) !== Math.round(grossSquareFeet);

  return (
    <div id="hard-costs" ref={card} className="uw-rom-card" aria-busy={busy !== null}>
      <div className="uw-rom-head">
        <div>
          <h4>Construction Costs</h4>
          {link ? (
            <p className="t-meta">
              <span className={`uw-rom-dot uw-rom-dot--${figures ? "done" : "working"}`} aria-hidden="true" />
              {figures
                ? `From ROM: ${link.projectName}, saved ${DATE.format(new Date(figures.startedAt))}`
                : `Construction Budget in Progress: ${link.projectName}`}
            </p>
          ) : (
            <p className="t-meta">Price hard cost from a ROM budget instead of typing it in.</p>
          )}
        </div>
        {link ? (
          <button type="button" className="btn btn--secondary" disabled={busy !== null} onClick={() => void leaveFor(`/rom?project=${link.projectId}`)}>
            {figures ? "Open in ROM" : "Resume"}
          </button>
        ) : null}
      </div>

      {figures ? (
        <>
          <div className="uw-rom-figures">
            <div><span className="t-label">Total</span><strong className="num">{millions(figures.total)}</strong></div>
            <div><span className="t-label">Per Gross SF</span><strong className="num">{figures.perGrossSquareFoot ? MONEY.format(figures.perGrossSquareFoot) : "Not Recorded"}</strong></div>
            <div><span className="t-label">Range</span><strong className="num">{millions(figures.low)} to {millions(figures.high)}</strong></div>
          </div>
          <p className="t-meta">The Hard Cost line below carries this budget, priced per gross SF{figures.grossSquareFeet ? ` on ${AREA.format(figures.grossSquareFeet)} SF` : ""}.</p>
          {areaDiffers ? (
            <p className="uw-rom-note">This case has {AREA.format(grossSquareFeet!)} gross SF and the budget priced {AREA.format(figures.grossSquareFeet!)} SF, so the case&apos;s hard cost differs from the budget total.</p>
          ) : null}
        </>
      ) : null}

      {newer ? (
        <div className="uw-rom-newer" role="status">
          <span>
            A newer budget was saved {DATE.format(new Date(newer.startedAt))}: {millions(newer.total)}, {newer.change >= 0 ? "up" : "down"} {millions(Math.abs(newer.change))}.
          </span>
          <button type="button" className="btn btn--secondary" disabled={busy !== null} onClick={() => void fill()}>
            {busy === "updating" ? "Updating…" : "Use Newer Budget"}
          </button>
        </div>
      ) : null}

      {!link ? (
        <div className="uw-rom-ways">
          <div className="uw-rom-way">
            <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => void leaveFor(`/rom?new=1&case=${caseId}`)}>
              {busy === "leaving" ? "Saving…" : "Build Construction Budget"}
            </button>
            <p className="t-meta">Your case is saved. When the budget is done, you&apos;ll come back here with construction costs filled in.</p>
          </div>
          {budgets.length > 0 ? (
            <div className="uw-rom-way">
              <label className="field-label t-label">
                Use Existing Budget
                <select className="input" value={picked} disabled={busy !== null} onChange={(event) => setPicked(event.target.value)}>
                  <option value="">Choose a Budget</option>
                  {budgets.map((budget) => (
                    <option key={budget.id} value={budget.id}>{budget.name} · saved {DATE.format(new Date(budget.latestRunAt))}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn btn--secondary" disabled={!picked || busy !== null} onClick={() => void fill(picked)}>
                {busy === "linking" ? "Filling…" : "Fill From Budget"}
              </button>
              <p className="t-meta">The budget takes this case&apos;s name, and renaming either one renames both.</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="input-error" role="alert">{error}</p> : null}
    </div>
  );
}
