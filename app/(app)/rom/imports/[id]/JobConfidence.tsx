"use client";

import { useState } from "react";

import type { JobConfidence as Confidence } from "@/lib/rom/job-confidence";

import "../imports.css";

// LA-2967: the past job's estimator confidence score, shown on its import and
// set here with the person who gave it and the date. The engine counts a
// ProEst budget figure at the score out of 10, and leaves out a job scored at
// or below the cutoff on the Engine Parameters screen.
// LA-2992: a scored job shows its score alone, with no form. The form opens
// from Change, or from Add Score on a job nobody has scored.

const SCORES = Array.from({ length: 10 }, (_, index) => index + 1);

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function JobConfidence({
  projectId,
  projectName,
  initial,
  initialEditing = false,
}: {
  projectId: string;
  projectName: string;
  initial: Confidence | null;
  initialEditing?: boolean;
}) {
  const [saved, setSaved] = useState<Confidence | null>(initial);
  const [editing, setEditing] = useState(initialEditing);
  const [score, setScore] = useState<string>(initial ? String(initial.score) : "");
  const [scoredBy, setScoredBy] = useState(initial?.scoredBy ?? "");
  const [scoredOn, setScoredOn] = useState(initial?.scoredOn ?? today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const body = score === "" ? { score: null } : { score: Number(score), scoredBy, scoredOn };
      const response = await fetch(`/api/rom/projects/${projectId}/confidence`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json();
      if (!response.ok) {
        setError(responseBody.error ?? "The score could not be saved.");
        return;
      }
      setSaved(responseBody.confidence);
      setEditing(false);
    } catch {
      setError("The site could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    setScore(saved ? String(saved.score) : "");
    setScoredBy(saved?.scoredBy ?? "");
    setScoredOn(saved?.scoredOn ?? today());
    setError(null);
    setEditing(false);
  }

  const unchanged =
    score === (saved ? String(saved.score) : "") &&
    (score === "" || (scoredBy === saved?.scoredBy && scoredOn === saved?.scoredOn));

  return (
    <div className="job-confidence">
      <div className="stat">
        <span className="t-label">Estimator Confidence, {projectName}</span>
        <span className="num">{saved ? `${saved.score} of 10` : "Not Scored"}</span>
        {saved ? (
          <span className="job-confidence-by">
            Scored by {saved.scoredBy}, {DATE.format(new Date(`${saved.scoredOn}T00:00:00Z`))}
          </span>
        ) : null}
      </div>
      {editing ? (
        <>
          <label className="job-confidence-field">
            <span className="t-label">Score</span>
            <select className="input" value={score} disabled={busy} onChange={(event) => setScore(event.target.value)}>
              <option value="">Not Scored</option>
              {SCORES.map((value) => (
                <option key={value} value={String(value)}>
                  {value} of 10
                </option>
              ))}
            </select>
          </label>
          <label className="job-confidence-field">
            <span className="t-label">Scored By</span>
            <input
              className="input"
              value={scoredBy}
              disabled={busy || score === ""}
              onChange={(event) => setScoredBy(event.target.value)}
            />
          </label>
          <label className="job-confidence-field">
            <span className="t-label">Scored On</span>
            <input
              className="input"
              type="date"
              value={scoredOn}
              disabled={busy || score === ""}
              onChange={(event) => setScoredOn(event.target.value)}
            />
          </label>
          <button
            className="btn btn--secondary"
            type="button"
            disabled={busy || unchanged}
            onClick={() => void save()}
          >
            {busy ? "Saving" : "Save Score"}
          </button>
          <button className="btn btn--quiet" type="button" disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </>
      ) : (
        <button className="btn btn--quiet" type="button" onClick={() => setEditing(true)}>
          {saved ? "Change" : "Add Score"}
        </button>
      )}
      {error ? <p className="empty">{error}</p> : null}
    </div>
  );
}
