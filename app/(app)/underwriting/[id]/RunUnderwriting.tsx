"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunUnderwriting({
  caseId,
  caseRevision,
  hasRun,
}: {
  caseId: string;
  caseRevision: number;
  hasRun: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    setRunning(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/underwriting/cases/${caseId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: caseRevision }),
      });
      const body = await responseBody(response);
      if (!response.ok) {
        setError(response.status === 409
          ? "The project changed before the calculation ran. Refresh the page, review the latest values, and try again."
          : body?.error ?? "The calculation could not run.");
        return;
      }
      router.refresh();
    } catch {
      setError("The calculation request failed. Check the connection and try again.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="underwriting-run-action" data-case-revision={caseRevision}>
      <button className="btn btn--primary" type="button" onClick={run} disabled={running}>
        {running ? "Calculating" : hasRun ? "Run again" : "Run calculation"}
      </button>
      {error ? <p className="input-error" role="alert">{error}</p> : null}
    </div>
  );
}

async function responseBody(response: Response): Promise<{ error?: string } | null> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
