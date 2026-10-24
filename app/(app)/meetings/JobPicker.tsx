"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useCanEdit } from "@/components/access/ToolLevel";
import { PillSelect } from "@/components/PillSelect";

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
  const canEdit = useCanEdit();
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
        setError(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "The project could not be saved.");
        return;
      }
      router.refresh();
    } catch {
      setError("The project could not be saved. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const options = [
    ...(jobId === null && !internal ? [{ value: "", label: "Choose a Project" }] : []),
    ...jobs.map((job) => ({ value: job.id, label: job.label })),
    { value: NONE, label: "No Project (Internal Meeting)" },
  ];
  const value = jobId ?? (internal ? NONE : "");
  // LA-3112: View shows the project as text, with no picker to change it.
  if (!canEdit) {
    return <span className="mt-pick">{options.find((option) => option.value === value)?.label ?? "No Project"}</span>;
  }
  return (
    <span className="mt-pick">
      <PillSelect
        label="Project"
        value={value}
        options={options}
        onChange={(value) => void choose(value)}
        searchable
        disabled={busy}
      />
      {error ? <span className="mt-pick-error" role="alert">{error}</span> : null}
    </span>
  );
}
