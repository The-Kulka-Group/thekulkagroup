"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// LA-2281: a person's correction of a meeting's job. It saves on choosing,
// with no Save button, and the rest of the meeting's calendar series follows.

export type PickerJob = { id: string; label: string };

const NONE = "none";

export function JobPicker({
  meetingId,
  jobId,
  internal,
  jobs,
}: {
  meetingId: string;
  jobId: string | null;
  /** A person said the meeting belongs to no job. */
  internal: boolean;
  jobs: PickerJob[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(value: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/meetings/${encodeURIComponent(meetingId)}/job`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: value === NONE ? null : value }),
      });
      if (!response.ok) {
        setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The job could not be saved.");
        return;
      }
      router.refresh();
    } catch {
      setError("The job could not be saved. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="mt-pick">
      <select
        className="input mt-pick-select"
        aria-label="Change the Job"
        value={jobId ?? (internal ? NONE : "")}
        disabled={busy}
        onChange={(e) => void choose(e.target.value)}
      >
        {jobId === null && !internal ? <option value="">Choose a Job</option> : null}
        {jobs.map((job) => (
          <option key={job.id} value={job.id}>{job.label}</option>
        ))}
        <option value={NONE}>No Job (Internal Meeting)</option>
      </select>
      {error ? <span className="mt-pick-error" role="alert">{error}</span> : null}
    </span>
  );
}
