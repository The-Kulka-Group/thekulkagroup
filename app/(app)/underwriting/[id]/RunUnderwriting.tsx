"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunUnderwriting({ caseId, hasRun }: { caseId: string; hasRun: boolean }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>();

  async function run() {
    setRunning(true);
    setError(undefined);
    const response = await fetch(`/api/underwriting/cases/${caseId}/runs`, { method: "POST" });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? "The calculation could not run.");
      setRunning(false);
      return;
    }
    router.refresh();
    setRunning(false);
  }

  return (
    <div className="underwriting-run-action">
      <button className="btn btn--primary" type="button" onClick={run} disabled={running}>
        {running ? "Calculating" : hasRun ? "Run again" : "Run calculation"}
      </button>
      {error ? <p className="input-error" role="alert">{error}</p> : null}
    </div>
  );
}
