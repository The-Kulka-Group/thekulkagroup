"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// LA-3050. Refreshes Autodesk Projects from its card through the existing sync
// route, which logs the run (LA-3048), then reloads the cards.

export function SourceRefresh() {
  const router = useRouter();
  const [state, setState] = useState<{ busy: boolean; note: string | null }>({ busy: false, note: null });

  async function refresh() {
    setState({ busy: true, note: null });
    try {
      const response = await fetch("/api/jobs/sync", { method: "POST" });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        setState({ busy: false, note: body?.error ?? `The refresh failed with status ${response.status}.` });
        return;
      }
      setState({ busy: false, note: null });
      router.refresh();
    } catch {
      setState({ busy: false, note: "Kulka AI could not be reached. Try again." });
    }
  }

  return (
    <>
      {state.note ? <span className="ds-note" role="status">{state.note}</span> : null}
      <button className="btn btn--secondary ds-btn" type="button" onClick={refresh} disabled={state.busy}>
        {state.busy ? "Refreshing…" : "Refresh"}
      </button>
    </>
  );
}
